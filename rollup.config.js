import typescript from '@rollup/plugin-typescript'

// each runtime module also ships standalone so apps can import only what
// they use, e.g. `tardisjs/runtime/signals`. Shared deps (state, events)
// are bundled into each entry to keep every subpath self-contained.
const runtimeModules = [
  'signals',
  'reconcile',
  'components',
  'store',
  'routing',
  'forms',
  'i18n',
  'transition',
  'http',
  'tasks',
  'devtools',
  'a11y',
]
export default [
  // main package — compiler + CLI utilities
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.mjs', format: 'esm', sourcemap: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
    external: ['commander', 'chokidar', 'fs', 'path', 'http', 'ws', 'url'],
  },
  // runtime — ships separately, imported by compiled .tardis output
  {
    input: 'src/runtime/index.ts',
    output: [
      { file: 'dist/runtime/index.mjs', format: 'esm', sourcemap: true },
      { file: 'dist/runtime/index.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
  },
  // standalone runtime modules
  ...runtimeModules.map((name) => ({
    input: `src/runtime/${name}.ts`,
    output: [
      { file: `dist/runtime/${name}.mjs`, format: 'esm', sourcemap: true },
      { file: `dist/runtime/${name}.cjs`, format: 'cjs', sourcemap: true },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
  })),
  // testing utilities
  {
    input: 'src/testing/index.ts',
    output: [
      { file: 'dist/testing/index.mjs', format: 'esm', sourcemap: true },
      { file: 'dist/testing/index.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
  },
  // server-side rendering (zero-dep string renderer, Node-only)
  {
    input: 'src/ssr/index.ts',
    output: [
      { file: 'dist/ssr/index.mjs', format: 'esm', sourcemap: true },
      { file: 'dist/ssr/index.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
  },
]