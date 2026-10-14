#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCLI } from '../src/cli/program'

export { buildProject } from '../src/cli/commands/build'
export { compileSingleFile } from '../src/cli/commands/compile'
export { devServer } from '../src/cli/commands/dev'
export { doctorProject } from '../src/cli/commands/doctor'
export { createTardisApp, initProject } from '../src/cli/commands/init'
export { previewProject } from '../src/cli/commands/preview'
export { createProgram, runCLI } from '../src/cli/program'

function isDirectExecution(): boolean {
	try {
		if (!process.argv[1] || !fs.existsSync(process.argv[1])) return false
		const executableName = path.basename(process.argv[1])
		if (!/^tardis(?:\.(?:js|ts|mjs|cjs))?$/.test(executableName)) return false
		const argvRealPath = fs.realpathSync(process.argv[1])
		const moduleRealPath = fs.realpathSync(fileURLToPath(import.meta.url))
		return argvRealPath === moduleRealPath
	} catch {
		return false
	}
}

if (isDirectExecution()) {
	runCLI()
}
