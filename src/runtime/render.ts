// src/runtime/render.ts

import { withEffect } from './state'

// ── $if ────────────────────────────────────────────────────────────────────

export function $if(
  conditionFn: () => boolean,
  builderFn: () => HTMLElement
): HTMLElement | Comment {
  const anchor = document.createComment('$if')
  let currentEl: HTMLElement | null = null
  let isMounted = conditionFn()

  function update() {
    const shouldShow = conditionFn()
    if (shouldShow && !isMounted) {
      currentEl = builderFn()
      anchor.parentNode?.insertBefore(currentEl, anchor)
      isMounted = true
    } else if (!shouldShow && isMounted && currentEl) {
      currentEl.parentNode?.removeChild(currentEl)
      currentEl = null
      isMounted = false
    }
  }

  // initial render
  if (isMounted) {
    currentEl = builderFn()
  }

  return currentEl ?? anchor
}

// ── $each ──────────────────────────────────────────────────────────────────

export function $each<T>(
  arrayFn: () => T[],
  itemBuilderFn: (item: T, index: number) => HTMLElement
): HTMLElement {
  const container = document.createElement('div')
  container.setAttribute('data-each', '')

  function render() {
    const items = arrayFn()
    // clear existing children
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }
    // render new children
    items.forEach((item, index) => {
      container.appendChild(itemBuilderFn(item, index))
    })
  }

  render()
  return container
}

// ── $show ──────────────────────────────────────────────────────────────────

export function $show(
  conditionFn: () => boolean,
  builderFn: () => HTMLElement
): HTMLElement {
  const el = builderFn()

  function update() {
    el.style.display = conditionFn() ? '' : 'none'
  }

  update()
  return el
}

// ── $portal ────────────────────────────────────────────────────────────────

export function $portal(
  selector: string,
  builderFn: () => HTMLElement
): HTMLElement {
  const target = document.querySelector(selector)
  const el = builderFn()

  if (target) {
    target.appendChild(el)
  } else {
    console.warn(`$portal: target "${selector}" not found`)
  }

  return el
}

// ── bind ───────────────────────────────────────────────────────────────────
// binds a DOM property to a reactive expression
// re-runs the expression and updates the DOM whenever state changes

export function bind(
  el: HTMLElement | Text,
  prop: string,
  valueFn: () => unknown
): void {
  function update() {
    const val = withEffect(update, valueFn)
    if (prop === 'textContent') {
      el.textContent = String(val ?? '')
    } else if (prop in el) {
      (el as unknown as Record<string, unknown>)[prop] = val
    }
  }

  // initial render
  update()

  // store updater for reactive re-runs
  // the compiled output will call registerDep to wire this up
  ;(el as unknown as { __update?: () => void }).__update = update
}

// ── bindClass ──────────────────────────────────────────────────────────────

export function bindClass(
  el: HTMLElement,
  classFn: () => string
): void {
  function update() {
    el.className = withEffect(update, classFn)
  }
  update()
  ;(el as unknown as { __updateClass?: () => void }).__updateClass = update
}

// ── bindAttr ───────────────────────────────────────────────────────────────

export function bindAttr(
  el: HTMLElement,
  attr: string,
  valueFn: () => unknown
): void {
  function update() {
    const val = withEffect(update, valueFn)
    if (val === null || val === undefined || val === false) {
      el.removeAttribute(attr)
    } else {
      el.setAttribute(attr, String(val))
    }
  }
  update()
  ;(el as unknown as Record<string, unknown>)[`__updateAttr_${attr}`] = update
}

// ── resolveStyles ──────────────────────────────────────────────────────────

export function resolveStyles(
  styles: Record<string, string>,
  key: string
): string {
  return styles[key] ?? key
}

// ── text ───────────────────────────────────────────────────────────────────

export function text(value: string | (() => string)): Text {
  const node = document.createTextNode('')
  if (typeof value === 'function') {
    const valueFn = value
    function update() { node.textContent = withEffect(update, valueFn) }
    update()
    ;(node as unknown as { __update?: () => void }).__update = update
  } else {
    node.textContent = value
  }
  return node
}