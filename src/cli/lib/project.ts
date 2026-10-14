import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { lex } from '../../lexer/lexer'
import { parseFile } from '../../parser/parser'
import { compileFile as compileTardisFile } from '../../compiler/compiler'
import { CLIError } from './errors'
import { ensureDir, listTardisFiles, pathExists, toPosix } from './fs'

export interface TardisConfig {
	pages: string
	components: string
	outDir: string
	port?: number
	title?: string
	head?: string[]
	staticDir?: string
}

export interface BuildResult {
	filesCompiled: number
	timeMs: number
	outputBytes: number
}

export interface CompiledArtifact {
	sourcePath: string
	outputPath: string
	outputCode: string
	componentName: string
}

export interface RouteModule {
	routePath: string
	importPath: string
	exportName: string
}

export function replaceRuntimeImport(code: string): string {
	// Only rewrite genuine import statements (statement-initial `import … from`).
	// A bare `from "tardisjs/runtime"` match would also fire inside string
	// literals — e.g. docs snippets showing import examples — corrupting them.
	return code.replace(
		/^([ \t]*import\s[^;]*?\sfrom\s*)['"]tardisjs\/runtime['"]/gm,
		"$1'/tardis-runtime.js'"
	)
}

let typescriptModulePromise: Promise<typeof import('typescript')> | null = null

export async function getTypeScriptModule(): Promise<typeof import('typescript')> {
	if (!typescriptModulePromise) {
		typescriptModulePromise = import('typescript')
	}
	return typescriptModulePromise
}

export async function loadConfig(cwd: string): Promise<TardisConfig> {
	const configPath = path.join(cwd, 'tardis.config.js')
	if (!(await pathExists(configPath))) {
		throw new CLIError('TardisError: no tardis.config.js found\n  Run "npx tardis init" to create a new project')
	}

	const mod = await import(`${pathToFileURL(configPath).href}?t=${Date.now()}`)
	const cfg = mod.default as TardisConfig | undefined
	if (!cfg) {
		throw new CLIError('TardisError: invalid tardis.config.js\n  Ensure it exports a default config object')
	}

	return {
		pages: cfg.pages ?? './pages',
		components: cfg.components ?? './components',
		outDir: cfg.outDir ?? './dist',
		port: cfg.port ?? 3000,
		title: cfg.title,
		head: cfg.head ?? [],
		staticDir: cfg.staticDir ?? './public',
	}
}

// Lex + parse + compile one .tardis source, transpile to runnable JS.
// Transpile diagnostics are surfaced as errors: silently emitting
// best-effort output for syntactically invalid code ships black screens,
// so a broken file fails the build here instead.
export async function compileTardisSource(source: string, filePath: string): Promise<{ code: string; componentName: string }> {
	const file = parseFile(lex(source), path.basename(filePath))
	const output = compileTardisFile(file)
	const ts = await getTypeScriptModule()
	const transpiled = ts.transpileModule(output, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2020,
			module: ts.ModuleKind.ES2020,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
		},
		reportDiagnostics: true,
	})
	const errors = (transpiled.diagnostics ?? []).filter(
		(d) => d.category === ts.DiagnosticCategory.Error
	)
	if (errors.length > 0) {
		const first = errors[0]
		const message = ts.flattenDiagnosticMessageText(first.messageText, ' ')
		throw new CLIError(
			`TardisError: ${filePath} failed to transpile — ${message}\n  Fix the syntax error above; no output was written for this file`
		)
	}
	return {
		code: replaceRuntimeImport(transpiled.outputText),
		componentName: file.blueprint.name,
	}
}

export function pageFileToRoute(relativePath: string): string {
	const noExt = relativePath.replace(/\.tardis$/, '')
	const segments = toPosix(noExt).split('/').filter(Boolean)

	const mapped = segments
		.map((segment) => {
			if (segment === 'index') return ''
			const dynamic = segment.match(/^\[(.+)\]$/)
			if (dynamic) return `:${dynamic[1]}`
			return segment
		})
		.filter((segment, index, arr) => !(segment === '' && index === arr.length - 1 && arr.length > 1))

	const route = `/${mapped.filter(Boolean).join('/')}`
	return route === '' ? '/' : route
}

