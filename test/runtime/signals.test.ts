import { describe, it, expect, vi } from 'vitest'

import {
  signal, computed, effect, stop, batch,
  untrack, watch, watchEffect, isSignal, toSignal,
} from '../../src/runtime/signals'

describe('signal', () => {
  it('get returns the initial value', () => {
    const s = signal(5)
    expect(s.get()).toBe(5)
  })

  it('set updates the value', () => {
    const s = signal(1)
    s.set(2)
    expect(s.get()).toBe(2)
  })

  it('set with an identical value does not notify', () => {
    const s = signal(1)
    let runs = 0
    const stopFn = effect(() => { s.get(); runs++ })
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(1)
    stopFn()
  })

  it('peek returns the value without tracking', () => {
    const s = signal(1)
    let runs = 0
    const stopFn = effect(() => { s.peek(); runs++ })
    expect(runs).toBe(1)
    s.set(2)
    expect(runs).toBe(1)
    expect(s.peek()).toBe(2)
    stopFn()
  })

  it('subscribe fires on change but not immediately', () => {
    const s = signal(0)
    let calls = 0
    const unsub = s.subscribe(() => calls++)
    expect(calls).toBe(0)
    s.set(1)
    expect(calls).toBe(1)
    s.set(2)
    expect(calls).toBe(2)
    unsub()
  })

  it('subscribe unsubscribe stops notifications', () => {
    const s = signal(0)
    let calls = 0
    const unsub = s.subscribe(() => calls++)
    s.set(1)
    unsub()
    unsub()
    s.set(2)
    expect(calls).toBe(1)
  })
})

describe('computed', () => {
  it('is lazy — fn not called until get', () => {
    const s = signal(1)
    const fn = vi.fn(() => s.get() * 2)
    const c = computed(fn)
    expect(fn).not.toHaveBeenCalled()
    expect(c.get()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(1)
    c.dispose()
  })

  it('memoizes — no recompute without dep change', () => {
    const s = signal(1)
    const fn = vi.fn(() => s.get() + 1)
    const c = computed(fn)
    expect(c.get()).toBe(2)
    expect(c.get()).toBe(2)
    expect(c.get()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(1)
    c.dispose()
  })

  it('recomputes when a dep changes', () => {
    const s = signal(1)
    const fn = vi.fn(() => s.get() * 10)
    const c = computed(fn)
    expect(c.get()).toBe(10)
    s.set(2)
    expect(c.get()).toBe(20)
    expect(fn).toHaveBeenCalledTimes(2)
    c.dispose()
  })

  it('supports computed chains', () => {
    const a = signal(1)
    const b = computed(() => a.get() + 1)
    const c = computed(() => b.get() * 2)
    expect(c.get()).toBe(4)
    a.set(5)
    expect(c.get()).toBe(12)
    b.dispose()
    c.dispose()
  })

  it('dispose freezes the value and detaches downstream', () => {
    const s = signal(1)
    const c = computed(() => s.get() * 2)
    let runs = 0
    const stopFn = effect(() => { c.get(); runs++ })
    expect(runs).toBe(1)
    c.dispose()
    s.set(99)
    expect(runs).toBe(1)
    expect(c.get()).toBe(2)
    stopFn()
  })
})

describe('diamond dependencies', () => {
  it('updates the joint dependent once', () => {
    const a = signal(1)
    const bCalls: number[] = []
    const b = computed(() => { bCalls.push(1); return a.get() + 1 })
    const c = computed(() => a.get() + 2)
    const d = computed(() => b.get() + c.get())
    let effectRuns = 0
    let last = 0
    const stopFn = effect(() => { effectRuns++; last = d.get() })
    expect(last).toBe(5)
    expect(effectRuns).toBe(1)
    a.set(10)
    expect(last).toBe(23)
    expect(effectRuns).toBe(2)
    expect(bCalls.length).toBe(2)
    stopFn()
    b.dispose()
    c.dispose()
    d.dispose()
  })
})

describe('effect', () => {
  it('runs immediately and re-runs on change', () => {
    const s = signal(0)
    const seen: number[] = []
    const stopFn = effect(() => seen.push(s.get()))
    s.set(1)
    s.set(2)
    expect(seen).toEqual([0, 1, 2])
    stopFn()
  })

  it('tracks multiple deps', () => {
    const a = signal(1)
    const b = signal(10)
    const seen: number[] = []
    const stopFn = effect(() => seen.push(a.get() + b.get()))
    a.set(2)
    b.set(20)
    expect(seen).toEqual([11, 12, 22])
    stopFn()
  })

  it('calls cleanup before re-run and on stop', () => {
    const s = signal(0)
    const cleanups: number[] = []
    const stopFn = effect(() => {
      const v = s.get()
      return () => cleanups.push(v)
    })
    s.set(1)
    expect(cleanups).toEqual([0])
    s.set(2)
    expect(cleanups).toEqual([0, 1])
    stopFn()
    expect(cleanups).toEqual([0, 1, 2])
  })

  it('stop prevents future runs', () => {
    const s = signal(0)
    let runs = 0
    const stopFn = effect(() => { s.get(); runs++ })
    expect(runs).toBe(1)
    stopFn()
    s.set(1)
    s.set(2)
    expect(runs).toBe(1)
  })

  it('stop() alias calls the handle', () => {
    const s = signal(0)
    let runs = 0
    const handle = effect(() => { s.get(); runs++ })
    stop(handle)
    s.set(1)
    expect(runs).toBe(1)
  })

  it('stopped effects never fire again even across batches', () => {
    const s = signal(0)
    let runs = 0
    const stopFn = effect(() => { s.get(); runs++ })
    stopFn()
    batch(() => { s.set(1); s.set(2) })
    expect(runs).toBe(1)
  })
})

describe('batch', () => {
  it('coalesces effects on multiple signals into one run', () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    const stopFn = effect(() => { a.get(); b.get(); runs++ })
    expect(runs).toBe(1)
    batch(() => { a.set(1); b.set(2) })
    expect(runs).toBe(2)
    stopFn()
  })

  it('supports nesting — inner batch joins outer', () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    const stopFn = effect(() => { a.get(); b.get(); runs++ })
    batch(() => {
      a.set(1)
      batch(() => { b.set(2); a.set(3) })
      expect(runs).toBe(1)
    })
    expect(runs).toBe(2)
    stopFn()
  })

  it('without batch each set runs the effect', () => {
    const a = signal(0)
    let runs = 0
    const stopFn = effect(() => { a.get(); runs++ })
    a.set(1)
    a.set(2)
    expect(runs).toBe(3)
    stopFn()
  })
})

