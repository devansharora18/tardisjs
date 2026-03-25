// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createState, $update, $toggle, $reset, $batch, registerDep } from '../../src/runtime/state'
import { $fetch } from '../../src/runtime/fetch'
import {
  $if, $each, $show, $portal,
  bind, bindClass, bindAttr,
  resolveStyles, text,
} from '../../src/runtime/render'
import { createStyles } from '../../src/runtime/styles'
import {
  register, unregister, getAll, getById,
  getByClass, getByPropValue, getByStateValue, clearRegistry,
} from '../../src/runtime/registry'

// ────────────────────────────────────────────────────────────────────────────
// state
// ────────────────────────────────────────────────────────────────────────────
describe('state', () => {
  it('createState wraps initial values in a reactive proxy', () => {
    const s = createState({ count: 0, label: 'hello' })
    expect(s.count).toBe(0)
    expect(s.label).toBe('hello')
  })

  it('$update sets a new value on state', () => {
    const s = createState({ count: 0 })
    $update(s, 'count', 42)
    expect(s.count).toBe(42)
  })

  it('registerDep fires the updater when the registered key changes', () => {
    const s = createState({ count: 0 })
    const calls: number[] = []
    registerDep(s, 'count', () => calls.push(s.count as number))
    $update(s, 'count', 7)
    expect(calls).toEqual([7])
  })

  it('registerDep does not fire for unrelated key changes', () => {
    const s = createState({ a: 0, b: 0 })
    const calls: number[] = []
    registerDep(s, 'a', () => calls.push(1))
    $update(s, 'b', 99)
    expect(calls).toEqual([])
  })

  it('$toggle flips a boolean state value', () => {
    const s = createState({ open: false })
    $toggle(s, 'open')
    expect(s.open).toBe(true)
    $toggle(s, 'open')
    expect(s.open).toBe(false)
  })

  it('$reset restores multiple keys to initial values', () => {
    const s = createState({ count: 5, name: 'world' })
    $reset(s, { count: 0, name: 'hello' })
    expect(s.count).toBe(0)
    expect(s.name).toBe('hello')
  })

  it('$batch defers updaters into a single requestAnimationFrame call', () => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn())
    const s = createState({ a: 0, b: 0 })
    const calls: string[] = []
    registerDep(s, 'a', () => calls.push('a'))
    registerDep(s, 'b', () => calls.push('b'))
    $batch(() => {
      $update(s, 'a', 1)
      $update(s, 'b', 2)
    })
    expect(calls).toContain('a')
    expect(calls).toContain('b')
    vi.unstubAllGlobals()
  })

  it('$batch deduplicates — a shared updater registered on two keys fires once', () => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn())
    const s = createState({ x: 0, y: 0 })
    let count = 0
    const shared = () => count++
    registerDep(s, 'x', shared)
    registerDep(s, 'y', shared)
    $batch(() => {
      $update(s, 'x', 1)
      $update(s, 'y', 2)
    })
    expect(count).toBe(1)
    vi.unstubAllGlobals()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// fetch
