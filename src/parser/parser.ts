import { Token, TokenType } from '../lexer/tokens'
import { TardisError } from './errors'
import {
  BlueprintNode,
  PropNode,
  StateNode,
  ComputedNode,
  MethodNode,
  EventsNode,
  StyleNode,
  StyleRule,
  UINode,
  PropType,
} from './types'

export function parse(tokens: Token[], file = 'unknown'): BlueprintNode {
  let cursor = 0

  // ── helpers ────────────────────────────────────────────────────────────

  // look at current token without consuming
  function peek(offset = 0): Token {
    return tokens[cursor + offset] ?? { type: 'EOF', value: '', line: 0, col: 0 }
  }

  // consume current token and move forward
  function advance(): Token {
    const token = tokens[cursor]
    cursor++
    return token
  }

  // consume current token only if it matches the expected type
  // throws TardisError if it doesn't match
  function expect(type: TokenType): Token {
    const token = peek()
    if (token.type !== type) {
      throw new TardisError(
        `Expected ${type} but got ${token.type} ("${token.value}")`,
        file,
        token.line,
        token.col
      )
    }
    return advance()
  }

  // skip all newline tokens
  function skipNewlines() {
    while (peek().type === 'NEWLINE') advance()
  }

  // check if current token matches type without consuming
  function check(type: TokenType): boolean {
    return peek().type === type
  }

  // consume token if it matches, return whether it matched
  function match(type: TokenType): boolean {
    if (check(type)) {
      advance()
      return true
    }
    return false
  }

  // ── section parsers ────────────────────────────────────────────────────

  function parseProps(): PropNode[] {
    expect('PROPS')
    skipNewlines()
    expect('LBRACE')
    skipNewlines()

    const props: PropNode[] = []

    while (!check('RBRACE') && !check('EOF')) {
      skipNewlines()
      if (check('RBRACE')) break

      const nameTok = expect('IDENT')
      expect('COLON')
      const { type, defaultVal } = parsePropTypeAndDefault()

      props.push({
        name: nameTok.value,
        type,
        default: defaultVal,
        line: nameTok.line,
        col: nameTok.col,
      })

      skipNewlines()
    }

    expect('RBRACE')
    return props
  }

  function parseState(): StateNode[] {
    expect('STATE')
    skipNewlines()
    expect('LBRACE')
    skipNewlines()

    const state: StateNode[] = []

    while (!check('RBRACE') && !check('EOF')) {
      skipNewlines()
      if (check('RBRACE')) break

      const nameTok = expect('IDENT')
      expect('COLON')
      const { type, defaultVal } = parsePropTypeAndDefault()

      state.push({
        name: nameTok.value,
        type,
        default: defaultVal,
        line: nameTok.line,
        col: nameTok.col,
      })

      skipNewlines()
    }

    expect('RBRACE')
    return state
  }

  function parseComputed(): ComputedNode[] {
    expect('COMPUTED')
    skipNewlines()
    expect('LBRACE')
    skipNewlines()

    const computed: ComputedNode[] = []

    while (!check('RBRACE') && !check('EOF')) {
      skipNewlines()
      if (check('RBRACE')) break

      const nameTok = expect('IDENT')
      expect('COLON')

      // everything until newline or } is the expression
      let expr = ''
      while (!check('NEWLINE') && !check('RBRACE') && !check('EOF')) {
        expr += peek().value
        advance()
      }

      computed.push({
        name: nameTok.value,
        expr: expr.trim(),
        line: nameTok.line,
        col: nameTok.col,
      })

      skipNewlines()
    }

    expect('RBRACE')
    return computed
  }

  function parseMethods(): MethodNode[] {
    expect('METHODS')
    skipNewlines()
    expect('LBRACE')
    skipNewlines()

    const methods: MethodNode[] = []

    while (!check('RBRACE') && !check('EOF')) {
      skipNewlines()
      if (check('RBRACE')) break

      const nameTok = expect('IDENT')
      expect('COLON')

      // everything until newline or closing } is the method definition
      // format: (params) => body  or  () => body
      let raw = ''
      let depth = 0

      while (!check('EOF')) {
        const tok = peek()

        // track brace depth so we don't stop at } inside method body
        if (tok.value === '{') depth++
        if (tok.value === '}') {
          if (depth === 0) break  // this } closes the methods block
          depth--
        }

        // stop at newline only if we're not inside nested braces
        if (tok.type === 'NEWLINE' && depth === 0) break

        raw += tok.value
        advance()
      }

      // parse params and body from raw string
      // raw looks like: () => $update(state.count, 1)
      // or: (n) => $update(state.count, n)
      const { params, body } = parseMethodSignature(raw.trim(), nameTok)

      methods.push({
        name: nameTok.value,
        params,
        body,
        line: nameTok.line,
        col: nameTok.col,
      })

      skipNewlines()
    }

    expect('RBRACE')
    return methods
  }

  function parseEvents(): EventsNode {
    expect('EVENTS')
    skipNewlines()
    expect('LBRACE')
    skipNewlines()

    const events: EventsNode = {
      onMount: null,
      onDestroy: null,
      onUpdate: null,
    }

    while (!check('RBRACE') && !check('EOF')) {
      skipNewlines()
      if (check('RBRACE')) break

      const nameTok = expect('IDENT')
      expect('COLON')

      // read raw body — same brace depth tracking as methods
      let raw = ''
      let depth = 0

      while (!check('EOF')) {
        const tok = peek()
        if (tok.value === '{') depth++
        if (tok.value === '}') {
          if (depth === 0) break
          depth--
        }
        if (tok.type === 'NEWLINE' && depth === 0) break
        raw += tok.value
        advance()
      }

      const key = nameTok.value as keyof EventsNode
      if (key in events) {
        events[key] = raw.trim()
      } else {
        throw new TardisError(
          `Unknown event "${nameTok.value}" — valid events are onMount, onDestroy, onUpdate`,
          file,
          nameTok.line,
          nameTok.col
        )
      }

      skipNewlines()
    }

    expect('RBRACE')
    return events
  }

  function parseStyle(): StyleNode {
    expect('STYLE')

    // read mode from STYLE_MODE token
    const modeTok = expect('STYLE_MODE')
    const mode = modeTok.value as 'tailwind' | 'css'

    if (mode !== 'tailwind' && mode !== 'css') {
      throw new TardisError(
        `Unknown style mode "${mode}" — valid modes are tailwind and css`,
        file,
        modeTok.line,
        modeTok.col
      )
    }

    skipNewlines()
    expect('LBRACE')
    skipNewlines()

    const rules: StyleRule[] = []

    while (!check('RBRACE') && !check('EOF')) {
      skipNewlines()
      if (check('RBRACE')) break

      // key can be: base, variant.primary, disabled.true etc.
      // read tokens until : to build the key
      let key = ''
      const keyTok = peek()

      while (!check('COLON') && !check('NEWLINE') && !check('EOF')) {
        key += peek().value
        advance()
      }

      expect('COLON')

      const valueTok = expect('STRING')

      rules.push({
        key: key.trim(),
        value: valueTok.value,
        line: keyTok.line,
        col: keyTok.col,
      })

      skipNewlines()
    }

    expect('RBRACE')
    return { mode, rules }
  }

  function parseUI(): UINode {
    const uiTok = expect('UI')
    skipNewlines()

    // lexer already captured everything inside ui {} as RAW_JSX
    const rawTok = expect('RAW_JSX')

    return {
      raw: rawTok.value,
      line: uiTok.line,
      col: uiTok.col,
    }
  }

  // ── type and default value parser ──────────────────────────────────────

  function parsePropTypeAndDefault(): { type: PropType; defaultVal: string | number | boolean | null } {
    // handle union type: "primary" | "ghost" | "danger"
    if (check('STRING') && peek(1).type === 'PIPE') {
      const unionValues: string[] = []

      while (check('STRING')) {
        unionValues.push(advance().value)
        if (check('PIPE')) advance() // consume |
      }

      let defaultVal: string | null = null
      if (check('EQUALS')) {
        advance() // consume =
        defaultVal = expect('STRING').value
      }

      return { type: unionValues, defaultVal }
    }

    // handle primitive type: string, number, boolean, array, object, function
    const typeTok = expect('IDENT')
    const typeName = typeTok.value

    const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'function']
    if (!validTypes.includes(typeName)) {
      // suggest did you mean for common typos
      const suggestion = didYouMean(typeName, validTypes)
      throw new TardisError(
        `Unknown type "${typeName}"${suggestion ? ` — did you mean "${suggestion}"?` : ''}`,
        file,
        typeTok.line,
        typeTok.col
      )
    }

    // function type has no default
    if (typeName === 'function') {
      return { type: 'function', defaultVal: null }
    }

    // read default value if = is present
    let defaultVal: string | number | boolean | null = null

    if (check('EQUALS')) {
      advance() // consume =

      if (check('STRING')) {
        defaultVal = advance().value
      } else if (check('NUMBER')) {
        defaultVal = parseFloat(advance().value)
      } else if (check('BOOLEAN')) {
        defaultVal = advance().value === 'true'
      } else if (check('IDENT')) {
        // could be props.x or state.x as a default
        let raw = ''
        while (!check('NEWLINE') && !check('RBRACE') && !check('EOF')) {
          raw += peek().value
          advance()
        }
        defaultVal = raw.trim()
      }
    }

    return { type: typeName as PropType, defaultVal }
  }

  // ── method signature parser ────────────────────────────────────────────

  function parseMethodSignature(
    raw: string,
    tok: Token
  ): { params: string[]; body: string } {
    // raw looks like: () => body  or  (n) => body  or  (a, b) => body
    const arrowMatch = raw.match(/^\(([^)]*)\)\s*=>\s*(.+)$/s)

    if (!arrowMatch) {
      throw new TardisError(
        `Invalid method syntax — expected "(params) => body" but got "${raw}"`,
        file,
        tok.line,
        tok.col
      )
    }

    const paramStr = arrowMatch[1].trim()
    const body = arrowMatch[2].trim()
    const params = paramStr
      ? paramStr.split(',').map(p => p.trim()).filter(Boolean)
      : []

    return { params, body }
  }

  // ── did you mean helper ────────────────────────────────────────────────

  function didYouMean(input: string, options: string[]): string | null {
    // simple levenshtein distance check
    function distance(a: string, b: string): number {
      const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
      )
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          dp[i][j] = a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
        }
      }
      return dp[a.length][b.length]
    }

    const closest = options.reduce((best, opt) => {
      const d = distance(input, opt)
      return d < best.dist ? { opt, dist: d } : best
    }, { opt: '', dist: Infinity })

    return closest.dist <= 2 ? closest.opt : null
  }

  // ── main blueprint parser ──────────────────────────────────────────────

  skipNewlines()

  const blueprintTok = expect('BLUEPRINT')
  const nameTok = expect('IDENT')

  skipNewlines()
  expect('LBRACE')
  skipNewlines()

  // default empty values
  let props: PropNode[] = []
  let state: StateNode[] = []
  let computed: ComputedNode[] = []
  let methods: MethodNode[] = []
  let events: EventsNode = { onMount: null, onDestroy: null, onUpdate: null }
  let style: StyleNode | null = null
  let ui: UINode | null = null

  // parse sections in any order
  while (!check('RBRACE') && !check('EOF')) {
    skipNewlines()
    if (check('RBRACE')) break

    const tok = peek()

    if (check('PROPS'))    { props    = parseProps();    skipNewlines(); continue }
    if (check('STATE'))    { state    = parseState();    skipNewlines(); continue }
    if (check('COMPUTED')) { computed = parseComputed(); skipNewlines(); continue }
    if (check('METHODS'))  { methods  = parseMethods();  skipNewlines(); continue }
    if (check('EVENTS'))   { events   = parseEvents();   skipNewlines(); continue }
    if (check('STYLE'))    { style    = parseStyle();    skipNewlines(); continue }
    if (check('UI'))       { ui       = parseUI();       skipNewlines(); continue }

    throw new TardisError(
      `Unexpected token "${tok.value}" — expected a section keyword (props, state, computed, methods, events, style, ui)`,
      file,
      tok.line,
      tok.col
    )
  }

  expect('RBRACE')

  if (!ui) {
    throw new TardisError(
      `Blueprint "${nameTok.value}" is missing a ui block — every blueprint must have one`,
      file,
      nameTok.line,
      nameTok.col
    )
  }

  return {
    name: nameTok.value,
    props,
    state,
    computed,
    methods,
    events,
    style,
    ui,
    line: blueprintTok.line,
    col: blueprintTok.col,
  }
}