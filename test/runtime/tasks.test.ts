import { describe, it, expect, vi } from 'vitest'

import { useTask } from '../../src/runtime/tasks'
import { withEffect } from '../../src/runtime/state'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useTask', () => {
  it('starts idle with null data and error', () => {
    const t = useTask<string, []>({ run: async () => 'x' })
    expect(t.status).toBe('idle')
    expect(t.data).toBeNull()
    expect(t.error).toBeNull()
  })

  it('sets pending during flight and clears a prior error', async () => {
    const first = deferred<string>()
    const task = useTask<string, []>({ run: () => first.promise })
    // Seed an error state via a rejected run.
    const fail = deferred<string>()
    const failing = useTask<string, []>({ run: () => fail.promise })
    const fp = failing.run()
    expect(failing.status).toBe('pending')
    fail.reject(new Error('boom'))
    await expect(fp).resolves.toBeNull()
    expect(failing.status).toBe('error')

    // New task: pending while in flight.
    const p = task.run()
    expect(task.status).toBe('pending')
    expect(task.error).toBeNull()
    first.resolve('ok')
    await expect(p).resolves.toBe('ok')
  })

  it('writes data, sets done, calls onDone, and returns data', async () => {
    const d = deferred<number>()
    const onDone = vi.fn()
    const task = useTask<number, []>({ run: () => d.promise, onDone })
    const p = task.run()
    d.resolve(42)
    await expect(p).resolves.toBe(42)
    expect(task.status).toBe('done')
    expect(task.data).toBe(42)
    expect(task.error).toBeNull()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(42)
  })

  it('forwards run args to the executor', async () => {
    const seen: unknown[] = []
    const task = useTask<string, [number, string]>({
      run: async (n, s) => {
        seen.push(n, s)
        return `${n}:${s}`
      },
    })
    await expect(task.run(7, 'hi')).resolves.toBe('7:hi')
    expect(seen).toEqual([7, 'hi'])
  })

  it('writes error, sets error status, calls onError, and returns null', async () => {
    const d = deferred<string>()
    const onError = vi.fn()
    const task = useTask<string, []>({ run: () => d.promise, onError })
    const p = task.run()
    const err = new Error('nope')
    d.reject(err)
    await expect(p).resolves.toBeNull()
    expect(task.status).toBe('error')
    expect(task.data).toBeNull()
    expect(task.error).toBe(err)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(err)
  })

  it('ignores stale resolutions so the latest run wins', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const calls: string[] = []
    let n = 0
    const task = useTask<string, []>({
      run: () => {
        n++
        calls.push(`run${n}`)
        return n === 1 ? first.promise : second.promise
      },
    })
    const p1 = task.run()
    const p2 = task.run()
    expect(task.status).toBe('pending')
    // Stale first resolves after second started: ignored.
    first.resolve('stale')
    await expect(p1).resolves.toBeNull()
    expect(task.status).toBe('pending')
    expect(task.data).toBeNull()
    second.resolve('fresh')
    await expect(p2).resolves.toBe('fresh')
    expect(task.status).toBe('done')
    expect(task.data).toBe('fresh')
    expect(calls).toEqual(['run1', 'run2'])
  })

  it('ignores stale rejections when a newer run is in flight', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const onError = vi.fn()
    let n = 0
    const task = useTask<string, []>({
      run: () => {
        n++
        return n === 1 ? first.promise : second.promise
      },
      onError,
    })
    const p1 = task.run()
    const p2 = task.run()
    first.reject(new Error('stale-fail'))
    await expect(p1).resolves.toBeNull()
    expect(task.status).toBe('pending')
    expect(onError).not.toHaveBeenCalled()
    second.resolve('recovered')
    await expect(p2).resolves.toBe('recovered')
    expect(task.status).toBe('done')
    expect(task.data).toBe('recovered')
  })

  it('cancel makes in-flight stale and returns to idle', async () => {
    const d = deferred<string>()
    const task = useTask<string, []>({ run: () => d.promise })
    const p = task.run()
    expect(task.status).toBe('pending')
    task.cancel()
    expect(task.status).toBe('idle')
    d.resolve('late')
    await expect(p).resolves.toBeNull()
    // Stale write ignored.
    expect(task.status).toBe('idle')
    expect(task.data).toBeNull()
  })

  it('cancel when idle stays idle and is a no-op', () => {
    const task = useTask<string, []>({ run: async () => 'x' })
    task.cancel()
    expect(task.status).toBe('idle')
  })

  it('reset clears to idle/null/null', async () => {
    const d = deferred<string>()
    const task = useTask<string, []>({ run: () => d.promise })
    const p = task.run()
    d.resolve('done-data')
    await expect(p).resolves.toBe('done-data')
    expect(task.status).toBe('done')
    task.reset()
    expect(task.status).toBe('idle')
    expect(task.data).toBeNull()
    expect(task.error).toBeNull()
  })

  it('reset clears an error state', async () => {
    const d = deferred<string>()
    const task = useTask<string, []>({ run: () => d.promise })
    const p = task.run()
    d.reject(new Error('bad'))
    await expect(p).resolves.toBeNull()
    expect(task.status).toBe('error')
    task.reset()
    expect(task.status).toBe('idle')
    expect(task.data).toBeNull()
    expect(task.error).toBeNull()
  })

  it('re-runs withEffect observers on status change', async () => {
    const d = deferred<string>()
    const task = useTask<string, []>({ run: () => d.promise })
    const seen: string[] = []
    const effect = (): void => {
      seen.push(withEffect(effect, () => task.status) as string)
    }
    seen.push(withEffect(effect, () => task.status) as string)
    const p = task.run()
    expect(seen.at(-1)).toBe('pending')
    d.resolve('v')
    await p
    expect(seen.at(-1)).toBe('done')
    expect(seen).toEqual(['idle', 'pending', 'done'])
  })

  it('a throwing onDone does not corrupt state', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const d = deferred<string>()
      const task = useTask<string, []>({
        run: () => d.promise,
        onDone: () => {
          throw new Error('callback boom')
        },
      })
      const p = task.run()
      d.resolve('kept')
      await expect(p).resolves.toBe('kept')
      expect(task.status).toBe('done')
      expect(task.data).toBe('kept')
      expect(errSpy).toHaveBeenCalledTimes(1)
    } finally {
      errSpy.mockRestore()
    }
  })

  it('a throwing onError does not corrupt state', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const d = deferred<string>()
      const boom = new Error('fail')
      const task = useTask<string, []>({
        run: () => d.promise,
        onError: () => {
          throw new Error('handler boom')
        },
      })
      const p = task.run()
      d.reject(boom)
      await expect(p).resolves.toBeNull()
      expect(task.status).toBe('error')
      expect(task.error).toBe(boom)
      expect(errSpy).toHaveBeenCalledTimes(1)
    } finally {
      errSpy.mockRestore()
    }
  })

  it('run returns null on failure and data on success', async () => {
    const ok = deferred<number>()
    const bad = deferred<number>()
    let n = 0
    const task = useTask<number, []>({
      run: () => {
        n++
        return n === 1 ? ok.promise : bad.promise
      },
    })
    const p1 = task.run()
    ok.resolve(5)
    await expect(p1).resolves.toBe(5)
    task.reset()
    const p2 = task.run()
    bad.reject(new Error('x'))
    await expect(p2).resolves.toBeNull()
  })
})
