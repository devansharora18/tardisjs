import fsp from 'node:fs/promises'
import path from 'node:path'

export function toPosix(p: string): string {
	return p.split(path.sep).join('/')
}

export async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fsp.access(targetPath)
		return true
	} catch {
		return false
	}
}

export async function ensureDir(dirPath: string): Promise<void> {
	await fsp.mkdir(dirPath, { recursive: true })
}

export async function copyDirRecursive(src: string, dest: string): Promise<void> {
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

export async function listTardisFiles(dirPath: string): Promise<string[]> {
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

export async function getDirectorySizeBytes(dirPath: string): Promise<number> {
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

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
