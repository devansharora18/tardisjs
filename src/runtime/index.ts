// src/runtime/index.ts
// the ~5KB runtime that ships with every tardisjs app

export { createState, $update, $toggle, $reset, $batch, registerDep } from './state'
export type { ReactiveState, StateValue } from './state'

export { $fetch } from './fetch'

export { $if, $each, $show, $portal, bind, bindClass, bindAttr, resolveStyles, text } from './render'

export { createStyles } from './styles'
export type { StylesObject, StyleMode } from './styles'

export { register, unregister, getAll, getById, getByClass, getByPropValue, getByStateValue, clearRegistry } from './registry'
export type { ComponentInstance } from './registry'

export { registerEvents, flushMountCallbacks, flushDestroyCallbacks } from './events'

// ── $runtime object ────────────────────────────────────────────────────────
// the compiled output imports $runtime and calls methods on it
// this is the single object the compiler references

import { createState, $update, $toggle, $reset, $batch, registerDep } from './state'
import { $fetch } from './fetch'
import { $if, $each, $show, $portal, bind, bindClass, bindAttr, resolveStyles, text } from './render'
import { createStyles } from './styles'
import { register, unregister, getAll, getById } from './registry'
import { registerEvents, flushMountCallbacks } from './events'

export const $runtime = {
  // state
  state: createState,
  update: $update,
  toggle: $toggle,
  reset: $reset,
  batch: $batch,
  registerDep,

  // fetch
  fetch: $fetch,

  // render
  if: $if,
  each: $each,
  show: $show,
  portal: $portal,
  bind,
  bindClass,
  bindAttr,
  resolveStyles,
  text,

  // styles
  styles: createStyles,

  // registry
  register,
  unregister,
  getAll,
  getById,

  // events
  events: registerEvents,
  flush: flushMountCallbacks,

  // placeholder — used during compilation before ui is wired up
  placeholder(name: string): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('data-component', name)
    return el
  },

  // component instantiation
  component(name: string, props: Record<string, unknown>): HTMLElement {
    // looks up the component factory from a global registry
    // populated when components are imported
    const globalRegistry = window as unknown as Record<string, unknown>
    const factory = globalRegistry[`__tardis_${name}`] as
      | ((props: Record<string, unknown>) => HTMLElement)
      | undefined
    if (factory) return factory(props)
    const el = document.createElement('div')
    el.setAttribute('data-component', name)
    el.setAttribute('data-props', JSON.stringify(props))
    return el
  },

  // chain — attaches event to a chained element
  chain(
    el: HTMLElement,
    event: string,
    handler: (e: Event) => void
  ): void {
    if (event === '__mount') {
      flushMountCallbacks()
    } else {
      el.addEventListener(event, handler)
    }
  },
}