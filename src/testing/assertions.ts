// src/testing/assertions.ts
// Plain assertion helpers (not vitest matchers) for blueprint DOM tests.

// Visible unless the element or any ancestor is display:none (the $show
// mechanism). Does not account for stylesheet-based hiding.
export function isVisible(el: HTMLElement): boolean {
  let node: HTMLElement | null = el
  while (node) {
    if (node.style && node.style.display === 'none') return false
    node = node.parentElement
  }
  return true
}

export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').trim()
}

export function queryAll(root: ParentNode, sel: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel)) as HTMLElement[]
}