describe('untrack', () => {
  it('does not subscribe to signals read inside', () => {
    const a = signal(1)
    const b = signal(100)
    const seen: number[] = []
    const stopFn = effect(() => {
      seen.push(a.get() + untrack(() => b.get()))
    })
    b.set(200)
    expect(seen).toEqual([101])
    a.set(2)
    expect(seen).toEqual([101, 202])
    stopFn()
  })

  it('returns the fn value', () => {
    expect(untrack(() => 42)).toBe(42)
  })
})

describe('watch', () => {
  it('runs cb on change with next and prev, not initially', () => {
    const s = signal(1)
    const calls: Array<[number, number]> = []
    const stopFn = watch(() => s.get(), (next, prev) => calls.push([next, prev]))
    expect(calls).toEqual([])
    s.set(2)
    s.set(5)
    expect(calls).toEqual([[2, 1], [5, 2]])
    stopFn()
  })

  it('immediate runs cb right away', () => {
    const s = signal(7)
    const calls: Array<[number, number]> = []
    const stopFn = watch(() => s.get(), (next, prev) => calls.push([next, prev]), { immediate: true })
    expect(calls).toEqual([[7, 7]])
    s.set(8)
    expect(calls).toEqual([[7, 7], [8, 7]])
    stopFn()
  })

  it('stop prevents further callbacks', () => {
    const s = signal(0)
    let calls = 0
    const stopFn = watch(() => s.get(), () => calls++)
    stopFn()
    s.set(1)
    expect(calls).toBe(0)
  })

  it('does not fire when the value is unchanged', () => {
    const s = signal(3)
    let calls = 0
    const stopFn = watch(() => s.get(), () => calls++)
    s.set(3)
    expect(calls).toBe(0)
    stopFn()
  })
})

describe('watchEffect', () => {
  it('runs immediately and on change, stop ends it', () => {
    const s = signal(0)
    const seen: number[] = []
    const stopFn = watchEffect(() => seen.push(s.get()))
    expect(seen).toEqual([0])
    s.set(4)
    expect(seen).toEqual([0, 4])
    stopFn()
    s.set(9)
    expect(seen).toEqual([0, 4])
  })
})

describe('isSignal / toSignal', () => {
  it('isSignal is true for signals', () => {
    expect(isSignal(signal(1))).toBe(true)
  })

  it('isSignal is true for computed and toSignal views', () => {
    const c = computed(() => 1)
    const v = toSignal(() => 1)
    expect(isSignal(c)).toBe(true)
    expect(isSignal(v)).toBe(true)
    c.dispose()
  })

  it('isSignal is false for plain values', () => {
    expect(isSignal(null)).toBe(false)
    expect(isSignal(undefined)).toBe(false)
    expect(isSignal(42)).toBe(false)
    expect(isSignal('x')).toBe(false)
    expect(isSignal({ get: () => 1 })).toBe(false)
    expect(isSignal(() => 1)).toBe(false)
  })

  it('toSignal tracks deps of the getter', () => {
    const s = signal(2)
    const view = toSignal(() => s.get() * 3)
    expect(view.get()).toBe(6)
    const seen: number[] = []
    const stopFn = effect(() => seen.push(view.get()))
    expect(seen).toEqual([6])
    s.set(4)
    expect(view.get()).toBe(12)
    expect(seen).toEqual([6, 12])
    stopFn()
  })
})

describe('error isolation', () => {
  it('an exception in one effect does not break others', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const s = signal(0)
      const good: number[] = []
      effect(() => {
        const v = s.get()
        if (v === 1) throw new Error('boom')
      })
      const stopGood = effect(() => good.push(s.get()))
      s.set(1)
      expect(errSpy).toHaveBeenCalled()
      expect(good).toEqual([0, 1])
      s.set(2)
      expect(good).toEqual([0, 1, 2])
      stopGood()
    } finally {
      errSpy.mockRestore()
    }
  })

  it('cleanup errors are logged and do not break siblings', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const s = signal(0)
      effect(() => {
        s.get()
        return () => { throw new Error('cleanup boom') }
      })
      let runs = 0
      const stopOther = effect(() => { s.get(); runs++ })
      s.set(1)
      expect(errSpy).toHaveBeenCalled()
      expect(runs).toBe(2)
      stopOther()
    } finally {
      errSpy.mockRestore()
    }
  })
})

describe('leakage', () => {
  it('fresh signals do not trigger effects from earlier tests', () => {
    const s = signal(0)
    let runs = 0
    const stopFn = effect(() => { s.get(); runs++ })
    stopFn()
    const fresh = signal(0)
    fresh.set(1)
    s.set(5)
    expect(runs).toBe(1)
  })
})
