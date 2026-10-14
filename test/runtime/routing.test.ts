import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGuards,
  joinPaths,
  lazyRoute,
  matchPath,
  parseQuery,
  resolveRedirect,
  scrollToId,
  stringifyQuery,
} from '../../src/runtime/routing'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('parseQuery', () => {
  it('parses repeated keys into arrays and empty value', () => {
    expect(parseQuery('?a=1&a=2&b=')).toEqual({ a: ['1', '2'], b: '' })
  })

  it('works without leading ?', () => {
    expect(parseQuery('a=1')).toEqual({ a: '1' })
  })

  it('treats flag without = as empty string', () => {
    expect(parseQuery('?flag')).toEqual({ flag: '' })
    expect(parseQuery('?a&b=2')).toEqual({ a: '', b: '2' })
  })

  it('returns {} for empty input', () => {
    expect(parseQuery('')).toEqual({})
    expect(parseQuery('?')).toEqual({})
  })

  it('decodes components', () => {
    expect(parseQuery('?q=hello%20world')).toEqual({ q: 'hello world' })
  })

  it('keeps raw on malformed pairs', () => {
    expect(parseQuery('?a=%E0%A4%A')).toEqual({ a: '%E0%A4%A' })
    expect(parseQuery('?%E0%A4%A=1')).toEqual({ '%E0%A4%A': '1' })
  })

  it('splits on first = only', () => {
    expect(parseQuery('?a=b=c')).toEqual({ a: 'b=c' })
  })

  it('collects three repeats into array', () => {
    expect(parseQuery('?a=1&a=2&a=3')).toEqual({ a: ['1', '2', '3'] })
  })
})

describe('stringifyQuery', () => {
  it('returns empty string for empty params', () => {
    expect(stringifyQuery({})).toBe('')
  })

  it('emits bare key for empty values', () => {
    expect(stringifyQuery({ b: '' })).toBe('?b')
  })

  it('repeats array keys', () => {
    expect(stringifyQuery({ a: ['1', '2'] })).toBe('?a=1&a=2')
  })

  it('encodes keys and values', () => {
    expect(stringifyQuery({ q: 'hello world' })).toBe('?q=hello%20world')
  })

  it('stringifies numbers and booleans', () => {
    expect(stringifyQuery({ n: 42, t: true, f: false })).toBe('?n=42&t=true&f=false')
  })

  it('round-trips with parseQuery', () => {
    const original = { a: 'hello world', b: ['x', 'y&z'], c: '' as string }
    const s = stringifyQuery(original)
    expect(parseQuery(s)).toEqual(original)
  })
})

describe('joinPaths', () => {
  it('joins with single slashes and preserves leading slash', () => {
    expect(joinPaths('/a/', '/b/', 'c/')).toBe('/a/b/c')
  })

  it('omits leading slash when first part is relative', () => {
    expect(joinPaths('a', 'b')).toBe('a/b')
  })

  it('strips trailing slash except root', () => {
    expect(joinPaths('/a/')).toBe('/a')
    expect(joinPaths('/')).toBe('/')
  })

  it('handles extra slashes', () => {
    expect(joinPaths('//a//', '//b//')).toBe('/a/b')
  })
})

describe('matchPath', () => {
  it('matches static segments', () => {
    expect(matchPath('/about', '/about')).toEqual({ matched: true, params: {} })
    expect(matchPath('/about', '/other')).toEqual({ matched: false, params: {} })
  })

  it('extracts and decodes params', () => {
    expect(matchPath('/users/:id', '/users/123')).toEqual({
      matched: true,
      params: { id: '123' },
    })
    expect(matchPath('/u/:name', '/u/hello%20world')).toEqual({
      matched: true,
      params: { name: 'hello world' },
    })
  })

  it('supports wildcard capturing rest including slashes', () => {
    expect(matchPath('/files/*', '/files/a/b/c')).toEqual({
      matched: true,
      params: { '*': 'a/b/c' },
    })
  })

  it('supports optional params present and absent', () => {
    expect(matchPath('/users/:id?', '/users')).toEqual({ matched: true, params: {} })
    expect(matchPath('/users/:id?', '/users/123')).toEqual({
      matched: true,
      params: { id: '123' },
    })
  })

  it('ignores query and hash in path', () => {
    expect(matchPath('/users/:id', '/users/123?foo=bar#sec')).toEqual({
      matched: true,
      params: { id: '123' },
    })
  })

  it('is trailing-slash tolerant', () => {
    expect(matchPath('/users', '/users/').matched).toBe(true)
    expect(matchPath('/users/', '/users').matched).toBe(true)
  })

  it('rejects length mismatches and static mismatches', () => {
    expect(matchPath('/a/b', '/a').matched).toBe(false)
    expect(matchPath('/a', '/a/b').matched).toBe(false)
  })

  it('matches root', () => {
    expect(matchPath('/', '/')).toEqual({ matched: true, params: {} })
  })
})

