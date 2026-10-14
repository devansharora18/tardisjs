// src/runtime/devtools.ts
// Minimal devtools hook: event log + flat component tree. No DOM, no timers.
// Integrates with registry.ts read-only (getAll); never mutates it.

import { getAll } from './registry'

export type DevEventKind = 'mount' | 'destroy' | 'update' | 'route' | 'state' | 'error'

export interface DevEvent {
  seq: number
  at: number
  kind: DevEventKind
  label: string
  detail?: unknown
}

// Flat: the registry stores no parent links, so every instance is a root.
export interface TreeNode {
  name: string
  id: string
  children: TreeNode[]
}

export interface DevtoolsHandle {
  events(): DevEvent[]
  clear(): void
  tree(): TreeNode[]
  subscribe(fn: (e: DevEvent) => void): () => void
  disconnect(): void
}

const DEFAULT_MAX_EVENTS = 500

let connected = false
let seq = 0
let cap = DEFAULT_MAX_EVENTS
let buffer: DevEvent[] = []
const subscribers = new Set<(e: DevEvent) => void>()
// Registry exposes no name listing, so remember mount labels to enumerate it.
const knownNames = new Set<string>()

export function connectDevtools(opts?: { maxEvents?: number }): DevtoolsHandle {
  connected = true
  cap = opts?.maxEvents ?? DEFAULT_MAX_EVENTS
  buffer = []
  subscribers.clear()
  return { events, clear, tree, subscribe, disconnect }
}

// Cheap global gate: no-op unless connected.
export function recordEvent(kind: DevEventKind, label: string, detail?: unknown): void {
  if (!connected) return
  const e: DevEvent = { seq: seq++, at: Date.now(), kind, label }
  if (detail !== undefined) e.detail = detail
  buffer.push(e)
  if (buffer.length > cap) buffer.splice(0, buffer.length - cap)
  if (kind === 'mount') knownNames.add(label)
  for (const fn of subscribers) {
    try {
      fn(e)
    } catch {
      // one bad subscriber must not break the others
    }
  }
}

export function getHook(): { connected: boolean } {
  return { connected }
}

function events(): DevEvent[] {
  return buffer.slice()
}

function clear(): void {
  buffer = []
}

function subscribe(fn: (e: DevEvent) => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

// disconnect clears subscribers AND the buffer; the seq counter keeps going.
function disconnect(): void {
  connected = false
  buffer = []
  subscribers.clear()
}

function tree(): TreeNode[] {
  const out: TreeNode[] = []
  for (const name of knownNames) {
    for (const inst of getAll(name)) {
      out.push({ name: inst.name, id: inst.id, children: [] })
    }
  }
  return out
}
