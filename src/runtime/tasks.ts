// src/runtime/tasks.ts
import { createState, $update } from './state'
import type { StateValue } from './state'

export type TaskStatus = 'idle' | 'pending' | 'done' | 'error'

export interface TaskOptions<T, A extends unknown[]> {
  run: (...args: A) => Promise<T>
  onDone?: (data: T) => void
  onError?: (err: unknown) => void
}

export interface Task<T, A extends unknown[]> {
  status: TaskStatus
  data: T | null
  error: unknown
  run(...args: A): Promise<T | null>
  cancel(): void
  reset(): void
}

export function useTask<T, A extends unknown[]>(options: TaskOptions<T, A>): Task<T, A> {
  // Reactive backing store so withEffect bindings track reads.
  const state = createState({ status: 'idle', data: null, error: null })
  // Generation counter: only the latest run may write.
  let gen = 0

  async function run(...args: A): Promise<T | null> {
    const current = ++gen
    $update(state, 'status', 'pending')
    $update(state, 'error', null)
    try {
      const result = await options.run(...args)
      if (current !== gen) return null
      $update(state, 'data', result as unknown as StateValue)
      $update(state, 'status', 'done')
      if (options.onDone) {
        try {
          options.onDone(result)
        } catch (cbErr) {
          console.error(cbErr)
        }
      }
      return result
    } catch (err) {
      if (current !== gen) return null
      $update(state, 'error', err as unknown as StateValue)
      $update(state, 'status', 'error')
      if (options.onError) {
        try {
          options.onError(err)
        } catch (cbErr) {
          console.error(cbErr)
        }
      }
      return null
    }
  }

  function cancel(): void {
    gen++
    if ((state['status'] as TaskStatus) === 'pending') {
      $update(state, 'status', 'idle')
    }
  }

  function reset(): void {
    gen++
    $update(state, 'status', 'idle')
    $update(state, 'data', null)
    $update(state, 'error', null)
  }

  return {
    get status(): TaskStatus {
      return state['status'] as TaskStatus
    },
    set status(v: TaskStatus) {
      $update(state, 'status', v)
    },
    get data(): T | null {
      return state['data'] as unknown as T | null
    },
    set data(v: T | null) {
      $update(state, 'data', v as unknown as StateValue)
    },
    get error(): unknown {
      return state['error'] as unknown
    },
    set error(v: unknown) {
      $update(state, 'error', v as unknown as StateValue)
    },
    run,
    cancel,
    reset,
  }
}
