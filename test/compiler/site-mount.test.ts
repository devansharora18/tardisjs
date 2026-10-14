// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { lex } from '../../src/lexer/lexer'
import { parseFile } from '../../src/parser/parser'
import { compileFile } from '../../src/compiler/compiler'

const GEN = path.resolve(__dirname, 'gen-site')
const SITE = path.resolve(__dirname, '../../tardisjs-site')

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  fs.rmSync(GEN, { recursive: true, force: true })
  fs.mkdirSync(GEN, { recursive: true })
})

afterEach(() => {
  fs.rmSync(GEN, { recursive: true, force: true })
})

function emit(tardisPath: string, outName: string): void {
  const src = fs.readFileSync(tardisPath, 'utf8')
  let compiled = compileFile(parseFile(lex(src), path.basename(tardisPath)))
    .replace(/from 'tardisjs\/runtime'/g, "from '../../../src/runtime/index'")
  // rewrite sibling imports to the flat gen dir
  compiled = compiled.replace(/from '(\.\.?\/[^']*?)([^'/]+)\.js'/g, (_m, _dir, base) => `from './${base}.gen.mjs'`)
  const code = ts.transpileModule(compiled, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  fs.writeFileSync(path.join(GEN, outName), code)
}

describe('site home mount', () => {
  it('mounts without throwing', async () => {
    const comps = fs.readdirSync(path.join(SITE, 'components')).filter((f) => f.endsWith('.tardis'))
    for (const f of comps) {
      emit(path.join(SITE, 'components', f), f.replace(/\.tardis$/, '.gen.mjs'))
    }
    const mods: Record<string, Record<string, (...a: never[]) => HTMLElement>> = {}
    for (const f of comps) {
      const name = f.replace(/\.tardis$/, '')
      mods[name] = await import(/* @vite-ignore */ pathToFileURL(path.join(GEN, `${name}.gen.mjs`)).href)
      const w = window as unknown as Record<string, unknown>
      const factory = mods[name][name] ?? mods[name].default
      w[`__tardis_${name}`] = factory
    }
    emit(path.join(SITE, 'pages/index.tardis'), 'SiteHome.gen.mjs')
    const home = await import(/* @vite-ignore */ pathToFileURL(path.join(GEN, 'SiteHome.gen.mjs')).href)
    const root = home.Home()
    document.getElementById('app')!.appendChild(root)
    const html = document.getElementById('app')!.innerHTML
    console.log('HTML_LEN:', html.length)
    expect(html.length).toBeGreaterThan(1000)
    expect(html).toContain('TardisJS')
  }, 30000)

  it('boots through the real router with callbacks and scripts', async () => {
    // browser-like stubs jsdom lacks
    const w = window as unknown as Record<string, unknown>
    w.matchMedia = () => ({ matches: false })
    const { createRouter } = await import('../../src/runtime/router')
    const { flushMountCallbacks } = await import('../../src/runtime/events')
    const comps = ['Navbar', 'Hero', 'Footer']
    for (const name of comps) {
      const f = `${name}.tardis`
      const src = fs.readFileSync(path.join(SITE, 'components', f), 'utf8')
      let compiled = compileFile(parseFile(lex(src), f))
        .replace(/from 'tardisjs\/runtime'/g, "from '../../../src/runtime/index'")
      const code = ts.transpileModule(compiled, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      }).outputText
      fs.writeFileSync(path.join(GEN, `${name}.r.mjs`), code)
      const mod = await import(/* @vite-ignore */ pathToFileURL(path.join(GEN, `${name}.r.mjs`)).href)
      ;(window as unknown as Record<string, unknown>)[`__tardis_${name}`] = mod[name] ?? mod.default
    }
    const router = createRouter([
      {
        path: '/',
        component: () =>
          ((window as unknown as Record<string, unknown>).__tardis_Navbar as () => HTMLElement)(),
      },
    ])
    router.start()
    flushMountCallbacks()
    await new Promise((r) => setTimeout(r, 50))
    const html = document.getElementById('app')!.innerHTML
    console.log('ROUTER_HTML_LEN:', html.length)
    expect(html).toContain('tardisjs')
  }, 30000)
})
