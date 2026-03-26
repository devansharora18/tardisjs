#!/usr/bin/env node

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Command } from 'commander'
import chokidar from 'chokidar'
import { WebSocketServer } from 'ws'
import { lex } from '../src/lexer/lexer'
import { parse } from '../src/parser/parser'
import { compile } from '../src/compiler/compiler'

interface TardisConfig {
	pages: string
	components: string
	outDir: string
	port?: number
	title?: string
	head?: string[]
	staticDir?: string
}

interface BuildResult {
	filesCompiled: number
	timeMs: number
	outputBytes: number
}

interface CompiledArtifact {
	sourcePath: string
	outputPath: string
	outputCode: string
	componentName: string
}

interface RouteModule {
	routePath: string
	importPath: string
	exportName: string
}

class CLIError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'CLIError'
	}
}

const STARTER_INDEX = `blueprint Home {
	state { count: number = 0 }
	methods { increment: () => $update(state.count, state.count + 1) }
	style(tailwind) {
		base: "flex flex-col items-center justify-center min-h-screen gap-4"
		btn: "px-6 py-3 bg-indigo-500 text-white rounded-xl font-semibold"
	}
	ui {
		<div class={base}>
			<h1>tardisjs</h1>
			<p>smaller on the outside.</p>
			<p>count: {state.count}</p>
			<button class={btn} @click={methods.increment}>click me</button>
		</div>
	}
}
`

const STARTER_BUTTON = `blueprint Button {
	props {
		label: string = "click me"
		variant: "primary" | "ghost" | "danger" = "primary"
		onClick: function
	}
	style(tailwind) {
		base: "px-4 py-2 rounded-md font-semibold cursor-pointer transition-all"
		variant.primary: "bg-indigo-500 text-white hover:bg-indigo-600"
		variant.ghost: "bg-transparent border border-indigo-500 text-indigo-500"
		variant.danger: "bg-red-500 text-white hover:bg-red-600"
	}
	ui {
		<button class={base} @click={props.onClick}>{props.label}</button>
	}
}
`

const STARTER_CONFIG = `export default {
	pages: './pages',
	components: './components',
	outDir: './dist',
	port: 3000,
}
`

const STARTER_PACKAGE = `{
	"name": "my-tardis-app",
	"version": "0.1.0",
	"private": true,
	"type": "module",
	"scripts": {
		"dev": "tardis dev",
		"build": "tardis build",
		"preview": "tardis preview"
	},
	"dependencies": {
		"tardisjs": "latest"
	}
}
`

const STARTER_GITIGNORE = `node_modules
dist
`

function toPosix(p: string): string {
	return p.split(path.sep).join('/')
}

function replaceRuntimeImport(code: string): string {
	return code.replace(/from\s+['"]tardisjs\/runtime['"]/g, "from '/tardis-runtime.js'")
}

let typescriptModulePromise: Promise<typeof import('typescript')> | null = null

async function getTypeScriptModule(): Promise<typeof import('typescript')> {
	if (!typescriptModulePromise) {
		typescriptModulePromise = import('typescript')
	}
	return typescriptModulePromise
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fsp.access(targetPath)
		return true
	} catch {
		return false
	}
}

async function ensureDir(dirPath: string): Promise<void> {
	await fsp.mkdir(dirPath, { recursive: true })
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
	const entries = await fsp.readdir(src, { withFileTypes: true })
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name)
		const destPath = path.join(dest, entry.name)
		if (entry.isDirectory()) {
			await ensureDir(destPath)
			await copyDirRecursive(srcPath, destPath)
		} else {
			await fsp.copyFile(srcPath, destPath)
		}
	}
}

async function listTardisFiles(dirPath: string): Promise<string[]> {
	if (!(await pathExists(dirPath))) return []

	const entries = await fsp.readdir(dirPath, { withFileTypes: true })
	const files: string[] = []

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name)
		if (entry.isDirectory()) {
			files.push(...(await listTardisFiles(fullPath)))
		} else if (entry.isFile() && entry.name.endsWith('.tardis')) {
			files.push(fullPath)
		}
	}

	return files
}

function pageFileToRoute(relativePath: string): string {
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

async function loadConfig(cwd: string): Promise<TardisConfig> {
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

async function compileFile(source: string, filePath: string): Promise<{ code: string; componentName: string }> {
	const ast = parse(lex(source), path.basename(filePath))
	const output = compile(ast)
	const ts = await getTypeScriptModule()
	const transpiled = ts.transpileModule(output, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2020,
			module: ts.ModuleKind.ES2020,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
		},
	}).outputText
	return {
		code: replaceRuntimeImport(transpiled),
		componentName: ast.name,
	}
}

