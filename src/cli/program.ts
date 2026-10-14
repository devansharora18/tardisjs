import { Command } from 'commander'
import { buildProject } from './commands/build'
import { compileSingleFile, registerCompileCommand } from './commands/compile'
import { devServer } from './commands/dev'
import { doctorProject, registerDoctorCommand } from './commands/doctor'
import { createTardisApp, initProject } from './commands/init'
import { previewProject } from './commands/preview'

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

	registerCompileCommand(program)
	registerDoctorCommand(program)

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

// Kept here so `create-tardis-app` and external importers see one surface.
export { buildProject } from './commands/build'
export { compileSingleFile } from './commands/compile'
export { devServer } from './commands/dev'
export { doctorProject } from './commands/doctor'
export { createTardisApp, initProject } from './commands/init'
export { previewProject } from './commands/preview'
