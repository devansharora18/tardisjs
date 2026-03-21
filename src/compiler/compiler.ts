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

	lines.push(compileUI(ast.ui.raw, ast.name))

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

// ── ui compiler ────────────────────────────────────────────────────────────

export function compileUI(raw: string, componentName: string): string {
  const lines: string[] = []
  lines.push(`  // ui`)
  lines.push(`  const _root = (() => {`)
  lines.push(compileUINode(raw.trim(), 2))
  lines.push(`  })()`)
  lines.push(`  return _root`)
  return lines.join('\n')
}

function compileUINode(raw: string, depth: number): string {
  const indent = '  '.repeat(depth)
  const lines: string[] = []

  // handle $if
  const ifMatch = raw.match(/^\$if\((.+?)\)\s*\{([\s\S]*)\}/)
  if (ifMatch) {
    const condition = rewriteRefs(ifMatch[1].trim())
    const inner = compileUINode(ifMatch[2].trim(), depth + 1)
    lines.push(`${indent}$runtime.if(() => ${condition}, () => {`)
    lines.push(inner)
    lines.push(`${indent}})`)
    return lines.join('\n')
  }

  // handle $each
  const eachMatch = raw.match(/^\$each\((.+?),\s*\((\w+)\)\s*=>\s*\{([\s\S]*)\}\s*\)/)
  if (eachMatch) {
    const arrayRef = rewriteRefs(eachMatch[1].trim())
    const itemVar = eachMatch[2]
    const inner = compileUINode(eachMatch[3].trim(), depth + 1)
    lines.push(`${indent}$runtime.each(() => ${arrayRef}, (${itemVar}) => {`)
    lines.push(inner)
    lines.push(`${indent}})`)
    return lines.join('\n')
  }

  // handle $show
  const showMatch = raw.match(/^\$show\((.+?)\)\s*\{([\s\S]*)\}/)
  if (showMatch) {
    const condition = rewriteRefs(showMatch[1].trim())
    const inner = compileUINode(showMatch[2].trim(), depth + 1)
    lines.push(`${indent}$runtime.show(() => ${condition}, () => {`)
    lines.push(inner)
    lines.push(`${indent}})`)
    return lines.join('\n')
  }

  // handle {} chain syntax
  const chainMatch = raw.match(/^\{([\s\S]+?)\}((?:\s*\.\w+\([^)]*\))+)/)
  if (chainMatch) {
    const innerEl = chainMatch[1].trim()
    const chainStr = chainMatch[2].trim()
    const elCode = compileElement(innerEl, depth)
    const chains = parseChains(chainStr)
    lines.push(`${indent}const _chained = (() => {`)
    lines.push(elCode)
    lines.push(`${indent}})()`)
    for (const chain of chains) {
      const handler = rewriteRefs(chain.handler)
      lines.push(`${indent}$runtime.chain(_chained, '${chain.event}', ${handler})`)
    }
    lines.push(`${indent}return _chained`)
    return lines.join('\n')
  }

  // regular element
  return compileElement(raw, depth)
}

