// Behavioral verification for examples/01-04.
// Executes real compiled output against the real runtime in jsdom:
// mounts pages, clicks, types, navigates, and asserts on the live DOM.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { lex } from '../../src/lexer/lexer'
import { parse } from '../../src/parser/parser'
import { compile } from '../../src/compiler/compiler'

let dom: JSDOM
const GEN = path.resolve(__dirname, 'gen')

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

function type(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) throw new Error('input target missing')
  el.value = value
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }))
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

describe('01-agency behaves', () => {
  async function mount() {
    buildFile('examples/01-agency/components/SectionHead.tardis', 'SectionHead.mjs')
    buildFile('examples/01-agency/pages/index.tardis', 'AgencyHome.mjs')
    const section = await import('./gen/SectionHead.mjs')
    ;(dom.window as unknown as Record<string, unknown>).__tardis_SectionHead = section.SectionHead
    const home = await import('./gen/AgencyHome.mjs')
    const root = home.Home()
    dom.window.document.getElementById('app')!.appendChild(root)
  }

  it('toggles FAQ answers', async () => {
    await mount()
    // $show keeps the node mounted but hidden
    expect(q('.faq-a')?.style.display).toBe('none')
    click(qa('.faq-q')[0])
    expect(q('.faq-a')?.style.display).toBe('')
    expect(q('.faq-a')?.textContent).toContain('Kickoff within one week')
    click(qa('.faq-q')[0])
    expect(q('.faq-a')?.style.display).toBe('none')
  })

  it('toggles pricing monthly/yearly', async () => {
    await mount()
    const prices = () => qa('.price').map((e) => e.textContent)
    expect(prices()[0]).toContain('/mo')
    click(qa('.billing button')[1])
    expect(prices()[0]).toContain('/yr')
    expect(q('.bill-note')?.textContent).toContain('yearly')
  })

  it('validates and submits the contact form', async () => {
    await mount()
    const send = () => qa('.contact .btn-primary')[0]
    click(send())
    expect(q('.form-error')?.textContent).toContain('name')
    type(q('.field input') as HTMLInputElement, 'Ada')
    click(qa('.contact .btn-primary')[0])
    expect(q('.form-error')?.textContent).toContain('email')
    type(qa('.field input')[1] as HTMLInputElement, 'ada@company.com')
    type(q('.field textarea') as HTMLTextAreaElement, 'Need a site')
    click(qa('.contact .btn-primary')[0])
    expect(q('.form-ok h3')?.textContent).toContain('Ada')
    expect(q('.form-ok p')?.textContent).toContain('ada@company.com')
  })
})

