import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initProject, buildProject } from '../../bin/tardis'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tardis-cli-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('cli', () => {
  it('init scaffolds starter files', async () => {
    const cwd = await makeTempDir()

    await initProject(cwd)

    await expect(fs.stat(path.join(cwd, 'pages', 'index.tardis'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(cwd, 'components', 'Button.tardis'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(cwd, 'tardis.config.js'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(cwd, 'package.json'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(cwd, '.gitignore'))).resolves.toBeDefined()
  })

  it('build compiles pages/components and writes dist output', async () => {
    const cwd = await makeTempDir()

    await fs.mkdir(path.join(cwd, 'pages'), { recursive: true })
    await fs.mkdir(path.join(cwd, 'components'), { recursive: true })

    await fs.writeFile(
      path.join(cwd, 'tardis.config.js'),
      `export default {
  pages: './pages',
  components: './components',
  outDir: './dist',
  port: 3000,
}
`,
      'utf8'
    )

    await fs.writeFile(
      path.join(cwd, 'pages', 'index.tardis'),
      `blueprint Home {
  ui { <div>home</div> }
}
`,
      'utf8'
    )

    await fs.writeFile(
      path.join(cwd, 'components', 'Button.tardis'),
      `blueprint Button {
  props { label: string = "click" }
  ui { <button>{props.label}</button> }
}
`,
      'utf8'
    )

    const result = await buildProject(cwd)

    expect(result.filesCompiled).toBe(2)
    await expect(fs.stat(path.join(cwd, 'dist', 'index.html'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(cwd, 'dist', 'pages', 'index.js'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(cwd, 'dist', 'components', 'Button.js'))).resolves.toBeDefined()
    await expect(fs.stat(path.join(cwd, 'dist', 'tardis-runtime.js'))).resolves.toBeDefined()
  })
})
