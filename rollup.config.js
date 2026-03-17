import typescript from '@rollup/plugin-typescript'

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
  }
]