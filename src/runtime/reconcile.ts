// src/runtime/reconcile.ts
import { withEffect } from './state'

export function keyed<T>(
  arrayFn: () => T[],
  keyFn: (item: T, index: number) => string | number,
  builderFn: (item: T, index: number) => HTMLElement
): HTMLElement {
  const container = document.createElement('div')
  container.setAttribute('data-keyed', '')
  const nodeByKey = new Map<string | number, HTMLElement>()

  const render = (): void => {
    const items = withEffect(render, arrayFn)

    // Duplicate keys: last occurrence wins deterministically. Order follows
    // the last occurrence position; earlier duplicates are discarded. The
    // winning item/index pair is passed to builderFn for new keys.
    const resolved = new Map<string | number, { item: T; index: number }>()
    for (let i = 0; i < items.length; i++) {
      const k = keyFn(items[i], i)
      if (resolved.has(k)) resolved.delete(k)
      resolved.set(k, { item: items[i], index: i })
    }

    // Remove nodes whose keys vanished.
    for (const [k, node] of nodeByKey) {
      if (!resolved.has(k)) {
        node.remove()
        nodeByKey.delete(k)
      }
    }

    // Reuse kept nodes in place (moved via insertBefore), build new ones,
    // then enforce array order position by position.
    let pos = 0
    for (const [k, entry] of resolved) {
      let node = nodeByKey.get(k)
      if (!node) {
        node = builderFn(entry.item, entry.index)
        nodeByKey.set(k, node)
      }
      const anchor: Element | null = container.children[pos] ?? null
      if (anchor !== node) {
        // Already last child with nothing after it: no-op, skip the move.
        if (anchor === null && container.lastElementChild === node) {
          pos++
          continue
        }
        container.insertBefore(node, anchor)
      }
      pos++
    }
  }

  render()
  return container
}

export function fragment(children: (HTMLElement | Comment)[]): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const child of children) frag.appendChild(child)
  return frag
}

export function svg(tag: string, attrs?: Record<string, string | number>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  }
  return el
}

export function createRef<T extends HTMLElement = HTMLElement>(): { current: T | null } {
  return { current: null }
}

export function setRef<T extends HTMLElement>(
  ref: { current: T | null },
  el: T | null
): void {
  ref.current = el
}

// Thin insertBefore wrapper; a null anchor appends to the end.
export function moveChild(
  container: HTMLElement,
  child: HTMLElement,
  before: HTMLElement | null
): void {
  container.insertBefore(child, before)
}
