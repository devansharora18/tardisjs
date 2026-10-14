import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkProject } from '../../src/cli/commands/check'
import { createProgram } from '../../src/cli/program'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tardis-check-test-'))
  tempDirs.push(dir)
  return dir
}

const CLEAN = `blueprint Home {
  state { count: number = 0 }
  methods { increment: () => $update(state.count, state.count + 1) }
  ui { <div>{state.count}<button @click={methods.increment}>+</button></div> }
}
`

const BROKEN = `blueprint Broken {
  state { count: number = 0 }
  methods { go: () => $frobnicate(state.cout) }
  ui { <div @click={methods.go}>{state.count}</div> }
}
`

async function writeProject(cwd: string, pages: Record<string, string>): Promise<void> {
  await fs.mkdir(path.join(cwd, 'pages'), { recursive: true })
  await fs.mkdir(path.join(cwd, 'components'), { recursive: true })
  await fs.writeFile(
    path.join(cwd, 'tardis.config.js'),
    `export default { pages: './pages', components: './components', outDir: './dist' }\n`,
    'utf8',
  )
  for (const [name, src] of Object.entries(pages)) {
    await fs.writeFile(path.join(cwd, 'pages', name), src, 'utf8')
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('check command', () => {
  it('passes a clean project with ok:true and no diagnostics', async () => {
    const cwd = await makeTempDir()
    await writeProject(cwd, { 'index.tardis': CLEAN })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { diagnostics, ok } = await checkProject(cwd)

    expect(ok).toBe(true)
    expect(diagnostics).toEqual([])
    expect(log).toHaveBeenCalled()
  })

  it('reports unknown-helper and unknown-ref with file:line:col lines', async () => {
    const cwd = await makeTempDir()
    await writeProject(cwd, { 'broken.tardis': BROKEN })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { diagnostics, ok } = await checkProject(cwd)

    expect(ok).toBe(false)
    const byCode = new Map(diagnostics.map((d) => [d.code, d]))
    expect(byCode.has('unknown-helper')).toBe(true)
    expect(byCode.has('unknown-ref')).toBe(true)
    expect(byCode.get('unknown-helper')?.message).toContain('$frobnicate')
    expect(byCode.get('unknown-ref')?.message).toContain('state.cout')
    for (const d of diagnostics) expect(d.file).toContain('broken.tardis')
    const lines = log.mock.calls.map((call) => String(call[0]))
    expect(lines.some((l) => l.includes('broken.tardis') && l.includes('unknown-helper'))).toBe(true)
    expect(lines.some((l) => l.includes('broken.tardis') && l.includes('unknown-ref'))).toBe(true)
  })

  it('scans components too and works without a config file', async () => {
    const cwd = await makeTempDir()
    await fs.mkdir(path.join(cwd, 'pages'), { recursive: true })
    await fs.mkdir(path.join(cwd, 'components'), { recursive: true })
    await fs.writeFile(path.join(cwd, 'pages', 'index.tardis'), CLEAN, 'utf8')
    await fs.writeFile(
      path.join(cwd, 'components', 'Badge.tardis'),
      `blueprint Badge { props { label: string = "x" } ui { <span>hi</span> } }\n`,
      'utf8',
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const { diagnostics, ok } = await checkProject(cwd)

    expect(ok).toBe(false)
    expect(diagnostics.some((d) => d.code === 'unused-prop' && d.file.includes('Badge.tardis'))).toBe(true)
  })

  it('registers tardis check on the program', () => {
    const program = createProgram()
    const names = program.commands.map((c) => c.name())
    expect(names).toContain('check')
  })
})
