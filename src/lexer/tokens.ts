export type TokenType =
  // keywords
  | 'BLUEPRINT'
  | 'PROPS'
  | 'STATE'
  | 'COMPUTED'
  | 'METHODS'
  | 'EVENTS'
  | 'STYLE'
  | 'UI'
  | 'SCRIPT'

  // style mode
  | 'STYLE_MODE'

  // values
  | 'IDENT'
  | 'STRING'
  | 'BOOLEAN'
  | 'NUMBER'

  // punctuation
  | 'COLON'
  | 'EQUALS'
  | 'PIPE'
  | 'DOT'
  | 'LBRACE'
  | 'RBRACE'
  | 'LPAREN'
  | 'RPAREN'
  | 'ARROW'
  | 'COMMA'

  // raw chunks
  | 'RAW_EXPR'
  | 'RAW_JSX'

  // structure
  | 'NEWLINE'
  | 'EOF'

export type Token = {
  type: TokenType
  value: string
  line: number
  col: number
}

export const KEYWORDS: Record<string, TokenType> = {
  blueprint: 'BLUEPRINT',
  props: 'PROPS',
  state: 'STATE',
  computed: 'COMPUTED',
  methods: 'METHODS',
  events: 'EVENTS',
  style: 'STYLE',
  ui: 'UI',
  script: 'SCRIPT',
  true: 'BOOLEAN',
  false: 'BOOLEAN',
}