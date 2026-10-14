// Server-side rendering: run a compiled component factory against the
// minimal DOM shim and serialize the result to an HTML string.
//
// Deterministic: same factory + same props always yield the same markup.
// Scripts never run here (requestAnimationFrame is collected, not fired),
// so output is pure markup — client enhancements apply on mount.

import {
  createMiniDocument,
  createMiniElement,
  MiniNodeBrand,
  type MiniDocument,
  type MiniElement,
  type MiniNode,
} from './dom'

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

function styleAttr(style: Record<string, string>): string {
  const entries = Object.entries(style).filter(([, v]) => v !== '' && v != null)
  if (entries.length === 0) return ''
  return entries.map(([k, v]) => `${k}: ${v}`).join('; ')
}

export function serializeNode(node: MiniNode): string {
  if (node.nodeType === 'text') {
    return escapeText(String((node as unknown as { textContent: string | null }).textContent ?? ''))
  }
  if (node.nodeType === 'comment') {
    return `<!--${String((node as unknown as { textContent: string | null }).textContent ?? '')}-->`
  }
  if (node.nodeType === 'fragment') {
    return (node as MiniElement).children.map(serializeNode).join('')
  }
  const el = node as MiniElement
  let attrs = ''
  if (el.className) attrs += ` class="${escapeAttr(el.className)}"`
  const style = styleAttr(el.style)
  if (style) attrs += ` style="${escapeAttr(style)}"`
  const merged: Record<string, string> = { ...el.attrs }
  for (const key of ['value', 'checked', 'selected', 'disabled']) {
    if (!Object.prototype.hasOwnProperty.call(el, key)) continue
    const current = (el as unknown as Record<string, unknown>)[key]
    // Defaults ('' / false) reflect nothing, exactly like real elements.
    if (current === false || current === null || current === undefined || current === '') {
      delete merged[key]
    } else if (current === true) {
      // Real serialization renders reflected booleans as empty-valued
      // attributes (checked=""), so match that exactly.
      merged[key] = ''
    } else {
      merged[key] = String(current)
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    attrs += ` ${key}="${escapeAttr(value)}"`
  }
  if (VOID_ELEMENTS.has(el.tag)) {
    return `<${el.tag}${attrs}>`
  }
  const text = el.textContent
  const inner = text !== null ? escapeText(text) : el.children.map(serializeNode).join('')
  return `<${el.tag}${attrs}>${inner}</${el.tag}>`
}

export type ComponentFactory = (props?: Record<string, unknown>) => unknown

export interface RenderOptions {
  props?: Record<string, unknown>
  // Factories for `$runtime.component` registry lookups, keyed by blueprint
  // name. Without them, nested components serialize as placeholders —
  // same as the client fallback when a factory is missing.
  components?: Record<string, ComponentFactory>
}

interface GlobalShim {
  document: MiniDocument
  window: Record<string, unknown>
  requestAnimationFrame: (fn: (...args: never[]) => void) => number
  Node: typeof MiniNodeBrand
}

// requestAnimationFrame callbacks are collected and never fired: scripts are
// client enhancements, and firing them during SSR could trigger network or
// timer side effects with no DOM to observe them.
function installGlobals(): { previous: Record<string, unknown>; shim: GlobalShim } {
  const g = globalThis as unknown as Record<string, unknown>
  const previous: Record<string, unknown> = {
    document: g['document'],
    window: g['window'],
    requestAnimationFrame: g['requestAnimationFrame'],
    Node: g['Node'],
  }
  const shim: GlobalShim = {
    document: createMiniDocument(),
    window: {},
    requestAnimationFrame: () => 0,
    Node: MiniNodeBrand,
  }
  g['document'] = shim.document
  g['window'] = shim.window
  g['requestAnimationFrame'] = shim.requestAnimationFrame
  g['Node'] = shim.Node
  return { previous, shim }
}

function restoreGlobals(previous: Record<string, unknown>): void {
  const g = globalThis as unknown as Record<string, unknown>
  for (const key of ['document', 'window', 'requestAnimationFrame', 'Node'] as const) {
    if (previous[key] === undefined) delete g[key]
    else g[key] = previous[key]
  }
}

export function renderToString(factory: ComponentFactory, opts: RenderOptions = {}): string {
  const { previous, shim } = installGlobals()
  try {
    // Bridge the registry option into the shim window: nested
    // `$runtime.component` calls resolve factories the same way as clients.
    for (const [name, fn] of Object.entries(opts.components ?? {})) {
      shim.window[`__tardis_${name}`] = fn
    }
    const root = factory(opts.props ?? {}) as MiniNode
    void shim
    return serializeNode(root)
  } finally {
    restoreGlobals(previous)
  }
}

export function renderDocumentShell(bodyHtml: string, opts: { title?: string; head?: string } = {}): string {
  const title = escapeText(opts.title ?? 'tardis app')
  const head = opts.head ?? ''
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<title>${title}</title>\n${head}\n</head>\n<body>\n<div id="app">${bodyHtml}</div>\n</body>\n</html>\n`
}

export { createMiniDocument, createMiniElement }
export type { MiniDocument, MiniElement, MiniNode }
