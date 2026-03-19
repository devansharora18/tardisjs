import { describe, it, expect } from 'vitest'
import { lex } from '../../src/lexer/lexer'
import { Token } from '../../src/lexer/tokens'

// helper — filters out newlines for cleaner assertions
function withoutNewlines(tokens: Token[]) {
  return tokens.filter(t => t.type !== 'NEWLINE' && t.type !== 'EOF')
}

// helper — just the token types
function types(tokens: Token[]) {
  return withoutNewlines(tokens).map(t => t.type)
}

// helper — just the token values
function values(tokens: Token[]) {
  return withoutNewlines(tokens).map(t => t.value)
}

describe('lexer', () => {

  // ── keywords ──────────────────────────────────────────────────────────────

  describe('keywords', () => {
    it('tokenizes blueprint keyword', () => {
      const tokens = lex('blueprint Button {')
      expect(tokens[0]).toMatchObject({ type: 'BLUEPRINT', value: 'blueprint' })
    })

    it('tokenizes all section keywords', () => {
      const source = 'props state computed methods events style ui'
      const t = types(lex(source))
      expect(t).toEqual(['PROPS', 'STATE', 'COMPUTED', 'METHODS', 'EVENTS', 'STYLE', 'UI'])
    })

    it('does not confuse keywords with identifiers that start with keyword', () => {
      // "stateCount" should be IDENT not STATE + IDENT
      const tokens = lex('stateCount')
      expect(tokens[0]).toMatchObject({ type: 'IDENT', value: 'stateCount' })
    })
  })

  // ── identifiers ───────────────────────────────────────────────────────────

  describe('identifiers', () => {
    it('tokenizes simple identifier', () => {
      const tokens = lex('Button')
      expect(tokens[0]).toMatchObject({ type: 'IDENT', value: 'Button' })
    })

    it('tokenizes camelCase identifier', () => {
      const tokens = lex('myButton')
      expect(tokens[0]).toMatchObject({ type: 'IDENT', value: 'myButton' })
    })

    it('tokenizes identifier with numbers', () => {
      const tokens = lex('button2')
      expect(tokens[0]).toMatchObject({ type: 'IDENT', value: 'button2' })
    })

    it('tokenizes identifier with underscore', () => {
      const tokens = lex('_private')
      expect(tokens[0]).toMatchObject({ type: 'IDENT', value: '_private' })
    })
  })

  // ── literals ──────────────────────────────────────────────────────────────

  describe('string literals', () => {
    it('tokenizes simple string', () => {
      const tokens = lex('"click me"')
      expect(tokens[0]).toMatchObject({ type: 'STRING', value: 'click me' })
    })

    it('strips surrounding quotes from string value', () => {
      const tokens = lex('"hello"')
      expect(tokens[0].value).toBe('hello')
    })

    it('handles empty string', () => {
      const tokens = lex('""')
      expect(tokens[0]).toMatchObject({ type: 'STRING', value: '' })
    })

    it('handles string with spaces', () => {
      const tokens = lex('"px-4 py-2 rounded-md"')
      expect(tokens[0].value).toBe('px-4 py-2 rounded-md')
    })

    it('handles escaped quote inside string', () => {
      const tokens = lex('"say \\"hello\\""')
      expect(tokens[0].value).toBe('say "hello"')
    })
  })

  describe('number literals', () => {
    it('tokenizes integer', () => {
      const tokens = lex('42')
      expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: '42' })
    })

    it('tokenizes zero', () => {
      const tokens = lex('0')
      expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: '0' })
    })

    it('tokenizes decimal', () => {
      const tokens = lex('3.14')
      expect(tokens[0]).toMatchObject({ type: 'NUMBER', value: '3.14' })
    })
  })

  describe('boolean literals', () => {
    it('tokenizes true', () => {
      const tokens = lex('true')
      expect(tokens[0]).toMatchObject({ type: 'BOOLEAN', value: 'true' })
    })

    it('tokenizes false', () => {
      const tokens = lex('false')
      expect(tokens[0]).toMatchObject({ type: 'BOOLEAN', value: 'false' })
    })
  })

  // ── punctuation ───────────────────────────────────────────────────────────

  describe('punctuation', () => {
    it('tokenizes colon', () => {
      expect(lex(':')[0]).toMatchObject({ type: 'COLON', value: ':' })
    })

    it('tokenizes equals', () => {
      expect(lex('=')[0]).toMatchObject({ type: 'EQUALS', value: '=' })
    })

    it('tokenizes arrow', () => {
      expect(lex('=>')[0]).toMatchObject({ type: 'ARROW', value: '=>' })
    })

    it('does not confuse = with =>', () => {
      const tokens = withoutNewlines(lex('= =>'))
      expect(tokens[0].type).toBe('EQUALS')
      expect(tokens[1].type).toBe('ARROW')
    })

    it('tokenizes pipe', () => {
      expect(lex('|')[0]).toMatchObject({ type: 'PIPE', value: '|' })
    })

    it('tokenizes dot', () => {
      expect(lex('.')[0]).toMatchObject({ type: 'DOT', value: '.' })
    })

    it('tokenizes braces', () => {
      const tokens = types(lex('{ }'))
      expect(tokens).toContain('LBRACE')
      expect(tokens).toContain('RBRACE')
    })

    it('tokenizes parens', () => {
      const tokens = types(lex('( )'))
      expect(tokens).toContain('LPAREN')
      expect(tokens).toContain('RPAREN')
    })
  })

  // ── style mode ────────────────────────────────────────────────────────────

  describe('style mode', () => {
    it('tokenizes style(tailwind)', () => {
      const tokens = withoutNewlines(lex('style(tailwind) {'))
      expect(tokens[0]).toMatchObject({ type: 'STYLE', value: 'style' })
      expect(tokens[1]).toMatchObject({ type: 'STYLE_MODE', value: 'tailwind' })
      expect(tokens[2]).toMatchObject({ type: 'LBRACE' })
    })

    it('tokenizes style(css)', () => {
      const tokens = withoutNewlines(lex('style(css) {'))
      expect(tokens[1]).toMatchObject({ type: 'STYLE_MODE', value: 'css' })
    })

    it('trims whitespace from style mode value', () => {
      const tokens = withoutNewlines(lex('style( tailwind ) {'))
      expect(tokens[1].value).toBe('tailwind')
    })
  })

  // ── raw jsx ───────────────────────────────────────────────────────────────

  describe('raw jsx', () => {
    it('captures ui block content as RAW_JSX', () => {
      const source = `ui {\n  <div>hello</div>\n}`
      const tokens = lex(source)
      const raw = tokens.find(t => t.type === 'RAW_JSX')
      expect(raw).toBeDefined()
      expect(raw?.value).toContain('<div>hello</div>')
    })

    it('handles nested braces inside ui block', () => {
      const source = `ui {\n  <button @click={() => {}}>click</button>\n}`
      const tokens = lex(source)
      const raw = tokens.find(t => t.type === 'RAW_JSX')
      expect(raw).toBeDefined()
      expect(raw?.value).toContain('@click')
    })

    it('does not emit LBRACE for ui opening brace', () => {
      const source = `ui {\n  <div />\n}`
      const tokens = lex(source)
      // the { after ui should not appear as LBRACE
      const lbraces = tokens.filter(t => t.type === 'LBRACE')
      expect(lbraces.length).toBe(0)
    })

    it('treats props block { as LBRACE not RAW_JSX', () => {
      const source = `props {\n  label: string\n}`
      const tokens = lex(source)
      expect(tokens.find(t => t.type === 'RAW_JSX')).toBeUndefined()
      expect(tokens.find(t => t.type === 'LBRACE')).toBeDefined()
    })
  })

  // ── comments ──────────────────────────────────────────────────────────────

  describe('comments', () => {
    it('skips single line comments', () => {
      const tokens = withoutNewlines(lex('// this is a comment\nblueprint'))
      expect(tokens[0]).toMatchObject({ type: 'BLUEPRINT' })
    })

    it('does not include comment text in any token', () => {
      const tokens = lex('// secret comment\nblueprint')
      const hasSecret = tokens.some(t => t.value.includes('secret'))
      expect(hasSecret).toBe(false)
    })

    it('handles comment at end of file', () => {
      const tokens = lex('blueprint Button // inline comment')
      expect(tokens.find(t => t.type === 'EOF')).toBeDefined()
    })
  })

  // ── line and column tracking ──────────────────────────────────────────────

  describe('line and column tracking', () => {
    it('starts at line 1 col 1', () => {
      const tokens = lex('blueprint')
      expect(tokens[0].line).toBe(1)
    })

    it('increments line number on newline', () => {
      const tokens = lex('blueprint\nButton')
      const ident = tokens.find(t => t.value === 'Button')
      expect(ident?.line).toBe(2)
    })

    it('tracks column correctly', () => {
      const tokens = lex('blueprint Button')
      const ident = tokens.find(t => t.value === 'Button')
      expect(ident?.col).toBeGreaterThan(1)
    })

    it('resets column after newline', () => {
      const tokens = lex('blueprint\nButton')
      const ident = tokens.find(t => t.value === 'Button')
      expect(ident?.col).toBe(1)
    })
  })

  // ── whitespace ────────────────────────────────────────────────────────────

  describe('whitespace', () => {
    it('skips spaces between tokens', () => {
      const tokens = withoutNewlines(lex('blueprint   Button'))
      expect(tokens).toHaveLength(2)
    })

    it('skips tabs between tokens', () => {
      const tokens = withoutNewlines(lex('blueprint\t\tButton'))
      expect(tokens).toHaveLength(2)
    })

    it('emits NEWLINE for line breaks', () => {
      const tokens = lex('a\nb')
      expect(tokens.some(t => t.type === 'NEWLINE')).toBe(true)
    })
  })

  // ── eof ───────────────────────────────────────────────────────────────────

  describe('EOF', () => {
    it('always ends with EOF', () => {
      const tokens = lex('blueprint Button {}')
      expect(tokens[tokens.length - 1].type).toBe('EOF')
    })

    it('emits EOF on empty input', () => {
      const tokens = lex('')
      expect(tokens[0].type).toBe('EOF')
    })
  })

  // ── union types ───────────────────────────────────────────────────────────

  describe('union types', () => {
    it('tokenizes union type correctly', () => {
      const tokens = withoutNewlines(lex('"primary" | "ghost" | "danger"'))
      const t = types(tokens)
      expect(t).toEqual(['STRING', 'PIPE', 'STRING', 'PIPE', 'STRING'])
    })

    it('captures all union values', () => {
      const tokens = withoutNewlines(lex('"primary" | "ghost"'))
      const v = values(tokens)
      expect(v).toContain('primary')
      expect(v).toContain('ghost')
    })
  })

  // ── dotted style keys ─────────────────────────────────────────────────────

  describe('dotted style keys', () => {
    it('tokenizes variant.primary as IDENT DOT IDENT', () => {
      const tokens = withoutNewlines(lex('variant.primary'))
      expect(tokens[0]).toMatchObject({ type: 'IDENT', value: 'variant' })
      expect(tokens[1]).toMatchObject({ type: 'DOT' })
      expect(tokens[2]).toMatchObject({ type: 'IDENT', value: 'primary' })
    })

    it('tokenizes disabled.true as IDENT DOT BOOLEAN', () => {
      const tokens = withoutNewlines(lex('disabled.true'))
      expect(tokens[0]).toMatchObject({ type: 'IDENT', value: 'disabled' })
      expect(tokens[1]).toMatchObject({ type: 'DOT' })
      expect(tokens[2]).toMatchObject({ type: 'BOOLEAN', value: 'true' })
    })
  })

  // ── full blueprint ────────────────────────────────────────────────────────

  describe('full blueprint integration', () => {
    it('tokenizes a minimal blueprint without errors', () => {
      const source = `
        blueprint Button {
          props {
            label: string = "click me"
            disabled: boolean = false
          }
          ui {
            <button>{props.label}</button>
          }
        }
      `
      expect(() => lex(source)).not.toThrow()
    })

    it('produces correct token sequence for props block', () => {
      const source = `props {\n  label: string = "click me"\n}`
      const tokens = withoutNewlines(lex(source))
      const t = types(tokens)
      expect(t).toEqual([
        'PROPS', 'LBRACE',
        'IDENT', 'COLON', 'IDENT', 'EQUALS', 'STRING',
        'RBRACE'
      ])
    })

    it('captures ui block content correctly', () => {
      const source = `
        blueprint Card {
          ui {
            <div class="card">
              <h1>{props.title}</h1>
            </div>
          }
        }
      `
      const tokens = lex(source)
      const raw = tokens.find(t => t.type === 'RAW_JSX')
      expect(raw?.value).toContain('<div class="card">')
      expect(raw?.value).toContain('{props.title}')
    })
  })

})