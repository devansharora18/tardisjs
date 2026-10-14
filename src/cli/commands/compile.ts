import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { CLIError } from '../lib/errors'
import { ensureDir, pathExists } from '../lib/fs'
import { compileTardisSource } from '../lib/project'

// Compile one .tardis blueprint to JS. Prints to stdout, or writes to
// --out when given. Parser errors propagate as TardisError.
export async function compileSingleFile(input: string, out?: string, cwd = process.cwd()): Promise<string> {
	const resolvedInput = path.resolve(cwd, input)
	if (!(await pathExists(resolvedInput))) {
		throw new CLIError(`TardisError: file not found\n  ${resolvedInput}`)
	}

	const source = await fsp.readFile(resolvedInput, 'utf8')
	const compiled = await compileTardisSource(source, resolvedInput)

	if (out) {
		const resolvedOut = path.resolve(cwd, out)
		await ensureDir(path.dirname(resolvedOut))
		await fsp.writeFile(resolvedOut, compiled.code, 'utf8')
	} else {
		console.log(compiled.code)
	}

	return compiled.code
}

export function registerCompileCommand(program: Command): void {
	program
		.command('compile')
		.argument('<file>', 'blueprint file to compile (.tardis)')
		.option('--out <file>', 'write compiled JS to file instead of stdout')
		.description('Compile a single .tardis blueprint file to JS')
		.action(async (file: string, opts: { out?: string }) => {
			await compileSingleFile(file, opts.out, process.cwd())
		})
}
