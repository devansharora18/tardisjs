import { describe, it, expect } from 'vitest'

import {
  trapFocus, announce, setExpanded, setPressed, setSelected, labelBy, skipLink,
  type A11yEl,
} from '../../src/runtime/a11y'

class FakeEl implements A11yEl {
  attrs = new Map<string, string>()
  listeners = new Map<string, Array<(...a: never[]) => void>>()
  focused = 0
  textContent = ''

  setAttribute(k: string, v: string): void { this.attrs.set(k, v) }
  removeAttribute(k: string): void { this.attrs.delete(k) }
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null }
  addEventListener(t: string, fn: (...a: never[]) => void): void {
    const cur = this.listeners.get(t) ?? []
    cur.push(fn)
    this.listeners.set(t, cur)
  }
  removeEventListener(t: string, fn: (...a: never[]) => void): void {
    this.listeners.set(t, (this.listeners.get(t) ?? []).filter(f => f !== fn))
  }
  focus(): void { this.focused += 1 }
  fire(t: string, e: unknown): void {
    for (const fn of this.listeners.get(t) ?? []) fn(e as never)
  }
}

class FakeContainer extends FakeEl {
  constructor(private els: FakeEl[] = []) { super() }
  querySelectorAll(_s: string): ArrayLike<A11yEl> { return this.els }
}

class FakeDoc {
  created: FakeEl[] = []
  appended: unknown[] = []
  body = {
    appendChild: (e: unknown): void => { this.appended.push(e) },
  }
  createElement(_t: string): FakeEl {
    const el = new FakeEl()
    this.created.push(el)
    return el
  }
}

describe('trapFocus', () => {
  it('cycles Tab forward and Shift+Tab backward among focusables', () => {
    const els = [new FakeEl(), new FakeEl(), new FakeEl()]
    const c = new FakeContainer(els)
    trapFocus(c)
    let prevented = 0
    const tab = { key: 'Tab', preventDefault: () => { prevented += 1 } }
    c.fire('keydown', tab)
    expect(els[1].focused).toBe(1)
    c.fire('keydown', tab)
    expect(els[2].focused).toBe(1)
    c.fire('keydown', tab)
    expect(els[0].focused).toBe(1)
    expect(prevented).toBe(3)
    c.fire('keydown', { key: 'Tab', shiftKey: true })
    expect(els[2].focused).toBe(2)
  })

  it('ignores non-Tab keys', () => {
    const els = [new FakeEl(), new FakeEl()]
    const c = new FakeContainer(els)
    trapFocus(c)
    c.fire('keydown', { key: 'Enter' })
    expect(els[0].focused).toBe(0)
    expect(els[1].focused).toBe(0)
  })

  it('untrap removes the listener', () => {
    const els = [new FakeEl(), new FakeEl()]
    const c = new FakeContainer(els)
    const untrap = trapFocus(c)
    untrap()
    c.fire('keydown', { key: 'Tab' })
    expect(els[0].focused).toBe(0)
    expect(els[1].focused).toBe(0)
  })

  it('does not throw with an empty container', () => {
    const c = new FakeContainer([])
    const untrap = trapFocus(c)
    expect(() => c.fire('keydown', { key: 'Tab' })).not.toThrow()
    untrap()
  })
})

describe('announce', () => {
  it('creates the live region once and updates its text', () => {
    const doc = new FakeDoc()
    announce('hello', doc)
    announce('world', doc)
    expect(doc.created.length).toBe(1)
    expect(doc.created[0].textContent).toBe('world')
    expect(doc.created[0].getAttribute('role')).toBe('status')
    expect(doc.created[0].getAttribute('aria-live')).toBe('polite')
    expect(doc.appended.length).toBe(1)
  })

  it('is a no-op without a document', () => {
    expect(() => announce('hi')).not.toThrow()
  })
})

describe('aria setters', () => {
  it('sets expanded/pressed/selected/labelledby attributes', () => {
    const el = new FakeEl()
    setExpanded(el, true)
    expect(el.getAttribute('aria-expanded')).toBe('true')
    setExpanded(el, false)
    expect(el.getAttribute('aria-expanded')).toBe('false')
    setPressed(el, true)
    expect(el.getAttribute('aria-pressed')).toBe('true')
    setSelected(el, false)
    expect(el.getAttribute('aria-selected')).toBe('false')
    labelBy(el, 'title-id')
    expect(el.getAttribute('aria-labelledby')).toBe('title-id')
  })
})

describe('skipLink', () => {
  it('returns a link string with href and label', () => {
    const html = skipLink('main', 'Jump to main')
    expect(html).toContain('href="#main"')
    expect(html).toContain('Jump to main')
  })

  it('defaults the label', () => {
    expect(skipLink('main')).toContain('Skip to content')
  })
})
