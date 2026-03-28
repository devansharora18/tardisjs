import { KEYWORDS, Token, TokenType } from './tokens'

export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1

  function peek(offset = 0): string {
    return source[i + offset] ?? ''
  }

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

  function skipWhitespace() {
    while (i < source.length && (peek() === ' ' || peek() === '\t' || peek() === '\r')) {
      advance()
    }
  }

  function skipComment() {
    if (peek() === '/' && peek(1) === '/') {
      while (i < source.length && peek() !== '\n') {
        advance()
      }
    }
  }

  function readString(): string {
    advance()
    let value = ''
    while (i < source.length && peek() !== '"') {
      if (peek() === '\\' && peek(1) === '"') {
        advance()
        value += advance()
      } else {
        if (peek() === '\n') line++
        value += advance()
      }
    }
    if (peek() === '"') advance()
    return value
  }

  function readIdent(): string {
    let value = ''
    while (i < source.length && /[a-zA-Z0-9_$]/.test(peek())) {
      value += advance()
    }
    return value
  }

  function readNumber(): string {
    let value = ''
    while (i < source.length && /[0-9.]/.test(peek())) {
      value += advance()
    }
    return value
  }

  function readStyleMode(): string {
    advance()
    let value = ''
    while (i < source.length && peek() !== ')') {
      value += advance()
    }
    if (peek() === ')') advance()
    return value.trim()
  }

  function readRawBlock(): string {
    let depth = 1
    let value = ''
    while (i < source.length && depth > 0) {
      const ch = peek()
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) break
      }
      if (ch === '\n') line++
      value += advance()
    }
    if (peek() === '}') advance()
    return value.trim()
  }

  function readRawExpr(): string {
    let value = ''
    while (i < source.length && '*+-/><!=&%^~?'.includes(peek())) {
      value += advance()
    }
    return value
  }

  let lastKeyword: TokenType | null = null

  while (i < source.length) {
    skipWhitespace()
    skipComment()

    if (i >= source.length) break

    const startLine = line
    const startCol = col

    const emit = (type: TokenType, value: string) => {
      tokens.push({ type, value, line: startLine, col: startCol })
    }

    const ch = peek()

    if (ch === '\n') {
      advance()
      emit('NEWLINE', '\n')
      continue
    }

    if (ch === '{') {
      advance()
      if (lastKeyword === 'UI' || lastKeyword === 'SCRIPT' || lastKeyword === 'STYLE') {
        const raw = readRawBlock()
        emit('RAW_JSX', raw)
        lastKeyword = null
        continue
      }
      emit('LBRACE', '{')
      continue
    }

    if (ch === '}') { advance(); emit('RBRACE', '}'); continue }
    if (ch === ':') { advance(); emit('COLON', ':'); continue }
    if (ch === '|') { advance(); emit('PIPE', '|'); continue }
    if (ch === '.') { advance(); emit('DOT', '.'); continue }
    if (ch === '(') { advance(); emit('LPAREN', '('); continue }
    if (ch === ')') { advance(); emit('RPAREN', ')'); continue }
    if (ch === ',') { advance(); emit('COMMA', ','); continue }

    if (ch === '=') {
      if (peek(1) === '>') {
        advance(); advance()
        emit('ARROW', '=>')
      } else {
        advance()
        emit('EQUALS', '=')
      }
      continue
    }

    if ('*+-/><!=&%^~?'.includes(ch)) {
      const raw = readRawExpr()
      emit('RAW_EXPR', raw)
      continue
    }

    if (ch === '"') {
      const str = readString()
      emit('STRING', str)
      continue
    }

    if (/[0-9]/.test(ch)) {
      const num = readNumber()
      emit('NUMBER', num)
      continue
    }

    if (/[a-zA-Z_$]/.test(ch)) {
      const ident = readIdent()
      const keywordType = KEYWORDS[ident]

      if (keywordType) {
        emit(keywordType, ident)
        lastKeyword = keywordType

        if (keywordType === 'STYLE' && peek() === '(') {
          const modeStartLine = line
          const modeStartCol = col
          const mode = readStyleMode()
          tokens.push({ type: 'STYLE_MODE', value: mode, line: modeStartLine, col: modeStartCol })
          lastKeyword = null
        }
      } else {
        emit('IDENT', ident)
      }
      continue
    }

    advance()
  }

  tokens.push({ type: 'EOF', value: '', line, col })
  return tokens
}