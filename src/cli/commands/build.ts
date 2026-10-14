import fsp from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, formatBytes, getDirectorySizeBytes, pathExists, copyDirRecursive } from '../lib/fs'
import { buildClientIndexHtml, collectArtifacts, loadConfig, writeRuntimeModules, type BuildResult, type TardisConfig } from '../lib/project'

export type { BuildResult, TardisConfig }

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
