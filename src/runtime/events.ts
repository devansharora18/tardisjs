// src/runtime/events.ts

interface EventHandlers {
  onMount?: () => void
  onDestroy?: () => void
  onUpdate?: () => void
}

// stores pending mount callbacks to be called after DOM insertion
const mountCallbacks: (() => void)[] = []
const destroyCallbacks: (() => void)[] = []

export function registerEvents(handlers: EventHandlers): void {
  if (handlers.onMount) {
    mountCallbacks.push(handlers.onMount)
  }
  if (handlers.onDestroy) {
    destroyCallbacks.push(handlers.onDestroy)
  }
}

export function flushMountCallbacks(): void {
  while (mountCallbacks.length > 0) {
    const cb = mountCallbacks.shift()!
    cb()
  }
}

export function flushDestroyCallbacks(): void {
  while (destroyCallbacks.length > 0) {
    const cb = destroyCallbacks.shift()!
    cb()
  }
}	