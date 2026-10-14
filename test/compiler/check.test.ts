import { describe, expect, it } from 'vitest'
import { lex } from '../../src/lexer/lexer'
import { parse, parseFile } from '../../src/parser/parser'
import { checkBlueprint, checkFile, type CheckDiagnostic } from '../../src/compiler/check'

function check(src: string): CheckDiagnostic[] {
  return checkBlueprint(parse(lex(src), 'test.tardis'))
}

function codes(diags: CheckDiagnostic[]): string[] {
  return diags.map((d) => d.code)
}

describe('checkBlueprint', () => {
  it('returns [] for a clean, fully-wired blueprint', () => {
    expect(check(`
      blueprint Counter {
        props { label: string = "Count" }
        state { count: number = 0 }
        computed { doubled: state.count * 2 }
        methods { increment: () => $update(state.count, state.count + 1) }
        ui { <div>{props.label}: {state.count} {computed.doubled}<button @click={methods.increment}>+</button></div> }
      }
    `)).toEqual([])
  })

  it('returns [] when a state default consumes a prop', () => {
    expect(check(`
      blueprint Counter {
        props { initial: number = 0 }
        state { count: number = props.initial }
        ui { <div>{state.count}</div> }
      }
    `)).toEqual([])
  })

  it('returns [] for a minimal blueprint with no declarations', () => {
    expect(check(`blueprint Empty { ui { <div>hi</div> } }`)).toEqual([])
  })

  it('flags an unknown $foo helper in a method body', () => {
    const diags = check(`
      blueprint A {
        state { count: number = 0 }
        methods { go: () => $foo(state.count) }
        ui { <div @click={methods.go}>{state.count}</div> }
      }
    `)
    expect(codes(diags)).toContain('unknown-helper')
    expect(diags.find((d) => d.code === 'unknown-helper')?.message).toContain('$foo')
  })

  it('flags an unknown helper in a computed expr', () => {
    const diags = check(`
      blueprint A {
        state { count: number = 0 }
        computed { x: $mystery(state.count) }
        ui { <div>{state.count} {computed.x}</div> }
      }
    `)
    expect(codes(diags)).toContain('unknown-helper')
  })

  it('flags an unknown helper in ui expressions', () => {
    const diags = check(`blueprint A { ui { <div>{$bogus(1)}</div> } }`)
    expect(codes(diags)).toContain('unknown-helper')
  })

  it('flags an unknown helper in events', () => {
    const diags = check(`
      blueprint A {
        events { onMount: () => $nope() }
        ui { <div>hi</div> }
      }
    `)
    expect(codes(diags)).toContain('unknown-helper')
  })

  it('allows every documented helper without diagnostics', () => {
    expect(check(`
      blueprint A {
        state { count: number = 0 }
        methods {
          inc: () => $update(state.count, state.count + 1)
          flip: () => $toggle(state.count)
          more: () => $batch(() => $update(state.count, 1))
          wipe: () => $reset(state, { count: 0 })
          go: () => $navigate("/home")
          back: () => $back()
          fwd: () => $forward()
          load: () => $fetch("/api")
          open: () => $portal("modal")
        }
        ui {
          <div @click={methods.inc} @change={methods.flip} @input={methods.more} @focus={methods.wipe} @blur={methods.go} @keydown={methods.back} @keyup={methods.fwd} @submit={methods.load} @scroll={methods.open}>
            $if($params.slug === "x") { <p>{state.count}</p> }
            $show(state.count) { <p>shown</p> }
            $each(state.count, (item) => { <p>{item}</p> })
          </div>
        }
      }
    `)).toEqual([])
  })

  it('allows $runtime.* calls', () => {
    expect(check(`
      blueprint A {
        methods { go: () => $runtime.batch(() => $runtime.update()) }
        ui { <div @click={methods.go}>hi</div> }
      }
    `)).toEqual([])
  })

  it('allows $el inside script but flags it elsewhere', () => {
    const ok = check(`blueprint A { ui { <div>hi</div> } script { $el.querySelector("div") } }`)
    expect(ok).toEqual([])
    const bad = check(`
      blueprint A {
        methods { go: () => $el.querySelector("div") }
        ui { <div @click={methods.go}>hi</div> }
      }
    `)
    expect(codes(bad)).toContain('unknown-helper')
  })

  it('flags a typoed state ref with a did-you-mean hint', () => {
    const diags = check(`
      blueprint Counter {
        state { count: number = 0 }
        methods { increment: () => $update(state.cout, 1) }
        ui { <div @click={methods.increment}>{state.count}</div> }
      }
    `)
    const ref = diags.find((d) => d.code === 'unknown-ref')
    expect(ref?.message).toContain('state.cout')
    expect(ref?.hint).toContain('state.count')
  })

  it('flags an unknown props ref', () => {
    const diags = check(`
      blueprint A {
        props { label: string = "x" }
        ui { <div>{props.lable}</div> }
      }
    `)
    const ref = diags.find((d) => d.code === 'unknown-ref')
    expect(ref?.message).toContain('props.lable')
  })

  it('flags an unknown computed ref', () => {
    const diags = check(`
      blueprint A {
        computed { doubled: 1 }
        ui { <div>{computed.tripled}</div> }
      }
    `)
    expect(codes(diags)).toContain('unknown-ref')
  })

  it('flags an unknown methods ref', () => {
    const diags = check(`
      blueprint A {
        methods { go: () => methods.gone() }
        ui { <div @click={methods.go}>hi</div> }
      }
    `)
    expect(codes(diags)).toContain('unknown-ref')
  })

  it('flags unknown refs in events bodies', () => {
    const diags = check(`
      blueprint A {
        state { count: number = 0 }
        events { onMount: () => console.log(state.missing) }
        ui { <div>{state.count}</div> }
      }
    `)
    expect(diags.find((d) => d.code === 'unknown-ref')?.message).toContain('state.missing')
  })

  it('flags unknown refs in script', () => {
    const diags = check(`
      blueprint A {
        state { count: number = 0 }
        ui { <div>{state.count}</div> }
        script { console.log(state.missing) }
      }
    `)
    expect(codes(diags)).toContain('unknown-ref')
  })

  it('reports unknown-ref at the owning section position', () => {
    const src = `
      blueprint A {
        state { count: number = 0 }
        methods { go: () => $update(state.nope, 1) }
        ui { <div @click={methods.go}>{state.count}</div> }
      }
    `
    const ast = parse(lex(src), 'test.tardis')
    const diags = checkBlueprint(ast)
    const ref = diags.find((d) => d.code === 'unknown-ref')
    const method = ast.methods[0]
    expect(ref?.line).toBe(method.line)
    expect(ref?.col).toBe(method.col)
  })

  it('flags a reactive slot attribute as dynamic-slot', () => {
    const diags = check(`
      blueprint Page {
        state { tab: string = "a" }
        ui {
          <div>
            <Card title="hi"><span slot={state.tab}>x</span></Card>
            <p>{state.tab}</p>
          </div>
        }
      }
    `)
    expect(codes(diags)).toEqual(['dynamic-slot'])
  })

  it('accepts a static slot attribute', () => {
    expect(check(`
      blueprint Page {
        ui {
          <div>
            <Card title="hi"><span slot="footer">x</span></Card>
          </div>
        }
      }
    `)).toEqual([])
  })

  it('flags unused state fields', () => {
    const diags = check(`
      blueprint A {
        state { stale: number = 0 }
        ui { <div>hi</div> }
      }
    `)
    const d = diags.find((x) => x.code === 'unused-state')
    expect(d?.message).toContain('stale')
  })

  it('flags unused methods', () => {
    const diags = check(`
      blueprint A {
        methods { dead: () => $reset(state) }
        ui { <div>hi</div> }
      }
    `)
    // $reset(state) has no dotted ref, so no unknown-ref noise.
    expect(diags.find((x) => x.code === 'unused-method')?.message).toContain('dead')
  })

  it('flags unused props', () => {
    const diags = check(`
      blueprint A {
        props { ghost: string = "x" }
        ui { <div>hi</div> }
      }
    `)
    expect(diags.find((x) => x.code === 'unused-prop')?.message).toContain('ghost')
  })

  it('treats a method callee as used', () => {
    expect(check(`
      blueprint A {
        state { count: number = 0 }
        methods {
          increment: () => $update(state.count, state.count + 1)
          twice: () => methods.increment()
        }
        ui { <div @click={methods.twice}>{state.count}</div> }
      }
    `)).toEqual([])
  })

  it('still flags a self-recursive method nobody calls as unused', () => {
    const diags = check(`
      blueprint A {
        methods { loop: () => methods.loop() }
        ui { <div>hi</div> }
      }
    `)
    expect(diags.find((x) => x.code === 'unused-method')?.message).toContain('loop')
  })

  it('emits only the six documented codes', () => {
    const allowed = new Set(['unknown-helper', 'unknown-ref', 'unused-state', 'unused-method', 'unused-prop', 'dynamic-slot'])
    const diags = check(`
      blueprint A {
        props { p: string = "x" }
        state { s: number = 0 }
        computed { c: state.nope + $bogus(1) }
        methods { m: () => $alsoBad(state.nope) }
        ui { <div slot={state.s} @click={methods.m}>{props.q} {computed.z}</div> }
      }
    `)
    expect(diags.length).toBeGreaterThan(0)
    for (const d of diags) expect(allowed.has(d.code)).toBe(true)
  })
})

describe('checkFile', () => {
  it('tags diagnostics with the file name', () => {
    const file = parseFile(lex(`blueprint A { methods { go: () => $nope() } ui { <div @click={methods.go}>hi</div> } }`), 'A.tardis')
    const diags = checkFile({ imports: file.imports, blueprint: file.blueprint, file: '/proj/pages/A.tardis' })
    expect(diags.length).toBeGreaterThan(0)
    for (const d of diags) expect(d.file).toBe('/proj/pages/A.tardis')
  })

  it('yields [] for a clean file', () => {
    const file = parseFile(lex(`blueprint A { state { n: number = 0 } ui { <div>{state.n}</div> } }`), 'A.tardis')
    expect(checkFile({ imports: file.imports, blueprint: file.blueprint, file: 'A.tardis' })).toEqual([])
  })
})
