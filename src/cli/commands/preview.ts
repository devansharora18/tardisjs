import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { CLIError } from '../lib/errors'
import { pathExists } from '../lib/fs'
import { contentType } from '../lib/project'

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
