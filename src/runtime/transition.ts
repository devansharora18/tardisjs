// src/runtime/transition.ts

// Minimal structural element — no DOM globals, works with fakes in tests.
export type El = {
  classList: { add(...c: string[]): void; remove(...c: string[]): void }
  style: { [k: string]: string }
}

export function fade(el: El, show: boolean, ms = 200): void {
  el.style.transitionDuration = ms + 'ms'
  if (show) {
    el.style.display = ''
    el.style.opacity = '1'
  } else {
    el.style.opacity = '0'
    el.style.display = 'none'
  }
}

export function slide(el: El, show: boolean, ms = 200): void {
  el.style.transitionDuration = ms + 'ms'
  if (show) {
    el.style.display = ''
    el.style.maxHeight = ''
    el.style.overflow = ''
  } else {
    el.style.maxHeight = '0px'
    el.style.overflow = 'hidden'
    el.style.display = 'none'
  }
}

// Class protocol (deterministic, classes only — no reflow reads):
// on show: remove `${base}-hidden`, add `${base}-visible`;
// on hide: remove `${base}-visible`, add `${base}-hidden`;
// plus style.transitionDuration = ms + 'ms'.
export function cssTransition(el: El, base: string, show: boolean, ms = 200): void {
  el.style.transitionDuration = ms + 'ms'
  if (show) {
    el.classList.remove(base + '-hidden')
    el.classList.add(base + '-visible')
  } else {
    el.classList.remove(base + '-visible')
    el.classList.add(base + '-hidden')
  }
}

// Guarded: false when window/matchMedia is absent (SSR, node, tests).
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as {
    matchMedia?: (q: string) => { matches: boolean }
  }
  if (typeof w.matchMedia !== 'function') return false
  return w.matchMedia('(prefers-reduced-motion: reduce)').matches
}
