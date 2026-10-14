import { describe, it, expect } from 'vitest'

import { createStore } from '../../src/runtime/store'
import { withEffect } from '../../src/runtime/state'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItem: (k: string): string | null => data.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      data.set(k, v)
    },
  }
}

describe('store', () => {
  it('exposes reactive state that UI-style withEffect bindings track', () => {
    const store = createStore({
      state: { count: 0 },
      actions: {
        inc: ctx => ctx.set({ count: ctx.state.count + 1 }),
      },
    })
    let observed = -1
    const effect = (): void => {
      observed = withEffect(effect, () => store.state.count)
    }
    observed = withEffect(effect, () => store.state.count)
    expect(observed).toBe(0)
    store.call('inc')
    expect(observed).toBe(1)
  })

  it('getters derive values from state', () => {
    const store = createStore({
      state: { count: 2, label: 'hi' },
      getters: {
        double: s => s.count * 2,
        greeting: s => `${s.label} (${s.count})`,
      },
    })
    expect(store.get('double')).toBe(4)
    expect(store.get('greeting')).toBe('hi (2)')
  })

  it('getters stay reactive when read inside withEffect', () => {
    const store = createStore({
      state: { count: 1 },
      getters: { double: s => s.count * 2 },
      actions: {
        inc: ctx => ctx.set({ count: ctx.state.count + 1 }),
      },
    })
    let seen: unknown = null
    const effect = (): void => {
      seen = withEffect(effect, () => store.get('double'))
    }
    seen = withEffect(effect, () => store.get('double'))
    expect(seen).toBe(2)
    store.call('inc')
    expect(seen).toBe(4)
  })

  it('call runs actions and returns their value', () => {
    const store = createStore({
      state: { n: 3 },
      actions: {
        add: (ctx, amount: unknown) => {
          ctx.set({ n: ctx.state.n + (amount as number) })
          return ctx.state.n
        },
      },
    })
    expect(store.call('add', 4)).toBe(7)
    expect(store.state.n).toBe(7)
  })

  it('ctx.set applies a partial patch key by key', () => {
    const store = createStore({
      state: { a: 0, b: 'x' },
      actions: {
        patch: ctx => ctx.set({ a: 9 }),
      },
    })
    store.call('patch')
    expect(store.state.a).toBe(9)
    expect(store.state.b).toBe('x')
  })

  it('ctx.get reads getters from inside actions', () => {
    const store = createStore({
      state: { count: 5 },
      getters: { double: s => s.count * 2 },
      actions: {
        describe: ctx => `count=${ctx.state.count} double=${ctx.get('double') as number}`,
      },
    })
    expect(store.call('describe')).toBe('count=5 double=10')
  })

  it('ctx.reset restores state from inside actions', () => {
    const store = createStore({
      state: { count: 0 },
      actions: {
        inc: ctx => ctx.set({ count: ctx.state.count + 1 }),
        resetAll: ctx => ctx.reset(),
      },
    })
    store.call('inc')
    store.call('inc')
    expect(store.state.count).toBe(2)
    store.call('resetAll')
    expect(store.state.count).toBe(0)
  })

  it('subscribe notifies with type and payload', () => {
    const store = createStore({
      state: { n: 0 },
      actions: {
        add: (ctx, amount: unknown) => ctx.set({ n: ctx.state.n + (amount as number) }),
      },
    })
    const seen: { type: string; payload: unknown[] }[] = []
    store.subscribe(m => seen.push({ type: m.type, payload: [...m.payload] }))
    store.call('add', 3)
    expect(seen).toEqual([{ type: 'add', payload: [3] }])
  })

  it('unsubscribe stops notifications', () => {
    const store = createStore({
      state: { n: 0 },
      actions: { inc: ctx => ctx.set({ n: ctx.state.n + 1 }) },
    })
    const seen: string[] = []
    const unsub = store.subscribe(m => seen.push(m.type))
    store.call('inc')
    unsub()
    store.call('inc')
    expect(seen).toEqual(['inc'])
    expect(store.state.n).toBe(2)
  })

  it('reset restores initial state and notifies reset', () => {
    const store = createStore({
      state: { count: 0, label: 'a' },
      actions: { inc: ctx => ctx.set({ count: ctx.state.count + 1 }) },
    })
    const seen: { type: string; payload: unknown[] }[] = []
    store.subscribe(m => seen.push({ type: m.type, payload: m.payload }))
    store.call('inc')
    store.reset()
    expect(store.state.count).toBe(0)
    expect(store.state.label).toBe('a')
    expect(seen.at(-1)).toEqual({ type: 'reset', payload: [] })
  })

  it('reset deep-clones nested objects without sharing references', () => {
    const initialUser = { name: 'ada', tags: ['x'] }
    const store = createStore({
      state: { user: initialUser, count: 0 },
      actions: {
        rename: (ctx, name: unknown) =>
          ctx.set({ user: { name: name as string, tags: [] } }),
      },
    })
    // Live state must not share nested references with the input object.
    expect(store.state.user).not.toBe(initialUser)
    expect(store.state.user).toEqual(initialUser)

    store.call('rename', 'grace')
    expect(store.state.user).toEqual({ name: 'grace', tags: [] })

    const beforeReset = store.state.user
    store.reset()
    expect(store.state.user).toEqual(initialUser)
    expect(store.state.user).not.toBe(beforeReset)
    expect(store.state.user).not.toBe(initialUser)

    // In-place nested mutation must not corrupt the baseline for next reset.
    store.state.user.name = 'mutated'
    store.reset()
    expect(store.state.user).toEqual(initialUser)
  })

  it('persists state across stores through the same storage', () => {
    const storage = memoryStorage()
    const a = createStore({
      state: { count: 0, label: 'a' },
      actions: { inc: ctx => ctx.set({ count: ctx.state.count + 1 }) },
      persist: { key: 'app', storage },
    })
    a.call('inc')
    a.call('inc')
    expect(JSON.parse(storage.data.get('app') as string)).toEqual({ count: 2, label: 'a' })

    const b = createStore({
      state: { count: 0, label: 'a' },
      persist: { key: 'app', storage },
    })
    expect(b.state.count).toBe(2)
    expect(b.state.label).toBe('a')
  })

  it('persists the reset state as well', () => {
    const storage = memoryStorage()
    const store = createStore({
      state: { count: 0 },
      actions: { inc: ctx => ctx.set({ count: ctx.state.count + 1 }) },
      persist: { key: 'app', storage },
    })
    store.call('inc')
    expect(JSON.parse(storage.data.get('app') as string)).toEqual({ count: 1 })
    store.reset()
    expect(JSON.parse(storage.data.get('app') as string)).toEqual({ count: 0 })
  })

  it('ignores corrupt stored JSON', () => {
    const storage = memoryStorage({ app: 'not-json{{{' })
    const store = createStore({
      state: { count: 7 },
      persist: { key: 'app', storage },
    })
    expect(store.state.count).toBe(7)
  })

  it('throws on unknown getter and action names', () => {
    const store = createStore({ state: { count: 0 } })
    expect(() => store.get('nope')).toThrow('Unknown getter/action: nope')
    expect(() => store.call('nope')).toThrow('Unknown getter/action: nope')
  })

  it('does not notify or persist when an action throws', () => {
    const storage = memoryStorage()
    const store = createStore({
      state: { count: 0 },
      actions: {
        boom: () => {
          throw new Error('kaboom')
        },
      },
      persist: { key: 'app', storage },
    })
    const seen: string[] = []
    store.subscribe(m => seen.push(m.type))
    expect(() => store.call('boom')).toThrow('kaboom')
    expect(seen).toEqual([])
    expect(storage.data.has('app')).toBe(false)
  })

  it('works with no getters, actions, or persist options', () => {
    const store = createStore({ state: { on: false, n: 0 } })
    expect(store.state.on).toBe(false)
    expect(() => store.get('x')).toThrow('Unknown getter/action')
    expect(() => store.call('x')).toThrow('Unknown getter/action')
    const seen: string[] = []
    const unsub = store.subscribe(m => seen.push(m.type))
    store.reset()
    expect(seen).toEqual(['reset'])
    unsub()
  })

  it('isolates a throwing subscriber from the remaining subscribers', () => {
    const store = createStore({
      state: { n: 0 },
      actions: { inc: ctx => ctx.set({ n: ctx.state.n + 1 }) },
    })
    const order: string[] = []
    store.subscribe(() => {
      order.push('bad')
      throw new Error('listener blew up')
    })
    store.subscribe(m => {
      order.push(`good:${m.type}`)
    })
    store.call('inc')
    expect(order).toEqual(['bad', 'good:inc'])
    expect(store.state.n).toBe(1)
  })
})
