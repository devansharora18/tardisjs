# tardisjs

**Smaller on the outside.** A blueprint-first frontend framework that compiles `.tardis` files to vanilla JavaScript.

## Quick Start

```bash
npx create-tardis-app my-app
cd my-app
npm install
npm run dev
```

Or initialize in an existing directory:

```bash
npx tardis init
npx tardis dev
```

## What It Looks Like

```
blueprint Counter {
  state {
    count: number = 0
  }
  methods {
    increment: () => $update(state.count, state.count + 1)
    decrement: () => $update(state.count, state.count - 1)
    reset: () => $update(state.count, 0)
  }
  style(tailwind) {
    value: "text-6xl font-bold text-center"
    actions: "flex gap-4 justify-center mt-8"
    btn: "rounded-lg bg-cyan-400 px-5 py-2 text-black font-medium"
  }
  ui {
    <main>
      <p class={"value"}>{state.count}</p>
      <div class={"actions"}>
        <button class={"btn"} @click={methods.decrement}>-1</button>
        <button class={"btn"} @click={methods.increment}>+1</button>
        <button class={"btn"} @click={methods.reset}>Reset</button>
      </div>
    </main>
  }
}
```

## Features

- **~5KB runtime** — ships minimal code to the browser
- **No virtual DOM** — direct DOM updates with Proxy-based reactivity
- **Blueprint syntax** — structured DSL with props, state, computed, methods, events, styles, and UI
- **Compiler-driven** — lexer, parser, and code generator transform `.tardis` files to JavaScript modules
- **File-based routing** — `pages/index.tardis` → `/`, `pages/[slug].tardis` → `/:slug`
- **Built-in dev server** — HMR via WebSocket, auto port discovery
- **Zero runtime dependencies** — the runtime has no external deps
- **Tailwind integration** — style tokens map directly to Tailwind classes

## Project Structure

```
my-app/
  pages/
    index.tardis        # Routes derived from file structure
    about.tardis
    blog/[id].tardis    # Dynamic route: /blog/:id
  components/
    Button.tardis       # Reusable components
  public/               # Static assets (copied to dist)
  tardis.config.js      # Project configuration
  package.json
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `tardis init` | Scaffold a project in the current directory |
| `tardis dev` | Dev server with hot reload |
| `tardis build` | Production build to `dist/` |
| `tardis preview` | Serve built output on port 4000 |
| `create-tardis-app <name>` | Create a new project in a subdirectory |

## Configuration

```js
// tardis.config.js
export default {
  pages: './pages',
  components: './components',
  outDir: './dist',
  port: 3000,
  title: 'my app',
  head: [
    '<script src="https://cdn.tailwindcss.com"></script>',
  ],
  staticDir: './public',
}
```

## Blueprint Anatomy

```
blueprint ComponentName {
  props { }       // Typed component inputs
  state { }       // Reactive local state (Proxy-based)
  computed { }    // Derived values from state
  methods { }     // Event handlers and logic
  events { }      // Lifecycle: onMount, onDestroy, onUpdate
  style(tailwind) { }  // Named class tokens
  ui { }          // HTML-like template with reactive bindings
}
```

Every section is optional. Pages typically omit `props`; leaf components may omit `state`.

## Runtime API

| Function | Purpose |
|----------|---------|
| `$update(ref, value)` | Update state and trigger bindings |
| `$toggle(ref)` | Toggle boolean state |
| `$reset(state, initial)` | Reset state to defaults |
| `$batch(fn)` | Batch updates into single render cycle |
| `$navigate(path)` | Client-side navigation |
| `$params` | Read dynamic route parameters |
| `$back()` / `$forward()` | History traversal |
| `$fetch(url, opts?)` | Network request helper |
| `$if` / `$each` / `$show` | Conditional and list rendering |
| `$portal(el, target)` | Render into external DOM target |
| `$(selector)` | jQuery-inspired DOM query |

## VS Code Extension

Syntax highlighting for `.tardis` files is available in `vscode-extension/`. Install the `.vsix` file:

1. Open VS Code
2. Go to Extensions → `...` menu → Install from VSIX
3. Select `vscode-extension/tardisjs-syntax-0.1.0.vsix`

## Development

```bash
git clone https://github.com/devansharora18/tardisjs.git
cd tardisjs
npm install
npm run build       # Build compiler + runtime + CLI
npm test            # Run test suite
npm run typecheck   # Type checking
npm run dev         # Watch mode
```

### Build Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Full build (clean + lib + binaries) |
| `npm run build:lib` | Compiler and runtime only |
| `npm run build:bin` | CLI binaries only |
| `npm run dev` | Rollup watch mode |
| `npm test` | Vitest single run |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | TypeScript check |
| `npm run publish:check` | Full quality gate |

## Examples

Working examples are in `examples/`:

- **`examples/counter/`** — Counter with increment, decrement, and reset
- **`examples/todo/`** — Todo list application

## How It Works

```
.tardis source
  → lex()      Tokenize input
  → parse()    Build AST
  → compile()  Generate JavaScript
  → TypeScript transpile
  → Runtime import rewriting
  → Browser-ready JS module
```

The compiler transforms blueprint sections into imperative DOM code that references the `$runtime` object. State uses JavaScript Proxies for fine-grained reactivity — only bindings that read a changed key are re-evaluated.

## Contributing

1. Create a branch scoped to one concern
2. Add or update tests next to affected subsystem
3. Run `npm run typecheck && npm test` before review
4. Provide minimal reproduction for parser/compiler defects

## License

MIT
