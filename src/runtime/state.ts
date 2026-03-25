// src/runtime/state.ts

export type StateValue = string | number | boolean | unknown[] | Record<string, unknown> | null
export type ReactiveState = Record<string, StateValue>

// internal dep map — keyed by state object identity
const depMap = new WeakMap<object, Map<string, Set<() => void>>>()

let batchQueue: Set<() => void> | null = null

export function $batch(fn: () => void): void {
  batchQueue = new Set()
  fn()
  const queue = batchQueue
  batchQueue = null
  requestAnimationFrame(() => {
    queue.forEach(updater => updater())
  })
}

export function createState(initial: Record<string, StateValue>): ReactiveState {
  const raw = { ...initial }
  const deps = new Map<string, Set<() => void>>()

  for (const key of Object.keys(raw)) {
    deps.set(key, new Set())
  }

  const proxy = new Proxy(raw, {
    get(target, key: string) {
      return target[key]
    },
    set(target, key: string, value: StateValue) {
      target[key] = value
      const updaters = deps.get(key)
      if (updaters) {
        if (batchQueue) {
          updaters.forEach(fn => batchQueue!.add(fn))
        } else {
          updaters.forEach(fn => fn())
        }
      }
      return true
    }
  })

  depMap.set(proxy, deps)
  return proxy
}

export function registerDep(
  state: ReactiveState,
  key: string,
  updater: () => void
): void {
  const deps = depMap.get(state)
  if (deps) {
    if (!deps.has(key)) deps.set(key, new Set())
    deps.get(key)!.add(updater)
  }
}

export function $update(state: ReactiveState, key: string, value: StateValue): void {
  state[key] = value
}

export function $toggle(state: ReactiveState, key: string): void {
  state[key] = !state[key] as boolean
}

export function $reset(
  state: ReactiveState,
  initial: Record<string, StateValue>
): void {
  for (const [key, val] of Object.entries(initial)) {
    state[key] = val
  }
}