describe('02-blog behaves', () => {
  it('renders index cards and subscribes newsletter', async () => {
    buildFile('examples/02-blog/components/PostCard.tardis', 'PostCard.mjs')
    buildFile('examples/02-blog/pages/index.tardis', 'BlogHome.mjs')
    const card = await import('./gen/PostCard.mjs')
    ;(dom.window as unknown as Record<string, unknown>).__tardis_PostCard = card.PostCard
    const home = await import('./gen/BlogHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    expect(qa('.card').length).toBe(4)
    expect(qa('.card')[0].getAttribute('href')).toBe('/blog/hello-world')
    type(q('.row input') as HTMLInputElement, 'not-an-email')
    click(q('.row button'))
    expect(q('.ok')?.style.display).toBe('none')
    type(q('.row input') as HTMLInputElement, 'me@example.com')
    click(q('.row button'))
    expect(q('.ok')?.textContent).toContain("You're in")
  })

  it('routes dynamic slugs including missing', async () => {
    buildFile('examples/02-blog/pages/blog/[slug].tardis', 'BlogPost.mjs')
    const { createRouter } = await import('../../src/runtime/router')
    const post = await import('./gen/BlogPost.mjs')
    const router = createRouter([
      { path: '/', component: () => dom.window.document.createElement('div') },
      { path: '/blog/:slug', component: post.Post },
    ])
    router.start()
    const { $navigate } = await import('../../src/runtime/router')
    $navigate('/blog/proxy-reactivity')
    expect(dom.window.document.getElementById('app')?.textContent).toContain('Proxies all the way down')
    $navigate('/blog/nope')
    expect(dom.window.document.getElementById('app')?.textContent).toContain('No essay here')
    expect(qa('.rel-link').length).toBe(4)
  })
})

describe('03-docs behaves', () => {
  it('filters sections by search query', async () => {
    buildFile('examples/03-docs/pages/index.tardis', 'DocsHome.mjs')
    const home = await import('./gen/DocsHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    expect(qa('.nav a').length).toBe(6)
    expect(q('.count')?.textContent).toContain('6 of 6')
    type(q('.search') as HTMLInputElement, 'rout')
    expect(q('.count')?.textContent).toContain('1 of 6')
    expect(q('#routing h2')?.textContent).toContain('Routing')
    expect(q('#cli')?.style.display).toBe('none')
    click(q('.count button'))
    expect(q('.count')?.textContent).toContain('6 of 6')
    expect(q('#cli h2')?.textContent).toContain('CLI')
  })
})

describe('05-dashboard behaves', () => {
  async function mount() {
    buildFile('examples/05-dashboard/pages/index.tardis', 'DashHome.mjs')
    const home = await import('./gen/DashHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  it('switches KPI values by range', async () => {
    await mount()
    const mrr = () => qa('.kpi-value')[0].textContent
    expect(mrr()).toContain('191.4k')
    click(qa('.range button')[0])
    expect(mrr()).toContain('48.2k')
    expect(q('.head p')?.textContent).toContain('7d')
  })

  it('sorts the customer table', async () => {
    await mount()
    const firstCell = () => qa('.tbl-row span')[0].textContent
    expect(firstCell()).toBe('Delta Co')
    click(qa('.tbl-head button')[0])
    expect(firstCell()).toBe('Acme Corp')
    expect(qa('.tbl-head button')[0].textContent).toContain('↑')
    click(qa('.tbl-head button')[0])
    expect(firstCell()).toBe('Zeta GmbH')
    expect(qa('.tbl-row span').length).toBe(24)
  })

  it('renders twelve chart bars', async () => {
    await mount()
    expect(qa('.bar').length).toBe(12)
    expect(qa('.bar')[11].getAttribute('style')).toContain('100%')
  })
})

describe('07-auth behaves', () => {
  async function mount() {
    buildFile('examples/07-auth/pages/index.tardis', 'AuthHome.mjs')
    const home = await import('./gen/AuthHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  // $show keeps nodes mounted but hidden — only interact with visible ones
  function visFields(): HTMLElement[] {
    return qa('.field').filter((f) => (f as HTMLElement).style.display !== 'none')
  }

  function visInputs(): HTMLInputElement[] {
    return visFields()
      .map((f) => f.querySelector('input') as HTMLInputElement)
      .filter(Boolean)
  }

  function submitBtn(): HTMLElement | null {
    return qa('.submit')[0] || null
  }

  it('switches tabs and shows the name field only on signup', async () => {
    await mount()
    expect(visFields().length).toBe(2)
    click(qa('.tabs button')[1])
    expect(visFields().length).toBe(3)
    expect(submitBtn()?.textContent).toBe('Create account')
    click(qa('.tabs button')[0])
    expect(visFields().length).toBe(2)
  })

  it('validates login input step by step', async () => {
    await mount()
    click(submitBtn())
    expect(q('.form-error')?.textContent).toContain('email')
    type(visInputs()[0], 'bad')
    click(submitBtn())
    expect(q('.form-error')?.textContent).toContain('valid email')
    type(visInputs()[0], 'me@example.com')
    click(submitBtn())
    expect(q('.form-error')?.textContent).toContain('password')
    type(visInputs()[1], 'short')
    click(submitBtn())
    expect(q('.form-error')?.textContent).toContain('8 characters')
  })

  it('toggles password visibility', async () => {
    await mount()
    const pw = () => visInputs()[1]
    expect(pw().getAttribute('type')).toBe('password')
    click(q('.pwwrap button'))
    expect(pw().getAttribute('type')).toBe('text')
  })

  it('logs in, welcomes, and signs out', async () => {
    await mount()
    type(visInputs()[0], 'me@example.com')
    type(visInputs()[1], 'correct horse')
    click(submitBtn())
    expect(q('.done h2')?.textContent).toBe('Welcome back')
    expect(q('.done p')?.textContent).toContain('me@example.com')
    click(q('.out'))
    expect(visFields().length).toBe(2)
  })

  it('requires a name on signup', async () => {
    await mount()
    click(qa('.tabs button')[1])
    type(visInputs()[1], 'me@example.com')
    type(visInputs()[2], 'correct horse')
    click(submitBtn())
    expect(q('.form-error')?.textContent).toContain('name')
    type(visInputs()[0], 'Ada')
    click(submitBtn())
    expect(q('.done h2')?.textContent).toBe('Account created')
  })
})

describe('06-portfolio behaves', () => {
  async function mount() {
    buildFile('examples/06-portfolio/components/ProjectCard.tardis', 'FolioCard.mjs')
    buildFile('examples/06-portfolio/pages/index.tardis', 'FolioHome.mjs')
    const card = await import('./gen/FolioCard.mjs')
    ;(dom.window as unknown as Record<string, unknown>).__tardis_ProjectCard = card.ProjectCard
    const home = await import('./gen/FolioHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  function visibleCards(): number {
    return qa('.grid .card').filter((c) => (c as HTMLElement).style.display !== 'none').length
  }

  it('filters the grid by discipline', async () => {
    await mount()
    expect(qa('.grid .card').length).toBe(6)
    expect(visibleCards()).toBe(6)
    click(qa('.filters button')[1])
    expect(visibleCards()).toBe(2)
    click(qa('.filters button')[2])
    expect(visibleCards()).toBe(2)
    click(qa('.filters button')[0])
    expect(visibleCards()).toBe(6)
  })

  it('opens and closes the lightbox with case content', async () => {
    await mount()
    expect(q('.lightbox')?.style.display).toBe('none')
    click(qa('.card .open')[2])
    expect(q('.lightbox')?.style.display).toBe('')
    expect(q('.case h2')?.textContent).toContain('Ledger App')
    click(q('.case-close'))
    expect(q('.lightbox')?.style.display).toBe('none')
  })
})

describe('04-store behaves', () => {
  async function mount() {
    buildFile('examples/04-store/components/ProductCard.tardis', 'StoreCard.mjs')
    buildFile('examples/04-store/pages/index.tardis', 'StoreHome.mjs')
    const card = await import('./gen/StoreCard.mjs')
    ;(dom.window as unknown as Record<string, unknown>).__tardis_ProductCard = card.ProductCard
    const home = await import('./gen/StoreHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  it('adds, removes, and checks out via component callbacks', async () => {
    await mount()
    expect(q('.bag')?.textContent).toContain('0')
    const adds = qa('.card .add')
    expect(adds.length).toBe(3)
    click(adds[0])
    expect(q('.bag')?.textContent).toContain('1')
    expect(q('.total')?.textContent).toContain('129')
    click(adds[2])
    expect(q('.bag')?.textContent).toContain('2')
    expect(q('.total')?.textContent).toContain('328')
    expect(qa('.line').length).toBe(2)
    click(qa('.line button')[0])
    expect(q('.bag')?.textContent).toContain('1')
    expect(q('.total')?.textContent).toContain('199')
    click(q('.checkout'))
    expect(q('.done h3')?.textContent).toContain('Order placed')
    expect(q('.bag')?.textContent).toContain('0')
  })

  it('shows product detail with quantity selector', async () => {
    buildFile('examples/04-store/pages/product/[id].tardis', 'StoreProduct.mjs')
    const { createRouter, $navigate } = await import('../../src/runtime/router')
    const prod = await import('./gen/StoreProduct.mjs')
    const router = createRouter([
      { path: '/', component: () => dom.window.document.createElement('div') },
      { path: '/product/:id', component: prod.Product },
    ])
    router.start()
    $navigate('/product/aero')
    expect(q('.detail h1')?.textContent).toContain('Aero Mouse')
    click(qa('.qty button')[1])
    click(qa('.qty button')[1])
    expect(q('.qty')?.textContent).toContain('3')
    click(q('.add'))
    expect(q('.added')?.textContent).toContain('3 × Aero Mouse')
    $navigate('/product/nope')
    expect(q('.missing h1')?.textContent).toContain('not found')
  })
})