describe('resolveRedirect', () => {
  it('substitutes params into to', () => {
    expect(resolveRedirect('/old/123', [{ from: '/old/:id', to: '/new/:id' }])).toBe(
      '/new/123',
    )
  })

  it('first matching rule wins', () => {
    const rules = [
      { from: '/a', to: '/first' },
      { from: '/a', to: '/second' },
    ]
    expect(resolveRedirect('/a', rules)).toBe('/first')
  })

  it('returns path unchanged when no rule matches', () => {
    expect(resolveRedirect('/nomatch', [{ from: '/a', to: '/b' }])).toBe('/nomatch')
  })

  it('follows chained redirects', () => {
    const rules = [
      { from: '/a', to: '/b' },
      { from: '/b', to: '/c' },
    ]
    expect(resolveRedirect('/a', rules)).toBe('/c')
  })

  it('guards redirect loops after 10 hops', () => {
    const rules = [
      { from: '/a', to: '/b' },
      { from: '/b', to: '/a' },
    ]
    // 10 hops starting at /a ends back at /a
    expect(resolveRedirect('/a', rules)).toBe('/a')
  })
})

describe('createGuards', () => {
  it('returns true when no guards', async () => {
    const g = createGuards()
    await expect(g.runGuards('/a', '/')).resolves.toBe(true)
  })

  it('continues on void/true in order', async () => {
    const g = createGuards()
    const order: string[] = []
    g.addGuard(() => {
      order.push('first')
    })
    g.addGuard(() => {
      order.push('second')
      return true
    })
    await expect(g.runGuards('/a', '/')).resolves.toBe(true)
    expect(order).toEqual(['first', 'second'])
  })

  it('first false aborts and skips later guards', async () => {
    const g = createGuards()
    const second = vi.fn()
    g.addGuard(() => false)
    g.addGuard(second)
    await expect(g.runGuards('/a', '/')).resolves.toBe(false)
    expect(second).not.toHaveBeenCalled()
  })

  it('first string redirects', async () => {
    const g = createGuards()
    const later = vi.fn()
    g.addGuard(() => '/login')
    g.addGuard(later)
    await expect(g.runGuards('/a', '/')).resolves.toBe('/login')
    expect(later).not.toHaveBeenCalled()
  })

  it('supports async guards', async () => {
    const g = createGuards()
    g.addGuard(async () => {
      await new Promise((r) => setTimeout(r, 5))
      return true
    })
    g.addGuard(async () => '/async-redirect')
    await expect(g.runGuards('/a', '/')).resolves.toBe('/async-redirect')
  })

  it('async throw aborts with false', async () => {
    const g = createGuards()
    g.addGuard(async () => {
      throw new Error('boom')
    })
    await expect(g.runGuards('/a', '/')).resolves.toBe(false)
  })

  it('sync throw aborts with false', async () => {
    const g = createGuards()
    g.addGuard(() => {
      throw new Error('sync')
    })
    await expect(g.runGuards('/a', '/')).resolves.toBe(false)
  })

  it('unsub removes the guard', async () => {
    const g = createGuards()
    const fn = vi.fn(() => false)
    const unsub = g.addGuard(fn)
    unsub()
    await expect(g.runGuards('/a', '/')).resolves.toBe(true)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('lazyRoute', () => {
  it('caches: loader runs once for multiple calls', async () => {
    const loader = vi.fn(async () => 'data')
    const load = lazyRoute(loader)
    await expect(load()).resolves.toBe('data')
    await expect(load()).resolves.toBe('data')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('concurrent callers share one promise', async () => {
    let calls = 0
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          calls++
          setTimeout(() => resolve('shared'), 20)
        }),
    )
    const load = lazyRoute(loader)
    const [a, b] = await Promise.all([load(), load()])
    expect(a).toBe('shared')
    expect(b).toBe('shared')
    expect(calls).toBe(1)
  })

  it('rejects with timeout error when exceeded', async () => {
    const loader = () => new Promise<string>(() => {})
    const load = lazyRoute(loader, { timeout: 10 })
    await expect(load()).rejects.toThrow('Route load timed out')
  })

  it('resolves before timeout', async () => {
    const loader = async () => 'fast'
    const load = lazyRoute(loader, { timeout: 500 })
    await expect(load()).resolves.toBe('fast')
  })

  it('drops cache on rejection so retry reloads', async () => {
    let n = 0
    const loader = vi.fn(async () => {
      n++
      if (n === 1) throw new Error('fail once')
      return 'ok'
    })
    const load = lazyRoute(loader)
    await expect(load()).rejects.toThrow('fail once')
    await expect(load()).resolves.toBe('ok')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('scrollToId', () => {
  it('returns false when element is missing', () => {
    vi.stubGlobal('document', { getElementById: () => null })
    expect(scrollToId('nope')).toBe(false)
  })

  it('returns true and calls scrollIntoView when found', () => {
    const scrollIntoView = vi.fn()
    vi.stubGlobal('document', { getElementById: () => ({ scrollIntoView }) })
    expect(scrollToId('sec')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('returns true even without scrollIntoView function', () => {
    vi.stubGlobal('document', { getElementById: () => ({}) })
    expect(scrollToId('sec')).toBe(true)
  })

  it('returns false with no document', () => {
    const realDoc = (globalThis as Record<string, unknown>).document
    try {
      // @ts-expect-error simulate SSR
      delete (globalThis as Record<string, unknown>).document
      expect(scrollToId('x')).toBe(false)
    } finally {
      if (realDoc !== undefined) (globalThis as Record<string, unknown>).document = realDoc
    }
  })
})
