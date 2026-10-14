// Client takeover for server-rendered markup.
//
// The compiler emits plain DOM construction, so there is no virtual tree to
// reconcile against. Hydration here is a *verified remount*: the factory runs
// into a detached container, its markup is compared byte-for-byte with what
// the server sent, and only then does it replace the server nodes. Because
// rendering is deterministic (same factory + same props = same markup),
// a match means no visual flash; a mismatch still mounts correctly and
// reports through onMismatch instead of failing silently.
//
// What this deliberately does NOT do: adopt server nodes in place. Bindings
// target the fresh nodes. True adoption is future work; this contract keeps
// SEO markup, eliminates flash-of-different-content, and stays honest about
// the tradeoff.

import { flushMountCallbacks } from '../runtime/events'
import type { ComponentFactory } from './render'

export interface HydrateMismatch {
  server: string
  client: string
}

export interface HydrateOptions {
  props?: Record<string, unknown>
  onMismatch?: (info: HydrateMismatch) => void
}

function requireDocument(): Document {
  const g = globalThis as unknown as Record<string, unknown>
  const document = g['document'] as Document | undefined
  if (!document || typeof document.createElement !== 'function') {
    throw new Error('hydrate() needs a DOM — it runs in the browser, not on the server')
  }
  return document
}

export function hydrate(
  factory: ComponentFactory,
  container: Element,
  opts: HydrateOptions = {}
): Element {
  const document = requireDocument()
  const serverHtml = container.innerHTML
  const staging = document.createElement('div')
  const root = factory(opts.props ?? {}) as unknown as Node
  staging.appendChild(root)
  const clientHtml = staging.innerHTML
  if (serverHtml !== clientHtml) {
    const info: HydrateMismatch = { server: serverHtml, client: clientHtml }
    if (opts.onMismatch) opts.onMismatch(info)
    else console.warn('[tardis] hydration mismatch: server markup differs, remounted anyway')
  }
  container.innerHTML = ''
  container.appendChild(root)
  flushMountCallbacks()
  const mounted = container.firstElementChild ?? (container as unknown as Element)
  return mounted as Element
}
