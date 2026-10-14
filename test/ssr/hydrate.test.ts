// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { lex } from '../../src/lexer/lexer'
import { parseFile } from '../../src/parser/parser'
import { compileFile } from '../../src/compiler/compiler'
import { renderToString } from '../../src/ssr/render'
import { hydrate } from '../../src/ssr/hydrate'
import type { ComponentFactory } from '../../src/ssr/render'

const GEN = path.resolve(__dirname, 'gen-hydrate')
let buildCounter = 0

function buildFactory(source: string, name: string): Promise<ComponentFactory> {
  buildCounter += 1
  const compiled = compileFile(parseFile(lex(source), 'test.tardis')).replace(
    /from 'tardisjs\/runtime'/g,
    "from '../../../src/runtime/index'"
  )
  const code = ts.transpileModule(compiled, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  const out = path.join(GEN, `${name}_${buildCounter}.gen.mjs`)
  fs.writeFileSync(out, code)
  return import(/* @vite-ignore */ pathToFileURL(out).href).then((m) => m[name] as ComponentFactory)
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  fs.rmSync(GEN, { recursive: true, force: true })
  fs.mkdirSync(GEN, { recursive: true })
})

afterEach(() => {
  fs.rmSync(GEN, { recursive: true, force: true })
})

const COUNTER = `blueprint Counter {
  state { n: number = 0 }
  methods { inc: () => $update(state.n, state.n + 1) }
  ui {
    <div><p>{state.n}</p><button @click={methods.inc}>+</button></div>
  }
}`

describe('hydrate', () => {
  it('takes over identical server markup without warnings', async () => {
    const Counter = await buildFactory(COUNTER, 'Counter')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const app = document.getElementById('app')!
      app.innerHTML = renderToString(Counter)
      const root = hydrate(Counter, app)
      expect(warn).not.toHaveBeenCalled()
      expect(app.querySelector('p')?.textContent).toBe('0')
      expect(root.tagName).toBe('DIV')
      // bindings are live on the fresh tree
      ;(app.querySelector('button') as HTMLButtonElement).click()
      expect(app.querySelector('p')?.textContent).toBe('1')
    } finally {
      warn.mockRestore()
    }
  })

  it('remounts and reports mismatches instead of failing', async () => {
    const Counter = await buildFactory(COUNTER, 'Counter')
    const seen: Array<{ server: string; client: string }> = []
    const app = document.getElementById('app')!
    app.innerHTML = '<div><p>stale</p></div>'
    hydrate(Counter, app, { onMismatch: (info) => seen.push(info) })
    expect(seen).toHaveLength(1)
    expect(seen[0].server).toContain('stale')
    expect(seen[0].client).toContain('<p>0</p>')
    expect(app.querySelector('p')?.textContent).toBe('0')
  })

  it('warns by default on mismatch', async () => {
    const Counter = await buildFactory(COUNTER, 'Counter')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const app = document.getElementById('app')!
      app.innerHTML = '<div><p>stale</p></div>'
      hydrate(Counter, app)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('flushes mount callbacks so lifecycle runs', async () => {
    const WithMount = await buildFactory(
      `blueprint WithMount {
        state { ready: boolean = false }
        events { onMount: () => $update(state.ready, true) }
        ui {
          <p>{state.ready ? "live" : "booting"}</p>
        }
      }`,
      'WithMount'
    )
    const app = document.getElementById('app')!
    app.innerHTML = renderToString(WithMount)
    hydrate(WithMount, app)
    expect(app.querySelector('p')?.textContent).toBe('live')
  })

  it('passes props through', async () => {
    const Greeter = await buildFactory(
      `blueprint Greeter {
        props { name: string = "stranger" }
        ui {
          <h1>{props.name}</h1>
        }
      }`,
      'Greeter'
    )
    const app = document.getElementById('app')!
    app.innerHTML = renderToString(Greeter, { props: { name: 'Ada' } })
    hydrate(Greeter, app, { props: { name: 'Ada' } })
    expect(app.querySelector('h1')?.textContent).toBe('Ada')
  })

  it('throws without a DOM', async () => {
    const Counter = await buildFactory(COUNTER, 'Counter')
    const g = globalThis as unknown as Record<string, unknown>
    const saved = g['document']
    try {
      delete g['document']
      const fake = { innerHTML: '' } as unknown as Element
      expect(() => hydrate(Counter, fake)).toThrow(/needs a DOM/)
    } finally {
      g['document'] = saved
    }
  })
})
