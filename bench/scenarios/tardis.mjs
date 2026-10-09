// tardisjs scenario — uses the shipped runtime directly, the same primitives
// compiled blueprints call ($runtime.state / text / update).
import { $runtime } from '../../dist/runtime/index.mjs'
import { now } from '../harness.mjs'

export const name = 'tardisjs'

export async function run(win, { LIST_SIZE, UPDATE_COUNT }) {
  const doc = win.document
  const mountSamples = []
  const updateSamples = []

  // mount: build a list of LIST_SIZE reactive text bindings
  const mountStart = now()
  const state = $runtime.state({ n: 0 })
  const root = doc.createElement('div')
  for (let i = 0; i < LIST_SIZE; i++) {
    const span = doc.createElement('span')
    span.appendChild($runtime.text(() => String(state.n)))
    root.appendChild(span)
  }
  doc.body.appendChild(root)
  mountSamples.push(now() - mountStart)

  // update: each write re-runs all subscribed bindings (fan-out)
  const updateStart = now()
  for (let i = 0; i < UPDATE_COUNT; i++) {
    $runtime.update(state, 'n', i)
  }
  updateSamples.push(now() - updateStart)

  return { mountMs: mountSamples[0], updateMs: updateSamples[0], units: doc.body.querySelectorAll('span').length }
}
