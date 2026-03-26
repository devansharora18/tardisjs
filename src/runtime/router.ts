import { flushDestroyCallbacks } from './events'

export interface RouteDefinition {
	path: string
	component: () => HTMLElement
}

export interface Router {
	start: () => void
	navigate: (path: string, replace?: boolean) => void
	back: () => void
	forward: () => void
}

export const $params: Record<string, string> = {}

let activeRouter: Router | null = null

function normalizePath(path: string): string {
	if (!path) return '/'
	const [pathname] = path.split('?')
	const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
	if (normalized !== '/' && normalized.endsWith('/')) return normalized.slice(0, -1)
	return normalized
}

function splitPath(path: string): string[] {
	const normalized = normalizePath(path)
	if (normalized === '/') return []
	return normalized.slice(1).split('/').filter(Boolean)
}

function setParams(next: Record<string, string>): void {
	for (const key of Object.keys($params)) {
		delete $params[key]
	}
	Object.assign($params, next)
}

function matchRoute(
	routePath: string,
	currentPath: string
): { matched: boolean; params: Record<string, string> } {
	const routeParts = splitPath(routePath)
	const currentParts = splitPath(currentPath)

	if (routeParts.length !== currentParts.length) {
		return { matched: false, params: {} }
	}

	const params: Record<string, string> = {}

	for (let i = 0; i < routeParts.length; i++) {
		const routePart = routeParts[i]
		const currentPart = currentParts[i]

		if (routePart.startsWith(':')) {
			params[routePart.slice(1)] = decodeURIComponent(currentPart)
			continue
		}

		if (routePart !== currentPart) {
			return { matched: false, params: {} }
		}
	}

	return { matched: true, params }
}

function resolveRoute(
	routes: RouteDefinition[],
	path: string
): { route: RouteDefinition | null; params: Record<string, string> } {
	const normalized = normalizePath(path)

	for (const route of routes) {
		const result = matchRoute(route.path, normalized)
		if (result.matched) return { route, params: result.params }
	}

	return { route: null, params: {} }
}

export function createRouter(
	routes: RouteDefinition[],
	mountTarget?: HTMLElement
): Router {
	const target = mountTarget ?? document.getElementById('app') ?? document.body
	let currentNode: HTMLElement | null = null

	function render(path: string): void {
		const { route, params } = resolveRoute(routes, path)

		if (!route) {
			target.innerHTML = '<h1>404</h1>'
			setParams({})
			currentNode = null
			return
		}

		flushDestroyCallbacks()
		if (currentNode && currentNode.parentNode === target) {
			target.removeChild(currentNode)
		}

		const nextNode = route.component()
		currentNode = nextNode

		setParams(params)
		target.innerHTML = ''
		target.appendChild(nextNode)
	}

	function navigate(path: string, replace = false): void {
		const nextPath = normalizePath(path)
		if (replace) {
			window.history.replaceState({}, '', nextPath)
		} else {
			window.history.pushState({}, '', nextPath)
		}
		render(nextPath)
	}

	function back(): void {
		window.history.back()
	}

	function forward(): void {
		window.history.forward()
	}

	function handleLinkClick(event: MouseEvent): void {
		if (event.defaultPrevented) return
		if (event.button !== 0) return
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

		const targetEl = event.target as Element | null
		const anchor = targetEl?.closest('a[href]') as HTMLAnchorElement | null
		if (!anchor) return

		const href = anchor.getAttribute('href')
		if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return
		if (anchor.target && anchor.target !== '_self') return

		const nextPath = normalizePath(href)
		event.preventDefault()
		navigate(nextPath)
	}

	const router: Router = {
		start() {
			render(window.location.pathname)
			document.addEventListener('click', handleLinkClick)
			window.addEventListener('popstate', () => {
				render(window.location.pathname)
			})
			activeRouter = router
		},
		navigate,
		back,
		forward,
	}

	return router
}

export function $navigate(path: string): void {
	if (activeRouter) {
		activeRouter.navigate(path)
		return
	}
	const nextPath = normalizePath(path)
	window.history.pushState({}, '', nextPath)
}

export function $back(): void {
	if (activeRouter) {
		activeRouter.back()
		return
	}
	window.history.back()
}

export function $forward(): void {
	if (activeRouter) {
		activeRouter.forward()
		return
	}
	window.history.forward()
}

