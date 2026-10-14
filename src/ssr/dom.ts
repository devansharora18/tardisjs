// Minimal DOM shim for server-side rendering.
//
// Implements exactly the surface the compiler emits and the render path
// touches during initial mount: element/text/comment creation, tree building,
// attributes, className/textContent, style objects, and no-op listeners.
// Anything interactive (listeners, focus, scrolling, queries) is stubbed or
// recorded — SSR output is markup, not behavior. Scripts never run here.

export type MiniNodeType = 'element' | 'text' | 'comment' | 'fragment'

export interface MiniNode {
  readonly nodeType: string
  parentNode: MiniElement | null
}

export interface MiniElement extends MiniNode {
  readonly tag: string
  readonly namespace: string | null
  attrs: Record<string, string>
  className: string
  textContent: string | null
  style: Record<string, string>
  children: MiniNode[]
  appendChild<T extends MiniNode>(child: T): T
  insertBefore<T extends MiniNode>(child: T, anchor: MiniNode | null): T
  replaceChild<T extends MiniNode>(next: T, prev: MiniNode): T
  removeChild<T extends MiniNode>(child: T): T
  remove(): void
  setAttribute(key: string, value: string): void
  removeAttribute(key: string): void
  getAttribute(key: string): string | null
  addEventListener(_type: string, _fn: (...args: never[]) => void): void
  removeEventListener(_type: string, _fn: (...args: never[]) => void): void
  querySelector(_sel: string): MiniElement | null
  querySelectorAll(_sel: string): MiniElement[]
}

export interface MiniText extends MiniNode {
  textContent: string | null
}

export interface MiniComment extends MiniNode {
  textContent: string | null
}

// Brand class so compiled `instanceof Node` checks pass under the shim.
// installGlobals installs this as globalThis.Node; every node created below
// carries it on its prototype chain.

export class MiniNodeBrand {}

function brand<T extends object>(obj: T): T {
  Object.setPrototypeOf(obj, MiniNodeBrand.prototype)
  return obj
}

function makeBase(nodeType: string): MiniNode {
  return brand({ nodeType, parentNode: null } as MiniNode)
}

function detach<NodeT extends MiniNode>(child: NodeT): NodeT {
  if (child.parentNode) {
    const siblings = child.parentNode.children
    const at = siblings.indexOf(child)
    if (at >= 0) siblings.splice(at, 1)
    child.parentNode = null
  }
  return child
}

export function createMiniElement(tag: string, namespace: string | null = null): MiniElement {
  const el = makeBase('element') as MiniElement
  ;(el as { tag: string }).tag = tag.toLowerCase()
  ;(el as { namespace: string | null }).namespace = namespace
  el.attrs = {}
  el.className = ''
  el.style = {}
  el.children = []
  // IDL reflections exist only where real elements have them: without these
  // own properties, `prop in el` checks in bind() would drop form bindings.
  // Other tags behave like real DOM and ignore value/checked writes.
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option' || tag === 'button') {
    ;(el as unknown as Record<string, unknown>).value = ''
    ;(el as unknown as Record<string, unknown>).checked = false
  }
  // Mirrors real DOM semantics: assigning textContent replaces children.
  let text: string | null = null
  Object.defineProperty(el, 'textContent', {
    get: () => text,
    set: (value: string | null) => {
      text = value === null || value === undefined ? null : String(value)
      if (text !== null) {
        for (const child of el.children) child.parentNode = null
        el.children = []
      }
    },
    enumerable: true,
    configurable: true,
  })
  el.appendChild = <T extends MiniNode>(child: T): T => {
    detach(child)
    child.parentNode = el
    el.children.push(child)
    return child
  }
  el.insertBefore = <T extends MiniNode>(child: T, anchor: MiniNode | null): T => {
    detach(child)
    child.parentNode = el
    if (anchor === null) {
      el.children.push(child)
    } else {
      const at = el.children.indexOf(anchor)
      if (at < 0) el.children.push(child)
      else el.children.splice(at, 0, child)
    }
    return child
  }
  el.replaceChild = <T extends MiniNode>(next: T, prev: MiniNode): T => {
    const at = el.children.indexOf(prev)
    detach(next)
    next.parentNode = el
    if (at < 0) el.children.push(next)
    else el.children[at] = next
    prev.parentNode = null
    return next
  }
  el.removeChild = <T extends MiniNode>(child: T): T => {
    const at = el.children.indexOf(child)
    if (at >= 0) el.children.splice(at, 1)
    child.parentNode = null
    return child
  }
  el.remove = (): void => {
    detach(el)
  }
  el.setAttribute = (key: string, value: string): void => {
    el.attrs[key] = String(value)
  }
  el.removeAttribute = (key: string): void => {
    delete el.attrs[key]
  }
  el.getAttribute = (key: string): string | null => {
    return Object.prototype.hasOwnProperty.call(el.attrs, key) ? el.attrs[key] : null
  }
  el.addEventListener = (): void => {}
  el.removeEventListener = (): void => {}
  el.querySelector = (): MiniElement | null => null
  el.querySelectorAll = (): MiniElement[] => []
  return el
}

export function createMiniText(text: string): MiniText {
  const node = makeBase('text') as MiniText
  node.textContent = String(text ?? '')
  return node
}

export function createMiniComment(text: string): MiniComment {
  const node = makeBase('comment') as MiniComment
  node.textContent = String(text ?? '')
  return node
}

export interface MiniDocument {
  head: MiniElement
  body: MiniElement
  createElement(tag: string): MiniElement
  createElementNS(ns: string, tag: string): MiniElement
  createTextNode(text: string): MiniText
  createComment(text: string): MiniComment
  createDocumentFragment(): MiniElement
}

export function createMiniDocument(): MiniDocument {
  const head = createMiniElement('head')
  const body = createMiniElement('body')
  return {
    head,
    body,
    createElement: (tag: string) => createMiniElement(tag),
    createElementNS: (ns: string, tag: string) => createMiniElement(tag, ns),
    createTextNode: (text: string) => createMiniText(text),
    createDocumentFragment: () => {
      const frag = createMiniElement('fragment')
      return frag
    },
    createComment: (text: string) => createMiniComment(text),
  }
}
