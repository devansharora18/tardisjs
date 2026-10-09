// src/runtime/events.ts

interface EventHandlers {
  onMount?: () => void
  onDestroy?: () => void
  onUpdate?: () => void
}

// stores pending mount callbacks to be called after DOM insertion
const mountCallbacks: (() => void)[] = []
const destroyCallbacks: (() => void)[] = []
const updateCallbacks: (() => void)[] = []

function removeFrom(queue: (() => void)[], cb: () => void): void {
  const i = queue.indexOf(cb)
  if (i >= 0) queue.splice(i, 1)
}

export function registerEvents(handlers: EventHandlers): () => void {
  if (handlers.onMount) {
    mountCallbacks.push(handlers.onMount)
  }
  if (handlers.onDestroy) {
    destroyCallbacks.push(handlers.onDestroy)
  }
  if (handlers.onUpdate) {
    updateCallbacks.push(handlers.onUpdate)
  }
  return () => {
    if (handlers.onMount) removeFrom(mountCallbacks, handlers.onMount)
    if (handlers.onDestroy) removeFrom(destroyCallbacks, handlers.onDestroy)
    if (handlers.onUpdate) removeFrom(updateCallbacks, handlers.onUpdate)
  }
}

function flushQueue(queue: (() => void)[]): void {
  const pending = queue.splice(0, queue.length)
  for (const cb of pending) {
    try {
      cb()
    } catch (err) {
      console.error(err)
    }
  }
}

export function flushMountCallbacks(): void {
  flushQueue(mountCallbacks)
}

export function flushDestroyCallbacks(): void {
  flushQueue(destroyCallbacks)
}

export function flushUpdateCallbacks(): void {
  flushQueue(updateCallbacks)
}

export function clearEvents(): void {
  mountCallbacks.length = 0
  destroyCallbacks.length = 0
  updateCallbacks.length = 0
}	