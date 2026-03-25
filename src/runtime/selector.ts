// src/runtime/selector.ts
// jQuery-tribute: unified selector for DOM elements and Tardis component instances

import { getAll, ComponentInstance } from './registry'
import { $update as updateState, $reset as resetState, StateValue } from './state'

// ── Attribute filter parsing ────────────────────────────────────────────────

interface AttrFilter {
  key: string   // e.g. "variant", "state.count"
  op: string    // "=", ">", "<", ">=", "<="
  value: unknown
}

function parseAttrFilter(raw: string): AttrFilter | null {
  const match = raw.match(/^([\w.]+)\s*(>=|<=|>|<|=)\s*(.+)$/)
  if (!match) return null

  const [, key, op, rawVal] = match

  let value: unknown
  if (rawVal === 'true') value = true
  else if (rawVal === 'false') value = false
  else if (/^-?\d+(\.\d+)?$/.test(rawVal)) value = parseFloat(rawVal)
  else value = rawVal.replace(/^["']|["']$/g, '') // strip surrounding quotes

  return { key, op, value }
}

function instanceMatchesAttr(inst: ComponentInstance, filter: AttrFilter): boolean {
  const { key, op, value } = filter

  let actual: unknown
  if (key.startsWith('state.')) {
    actual = inst.state[key.slice(6)]
  } else {
    actual = inst.props[key] !== undefined ? inst.props[key] : inst.state[key]
  }

  switch (op) {
    case '=':  return actual === value
    case '>':  return (actual as number) > (value as number)
    case '<':  return (actual as number) < (value as number)
    case '>=': return (actual as number) >= (value as number)
    case '<=': return (actual as number) <= (value as number)
    default:   return false
  }
}

// ── DOMSelection ─────────────────────────────────────────────────────────────

export class DOMSelection {
  readonly elements: HTMLElement[]

  constructor(elements: HTMLElement[]) {
    this.elements = elements
  }

  private each(fn: (el: HTMLElement) => void): this {
    this.elements.forEach(fn)
    return this
  }

  focus(): this   { return this.each(el => el.focus()) }
  blur(): this    { return this.each(el => el.blur()) }
  hide(): this    { return this.each(el => { el.style.display = 'none' }) }
  show(): this    { return this.each(el => { el.style.display = '' }) }
  remove(): this  { return this.each(el => el.parentNode?.removeChild(el)) }

  toggle(): this {
    return this.each(el => {
      el.style.display = el.style.display === 'none' ? '' : 'none'
    })
  }

  disable(): this { return this.each(el => el.setAttribute('disabled', '')) }
  enable(): this  { return this.each(el => el.removeAttribute('disabled')) }

  addClass(cls: string): this    { return this.each(el => el.classList.add(cls)) }
  removeClass(cls: string): this { return this.each(el => el.classList.remove(cls)) }
  toggleClass(cls: string): this { return this.each(el => el.classList.toggle(cls)) }

  attr(key: string): string | null
  attr(key: string, val: string): this
  attr(key: string, val?: string): this | string | null {
    if (val === undefined) return this.elements[0]?.getAttribute(key) ?? null
    return this.each(el => el.setAttribute(key, val))
  }

  val(): string
  val(value: string): this
  val(value?: string): this | string {
    if (value === undefined) return (this.elements[0] as HTMLInputElement)?.value ?? ''
    return this.each(el => { (el as HTMLInputElement).value = value })
  }

  rect(): DOMRect | null        { return this.elements[0]?.getBoundingClientRect() ?? null }
  width(): number               { return this.elements[0]?.offsetWidth ?? 0 }
  height(): number              { return this.elements[0]?.offsetHeight ?? 0 }
  scrollIntoView(): this        { return this.each(el => el.scrollIntoView?.()) }
  scrollTo(opts: ScrollToOptions): this { return this.each(el => el.scrollTo?.(opts)) }

  fadeIn(): this  { return this.each(el => { el.style.display = ''; el.style.opacity = '1' }) }
  fadeOut(): this { return this.each(el => { el.style.opacity = '0' }) }

  slideDown(): this {
    return this.each(el => { el.style.overflow = 'hidden'; el.style.maxHeight = '' })
  }

  slideUp(): this {
    return this.each(el => { el.style.overflow = 'hidden'; el.style.maxHeight = '0px' })
  }

  // no-ops for component-only API — keeps chaining safe on DOM selections
  $update(_key: string, _value: unknown): this { return this }
  $reset(_initial?: Record<string, StateValue>): this { return this }

  get methods(): Record<string, (...args: unknown[]) => this> {
    const self = this
    return new Proxy({} as Record<string, (...args: unknown[]) => this>, {
      get: () => () => self,
    })
  }
}

// ── ComponentSelection ────────────────────────────────────────────────────────

export class ComponentSelection {
  readonly instances: ComponentInstance[]

  constructor(instances: ComponentInstance[]) {
    this.instances = instances
  }

  private eachEl(fn: (el: HTMLElement) => void): this {
    this.instances.forEach(inst => { if (inst.el) fn(inst.el) })
    return this
  }

  focus(): this   { return this.eachEl(el => el.focus()) }
  blur(): this    { return this.eachEl(el => el.blur()) }
  hide(): this    { return this.eachEl(el => { el.style.display = 'none' }) }
  show(): this    { return this.eachEl(el => { el.style.display = '' }) }
  remove(): this  { return this.eachEl(el => el.parentNode?.removeChild(el)) }

  toggle(): this {
    return this.eachEl(el => {
      el.style.display = el.style.display === 'none' ? '' : 'none'
    })
  }

  disable(): this { return this.eachEl(el => el.setAttribute('disabled', '')) }
  enable(): this  { return this.eachEl(el => el.removeAttribute('disabled')) }

  addClass(cls: string): this    { return this.eachEl(el => el.classList.add(cls)) }
  removeClass(cls: string): this { return this.eachEl(el => el.classList.remove(cls)) }
  toggleClass(cls: string): this { return this.eachEl(el => el.classList.toggle(cls)) }

  attr(key: string): string | null
  attr(key: string, val: string): this
  attr(key: string, val?: string): this | string | null {
    if (val === undefined) return this.instances[0]?.el?.getAttribute(key) ?? null
    return this.eachEl(el => el.setAttribute(key, val))
  }

  val(): string
  val(value: string): this
  val(value?: string): this | string {
    if (value === undefined) return (this.instances[0]?.el as HTMLInputElement)?.value ?? ''
    return this.eachEl(el => { (el as HTMLInputElement).value = value })
  }

  rect(): DOMRect | null        { return this.instances[0]?.el?.getBoundingClientRect() ?? null }
  width(): number               { return this.instances[0]?.el?.offsetWidth ?? 0 }
  height(): number              { return this.instances[0]?.el?.offsetHeight ?? 0 }
  scrollIntoView(): this        { return this.eachEl(el => el.scrollIntoView?.()) }
  scrollTo(opts: ScrollToOptions): this { return this.eachEl(el => el.scrollTo?.(opts)) }

  fadeIn(): this  { return this.eachEl(el => { el.style.display = ''; el.style.opacity = '1' }) }
  fadeOut(): this { return this.eachEl(el => { el.style.opacity = '0' }) }

  slideDown(): this {
    return this.eachEl(el => { el.style.overflow = 'hidden'; el.style.maxHeight = '' })
  }

  slideUp(): this {
    return this.eachEl(el => { el.style.overflow = 'hidden'; el.style.maxHeight = '0px' })
  }

  // component-specific
  $update(key: string, value: StateValue): this {
    this.instances.forEach(inst => updateState(inst.state, key, value))
    return this
  }

  $reset(initial: Record<string, StateValue>): this {
    this.instances.forEach(inst => resetState(inst.state, initial))
    return this
  }

  get methods(): Record<string, (...args: unknown[]) => this> {
    const self = this
    return new Proxy({} as Record<string, (...args: unknown[]) => this>, {
      get(_, methodName: string) {
        return (...args: unknown[]) => {
          self.instances.forEach(inst => inst.methods[methodName]?.(...args))
          return self
        }
      },
    })
  }
}

// ── $ ────────────────────────────────────────────────────────────────────────

export function $(selector: string): DOMSelection | ComponentSelection {
  const s = selector.trim()

  // Component selectors start with an uppercase letter
  if (/^[A-Z]/.test(s)) {
    const m = s.match(/^([A-Za-z]\w*)(?:#([\w-]+))?(?:\.([\w-]+))?(?:\[([^\]]+)\])?$/)
    if (m) {
      const [, name, idFilter, classFilter, attrFilter] = m
      let instances = getAll(name)

      if (idFilter)    instances = instances.filter(inst => inst.el?.id === idFilter)
      if (classFilter) instances = instances.filter(inst => inst.el?.classList.contains(classFilter))
      if (attrFilter) {
        const parsed = parseAttrFilter(attrFilter)
        if (parsed) instances = instances.filter(inst => instanceMatchesAttr(inst, parsed))
      }

      return new ComponentSelection(instances)
    }
  }

  // DOM selector — delegate to querySelectorAll
  const nodes = document.querySelectorAll(s)
  return new DOMSelection(Array.from(nodes) as HTMLElement[])
}
