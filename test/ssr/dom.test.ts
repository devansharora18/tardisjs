import { describe, it, expect } from 'vitest'
import {
  createMiniDocument,
  createMiniElement,
  createMiniText,
  createMiniComment,
} from '../../src/ssr/dom'

describe('mini dom', () => {
  it('appends children and tracks parents', () => {
    const doc = createMiniDocument()
    const div = doc.createElement('div')
    const text = doc.createTextNode('hi')
    doc.body.appendChild(div)
    div.appendChild(text)
    expect(text.parentNode).toBe(div)
    expect(div.children).toEqual([text])
    expect(doc.body.children).toEqual([div])
  })

  it('detaches on re-append (move semantics)', () => {
    const doc = createMiniDocument()
    const a = doc.createElement('div')
    const b = doc.createElement('div')
    const t = doc.createTextNode('x')
    a.appendChild(t)
    b.appendChild(t)
    expect(a.children).toEqual([])
    expect(b.children).toEqual([t])
  })

  it('insertBefore orders with anchors and null appends', () => {
    const doc = createMiniDocument()
    const parent = doc.createElement('div')
    const a = doc.createElement('span')
    const b = doc.createElement('span')
    const c = doc.createElement('span')
    parent.appendChild(a)
    parent.appendChild(c)
    parent.insertBefore(b, c)
    expect(parent.children).toEqual([a, b, c])
    const d = doc.createElement('span')
    parent.insertBefore(d, null)
    expect(parent.children.at(-1)).toBe(d)
  })

  it('replaceChild swaps and orphan removal works', () => {
    const doc = createMiniDocument()
    const parent = doc.createElement('div')
    const a = doc.createElement('span')
    const b = doc.createElement('span')
    parent.appendChild(a)
    parent.replaceChild(b, a)
    expect(parent.children).toEqual([b])
    expect(a.parentNode).toBeNull()
    b.remove()
    expect(parent.children).toEqual([])
  })

  it('manages attributes', () => {
    const el = createMiniElement('input')
    expect(el.getAttribute('value')).toBeNull()
    el.setAttribute('value', 'hi')
    expect(el.getAttribute('value')).toBe('hi')
    el.removeAttribute('value')
    expect(el.getAttribute('value')).toBeNull()
  })

  it('clearing children on textContent assignment', () => {
    const el = createMiniElement('p')
    el.appendChild(createMiniText('old'))
    el.textContent = 'new'
    expect(el.children).toEqual([])
    expect(el.textContent).toBe('new')
  })

  it('creates namespaced elements and comments', () => {
    const doc = createMiniDocument()
    const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle')
    expect(circle.tag).toBe('circle')
    expect(circle.namespace).toBe('http://www.w3.org/2000/svg')
    expect(doc.createComment('x').nodeType).toBe('comment')
  })

  it('no-ops listeners and queries', () => {
    const el = createMiniElement('div')
    const noop = (): void => {}
    expect(() => el.addEventListener('click', noop)).not.toThrow()
    expect(() => el.removeEventListener('click', noop)).not.toThrow()
    expect(el.querySelector('.x')).toBeNull()
    expect(el.querySelectorAll('.x')).toEqual([])
  })

  it('exposes head and body roots', () => {
    const doc = createMiniDocument()
    expect(doc.head.tag).toBe('head')
    expect(doc.body.tag).toBe('body')
  })
})
