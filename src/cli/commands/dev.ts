import fsp from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import chokidar from 'chokidar'
import { WebSocketServer } from 'ws'
import { CLIError } from '../lib/errors'
import { ensureDir, toPosix } from '../lib/fs'
import { buildClientIndexHtml, collectArtifacts, contentType, loadConfig, writeRuntimeModules, type TardisConfig } from '../lib/project'

async function findAvailablePort(preferredPort: number): Promise<number> {
	function check(port: number): Promise<boolean> {
		return new Promise((resolve) => {
			const tester = net.createServer()
			tester.once('error', () => resolve(false))
			tester.once('listening', () => {
				tester.close(() => resolve(true))
			})
			tester.listen(port)
		})
	}

	const startPort = Math.max(1, preferredPort)
	for (let port = startPort; port <= 65535; port++) {
		if (await check(port)) return port
	}

	throw new CLIError(`TardisError: no open port found\n  Tried ports ${startPort}-65535`)
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
	const preferredPort = config.port ?? 3000
	const port = await findAvailablePort(preferredPort)
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
		if (port !== preferredPort) {
			console.log(`⚠️  Port ${preferredPort} in use, using ${port} instead`)
		}
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
