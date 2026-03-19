import { KEYWORDS, Token, TokenType } from './tokens'

export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1

  // ── helpers ──────────────────────────────────────────────────────────────

  // look at current character without consuming it
  function peek(offset = 0): string {
    return source[i + offset] ?? ''
  }

  // consume current character and move forward
  function advance(): string {
    const ch = source[i++]
    if (ch === '\n') {
      line++
      col = 1
    } else {
      col++
    }
    return ch
  }

  // push a token into the array
  function addToken(type: TokenType, value: string) {
    tokens.push({ type, value, line, col })
  }

  // skip spaces and tabs — NOT newlines, those are tokens
  function skipWhitespace() {
    while (i < source.length && (peek() === ' ' || peek() === '\t' || peek() === '\r')) {
      advance()
    }
  }

  // skip single line comments starting with //
  function skipComment() {
    if (peek() === '/' && peek(1) === '/') {
      while (i < source.length && peek() !== '\n') {
        advance()
      }
    }
  }

  // ── readers ───────────────────────────────────────────────────────────────

  // read a double-quoted string — returns the content without quotes
  function readString(): string {
    advance() // consume opening "
    let value = ''
    while (i < source.length && peek() !== '"') {
      // handle escape sequences
      if (peek() === '\\' && peek(1) === '"') {
        advance() // skip backslash
        value += advance() // add the escaped quote
      } else {
        if (peek() === '\n') line++
        value += advance()
      }
    }
    if (peek() === '"') advance() // consume closing "
    return value
  }

  // read a continuous identifier or keyword
  function readIdent(): string {
    let value = ''
    while (i < source.length && /[a-zA-Z0-9_$]/.test(peek())) {
      value += advance()
    }
    return value
  }

  // read a number — supports integers and decimals
  function readNumber(): string {
    let value = ''
    while (i < source.length && /[0-9.]/.test(peek())) {
      value += advance()
    }
    return value
  }

  // read the mode inside style(...) — returns "tailwind" or "css"
  function readStyleMode(): string {
    advance() // consume (
    let value = ''
    while (i < source.length && peek() !== ')') {
      value += advance()
    }
    if (peek() === ')') advance() // consume )
    return value.trim()
  }

  // read entire ui { } block as a raw string
  // tracks brace depth so nested braces work correctly
  function readRawBlock(): string {
    let depth = 1
    let value = ''

    while (i < source.length && depth > 0) {
      const ch = peek()

      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) break // stop before the closing brace
      }

      if (ch === '\n') line++
      value += advance()
    }

    if (peek() === '}') advance() // consume closing }

    return value.trim()
  }

  // ── main loop ─────────────────────────────────────────────────────────────

  // tracks the last keyword seen so we know when to use readRawBlock
  let lastKeyword: TokenType | null = null

  while (i < source.length) {
    skipWhitespace()
    skipComment()

    if (i >= source.length) break

    const ch = peek()

    // newlines are meaningful tokens — parser uses them to separate entries
    if (ch === '\n') {
      advance()
      addToken('NEWLINE', '\n')
      continue
    }

    // opening brace — if we just saw UI keyword, swallow entire block as RAW_JSX
    if (ch === '{') {
      advance() // consume {
      if (lastKeyword === 'UI') {
        const raw = readRawBlock()
        addToken('RAW_JSX', raw)
        lastKeyword = null
        continue
      }
      addToken('LBRACE', '{')
      continue
    }

    if (ch === '}') { advance(); addToken('RBRACE', '}'); continue }
    if (ch === ':') { advance(); addToken('COLON', ':'); continue }
    if (ch === '|') { advance(); addToken('PIPE', '|'); continue }
    if (ch === '.') { advance(); addToken('DOT', '.'); continue }
    if (ch === '(') { advance(); addToken('LPAREN', '('); continue }
    if (ch === ')') { advance(); addToken('RPAREN', ')'); continue }

    // = or =>
    if (ch === '=') {
      if (peek(1) === '>') {
        advance(); advance()
        addToken('ARROW', '=>')
      } else {
        advance()
        addToken('EQUALS', '=')
      }
      continue
    }

    // string literal
    if (ch === '"') {
      const str = readString()
      addToken('STRING', str)
      continue
    }

    // number literal
    if (/[0-9]/.test(ch)) {
      const num = readNumber()
      addToken('NUMBER', num)
      continue
    }

    // identifier or keyword
    if (/[a-zA-Z_$]/.test(ch)) {
      const ident = readIdent()
      const keywordType = KEYWORDS[ident]

      if (keywordType) {
        addToken(keywordType, ident)
        lastKeyword = keywordType

        // immediately read style mode if style keyword is followed by (
        if (keywordType === 'STYLE' && peek() === '(') {
          const mode = readStyleMode()
          addToken('STYLE_MODE', mode)
        }
      } else {
        addToken('IDENT', ident)
      }
      continue
    }

    // unknown character — skip silently
    // this handles things like < > / in JSX inside method bodies etc.
    advance()
  }

  addToken('EOF', '')
  return tokens
}