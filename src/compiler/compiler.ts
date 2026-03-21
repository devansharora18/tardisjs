import { BlueprintNode, PropNode, StateNode, ComputedNode, MethodNode, StyleNode, PropType } from '../parser/types'

export function compile(ast: BlueprintNode): string {
  const lines: string[] = []

  // ── file header ──────────────────────────────────────────────────────────
  lines.push(`// generated from ${ast.name}.tardis — do not edit`)
  lines.push(`// edit the .tardis source file instead`)
  lines.push(`import { $runtime } from 'tardisjs/runtime'`)
  lines.push(``)

  // ── props type ────────────────────────────────────────────────────────────
  lines.push(compilePropsType(ast.name, ast.props))
  lines.push(``)

  // ── component function ────────────────────────────────────────────────────
  lines.push(`export function ${ast.name}(props: ${ast.name}Props = {}) {`)

  // props with defaults
  lines.push(compilePropsDefaults(ast.props))
  lines.push(``)

  // state
  if (ast.state.length > 0) {
    lines.push(compileState(ast.state))
    lines.push(``)
  }

  // computed
  if (ast.computed.length > 0) {
    lines.push(compileComputed(ast.computed))
    lines.push(``)
  }

  // methods
  if (ast.methods.length > 0) {
    lines.push(compileMethods(ast.methods))
    lines.push(``)
  }

  // events
  if (ast.events.onMount || ast.events.onDestroy || ast.events.onUpdate) {
    lines.push(compileEvents(ast))
    lines.push(``)
  }

  // style
  if (ast.style) {
    lines.push(compileStyle(ast.style))
    lines.push(``)
  }

  // register component instance
  const registrations = []
  if (ast.state.length > 0) registrations.push('state: _state')
  if (ast.methods.length > 0) registrations.push('methods: _methods')
	lines.push(`  $runtime.register('${ast.name}', { ${registrations.join(', ')} })`)
	lines.push(``)

  lines.push(`  return $runtime.placeholder('${ast.name}')`)

  lines.push(`}`)

  return lines.join('\n')
}

// ── props type ─────────────────────────────────────────────────────────────

function compilePropsType(name: string, props: PropNode[]): string {
  if (props.length === 0) {
    return `type ${name}Props = Record<string, never>`
  }

  const fields = props.map(p => {
    const tsType = propTypeToTS(p.type)
    const optional = p.default !== null || p.type === 'function' ? '?' : ''
    return `  ${p.name}${optional}: ${tsType}`
  })

  return `type ${name}Props = {\n${fields.join('\n')}\n}`
}

function propTypeToTS(type: PropType): string {
  if (Array.isArray(type)) {
    // union type — ["primary", "ghost"] → "primary" | "ghost"
    return type.map(v => `"${v}"`).join(' | ')
  }
  switch (type) {
    case 'string':   return 'string'
    case 'number':   return 'number'
    case 'boolean':  return 'boolean'
    case 'array':    return 'unknown[]'
    case 'object':   return 'Record<string, unknown>'
    case 'function': return '(...args: unknown[]) => unknown'
    default:         return 'unknown'
  }
}

// ── props defaults ─────────────────────────────────────────────────────────

function compilePropsDefaults(props: PropNode[]): string {
  if (props.length === 0) {
    return `  const _props = { ...props }`
  }

  const defaults = props
    .filter(p => p.default !== null)
    .map(p => {
      const val = formatDefault(p.default, p.type)
      return `    ${p.name}: ${val}`
    })

  if (defaults.length === 0) {
    return `  const _props = { ...props }`
  }

  return [
    `  const _props = {`,
    defaults.join(',\n'),
    `    ...props`,
    `  }`,
  ].join('\n')
}

function formatDefault(val: string | number | boolean | null, type: PropType): string {
  if (val === null) return 'undefined'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return String(val)
  if (val === '[]') return '[]'
  if (val === '{}') return '{}'
  // expression reference like props.initial — use as-is but prefix with _
  if (typeof val === 'string' && val.startsWith('props.')) {
    return val.replace('props.', '_props.')
  }
  if (typeof val === 'string' && val.startsWith('state.')) {
    return val.replace('state.', '_state.')
  }
  // plain string default
  if (Array.isArray(type) || type === 'string') {
    return `"${val}"`
  }
  return String(val)
}

// ── state ──────────────────────────────────────────────────────────────────

function compileState(state: StateNode[]): string {
  const entries = state.map(s => {
    const val = formatDefault(s.default, s.type)
    return `    ${s.name}: ${val}`
  })

  return [
    `  const _state = $runtime.state({`,
    entries.join(',\n'),
    `  })`,
  ].join('\n')
}

// ── computed ───────────────────────────────────────────────────────────────

function compileComputed(computed: ComputedNode[]): string {
  const getters = computed.map(c => {
    // replace state.x with _state.x and props.x with _props.x
    const expr = rewriteRefs(c.expr)
    return `    get ${c.name}() { return ${expr} }`
  })

  return [
    `  const _computed = {`,
    getters.join(',\n'),
    `  }`,
  ].join('\n')
}

// ── methods ────────────────────────────────────────────────────────────────

function compileMethods(methods: MethodNode[]): string {
  const fns = methods.map(m => {
    const params = m.params.join(', ')
    const body = rewriteRefs(m.body)
    return `    ${m.name}: (${params}) => ${body}`
  })

  return [
    `  const _methods = {`,
    fns.join(',\n'),
    `  }`,
  ].join('\n')
}

// ── events ─────────────────────────────────────────────────────────────────

function compileEvents(ast: BlueprintNode): string {
  const lines: string[] = []

  lines.push(`  $runtime.events({`)

  if (ast.events.onMount) {
    const body = rewriteRefs(ast.events.onMount)
    lines.push(`    onMount: () => { ${body} },`)
  }

  if (ast.events.onDestroy) {
    const body = rewriteRefs(ast.events.onDestroy)
    lines.push(`    onDestroy: () => { ${body} },`)
  }

  if (ast.events.onUpdate) {
    const body = rewriteRefs(ast.events.onUpdate)
    lines.push(`    onUpdate: () => { ${body} },`)
  }

  lines.push(`  })`)

  return lines.join('\n')
}

// ── style ──────────────────────────────────────────────────────────────────

function compileStyle(style: StyleNode): string {
  const rules = style.rules.map(r => {
    return `    "${r.key}": "${r.value}"`
  })

  return [
    `  const _styles = $runtime.styles("${style.mode}", {`,
    rules.join(',\n'),
    `  }, _props, _state)`,
  ].join('\n')
}

// ── ref rewriter ───────────────────────────────────────────────────────────
// rewrites state.x → _state.x, props.x → _props.x
// computed.x → _computed.x, methods.x → _methods.x

function rewriteRefs(expr: string): string {
  return expr
    .replace(/(?<![_a-zA-Z])state\./g, '_state.')
    .replace(/(?<![_a-zA-Z])props\./g, '_props.')
    .replace(/(?<![_a-zA-Z])computed\./g, '_computed.')
    .replace(/(?<![_a-zA-Z])methods\./g, '_methods.')
}