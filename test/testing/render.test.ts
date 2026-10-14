// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { renderBlueprint } from '../../src/testing/render'
import type { RenderOptions } from '../../src/testing/render'
import { fireClick, fireInput, fireKey } from '../../src/testing/events'
import { isVisible, textOf, queryAll } from '../../src/testing/assertions'

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})

function render(source: string, opts?: RenderOptions) {
  const r = renderBlueprint(source, opts)
  cleanups.push(r.cleanup)
  return r
}

const COUNTER = `
blueprint Counter {
  state { count: number = 0 }
  computed { doubled: state.count * 2 }
  methods { increment: () => $update(state.count, state.count + 1) }
  ui {
    <div>
      <p class="count">{state.count}</p>
      <p class="doubled">{computed.doubled}</p>
      <button class="inc" @click={methods.increment}>+1</button>
    </div>
  }
}
`

const FORM = `
blueprint LoginForm {
  state {
    name: string = ""
    greeting: string = ""
  }
  methods {
    send: () => $update(state.greeting, state.name === "" ? "missing name" : "hello " + state.name)
  }
  ui {
    <div>
      <input class="name" value={state.name} @input={(e) => $update(state.name, e.target.value)} />
      <button class="send" @click={methods.send}>send</button>
      <p class="out">{state.greeting}</p>
    </div>
  }
}
`

const TOGGLER = `
blueprint Toggler {
  state { open: boolean = false }
  methods { toggle: () => $update(state.open, !state.open) }
  ui {
    <div>
      <button class="tgl" @click={methods.toggle}>toggle</button>
      $show(state.open) {
        <p class="secret">shown</p>
      }
    </div>
  }
}
`

const KEYBOX = `
blueprint KeyBox {
  state { last: string = "" }
  ui {
    <div>
      <input class="k" @keydown={(e) => $update(state.last, e.key)} />
      <p class="key-out">{state.last}</p>
    </div>
  }
}
`

const GREETER = `
blueprint Greeter {
  props { label: string = "hi" }
  ui { <h1 class="title">{props.label}</h1> }
}
`

const SEEDED = `
blueprint Seeded {
  state { ready: string = "no" }
  events { onMount: () => $update(state.ready, "yes") }
  ui { <p class="ready">{state.ready}</p> }
}
`

describe('renderBlueprint against real compiled blueprints', () => {
  it('exposes root, document, and window', () => {
    const r = render(COUNTER)
    expect(r.root).toBeInstanceOf(HTMLElement)
    expect(r.document).toBe(document)
    expect(r.window).toBe(window)
    expect(document.body.contains(r.root)).toBe(true)
  })

  it('counter increments state and recomputes on click', () => {
    const r = render(COUNTER)
    const count = () => textOf(queryAll(r.root, '.count')[0])
    const doubled = () => textOf(queryAll(r.root, '.doubled')[0])
    expect(count()).toBe('0')
    expect(doubled()).toBe('0')
    fireClick(queryAll(r.root, '.inc')[0])
    fireClick(queryAll(r.root, '.inc')[0])
    expect(count()).toBe('2')
    expect(doubled()).toBe('4')
  })

  it('form types a name and greets on send', () => {
    const r = render(FORM)
    fireInput(queryAll(r.root, '.name')[0], 'Ada')
    fireClick(queryAll(r.root, '.send')[0])
    expect(textOf(queryAll(r.root, '.out')[0])).toBe('hello Ada')
  })

  it('form reports a missing name', () => {
    const r = render(FORM)
    fireClick(queryAll(r.root, '.send')[0])
    expect(textOf(queryAll(r.root, '.out')[0])).toBe('missing name')
  })

  it('$show toggles visibility without unmounting', () => {
    const r = render(TOGGLER)
    const secret = () => queryAll(r.root, '.secret')[0]
    expect(isVisible(secret())).toBe(false)
    fireClick(queryAll(r.root, '.tgl')[0])
    expect(isVisible(secret())).toBe(true)
    expect(textOf(secret())).toBe('shown')
    fireClick(queryAll(r.root, '.tgl')[0])
    expect(isVisible(secret())).toBe(false)
  })

  it('keydown handler records the pressed key', () => {
    const r = render(KEYBOX)
    fireKey(queryAll(r.root, '.k')[0], 'Enter')
    expect(textOf(queryAll(r.root, '.key-out')[0])).toBe('Enter')
  })

  it('passes props through, falling back to defaults', () => {
    // Greeter's root IS the h1 — query the root itself, not its descendants
    const withDefault = render(GREETER)
    expect(textOf(withDefault.root)).toBe('hi')
    const withProp = render(GREETER, { props: { label: 'hey' } })
    expect(textOf(withProp.root)).toBe('hey')
  })

  it('flushes onMount callbacks during render', () => {
    const r = render(SEEDED)
    expect(textOf(r.root)).toBe('yes')
  })

  it('cleanup detaches the root from the document', () => {
    const r = renderBlueprint(COUNTER)
    expect(document.body.contains(r.root)).toBe(true)
    r.cleanup()
    expect(document.body.contains(r.root)).toBe(false)
  })
})