function compileElement(raw: string, depth: number): string {
  const indent = '  '.repeat(depth)
  const lines: string[] = []

  // parse opening tag
  const tagMatch = raw.match(/^<(\w+)((?:\s+[^>]*)?)>([\s\S]*)<\/\1>$/) ||
                   raw.match(/^<(\w+)((?:\s+[^>]*)?)\s*\/>$/)

  if (!tagMatch) {
    // text node or expression
    if (raw.startsWith('{') && raw.endsWith('}')) {
      const expr = rewriteRefs(raw.slice(1, -1).trim())
      lines.push(`${indent}$runtime.text(() => ${expr})`)
    } else {
      lines.push(`${indent}$runtime.text(${JSON.stringify(raw.trim())})`)
    }
    return lines.join('\n')
  }

  const tag = tagMatch[1]
  const attrsRaw = tagMatch[2] || ''
  const children = tagMatch[3] || ''

  // check if this is a component (PascalCase) or DOM element
  const isComponent = /^[A-Z]/.test(tag)

  if (isComponent) {
    const props = compileComponentProps(attrsRaw)
    lines.push(`${indent}$runtime.component('${tag}', { ${props} })`)
    return lines.join('\n')
  }

  // DOM element
  lines.push(`${indent}const _el_${depth} = document.createElement('${tag}')`)

  // handle attributes
  const attrs = parseAttributes(attrsRaw)
  for (const attr of attrs) {
    if (attr.name.startsWith('@')) {
      // event handler
      const event = attr.name.slice(1)
      const handler = rewriteRefs(attr.value)
      lines.push(`${indent}_el_${depth}.addEventListener('${event}', ${handler})`)
    } else if (attr.name === 'class') {
      if (isReactive(attr.value)) {
        const expr = rewriteRefs(stripBraces(attr.value))
        lines.push(`${indent}$runtime.bindClass(_el_${depth}, () => _styles ? $runtime.resolveStyles(_styles, ${expr}) : ${expr})`)
      } else {
        lines.push(`${indent}_el_${depth}.className = ${JSON.stringify(attr.value)}`)
      }
    } else if (isReactive(attr.value)) {
      const expr = rewriteRefs(stripBraces(attr.value))
      lines.push(`${indent}$runtime.bindAttr(_el_${depth}, '${attr.name}', () => ${expr})`)
    } else {
      lines.push(`${indent}_el_${depth}.setAttribute('${attr.name}', ${JSON.stringify(attr.value)})`)
    }
  }

  // handle children
  if (children.trim()) {
    const childParts = splitChildren(children)
    for (const child of childParts) {
      const childTrimmed = child.trim()
      if (!childTrimmed) continue

      if (childTrimmed.startsWith('{') && childTrimmed.endsWith('}') && !childTrimmed.startsWith('{<')) {
        // reactive text binding
        const expr = rewriteRefs(childTrimmed.slice(1, -1).trim())
        lines.push(`${indent}const _text_${depth} = document.createTextNode('')`)
        lines.push(`${indent}$runtime.bind(_text_${depth}, 'textContent', () => String(${expr}))`)
        lines.push(`${indent}_el_${depth}.appendChild(_text_${depth})`)
      } else if (childTrimmed.startsWith('<') || childTrimmed.startsWith('$') || childTrimmed.startsWith('{<')) {
        // child element or directive
        lines.push(`${indent}{`)
        lines.push(compileUINode(childTrimmed, depth + 1))
        lines.push(`${indent}  _el_${depth}.appendChild(_el_${depth + 1} ?? _text_${depth + 1} ?? document.createTextNode(''))`)
        lines.push(`${indent}}`)
      } else {
        // static text
        lines.push(`${indent}_el_${depth}.appendChild(document.createTextNode(${JSON.stringify(childTrimmed)}))`)
      }
    }
  }

  lines.push(`${indent}return _el_${depth}`)
  return lines.join('\n')
}

// ── attribute parser ───────────────────────────────────────────────────────

function parseAttributes(raw: string): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = []
  // match name="value", name={expr}, or bare @event={handler}
  const re = /([@\w-]+)=(?:"([^"]*)"|\{([^}]*)\})/g
  let m
  while ((m = re.exec(raw)) !== null) {
    attrs.push({
      name: m[1],
      value: m[2] !== undefined ? m[2] : `{${m[3]}}`
    })
  }
  return attrs
}

// ── chain parser ───────────────────────────────────────────────────────────

function parseChains(raw: string): Array<{ event: string; handler: string }> {
  const chains: Array<{ event: string; handler: string }> = []
  const re = /\.(\w+)\(([^)]*)\)/g
  let m
  while ((m = re.exec(raw)) !== null) {
    const methodName = m[1]
    const handler = m[2]
    // map chain method names to DOM events
    const eventMap: Record<string, string> = {
      click: 'click',
      hover: 'mouseenter',
      blur: 'blur',
      focus: 'focus',
      keydown: 'keydown',
      keyup: 'keyup',
      change: 'change',
      submit: 'submit',
      scroll: 'scroll',
      drag: 'dragstart',
      mount: '__mount',
      destroy: '__destroy',
    }
    chains.push({
      event: eventMap[methodName] ?? methodName,
      handler: handler.trim(),
    })
  }
  return chains
}

// ── component props compiler ───────────────────────────────────────────────

function compileComponentProps(raw: string): string {
  const attrs = parseAttributes(raw)
  return attrs.map(a => {
    if (isReactive(a.value)) {
      const expr = rewriteRefs(stripBraces(a.value))
      return `${a.name}: () => ${expr}`
    }
    return `${a.name}: ${JSON.stringify(a.value)}`
  }).join(', ')
}

// ── helpers ────────────────────────────────────────────────────────────────

function isReactive(value: string): boolean {
  return value.startsWith('{') && value.endsWith('}')
}

function stripBraces(value: string): string {
  return value.slice(1, -1).trim()
}

// split children at top level — don't split inside nested tags or braces
function splitChildren(raw: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '<' || ch === '{') depth++
    if (ch === '>' || ch === '}') depth--
    current += ch
    if (depth === 0 && (raw[i + 1] === '<' || raw[i + 1] === '$' || i === raw.length - 1)) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}