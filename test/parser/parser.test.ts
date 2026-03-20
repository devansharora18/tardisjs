import { describe, it, expect } from 'vitest'
import { lex } from '../../src/lexer/lexer'
import { parse } from '../../src/parser/parser'
import { TardisError } from '../../src/parser/errors'

// helper — lex and parse in one step
function parseSource(source: string) {
  return parse(lex(source), 'test.tardis')
}

describe('parser', () => {

  // ── blueprint name ────────────────────────────────────────────────────────

  describe('blueprint name', () => {
    it('parses blueprint name correctly', () => {
      const ast = parseSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(ast.name).toBe('Button')
    })

    it('parses PascalCase name', () => {
      const ast = parseSource(`
        blueprint MyComponent {
          ui { <div /> }
        }
      `)
      expect(ast.name).toBe('MyComponent')
    })

    it('throws if blueprint keyword is missing', () => {
      expect(() => parseSource(`
        Button {
          ui { <div /> }
        }
      `)).toThrow(TardisError)
    })

    it('throws if ui block is missing', () => {
      expect(() => parseSource(`
        blueprint Button {
          props { label: string = "click" }
        }
      `)).toThrow(TardisError)
    })
  })

  // ── props ─────────────────────────────────────────────────────────────────

  describe('props', () => {
    it('parses string prop with default', () => {
      const ast = parseSource(`
        blueprint Button {
          props { label: string = "click me" }
          ui { <div /> }
        }
      `)
      expect(ast.props[0]).toMatchObject({
        name: 'label',
        type: 'string',
        default: 'click me',
      })
    })

    it('parses number prop with default', () => {
      const ast = parseSource(`
        blueprint Counter {
          props { initial: number = 0 }
          ui { <div /> }
        }
      `)
      expect(ast.props[0]).toMatchObject({
        name: 'initial',
        type: 'number',
        default: 0,
      })
    })

    it('parses boolean prop with default', () => {
      const ast = parseSource(`
        blueprint Button {
          props { disabled: boolean = false }
          ui { <div /> }
        }
      `)
      expect(ast.props[0]).toMatchObject({
        name: 'disabled',
        type: 'boolean',
        default: false,
      })
    })

    it('parses function prop with no default', () => {
      const ast = parseSource(`
        blueprint Button {
          props { onClick: function }
          ui { <div /> }
        }
      `)
      expect(ast.props[0]).toMatchObject({
        name: 'onClick',
        type: 'function',
        default: null,
      })
    })

    it('parses array prop', () => {
      const ast = parseSource(`
        blueprint List {
          props { items: array = [] }
          ui { <div /> }
        }
      `)
      expect(ast.props[0].type).toBe('array')
    })

    it('parses object prop', () => {
      const ast = parseSource(`
        blueprint Card {
          props { user: object = {} }
          ui { <div /> }
        }
      `)
      expect(ast.props[0].type).toBe('object')
    })

    it('parses union type prop', () => {
      const ast = parseSource(`
        blueprint Button {
          props { variant: "primary" | "ghost" | "danger" = "primary" }
          ui { <div /> }
        }
      `)
      expect(ast.props[0].type).toEqual(['primary', 'ghost', 'danger'])
      expect(ast.props[0].default).toBe('primary')
    })

    it('parses multiple props', () => {
      const ast = parseSource(`
        blueprint Button {
          props {
            label: string = "click"
            disabled: boolean = false
            onClick: function
          }
          ui { <div /> }
        }
      `)
      expect(ast.props).toHaveLength(3)
      expect(ast.props.map(p => p.name)).toEqual(['label', 'disabled', 'onClick'])
    })

    it('throws on unknown prop type', () => {
      expect(() => parseSource(`
        blueprint Button {
          props { label: sting = "click" }
          ui { <div /> }
        }
      `)).toThrow(TardisError)
    })

    it('error message includes did you mean suggestion', () => {
      try {
        parseSource(`
          blueprint Button {
            props { label: sting = "click" }
            ui { <div /> }
          }
        `)
      } catch (e) {
        expect((e as Error).message).toContain('string')
      }
    })

    it('returns empty array when no props block', () => {
      const ast = parseSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(ast.props).toEqual([])
    })
  })

  // ── state ─────────────────────────────────────────────────────────────────

  describe('state', () => {
    it('parses state with number default', () => {
      const ast = parseSource(`
        blueprint Counter {
          state { count: number = 0 }
          ui { <div /> }
        }
      `)
      expect(ast.state[0]).toMatchObject({
        name: 'count',
        type: 'number',
        default: 0,
      })
    })

    it('parses state with boolean default', () => {
      const ast = parseSource(`
        blueprint Modal {
          state { open: boolean = false }
          ui { <div /> }
        }
      `)
      expect(ast.state[0]).toMatchObject({
        name: 'open',
        type: 'boolean',
        default: false,
      })
    })

    it('parses state with props reference as default', () => {
      const ast = parseSource(`
        blueprint Counter {
          state { count: number = props.initial }
          ui { <div /> }
        }
      `)
      expect(ast.state[0].default).toBe('props.initial')
    })

    it('parses multiple state entries', () => {
      const ast = parseSource(`
        blueprint Counter {
          state {
            count: number = 0
            loading: boolean = false
            users: array = []
          }
          ui { <div /> }
        }
      `)
      expect(ast.state).toHaveLength(3)
    })

    it('returns empty array when no state block', () => {
      const ast = parseSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(ast.state).toEqual([])
    })
  })

  // ── computed ──────────────────────────────────────────────────────────────

  describe('computed', () => {
    it('parses computed expression', () => {
      const ast = parseSource(`
        blueprint Counter {
          computed { doubled: state.count * 2 }
          ui { <div /> }
        }
      `)
      expect(ast.computed[0]).toMatchObject({
        name: 'doubled',
        expr: 'state.count * 2',
      })
    })

    it('parses boolean computed expression', () => {
      const ast = parseSource(`
        blueprint Counter {
          computed { isHigh: state.count >= 10 }
          ui { <div /> }
        }
      `)
      expect(ast.computed[0].expr).toBe('state.count >= 10')
    })

    it('parses multiple computed entries', () => {
      const ast = parseSource(`
        blueprint Counter {
          computed {
            doubled: state.count * 2
            isHigh: state.count >= 10
            isNegative: state.count < 0
          }
          ui { <div /> }
        }
      `)
      expect(ast.computed).toHaveLength(3)
    })

    it('returns empty array when no computed block', () => {
      const ast = parseSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(ast.computed).toEqual([])
    })
  })

  // ── methods ───────────────────────────────────────────────────────────────

  describe('methods', () => {
    it('parses method with no params', () => {
      const ast = parseSource(`
        blueprint Counter {
          methods {
            increment: () => $update(state.count, state.count + 1)
          }
          ui { <div /> }
        }
      `)
      expect(ast.methods[0]).toMatchObject({
        name: 'increment',
        params: [],
      })
      expect(ast.methods[0].body).toContain('$update')
    })

    it('parses method with one param', () => {
      const ast = parseSource(`
        blueprint Counter {
          methods {
            incrementBy: (n) => $update(state.count, state.count + n)
          }
          ui { <div /> }
        }
      `)
      expect(ast.methods[0].params).toEqual(['n'])
    })

    it('parses method with multiple params', () => {
      const ast = parseSource(`
        blueprint Form {
          methods {
            setField: (key, value) => $update(state.fields, key, value)
          }
          ui { <div /> }
        }
      `)
      expect(ast.methods[0].params).toEqual(['key', 'value'])
    })

    it('parses multiple methods', () => {
      const ast = parseSource(`
        blueprint Counter {
          methods {
            increment: () => $update(state.count, state.count + 1)
            decrement: () => $update(state.count, state.count - 1)
            reset: () => $reset(state)
          }
          ui { <div /> }
        }
      `)
      expect(ast.methods).toHaveLength(3)
      expect(ast.methods.map(m => m.name)).toEqual(['increment', 'decrement', 'reset'])
    })

    it('returns empty array when no methods block', () => {
      const ast = parseSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(ast.methods).toEqual([])
    })
  })

  // ── events ────────────────────────────────────────────────────────────────

  describe('events', () => {
    it('parses onMount', () => {
      const ast = parseSource(`
        blueprint Counter {
          events {
            onMount: () => console.log("mounted")
          }
          ui { <div /> }
        }
      `)
      expect(ast.events.onMount).toContain('console.log')
    })

    it('parses onDestroy', () => {
      const ast = parseSource(`
        blueprint Counter {
          events {
            onDestroy: () => console.log("destroyed")
          }
          ui { <div /> }
        }
      `)
      expect(ast.events.onDestroy).toContain('console.log')
    })

    it('parses onUpdate', () => {
      const ast = parseSource(`
        blueprint Counter {
          events {
            onUpdate: () => console.log("updated")
          }
          ui { <div /> }
        }
      `)
      expect(ast.events.onUpdate).toContain('console.log')
    })

    it('sets unspecified events to null', () => {
      const ast = parseSource(`
        blueprint Counter {
          events {
            onMount: () => console.log("mounted")
          }
          ui { <div /> }
        }
      `)
      expect(ast.events.onDestroy).toBeNull()
      expect(ast.events.onUpdate).toBeNull()
    })

    it('throws on unknown event', () => {
      expect(() => parseSource(`
        blueprint Counter {
          events {
            onHover: () => console.log("hover")
          }
          ui { <div /> }
        }
      `)).toThrow(TardisError)
    })

    it('returns null events when no events block', () => {
      const ast = parseSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(ast.events).toEqual({
        onMount: null,
        onDestroy: null,
        onUpdate: null,
      })
    })
  })

  // ── style ─────────────────────────────────────────────────────────────────

  describe('style', () => {
    it('parses tailwind style block', () => {
      const ast = parseSource(`
        blueprint Button {
          style(tailwind) {
            base: "px-4 py-2 rounded-md"
          }
          ui { <div /> }
        }
      `)
      expect(ast.style?.mode).toBe('tailwind')
      expect(ast.style?.rules[0]).toMatchObject({
        key: 'base',
        value: 'px-4 py-2 rounded-md',
      })
    })

    it('parses css style block', () => {
      const ast = parseSource(`
        blueprint Card {
          style(css) {
            base: "background: white; border-radius: 12px;"
          }
          ui { <div /> }
        }
      `)
      expect(ast.style?.mode).toBe('css')
    })

    it('parses dotted style keys', () => {
      const ast = parseSource(`
        blueprint Button {
          style(tailwind) {
            base: "px-4 py-2"
            variant.primary: "bg-indigo-500 text-white"
            variant.ghost: "bg-transparent border"
            disabled.true: "opacity-50"
          }
          ui { <div /> }
        }
      `)
      expect(ast.style?.rules).toHaveLength(4)
      expect(ast.style?.rules[1].key).toBe('variant.primary')
      expect(ast.style?.rules[3].key).toBe('disabled.true')
    })

    it('parses multiple style rules', () => {
      const ast = parseSource(`
        blueprint Button {
          style(tailwind) {
            base: "px-4 py-2"
            btn.primary: "bg-indigo-500"
            btn.danger: "bg-red-500"
          }
          ui { <div /> }
        }
      `)
      expect(ast.style?.rules).toHaveLength(3)
    })

    it('returns null when no style block', () => {
      const ast = parseSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(ast.style).toBeNull()
    })
  })

  // ── ui ────────────────────────────────────────────────────────────────────

  describe('ui', () => {
    it('captures ui block content as raw string', () => {
      const ast = parseSource(`
        blueprint Button {
          ui {
            <button>click me</button>
          }
        }
      `)
      expect(ast.ui.raw).toContain('<button>')
      expect(ast.ui.raw).toContain('click me')
    })

    it('preserves interpolations in ui block', () => {
      const ast = parseSource(`
        blueprint Button {
          ui {
            <button>{props.label}</button>
          }
        }
      `)
      expect(ast.ui.raw).toContain('{props.label}')
    })

    it('preserves nested elements in ui block', () => {
      const ast = parseSource(`
        blueprint Card {
          ui {
            <div>
              <h1>title</h1>
              <p>body</p>
            </div>
          }
        }
      `)
      expect(ast.ui.raw).toContain('<h1>')
      expect(ast.ui.raw).toContain('<p>')
    })
  })

  // ── section ordering ──────────────────────────────────────────────────────

  describe('section ordering', () => {
    it('parses sections in any order', () => {
      const ast = parseSource(`
        blueprint Counter {
          ui { <div>{state.count}</div> }
          state { count: number = 0 }
          methods { increment: () => $update(state.count, state.count + 1) }
          props { initial: number = 0 }
        }
      `)
      expect(ast.name).toBe('Counter')
      expect(ast.props).toHaveLength(1)
      expect(ast.state).toHaveLength(1)
      expect(ast.methods).toHaveLength(1)
    })
  })

  // ── line numbers ──────────────────────────────────────────────────────────

  describe('line numbers', () => {
    it('records line number on blueprint node', () => {
      const ast = parseSource(`blueprint Button {\n  ui { <div /> }\n}`)
      expect(ast.line).toBe(1)
    })

    it('records line number on prop node', () => {
      const ast = parseSource(`
        blueprint Button {
          props {
            label: string = "click"
          }
          ui { <div /> }
        }
      `)
      expect(ast.props[0].line).toBeGreaterThan(0)
    })
  })

  // ── full blueprint integration ────────────────────────────────────────────

  describe('full blueprint integration', () => {
    it('parses a complete Counter blueprint', () => {
      const ast = parseSource(`
        blueprint Counter {
          props {
            initial: number = 0
            label: string = "Count"
          }
          state {
            count: number = props.initial
            loading: boolean = false
          }
          computed {
            doubled: state.count * 2
            isHigh: state.count >= 10
          }
          methods {
            increment: () => $update(state.count, state.count + 1)
            decrement: () => $update(state.count, state.count - 1)
            reset: () => $reset(state)
          }
          events {
            onMount: () => console.log("Counter mounted")
          }
          style(tailwind) {
            base: "flex flex-col items-center gap-4"
            btn.primary: "bg-indigo-500 text-white px-4 py-2 rounded"
            btn.danger: "bg-red-500 text-white px-4 py-2 rounded"
          }
          ui {
            <div class={base}>
              <h1>{props.label}: {state.count}</h1>
              <button class={btn.primary} @click={methods.increment}>+</button>
              <button class={btn.danger} @click={methods.decrement}>-</button>
            </div>
          }
        }
      `)

      expect(ast.name).toBe('Counter')
      expect(ast.props).toHaveLength(2)
      expect(ast.state).toHaveLength(2)
      expect(ast.computed).toHaveLength(2)
      expect(ast.methods).toHaveLength(3)
      expect(ast.events.onMount).not.toBeNull()
      expect(ast.style?.mode).toBe('tailwind')
      expect(ast.style?.rules).toHaveLength(3)
      expect(ast.ui.raw).toContain('{props.label}')
    })
  })

})