---
name: tardisjs
description: Use when creating or editing TardisJS blueprints (.tardis files), pages, components, routing, state, or CLI commands. TardisJS is a compiler-driven frontend framework, not React/Vue.
---

# TardisJS

Compiler-driven framework. Source is `.tardis` blueprints, compiled via `lex() -> parse() -> compile()` to imperative DOM code + ~5KB runtime. No VDOM.

## Blueprint anatomy

```tardis
blueprint Name {
  props { label: string = "Action" }
  state { count: number = 0 }
  computed { doubled: _state.count * 2 }
  methods { increment: () => $update(state.count, state.count + 1) }
  events { onMount: () => console.log("mounted") }
  style(tailwind) { btn: "rounded-lg bg-cyan-400 px-5 py-2" }
  ui {
    <main>
      <p class={"value"}>{state.count}</p>
      <button class={"btn"} @click={methods.increment}>+1</button>
    </main>
  }
}
```

Rules:

- Every section optional except `ui`.
- Pages omit `props`. Leaf components omit `state`.
- `state` types: `string | number | boolean | array | object | function | "a" | "b"`.
- `style` modes: `style(tailwind)`, `style(css)`, `style(raw)`. Reference via `class={"token"}`.
- Reactive attr: `class={expr}`, `@click={methods.x}`, `{state.x}` text interpolation.

## Control flow

- `$if(cond) { <p>...</p> }`
- `$each(list, (item) => { <p>{item}</p> })`
- `$show(cond) { <div>...</div> }`
- Component use: `<Button label={props.x} />` (capitalized = component).
- Chain: `{<button>Go</button>}.click(methods.go)`

## Runtime

- `$update(state.count, v)` / `$toggle(state.flag)` / `$reset(state, initial)` / `$batch(fn)`
- `$navigate(path)` / `$params` / `$back()` / `$forward()`
- `$fetch(url).done(fn).fail(fn).always(fn)`
- `$(selector).hide().show().addClass("x").attr("k", "v")`

## Routing

`pages/index.tardis` -> `/`, `pages/about.tardis` -> `/about`, `pages/blog/[id].tardis` -> `/blog/:id`. Components live in `components/`.

## CLI

- `tardis init` scaffold current dir, `create-tardis-app <name>` new dir
- `tardis dev` HMR dev server, `tardis build` prod to `dist/`, `tardis preview` serve `dist/` on 4000

## Anti-patterns

- No JSX hooks, no `useState`, no VDOM thinking. State only via `state {}` + `$update`.
- No direct DOM mutation in `methods` — use bindings. Raw DOM only in `script {}` via `$el`.
- Do not import from `tardisjs/runtime` by hand — compiler emits it.
