// Behavioral verification for examples/16-18.
// Own gen-a dir (site-behavior uses gen/, demo-batch-b uses gen-b/).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { lex } from '../../src/lexer/lexer'
import { parseFile } from '../../src/parser/parser'
import { compileFile } from '../../src/compiler/compiler'

let dom: JSDOM
const GEN = path.resolve(__dirname, 'gen-a')

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
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 0 })
}

function buildFile(tardisPath: string, outName: string, rewrites: Record<string, string> = {}): void {
  const src = fs.readFileSync(tardisPath, 'utf8')
  let compiled = compileFile(parseFile(lex(src), path.basename(tardisPath)))
    .replace(/from\s+['"]tardisjs\/runtime['"]/g, "from '../../../src/runtime/index'")
  for (const [from, to] of Object.entries(rewrites)) {
    compiled = compiled.split(from).join(to)
  }
  const code = ts.transpileModule(compiled, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText
  fs.writeFileSync(path.join(GEN, outName), code)
}

function click(el: Element | null) {
  if (!el) throw new Error('click target missing')
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
}

function type(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) throw new Error('input target missing')
  el.value = value
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }))
}

function blur(el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!el) throw new Error('blur target missing')
  el.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true, cancelable: true }))
}

function q(sel: string): HTMLElement | null {
  return dom.window.document.querySelector(sel) as HTMLElement | null
}

function qa(sel: string): HTMLElement[] {
  return Array.from(dom.window.document.querySelectorAll(sel)) as HTMLElement[]
}

function visible(sel: string): HTMLElement[] {
  return qa(sel).filter((el) => {
    let node: HTMLElement | null = el
    while (node) {
      if (node.style && node.style.display === 'none') return false
      node = node.parentElement
    }
    return true
  })
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

describe('16-slots-showcase behaves', () => {
  async function mount() {
    buildFile('examples/16-slots-showcase/components/Button.tardis', 'SlotsButton.gen.mjs')
    buildFile('examples/16-slots-showcase/components/Section.tardis', 'SlotsSection.gen.mjs', {
      "from './Button.js'": "from './SlotsButton.gen.mjs'",
    })
    buildFile('examples/16-slots-showcase/pages/index.tardis', 'SlotsHome.gen.mjs', {
      "from '../components/Section.js'": "from './SlotsSection.gen.mjs'",
      "from '../components/Button.js'": "from './SlotsButton.gen.mjs'",
    })
    const home = await import('./gen-a/SlotsHome.gen.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  it('renders filled slots, fallbacks, spread tone, and registry placeholder', async () => {
    await mount()
    const cards = qa('.card')
    expect(cards.length).toBe(3)
    // first card: parent-supplied eyebrow/body/actions win over fallbacks
    expect(cards[0].textContent).toContain('Custom eyebrow')
    expect(cards[0].textContent).toContain('Custom body')
    expect(cards[0].textContent).toContain('Custom action')
    expect(cards[0].textContent).not.toContain('Featured section')
    // third card got tone=highlight through the spread
    expect((cards[2] as HTMLElement).className).toContain('tone-highlight')
    // second card: no slots passed, all fallbacks render
    expect(cards[1].textContent).toContain('Featured section')
    expect(cards[1].textContent).toContain('Default body copy')
    expect(cards[1].textContent).toContain('Get started')
    // direct buttons: one fallback, one filled
    expect(q('.direct')?.textContent).toContain('Learn more')
    expect(q('.direct')?.textContent).toContain('→')
    // un-imported tag renders a registry placeholder
    const placeholder = q('[data-component="NewsletterSignup"]')
    expect(placeholder).not.toBeNull()
  })
})

describe('17-forms-demo behaves', () => {
  async function mount() {
    buildFile('examples/17-forms-demo/pages/index.tardis', 'FormsHome.gen.mjs')
    const home = await import('./gen-a/FormsHome.gen.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  it('counts characters and grades password strength live', async () => {
    await mount()
    type(q('.input-name') as HTMLInputElement, 'Ada')
    expect(q('.field label .count')?.textContent).toContain('3 / 40')
    type(q('.input-password') as HTMLInputElement, 'short')
    expect(q('.strength-label')?.textContent).toContain('Weak')
    expect(q('.meter-track div')?.className).toContain('meter-weak')
    type(q('.input-password') as HTMLInputElement, 'correct horse battery')
    expect(q('.strength-label')?.textContent).toContain('Strong')
    expect(q('.meter-track div')?.className).toContain('meter-strong')
  })

  it('validates on blur and submit, then saves and resets', async () => {
    await mount()
    blur(q('.input-name') as HTMLInputElement)
    expect(visible('.error').length).toBe(1)
    expect(visible('.error')[0].textContent).toContain('required')
    type(q('.input-name') as HTMLInputElement, 'Ada Lovelace')
    blur(q('.input-name') as HTMLInputElement)
    expect(visible('.error').length).toBe(0)
    click(q('.primary'))
    expect(visible('.error').length).toBe(2)
    type(q('.input-email') as HTMLInputElement, 'ada@example.com')
    type(q('.input-bio') as HTMLTextAreaElement, 'Designer.')
    type(q('.input-password') as HTMLInputElement, 'correct horse')
    click(q('.primary'))
    expect(q('.success h3')?.textContent).toContain('Profile saved')
    expect(q('.success p')?.textContent).toContain('Ada Lovelace')
    click(q('.ghost'))
    expect((q('.input-name') as HTMLInputElement).value).toBe('')
    expect(q('.success')?.style.display).toBe('none')
  })
})

describe('18-keyed-demo behaves', () => {
  async function mount() {
    buildFile('examples/18-keyed-demo/pages/index.tardis', 'KeyedHome.gen.mjs')
    const home = await import('./gen-a/KeyedHome.gen.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    const { flushMountCallbacks } = await import('../../src/runtime/events')
    flushMountCallbacks()
  }

  function titles(): string[] {
    return qa('.track .meta h3').map((e) => e.textContent || '')
  }

  it('seeds five tracks and filters by title', async () => {
    await mount()
    expect(titles().length).toBe(5)
    expect(q('.count')?.textContent).toContain('5 of 5 tracks')
    type(q('.filterrow input') as HTMLInputElement, 'neon')
    expect(titles()).toEqual(['Neon Harbor'])
    expect(q('.count')?.textContent).toContain('1 of 5 tracks')
    click(q('.filterrow button'))
    expect(titles().length).toBe(5)
  })

  it('sorts by title both directions', async () => {
    await mount()
    click(qa('.sortrow button')[1])
    expect(titles()[0]).toBe('Low Orbit')
    click(qa('.sortrow button')[1])
    expect(titles()[0]).toBe('Solar Drift')
    expect(q('.empty')?.style.display).toBe('none')
  })

  it('moves tracks up and rotates deterministically', async () => {
    await mount()
    expect(titles()[0]).toBe('Midnight Run')
    click(qa('.track .up')[1])
    expect(titles()[0]).toBe('Paper Planes')
    expect(titles()[1]).toBe('Midnight Run')
    click(q('.rotate'))
    expect(titles()[0]).toBe('Midnight Run')
    expect(titles()[4]).toBe('Paper Planes')
  })

  it('shows empty state with no matches', async () => {
    await mount()
    type(q('.filterrow input') as HTMLInputElement, 'zzz-no-match')
    expect(titles().length).toBe(0)
    expect(q('.empty')?.style.display).toBe('')
  })
})
