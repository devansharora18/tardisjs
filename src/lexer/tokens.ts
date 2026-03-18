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

  // style mode — tailwind or css
  | 'STYLE_MODE'

  // values
  | 'IDENT'       // Button, label, count, increment
  | 'STRING'      // "click me"
  | 'BOOLEAN'     // true | false
  | 'NUMBER'      // 0, 42, 3.14

  // punctuation
  | 'COLON'       // :
  | 'EQUALS'      // =
  | 'PIPE'        // |
  | 'DOT'         // .
  | 'LBRACE'      // {
  | 'RBRACE'      // }
  | 'LPAREN'      // (
  | 'RPAREN'      // )
  | 'ARROW'       // =>

  // special
  | 'RAW_JSX'     // entire ui block content — raw string
  | 'NEWLINE'     // \n
  | 'EOF'         // end of file

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
  true: 'BOOLEAN',
  false: 'BOOLEAN',
}