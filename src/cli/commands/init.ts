import fsp from 'node:fs/promises'
import path from 'node:path'
import { CLIError } from '../lib/errors'
import { ensureDir, pathExists } from '../lib/fs'

const STARTER_INDEX = `blueprint Home {
	state {
		count: number = 0
	}
	methods {
		increment: () => $update(state.count, state.count + 1)
		decrement: () => $update(state.count, state.count - 1)
		reset: () => $update(state.count, 0)
	}
	style(tailwind) {
	page: "min-h-screen bg-black text-zinc-100 antialiased"

	container: "relative mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6"

	bgGlow: "absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(0,255,255,0.08),transparent_60%)]"

	card: "relative w-full rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-xl p-10 shadow-[0_0_60px_rgba(0,255,255,0.08)]"

	label: "text-[10px] tracking-[0.2em] uppercase text-zinc-500"
	title: "mt-3 text-3xl font-semibold tracking-tight"
	subtitle: "mt-2 text-sm text-zinc-400"

	valueWrap: "mt-10 rounded-xl border border-white/10 bg-black/40 px-6 py-8 text-center shadow-inner"
	value: "text-6xl font-semibold tracking-tight"

	actions: "mt-8 flex items-center justify-center gap-4"

	btnPrimary: "rounded-lg bg-cyan-400 px-5 py-2 text-sm font-medium text-black transition-all duration-150 hover:bg-cyan-300 active:scale-[0.96] shadow-[0_0_20px_rgba(0,255,255,0.3)]"

	btnSecondary: "rounded-lg border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-zinc-200 transition-all duration-150 hover:bg-white/10 active:scale-[0.96]"

	note: "mt-8 text-center text-xs text-zinc-600"
}
	ui {
		<main class={"page"}>
			<div class={"bgGlow"}></div>
			<section class={"container"}>
				<div class={"card"}>
					<p class={"label"}>TardisJS Starter</p>
					<h1 class={"title"}>Counter</h1>
					<p class={"subtitle"}>A simple starting point with clean defaults.</p>

					<div class={"valueWrap"}>
						<p class={"value"}>{state.count}</p>
					</div>

					<div class={"actions"}>
						<button class={"btnSecondary"} @click={methods.decrement}>-1</button>
						<button class={"btnPrimary"} @click={methods.increment}>+1</button>
						<button class={"btnSecondary"} @click={methods.reset}>Reset</button>
					</div>

					<p class={"note"}>Edit <code>pages/index.tardis</code> and build from here.</p>
				</div>
			</section>
		</main>
	}
}
`

const STARTER_BUTTON = `blueprint Button {
	props {
		label: string = "Action"
		variant: "primary" | "secondary" = "primary"
		onClick: function
	}
	style(tailwind) {
		primary: "inline-flex items-center justify-center rounded-lg border border-cyan-500 bg-cyan-500 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-cyan-400 active:translate-y-px active:bg-cyan-500"
		secondary: "inline-flex items-center justify-center rounded-lg border border-zinc-600 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300 active:translate-y-px"
	}
	ui {
		<button class={props.variant === "primary" ? "primary" : "secondary"} @click={props.onClick}>{props.label}</button>
	}
}
`

const STARTER_CONFIG = `export default {
	pages: './pages',
	components: './components',
	outDir: './dist',
	port: 3000,
	title: 'tardis starter',
	head: [
		'<script src="https://cdn.tailwindcss.com"></script>',
	],
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
		"@devansharora18/tardisjs": "latest"
	}
}
`

const STARTER_GITIGNORE = `node_modules
dist
`

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

export async function createTardisApp(projectName: string, cwd = process.cwd()): Promise<void> {
	const normalizedName = projectName.trim()
	if (!normalizedName) {
		throw new CLIError('TardisError: project name is required\n  Usage: create-tardis-app <project-name>')
	}

	const targetDir = path.resolve(cwd, normalizedName)
	if (await pathExists(targetDir)) {
		throw new CLIError(`TardisError: directory already exists\n  ${targetDir}`)
	}

	await ensureDir(targetDir)
	await initProject(targetDir)

	const packageJsonPath = path.join(targetDir, 'package.json')
	if (await pathExists(packageJsonPath)) {
		const raw = await fsp.readFile(packageJsonPath, 'utf8')
		const pkg = JSON.parse(raw) as Record<string, unknown>
		pkg.name = normalizedName
		await fsp.writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
	}

	console.log(`\n✅ Created ${normalizedName}`)
	console.log(`\nNext steps:`)
	console.log(`  cd ${normalizedName}`)
	console.log(`  npm install`)
	console.log(`  npm run dev`)
}