function buildClientIndexHtml(routes: RouteModule[], devMode: boolean, config?: TardisConfig, componentArtifacts?: CompiledArtifact[]): string {
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

async function writeRuntimeModules(outDir: string): Promise<void> {
	const cliDir = path.dirname(fileURLToPath(import.meta.url))
	const frameworkRoot = path.resolve(cliDir, '..')
	const runtimeSrcDir = path.join(frameworkRoot, 'src', 'runtime')
	const runtimeOutDir = path.join(outDir, 'runtime')

	if (await pathExists(runtimeSrcDir)) {
		const runtimeFiles = (await fsp.readdir(runtimeSrcDir)).filter((f) => f.endsWith('.ts'))
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

	const runtimeDist = path.join(frameworkRoot, 'dist', 'runtime', 'index.mjs')
	if (await pathExists(runtimeDist)) {
		const built = await fsp.readFile(runtimeDist, 'utf8')
		await fsp.writeFile(path.join(outDir, 'tardis-runtime.js'), built, 'utf8')
		await fsp.writeFile(path.join(outDir, 'runtime.js'), built, 'utf8')
		return
	}

	throw new CLIError('TardisError: runtime source not found\n  Reinstall tardisjs or run package build')
}

async function getDirectorySizeBytes(dirPath: string): Promise<number> {
	if (!(await pathExists(dirPath))) return 0
	const entries = await fsp.readdir(dirPath, { withFileTypes: true })
	let total = 0
	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name)
		if (entry.isDirectory()) {
			total += await getDirectorySizeBytes(fullPath)
		} else if (entry.isFile()) {
			const stat = await fsp.stat(fullPath)
			total += stat.size
		}
	}
	return total
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function collectArtifacts(cwd: string, config: TardisConfig): Promise<{
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
		const compiled = await compileFile(source, file)
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
		const compiled = await compileFile(source, file)
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

export async function initProject(cwd = process.cwd()): Promise<void> {
	await ensureDir(path.join(cwd, 'pages'))
	await ensureDir(path.join(cwd, 'components'))

	await fsp.writeFile(path.join(cwd, 'pages', 'index.tardis'), STARTER_INDEX, 'utf8')
	await fsp.writeFile(path.join(cwd, 'components', 'Button.tardis'), STARTER_BUTTON, 'utf8')
	await fsp.writeFile(path.join(cwd, 'tardis.config.js'), STARTER_CONFIG, 'utf8')
	await fsp.writeFile(path.join(cwd, 'package.json'), STARTER_PACKAGE, 'utf8')
	await fsp.writeFile(path.join(cwd, '.gitignore'), STARTER_GITIGNORE, 'utf8')

	console.log('✨ Tardis project initialized')
}

export async function buildProject(cwd = process.cwd()): Promise<BuildResult> {
	const start = Date.now()
	const config = await loadConfig(cwd)
	const outDir = path.resolve(cwd, config.outDir)

	await fsp.rm(outDir, { recursive: true, force: true })
	await ensureDir(outDir)

	const { pageArtifacts, componentArtifacts, routes } = await collectArtifacts(cwd, config)
	const allArtifacts = [...pageArtifacts, ...componentArtifacts]

	for (const artifact of allArtifacts) {
		const absoluteOut = path.join(outDir, artifact.outputPath)
		await ensureDir(path.dirname(absoluteOut))
		await fsp.writeFile(absoluteOut, artifact.outputCode, 'utf8')
	}

	await writeRuntimeModules(outDir)

	// Copy static files from staticDir
	const staticSrcDir = path.resolve(cwd, config.staticDir ?? 'public')
	if (await pathExists(staticSrcDir)) {
		await copyDirRecursive(staticSrcDir, outDir)
	}

	await fsp.writeFile(path.join(outDir, 'index.html'), buildClientIndexHtml(routes, false, config, componentArtifacts), 'utf8')

	const timeMs = Date.now() - start
	const outputBytes = await getDirectorySizeBytes(outDir)

	console.log(`✅ Build complete`)
	console.log(`- files compiled: ${allArtifacts.length}`)
	console.log(`- time: ${timeMs}ms`)
	console.log(`- output size: ${formatBytes(outputBytes)}`)

	return { filesCompiled: allArtifacts.length, timeMs, outputBytes }
}

function contentType(filePath: string): string {
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

async function createDevAssets(cwd: string, config: TardisConfig): Promise<Map<string, string>> {
	const assets = new Map<string, string>()
	const { pageArtifacts, componentArtifacts, routes } = await collectArtifacts(cwd, config)

	for (const artifact of [...pageArtifacts, ...componentArtifacts]) {
		assets.set(`/${toPosix(artifact.outputPath)}`, artifact.outputCode)
	}

	const tempOut = path.join(cwd, '.tardis-dev-runtime')
	await fsp.rm(tempOut, { recursive: true, force: true })
	await ensureDir(tempOut)
	await writeRuntimeModules(tempOut)

	const runtimeFiles = await fsp.readdir(tempOut)
	for (const file of runtimeFiles) {
		const full = path.join(tempOut, file)
		const stat = await fsp.stat(full)
		if (stat.isDirectory()) {
			const nested = await fsp.readdir(full)
			for (const child of nested) {
				const childPath = path.join(full, child)
				const childRaw = await fsp.readFile(childPath, 'utf8')
				assets.set(`/${toPosix(path.join(file, child))}`, childRaw)
			}
		} else {
			const raw = await fsp.readFile(full, 'utf8')
			assets.set(`/${toPosix(file)}`, raw)
		}
	}

	await fsp.rm(tempOut, { recursive: true, force: true })

	assets.set('/index.html', buildClientIndexHtml(routes, true, config, componentArtifacts))
	return assets
}

export async function devServer(cwd = process.cwd()): Promise<void> {
	const config = await loadConfig(cwd)
	const port = config.port ?? 3000
	let assets = await createDevAssets(cwd, config)

	const server = http.createServer(async (req, res) => {
		const requestPath = req.url ? req.url.split('?')[0] : '/'
		const normalizedPath = requestPath && requestPath !== '/' ? requestPath : '/index.html'

		if (assets.has(normalizedPath)) {
			const body = assets.get(normalizedPath) as string
			res.writeHead(200, { 'Content-Type': contentType(normalizedPath) })
			res.end(body)
			return
		}

		if (normalizedPath.startsWith('/pages/') || normalizedPath.startsWith('/components/') || normalizedPath.startsWith('/runtime/')) {
			res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
			res.end('Not found')
			return
		}

		// Try static files from staticDir
		const staticDir = path.resolve(cwd, config.staticDir ?? 'public')
		const staticFilePath = path.join(staticDir, normalizedPath)
		try {
			const fileStat = await fsp.stat(staticFilePath)
			if (fileStat.isFile()) {
				const body = await fsp.readFile(staticFilePath)
				res.writeHead(200, { 'Content-Type': contentType(normalizedPath) })
				res.end(body)
				return
			}
		} catch {}

		const fallback = assets.get('/index.html') ?? ''
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
		res.end(fallback)
	})

	const wss = new WebSocketServer({ noServer: true })

	server.on('upgrade', (req, socket, head) => {
		if ((req.url ?? '').split('?')[0] !== '/ws') {
			socket.destroy()
			return
		}

		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit('connection', ws, req)
		})
	})

	const pagesAbs = path.resolve(cwd, config.pages)
	const componentsAbs = path.resolve(cwd, config.components)
	const watcher = chokidar.watch([pagesAbs, componentsAbs], {
		ignoreInitial: true,
	})

	watcher.on('all', async () => {
		try {
			assets = await createDevAssets(cwd, config)
			const payload = JSON.stringify({ type: 'reload' })
			for (const client of wss.clients) {
				if (client.readyState === client.OPEN) {
					client.send(payload)
				}
			}
			console.log('♻️  Recompiled')
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
		}
	})

	server.listen(port, () => {
		console.log(`🚀 Dev server running at http://localhost:${port}`)
	})

	const shutdown = async () => {
		await watcher.close()
		wss.close()
		server.close()
		process.exit(0)
	}

	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)
}

