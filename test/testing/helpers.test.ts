// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mountHtml, flushAll } from '../../src/testing/render'
import { fireClick, fireInput, fireKey, tick } from '../../src/testing/events'
import { isVisible, textOf, queryAll } from '../../src/testing/assertions'
import { registerEvents } from '../../src/runtime/events'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

function mount(html: string) {
  const m = mountHtml(html)
  cleanups.push(m.cleanup)
  return m
}

describe('events', () => {
  it('fireClick dispatches a bubbling click listener', () => {
    const m = mount(`<div><button class="b">go</button></div>`)
    let calls = 0
    m.container.querySelector('.b')!.addEventListener('click', () => calls++)
    fireClick(m.container.querySelector('.b')!)
    fireClick(m.container.querySelector('.b')!)
    expect(calls).toBe(2)
  })

  it('fireClick bubbles to ancestors', () => {
    const m = mount(`<div class="wrap"><button class="b">go</button></div>`)
    let bubbled = 0
    m.container.querySelector('.wrap')!.addEventListener('click', () => bubbled++)
    fireClick(m.container.querySelector('.b')!)
    expect(bubbled).toBe(1)
  })

  it('fireInput sets the value and fires an input listener', () => {
    const m = mount(`<div><input class="n" value="" /></div>`)
    const input = m.container.querySelector('.n') as HTMLInputElement
    let seen = ''
    input.addEventListener('input', () => {
      seen = input.value
    })
    fireInput(input, 'Ada')
    expect(input.value).toBe('Ada')
    expect(seen).toBe('Ada')
  })

  it('fireInput works on textareas', () => {
    const m = mount(`<div><textarea class="t"></textarea></div>`)
    const area = m.container.querySelector('.t') as HTMLTextAreaElement
    fireInput(area, 'hello')
    expect(area.value).toBe('hello')
  })

  it('fireKey delivers the key to a keydown listener', () => {
    const m = mount(`<div><input class="k" /></div>`)
    const input = m.container.querySelector('.k')!
    let key = ''
    input.addEventListener('keydown', (e) => {
      key = (e as KeyboardEvent).key
    })
    fireKey(input, 'Enter')
    expect(key).toBe('Enter')
  })

  it('tick resolves and flushes pending microtasks', async () => {
    let done = false
    void Promise.resolve().then(() => {
      done = true
    })
    await tick()
    expect(done).toBe(true)
  })
})

describe('assertions', () => {
  it('isVisible is true for plain elements', () => {
    const m = mount(`<div><p class="a">x</p></div>`)
    expect(isVisible(m.container.querySelector('.a') as HTMLElement)).toBe(true)
  })

  it('isVisible is false for display:none elements', () => {
    const m = mount(`<div><p class="a" style="display: none">x</p></div>`)
    expect(isVisible(m.container.querySelector('.a') as HTMLElement)).toBe(false)
  })

  it('isVisible is false when an ancestor is hidden', () => {
    const m = mount(`<div class="p" style="display: none"><p class="a">x</p></div>`)
    expect(isVisible(m.container.querySelector('.a') as HTMLElement)).toBe(false)
  })

  it('textOf returns trimmed text and empty string for null', () => {
    const m = mount(`<div><p class="a">  hello  </p></div>`)
    expect(textOf(m.container.querySelector('.a'))).toBe('hello')
    expect(textOf(null)).toBe('')
    expect(textOf(undefined)).toBe('')
  })

  it('queryAll returns matching elements as an array', () => {
    const m = mount(`<ul><li class="i">a</li><li class="i">b</li></ul>`)
    const items = queryAll(m.container, '.i')
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBe(2)
    expect(items[0]).toBeInstanceOf(HTMLElement)
    expect(items.map((e) => textOf(e))).toEqual(['a', 'b'])
  })
})

describe('mountHtml and flushAll', () => {
  it('mountHtml attaches to the document and cleanup detaches', () => {
    const m = mountHtml(`<p class="x">hi</p>`)
    try {
      expect(document.body.contains(m.container)).toBe(true)
      expect(textOf(m.container.querySelector('.x'))).toBe('hi')
    } finally {
      m.cleanup()
    }
    expect(document.body.contains(m.container)).toBe(false)
  })

  it('flushAll runs mount, update, and destroy callbacks', () => {
    const seen: string[] = []
    const dispose = registerEvents({
      onMount: () => seen.push('mount'),
      onUpdate: () => seen.push('update'),
      onDestroy: () => seen.push('destroy'),
    })
    try {
      flushAll()
    } finally {
      dispose()
    }
    expect(seen).toEqual(['mount', 'update', 'destroy'])
  })
})
