// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { $runtime } from '../../src/runtime/index'

beforeEach(() => {
  document.body.innerHTML = ''
})

function el(tag: string, text: string): HTMLElement {
  const node = document.createElement(tag)
  node.textContent = text
  return node
}

describe('$runtime.slot', () => {
  it('renders the matching named builder', () => {
    const out = $runtime.slot(
      { default: () => el('p', 'body'), footer: () => el('span', 'foot') },
      'footer'
    )
    expect(out).toBeInstanceOf(HTMLElement)
    expect((out as HTMLElement).textContent).toBe('foot')
  })

  it('renders the default builder', () => {
    const out = $runtime.slot({ default: () => el('p', 'body') }, 'default')
    expect((out as HTMLElement).textContent).toBe('body')
  })

  it('renders the fallback when no builder matches', () => {
    const out = $runtime.slot({}, 'footer', () => el('p', 'fallback'))
    expect((out as HTMLElement).textContent).toBe('fallback')
  })

  it('returns a comment anchor when nothing matches and no fallback', () => {
    const out = $runtime.slot({}, 'footer')
    expect(out.nodeType).toBe(Node.COMMENT_NODE)
  })

  it('ignores non-function slot entries', () => {
    const out = $runtime.slot(
      { footer: 'not-a-builder' as unknown as () => HTMLElement },
      'footer',
      () => el('p', 'fallback')
    )
    expect((out as HTMLElement).textContent).toBe('fallback')
  })
})
