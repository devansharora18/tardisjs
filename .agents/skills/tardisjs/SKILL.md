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

## Composition (imports, children, slots, spread)

- Explicit dependency: `import Button from "./components/Button.tardis"` at the top of the file (relative path, must end `.tardis`, Capitalized binding). Imported tags compile to direct calls — tree-shakeable, no registry.
- Un-imported Capitalized tags fall back to the global component registry (`$runtime.component`).
- Children: `<Card title="x"><p>body</p><span slot="footer">f</span></Card>` passes `children: { default: () => ..., footer: () => ... }`. Only static `slot="name"` attributes route; anything else lands in `default`.
- Outlet: `<slot />` renders `children.default`; `<slot name="footer"><p>fallback</p></slot>` renders the named builder, the fallback, or a comment anchor.
- Spread: `<Card title="x" {...state.extra} />` merges into props. Spread on plain DOM elements is ignored — components only.
- Usage-site `class` on a component merges onto its root (static once, live when braced) instead of becoming a prop.
- In setup-style code (`defineComponent`), slot builders also arrive via `props.children`.

## Runtime

- `$update(state.count, v)` / `$toggle(state.flag)` / `$reset(state, initial)` / `$batch(fn)`
- `$navigate(path)` / `$params` / `$back()` / `$forward()`
- `$fetch(url).done(fn).fail(fn).always(fn)`
- `$(selector).hide().show().addClass("x").attr("k", "v")`
- `$runtime.slot(slots, name, fallback?)` — compiler protocol for `<slot>`; prefer `<slot>` syntax over calling it directly.

## Runtime modules (deep imports, tree-shakeable)

- `tardisjs/runtime/signals` — `signal`, `computed`, `effect`, `batch`, `untrack`, `watch`, `watchEffect`, `isSignal`, `toSignal`
- `tardisjs/runtime/reconcile` — `keyed` (keyed lists), `fragment`, `svg`, `createRef`/`setRef`, `moveChild`
- `tardisjs/runtime/components` — `defineComponent`, `normalizeProps`/`validateProps`, `renderSlot`, `provide`/`inject` (owner-tracked), `lazyComponent`, `withErrorBoundary`
- `tardisjs/runtime/store` — `createStore` with getters/actions/subscribe/reset/persist
- `tardisjs/runtime/routing` — `parseQuery`/`stringifyQuery`, `matchPath` (`:param`, `:param?`, `*`), `resolveRedirect`, `createGuards`, `lazyRoute`, `scrollToId`
- `tardisjs/runtime/forms` — validators (`required`, `email`, …), `validateField`, `useForm`, `bindModel`
- `tardisjs/runtime/i18n` — `createI18n`, `plural`
- `tardisjs/runtime/transition` — `fade`, `slide`, `cssTransition`, `prefersReducedMotion`
- Everything above is also re-exported from `tardisjs/runtime`.

## Testing (tardisjs/testing)

- `renderBlueprint(source, { props? })` — compile + mount a blueprint in jsdom, returns `{ root, document, window, cleanup }`
- `mountHtml(html)` / `flushAll()` / `fireClick` / `fireInput` / `fireKey` / `tick`
- `isVisible` / `textOf` / `queryAll`

## SSR (tardisjs/ssr, Node-only, zero-dep)

- `renderToString(factory, { props?, components? })` — run a compiled factory against the shim, serialize to HTML. Deterministic; scripts never run; missing components serialize as placeholders.
- `hydrate(factory, container, { props?, onMismatch? })` — verified remount over server markup; warns (or reports) on mismatch, flushes mount callbacks.
- `renderDocumentShell(bodyHtml, { title?, head? })`, `serializeNode`, `createMiniDocument`.

## Routing

`pages/index.tardis` -> `/`, `pages/about.tardis` -> `/about`, `pages/blog/[id].tardis` -> `/blog/:id`. Components live in `components/`.

## CLI

- `tardis init` scaffold current dir, `create-tardis-app <name>` new dir
- `tardis dev` HMR dev server, `tardis build` prod to `dist/`, `tardis preview` serve `dist/` on 4000

## Anti-patterns

- No JSX hooks, no `useState`, no VDOM thinking. State only via `state {}` + `$update`.
- No direct DOM mutation in `methods` — use bindings. Raw DOM only in `script {}` via `$el`.
- Do not import from `tardisjs/runtime` by hand — compiler emits it.
