// src/runtime/a11y.ts
// DOM helpers over a minimal structural interface (no DOM globals at import).

export type A11yEl = {
  setAttribute(k: string, v: string): void
  removeAttribute(k: string): void
  getAttribute(k: string): string | null
  addEventListener(t: string, fn: (...a: never[]) => void): void
  removeEventListener?(t: string, fn: (...a: never[]) => void): void
  focus?(): void
}

type AnnounceDoc = {
  createElement(t: string): A11yEl & { textContent?: string }
  body?: { appendChild(e: unknown): void }
}

function globalDoc(): AnnounceDoc | undefined {
  const g = globalThis as unknown as { document?: AnnounceDoc }
  return g.document
}

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]'

interface Keyish {
  key?: string
  shiftKey?: boolean
  preventDefault?: () => void
}

// Trap Tab inside container; returns untrap. Uses live activeElement when a
// DOM is present, else cycles from the last focused position.
export function trapFocus(container: {
  querySelectorAll(s: string): ArrayLike<A11yEl>
  addEventListener(t: string, fn: (...a: never[]) => void): void
  removeEventListener?(t: string, fn: (...a: never[]) => void): void
}): () => void {
  let idx = 0
  const onKey = (...a: never[]): void => {
    const e = a[0] as unknown as Keyish | undefined
    if (!e || e.key !== 'Tab') return
    const list = Array.from(container.querySelectorAll(FOCUSABLE))
    if (list.length === 0) return
    const active = globalDoc() as unknown as { activeElement?: unknown } | undefined
    const at = active ? list.indexOf(active.activeElement as A11yEl) : -1
    const cur = at >= 0 ? at : idx
    idx = e.shiftKey ? (cur - 1 + list.length) % list.length : (cur + 1) % list.length
    if (e.preventDefault) e.preventDefault()
    const next = list[idx]
    if (next.focus) next.focus()
  }
  container.addEventListener('keydown', onKey)
  return () => {
    if (container.removeEventListener) container.removeEventListener('keydown', onKey)
  }
}

let liveDoc: unknown = null
let liveRegion: (A11yEl & { textContent?: string }) | null = null

// Write message into a reused aria-live region; no-op without a document.
export function announce(
  message: string,
  doc?: {
    createElement(t: string): A11yEl & { textContent?: string }
    body?: { appendChild(e: unknown): void }
  }
): void {
  const d = doc ?? globalDoc()
  if (!d) return
  if (!liveRegion || liveDoc !== d) {
    liveRegion = d.createElement('div')
    liveRegion.setAttribute('role', 'status')
    liveRegion.setAttribute('aria-live', 'polite')
    if (d.body) d.body.appendChild(liveRegion)
    liveDoc = d
  }
  liveRegion.textContent = message
}

export function setExpanded(el: A11yEl, expanded: boolean): void {
  el.setAttribute('aria-expanded', expanded ? 'true' : 'false')
}

export function setPressed(el: A11yEl, pressed: boolean): void {
  el.setAttribute('aria-pressed', pressed ? 'true' : 'false')
}

export function setSelected(el: A11yEl, selected: boolean): void {
  el.setAttribute('aria-selected', selected ? 'true' : 'false')
}

export function labelBy(el: A11yEl, id: string): void {
  el.setAttribute('aria-labelledby', id)
}

// Pure string builder; no DOM needed.
export function skipLink(targetId: string, label = 'Skip to content'): string {
  return `<a href="#${targetId}" class="skip-link">${label}</a>`
}