export async function previewProject(cwd = process.cwd()): Promise<void> {
	const outDir = path.join(cwd, 'dist')
	if (!(await pathExists(outDir))) {
		throw new CLIError('TardisError: dist directory not found\n  Run "npx tardis build" first')
	}

	const port = 4000
	const server = http.createServer(async (req, res) => {
		const incoming = req.url ? req.url.split('?')[0] : '/'
		const candidate = incoming === '/' ? '/index.html' : incoming
		const filePath = path.join(outDir, candidate)

		try {
			const stat = await fsp.stat(filePath)
			if (stat.isDirectory()) {
				const idx = path.join(filePath, 'index.html')
				const body = await fsp.readFile(idx)
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
				res.end(body)
				return
			}

			const body = await fsp.readFile(filePath)
			res.writeHead(200, { 'Content-Type': contentType(filePath) })
			res.end(body)
		} catch {
			const fallback = path.join(outDir, 'index.html')
			if (await pathExists(fallback)) {
				const html = await fsp.readFile(fallback)
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
				res.end(html)
			} else {
				res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
				res.end('Not found')
			}
		}
	})

	server.listen(port, () => {
		console.log(`🔎 Preview server at http://localhost:${port}`)
	})

	const shutdown = () => {
		server.close()
		process.exit(0)
	}

	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)
}

export function createProgram(): Command {
	const program = new Command()
	program
		.name('tardis')
		.description('tardisjs CLI')

	program
		.command('init')
		.description('Initialize a new tardis app in current directory')
		.action(async () => {
			await initProject(process.cwd())
		})

	program
		.command('build')
		.description('Build tardis app for production')
		.action(async () => {
			await buildProject(process.cwd())
		})

	program
		.command('dev')
		.description('Run dev server with HMR')
		.action(async () => {
			await devServer(process.cwd())
		})

	program
		.command('preview')
		.description('Serve dist directory for preview')
		.action(async () => {
			await previewProject(process.cwd())
		})

	return program
}

export async function runCLI(argv = process.argv): Promise<void> {
	const program = createProgram()
	try {
		await program.parseAsync(argv)
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error(msg)
		process.exit(1)
	}
}

if (process.argv[1] && fs.existsSync(process.argv[1])) {
	const current = pathToFileURL(process.argv[1]).href
	if (import.meta.url === current) {
		runCLI()
	}
}

