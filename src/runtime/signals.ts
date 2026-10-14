// src/runtime/signals.ts

export interface Signal<T> {
  get(): T
  set(v: T): void
  peek(): T
  subscribe(fn: () => void): () => void
}

export interface Computed<T> {
  get(): T
  dispose(): void
}

export interface ReadonlySignal<T> {
  get(): T
}

const IS_SIGNAL = Symbol('tardisjs:isSignal')

function brand<T extends object>(obj: T): T {
  ;(obj as Record<symbol, unknown>)[IS_SIGNAL] = true
  return obj
}

class SignalNode<T> {
  readonly kind = 'signal' as const
  readonly _subs = new Set<ObserverNode>()
  constructor(public _value: T) {}
}

class ComputedNode<T> {
  readonly kind = 'computed' as const
  readonly _subs = new Set<ObserverNode>()
  readonly _deps = new Set<SourceNode>()
  _dirty = true
  _initialized = false
  _stopped = false
  _value: T | undefined = undefined
  constructor(public _fn: () => T) {}
}

class EffectNode {
  readonly kind = 'effect' as const
  readonly _deps = new Set<SourceNode>()
  _stopped = false
  _cleanup: (() => void) | undefined = undefined
  constructor(public _fn: () => void | (() => void)) {}
}

type SourceNode = SignalNode<unknown> | ComputedNode<unknown>
type ObserverNode = ComputedNode<unknown> | EffectNode

const observerStack: Array<ObserverNode | null> = []
let batchDepth = 0
const pendingEffects = new Set<EffectNode>()

function track(source: SourceNode): void {
  if (observerStack.length === 0) return
  const current = observerStack[observerStack.length - 1]
  if (current === null || current === undefined) return
  if (current._stopped) return
  if ((current as object) === (source as object)) return
  current._deps.add(source)
  source._subs.add(current)
}

function detach(observer: ObserverNode): void {
  if (observer._deps.size === 0) return
  for (const src of Array.from(observer._deps)) {
    src._subs.delete(observer)
  }
  observer._deps.clear()
}

function runEffect(node: EffectNode): void {
  if (node._stopped) return
  const prevCleanup = node._cleanup
  node._cleanup = undefined
  if (typeof prevCleanup === 'function') {
    try {
      untrack(prevCleanup)
    } catch (err) {
      console.error(err)
    }
  }
  detach(node)
  observerStack.push(node)
  try {
    const ret = node._fn()
    if (typeof ret === 'function') node._cleanup = ret
  } finally {
    observerStack.pop()
  }
}

function stopEffect(node: EffectNode): void {
  if (node._stopped) return
  node._stopped = true
  pendingEffects.delete(node)
  const cleanup = node._cleanup
  node._cleanup = undefined
  if (typeof cleanup === 'function') {
    try {
      untrack(cleanup)
    } catch (err) {
      console.error(err)
    }
  }
  detach(node)
}

function flushEffects(): void {
  while (pendingEffects.size > 0) {
    const current = Array.from(pendingEffects)
    pendingEffects.clear()
    for (const e of current) {
      if (e._stopped) continue
      try {
        runEffect(e)
      } catch (err) {
        console.error(err)
      }
    }
  }
}

// Collect downstream effects once per trigger so diamond graphs notify once.
// Marks dirty computeds synchronously; defers effect runs only when batching.
function trigger(source: SourceNode): void {
  const effects = new Set<EffectNode>()
  const visited = new Set<SourceNode>()
  visited.add(source)
  const queue: SourceNode[] = [source]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head]!
    head++
    for (const ob of Array.from(cur._subs)) {
      if (ob._stopped) continue
      if (ob.kind === 'computed') {
        if (!visited.has(ob)) {
          visited.add(ob)
          ob._dirty = true
          queue.push(ob)
        }
      } else {
        effects.add(ob)
      }
    }
  }
  if (effects.size === 0) return
  if (batchDepth > 0) {
    for (const e of effects) pendingEffects.add(e)
  } else {
    for (const e of effects) {
      if (e._stopped) continue
      try {
        runEffect(e)
      } catch (err) {
        console.error(err)
      }
    }
  }
}

export function signal<T>(initial: T): Signal<T> {
  const node = new SignalNode<T>(initial)
  const api: Signal<T> = {
    get(): T {
      track(node)
      return node._value
    },
    set(v: T): void {
      if (Object.is(node._value, v)) return
      node._value = v
      trigger(node)
    },
    peek(): T {
      return node._value
    },
    subscribe(fn: () => void): () => void {
      const listener = new EffectNode(() => {
        untrack(fn)
      })
      node._subs.add(listener)
      let active = true
      return () => {
        if (!active) return
        active = false
        listener._stopped = true
        node._subs.delete(listener)
        pendingEffects.delete(listener)
      }
    },
  }
  return brand(api)
}

export function computed<T>(fn: () => T): Computed<T> {
  const node = new ComputedNode<T>(fn)
  const api: Computed<T> = {
    get(): T {
      if (node._stopped) return node._value as T
      track(node)
      if (!node._initialized || node._dirty) {
        detach(node)
        observerStack.push(node)
        try {
          const value = node._fn()
          node._value = value
          node._dirty = false
          node._initialized = true
        } finally {
          observerStack.pop()
        }
      }
      return node._value as T
    },
    dispose(): void {
      if (node._stopped) return
      node._stopped = true
      detach(node)
      for (const downstream of Array.from(node._subs)) {
        downstream._deps.delete(node)
      }
      node._subs.clear()
    },
  }
  return brand(api)
}

export function effect(fn: () => void | (() => void)): () => void {
  const node = new EffectNode(fn)
  runEffect(node)
  return () => stopEffect(node)
}

export function stop(handle: () => void): void {
  handle()
}

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) flushEffects()
  }
}

export function untrack<T>(fn: () => T): T {
  observerStack.push(null)
  try {
    return fn()
  } finally {
    observerStack.pop()
  }
}

export function watch<T>(
  source: () => T,
  cb: (next: T, prev: T) => void,
  opts?: { immediate?: boolean },
): () => void {
  let prev!: T
  let initialized = false
  return effect(() => {
    const next = source()
    if (!initialized) {
      initialized = true
      prev = next
      if (opts?.immediate) untrack(() => cb(next, prev))
      return
    }
    if (Object.is(next, prev)) return
    const old = prev
    prev = next
    untrack(() => cb(next, old))
  })
}

export function watchEffect(fn: () => void | (() => void)): () => void {
  return effect(fn)
}

export function isSignal(v: unknown): boolean {
  if (v === null) return false
  if (typeof v !== 'object' && typeof v !== 'function') return false
  return (v as Record<symbol, unknown>)[IS_SIGNAL] === true
}

export function toSignal<T>(get: () => T): ReadonlySignal<T> {
  const inner = computed(get)
  const view: ReadonlySignal<T> = {
    get(): T {
      return inner.get()
    },
  }
  return brand(view)
}
