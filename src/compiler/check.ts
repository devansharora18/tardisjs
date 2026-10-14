// Static template checker for .tardis blueprints — pure analysis, no codegen.
// Scans raw expression strings with regexes (mirroring the ref shapes that
// rewriteRefs in compiler.ts handles) and reports semantic mistakes.
import type { BlueprintNode, FileNode } from '../parser/types'

export interface CheckDiagnostic {
  file: string
  line: number
  col: number
  code: string
  message: string
  hint?: string
}

// Helpers the compiler/runtime understand. $runtime.* covers all runtime
// calls ($runtime.update, $runtime.params, ...); $el is only valid in script.
const KNOWN_HELPERS = new Set([
  '$update', '$toggle', '$reset', '$batch',
  '$if', '$each', '$show',
  '$navigate', '$back', '$forward', '$params', '$fetch', '$portal',
  '$runtime',
])

const HELPER_RE = /\$[A-Za-z_][\w$]*/g
const REF_RES: Array<{ kind: 'state' | 'props' | 'computed' | 'methods'; re: RegExp }> = [
  { kind: 'state', re: /(?<![_a-zA-Z])state\.([A-Za-z_$][\w$]*)/g },
  { kind: 'props', re: /(?<![_a-zA-Z])props\.([A-Za-z_$][\w$]*)/g },
  { kind: 'computed', re: /(?<![_a-zA-Z])computed\.([A-Za-z_$][\w$]*)/g },
  { kind: 'methods', re: /(?<![_a-zA-Z])methods\.([A-Za-z_$][\w$]*)/g },
]
// Reactive slot attributes are left in place by the compiler (builders are
// keyed at compile time), so the child silently lands in `default`.
const DYNAMIC_SLOT_RE = /slot\s*=\s*\{[^}]*\}/g

type Segment = {
  text: string
  line: number
  col: number
  allowEl: boolean
  ownerMethod?: string
}

function collectSegments(ast: BlueprintNode): Segment[] {
  const segs: Segment[] = []
  // Declaration defaults can reference props./state. (e.g. count = props.initial)
  for (const p of ast.props) {
    if (typeof p.default === 'string') segs.push({ text: p.default, line: p.line, col: p.col, allowEl: false })
  }
  for (const s of ast.state) {
    if (typeof s.default === 'string') segs.push({ text: s.default, line: s.line, col: s.col, allowEl: false })
  }
  for (const c of ast.computed) segs.push({ text: c.expr, line: c.line, col: c.col, allowEl: false })
  for (const m of ast.methods) segs.push({ text: m.body, line: m.line, col: m.col, allowEl: false, ownerMethod: m.name })
  // EventsNode carries no position — attribute issues to the blueprint.
  if (ast.events.onMount) segs.push({ text: ast.events.onMount, line: ast.line, col: ast.col, allowEl: false })
  if (ast.events.onDestroy) segs.push({ text: ast.events.onDestroy, line: ast.line, col: ast.col, allowEl: false })
  if (ast.events.onUpdate) segs.push({ text: ast.events.onUpdate, line: ast.line, col: ast.col, allowEl: false })
  segs.push({ text: ast.ui.raw, line: ast.ui.line, col: ast.ui.col, allowEl: false })
  if (ast.script) segs.push({ text: ast.script.raw, line: ast.script.line, col: ast.script.col, allowEl: true })
  return segs
}

// Best-effort typo hint: same word modulo case, else same initial + near length.
function suggest(unknown: string, known: string[]): string | undefined {
  const lower = unknown.toLowerCase()
  const exact = known.find((k) => k.toLowerCase() === lower)
  if (exact) return exact
  if (unknown.length === 0) return undefined
  return known.find((k) => k[0] === unknown[0] && Math.abs(k.length - unknown.length) <= 2)
}

function checkBlueprintInFile(ast: BlueprintNode, file: string): CheckDiagnostic[] {
  const out: CheckDiagnostic[] = []
  const stateNames = ast.state.map((s) => s.name)
  const propNames = ast.props.map((p) => p.name)
  const computedNames = ast.computed.map((c) => c.name)
  const methodNames = ast.methods.map((m) => m.name)
  const known: Record<string, string[]> = {
    state: stateNames, props: propNames, computed: computedNames, methods: methodNames,
  }
  const segs = collectSegments(ast)

  for (const seg of segs) {
    for (const m of seg.text.matchAll(HELPER_RE)) {
      const name = m[0]
      if (KNOWN_HELPERS.has(name)) continue
      if (name === '$el' && seg.allowEl) continue
      out.push({ file, line: seg.line, col: seg.col, code: 'unknown-helper', message: `unknown helper "${name}"` })
    }
  }

  for (const seg of segs) {
    for (const { kind, re } of REF_RES) {
      for (const m of seg.text.matchAll(re)) {
        const name = m[1]
        if (known[kind].includes(name)) continue
        const s = suggest(name, known[kind])
        out.push({
          file, line: seg.line, col: seg.col, code: 'unknown-ref',
          message: `unknown ${kind} reference "${kind}.${name}"`,
          ...(s ? { hint: `did you mean "${kind}.${s}"?` } : {}),
        })
      }
    }
  }

  for (const m of ast.ui.raw.matchAll(DYNAMIC_SLOT_RE)) {
    out.push({
      file, line: ast.ui.line, col: ast.ui.col, code: 'dynamic-slot',
      message: `reactive slot attribute "${m[0]}" is not routable — use a static slot="name"`,
    })
  }

  const used: Record<string, Set<string>> = {
    state: new Set(), props: new Set(), computed: new Set(), methods: new Set(),
  }
  for (const seg of segs) {
    for (const { kind, re } of REF_RES) {
      for (const m of seg.text.matchAll(re)) {
        // A method calling itself does not make it used.
        if (kind === 'methods' && seg.ownerMethod === m[1]) continue
        used[kind].add(m[1])
      }
    }
  }
  for (const s of ast.state) {
    if (!used.state.has(s.name)) {
      out.push({
        file, line: s.line, col: s.col, code: 'unused-state',
        message: `unused state "${s.name}"`, hint: `reference it as state.${s.name} or remove the declaration`,
      })
    }
  }
  for (const m of ast.methods) {
    if (!used.methods.has(m.name)) {
      out.push({
        file, line: m.line, col: m.col, code: 'unused-method',
        message: `unused method "${m.name}"`, hint: `call it as methods.${m.name} or remove the declaration`,
      })
    }
  }
  for (const p of ast.props) {
    if (!used.props.has(p.name)) {
      out.push({
        file, line: p.line, col: p.col, code: 'unused-prop',
        message: `unused prop "${p.name}"`, hint: `reference it as props.${p.name} or remove the declaration`,
      })
    }
  }

  return out
}

export function checkBlueprint(ast: BlueprintNode): CheckDiagnostic[] {
  return checkBlueprintInFile(ast, `${ast.name}.tardis`)
}

export function checkFile(file: FileNode): CheckDiagnostic[] {
  return checkBlueprintInFile(file.blueprint, file.file)
}
