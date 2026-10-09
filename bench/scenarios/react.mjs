// react scenario — createRoot + flushSync so each update is measured
// synchronously and comparably to the other runtimes.
import React from 'react'
import ReactDOM from 'react-dom'
import ReactDOMClient from 'react-dom/client'
import { now } from '../harness.mjs'

export const name = 'React'

export async function run(win, { LIST_SIZE, UPDATE_COUNT }) {
  const doc = win.document
  const h = React.createElement
  const { flushSync } = ReactDOM
  let setN = () => {}

  function App() {
    const [n, set] = React.useState(0)
    setN = set
    const items = []
    for (let i = 0; i < LIST_SIZE; i++) items.push(h('span', { key: i }, String(n)))
    return h('div', null, items)
  }

  const container = doc.createElement('div')
  doc.body.appendChild(container)
  const root = ReactDOMClient.createRoot(container)

  const mountStart = now()
  flushSync(() => root.render(h(App)))
  const mountMs = now() - mountStart

  const updateStart = now()
  for (let i = 0; i < UPDATE_COUNT; i++) {
    flushSync(() => setN(i))
  }
  const updateMs = now() - updateStart

  return { mountMs, updateMs, units: container.querySelectorAll('span').length }
}
