// src/testing/events.ts
// DOM event helpers. Events are constructed from the element's own window
// (ownerDocument.defaultView), so they work under jsdom, a real browser, or
// per-test JSDOM instances — never from a stale cached window.

function viewOf(el: Element): Window & typeof globalThis {
  const w = el.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined
  if (w && typeof w.MouseEvent === 'function') return w
  return globalThis as unknown as Window & typeof globalThis
}

export function fireClick(el: Element): void {
  const w = viewOf(el)
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
}

export function fireInput(el: Element, value: string): void {
  ;(el as HTMLInputElement | HTMLTextAreaElement).value = value
  const w = viewOf(el)
  el.dispatchEvent(new w.Event('input', { bubbles: true, cancelable: true }))
}

export function fireKey(el: Element, key: string): void {
  const w = viewOf(el)
  el.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

// tick waits out real timers/microtasks. With fake timers, use
// vi.advanceTimersByTime directly instead.
export function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
