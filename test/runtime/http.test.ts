import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHttpClient } from '../../src/runtime/http'

function mockJson(data: unknown, init: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    json: () => Promise.resolve(data),
    ...init,
  }
}

describe('http client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function fetchMock() {
    return globalThis.fetch as ReturnType<typeof vi.fn>
  }

  it('sends each HTTP method via request()', async () => {
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      fetchMock().mockResolvedValueOnce(mockJson({}))
      const c = createHttpClient()
      await c.request({ url: '/x', method: m })
      expect(fetchMock().mock.calls.at(-1)?.[1].method).toBe(m)
    }
    expect(fetchMock()).toHaveBeenCalledTimes(5)
  })

  it('joins baseUrl without double slashes', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient({ baseUrl: 'https://api.example.com/' })
    await c.request({ url: '/users' })
    expect(fetchMock().mock.calls[0][0]).toBe('https://api.example.com/users')
    await c.request({ url: 'users' })
    expect(fetchMock().mock.calls[1][0]).toBe('https://api.example.com/users')
  })

  it('joins baseUrl when neither side has a slash', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient({ baseUrl: 'https://api.example.com' })
    await c.get('/a')
    expect(fetchMock().mock.calls[0][0]).toBe('https://api.example.com/a')
  })

  it('leaves absolute urls untouched', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient({ baseUrl: 'https://api.example.com' })
    await c.request({ url: 'https://other.com/x' })
    expect(fetchMock().mock.calls[0][0]).toBe('https://other.com/x')
  })

  it('merges base and per-request headers, per-request wins', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient({ headers: { 'X-Base': '1', 'X-Over': 'base' } })
    await c.request({ url: '/x', headers: { 'X-Over': 'req', 'X-Req': '2' } })
    expect(fetchMock().mock.calls[0][1].headers).toMatchObject({
      'X-Base': '1', 'X-Over': 'req', 'X-Req': '2',
    })
  })

  it('auto-stringifies JSON body with default content-type', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient()
    await c.request({ url: '/x', method: 'POST', body: { a: 1 } })
    const [, opts] = fetchMock().mock.calls[0]
    expect(opts.body).toBe(JSON.stringify({ a: 1 }))
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('does not override an explicit content-type', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient()
    await c.request({ url: '/x', method: 'POST', body: { a: 1 }, headers: { 'Content-Type': 'text/plain' } })
    const [, opts] = fetchMock().mock.calls[0]
    expect(opts.headers['Content-Type']).toBe('text/plain')
  })

  it('passes string bodies through untouched', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient()
    await c.request({ url: '/x', method: 'POST', body: 'raw' })
    expect(fetchMock().mock.calls[0][1].body).toBe('raw')
  })

  it('aborts on timeout with a tiny timeout and never-resolving fetch', async () => {
    fetchMock().mockImplementation((_u: string, o: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => {
        o?.signal?.addEventListener('abort', () => rej(new Error('Aborted')))
      })
    )
    const c = createHttpClient({ timeout: 10 })
    await expect(c.get('/slow')).rejects.toThrow()
  })

  it('retries network errors up to the retry count then succeeds', async () => {
    fetchMock()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(mockJson({ ok: true }))
    const c = createHttpClient()
    const res = await c.request({ url: '/x', retries: 2 })
    expect(res.data).toEqual({ ok: true })
    expect(fetchMock()).toHaveBeenCalledTimes(3)
  })

  it('retries retryOn statuses (503) and succeeds', async () => {
    fetchMock()
      .mockResolvedValueOnce(mockJson({}, { ok: false, status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(mockJson({ ok: true }))
    const c = createHttpClient()
    const res = await c.request({ url: '/x', retries: 1 })
    expect(fetchMock()).toHaveBeenCalledTimes(2)
    expect(res.data).toEqual({ ok: true })
  })

  it('throws after exhausting retries on persistent network errors', async () => {
    fetchMock().mockRejectedValue(new Error('down'))
    const c = createHttpClient()
    await expect(c.request({ url: '/x', retries: 1 })).rejects.toThrow('down')
    expect(fetchMock()).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 400', async () => {
    fetchMock().mockResolvedValueOnce(mockJson(null, { ok: false, status: 400, statusText: 'Bad Request' }))
    const c = createHttpClient()
    const res = await c.request({ url: '/x', retries: 3 })
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(400)
  })

  it('resolves ok:false without throwing on non-retryable non-2xx', async () => {
    fetchMock().mockResolvedValueOnce(mockJson(null, { ok: false, status: 404, statusText: 'Not Found' }))
    const c = createHttpClient()
    const res = await c.get('/missing')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
    expect(res.statusText).toBe('Not Found')
  })

  it('caches GET with memory cache and clearCache resets', async () => {
    fetchMock().mockResolvedValue(mockJson({ n: 1 }))
    const c = createHttpClient()
    await c.get('/cached', { cache: 'memory' })
    await c.get('/cached', { cache: 'memory' })
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    c.clearCache()
    await c.get('/cached', { cache: 'memory' })
    expect(fetchMock()).toHaveBeenCalledTimes(2)
  })

  it('does not cache without cache:memory', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient()
    await c.get('/x')
    await c.get('/x')
    expect(fetchMock()).toHaveBeenCalledTimes(2)
  })

  it('runs request interceptors in order and applies mutations', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient()
    const order: string[] = []
    c.addInterceptor({ onRequest: req => { order.push('first'); return { ...req, headers: { ...req.headers, 'X-A': '1' } } } })
    c.addInterceptor({ onRequest: req => { order.push('second'); return req } })
    await c.get('/x')
    expect(order).toEqual(['first', 'second'])
    expect(fetchMock().mock.calls[0][1].headers['X-A']).toBe('1')
  })

  it('runs response interceptors in reverse order', async () => {
    fetchMock().mockResolvedValue(mockJson({ v: 1 }))
    const c = createHttpClient()
    const order: string[] = []
    c.addInterceptor({ onResponse: res => { order.push('first'); return res } })
    c.addInterceptor({ onResponse: res => { order.push('second'); return res } })
    await c.get('/x')
    expect(order).toEqual(['second', 'first'])
  })

  it('addInterceptor returns a remover', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient()
    let calls = 0
    const remove = c.addInterceptor({ onRequest: req => { calls++; return req } })
    await c.get('/x')
    remove()
    await c.get('/x')
    expect(calls).toBe(1)
  })

  it('onError observer throwing does not break the chain', async () => {
    fetchMock().mockRejectedValue(new Error('boom'))
    const c = createHttpClient()
    const seen: string[] = []
    c.addInterceptor({ onError: () => { seen.push('bad'); throw new Error('observer blew up') } })
    c.addInterceptor({ onError: () => { seen.push('good') } })
    await expect(c.get('/x')).rejects.toThrow('boom')
    expect(seen).toEqual(['bad', 'good'])
  })

  it('sets data null on invalid JSON', async () => {
    fetchMock().mockResolvedValueOnce({
      ok: true, status: 200, statusText: 'OK', headers: {},
      json: () => Promise.reject(new Error('not json')),
    })
    const c = createHttpClient()
    const res = await c.get('/x')
    expect(res.ok).toBe(true)
    expect(res.data).toBeNull()
  })

  it('convenience helpers map to methods, urls, and bodies', async () => {
    fetchMock().mockResolvedValue(mockJson({}))
    const c = createHttpClient({ baseUrl: 'https://api.example.com' })
    await c.get('/a')
    await c.post('/b', { x: 1 })
    await c.put('/c', { x: 2 })
    await c.patch('/d', { x: 3 })
    await c.delete('/e')
    const calls = fetchMock().mock.calls
    expect(calls.map(a => a[0])).toEqual([
      'https://api.example.com/a', 'https://api.example.com/b',
      'https://api.example.com/c', 'https://api.example.com/d',
      'https://api.example.com/e',
    ])
    expect(calls.map(a => a[1].method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
    expect(calls[1][1].body).toBe(JSON.stringify({ x: 1 }))
  })

  it('uses default retryOn [502,503,504] and honors custom retryOn', async () => {
    fetchMock().mockResolvedValueOnce(mockJson(null, { ok: false, status: 500, statusText: 'Err' }))
    const c = createHttpClient()
    await c.request({ url: '/x', retries: 2 })
    expect(fetchMock()).toHaveBeenCalledTimes(1)

    fetchMock().mockClear()
    fetchMock()
      .mockResolvedValueOnce(mockJson(null, { ok: false, status: 500, statusText: 'Err' }))
      .mockResolvedValueOnce(mockJson({ ok: true }))
    const res = await c.request({ url: '/x', retries: 1, retryOn: [500] })
    expect(fetchMock()).toHaveBeenCalledTimes(2)
    expect(res.data).toEqual({ ok: true })
  })
})