// ────────────────────────────────────────────────────────────────────────────
describe('fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockSuccess(data: unknown) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(data),
    })
  }

  function mockHttpError(status: number, statusText: string) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status,
      statusText,
    })
  }

  it('calls done with parsed JSON on a successful response', async () => {
    mockSuccess({ id: 1, name: 'Alice' })
    const data = await new Promise(resolve => {
      $fetch('/api/users').done(resolve)
    })
    expect(data).toEqual({ id: 1, name: 'Alice' })
  })

  it('calls fail with an Error on a non-ok HTTP response', async () => {
    mockHttpError(404, 'Not Found')
    const err = await new Promise<Error>(resolve => {
      $fetch('/api/users').fail(resolve)
    })
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toMatch('404')
  })

  it('calls always after a successful response', async () => {
    mockSuccess({})
    const order: string[] = []
    await new Promise<void>(resolve => {
      $fetch('/api/data')
        .done(() => order.push('done'))
        .always(() => { order.push('always'); resolve() })
    })
    expect(order).toEqual(['done', 'always'])
  })

  it('calls always after a failed response', async () => {
    mockHttpError(500, 'Server Error')
    const order: string[] = []
    await new Promise<void>(resolve => {
      $fetch('/api/data')
        .fail(() => order.push('fail'))
        .always(() => { order.push('always'); resolve() })
    })
    expect(order).toEqual(['fail', 'always'])
  })

  it('fires the HTTP request exactly once across chained .done .fail .always calls', async () => {
    mockSuccess({})
    await new Promise<void>(resolve => {
      $fetch('/api/data').done(() => {}).fail(() => {}).always(resolve)
    })
    expect(globalThis.fetch as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
  })

  it('sends method, body, and custom headers on the request', async () => {
    mockSuccess({})
    await new Promise<void>(resolve => {
      $fetch('/api/data')
        .method('POST')
        .body({ key: 'val' })
        .headers({ 'X-Token': 'abc' })
        .done(() => {})
        .always(resolve)
    })
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/data')
    expect(options.method).toBe('POST')
    expect(options.body).toBe(JSON.stringify({ key: 'val' }))
    expect(options.headers['X-Token']).toBe('abc')
  })

  it('calls fail with Error on a network-level rejection', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network failure')
    )
    const err = await new Promise<Error>(resolve => {
      $fetch('/api/data').fail(resolve)
    })
    expect(err.message).toBe('Network failure')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// render
// ────────────────────────────────────────────────────────────────────────────
describe('render', () => {
  describe('$if', () => {
    it('returns the built element when condition is true', () => {
      const el = $if(() => true, () => {
        const div = document.createElement('div')
        div.textContent = 'visible'
        return div
      })
      expect(el).toBeInstanceOf(HTMLElement)
      expect((el as HTMLElement).textContent).toBe('visible')
    })

    it('returns a comment anchor when condition is false', () => {
      const node = $if(() => false, () => document.createElement('div'))
      expect(node.nodeType).toBe(Node.COMMENT_NODE)
    })
  })

  describe('$each', () => {
    it('renders one child element per item', () => {
      const container = $each(
        () => ['a', 'b', 'c'],
        item => {
          const span = document.createElement('span')
          span.textContent = item
          return span
        }
      )
      expect(container.children.length).toBe(3)
      expect(container.children[0].textContent).toBe('a')
      expect(container.children[2].textContent).toBe('c')
    })

    it('sets the data-each attribute on the wrapper div', () => {
      const container = $each(() => [], () => document.createElement('li'))
      expect(container.hasAttribute('data-each')).toBe(true)
    })

    it('passes the index to itemBuilderFn', () => {
      const container = $each(
        () => ['x', 'y'],
        (item, i) => {
          const div = document.createElement('div')
          div.dataset.idx = String(i)
          return div
        }
      )
      expect((container.children[1] as HTMLElement).dataset.idx).toBe('1')
    })

    it('renders an empty container for an empty array', () => {
      const container = $each(() => [], () => document.createElement('li'))
      expect(container.children.length).toBe(0)
    })
  })

  describe('$show', () => {
    it('sets display:none when condition is false', () => {
      const el = $show(() => false, () => document.createElement('div'))
      expect(el.style.display).toBe('none')
    })

    it('leaves display as empty string when condition is true', () => {
      const el = $show(() => true, () => document.createElement('div'))
      expect(el.style.display).toBe('')
    })

    it('returns the element built by builderFn', () => {
      const built = document.createElement('p')
      const returned = $show(() => true, () => built)
      expect(returned).toBe(built)
    })
  })

  describe('$portal', () => {
    it('appends the built element into the target selector', () => {
      document.body.innerHTML = '<div id="portal-root"></div>'
      $portal('#portal-root', () => {
        const p = document.createElement('p')
        p.textContent = 'portal content'
        return p
      })
      expect(document.querySelector('#portal-root p')?.textContent).toBe('portal content')
    })

    it('returns the built element even when the target selector is missing', () => {
      document.body.innerHTML = ''
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const el = $portal('#missing', () => document.createElement('div'))
      expect(el).toBeInstanceOf(HTMLElement)
      warnSpy.mockRestore()
    })
  })

  describe('bind', () => {
    it('sets textContent on the element immediately', () => {
      const el = document.createElement('p')
      bind(el, 'textContent', () => 'hello')
      expect(el.textContent).toBe('hello')
    })

    it('sets an arbitrary DOM property', () => {
      const input = document.createElement('input')
      bind(input, 'value', () => 'prefilled')
      expect(input.value).toBe('prefilled')
    })

    it('stores __update and re-applies the value when called', () => {
      const el = document.createElement('p')
      const s = createState({ msg: 'initial' })
      bind(el, 'textContent', () => s.msg as string)
      $update(s, 'msg', 'updated')
      ;(el as unknown as { __update(): void }).__update()
      expect(el.textContent).toBe('updated')
    })
  })

  describe('bindClass', () => {
    it('sets className immediately', () => {
      const el = document.createElement('div')
      bindClass(el, () => 'btn primary')
      expect(el.className).toBe('btn primary')
    })

    it('stores __updateClass and re-applies the class when called', () => {
      const el = document.createElement('div')
      const s = createState({ active: false })
      bindClass(el, () => (s.active ? 'active' : ''))
      $update(s, 'active', true)
      ;(el as unknown as { __updateClass(): void }).__updateClass()
      expect(el.className).toBe('active')
    })
  })

  describe('bindAttr', () => {
    it('sets an attribute for a truthy string value', () => {
      const el = document.createElement('input')
      bindAttr(el, 'placeholder', () => 'Search...')
      expect(el.getAttribute('placeholder')).toBe('Search...')
    })

    it('sets an attribute for a truthy boolean-like value', () => {
      const el = document.createElement('input')
      bindAttr(el, 'data-active', () => true)
      expect(el.getAttribute('data-active')).toBe('true')
    })

    it('removes the attribute when value is false', () => {
      const el = document.createElement('input')
      el.setAttribute('disabled', '')
      bindAttr(el, 'disabled', () => false)
      expect(el.hasAttribute('disabled')).toBe(false)
    })

    it('removes the attribute when value is null', () => {
      const el = document.createElement('button')
      el.setAttribute('aria-label', 'old')
      bindAttr(el, 'aria-label', () => null)
      expect(el.hasAttribute('aria-label')).toBe(false)
    })
  })

  describe('text', () => {
    it('creates a Text node with a static string', () => {
      const node = text('hello world')
      expect(node.nodeType).toBe(Node.TEXT_NODE)
      expect(node.textContent).toBe('hello world')
    })

    it('creates a reactive Text node from a function', () => {
      const s = createState({ val: 'reactive' })
      const node = text(() => s.val as string)
      expect(node.textContent).toBe('reactive')
    })

    it('updates textContent when __update is called', () => {
      const s = createState({ val: 'before' })
      const node = text(() => s.val as string)
      $update(s, 'val', 'after')
      ;(node as unknown as { __update(): void }).__update()
      expect(node.textContent).toBe('after')
    })

    it('does not attach __update for a static string node', () => {
      const node = text('static')
      expect((node as unknown as { __update?: unknown }).__update).toBeUndefined()
    })
  })

  describe('resolveStyles', () => {
    it('returns the mapped value for a known key', () => {
      const styles = { base: 'flex gap-4', btn: 'bg-blue' }
      expect(resolveStyles(styles, 'base')).toBe('flex gap-4')
      expect(resolveStyles(styles, 'btn')).toBe('bg-blue')
    })

    it('returns the key itself when it is not in the map', () => {
      expect(resolveStyles({ btn: 'bg-blue' }, 'unknown-key')).toBe('unknown-key')
    })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// styles
// ────────────────────────────────────────────────────────────────────────────
describe('styles', () => {
  it('always includes the base rule', () => {
    const s = createStyles('tailwind', { base: 'flex gap-4' }, {}, createState({}))
    expect(s.resolve({} as never, {} as never)).toBe('flex gap-4')
  })

  it('includes a variant rule when the prop value matches', () => {
    const s = createStyles(
      'tailwind',
      { base: 'flex', 'variant.primary': 'bg-indigo-500', 'variant.danger': 'bg-red-500' },
      { variant: 'primary' },
      createState({})
    )
    const result = s.resolve({} as never, {} as never)
    expect(result).toContain('bg-indigo-500')
    expect(result).not.toContain('bg-red-500')
  })

  it('includes a boolean.true rule when state value is true', () => {
    const state = createState({ loading: true })
    const s = createStyles(
      'tailwind',
      { 'loading.true': 'opacity-50 cursor-wait' },
      {},
      state
    )
    expect(s.resolve({} as never, {} as never)).toContain('opacity-50')
  })

  it('includes a boolean.false rule when state value is false', () => {
    const state = createState({ disabled: false })
    const s = createStyles(
      'tailwind',
      { 'disabled.false': 'bg-green-500' },
      {},
      state
    )
    expect(s.resolve({} as never, {} as never)).toContain('bg-green-500')
  })

  it('skips rules when no matching prop or state key exists', () => {
    const s = createStyles('tailwind', { 'size.lg': 'text-lg' }, {}, createState({}))
    expect(s.resolve({} as never, {} as never)).toBe('')
  })

  it('tailwind mode joins classes with spaces', () => {
    const s = createStyles(
      'tailwind',
      { base: 'flex', 'variant.primary': 'bg-blue' },
      { variant: 'primary' },
      createState({})
    )
    expect(s.resolve({} as never, {} as never)).toBe('flex bg-blue')
  })

  it('css mode joins rules with semicolons', () => {
    const s = createStyles(
      'css',
      { base: 'display: flex', 'variant.primary': 'background: blue' },
      { variant: 'primary' },
      createState({})
    )
    expect(s.resolve({} as never, {} as never)).toBe('display: flex; background: blue')
  })

  it('props take precedence over state for the same key', () => {
    const state = createState({ variant: 'danger' })
    const s = createStyles(
      'tailwind',
      { 'variant.primary': 'bg-indigo-500', 'variant.danger': 'bg-red-500' },
      { variant: 'primary' },
      state
    )
    const result = s.resolve({} as never, {} as never)
    expect(result).toContain('bg-indigo-500')
    expect(result).not.toContain('bg-red-500')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// registry
// ────────────────────────────────────────────────────────────────────────────
describe('registry', () => {
  beforeEach(() => clearRegistry())

  it('register returns a unique id string prefixed with the component name', () => {
    const id = register('Counter', {})
    expect(typeof id).toBe('string')
    expect(id.startsWith('Counter_')).toBe(true)
  })

  it('getAll returns all registered instances of a blueprint', () => {
    register('Button', {})
    register('Button', {})
    expect(getAll('Button').length).toBe(2)
  })

  it('getAll returns an empty array for an unknown name', () => {
    expect(getAll('Unknown')).toEqual([])
  })

  it('getById returns the instance matching the id', () => {
    const id = register('Card', {})
    const instance = getById(id)
    expect(instance?.id).toBe(id)
    expect(instance?.name).toBe('Card')
  })

  it('getById returns null for an id that does not exist', () => {
    expect(getById('nonexistent')).toBeNull()
  })

  it('unregister removes the instance and cleans up empty registry entries', () => {
    const id = register('Modal', {})
    unregister(id)
    expect(getById(id)).toBeNull()
    expect(getAll('Modal')).toEqual([])
  })

  it('getByClass filters instances whose el has the given CSS class', () => {
    const id = register('Widget', {})
    const el = document.createElement('div')
    el.classList.add('highlight')
    getById(id)!.el = el

    register('Widget', {}) // second instance — no el, no class

    const results = getByClass('Widget', 'highlight')
    expect(results.length).toBe(1)
    expect(results[0].id).toBe(id)
  })

  it('getByPropValue filters instances matching a prop value', () => {
    const id1 = register('Tab', { props: { active: true } })
    register('Tab', { props: { active: false } })
    const results = getByPropValue('Tab', 'active', true)
    expect(results.length).toBe(1)
    expect(results[0].id).toBe(id1)
  })

  it('getByStateValue filters instances matching a state key value', () => {
    const stateA = createState({ status: 'open' })
    const stateB = createState({ status: 'closed' })
    const id1 = register('Dialog', { state: stateA })
    register('Dialog', { state: stateB })
    const results = getByStateValue('Dialog', 'status', 'open')
    expect(results.length).toBe(1)
    expect(results[0].id).toBe(id1)
  })

  it('clearRegistry removes all registered instances', () => {
    register('A', {})
    register('B', {})
    clearRegistry()
    expect(getAll('A')).toEqual([])
    expect(getAll('B')).toEqual([])
  })
})
