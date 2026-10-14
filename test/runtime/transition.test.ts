import { describe, it, expect } from 'vitest'

import {
  fade,
  slide,
  cssTransition,
  prefersReducedMotion,
  type El,
} from '../../src/runtime/transition'

class FakeEl implements El {
  style: { [k: string]: string } = {}
  classList: { add(...c: string[]): void; remove(...c: string[]): void }
  private classes = new Set<string>()

  constructor() {
    const classes = this.classes
    this.classList = {
      add(...c: string[]): void {
        c.forEach(x => classes.add(x))
      },
      remove(...c: string[]): void {
        c.forEach(x => classes.delete(x))
      },
    }
  }

  has(c: string): boolean {
    return this.classes.has(c)
  }
}

describe('transition', () => {
  it('fade show sets display and opacity', () => {
    const el = new FakeEl()
    fade(el, true)
    expect(el.style.display).toBe('')
    expect(el.style.opacity).toBe('1')
  })

  it('fade hide sets opacity 0 and display none', () => {
    const el = new FakeEl()
    fade(el, true)
    fade(el, false)
    expect(el.style.opacity).toBe('0')
    expect(el.style.display).toBe('none')
  })

  it('slide show clears maxHeight/overflow/display', () => {
    const el = new FakeEl()
    slide(el, false)
    slide(el, true)
    expect(el.style.display).toBe('')
    expect(el.style.maxHeight).toBe('')
    expect(el.style.overflow).toBe('')
  })

  it('slide hide collapses maxHeight with hidden overflow', () => {
    const el = new FakeEl()
    slide(el, false)
    expect(el.style.maxHeight).toBe('0px')
    expect(el.style.overflow).toBe('hidden')
    expect(el.style.display).toBe('none')
  })

  it('cssTransition show applies visible class and duration', () => {
    const el = new FakeEl()
    cssTransition(el, 'fade', true, 300)
    expect(el.has('fade-visible')).toBe(true)
    expect(el.has('fade-hidden')).toBe(false)
    expect(el.style.transitionDuration).toBe('300ms')
  })

  it('cssTransition hide reverses the class protocol', () => {
    const el = new FakeEl()
    cssTransition(el, 'fade', true)
    cssTransition(el, 'fade', false)
    expect(el.has('fade-hidden')).toBe(true)
    expect(el.has('fade-visible')).toBe(false)
  })

  it('helpers default to 200ms duration', () => {
    const el = new FakeEl()
    fade(el, true)
    expect(el.style.transitionDuration).toBe('200ms')
    slide(el, true)
    expect(el.style.transitionDuration).toBe('200ms')
  })

  it('prefersReducedMotion is false without window/matchMedia', () => {
    expect(prefersReducedMotion()).toBe(false)
  })
})
