// src/runtime/index.ts
// the ~5KB runtime that ships with every tardisjs app

export { createState, $update, $toggle, $reset, $batch, registerDep } from './state'
export type { ReactiveState, StateValue } from './state'

export { $fetch } from './fetch'

export { $if, $each, $show, $portal, bind, bindClass, bindAttr, applyClass, resolveStyles, text } from './render'

export { createStyles } from './styles'
export type { StylesObject, StyleMode } from './styles'

export { register, unregister, getAll, getById, getByClass, getByPropValue, getByStateValue, clearRegistry } from './registry'
export type { ComponentInstance } from './registry'

export { $, DOMSelection, ComponentSelection } from './selector'
export { createRouter, $navigate, $back, $forward, $params } from './router'

export { registerEvents, flushMountCallbacks, flushDestroyCallbacks, flushUpdateCallbacks, clearEvents } from './events'

// ── signals ────────────────────────────────────────────────────────────────
// fine-grained reactive primitives (signal/computed/effect/watch)

export { signal, computed, effect, stop, batch, untrack, watch, watchEffect, isSignal, toSignal } from './signals'

// ── keyed reconciliation, fragments, SVG, refs ─────────────────────────────

export { keyed, fragment, svg, createRef, setRef, moveChild } from './reconcile'

// ── component model: options, props, slots, DI, lazy, boundaries ───────────

export { defineComponent, normalizeProps, validateProps, pushOwner, popOwner, provide, inject, renderSlot, lazyComponent, withErrorBoundary } from './components'
export type { PropDef, ComponentOptions, SetupContext } from './components'

// ── global store ────────────────────────────────────────────────────────────

export { createStore } from './store'
export type { Getter, Action, ActionContext, PersistOptions, StoreOptions, Mutation, Store } from './store'

// ── routing utilities: query, matching, guards, lazy, scroll ───────────────

export { parseQuery, stringifyQuery, joinPaths, matchPath, resolveRedirect, createGuards, lazyRoute, scrollToId } from './routing'
export type { RedirectRule, GuardFn } from './routing'

// ── forms: validators, useForm, two-way model binding ──────────────────────

export { required, minLength, maxLength, pattern, email, isNumber, min, max, oneOf, custom, validateField, useForm, bindModel } from './forms'
export type { Validator, FieldDef } from './forms'

// ── i18n ────────────────────────────────────────────────────────────────────

export { createI18n, plural } from './i18n'
export type { Messages, I18nOptions, I18n } from './i18n'

// ── transitions ─────────────────────────────────────────────────────────────

export { fade, slide, cssTransition, prefersReducedMotion } from './transition'
export type { El } from './transition'

// ── http client ─────────────────────────────────────────────────────────────

export { createHttpClient } from './http'
export type { HttpMethod, HttpRequest, HttpResponse, HttpInterceptor, HttpClientOptions } from './http'

// ── async tasks ─────────────────────────────────────────────────────────────

export { useTask } from './tasks'
export type { TaskStatus, TaskOptions, Task } from './tasks'

// ── devtools ────────────────────────────────────────────────────────────────

export { connectDevtools, recordEvent, getHook } from './devtools'
export type { DevEvent, DevEventKind, TreeNode, DevtoolsHandle } from './devtools'

// ── accessibility helpers ───────────────────────────────────────────────────

export { trapFocus, announce, setExpanded, setPressed, setSelected, labelBy, skipLink } from './a11y'
export type { A11yEl } from './a11y'

// ── $runtime object ────────────────────────────────────────────────────────
// the compiled output imports $runtime and calls methods on it
// this is the single object the compiler references

import { createState, $update, $toggle, $reset, $batch, registerDep } from './state'
import { $fetch } from './fetch'
import { $if, $each, $show, $portal, bind, bindClass, bindAttr, applyClass, resolveStyles, text } from './render'
import { createStyles } from './styles'
import { register, unregister, getAll, getById } from './registry'
import { registerEvents, flushMountCallbacks } from './events'
import { $ } from './selector'
import { $navigate, $back, $forward, $params } from './router'
import { pushOwner, popOwner } from './components'

export const $runtime = {
  // selector
  $,
  params: $params,
  navigate: $navigate,
  back: $back,
  forward: $forward,
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
  applyClass,
  resolveStyles,
  text,

  // slots — renders a named children builder passed by the parent,
  // the fallback builder, or a comment anchor when neither exists
  slot(
    slots: Record<string, (() => HTMLElement) | undefined>,
    name: string,
    fallback?: () => HTMLElement
  ): HTMLElement | Comment {
    const fn = slots[name]
    if (typeof fn === 'function') return fn()
    if (fallback) return fallback()
    return document.createComment(`slot:${name}`)
  },

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
    if (factory) {
      // owner tracking powers provide/inject across the factory boundary
      pushOwner({ name, provides: new Map<unknown, unknown>() })
      try {
        return factory(props)
      } finally {
        popOwner()
      }
    }
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