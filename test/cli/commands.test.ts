import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initProject } from '../../bin/tardis'
import { compileSingleFile } from '../../src/cli/commands/compile'
import { doctorProject } from '../../src/cli/commands/doctor'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tardis-cli-cmd-test-'))
  tempDirs.push(dir)
  return dir
}

const BUTTON_SOURCE = `blueprint Button {
  props { label: string = "click" }
  ui { <button>{props.label}</button> }
}
`

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('compile command', () => {
  it('writes compiled JS to --out with expected markers', async () => {
    const cwd = await makeTempDir()
    const input = path.join(cwd, 'Button.tardis')
    const out = path.join(cwd, 'out', 'Button.js')
    await fs.writeFile(input, BUTTON_SOURCE, 'utf8')

    const code = await compileSingleFile(input, out, cwd)

    expect(code).toContain('export function Button')
    expect(code).toContain('/tardis-runtime.js')
    expect(code).toContain('generated from Button.tardis')
    await expect(fs.readFile(out, 'utf8')).resolves.toBe(code)
  })

  it('prints compiled JS to stdout when no --out is given', async () => {
    const cwd = await makeTempDir()
    const input = path.join(cwd, 'Button.tardis')
    await fs.writeFile(input, BUTTON_SOURCE, 'utf8')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await compileSingleFile(input, undefined, cwd)

    expect(code).toContain('export function Button')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]?.[0]).toContain('export function Button')
  })

  it('throws TardisError for a missing file', async () => {
    const cwd = await makeTempDir()
    await expect(compileSingleFile(path.join(cwd, 'Nope.tardis'), undefined, cwd)).rejects.toThrow(
      /TardisError: file not found/
    )
  })

  it('surfaces parser errors as TardisError', async () => {
    const cwd = await makeTempDir()
    const input = path.join(cwd, 'Broken.tardis')
    await fs.writeFile(input, 'blueprint { !!!', 'utf8')
    await expect(compileSingleFile(input, undefined, cwd)).rejects.toThrow(/TardisError/)
  })
})

describe('doctor command', () => {
  it('passes all checks in an initialized project', async () => {
    const cwd = await makeTempDir()
    await initProject(cwd)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await doctorProject(cwd)

    expect(result.ok).toBe(true)
    expect(result.checks.length).toBeGreaterThanOrEqual(6)
    expect(result.checks.every((c) => c.pass)).toBe(true)
    const lines = log.mock.calls.map((call) => String(call[0]))
    expect(lines.every((line) => line.startsWith('PASS'))).toBe(true)
  })

  it('fails config/pages/components checks in an empty directory', async () => {
    const cwd = await makeTempDir()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await doctorProject(cwd)

    expect(result.ok).toBe(false)
    const byName = new Map(result.checks.map((c) => [c.name, c.pass]))
    expect(byName.get('tardis.config.js present and valid')).toBe(false)
    const lines = log.mock.calls.map((call) => String(call[0]))
    expect(lines.some((line) => line.startsWith('FAIL'))).toBe(true)
  })
})
