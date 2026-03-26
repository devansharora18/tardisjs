#!/usr/bin/env node

import { createTardisApp } from './tardis'

async function run(): Promise<void> {
  const projectName = process.argv[2]
  if (!projectName) {
    console.error('TardisError: project name is required')
    console.error('  Usage: create-tardis-app <project-name>')
    process.exit(1)
  }

  try {
    await createTardisApp(projectName, process.cwd())
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(msg)
    process.exit(1)
  }
}

run()
