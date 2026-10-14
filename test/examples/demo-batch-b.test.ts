// Behavioral verification for examples/19-i18n-demo and examples/20-taskboard.
// Plain vitest+jsdom compile-and-mount, mirroring test/examples/site-behavior.test.ts:
// real compiled output against the real runtime — mounts pages, clicks, asserts live DOM.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { lex } from '../../src/lexer/lexer'
import { parse } from '../../src/parser/parser'
import { compile } from '../../src/compiler/compiler'

let dom: JSDOM
const GEN = path.resolve(__dirname, 'gen-b')

function setupDom(url = 'http://localhost/') {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url })
  vi.stubGlobal('window', dom.window as unknown as Window & typeof globalThis)
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('history', dom.window.history)
  vi.stubGlobal('location', dom.window.location)
  vi.stubGlobal('Node', dom.window.Node)
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  vi.stubGlobal('Comment', dom.window.Comment)
  vi.stubGlobal('Text', dom.window.Text)
}

function buildFile(tardisPath: string, outName: string): string {
  const src = fs.readFileSync(tardisPath, 'utf8')
  const compiled = compile(parse(lex(src), path.basename(tardisPath)))
    .replace(/from\s+['"]tardisjs\/runtime['"]/g, "from '../../../src/runtime/index'")
  const code = ts.transpileModule(compiled, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText
  const out = path.join(GEN, outName)
  fs.writeFileSync(out, code)
  return out
}

function click(el: Element | null) {
  if (!el) throw new Error('click target missing')
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
}

function q(sel: string): HTMLElement | null {
  return dom.window.document.querySelector(sel) as HTMLElement | null
}

function qa(sel: string): HTMLElement[] {
  return Array.from(dom.window.document.querySelectorAll(sel)) as HTMLElement[]
}

beforeEach(() => {
  setupDom()
  fs.rmSync(GEN, { recursive: true, force: true })
  fs.mkdirSync(GEN, { recursive: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  dom.window.close()
  fs.rmSync(GEN, { recursive: true, force: true })
})

describe('19-i18n-demo behaves', () => {
  async function mount() {
    buildFile('examples/19-i18n-demo/pages/index.tardis', 'I18nHome.mjs')
    const home = await import('./gen-b/I18nHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  function localeButtons(): HTMLElement[] {
    return qa('.locales button')
  }

  it('renders English by default', async () => {
    await mount()
    expect(q('.greeting')?.textContent).toBe('Hello, builder')
    expect(q('.tagline')?.textContent).toContain('deterministic frontends')
    expect(q('.cta')?.textContent).toBe('Start building')
    expect(q('.locale-note')?.textContent).toContain('en')
    expect(q('.locale-note')?.textContent).toContain('English')
    expect(q('.items-label')?.textContent).toBe('1 item in your cart')
    expect(localeButtons()[0].className).toContain('locale-on')
  })

  it('switches to Spanish', async () => {
    await mount()
    click(localeButtons()[1])
    expect(q('.greeting')?.textContent).toBe('Hola, constructor')
    expect(q('.tagline')?.textContent).toContain('deterministas')
    expect(q('.cta')?.textContent).toBe('Empezar a crear')
    expect(q('.locale-note')?.textContent).toContain('es')
    expect(localeButtons()[1].className).toContain('locale-on')
    expect(localeButtons()[0].className).toContain('locale-btn')
  })

  it('switches to German and back to English', async () => {
    await mount()
    click(localeButtons()[2])
    expect(q('.greeting')?.textContent).toBe('Hallo, Entwickler')
    expect(q('.foot')?.textContent).toContain('Fallback-Sprache')
    expect(q('.locale-note')?.textContent).toContain('de')
    click(localeButtons()[0])
    expect(q('.greeting')?.textContent).toBe('Hello, builder')
    expect(q('.foot')?.textContent).toContain('Fallback is English')
  })

  it('pluralizes zero, one, and other in English', async () => {
    await mount()
    expect(q('.items-label')?.textContent).toBe('1 item in your cart')
    click(q('.cart-dec'))
    expect(q('.items-label')?.textContent).toBe('Your cart is empty')
    click(q('.cart-dec'))
    expect(q('.items-label')?.textContent).toBe('Your cart is empty')
    click(q('.cart-inc'))
    click(q('.cart-inc'))
    expect(q('.items-label')?.textContent).toBe('2 items in your cart')
  })

  it('pluralizes in the active locale', async () => {
    await mount()
    click(localeButtons()[1])
    click(q('.cart-inc'))
    click(q('.cart-inc'))
    expect(q('.items-label')?.textContent).toBe('3 artículos en tu cesta')
    click(q('.cart-dec'))
    click(q('.cart-dec'))
    click(q('.cart-dec'))
    expect(q('.items-label')?.textContent).toBe('Tu cesta está vacía')
    click(localeButtons()[2])
    click(q('.cart-inc'))
    expect(q('.items-label')?.textContent).toBe('1 Artikel im Warenkorb')
    click(q('.cart-inc'))
    expect(q('.items-label')?.textContent).toBe('2 Artikel im Warenkorb')
  })
})

describe('20-taskboard behaves', () => {
  async function mount() {
    buildFile('examples/20-taskboard/pages/index.tardis', 'TaskHome.mjs')
    const home = await import('./gen-b/TaskHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    const { flushMountCallbacks } = await import('../../src/runtime/events')
    flushMountCallbacks()
  }

  function pills(): string[] {
    return qa('.job .pill').map((e) => e.textContent || '')
  }

  function advance() {
    click(q('.advance'))
  }

  it('seeds four jobs with the first running', async () => {
    await mount()
    expect(pills()).toEqual(['running', 'queued', 'queued', 'queued'])
    const labels = qa('.job .job-label').map((e) => e.textContent || '')
    expect(labels).toEqual(['Fetch sources', 'Transcode video', 'Export bundle', 'Notify channel'])
    expect(qa('.job')[0].className).toContain('status-running')
    expect(q('.count-pending')?.textContent).toContain('4 pending')
    expect(q('.count-done')?.textContent).toContain('0 done')
    expect(q('.count-error')?.textContent).toContain('0 error')
    expect(q('.phase')?.textContent).toBe('Step 1 of 4')
    expect(q('.retry')?.style.display).toBe('none')
  })

  it('advances the pipeline deterministically', async () => {
    await mount()
    advance()
    expect(pills()).toEqual(['done', 'running', 'queued', 'queued'])
    expect(q('.count-done')?.textContent).toContain('1 done')
    expect(q('.count-pending')?.textContent).toContain('3 pending')
    advance()
    expect(pills()).toEqual(['done', 'done', 'running', 'queued'])
    expect(q('.phase')?.textContent).toBe('Step 3 of 4')
  })

  it('fails the export job and offers retry', async () => {
    await mount()
    advance()
    advance()
    advance()
    expect(pills()).toEqual(['done', 'done', 'error', 'running'])
    expect(qa('.job')[2].className).toContain('status-error')
    expect(q('.count-error')?.textContent).toContain('1 error')
    expect(q('.retry')?.style.display).toBe('')
    expect(q('.phase')?.textContent).toBe('Step 4 of 4')
  })

  it('retry re-runs the failed job to success', async () => {
    await mount()
    advance()
    advance()
    advance()
    click(q('.retry'))
    expect(pills()).toEqual(['done', 'done', 'running', 'queued'])
    expect(q('.count-error')?.textContent).toContain('0 error')
    expect(q('.retry')?.style.display).toBe('none')
    advance()
    expect(pills()).toEqual(['done', 'done', 'done', 'running'])
    advance()
    expect(pills()).toEqual(['done', 'done', 'done', 'done'])
    expect(q('.count-done')?.textContent).toContain('4 done')
    expect(q('.count-pending')?.textContent).toContain('0 pending')
    expect(q('.phase')?.textContent).toBe('Settled')
    expect(q('.advance')?.style.display).toBe('none')
  })

  it('reset restores the initial pipeline', async () => {
    await mount()
    advance()
    advance()
    click(q('.reset'))
    expect(pills()).toEqual(['running', 'queued', 'queued', 'queued'])
    expect(q('.phase')?.textContent).toBe('Step 1 of 4')
    expect(q('.count-done')?.textContent).toContain('0 done')
    expect(q('.advance')?.style.display).toBe('')
  })
})
