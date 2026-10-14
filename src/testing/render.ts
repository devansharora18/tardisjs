// src/testing/render.ts
// Test renderer for blueprint authors: runs real .tardis source through the
// real lex → parse → compile pipeline, then evaluates the emitted component
// against the real runtime inside the ambient jsdom document.
//
// Approach: `typescript` is a production dependency (also used by
// test/examples/site-behavior.test.ts), so types are stripped with
// ts.transpileModule — no regex type-stripping and no reimplemented
// semantics. The tardisjs/runtime import is dropped because the real
// $runtime object is injected as a function parameter instead.
// Requires a DOM (run tests with `// @vitest-environment jsdom`).
// Cross-blueprint components resolve via window.__tardis_<Name>, which the
// test can assign before rendering.

import ts from 'typescript'
import { lex } from '../lexer/lexer'
import { parse } from '../parser/parser'
import { compile } from '../compiler/compiler'
import { $runtime } from '../runtime/index'
import {
  flushMountCallbacks,
  flushDestroyCallbacks,
  flushUpdateCallbacks,
  clearEvents,
} from '../runtime/events'
import { clearRegistry } from '../runtime/registry'

export interface RenderOptions {
  props?: Record<string, unknown>
}

export interface RenderResult {
  root: HTMLElement
  document: Document
  window: Window & typeof globalThis
  cleanup(): void
}

export type BlueprintComponent = (props?: Record<string, unknown>) => HTMLElement

function requireDom(): { document: Document; window: Window & typeof globalThis } {
  const g = globalThis as unknown as Record<string, unknown>
  const document = g['document'] as Document | undefined
  const window = g['window'] as (Window & typeof globalThis) | undefined
  if (!document || !window || typeof document.createElement !== 'function') {
    throw new Error('renderBlueprint needs a DOM — add `// @vitest-environment jsdom` to the test file')
  }
  return { document, window }
}

function toComponent(compiled: string, name: string): BlueprintComponent {
  const js = ts.transpileModule(compiled, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  const body =
    js
      .replace(/import\s+[^;]+?\sfrom\s+['"][^'"]+['"];?/g, '')
      .replace(/export\s+default\s+/g, '')
      .replace(/export\s+(?=async\s+function|function|const|let|var|class)/g, '') +
    `\nreturn ${name};`
  const factory = new Function('$runtime', body) as (
    rt: typeof $runtime,
  ) => BlueprintComponent
  return factory($runtime)
}

export function renderBlueprint(source: string, opts?: RenderOptions): RenderResult {
  const { document, window } = requireDom()
  const ast = parse(lex(source), 'test.tardis')
  const name = ast.name
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error(`invalid blueprint name: ${name}`)
  const component = toComponent(compile(ast), name)

  // Script blocks run inside requestAnimationFrame; run them synchronously
  // when the environment provides no rAF (plain jsdom). Restored on cleanup.
  const g = globalThis as unknown as Record<string, unknown>
  const prevRaf = g['requestAnimationFrame']
  if (typeof prevRaf !== 'function') {
    g['requestAnimationFrame'] = (fn: FrameRequestCallback): number => {
      fn(0)
      return 0
    }
  }

  const container = document.createElement('div')
  container.setAttribute('data-test-blueprint', name)
  document.body.appendChild(container)
  const root = component(opts?.props ?? {}) as HTMLElement
  container.appendChild(root)
  flushMountCallbacks()

  let cleaned = false
  return {
    root,
    document,
    window,
    cleanup(): void {
      if (cleaned) return
      cleaned = true
      container.remove()
      clearEvents()
      clearRegistry()
      if (typeof prevRaf === 'function') g['requestAnimationFrame'] = prevRaf
      else delete g['requestAnimationFrame']
    },
  }
}

// mountHtml parses static HTML into an attached container for
// selector/event tests that need no blueprint compilation.
export function mountHtml(html: string): { container: HTMLElement; cleanup(): void } {
  const { document } = requireDom()
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return {
    container,
    cleanup(): void {
      container.remove()
    },
  }
}

// flushAll drains the mount/update/destroy callback queues (see runtime/events).
export function flushAll(): void {
  flushMountCallbacks()
  flushUpdateCallbacks()
  flushDestroyCallbacks()
}
