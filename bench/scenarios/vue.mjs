// vue scenario — createApp with a reactive ref, awaiting nextTick per update
// so renders are flushed comparably to the other runtimes.
import * as Vue from 'vue'
import { now } from '../harness.mjs'

export const name = 'Vue'

export async function run(win, { LIST_SIZE, UPDATE_COUNT }) {
  const doc = win.document
  const { createApp, ref, h, nextTick } = Vue
  const n = ref(0)

  const App = {
    setup() {
      return () => {
        const items = []
        for (let i = 0; i < LIST_SIZE; i++) items.push(h('span', { key: i }, String(n.value)))
        return h('div', null, items)
      }
    },
  }

  const container = doc.createElement('div')
  doc.body.appendChild(container)

  const mountStart = now()
  const app = createApp(App)
  app.mount(container)
  const mountMs = now() - mountStart

  const updateStart = now()
  for (let i = 0; i < UPDATE_COUNT; i++) {
    n.value = i
    await nextTick()
  }
  const updateMs = now() - updateStart

  const units = container.querySelectorAll('span').length
  app.unmount()
  return { mountMs, updateMs, units }
}
