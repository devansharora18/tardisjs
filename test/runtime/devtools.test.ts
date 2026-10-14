import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
  connectDevtools, recordEvent, getHook,
  type DevtoolsHandle, type DevEvent,
} from '../../src/runtime/devtools'
import { register, clearRegistry } from '../../src/runtime/registry'

describe('devtools', () => {
  let h: DevtoolsHandle | null = null

  beforeEach(() => {
    clearRegistry()
  })

  afterEach(() => {
    h?.disconnect()
    h = null
    clearRegistry()
  })

  it('recordEvent is a no-op while disconnected', () => {
    expect(getHook().connected).toBe(false)
    recordEvent('mount', 'Ghost')
    h = connectDevtools()
    expect(h.events()).toEqual([])
  })

  it('captures events with increasing seq numbers', () => {
    h = connectDevtools()
    expect(getHook().connected).toBe(true)
    recordEvent('mount', 'App')
    recordEvent('update', 'App')
    const evts = h.events()
    expect(evts.length).toBe(2)
    expect(evts[1].seq).toBeGreaterThan(evts[0].seq)
    expect(evts[0].kind).toBe('mount')
    expect(evts[0].label).toBe('App')
    expect(typeof evts[0].at).toBe('number')
  })

  it('enforces the cap, dropping oldest first', () => {
    h = connectDevtools({ maxEvents: 3 })
    for (let i = 0; i < 5; i++) recordEvent('state', `s${i}`)
    const evts = h.events()
    expect(evts.length).toBe(3)
    expect(evts.map(e => e.label)).toEqual(['s2', 's3', 's4'])
  })

  it('subscribe notifies and the returned fn unsubscribes', () => {
    h = connectDevtools()
    const seen: DevEvent[] = []
    const unsub = h.subscribe(e => seen.push(e))
    recordEvent('route', '/home')
    expect(seen.length).toBe(1)
    expect(seen[0].label).toBe('/home')
    unsub()
    recordEvent('route', '/away')
    expect(seen.length).toBe(1)
  })

  it('a throwing subscriber does not break the others', () => {
    h = connectDevtools()
    const seen: string[] = []
    h.subscribe(() => { throw new Error('boom') })
    h.subscribe(e => seen.push(e.label))
    expect(() => recordEvent('error', 'oops')).not.toThrow()
    expect(seen).toEqual(['oops'])
  })

  it('disconnect clears the buffer and stops capture', () => {
    h = connectDevtools()
    recordEvent('mount', 'App')
    expect(h.events().length).toBe(1)
    h.disconnect()
    expect(getHook().connected).toBe(false)
    expect(h.events()).toEqual([])
    recordEvent('mount', 'Late')
    expect(h.events()).toEqual([])
  })

  it('tree() reflects live registry entries as flat roots', () => {
    h = connectDevtools()
    const id = register('TreeComp', {})
    recordEvent('mount', 'TreeComp')
    const found = h.tree().filter(n => n.id === id)
    expect(found.length).toBe(1)
    expect(found[0].name).toBe('TreeComp')
    expect(found[0].children).toEqual([])
    clearRegistry()
    expect(h.tree().filter(n => n.name === 'TreeComp')).toEqual([])
  })

  it('stores route/state/error kinds with labels and detail', () => {
    h = connectDevtools()
    recordEvent('route', '/about')
    recordEvent('state', 'count', { from: 0, to: 1 })
    recordEvent('error', 'crash', 'stack-ish')
    const evts = h.events()
    expect(evts.map(e => e.kind)).toEqual(['route', 'state', 'error'])
    expect(evts.map(e => e.label)).toEqual(['/about', 'count', 'crash'])
    expect(evts[1].detail).toEqual({ from: 0, to: 1 })
  })
})