export function buildClientIndexHtml(routes: RouteModule[], devMode: boolean, config?: TardisConfig, componentArtifacts?: CompiledArtifact[]): string {
	const imports: string[] = ["import { createRouter } from '/tardis-runtime.js'"]
	const componentRegs: string[] = []

	if (componentArtifacts && componentArtifacts.length > 0) {
		for (const artifact of componentArtifacts) {
			const importPath = `/${toPosix(artifact.outputPath)}`
			imports.push(`import { ${artifact.componentName} } from '${importPath}'`)
			componentRegs.push(`      window.__tardis_${artifact.componentName} = ${artifact.componentName}`)
		}
	}

	const routeEntries: string[] = []

	routes.forEach((route, idx) => {
		const alias = `${route.exportName}_${idx}`
		imports.push(`import { ${route.exportName} as ${alias} } from '${route.importPath}'`)
		routeEntries.push(`  { path: '${route.routePath}', component: ${alias} }`)
	})

	const hmrSnippet = devMode
		? `
		const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws')
		socket.addEventListener('message', (event) => {
			try {
				const payload = JSON.parse(event.data)
				if (payload.type === 'reload') location.reload()
			} catch {
				location.reload()
			}
		})
`
		: ''

	const headContent = (config?.head ?? []).length > 0
		? '\n' + (config?.head ?? []).map(h => `\t\t${h}`).join('\n')
		: ''

	const componentRegBlock = componentRegs.length > 0
		? '\n' + componentRegs.join('\n') + '\n'
		: ''

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${config?.title ?? 'tardis app'}</title>${headContent}
	</head>
	<body>
		<div id="app"></div>
		<noscript><p style="font-family:sans-serif;text-align:center;padding:48px 24px;">This site needs JavaScript to render — every page is compiled to plain JavaScript modules. Please enable JavaScript and reload.</p></noscript>
		<script type="module">
${imports.map((line) => `      ${line}`).join('\n')}
${componentRegBlock}
			const routes = [
${routeEntries.join(',\n')}
			]

			const router = createRouter(routes)
			router.start()
${hmrSnippet}
		</script>
	</body>
</html>
`
}

export async function writeRuntimeModules(outDir: string): Promise<void> {
	const cliDir = path.dirname(fileURLToPath(import.meta.url))
	const runtimeOutDir = path.join(outDir, 'runtime')
	// The CLI can run from several layouts: repo source (bin/), bundled dist
	// (dist/bin/, possibly nested like dist/bin/src/cli/lib/), or an installed
	// package. Walk upward until a directory containing src/runtime is found.
	const rootCandidates = [
		path.resolve(cliDir, '..'),
		path.resolve(cliDir, '../..'),
		path.resolve(cliDir, '../../..'),
		path.resolve(cliDir, '../../../..'),
		path.resolve(cliDir, '../../../../..'),
	]

	for (const root of rootCandidates) {
		const runtimeSrcDir = path.join(root, 'src', 'runtime')
		if (!(await pathExists(runtimeSrcDir))) continue

		const runtimeFiles = (await fsp.readdir(runtimeSrcDir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
		if (runtimeFiles.length === 0) continue

		await ensureDir(runtimeOutDir)

		const ts = await getTypeScriptModule()
		for (const file of runtimeFiles) {
			const srcPath = path.join(runtimeSrcDir, file)
			const raw = await fsp.readFile(srcPath, 'utf8')
			const transpiled = ts.transpileModule(raw, {
				compilerOptions: {
					target: ts.ScriptTarget.ES2020,
					module: ts.ModuleKind.ES2020,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
				},
			}).outputText

			const withExt = transpiled.replace(/from\s+['"](\.\/?[^'"]+)['"]/g, (full, importPath: string) => {
				if (importPath.endsWith('.js')) return full
				return full.replace(importPath, `${importPath}.js`)
			})

			const jsName = file.replace(/\.ts$/, '.js')
			await fsp.writeFile(path.join(runtimeOutDir, jsName), withExt, 'utf8')
		}

		const entry = `export * from './runtime/index.js'\n`
		await fsp.writeFile(path.join(outDir, 'tardis-runtime.js'), entry, 'utf8')
		await fsp.writeFile(path.join(outDir, 'runtime.js'), entry, 'utf8')
		return
	}

	for (const root of rootCandidates) {
		const distCandidates = [
			path.join(root, 'runtime', 'index.mjs'),
			path.join(root, 'dist', 'runtime', 'index.mjs'),
		]

		for (const runtimeDist of distCandidates) {
			if (!(await pathExists(runtimeDist))) continue
			const built = await fsp.readFile(runtimeDist, 'utf8')
			await ensureDir(runtimeOutDir)
			await fsp.writeFile(path.join(runtimeOutDir, 'index.js'), built, 'utf8')
			const entry = `export * from './runtime/index.js'\n`
			await fsp.writeFile(path.join(outDir, 'tardis-runtime.js'), entry, 'utf8')
			await fsp.writeFile(path.join(outDir, 'runtime.js'), entry, 'utf8')
			return
		}
	}

	throw new CLIError('TardisError: runtime source not found\n  Reinstall tardisjs or run package build')
}

export async function collectArtifacts(cwd: string, config: TardisConfig): Promise<{
	pageArtifacts: CompiledArtifact[]
	componentArtifacts: CompiledArtifact[]
	routes: RouteModule[]
}> {
	const pagesDir = path.resolve(cwd, config.pages)
	const componentsDir = path.resolve(cwd, config.components)

	const pageFiles = await listTardisFiles(pagesDir)
	const componentFiles = await listTardisFiles(componentsDir)

	const pageArtifacts: CompiledArtifact[] = []
	const componentArtifacts: CompiledArtifact[] = []
	const routes: RouteModule[] = []

	for (const file of pageFiles) {
		const source = await fsp.readFile(file, 'utf8')
		const compiled = await compileTardisSource(source, file)
		const rel = toPosix(path.relative(pagesDir, file)).replace(/\.tardis$/, '.js')
		const outPath = path.join('pages', rel)
		pageArtifacts.push({
			sourcePath: file,
			outputPath: outPath,
			outputCode: compiled.code,
			componentName: compiled.componentName,
		})
		routes.push({
			routePath: pageFileToRoute(toPosix(path.relative(pagesDir, file))),
			importPath: `/${toPosix(outPath)}`,
			exportName: compiled.componentName,
		})
	}

	for (const file of componentFiles) {
		const source = await fsp.readFile(file, 'utf8')
		const compiled = await compileTardisSource(source, file)
		const rel = toPosix(path.relative(componentsDir, file)).replace(/\.tardis$/, '.js')
		const outPath = path.join('components', rel)
		componentArtifacts.push({
			sourcePath: file,
			outputPath: outPath,
			outputCode: compiled.code,
			componentName: compiled.componentName,
		})
	}

	return { pageArtifacts, componentArtifacts, routes }
}

export function contentType(filePath: string): string {
	if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
	if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8'
	if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
	if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
	if (filePath.endsWith('.svg')) return 'image/svg+xml'
	if (filePath.endsWith('.png')) return 'image/png'
	if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg'
	if (filePath.endsWith('.gif')) return 'image/gif'
	if (filePath.endsWith('.ico')) return 'image/x-icon'
	if (filePath.endsWith('.woff2')) return 'font/woff2'
	if (filePath.endsWith('.woff')) return 'font/woff'
	return 'text/plain; charset=utf-8'
}
