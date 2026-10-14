// src/runtime/components.ts

import { registerEvents } from './events'
import { withEffect } from './state'

export interface PropDef {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function'
  default?: unknown
  required?: boolean
  validate?: (v: unknown) => true | string
}

export interface SetupContext {
  slots: Record<string, (() => HTMLElement) | undefined>
  provide: typeof provide
  inject: typeof inject
  onMount(fn: () => void): void
  onDestroy(fn: () => void): void
  onUpdate(fn: () => void): void
}

export interface ComponentOptions {
  name: string
  props?: Record<string, PropDef>
  setup?: (props: Record<string, unknown>, ctx: SetupContext) => (() => HTMLElement) | HTMLElement
}

export function normalizeProps(
  defs: Record<string, PropDef>,
  raw: Record<string, unknown> = {}
): { values: Record<string, unknown>; errors: string[] } {
  const values: Record<string, unknown> = { ...raw }
  const errors: string[] = []
  for (const [key, def] of Object.entries(defs)) {
    if (values[key] === undefined && def.default !== undefined) {
      values[key] = def.default
    }
    if (def.required && values[key] === undefined) {
      errors.push(`Missing required prop: "${key}"`)
    }
  }
  return { values, errors }
}

function checkType(t: NonNullable<PropDef['type']>, v: unknown): boolean {
  switch (t) {
    case 'string':
      return typeof v === 'string'
    case 'number':
      return typeof v === 'number'
    case 'boolean':
      return typeof v === 'boolean'
    case 'function':
      return typeof v === 'function'
    case 'array':
      return Array.isArray(v)
    case 'object':
      return typeof v === 'object' && v !== null && !Array.isArray(v)
  }
}

export function validateProps(
  defs: Record<string, PropDef>,
  values: Record<string, unknown>
): string[] {
  const errors: string[] = []
  for (const [key, def] of Object.entries(defs)) {
    const v = values[key]
    if (v === undefined) continue
    if (def.type !== undefined && !checkType(def.type, v)) {
      errors.push(`Invalid type for prop "${key}": expected ${def.type}`)
    }
    if (def.validate !== undefined) {
      const r = def.validate(v)
      if (r !== true) errors.push(typeof r === 'string' ? r : `Invalid prop "${key}"`)
    }
  }
  return errors
}

// owner stack backing provide/inject
const ownerStack: { name: string; provides: Map<unknown, unknown> }[] = []

export function pushOwner(ctx: { name: string; provides: Map<unknown, unknown> }): void {
  ownerStack.push(ctx)
}

export function popOwner(): void {
  ownerStack.pop()
}

export function provide(key: unknown, value: unknown): void {
  const current = ownerStack[ownerStack.length - 1]
  if (!current) throw new Error('provide() called with no active component owner')
  current.provides.set(key, value)
}

export function inject<T>(key: unknown, fallback?: T): T | undefined {
  for (let i = ownerStack.length - 1; i >= 0; i--) {
    if (ownerStack[i].provides.has(key)) return ownerStack[i].provides.get(key) as T
  }
  return fallback
}

export function renderSlot(
  slots: Record<string, (() => HTMLElement) | undefined>,
  name: string,
  fallback?: () => HTMLElement
): HTMLElement | Comment {
  const fn = slots[name]
  if (typeof fn === 'function') return fn()
  if (fallback) return fallback()
  return document.createComment('slot:' + name)
}

export function lazyComponent(
  loader: () => Promise<(props?: Record<string, unknown>) => HTMLElement>,
  loading?: () => HTMLElement
): (props?: Record<string, unknown>) => HTMLElement {
  return function (props: Record<string, unknown> = {}): HTMLElement {
    const placeholder: HTMLElement | Comment = loading ? loading() : document.createComment('loading')
    loader().then(
      comp => {
        if (!placeholder.isConnected) return
        placeholder.replaceWith(comp(props))
      },
      err => {
        console.error(err)
      }
    )
    return placeholder as unknown as HTMLElement
  }
}

export function withErrorBoundary(
  fn: () => HTMLElement,
  onError: (err: unknown) => HTMLElement
): HTMLElement {
  try {
    return fn()
  } catch (err) {
    return onError(err)
  }
}

export function defineComponent(
  options: ComponentOptions
): (props?: Record<string, unknown>, slots?: Record<string, (() => HTMLElement) | undefined>) => HTMLElement {
  return function (
    props: Record<string, unknown> = {},
    slots: Record<string, (() => HTMLElement) | undefined> = {}
  ): HTMLElement {
    const defs = options.props ?? {}
    const { values } = normalizeProps(defs, props)
    // The .tardis compiler passes slot builders inside props.children;
    // prefer an explicitly passed slots record, fall back to children.
    const childSlots = (props.children ?? {}) as Record<string, (() => HTMLElement) | undefined>
    const resolvedSlots = Object.keys(slots).length > 0 ? slots : childSlots
    const mountCbs: (() => void)[] = []
    const destroyCbs: (() => void)[] = []
    const updateCbs: (() => void)[] = []
    const ctx: SetupContext = {
      slots: resolvedSlots,
      provide,
      inject,
      onMount(fn: () => void): void {
        mountCbs.push(fn)
      },
      onDestroy(fn: () => void): void {
        destroyCbs.push(fn)
      },
      onUpdate(fn: () => void): void {
        updateCbs.push(fn)
      },
    }
    // onUpdate semantics: callbacks do NOT trigger a re-render. Setup runs once
    // inside withEffect, so any reactive state read during setup subscribes the
    // dispatcher below; later state changes re-invoke the stored onUpdate
    // listeners only. Mount/destroy fire via the shared events module.
    const dispatchUpdates = (): void => {
      for (const fn of updateCbs.slice()) {
        try {
          fn()
        } catch (err) {
          console.error(err)
        }
      }
    }
    pushOwner({ name: options.name, provides: new Map<unknown, unknown>() })
    let result: (() => HTMLElement) | HTMLElement
    try {
      result = withEffect(dispatchUpdates, () =>
        options.setup ? options.setup(values, ctx) : document.createElement('div')
      )
    } finally {
      popOwner()
    }
    for (const fn of mountCbs) registerEvents({ onMount: fn })
    for (const fn of destroyCbs) registerEvents({ onDestroy: fn })
    for (const fn of updateCbs) registerEvents({ onUpdate: fn })
    return typeof result === 'function' ? result() : result
  }
}
