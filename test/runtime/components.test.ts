// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  defineComponent,
  normalizeProps,
  validateProps,
  pushOwner,
  popOwner,
  provide,
  inject,
  renderSlot,
  lazyComponent,
  withErrorBoundary,
} from '../../src/runtime/components'
import { createState, $update } from '../../src/runtime/state'
import { flushMountCallbacks, flushDestroyCallbacks, clearEvents } from '../../src/runtime/events'

function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function div(text: string): HTMLElement {
  const el = document.createElement('div')
  el.textContent = text
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
  clearEvents()
})

// ────────────────────────────────────────────────────────────────────────────
// normalizeProps
// ────────────────────────────────────────────────────────────────────────────
describe('normalizeProps', () => {
  it('applies defaults for missing keys', () => {
    const { values, errors } = normalizeProps(
      { label: { default: 'hi' }, count: { type: 'number', default: 3 } },
      {}
    )
    expect(values).toMatchObject({ label: 'hi', count: 3 })
    expect(errors).toEqual([])
  })

  it('prefers provided values over defaults', () => {
    const { values } = normalizeProps({ label: { default: 'hi' } }, { label: 'yo' })
    expect(values.label).toBe('yo')
  })

  it('flags missing required props as errors without throwing', () => {
    let result: ReturnType<typeof normalizeProps> | undefined
    expect(() => {
      result = normalizeProps({ name: { type: 'string', required: true } }, {})
    }).not.toThrow()
    expect(result!.values.name).toBeUndefined()
    expect(result!.errors).toHaveLength(1)
    expect(result!.errors[0]).toMatch('name')
  })

  it('passes through undeclared keys and reports no errors when required is satisfied', () => {
    const { values, errors } = normalizeProps(
      { name: { type: 'string', required: true } },
      { name: 'ada', extra: 1 }
    )
    expect(values).toMatchObject({ name: 'ada', extra: 1 })
    expect(errors).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// validateProps
// ────────────────────────────────────────────────────────────────────────────
describe('validateProps', () => {
  it('returns no errors for valid values of every type', () => {
    const defs = {
      s: { type: 'string' as const },
      n: { type: 'number' as const },
      b: { type: 'boolean' as const },
      a: { type: 'array' as const },
      o: { type: 'object' as const },
      f: { type: 'function' as const },
    }
    const errors = validateProps(defs, {
      s: 'x', n: 1, b: false, a: [1], o: { k: 1 }, f: () => {},
    })
    expect(errors).toEqual([])
  })

  it('reports a type mismatch for each wrong-typed value', () => {
    const errors = validateProps(
      {
        s: { type: 'string' as const },
        n: { type: 'number' as const },
        b: { type: 'boolean' as const },
        a: { type: 'array' as const },
      },
      { s: 1, n: 'x', b: 'yes', a: {} }
    )
    expect(errors).toHaveLength(4)
    expect(errors.join(' ')).toMatch('s')
  })

  it('rejects null and arrays for object type', () => {
    expect(validateProps({ o: { type: 'object' as const } }, { o: null })).toHaveLength(1)
    expect(validateProps({ o: { type: 'object' as const } }, { o: [1] })).toHaveLength(1)
    expect(validateProps({ o: { type: 'object' as const } }, { o: { a: 1 } })).toEqual([])
  })

  it('accepts custom validate returning true and surfaces its string error', () => {
    const defs = { age: { type: 'number' as const, validate: (v: unknown) => ((v as number) >= 0 ? true : 'age must be >= 0') } }
    expect(validateProps(defs, { age: 5 })).toEqual([])
    expect(validateProps(defs, { age: -1 })).toEqual(['age must be >= 0'])
  })

  it('skips absent values instead of type-checking them', () => {
    expect(validateProps({ s: { type: 'string' as const } }, {})).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// provide / inject
// ────────────────────────────────────────────────────────────────────────────
describe('provide/inject', () => {
  it('provide throws a clear Error with no active owner', () => {
    expect(() => provide('k', 1)).toThrow(/no active component owner/)
  })

  it('inject returns undefined when absent and the fallback when given', () => {
    expect(inject('missing')).toBeUndefined()
    expect(inject('missing', 'fb')).toBe('fb')
  })

  it('a nested owner reads values provided by its parent', () => {
    pushOwner({ name: 'parent', provides: new Map() })
    try {
      provide('theme', 'dark')
      pushOwner({ name: 'child', provides: new Map() })
      try {
        expect(inject('theme')).toBe('dark')
      } finally {
        popOwner()
      }
    } finally {
      popOwner()
    }
  })

  it('the nearest owner wins when keys are shadowed', () => {
    pushOwner({ name: 'outer', provides: new Map([['k', 'outer']]) })
    try {
      pushOwner({ name: 'inner', provides: new Map([['k', 'inner']]) })
      try {
        expect(inject('k')).toBe('inner')
      } finally {
        popOwner()
      }
      expect(inject('k')).toBe('outer')
    } finally {
      popOwner()
    }
  })

  it('pop removes the owner so its values are no longer visible', () => {
    pushOwner({ name: 'temp', provides: new Map([['k', 'v']]) })
    popOwner()
    expect(inject('k', 'gone')).toBe('gone')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// renderSlot
// ────────────────────────────────────────────────────────────────────────────
describe('renderSlot', () => {
  it('calls the named slot function', () => {
    const node = renderSlot({ header: () => div('head') }, 'header')
    expect(node).toBeInstanceOf(HTMLElement)
    expect((node as HTMLElement).textContent).toBe('head')
  })

  it('uses the fallback when the slot is missing', () => {
    const node = renderSlot({}, 'header', () => div('fb'))
    expect((node as HTMLElement).textContent).toBe('fb')
  })

  it('returns a comment anchor when neither slot nor fallback exists', () => {
    const node = renderSlot({}, 'header')
    expect(node.nodeType).toBe(Node.COMMENT_NODE)
    expect((node as Comment).data).toBe('slot:header')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// lazyComponent
// ────────────────────────────────────────────────────────────────────────────
describe('lazyComponent', () => {
  it('shows the placeholder then swaps in real content on resolve', async () => {
    const Comp = lazyComponent(() => Promise.resolve(() => div('real')), () => div('loading'))
    const el = Comp()
    document.body.appendChild(el)
    expect(document.body.textContent).toBe('loading')
    await tick()
    expect(document.body.textContent).toBe('real')
  })

  it('uses a comment placeholder when no loading function is given', async () => {
    const Comp = lazyComponent(() => Promise.resolve(() => div('real')))
    const el = Comp()
    document.body.appendChild(el)
    expect(el.nodeType).toBe(Node.COMMENT_NODE)
    await tick()
    expect(document.body.textContent).toBe('real')
  })

  it('leaves the placeholder and logs on loader rejection without throwing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Comp = lazyComponent(() => Promise.reject(new Error('boom')), () => div('loading'))
    let el: HTMLElement | undefined
    expect(() => {
      el = Comp()
    }).not.toThrow()
    document.body.appendChild(el!)
    await tick()
    expect(document.body.textContent).toBe('loading')
    expect(errSpy).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('does not swap after the placeholder was removed from the DOM', async () => {
    let resolveLoader!: (c: (props?: Record<string, unknown>) => HTMLElement) => void
    const Comp = lazyComponent(() => new Promise(resolve => {
      resolveLoader = resolve
    }))
    const el = Comp()
    document.body.appendChild(el)
    el.remove()
    resolveLoader(() => div('late'))
    await tick()
    expect(document.body.innerHTML).toBe('')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// withErrorBoundary
// ────────────────────────────────────────────────────────────────────────────
describe('withErrorBoundary', () => {
  it('returns the element when fn does not throw', () => {
    const onError = vi.fn(() => div('fallback'))
    const el = withErrorBoundary(() => div('ok'), onError)
    expect(el.textContent).toBe('ok')
    expect(onError).not.toHaveBeenCalled()
  })

  it('renders the fallback and passes the error through on throw', () => {
    const boom = new Error('boom')
    let seen: unknown
    const el = withErrorBoundary(
      () => {
        throw boom
      },
      err => {
        seen = err
        return div('caught')
      }
    )
    expect(el.textContent).toBe('caught')
    expect(seen).toBe(boom)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// defineComponent
// ────────────────────────────────────────────────────────────────────────────
describe('defineComponent', () => {
  it('renders via setup returning an element with normalized props', () => {
    const Comp = defineComponent({
      name: 'Greet',
      props: { who: { type: 'string', default: 'world' } },
      setup: props => div(`hi ${props.who as string}`),
    })
    expect(Comp().textContent).toBe('hi world')
    expect(Comp({ who: 'ada' }).textContent).toBe('hi ada')
  })

  it('renders via setup returning a builder function', () => {
    const Comp = defineComponent({
      name: 'Built',
      setup: () => () => div('from-builder'),
    })
    const el = Comp()
    expect(el).toBeInstanceOf(HTMLElement)
    expect(el.textContent).toBe('from-builder')
  })

  it('exposes slots through the setup context', () => {
    const Comp = defineComponent({
      name: 'S',
      setup: (_props, ctx) => renderSlot(ctx.slots, 'main', () => div('empty')) as HTMLElement,
    })
    expect(Comp({}, { main: () => div('slotted') }).textContent).toBe('slotted')
    expect(Comp().textContent).toBe('empty')
  })

  it('supports provide/inject inside setup without throwing', () => {
    const Comp = defineComponent({
      name: 'P',
      setup: (_props, ctx) => {
        ctx.provide('k', 'v')
        return div(String(ctx.inject('k')))
      },
    })
    expect(Comp().textContent).toBe('v')
  })

  it('onMount callbacks run on flushMountCallbacks', () => {
    const calls: string[] = []
    const Comp = defineComponent({
      name: 'M',
      setup: (_props, ctx) => {
        ctx.onMount(() => calls.push('mounted'))
        return div('m')
      },
    })
    Comp()
    expect(calls).toEqual([])
    flushMountCallbacks()
    expect(calls).toEqual(['mounted'])
  })

  it('onDestroy callbacks run on flushDestroyCallbacks', () => {
    const calls: string[] = []
    const Comp = defineComponent({
      name: 'D',
      setup: (_props, ctx) => {
        ctx.onDestroy(() => calls.push('gone'))
        return div('d')
      },
    })
    Comp()
    flushDestroyCallbacks()
    expect(calls).toEqual(['gone'])
  })

  it('onUpdate listeners re-run on tracked state change without re-rendering', () => {
    const s = createState({ n: 0 })
    let updates = 0
    const Comp = defineComponent({
      name: 'U',
      setup: (_props, ctx) => {
        const el = div(`n=${s.n as number}`)
        ctx.onUpdate(() => updates++)
        return el
      },
    })
    const el = Comp()
    expect(updates).toBe(0)
    $update(s, 'n', 1)
    expect(updates).toBe(1)
    expect(el.textContent).toBe('n=0')
  })
})
