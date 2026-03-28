import typescript from '@rollup/plugin-typescript'

const external = [
  /^node:/,
  'commander',
  'chokidar',
  'ws',
  'typescript',
]

export default [
  {
    input: 'bin/tardis.ts',
    output: {
      file: 'dist/bin/tardis.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
    external,
  },
  {
    input: 'bin/create-tardis-app.ts',
    output: {
      file: 'dist/bin/create-tardis-app.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [typescript({ tsconfig: './tsconfig.json' })],
    external,
  },
]
