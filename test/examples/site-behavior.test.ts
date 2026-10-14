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

describe('14-realestate behaves', () => {
  async function mountIndex() {
    buildFile('examples/14-realestate/components/ListingCard.tardis', 'ListingCard.mjs')
    buildFile('examples/14-realestate/pages/index.tardis', 'EstateHome.mjs')
    const card = await import('./gen/ListingCard.mjs')
    ;(dom.window as unknown as Record<string, unknown>).__tardis_ListingCard = card.ListingCard
    const home = await import('./gen/EstateHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  function visibleCards(): number {
    return qa('.list .card').filter((c) => {
      let el: HTMLElement | null = c as HTMLElement
      while (el) {
        if (el.style && el.style.display === 'none') return false
        el = el.parentElement
      }
      return true
    }).length
  }

  it('filters by price and type with live count', async () => {
    await mountIndex()
    expect(qa('.list .card').length).toBe(6)
    expect(q('.count')?.textContent).toContain('6 of 6')
    click(qa('.frow')[0].querySelectorAll('button')[1])
    expect(visibleCards()).toBe(2)
    expect(q('.count')?.textContent).toContain('2 of 6')
    click(qa('.frow')[1].querySelectorAll('button')[1])
    expect(visibleCards()).toBe(0)
    expect(q('.empty')?.style.display).toBe('')
    click(q('.count button'))
    expect(visibleCards()).toBe(6)
  })

  it('links cards to property pages', async () => {
    await mountIndex()
    expect(qa('.list .card')[0].getAttribute('href')).toBe('/property/maple-house')
  })

  it('renders property detail with tour booking', async () => {
    buildFile('examples/14-realestate/pages/property/[id].tardis', 'EstatePage.mjs')
    const { createRouter, $navigate } = await import('../../src/runtime/router')
    const page = await import('./gen/EstatePage.mjs')
    const router = createRouter([
      { path: '/', component: () => dom.window.document.createElement('div') },
      { path: '/property/:id', component: page.Property },
    ])
    router.start()
    $navigate('/property/loft-9')
    expect(q('.detail h1')?.textContent).toContain('Loft No. 9')
    type(qa('.tour input')[0] as HTMLInputElement, 'Ada')
    type(qa('.tour input')[1] as HTMLInputElement, 'ada@example.com')
    click(q('.tour button'))
    expect(q('.booked')?.textContent).toContain('Tour requested')
    $navigate('/property/nope')
    expect(q('.missing h1')?.textContent).toContain('Off the market')
    expect(q('.tour')?.style.display).toBe('none')
  })
})

describe('13-jobs behaves', () => {
  async function mountIndex() {
    buildFile('examples/13-jobs/components/JobCard.tardis', 'JobCard.mjs')
    buildFile('examples/13-jobs/pages/index.tardis', 'JobsHome.mjs')
    const card = await import('./gen/JobCard.mjs')
    ;(dom.window as unknown as Record<string, unknown>).__tardis_JobCard = card.JobCard
    const home = await import('./gen/JobsHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  function visibleJobs(): number {
    return qa('.list .job').filter((j) => {
      let el: HTMLElement | null = j as HTMLElement
      while (el) {
        if (el.style && el.style.display === 'none') return false
        el = el.parentElement
      }
      return true
    }).length
  }

  it('filters by department and location independently', async () => {
    await mountIndex()
    expect(qa('.list .job').length).toBe(6)
    expect(q('.count')?.textContent).toContain('6 open roles')
    click(qa('.frow')[0].querySelectorAll('button')[1])
    expect(visibleJobs()).toBe(2)
    expect(q('.count')?.textContent).toContain('2 open roles')
    click(qa('.frow')[1].querySelectorAll('button')[2])
    expect(visibleJobs()).toBe(1)
    click(qa('.frow')[0].querySelectorAll('button')[0])
    click(qa('.frow')[1].querySelectorAll('button')[0])
    expect(visibleJobs()).toBe(6)
  })

  it('shows empty state and resets', async () => {
    await mountIndex()
    click(qa('.frow')[0].querySelectorAll('button')[1])
    click(qa('.frow')[1].querySelectorAll('button')[3])
    expect(visibleJobs()).toBe(0)
    expect(q('.empty')?.style.display).toBe('')
    click(q('.count button'))
    expect(visibleJobs()).toBe(6)
  })

  it('renders job detail with apply flow', async () => {
    buildFile('examples/13-jobs/pages/jobs/[id].tardis', 'JobPage.mjs')
    const { createRouter, $navigate } = await import('../../src/runtime/router')
    const page = await import('./gen/JobPage.mjs')
    const router = createRouter([
      { path: '/', component: () => dom.window.document.createElement('div') },
      { path: '/jobs/:id', component: page.Job },
    ])
    router.start()
    $navigate('/jobs/product-designer')
    expect(q('.job h1')?.textContent).toContain('Product Designer')
    expect(q('.apply button')?.textContent).toContain('Apply for this role')
    click(q('.apply button'))
    expect(q('.applied')?.textContent).toContain('Application received')
    $navigate('/jobs/nope')
    expect(q('.missing h1')?.textContent).toContain('never existed')
    expect(q('.apply')?.style.display).toBe('none')
  })
})

describe('12-recipes behaves', () => {
  async function mountIndex() {
    buildFile('examples/12-recipes/components/RecipeCard.tardis', 'RecipeCard.mjs')
    buildFile('examples/12-recipes/pages/index.tardis', 'RecipesHome.mjs')
    const card = await import('./gen/RecipeCard.mjs')
    ;(dom.window as unknown as Record<string, unknown>).__tardis_RecipeCard = card.RecipeCard
    const home = await import('./gen/RecipesHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
  }

  function visibleCards(): number {
    return qa('.grid .card').filter((c) => {
      let el: HTMLElement | null = c as HTMLElement
      while (el) {
        if (el.style && el.style.display === 'none') return false
        el = el.parentElement
      }
      return true
    }).length
  }

  it('searches recipes and clears', async () => {
    await mountIndex()
    expect(qa('.grid .card').length).toBe(4)
    expect(q('.count')?.textContent).toContain('4 of 4')
    type(q('.searchrow input') as HTMLInputElement, 'pizza')
    expect(visibleCards()).toBe(1)
    expect(q('.count')?.textContent).toContain('1 of 4')
    type(q('.searchrow input') as HTMLInputElement, 'zzz')
    expect(visibleCards()).toBe(0)
    expect(q('.empty')?.style.display).toBe('')
    click(q('.searchrow button'))
    expect(visibleCards()).toBe(4)
  })

  it('links cards to detail pages', async () => {
    await mountIndex()
    expect(qa('.grid .card')[2].getAttribute('href')).toBe('/recipes/tacos')
  })

  it('renders recipe detail and missing fallback', async () => {
    buildFile('examples/12-recipes/pages/recipes/[slug].tardis', 'RecipePage.mjs')
    const { createRouter, $navigate } = await import('../../src/runtime/router')
    const page = await import('./gen/RecipePage.mjs')
    const router = createRouter([
      { path: '/', component: () => dom.window.document.createElement('div') },
      { path: '/recipes/:slug', component: page.Recipe },
    ])
    router.start()
    $navigate('/recipes/margherita')
    expect(q('.article h1')?.textContent).toContain('Blistered Margherita')
    expect(qa('.article li').length).toBe(8)
    $navigate('/recipes/nope')
    expect(q('.missing h1')?.textContent).toContain('Not on the menu')
    expect(qa('.rel-link').length).toBe(4)
  })
})

describe('11-gallery behaves', () => {
  async function mount() {
    buildFile('examples/11-gallery/pages/index.tardis', 'GalleryHome.mjs')
    const home = await import('./gen/GalleryHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    const { flushMountCallbacks } = await import('../../src/runtime/events')
    flushMountCallbacks()
  }

  function visibleShots(): number {
    return qa('.shot').filter((s) => {
      let el: HTMLElement | null = s as HTMLElement
      while (el) {
        if (el.style && el.style.display === 'none') return false
        el = el.parentElement
      }
      return true
    }).length
  }

  it('seeds nine photos on mount', async () => {
    await mount()
    expect(qa('.shot').length).toBe(9)
    expect(visibleShots()).toBe(9)
    expect(q('.hero p')?.textContent).toContain('3 · 3 · 3')
  })

  it('filters by category', async () => {
    await mount()
    click(qa('.filters button')[1])
    expect(visibleShots()).toBe(3)
    click(qa('.filters button')[0])
    expect(visibleShots()).toBe(9)
  })

  it('opens the viewer with the right photo and closes', async () => {
    await mount()
    expect(q('.viewer')?.style.display).toBe('none')
    click(qa('.shot')[4])
    expect(q('.viewer')?.style.display).toBe('')
    expect(q('.frame h2')?.textContent).toBe('Still Lake')
    expect(q('.frame img')?.getAttribute('src')).toContain('aperture-nature-2')
    click(q('.frame-bar button'))
    expect(q('.viewer')?.style.display).toBe('none')
  })
})

describe('10-player behaves', () => {
  async function mount() {
    buildFile('examples/10-player/pages/index.tardis', 'PlayerHome.mjs')
    const home = await import('./gen/PlayerHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    const { flushMountCallbacks } = await import('../../src/runtime/events')
    flushMountCallbacks()
  }

  function elapsedText(): string {
    return qa('.times span')[0].textContent || ''
  }

  it('seeds the playlist on mount', async () => {
    vi.useFakeTimers()
    try {
      await mount()
      expect(qa('.row, .row-on').length).toBe(3)
      expect(q('.now h1')?.textContent).toBe('Midnight Run')
      expect(elapsedText()).toBe('0:00')
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays a track and advances the clock', async () => {
    vi.useFakeTimers()
    try {
      await mount()
      click(qa('.row, .row-on')[1])
      expect(q('.now h1')?.textContent).toBe('Paper Planes')
      expect(q('.play')?.textContent).toBe('❚❚')
      vi.advanceTimersByTime(5000)
      expect(elapsedText()).toBe('0:05')
      expect(q('.fill')?.getAttribute('style')).toContain('width:')
      click(q('.play'))
      vi.advanceTimersByTime(5000)
      expect(elapsedText()).toBe('0:05')
    } finally {
      vi.useRealTimers()
    }
  })

  it('steps next and prev with elapsed reset', async () => {
    vi.useFakeTimers()
    try {
      await mount()
      click(q('.controls button:last-child'))
      expect(q('.now h1')?.textContent).toBe('Paper Planes')
      click(qa('.row, .row-on')[2])
      expect(q('.now h1')?.textContent).toBe('Solar Drift')
      click(q('.controls button:first-child'))
      expect(q('.now h1')?.textContent).toBe('Paper Planes')
      expect(elapsedText()).toBe('0:00')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('09-kanban behaves', () => {
  async function mount() {
    buildFile('examples/09-kanban/pages/index.tardis', 'KanbanHome.mjs')
    const home = await import('./gen/KanbanHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    const { flushMountCallbacks } = await import('../../src/runtime/events')
    flushMountCallbacks()
  }

  function colCount(id: string): number {
    return qa(`#${id} .card`).length
  }

  function colTitles(id: string): string[] {
    return qa(`#${id} .card p`).map((e) => e.textContent || '')
  }

  it('seeds three columns on mount', async () => {
    await mount()
    expect(colCount('col-todo')).toBe(2)
    expect(colCount('col-doing')).toBe(1)
    expect(colCount('col-done')).toBe(1)
    expect(q('.head p')?.textContent).toContain('4 cards')
  })

  it('moves cards across columns', async () => {
    await mount()
    click(qa('#col-todo .moves button')[0])
    expect(colCount('col-todo')).toBe(1)
    expect(colCount('col-doing')).toBe(2)
    expect(colTitles('col-doing')).toContain('Ship the landing page')
    click(qa('#col-doing .moves button')[1])
    expect(colCount('col-doing')).toBe(1)
    expect(colCount('col-done')).toBe(2)
    click(qa('#col-done .moves button')[0])
    expect(colCount('col-done')).toBe(1)
    expect(colCount('col-doing')).toBe(2)
  })

  it('adds cards and clears done', async () => {
    await mount()
    type(q('.addrow input') as HTMLInputElement, 'Write tests')
    click(q('.addrow button'))
    expect(colCount('col-todo')).toBe(3)
    expect(colTitles('col-todo')).toContain('Write tests')
    expect((q('.addrow input') as HTMLInputElement).value).toBe('')
    click(q('.col-foot button'))
    expect(colCount('col-done')).toBe(0)
    expect(q('.head p')?.textContent).toContain('4 cards')
  })
})

describe('08-chat behaves', () => {
  async function mount() {
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { fn(0); return 0 })
    buildFile('examples/08-chat/pages/index.tardis', 'ChatHome.mjs')
    const home = await import('./gen/ChatHome.mjs')
    dom.window.document.getElementById('app')!.appendChild(home.Home())
    const { flushMountCallbacks } = await import('../../src/runtime/events')
    flushMountCallbacks()
  }

  function texts(): string[] {
    return qa('.msg').map((m) => m.textContent || '')
  }

  it('greets on mount and sends messages with bot replies', async () => {
    await mount()
    expect(texts().length).toBe(1)
    expect(texts()[0]).toContain('demo bot')
    type(q('.composer input') as HTMLInputElement, 'What is the price?')
    click(q('.composer button'))
    expect(texts().length).toBe(3)
    expect(texts()[1]).toContain('What is the price?')
    expect(texts()[2]).toContain('$19/mo')
    expect((q('.composer input') as HTMLInputElement).value).toBe('')
  })

  it('ignores empty sends', async () => {
    await mount()
    click(q('.composer button'))
    expect(texts().length).toBe(1)
  })

  it('answers quick replies and human requests', async () => {
    await mount()
    click(qa('.quick button')[2])
    const t = texts()
    expect(t[t.length - 2]).toContain('human')
    expect(t[t.length - 1]).toContain('2 minutes')
  })

  it('sends on Enter', async () => {
    await mount()
    const input = q('.composer input') as HTMLInputElement
    type(input, 'hello there')
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(texts().length).toBe(3)
    expect(texts()[2]).toContain('follow up')
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
