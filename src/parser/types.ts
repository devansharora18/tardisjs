// the full AST that the parser produces from a .tardis file
// every node carries line/col for error reporting

export type PropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'function'
  | string[]   // union type — ["primary", "ghost", "danger"]

export type PropNode = {
  name: string
  type: PropType
  default: string | number | boolean | null
  line: number
  col: number
}

export type StateNode = {
  name: string
  type: PropType
  default: string | number | boolean | null
  line: number
  col: number
}

export type ComputedNode = {
  name: string
  expr: string   // raw expression string — "state.count * 2"
  line: number
  col: number
}

export type MethodNode = {
  name: string
  params: string[]       // ["n", "value"] etc.
  body: string           // raw function body string
  line: number
  col: number
}

export type EventsNode = {
  onMount: string | null    // raw function body string
  onDestroy: string | null
  onUpdate: string | null
}

export type StyleRule = {
  key: string       // "base", "variant.primary", "disabled.true"
  value: string     // the tailwind classes or css string
  line: number
  col: number
}

export type StyleNode = {
  mode: 'tailwind' | 'css'
  rules: StyleRule[]
}

export type UINode = {
  raw: string    // raw JSX string from the RAW_JSX token
  line: number
  col: number
}

export type ScriptNode = {
  raw: string    // raw JavaScript from the script block
  line: number
  col: number
}

export type BlueprintNode = {
  name: string
  props: PropNode[]
  state: StateNode[]
  computed: ComputedNode[]
  methods: MethodNode[]
  events: EventsNode
  style: StyleNode | null
  ui: UINode
  script: ScriptNode | null
  line: number
  col: number
}