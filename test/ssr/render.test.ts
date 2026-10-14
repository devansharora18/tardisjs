// No jsdom pragma on purpose: these tests prove SSR runs with zero DOM.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { lex } from '../../src/lexer/lexer'
import { parseFile } from '../../src/parser/parser'
import { compileFile } from '../../src/compiler/compiler'
import { renderToString, renderDocumentShell } from '../../src/ssr/render'
import type { ComponentFactory } from '../../src/ssr/render'

const GEN = path.resolve(__dirname, 'gen')

let buildCounter = 0

function buildFactory(source: string, name: string): Promise<ComponentFactory> {
  buildCounter += 1
  const unique = `${name}_${buildCounter}`
  const compiled = compileFile(parseFile(lex(source), 'test.tardis')).replace(
    /from 'tardisjs\/runtime'/g,
    "from '../../../src/runtime/index'"
  )
  const code = ts.transpileModule(compiled, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  // compiled factories reference themselves by blueprint name in output
  // comments only — the live binding is returned by module namespace lookup
  const out = path.join(GEN, `${unique}.gen.mjs`)
  fs.writeFileSync(out, code)
  return import(/* @vite-ignore */ pathToFileURL(out).href).then((m) => m[name] as ComponentFactory)
}

beforeEach(() => {
  fs.rmSync(GEN, { recursive: true, force: true })
  fs.mkdirSync(GEN, { recursive: true })
})

afterEach(() => {
  fs.rmSync(GEN, { recursive: true, force: true })
})

describe('renderToString', () => {
  it('renders static markup exactly', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        ui {
          <main class="page"><h1>Hello</h1><p>world</p></main>
        }
      }`,
      'Page'
    )
    expect(renderToString(Page)).toBe('<main class="page"><h1>Hello</h1><p>world</p></main>')
  })

  it('evaluates state bindings and escapes text', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        state { name: string = "Ada & <Co>" }
        ui {
          <div title="greeting"><p>{state.name}</p></div>
        }
      }`,
      'Page'
    )
    expect(renderToString(Page)).toBe(
      '<div title="greeting"><p>Ada &amp; &lt;Co&gt;</p></div>'
    )
  })

  it('renders $if branches and comment anchors', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        state { open: boolean = true }
        ui {
          <div>
            $if(state.open) {
              <p>shown</p>
            }
            $if(state.missing) {
              <p>hidden</p>
            }
          </div>
        }
      }`.replace('state.missing', 'state.open === false'),
      'Page'
    )
    expect(renderToString(Page)).toBe('<div><p>shown</p> <!--$if--></div>')
  })

  it('renders $each lists and $show display', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        state { items: array = [] }
        events { onMount: () => $update(state.items, ["a", "b"]) }
        ui {
          <div>
            $each(state.items, (x) => {
              <span>{x}</span>
            })
            $show(state.items.length === 0) {
              <p>empty</p>
            }
          </div>
        }
      }`,
      'Page'
    )
    // onMount never flushes during SSR; the seed below bypasses events
    const Seeded = await buildFactory(
      `blueprint Seeded {
        state { n: number = 2 }
        ui {
          <ul>
            $each([1, 2], (x) => {
              <li>{x}</li>
            })
          </ul>
        }
      }`,
      'Seeded'
    )
    // NOTE: $each wraps items in a div (client renders the same node), so
    // list markup with $each directly under ul carries that wrapper.
    expect(renderToString(Seeded)).toBe('<ul><div data-each=""><li>1</li><li>2</li></div></ul>')
    expect(renderToString(Page)).toBe('<div><div data-each=""></div> <p>empty</p></div>')
  })

  it('renders void elements without closing tags', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        state { email: string = "" }
        ui {
          <div><input value={state.email} /><br /><img src="/a.png" /></div>
        }
      }`,
      'Page'
    )
    expect(renderToString(Page)).toBe('<div><input value=""><br><img src="/a.png"></div>')
  })

  it('does not run scripts', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        ui {
          <div><pre id="code"></pre></div>
        }
        script {
          {<pre id="code"></pre>}.textContent = "injected"
        }
      }`,
      'Page'
    )
    expect(renderToString(Page)).toBe('<div><pre id="code"></pre></div>')
  })

  it('resolves nested components from the registry option', async () => {
    const Card = await buildFactory(
      `blueprint Card {
        props { title: string = "" }
        ui {
          <section><h2>{props.title}</h2></section>
        }
      }`,
      'Card'
    )
    const Page = await buildFactory(
      `blueprint Page {
        ui {
          <div><Card title="Hi" /></div>
        }
      }`,
      'Page'
    )
    expect(renderToString(Page, { components: { Card } })).toBe(
      '<div><section><h2>Hi</h2></section></div>'
    )
  })

  it('renders placeholders for unregistered components', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        ui {
          <div><Missing /></div>
        }
      }`,
      'Page'
    )
    expect(renderToString(Page)).toContain('data-component="Missing"')
  })

  it('is deterministic and restores globals', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        state { n: number = 1 }
        ui {
          <p>{state.n}</p>
        }
      }`,
      'Page'
    )
    const a = renderToString(Page)
    const b = renderToString(Page)
    expect(a).toBe(b)
    expect(a).toBe('<p>1</p>')
    expect('document' in globalThis).toBe(false)
    expect('window' in globalThis).toBe(false)
  })

  it('passes props through', async () => {
    const Page = await buildFactory(
      `blueprint Page {
        props { title: string = "Default" }
        ui {
          <h1>{props.title}</h1>
        }
      }`,
      'Page'
    )
    expect(renderToString(Page, { props: { title: 'Custom' } })).toBe('<h1>Custom</h1>')
  })
})

describe('renderDocumentShell', () => {
  it('wraps body html in a document', () => {
    const html = renderDocumentShell('<p>hi</p>', { title: 'Test & Co' })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<title>Test &amp; Co</title>')
    expect(html).toContain('<div id="app"><p>hi</p></div>')
  })
})
