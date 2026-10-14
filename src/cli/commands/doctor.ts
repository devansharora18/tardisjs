import { constants } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { ensureDir, pathExists } from '../lib/fs'
import { getTypeScriptModule, loadConfig } from '../lib/project'

export interface DoctorCheck {
	name: string
	pass: boolean
	detail?: string
}

export interface DoctorResult {
	checks: DoctorCheck[]
	ok: boolean
}

// Run environment/project checks, print one PASS/FAIL line each.
export async function doctorProject(cwd = process.cwd()): Promise<DoctorResult> {
	const checks: DoctorCheck[] = []
	const push = (name: string, pass: boolean, detail?: string): void => {
		checks.push(detail && !pass ? { name, pass, detail } : { name, pass })
	}

	const major = Number(process.versions.node.split('.')[0] ?? '0')
	push(`node version ${process.versions.node} (>=18 required)`, Number.isInteger(major) && major >= 18)

	let outDir = './dist'
	try {
		const config = await loadConfig(cwd)
		outDir = config.outDir
		push('tardis.config.js present and valid', true)
		push(`pages dir exists (${config.pages})`, await pathExists(path.resolve(cwd, config.pages)))
		push(`components dir exists (${config.components})`, await pathExists(path.resolve(cwd, config.components)))
	} catch (error) {
		push('tardis.config.js present and valid', false, error instanceof Error ? error.message : String(error))
		push('pages dir exists (skipped: no valid config)', false)
		push('components dir exists (skipped: no valid config)', false)
	}

	try {
		const resolvedOut = path.resolve(cwd, outDir)
		await ensureDir(resolvedOut)
		await fsp.access(resolvedOut, constants.W_OK)
		push(`write access to outDir (${outDir})`, true)
	} catch (error) {
		push(`write access to outDir (${outDir})`, false, error instanceof Error ? error.message : String(error))
	}

	try {
		await getTypeScriptModule()
		push('typescript available', true)
	} catch (error) {
		push('typescript available', false, error instanceof Error ? error.message : String(error))
	}

	for (const check of checks) {
		console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`)
		if (check.detail && !check.pass) console.log(`  ${check.detail.split('\n').join('\n  ')}`)
	}

	return { checks, ok: checks.every((c) => c.pass) }
}

export function registerDoctorCommand(program: Command): void {
	program
		.command('doctor')
		.description('Check node, config, directories, and toolchain health')
		.action(async () => {
			const { ok } = await doctorProject(process.cwd())
			if (!ok) process.exit(1)
		})
}
