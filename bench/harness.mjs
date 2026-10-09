// Shared harness helpers. All scenarios run against the same jsdom window so
// numbers are comparable. These are jsdom micro-benchmarks, not real-browser
// numbers — the site labels them as such.
import { performance } from 'node:perf_hooks'

export const LIST_SIZE = 200
export const UPDATE_COUNT = 500

export function now() {
  return performance.now()
}

// median of N ms samples, discarding the first (warm-up)
export function median(samples) {
  const sorted = [...samples].slice(1).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function mean(samples) {
  const rest = samples.slice(1)
  return rest.reduce((a, b) => a + b, 0) / rest.length
}

export function round(n) {
  return Math.round(n * 100) / 100
}
