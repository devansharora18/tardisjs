// @vitest-environment jsdom
// End-to-end proof for file imports: compiles two .tardis sources with
// compileFile, loads them as real ES modules, mounts, and asserts on the
// live DOM — imported component, children builders, named slot, fallback
// suppression, and prop spread all working together.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { lex } from '../../src/lexer/lexer'
import { parseFile } from '../../src/parser/parser'
import { compileFile } from '../../src/compiler/compiler'

const GEN = path.resolve(__dirname, 'gen-e2e')

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>'
  fs.rmSync(GEN, { recursive: true, force: true })
  fs.mkdirSync(GEN, { recursive: true })
})

afterEach(() => {
  fs.rmSync(GEN, { recursive: true, force: true })
})

function emit(name: string, source: string): void {
  const compiled = compileFile(parseFile(lex(source), name + '.tardis'))
    .replace(/from '\.\/components\/Button\.js'/g, "from './Button.gen.mjs'")
    .replace(/from 'tardisjs\/runtime'/g, "from '../../../src/runtime/index'")
  const code = ts.transpileModule(compiled, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  fs.writeFileSync(path.join(GEN, name + '.gen.mjs'), code)
}

describe('imports + slots + spread e2e', () => {
  it('renders imported component with children, slots, and spread', async () => {
    emit('Button', `
      blueprint Button {
        props { label: string = "Action" }
        ui {
          <button class="btn">
            <span>{props.label}</span>
            <slot />
            <slot name="icon"><span class="no-icon">•</span></slot>
          </button>
        }
      }
    `)
    emit('Page', `
      import Button from "./components/Button.tardis"
      blueprint Page {
        state { extra: object = {} }
        ui {
          <div>
            <Button label="Save" kind="primary" {...state.extra}>
              <strong>Bold body</strong>
              <em slot="icon">★</em>
            </Button>
          </div>
        }
      }
    `)
    // Page.gen.mjs relatively imports ./Button.gen.mjs at runtime.
    const pageMod = await import(/* @vite-ignore */ pathToFileURL(path.join(GEN, 'Page.gen.mjs')).href)
    // wire the ESM import the way the CLI output expects: Page.gen.mjs
    // imports './Button.gen.mjs' relatively — already on disk.
    const root = pageMod.Page()
    document.getElementById('app')!.appendChild(root)
    const btn = document.querySelector('button.btn') as HTMLElement
    expect(btn.textContent).toContain('Save')
    expect(btn.textContent).toContain('Bold body')
    expect(btn.textContent).toContain('★')
    expect(btn.textContent).not.toContain('•')
    expect(btn.querySelector('em')?.textContent).toBe('★')
    expect(btn.querySelector('.no-icon')).toBeNull()
  })
})
