// src/runtime/fetch.ts

type FetchMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface FetchChain {
  method(m: FetchMethod): FetchChain
  body(b: unknown): FetchChain
  headers(h: Record<string, string>): FetchChain
  done(fn: (data: unknown) => void): FetchChain
  fail(fn: (err: Error) => void): FetchChain
  always(fn: () => void): FetchChain
}

export function $fetch(url: string): FetchChain {
  let _method: FetchMethod = 'GET'
  let _body: unknown = undefined
  let _headers: Record<string, string> = {}
  let _done: ((data: unknown) => void) | null = null
  let _fail: ((err: Error) => void) | null = null
  let _always: (() => void) | null = null
  let _executed = false

  function execute() {
    if (_executed) return
    _executed = true

    const options: RequestInit = {
      method: _method,
      headers: {
        'Content-Type': 'application/json',
        ..._headers,
      },
    }

    if (_body !== undefined && _method !== 'GET') {
      options.body = JSON.stringify(_body)
    }

    fetch(url, options)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        return res.json()
      })
      .then(data => {
        _done?.(data)
      })
      .catch(err => {
        _fail?.(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        _always?.()
      })
  }

  const chain: FetchChain = {
    method(m) {
      _method = m
      return chain
    },
    body(b) {
      _body = b
      return chain
    },
    headers(h) {
      _headers = { ..._headers, ...h }
      return chain
    },
    done(fn) {
      _done = fn
      execute()
      return chain
    },
    fail(fn) {
      _fail = fn
      execute()
      return chain
    },
    always(fn) {
      _always = fn
      execute()
      return chain
    },
  }

  return chain
}