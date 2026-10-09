// Benchmark orchestrator. Runs each runtime against an identical jsdom DOM and
// writes results the site renders. Run: node bench/run.mjs (or `npm run bench`).
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { LIST_SIZE, UPDATE_COUNT, round } from './harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')

function gzipSize(rel) {
  const p = path.join(repo, rel)
  if (!fs.existsSync(p)) return null
  return zlib.gzipSync(fs.readFileSync(p), { level: 9 }).length
}

function setupGlobals() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    configurable: true,
  })
  for (const key of [
    'HTMLElement', 'SVGElement', 'Element', 'Node', 'Comment', 'Text',
    'DocumentFragment', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent',
  ]) {
    if (window[key]) globalThis[key] = window[key]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(0), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  return dom
}

const shared = setupGlobals()

const tardis = await import('./scenarios/tardis.mjs')
const react = await import('./scenarios/react.mjs')
const vue = await import('./scenarios/vue.mjs')

const runtimes = [tardis, react, vue]
const results = []

for (const mod of runtimes) {
  shared.window.document.body.innerHTML = ''
  const r = await mod.run(shared.window, { LIST_SIZE, UPDATE_COUNT })
  results.push({
    name: mod.name,
    mountMs: round(r.mountMs),
    updateMs: round(r.updateMs),
    units: r.units,
  })
  console.log(`${mod.name.padEnd(10)} mount ${round(r.mountMs)}ms  update(${UPDATE_COUNT}) ${round(r.updateMs)}ms`)
}

const bundle = [
  {
    name: 'tardisjs',
    note: 'runtime only',
    gzip: gzipSize('dist/runtime/index.mjs'),
    raw: fs.statSync(path.join(repo, 'dist/runtime/index.mjs')).size,
  },
  {
    name: 'Vue',
    note: 'runtime build',
    gzip: gzipSize('bench/node_modules/vue/dist/vue.runtime.esm-browser.prod.js'),
    raw: null,
  },
  {
    name: 'React',
    note: 'react + react-dom',
    gzip: (() => {
      const a = gzipSize('bench/node_modules/react/cjs/react.production.min.js')
      const b = gzipSize('bench/node_modules/react-dom/cjs/react-dom.production.min.js')
      return a && b ? a + b : null
    })(),
    raw: (() => {
      const a = path.join(repo, 'bench/node_modules/react/cjs/react.production.min.js')
      const b = path.join(repo, 'bench/node_modules/react-dom/cjs/react-dom.production.min.js')
      return fs.statSync(a).size + fs.statSync(b).size
    })(),
  },
]

const payload = {
  generatedAt: new Date().toISOString(),
  environment: 'jsdom (Node) — relative micro-benchmark, not a real-browser result',
  listSize: LIST_SIZE,
  updateCount: UPDATE_COUNT,
  runtimes: results,
  bundle,
}

fs.writeFileSync(
  path.join(here, 'results.json'),
  JSON.stringify(payload, null, 2) + '\n'
)

fs.writeFileSync(
  path.join(repo, 'tardisjs-site/public/bench-data.js'),
  'window.__TARDIS_BENCH = ' + JSON.stringify(payload) + ';\n'
)

console.log('\nbundle gzip (bytes):', bundle.map((b) => `${b.name}=${b.gzip}`).join('  '))
console.log('wrote bench/results.json + tardisjs-site/public/bench-data.js')
