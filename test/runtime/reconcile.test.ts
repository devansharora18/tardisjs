// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'

import { createState, $update } from '../../src/runtime/state'
import {
  keyed,
  fragment,
  svg,
  createRef,
  setRef,
  moveChild,
} from '../../src/runtime/reconcile'

function div(text: string): HTMLElement {
  const el = document.createElement('div')
  el.textContent = text
  return el
}

function texts(container: HTMLElement): string[] {
  return [...container.children].map(el => el.textContent ?? '')
}

// ────────────────────────────────────────────────────────────────────────────
// keyed
// ────────────────────────────────────────────────────────────────────────────
describe('keyed', () => {
  it('creates a plain div with data-keyed and renders initial order', () => {
    const c = keyed(() => ['a', 'b', 'c'], item => item, item => div(item))
    expect(c.tagName).toBe('DIV')
    expect(c.hasAttribute('data-keyed')).toBe(true)
    expect(texts(c)).toEqual(['a', 'b', 'c'])
  })

  it('keeps node identity across reorder (same refs after move)', () => {
    const s = createState({ items: ['a', 'b', 'c'] })
    const c = keyed(
      () => s.items as unknown as string[],
      item => item,
      item => div(item)
    )
    const before = [...c.children] as HTMLElement[]
    $update(s, 'items', ['c', 'a', 'b'])
    const after = [...c.children] as HTMLElement[]
    expect(texts(c)).toEqual(['c', 'a', 'b'])
    // Same object references, just reordered.
    expect(new Set(after)).toEqual(new Set(before))
    expect(after[0]).toBe(before[2])
    expect(after[1]).toBe(before[0])
    expect(after[2]).toBe(before[1])
  })

  it('does not rebuild kept keys on reorder (builder called once per key)', () => {
    const s = createState({ items: ['a', 'b', 'c'] })
    const builder = vi.fn((item: string) => div(item))
    const c = keyed(() => s.items as unknown as string[], item => item, builder)
    expect(builder).toHaveBeenCalledTimes(3)
    $update(s, 'items', ['c', 'b', 'a'])
    expect(builder).toHaveBeenCalledTimes(3)
    expect(texts(c)).toEqual(['c', 'b', 'a'])
  })

  it('appends only new keys, reusing existing nodes', () => {
    const s = createState({ items: ['a', 'b'] })
    const builder = vi.fn((item: string) => div(item))
    const c = keyed(() => s.items as unknown as string[], item => item, builder)
    const aNode = c.children[0]
    const bNode = c.children[1]
    $update(s, 'items', ['a', 'b', 'c'])
    expect(builder).toHaveBeenCalledTimes(3)
    expect(c.children[0]).toBe(aNode)
    expect(c.children[1]).toBe(bNode)
    expect(texts(c)).toEqual(['a', 'b', 'c'])
  })

  it('removes vanished keys and keeps the rest in place', () => {
    const s = createState({ items: ['a', 'b', 'c'] })
    const c = keyed(
      () => s.items as unknown as string[],
      item => item,
      item => div(item)
    )
    const aNode = c.children[0] as HTMLElement
    const cNode = c.children[2] as HTMLElement
    $update(s, 'items', ['a', 'c'])
    expect(c.children.length).toBe(2)
    expect(c.children[0]).toBe(aNode)
    expect(c.children[1]).toBe(cNode)
    expect(c.querySelectorAll('div').length).toBe(2)
  })

  it('handles empty → filled → empty', () => {
    const s = createState({ items: [] as unknown as string[] })
    const c = keyed(
      () => s.items as unknown as string[],
      item => item,
      item => div(item)
    )
    expect(c.children.length).toBe(0)
    $update(s, 'items', ['x', 'y'])
    expect(texts(c)).toEqual(['x', 'y'])
    $update(s, 'items', [])
    expect(c.children.length).toBe(0)
  })

  it('duplicate keys are last-wins with a single node per key', () => {
    const c = keyed(
      () => [
        { id: 1, v: 'first' },
        { id: 1, v: 'second' },
        { id: 2, v: 'x' },
      ],
      item => item.id,
      item => div(item.v)
    )
    expect(c.children.length).toBe(2)
    expect(texts(c)).toEqual(['second', 'x'])
  })

  it('order matches array after shuffle and reverse', () => {
    const s = createState({ items: ['a', 'b', 'c', 'd'] })
    const c = keyed(
      () => s.items as unknown as string[],
      item => item,
      item => div(item)
    )
    $update(s, 'items', ['d', 'b', 'a', 'c'])
    expect(texts(c)).toEqual(['d', 'b', 'a', 'c'])
    $update(s, 'items', ['c', 'a', 'b', 'd'])
    expect(texts(c)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('inserts new keys in the middle at the correct position', () => {
    const s = createState({ items: ['a', 'd'] })
    const c = keyed(
      () => s.items as unknown as string[],
      item => item,
      item => div(item)
    )
    $update(s, 'items', ['a', 'b', 'c', 'd'])
    expect(texts(c)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reactively re-renders when a withEffect-tracked dep changes', () => {
    const s = createState({ items: ['a'] })
    const c = keyed(
      () => s.items as unknown as string[],
      item => item,
      item => div(item)
    )
    expect(texts(c)).toEqual(['a'])
    $update(s, 'items', ['a', 'b'])
    expect(texts(c)).toEqual(['a', 'b'])
    $update(s, 'items', ['z'])
    expect(texts(c)).toEqual(['z'])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// fragment
// ────────────────────────────────────────────────────────────────────────────
describe('fragment', () => {
  it('returns a DocumentFragment with all children in order', () => {
    const a = div('a')
    const b = div('b')
    const com = document.createComment('anchor')
    const frag = fragment([a, b, com])
    expect(frag.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE)
    expect([...frag.childNodes]).toEqual([a, b, com])
  })

  it('returns an empty fragment for an empty array', () => {
    const frag = fragment([])
    expect(frag.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE)
    expect(frag.childNodes.length).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// svg
// ────────────────────────────────────────────────────────────────────────────
describe('svg', () => {
  it('creates an element with the SVG namespace', () => {
    const el = svg('circle')
    expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(el.tagName.toLowerCase()).toBe('circle')
  })

  it('sets string and number attributes', () => {
    const el = svg('rect', { width: 100, height: '50', fill: 'red' })
    expect(el.getAttribute('width')).toBe('100')
    expect(el.getAttribute('height')).toBe('50')
    expect(el.getAttribute('fill')).toBe('red')
  })

  it('works without attrs', () => {
    const el = svg('svg')
    expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// refs
// ────────────────────────────────────────────────────────────────────────────
describe('refs', () => {
  it('createRef starts with null current', () => {
    const ref = createRef()
    expect(ref.current).toBeNull()
  })

  it('setRef sets and clears the ref', () => {
    const ref = createRef<HTMLDivElement>()
    const el = document.createElement('div')
    setRef(ref, el)
    expect(ref.current).toBe(el)
    setRef(ref, null)
    expect(ref.current).toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// moveChild
// ────────────────────────────────────────────────────────────────────────────
describe('moveChild', () => {
  it('appends when the anchor is null', () => {
    const parent = document.createElement('div')
    const a = div('a')
    const b = div('b')
    parent.appendChild(a)
    moveChild(parent, b, null)
    expect([...parent.children]).toEqual([a, b])
  })

  it('inserts before the given anchor', () => {
    const parent = document.createElement('div')
    const a = div('a')
    const c = div('c')
    parent.appendChild(a)
    parent.appendChild(c)
    const b = div('b')
    moveChild(parent, b, c)
    expect(texts(parent)).toEqual(['a', 'b', 'c'])
  })

  it('moves an existing child to a new position', () => {
    const parent = document.createElement('div')
    const a = div('a')
    const b = div('b')
    const c = div('c')
    parent.append(a, b, c)
    moveChild(parent, c, a)
    expect(texts(parent)).toEqual(['c', 'a', 'b'])
  })
})
