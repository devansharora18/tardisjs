// src/runtime/store.ts — global store built on the state primitives in ./state.

import { createState, $update, type ReactiveState, type StateValue } from './state'

export type Getter<S> = (state: S) => unknown
export type Action<S> = (ctx: ActionContext<S>, ...args: unknown[]) => unknown

export interface ActionContext<S> {
  state: S
  get: (name: string) => unknown
  set: (patch: Partial<S>) => void
  reset: () => void
}

export interface PersistOptions {
  key: string
  storage?: {
    getItem(k: string): string | null
    setItem(k: string, v: string): void
  }
}

export interface StoreOptions<S extends Record<string, unknown>> {
  state: S
  getters?: Record<string, Getter<S>>
  actions?: Record<string, Action<S>>
  persist?: PersistOptions
}

export interface Mutation {
  type: string
  payload: unknown[]
}

export interface Store<S> {
  state: S
  get(name: string): unknown
  call(name: string, ...args: unknown[]): unknown
  subscribe(listener: (mutation: Mutation) => void): () => void
  reset(): void
}

// Deep clone via structuredClone when available, JSON round-trip otherwise.
function clone<T>(value: T): T {
  const sc = (globalThis as unknown as { structuredClone?: (v: T) => T }).structuredClone
  if (typeof sc === 'function') {
    try {
      return sc(value)
    } catch {
      // fall through to JSON clone
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

function resolveStorage(
  explicit: PersistOptions['storage']
): PersistOptions['storage'] | undefined {
  if (explicit) return explicit
  const ls = (globalThis as unknown as { localStorage?: PersistOptions['storage'] }).localStorage
  return ls ?? undefined
}

export function createStore<S extends Record<string, unknown>>(
  options: StoreOptions<S>
): Store<S> {
  const getters: Record<string, Getter<S>> = options.getters ?? {}
  const actions: Record<string, Action<S>> = options.actions ?? {}

  // Pristine baseline for reset; the live proxy gets its own clone so nested
  // objects are never reference-shared with the caller or the baseline.
  const initial = clone(options.state)
  const state = createState(
    clone(options.state) as unknown as Record<string, StateValue>
  ) as unknown as S
  const reactive = state as unknown as ReactiveState

  const persistOpt = options.persist
  const storage = persistOpt ? resolveStorage(persistOpt.storage) : undefined

  const listeners = new Set<(mutation: Mutation) => void>()

  function notify(mutation: Mutation): void {
    // Isolate subscribers: one throwing listener must not break the rest.
    for (const listener of [...listeners]) {
      try {
        listener(mutation)
      } catch {
        // ignore subscriber errors
      }
    }
  }

  function persistWrite(): void {
    if (!persistOpt || !storage) return
    try {
      storage.setItem(persistOpt.key, JSON.stringify(state))
    } catch {
      // ignore quota / serialization failures
    }
  }

  // Hydrate: shallow-merge stored JSON over state; corrupt data is ignored.
  if (persistOpt && storage) {
    try {
      const raw = storage.getItem(persistOpt.key)
      if (raw != null) {
        const parsed: unknown = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            $update(reactive, key, value as StateValue)
          }
        }
      }
    } catch {
      // ignore corrupt stored JSON
    }
  }

  function get(name: string): unknown {
    const fn = getters[name]
    if (!fn) throw new Error(`Unknown getter/action: ${name}`)
    // No caching: evaluated inside the caller's effect so reactive reads
    // (via withEffect UI bindings) track the underlying state keys.
    return fn(state)
  }

  function resetStore(): void {
    const fresh = clone(initial)
    for (const [key, value] of Object.entries(fresh)) {
      $update(reactive, key, value as StateValue)
    }
    notify({ type: 'reset', payload: [] })
    persistWrite()
  }

  function set(patch: Partial<S>): void {
    for (const [key, value] of Object.entries(patch)) {
      $update(reactive, key, value as StateValue)
    }
  }

  const ctx: ActionContext<S> = {
    state,
    get: (name: string) => get(name),
    set,
    reset: () => resetStore(),
  }

  function call(name: string, ...args: unknown[]): unknown {
    const fn = actions[name]
    if (!fn) throw new Error(`Unknown getter/action: ${name}`)
    // Notify (and persist) only on success: a throwing action propagates
    // without notifying subscribers or writing storage.
    const result = fn(ctx, ...args)
    notify({ type: name, payload: args })
    persistWrite()
    return result
  }

  function subscribe(listener: (mutation: Mutation) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    state,
    get,
    call,
    subscribe,
    reset: resetStore,
  }
}
