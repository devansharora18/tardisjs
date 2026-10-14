import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildProject } from '../../src/cli/commands/build'
import { prerenderProject } from '../../src/cli/commands/prerender'

const tempDirs: string[] = []

async function makeProject(): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'tardis-prerender-test-'))
  tempDirs.push(cwd)
  await fs.writeFile(
    path.join(cwd, 'tardis.config.js'),
    `export default {\n  pages: './pages',\n  components: './components',\n  outDir: './dist',\n  port: 3999,\n  title: 'prerender fixture',\n}\n`,
    'utf8'
  )
  await fs.mkdir(path.join(cwd, 'pages', 'blog'), { recursive: true })
  await fs.mkdir(path.join(cwd, 'components'), { recursive: true })
  await fs.writeFile(
    path.join(cwd, 'pages', 'index.tardis'),
    'blueprint Home {\n  state { n: number = 41 }\n  ui {\n    <main><h1>Home</h1><p>{state.n + 1}</p><Badge label="new" /></main>\n  }\n}\n',
    'utf8'
  )
  await fs.writeFile(
    path.join(cwd, 'pages', 'about.tardis'),
    'blueprint About {\n  ui {\n    <main><h1>About</h1></main>\n  }\n}\n',
    'utf8'
  )
  await fs.writeFile(
    path.join(cwd, 'pages', 'blog', '[slug].tardis'),
    'blueprint Post {\n  ui {\n    <main><h1>{$params.slug}</h1></main>\n  }\n}\n',
    'utf8'
  )
  await fs.writeFile(
    path.join(cwd, 'components', 'Badge.tardis'),
    'blueprint Badge {\n  props { label: string = "" }\n  ui {\n    <span class="badge">{props.label}</span>\n  }\n}\n',
    'utf8'
  )
  return cwd
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('prerender command', () => {
  it('renders static routes to html files with content inlined', async () => {
    const cwd = await makeProject()
    await buildProject(cwd)
    const result = await prerenderProject(cwd)
    expect(result.skipped).toContain('/blog/:slug')
    const routes = new Map(result.rendered.map((r) => [r.route, r.file]))
    expect(routes.get('/')).toBe('index.html')
    expect(routes.get('/about')).toBe('about/index.html')
    const home = await fs.readFile(path.join(cwd, 'dist', 'index.html'), 'utf8')
    expect(home).toContain('<h1>Home</h1>')
    expect(home).toContain('<p>42</p>')
    expect(home).toContain('<span class="badge">new</span>')
    expect(home).toContain('createRouter')
    const about = await fs.readFile(path.join(cwd, 'dist', 'about', 'index.html'), 'utf8')
    expect(about).toContain('<h1>About</h1>')
  })

  it('fails clearly without a prior build', async () => {
    const cwd = await makeProject()
    await expect(prerenderProject(cwd)).rejects.toThrow(/Run "npx tardis build" first/)
  })
})
