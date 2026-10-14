// src/runtime/http.ts

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface HttpRequest {
  url: string
  method?: HttpMethod
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
  retries?: number
  retryOn?: number[]
  cache?: 'none' | 'memory'
}

export interface HttpResponse<T = unknown> {
  ok: boolean
  status: number
  statusText: string
  data: T
  headers: Record<string, string>
}

export interface HttpInterceptor {
  onRequest?: (req: HttpRequest) => HttpRequest | Promise<HttpRequest>
  onResponse?: <T>(res: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>
  onError?: (err: Error, req: HttpRequest) => void
}

export interface HttpClientOptions {
  baseUrl?: string
  headers?: Record<string, string>
  timeout?: number
  retries?: number
  interceptors?: HttpInterceptor[]
}

const DEFAULT_RETRY_ON = [502, 503, 504]
const BACKOFF_BASE_MS = 100

function isAbsoluteUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url)
}

function joinUrl(base: string, path: string): string {
  if (!base) return path
  if (isAbsoluteUrl(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function hasContentType(headers: Record<string, string>): boolean {
  return Object.keys(headers).some(k => k.toLowerCase() === 'content-type')
}

function headersToRecord(h: unknown): Record<string, string> {
  if (!h) return {}
  if (typeof (h as Headers).forEach === 'function') {
    const out: Record<string, string> = {}
    ;(h as Headers).forEach((v, k) => { out[k] = v })
    return out
  }
  if (typeof h === 'object') return { ...(h as Record<string, string>) }
  return {}
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

export function createHttpClient(opts: HttpClientOptions = {}) {
  const interceptors: HttpInterceptor[] = [...(opts.interceptors ?? [])]
  const cache = new Map<string, HttpResponse<unknown>>()

  function cacheKey(method: string, url: string, body: unknown): string {
    const b = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)
    return `${method}:${url}:${b}`
  }

  function notifyError(err: Error, req: HttpRequest): void {
    for (const i of interceptors) {
      try { i.onError?.(err, req) } catch { /* observers never break the chain */ }
    }
  }

  async function request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    if (typeof fetch === 'undefined') throw new Error('fetch is not available in this environment')

    // Request interceptors run in registration order.
    let current: HttpRequest = { ...req }
    for (const i of interceptors) {
      if (i.onRequest) current = await i.onRequest(current)
    }

    const method = current.method ?? 'GET'
    const url = joinUrl(opts.baseUrl ?? '', current.url)
    const headers: Record<string, string> = { ...(opts.headers ?? {}), ...(current.headers ?? {}) }

    let fetchBody: string | undefined
    if (current.body !== undefined) {
      if (typeof current.body === 'string') fetchBody = current.body
      else {
        fetchBody = JSON.stringify(current.body)
        if (!hasContentType(headers)) headers['Content-Type'] = 'application/json'
      }
    }

    const cacheMode = current.cache ?? 'none'
    const key = cacheKey(method, url, current.body)
    if (cacheMode === 'memory' && method === 'GET' && cache.has(key)) {
      return cache.get(key) as HttpResponse<T>
    }

    const timeoutMs = current.timeout ?? opts.timeout
    const retries = current.retries ?? opts.retries ?? 0
    const retryOn = current.retryOn ?? DEFAULT_RETRY_ON
    const maxAttempts = retries + 1

    if (timeoutMs !== undefined && typeof AbortController === 'undefined') {
      throw new Error('AbortController is not available in this environment')
    }

    // Deterministic: fixed backoff 100ms * 2^attempt, no jitter.
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let signal: AbortSignal | undefined
      let controller: AbortController | undefined
      if (timeoutMs !== undefined) {
        controller = new AbortController()
        signal = controller.signal
        timer = setTimeout(() => controller!.abort(), timeoutMs)
      }
      try {
        const res = await fetch(url, { method, headers, body: fetchBody, signal })
        if (timer !== undefined) clearTimeout(timer)
        if (retryOn.includes(res.status) && attempt < maxAttempts - 1) {
          await sleep(BACKOFF_BASE_MS * 2 ** attempt)
          continue
        }
        const ok = typeof res.ok === 'boolean' ? res.ok : res.status >= 200 && res.status < 300
        // Invalid JSON resolves with data null (documented).
        let data: unknown = null
        try { data = await res.json() } catch { data = null }
        let out: HttpResponse<T> = {
          ok,
          status: res.status,
          statusText: res.statusText ?? '',
          data: data as T,
          headers: headersToRecord(res.headers),
        }
        // Response interceptors run in reverse order.
        for (let k = interceptors.length - 1; k >= 0; k--) {
          if (interceptors[k].onResponse) out = await interceptors[k].onResponse!<T>(out)
        }
        if (cacheMode === 'memory' && method === 'GET') cache.set(key, out as HttpResponse<unknown>)
        return out
      } catch (err) {
        if (timer !== undefined) clearTimeout(timer)
        if (attempt < maxAttempts - 1) {
          await sleep(BACKOFF_BASE_MS * 2 ** attempt)
          continue
        }
        const e = toError(err)
        notifyError(e, current)
        throw e
      }
    }
    throw new Error('Request failed without a response')
  }

  type ReqInit = Omit<HttpRequest, 'url' | 'method'>
  type BodyInit = Omit<HttpRequest, 'url' | 'method' | 'body'>

  return {
    request,
    get<T>(url: string, init?: ReqInit): Promise<HttpResponse<T>> {
      return request<T>({ ...init, url, method: 'GET' })
    },
    post<T>(url: string, body?: unknown, init?: BodyInit): Promise<HttpResponse<T>> {
      return request<T>({ ...init, url, method: 'POST', body })
    },
    put<T>(url: string, body?: unknown, init?: BodyInit): Promise<HttpResponse<T>> {
      return request<T>({ ...init, url, method: 'PUT', body })
    },
    patch<T>(url: string, body?: unknown, init?: BodyInit): Promise<HttpResponse<T>> {
      return request<T>({ ...init, url, method: 'PATCH', body })
    },
    delete<T>(url: string, init?: ReqInit): Promise<HttpResponse<T>> {
      return request<T>({ ...init, url, method: 'DELETE' })
    },
    addInterceptor(i: HttpInterceptor): () => void {
      interceptors.push(i)
      return () => {
        const idx = interceptors.indexOf(i)
        if (idx >= 0) interceptors.splice(idx, 1)
      }
    },
    clearCache(): void {
      cache.clear()
    },
  }
}
