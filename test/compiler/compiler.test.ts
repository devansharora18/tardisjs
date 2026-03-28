import { describe, it, expect } from 'vitest'
import { lex } from '../../src/lexer/lexer'
import { parse } from '../../src/parser/parser'
import { compile } from '../../src/compiler/compiler'

function compileSource(source: string): string {
  return compile(parse(lex(source), 'test.tardis'))
}

describe('compiler', () => {

  // ── file header ───────────────────────────────────────────────────────────

  describe('file header', () => {
    it('includes do not edit comment', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).toContain('do not edit')
    })

    it('imports from tardisjs/runtime', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).toContain("import { $runtime } from 'tardisjs/runtime'")
    })

    it('exports the component function', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).toContain('export function Button')
    })
  })

  // ── props type ────────────────────────────────────────────────────────────

  describe('props type', () => {
    it('generates props type for string prop', () => {
      const out = compileSource(`
        blueprint Button {
          props { label: string = "click me" }
          ui { <div /> }
        }
      `)
      expect(out).toContain('type ButtonProps')
      expect(out).toContain('label?: string')
    })

    it('generates props type for number prop', () => {
      const out = compileSource(`
        blueprint Counter {
          props { initial: number = 0 }
          ui { <div /> }
        }
      `)
      expect(out).toContain('initial?: number')
    })

    it('generates props type for boolean prop', () => {
      const out = compileSource(`
        blueprint Button {
          props { disabled: boolean = false }
          ui { <div /> }
        }
      `)
      expect(out).toContain('disabled?: boolean')
    })

    it('generates props type for function prop', () => {
      const out = compileSource(`
        blueprint Button {
          props { onClick: function }
          ui { <div /> }
        }
      `)
      expect(out).toContain('onClick?:')
    })

    it('generates props type for union type', () => {
      const out = compileSource(`
        blueprint Button {
          props { variant: "primary" | "ghost" = "primary" }
          ui { <div /> }
        }
      `)
      expect(out).toContain('"primary" | "ghost"')
    })

    it('generates empty props type when no props', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).toContain('type ButtonProps')
    })
  })

  // ── props defaults ────────────────────────────────────────────────────────

  describe('props defaults', () => {
    it('generates _props with string default', () => {
      const out = compileSource(`
        blueprint Button {
          props { label: string = "click me" }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_props')
      expect(out).toContain('"click me"')
    })

    it('generates _props with number default', () => {
      const out = compileSource(`
        blueprint Counter {
          props { initial: number = 0 }
          ui { <div /> }
        }
      `)
      expect(out).toContain('initial: 0')
    })

    it('generates _props with boolean default', () => {
      const out = compileSource(`
        blueprint Button {
          props { disabled: boolean = false }
          ui { <div /> }
        }
      `)
      expect(out).toContain('disabled: false')
    })

    it('spreads passed props over defaults', () => {
      const out = compileSource(`
        blueprint Button {
          props { label: string = "click" }
          ui { <div /> }
        }
      `)
      expect(out).toContain('...props')
    })
  })

  // ── state ─────────────────────────────────────────────────────────────────

  describe('state', () => {
    it('generates $runtime.state() call', () => {
      const out = compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          ui { <div /> }
        }
      `)
      expect(out).toContain('$runtime.state(')
      expect(out).toContain('count: 0')
    })

    it('generates multiple state entries', () => {
      const out = compileSource(`
        blueprint Counter {
          state {
            count: number = 0
            loading: boolean = false
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('count: 0')
      expect(out).toContain('loading: false')
    })

    it('uses _props reference for state default referencing props', () => {
      const out = compileSource(`
        blueprint Counter {
          props { initial: number = 0 }
          state { count: number = props.initial }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_props.initial')
    })

    it('assigns state to _state variable', () => {
      const out = compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          ui { <div /> }
        }
      `)
      expect(out).toContain('const _state =')
    })

    it('omits state block when no state declared', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).not.toContain('$runtime.state(')
    })
  })

  // ── computed ──────────────────────────────────────────────────────────────

  describe('computed', () => {
    it('generates _computed object with getters', () => {
      const out = compileSource(`
        blueprint Counter {
          computed { doubled: state.count * 2 }
          ui { <div /> }
        }
      `)
      expect(out).toContain('const _computed =')
      expect(out).toContain('get doubled()')
    })

    it('rewrites state.x to _state.x in computed expr', () => {
      const out = compileSource(`
        blueprint Counter {
          computed { doubled: state.count * 2 }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_state.count')
      expect(out).not.toMatch(/(?<![_a-zA-Z])state\./)
    })

    it('rewrites props.x to _props.x in computed expr', () => {
      const out = compileSource(`
        blueprint Counter {
          props { max: number = 100 }
          computed { isOverMax: state.count > props.max }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_props.max')
    })

    it('generates multiple computed getters', () => {
      const out = compileSource(`
        blueprint Counter {
          computed {
            doubled: state.count * 2
            isHigh: state.count >= 10
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('get doubled()')
      expect(out).toContain('get isHigh()')
    })

    it('omits computed block when none declared', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).not.toContain('_computed')
    })
  })

  // ── methods ───────────────────────────────────────────────────────────────

  describe('methods', () => {
    it('generates _methods object', () => {
      const out = compileSource(`
        blueprint Counter {
          methods {
            increment: () => $update(state.count, state.count + 1)
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('const _methods =')
      expect(out).toContain('increment:')
    })

    it('rewrites state.x to _state.x in method body', () => {
      const out = compileSource(`
        blueprint Counter {
          methods {
            increment: () => $update(state.count, state.count + 1)
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_state.count')
      expect(out).not.toMatch(/(?<![_a-zA-Z])state\./)
    })

    it('preserves method params', () => {
      const out = compileSource(`
        blueprint Counter {
          methods {
            incrementBy: (n) => $update(state.count, state.count + n)
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('incrementBy: (n) =>')
    })

    it('preserves multiple method params', () => {
      const out = compileSource(`
        blueprint Form {
          methods {
            setField: (key, value) => $update(state.fields, key)
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('(key, value) =>')
    })

    it('generates multiple methods', () => {
      const out = compileSource(`
        blueprint Counter {
          methods {
            increment: () => $update(state.count, state.count + 1)
            decrement: () => $update(state.count, state.count - 1)
            reset: () => $reset(state)
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('increment:')
      expect(out).toContain('decrement:')
      expect(out).toContain('reset:')
    })

    it('omits methods block when none declared', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).not.toContain('_methods')
    })
  })

  // ── events ────────────────────────────────────────────────────────────────

  describe('events', () => {
    it('generates $runtime.events() for onMount', () => {
      const out = compileSource(`
        blueprint Counter {
          events {
            onMount: () => console.log("mounted")
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('$runtime.events(')
      expect(out).toContain('onMount:')
    })

    it('generates onDestroy handler', () => {
      const out = compileSource(`
        blueprint Counter {
          events {
            onDestroy: () => console.log("destroyed")
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('onDestroy:')
    })

    it('rewrites state refs in events', () => {
      const out = compileSource(`
        blueprint Counter {
          events {
            onMount: () => console.log(state.count)
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_state.count')
    })

    it('omits events block when none declared', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).not.toContain('$runtime.events(')
    })

    it('compiles multiline arrow event bodies without nested arrow wrappers', () => {
      const out = compileSource(`
        blueprint Navbar {
          state {
            menuOpen: boolean = false
            themeDark: boolean = false
          }
          methods {
            toggleTheme: () => state.themeDark ? (document.documentElement.removeAttribute('data-theme'), localStorage.setItem('tardis-theme', 'light'), $update(state.themeDark, false)) : (document.documentElement.setAttribute('data-theme', 'dark'), localStorage.setItem('tardis-theme', 'dark'), $update(state.themeDark, true))
          }
          events {
            onMount: () => {
              const stored = localStorage.getItem('tardis-theme')
              if (stored === 'dark') {
                $update(state.themeDark, true)
              }
            }
          }
          ui { <div /> }
        }
      `)

      expect(out).toContain(`localStorage.setItem("tardis-theme", "light")`)
      expect(out).toContain(`localStorage.getItem("tardis-theme")`)
      expect(out).toContain('onMount: () => {')
      expect(out).not.toContain('onMount: () => { () => {')
      expect(out).not.toContain('tardis - theme')
    })
  })

  // ── style ─────────────────────────────────────────────────────────────────

  describe('style', () => {
    it('generates $runtime.styles() for tailwind mode', () => {
      const out = compileSource(`
        blueprint Button {
          style(tailwind) {
            base: "px-4 py-2 rounded-md"
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('$runtime.styles("tailwind"')
      expect(out).toContain('"base": "px-4 py-2 rounded-md"')
    })

    it('generates $runtime.styles() for css mode', () => {
      const out = compileSource(`
        blueprint Card {
          style(css) {
            base: "background: white; border-radius: 12px;"
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('$runtime.styles("css"')
    })

    it('includes dotted style keys', () => {
      const out = compileSource(`
        blueprint Button {
          style(tailwind) {
            base: "px-4 py-2"
            variant.primary: "bg-indigo-500 text-white"
            disabled.true: "opacity-50"
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('"variant.primary"')
      expect(out).toContain('"disabled.true"')
    })

    it('passes _props and _state to styles call', () => {
      const out = compileSource(`
        blueprint Button {
          style(tailwind) {
            base: "px-4 py-2"
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_props, _state')
    })

    it('assigns styles to _styles variable', () => {
      const out = compileSource(`
        blueprint Button {
          style(tailwind) {
            base: "px-4 py-2"
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('const _styles =')
    })

    it('omits style block when none declared', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).not.toContain('$runtime.styles(')
    })
  })

  // ── runtime registration ──────────────────────────────────────────────────

  describe('runtime registration', () => {
    it('registers component with $runtime.register', () => {
      const out = compileSource(`
        blueprint Button {
          ui { <div /> }
        }
      `)
      expect(out).toContain("$runtime.register('Button'")
    })

    it('registers with correct component name', () => {
      const out = compileSource(`
        blueprint MyCounter {
          ui { <div /> }
        }
      `)
      expect(out).toContain("$runtime.register('MyCounter'")
    })
  })

  // ── ref rewriting ─────────────────────────────────────────────────────────

  describe('ref rewriting', () => {
    it('rewrites state. to _state. everywhere', () => {
      const out = compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          computed { doubled: state.count * 2 }
          methods { increment: () => $update(state.count, state.count + 1) }
          ui { <div /> }
        }
      `)
      expect(out).not.toMatch(/(?<![_a-zA-Z])state\./)
    })

    it('rewrites props. to _props. everywhere', () => {
      const out = compileSource(`
        blueprint Button {
          props { label: string = "click" }
          computed { upperLabel: props.label }
          ui { <div /> }
        }
      `)
      expect(out).not.toMatch(/(?<![_a-zA-Z])props\./)
    })

    it('rewrites methods. to _methods. everywhere', () => {
      const out = compileSource(`
        blueprint Counter {
          methods {
            increment: () => $update(state.count, 1)
            doubleIncrement: () => methods.increment()
          }
          ui { <div /> }
        }
      `)
      expect(out).toContain('_methods.increment()')
    })
  })

  // ── full blueprint integration ────────────────────────────────────────────

  describe('full blueprint integration', () => {
    it('compiles a complete Counter blueprint without errors', () => {
      expect(() => compileSource(`
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
            onMount: () => console.log("mounted")
          }
          style(tailwind) {
            base: "flex flex-col items-center gap-4"
            btn.primary: "bg-indigo-500 text-white px-4 py-2 rounded"
          }
          ui {
            <div class={base}>
              <h1>{props.label}: {state.count}</h1>
              <button @click={methods.increment}>+</button>
            </div>
          }
        }
      `)).not.toThrow()
    })

    it('compiled output contains all sections', () => {
      const out = compileSource(`
        blueprint Counter {
          props { initial: number = 0 }
          state { count: number = props.initial }
          computed { doubled: state.count * 2 }
          methods { increment: () => $update(state.count, state.count + 1) }
          events { onMount: () => console.log("mounted") }
          style(tailwind) { base: "flex gap-4" }
          ui { <div>{state.count}</div> }
        }
      `)
      expect(out).toContain('const _props =')
      expect(out).toContain('const _state =')
      expect(out).toContain('const _computed =')
      expect(out).toContain('const _methods =')
      expect(out).toContain('$runtime.events(')
      expect(out).toContain('const _styles =')
      expect(out).toContain("$runtime.register('Counter'")
    })
  })

})

// ── ui compiler ───────────────────────────────────────────────────────────

describe('ui compiler', () => {

  describe('basic elements', () => {
    it('compiles a simple div', () => {
      const out = compileSource(`
        blueprint Card {
          ui { <div>hello</div> }
        }
      `)
      expect(out).toContain("createElement('div')")
      expect(out).toContain("createTextNode")
    })

    it('compiles a self-closing element', () => {
      const out = compileSource(`
        blueprint Card {
          ui { <input /> }
        }
      `)
      expect(out).toContain("createElement('input')")
    })

    it('compiles nested elements', () => {
      const out = compileSource(`
        blueprint Card {
          ui {
            <div>
              <h1>title</h1>
              <p>body</p>
            </div>
          }
        }
      `)
      expect(out).toContain("createElement('div')")
      expect(out).toContain("createElement('h1')")
      expect(out).toContain("createElement('p')")
    })

    it('wraps ui in an IIFE', () => {
      const out = compileSource(`
        blueprint Card {
          ui { <div /> }
        }
      `)
      expect(out).toContain('(() => {')
      expect(out).toContain('_root')
    })
  })

  describe('static attributes', () => {
    it('compiles static class attribute', () => {
      const out = compileSource(`
        blueprint Card {
          ui { <div class="my-card">hello</div> }
        }
      `)
      expect(out).toContain('className')
      expect(out).toContain('my-card')
    })

    it('compiles static non-class attribute', () => {
      const out = compileSource(`
        blueprint Input {
          ui { <input placeholder="search" /> }
        }
      `)
      expect(out).toContain("setAttribute('placeholder'")
      expect(out).toContain('search')
    })
  })

  describe('reactive bindings', () => {
    it('compiles reactive text binding', () => {
      const out = compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          ui { <h1>{state.count}</h1> }
        }
      `)
      expect(out).toContain('$runtime.bind(')
      expect(out).toContain('textContent')
      expect(out).toContain('_state.count')
    })

    it('compiles reactive class binding', () => {
      const out = compileSource(`
        blueprint Button {
          style(tailwind) { base: "px-4 py-2" }
          ui { <button class={base}>click</button> }
        }
      `)
      expect(out).toContain('$runtime.bindClass(')
    })

    it('compiles reactive attribute binding', () => {
      const out = compileSource(`
        blueprint Input {
          state { isDisabled: boolean = false }
          ui { <input disabled={state.isDisabled} /> }
        }
      `)
      expect(out).toContain('$runtime.bindAttr(')
      expect(out).toContain('_state.isDisabled')
    })

    it('rewrites state refs in reactive bindings', () => {
      const out = compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          ui { <h1>{state.count}</h1> }
        }
      `)
      expect(out).toContain('_state.count')
      expect(out).not.toMatch(/(?<![_a-zA-Z])state\./)
    })
  })

  describe('event handlers', () => {
    it('compiles @click handler', () => {
      const out = compileSource(`
        blueprint Button {
          methods { increment: () => $update(state.count, 1) }
          ui { <button @click={methods.increment}>click</button> }
        }
      `)
      expect(out).toContain("addEventListener('click'")
      expect(out).toContain('_methods.increment')
    })

    it('compiles @input handler', () => {
      const out = compileSource(`
        blueprint Input {
          state { value: string = "" }
          ui { <input @input={(e) => $update(state.value, e.target.value)} /> }
        }
      `)
      expect(out).toContain("addEventListener('input'")
    })

    it('rewrites refs in event handlers', () => {
      const out = compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          ui { <button @click={() => $update(state.count, state.count + 1)}>+</button> }
        }
      `)
      expect(out).toContain('_state.count')
    })
  })

  describe('$if directive', () => {
    it('compiles $if into $runtime.if call', () => {
      const out = compileSource(`
        blueprint Modal {
          state { open: boolean = false }
          ui {
            $if(state.open) {
              <div>modal content</div>
            }
          }
        }
      `)
      expect(out).toContain('$runtime.if(')
      expect(out).toContain('_state.open')
    })
  })

  describe('$each directive', () => {
    it('compiles $each into $runtime.each call', () => {
      const out = compileSource(`
        blueprint List {
          state { items: array = [] }
          ui {
            $each(state.items, (item) => {
              <div>{item}</div>
            })
          }
        }
      `)
      expect(out).toContain('$runtime.each(')
      expect(out).toContain('_state.items')
    })
  })

  describe('component usage', () => {
    it('compiles PascalCase tag as component', () => {
      const out = compileSource(`
        blueprint Home {
          ui {
            <div>
              <Button label="click me" />
            </div>
          }
        }
      `)
      expect(out).toContain("$runtime.component('Button'")
    })

    it('passes props to components', () => {
      const out = compileSource(`
        blueprint Home {
          ui {
            <Button label="click me" />
          }
        }
      `)
      expect(out).toContain('label:')
      expect(out).toContain('click me')
    })
  })

  describe('full ui integration', () => {
    it('compiles a complete counter ui without errors', () => {
      expect(() => compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          methods {
            increment: () => $update(state.count, state.count + 1)
            decrement: () => $update(state.count, state.count - 1)
          }
          style(tailwind) {
            base: "flex flex-col gap-4"
            btn.primary: "bg-indigo-500 text-white px-4 py-2"
            btn.danger: "bg-red-500 text-white px-4 py-2"
          }
          ui {
            <div class={base}>
              <h1>{state.count}</h1>
              <button class={btn.primary} @click={methods.increment}>+</button>
              <button class={btn.danger} @click={methods.decrement}>-</button>
            </div>
          }
        }
      `)).not.toThrow()
    })

    it('compiled counter contains all expected runtime calls', () => {
      const out = compileSource(`
        blueprint Counter {
          state { count: number = 0 }
          methods { increment: () => $update(state.count, state.count + 1) }
          style(tailwind) { base: "flex gap-4" }
          ui {
            <div class={base}>
              <h1>{state.count}</h1>
              <button @click={methods.increment}>+</button>
            </div>
          }
        }
      `)
      expect(out).toContain("createElement('div')")
      expect(out).toContain("createElement('h1')")
      expect(out).toContain("createElement('button')")
      expect(out).toContain('$runtime.bind(')
      expect(out).toContain('$runtime.bindClass(')
      expect(out).toContain("addEventListener('click'")
      expect(out).toContain('_state.count')
      expect(out).toContain('_methods.increment')
    })
  })

})