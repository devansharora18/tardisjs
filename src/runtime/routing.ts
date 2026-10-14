export type GuardFn = (
	to: string,
	from: string,
) => boolean | string | void | Promise<boolean | string | void>

export interface RedirectRule {
	from: string
	to: string
}

// Decode one component, keeping raw text when malformed.
function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s)
	} catch {
		return s
	}
}

// Strip query string and hash fragment.
function stripQueryHash(s: string): string {
	const q = s.indexOf('?')
	const h = s.indexOf('#')
	let end = s.length
	if (q >= 0) end = Math.min(end, q)
	if (h >= 0) end = Math.min(end, h)
	return s.slice(0, end)
}

function splitRouteSegments(s: string): string[] {
	// NOTE: do not strip '?' here — ':param?' uses it as the optional marker.
	const hashIdx = s.indexOf('#')
	const clean = hashIdx >= 0 ? s.slice(0, hashIdx) : s
	if (clean === '' || clean === '/') return []
	return clean.split('/').filter(Boolean)
}

function splitSegments(s: string): string[] {
	const clean = stripQueryHash(s)
	if (clean === '' || clean === '/') return []
	return clean.split('/').filter(Boolean)
}

export function parseQuery(search: string): Record<string, string | string[]> {
	const out: Record<string, string | string[]> = {}
	let q = search
	if (q.startsWith('?')) q = q.slice(1)
	if (q === '') return out
	const pairs = q.split('&')
	for (const pair of pairs) {
		if (pair === '') continue
		const idx = pair.indexOf('=')
		let rawKey: string
		let rawVal: string
		if (idx < 0) {
			rawKey = pair
			rawVal = ''
		} else {
			rawKey = pair.slice(0, idx)
			rawVal = pair.slice(idx + 1)
		}
		const key = safeDecode(rawKey)
		const val = safeDecode(rawVal)
		const prev = out[key]
		if (prev === undefined) {
			out[key] = val
		} else if (Array.isArray(prev)) {
			prev.push(val)
		} else {
			out[key] = [prev, val]
		}
	}
	return out
}

export function stringifyQuery(
	params: Record<string, string | string[] | number | boolean>,
): string {
	const parts: string[] = []
	for (const key of Object.keys(params)) {
		const ek = encodeURIComponent(key)
		const val = params[key]
		const pushOne = (v: string | number | boolean): void => {
			const s = String(v)
			if (s === '') {
				parts.push(ek)
			} else {
				parts.push(`${ek}=${encodeURIComponent(s)}`)
			}
		}
		if (Array.isArray(val)) {
			for (const v of val) pushOne(v)
		} else {
			pushOne(val)
		}
	}
	if (parts.length === 0) return ''
	return `?${parts.join('&')}`
}

export function joinPaths(...parts: string[]): string {
	const leading = parts.length > 0 && parts[0].startsWith('/')
	const segs: string[] = []
	for (const p of parts) {
		for (const s of p.split('/')) {
			if (s !== '') segs.push(s)
		}
	}
	if (segs.length === 0) return '/'
	const joined = segs.join('/')
	return leading ? `/${joined}` : joined
}

export function matchPath(
	route: string,
	path: string,
): { matched: boolean; params: Record<string, string> } {
	const routeSegs = splitRouteSegments(route)
	const pathSegs = splitSegments(path)
	const params: Record<string, string> = {}
	let j = 0
	for (let i = 0; i < routeSegs.length; i++) {
		const r = routeSegs[i]
		if (r === '*') {
			params['*'] = safeDecode(pathSegs.slice(j).join('/'))
			return { matched: true, params }
		}
		if (r.startsWith(':')) {
			const optional = r.endsWith('?')
			const name = optional ? r.slice(1, -1) : r.slice(1)
			if (j >= pathSegs.length) {
				if (optional) continue
				return { matched: false, params: {} }
			}
			params[name] = safeDecode(pathSegs[j])
			j++
			continue
		}
		if (j >= pathSegs.length || r !== pathSegs[j]) {
			return { matched: false, params: {} }
		}
		j++
	}
	if (j !== pathSegs.length) return { matched: false, params: {} }
	return { matched: true, params }
}

function substituteTo(to: string, params: Record<string, string>): string {
	let out = to.replace(/:([A-Za-z0-9_]+)\?/g, (_, n: string) => params[n] ?? '')
	out = out.replace(/:([A-Za-z0-9_]+)/g, (_, n: string) => params[n] ?? '')
	if (params['*'] !== undefined) out = out.split('*').join(params['*'])
	return out
}

export function resolveRedirect(path: string, rules: RedirectRule[]): string {
	let current = path
	for (let hop = 0; hop < 10; hop++) {
		let next: string | null = null
		for (const rule of rules) {
			const m = matchPath(rule.from, current)
			if (m.matched) {
				next = substituteTo(rule.to, m.params)
				break
			}
		}
		if (next === null) return current
		current = next
	}
	return current
}

export function createGuards(): {
	addGuard: (fn: GuardFn) => () => void
	runGuards: (to: string, from: string) => Promise<true | string | false>
} {
	const guards: GuardFn[] = []
	function addGuard(fn: GuardFn): () => void {
		guards.push(fn)
		return () => {
			const idx = guards.indexOf(fn)
			if (idx >= 0) guards.splice(idx, 1)
		}
	}
	async function runGuards(to: string, from: string): Promise<true | string | false> {
		for (const fn of [...guards]) {
			let result: boolean | string | void
			try {
				result = await fn(to, from)
			} catch {
				return false
			}
			if (result === false) return false
			if (typeof result === 'string') return result
		}
		return true
	}
	return { addGuard, runGuards }
}

export function lazyRoute<T>(
	loader: () => Promise<T>,
	opts?: { timeout?: number },
): () => Promise<T> {
	let cached: Promise<T> | null = null
	return () => {
		if (cached) return cached
		let inner: Promise<T>
		try {
			inner = loader()
		} catch (e) {
			return Promise.reject(e)
		}
		let raced = inner
		if (opts?.timeout != null) {
			const ms = opts.timeout
			raced = new Promise<T>((resolve, reject) => {
				const t = setTimeout(() => reject(new Error('Route load timed out')), ms)
				inner.then(
					(v) => {
						clearTimeout(t)
						resolve(v)
					},
					(e) => {
						clearTimeout(t)
						reject(e)
					},
				)
			})
		}
		const tracked = raced.then(
			(v) => v,
			(e) => {
				cached = null
				throw e
			},
		)
		cached = tracked
		return tracked
	}
}

export function scrollToId(id: string): boolean {
	if (typeof document === 'undefined') return false
	const el = document.getElementById(id)
	if (!el) return false
	if (typeof el.scrollIntoView === 'function') el.scrollIntoView()
	return true
}
