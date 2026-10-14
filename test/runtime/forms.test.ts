import { describe, it, expect } from 'vitest'

import { withEffect } from '../../src/runtime/state'
import {
  required,
  minLength,
  maxLength,
  pattern,
  email,
  isNumber,
  min,
  max,
  oneOf,
  custom,
  validateField,
  useForm,
  bindModel,
} from '../../src/runtime/forms'

// Tiny DOM-free stand-in for HTMLInputElement: only the surface bindModel uses.
type Listener = () => void

class FakeInput {
  value = ''
  checked = false
  type = 'text'
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(event: string, fn: Listener): void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(fn)
  }

  removeEventListener(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn)
  }

  emit(event: string): void {
    this.listeners.get(event)?.forEach((fn) => fn())
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0
  }
}

function asInput(fake: FakeInput): HTMLInputElement {
  return fake as unknown as HTMLInputElement
}

// ────────────────────────────────────────────────────────────────────────────
// validators
// ────────────────────────────────────────────────────────────────────────────
describe('required', () => {
  it('rejects empty string, null, and undefined', () => {
    const v = required()
    expect(v('', undefined)).toBe('Required')
    expect(v(null, undefined)).toBe('Required')
    expect(v(undefined, undefined)).toBe('Required')
  })

  it('accepts non-empty values including 0 and false', () => {
    const v = required()
    expect(v('a')).toBeNull()
    expect(v(0)).toBeNull()
    expect(v(false)).toBeNull()
  })

  it('uses a custom message when provided', () => {
    expect(required('Pick one')('', undefined)).toBe('Pick one')
  })
})

describe('minLength / maxLength', () => {
  it('minLength accepts long enough strings and rejects short ones', () => {
    const v = minLength(3)
    expect(v('abc')).toBeNull()
    expect(v('abcd')).toBeNull()
    expect(v('ab')).toBe('Minimum length is 3')
    expect(v('')).toBe('Minimum length is 3')
  })

  it('minLength rejects non-strings', () => {
    const v = minLength(2)
    expect(v(12)).not.toBeNull()
    expect(v(null)).not.toBeNull()
    expect(v(undefined)).not.toBeNull()
  })

  it('maxLength accepts short strings and rejects long ones', () => {
    const v = maxLength(3)
    expect(v('abc')).toBeNull()
    expect(v('')).toBeNull()
    expect(v('abcd')).toBe('Maximum length is 3')
  })

  it('maxLength rejects non-strings', () => {
    const v = maxLength(3)
    expect(v(1)).not.toBeNull()
    expect(v(null)).not.toBeNull()
  })

  it('uses custom messages', () => {
    expect(minLength(3, 'too short')('ab')).toBe('too short')
    expect(maxLength(1, 'too long')('ab')).toBe('too long')
  })
})

describe('pattern', () => {
  it('passes empty string even when it does not match', () => {
    expect(pattern(/^\d+$/)('')).toBeNull()
  })

  it('accepts matching strings and rejects non-matching ones', () => {
    const v = pattern(/^\d+$/, 'digits only')
    expect(v('123')).toBeNull()
    expect(v('12a')).toBe('digits only')
  })

  it('rejects non-strings including null, undefined, and numbers', () => {
    const v = pattern(/^\d+$/, 'digits only')
    expect(v(null)).toBe('digits only')
    expect(v(undefined)).toBe('digits only')
    expect(v(123)).toBe('digits only')
  })
})

describe('email', () => {
  it('accepts simple valid addresses', () => {
    expect(email()('user@example.com')).toBeNull()
    expect(email()('a.b+tag@sub.domain.co')).toBeNull()
  })

  it('rejects malformed addresses', () => {
    expect(email()('no-at-sign')).not.toBeNull()
    expect(email()('a@b')).not.toBeNull()
    expect(email()('a@b.')).not.toBeNull()
    expect(email()('@x.com')).not.toBeNull()
    expect(email()('a b@c.com')).not.toBeNull()
  })

  it('passes empty string and rejects non-strings', () => {
    expect(email()('')).toBeNull()
    expect(email()(null)).not.toBeNull()
    expect(email()(42)).not.toBeNull()
  })

  it('uses a custom message', () => {
    expect(email('bad email')('nope')).toBe('bad email')
  })
})

describe('isNumber / min / max', () => {
  it('isNumber accepts numbers and rejects NaN and non-numbers', () => {
    expect(isNumber()(0)).toBeNull()
    expect(isNumber()(3.14)).toBeNull()
    expect(isNumber()(NaN)).not.toBeNull()
    expect(isNumber()('5')).not.toBeNull()
    expect(isNumber()(null)).not.toBeNull()
    expect(isNumber()(undefined)).not.toBeNull()
    expect(isNumber()('')).not.toBeNull()
  })

  it('min accepts values at or above n and rejects below', () => {
    expect(min(5)(5)).toBeNull()
    expect(min(5)(10)).toBeNull()
    expect(min(5)(4)).toBe('Minimum is 5')
  })

  it('min rejects non-numbers', () => {
    expect(min(5)('6')).not.toBeNull()
    expect(min(5)(NaN)).not.toBeNull()
    expect(min(5)(null)).not.toBeNull()
  })

  it('max accepts values at or below n and rejects above', () => {
    expect(max(5)(5)).toBeNull()
    expect(max(5)(4)).toBeNull()
    expect(max(5)(6)).toBe('Maximum is 5')
  })

  it('max rejects non-numbers', () => {
    expect(max(5)('4')).not.toBeNull()
    expect(max(5)(NaN)).not.toBeNull()
  })

  it('uses custom messages', () => {
    expect(isNumber('num!')('x')).toBe('num!')
    expect(min(5, 'too small')(1)).toBe('too small')
    expect(max(5, 'too big')(9)).toBe('too big')
  })
})

describe('oneOf / custom', () => {
  it('accepts list members with strict equality', () => {
    const v = oneOf(['a', 'b', 1])
    expect(v('a')).toBeNull()
    expect(v(1)).toBeNull()
    expect(v('1')).not.toBeNull()
    expect(v('c')).not.toBeNull()
  })

  it('uses a custom message', () => {
    expect(oneOf(['x'], 'pick x')('y')).toBe('pick x')
  })

  it('custom passes the validator result through with values', () => {
    const seen: unknown[] = []
    const v = custom((val, values) => {
      seen.push(values?.['other'])
      return val === values?.['other'] ? null : 'must match'
    })
    expect(v('a', { other: 'a' })).toBeNull()
    expect(v('a', { other: 'b' })).toBe('must match')
    expect(seen).toEqual(['a', 'b'])
  })
})

describe('validateField', () => {
  it('collects all messages in order without short-circuiting', () => {
    const messages = validateField('ab', [minLength(5, 'first'), pattern(/^\d+$/, 'second')])
    expect(messages).toEqual(['first', 'second'])
  })

  it('returns only failing messages, preserving order', () => {
    const messages = validateField('abc', [required(), minLength(5, 'short'), maxLength(10)])
    expect(messages).toEqual(['short'])
  })

  it('returns an empty array when everything passes or no validators given', () => {
    expect(validateField('abc', [required(), minLength(2)])).toEqual([])
    expect(validateField('anything', [])).toEqual([])
  })

  it('forwards the values record to each validator', () => {
    const received: Array<Record<string, unknown> | undefined> = []
    const probe = custom((_v, values) => {
      received.push(values)
      return null
    })
    validateField('x', [probe, probe], { name: 'x' })
    expect(received).toEqual([{ name: 'x' }, { name: 'x' }])
  })
})

// ────────────────────────────────────────────────────────────────────────────
// useForm
// ────────────────────────────────────────────────────────────────────────────
describe('useForm lifecycle', () => {
  it('initializes values, empty errors, and untouched flags', () => {
    const form = useForm({
      name: { initial: 'Ada', validate: [required()] },
      age: { initial: 30 },
    })
    expect(form.values['name'] as unknown).toBe('Ada')
    expect(form.values['age'] as unknown).toBe(30)
    expect(form.errors['name'] as unknown).toBe('')
    expect(form.touched['name'] as unknown).toBe(false)
  })

  it('defaults a missing initial to undefined', () => {
    const form = useForm({ nick: {} })
    expect(form.values['nick'] as unknown).toBeUndefined()
    expect(form.errors['nick'] as unknown).toBe('')
  })

  it('setField before touch writes the value but leaves errors alone', () => {
    const form = useForm({ name: { initial: 'Ada', validate: [required()] } })
    form.setField('name', '')
    expect(form.values['name'] as unknown).toBe('')
    expect(form.errors['name'] as unknown).toBe('')
    expect(form.isValid()).toBe(true)
  })

  it('setField after touch revalidates the field', () => {
    const form = useForm({ name: { initial: 'Ada', validate: [required()] } })
    form.touch('name')
    expect(form.errors['name'] as unknown).toBe('')
    form.setField('name', '')
    expect(form.errors['name'] as unknown).toBe('Required')
    form.setField('name', 'Grace')
    expect(form.errors['name'] as unknown).toBe('')
  })

  it('touch marks the field touched and validates it', () => {
    const form = useForm({ name: { initial: '', validate: [required()] } })
    expect(form.touched['name'] as unknown).toBe(false)
    form.touch('name')
    expect(form.touched['name'] as unknown).toBe(true)
    expect(form.errors['name'] as unknown).toBe('Required')
  })

  it('validate(name) validates one field and marks it touched', () => {
    const form = useForm({
      a: { initial: '', validate: [required('a req')] },
      b: { initial: '', validate: [required('b req')] },
    })
    expect(form.validate('a')).toBe(false)
    expect(form.errors['a'] as unknown).toBe('a req')
    expect(form.errors['b'] as unknown).toBe('')
    expect(form.touched['a'] as unknown).toBe(true)
    expect(form.touched['b'] as unknown).toBe(false)
    form.setField('a', 'ok')
    // setField revalidates because the field is now touched
    expect(form.errors['a'] as unknown).toBe('')
    expect(form.validate('a')).toBe(true)
  })

  it('validate() with no arg validates every field and returns overall validity', () => {
    const form = useForm({
      a: { initial: '', validate: [required()] },
      b: { initial: 'ok', validate: [required()] },
    })
    expect(form.validate()).toBe(false)
    expect(form.errors['a'] as unknown).toBe('Required')
    expect(form.touched['a'] as unknown).toBe(true)
    expect(form.touched['b'] as unknown).toBe(true)
  })

  it('validateAll touches everything and reports overall validity', () => {
    const form = useForm({
      a: { initial: 'x', validate: [required()] },
      b: { initial: 'y', validate: [required()] },
    })
    expect(form.validateAll()).toBe(true)
    form.setField('b', '')
    expect(form.validateAll()).toBe(false)
    expect(form.errors['b'] as unknown).toBe('Required')
  })

  it('stores only the first error message per field', () => {
    const form = useForm({
      code: { initial: 'ab', validate: [minLength(5, 'first'), pattern(/^\d+$/, 'second')] },
    })
    form.validateAll()
    expect(form.errors['code'] as unknown).toBe('first')
  })

  it('reset restores initials and clears errors and touched', () => {
    const form = useForm({
      name: { initial: 'Ada', validate: [required()] },
      tag: { initial: 'x' },
    })
    form.setField('name', '')
    form.validateAll()
    expect(form.errors['name'] as unknown).toBe('Required')
    form.reset()
    expect(form.values['name'] as unknown).toBe('Ada')
    expect(form.values['tag'] as unknown).toBe('x')
    expect(form.errors['name'] as unknown).toBe('')
    expect(form.touched['name'] as unknown).toBe(false)
    expect(form.isValid()).toBe(true)
  })

  it('isValid is a pure read of current errors and does not run validators', () => {
    const form = useForm({ name: { initial: 'Ada', validate: [required()] } })
    expect(form.isValid()).toBe(true)
    form.setField('name', '')
    // Still true: untouched field was never validated.
    expect(form.isValid()).toBe(true)
    form.touch('name')
    expect(form.isValid()).toBe(false)
  })
})

describe('useForm reactivity', () => {
  it('withEffect bindings re-run when a field changes', () => {
    const form = useForm({ name: { initial: 'Ada' } })
    let runs = 0
    let seen: unknown
    function update(): void {
      runs += 1
      seen = withEffect(update, () => form.values['name'] as unknown)
    }
    update()
    expect(seen).toBe('Ada')
    expect(runs).toBe(1)
    form.setField('name', 'Grace')
    expect(runs).toBe(2)
    expect(seen).toBe('Grace')
  })

  it('errors state is reactive through the same subscription pattern', () => {
    const form = useForm({ name: { initial: 'Ada', validate: [required()] } })
    let seen: unknown
    function update(): void {
      seen = withEffect(update, () => form.errors['name'] as unknown)
    }
    update()
    expect(seen).toBe('')
    form.touch('name')
    form.setField('name', '')
    expect(seen).toBe('Required')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// bindModel
// ────────────────────────────────────────────────────────────────────────────
describe('bindModel', () => {
  it('initializes a text element from state', () => {
    const form = useForm({ name: { initial: 'Ada' } })
    const fake = new FakeInput()
    bindModel(asInput(fake), form.values as unknown as Record<string, unknown>, 'name')
    expect(fake.value).toBe('Ada')
  })

  it('writes element input back into state', () => {
    const form = useForm({ name: { initial: 'Ada' } })
    const fake = new FakeInput()
    bindModel(asInput(fake), form.values as unknown as Record<string, unknown>, 'name')
    fake.value = 'Grace'
    fake.emit('input')
    expect(form.values['name'] as unknown).toBe('Grace')
  })

  it('pushes state changes into the element', () => {
    const form = useForm({ name: { initial: 'Ada' } })
    const fake = new FakeInput()
    bindModel(asInput(fake), form.values as unknown as Record<string, unknown>, 'name')
    form.setField('name', 'Hopper')
    expect(fake.value).toBe('Hopper')
  })

  it('unbind stops element-to-state syncing', () => {
    const form = useForm({ name: { initial: 'Ada' } })
    const fake = new FakeInput()
    const unbind = bindModel(
      asInput(fake),
      form.values as unknown as Record<string, unknown>,
      'name',
    )
    expect(fake.listenerCount('input')).toBe(1)
    unbind()
    expect(fake.listenerCount('input')).toBe(0)
    fake.value = 'changed-after-unbind'
    fake.emit('input')
    expect(form.values['name'] as unknown).toBe('Ada')
  })

  it('maps null and undefined state to an empty string', () => {
    const form = useForm({ nick: { initial: 'x' } })
    const fake = new FakeInput()
    bindModel(asInput(fake), form.values as unknown as Record<string, unknown>, 'nick')
    form.setField('nick', null)
    expect(fake.value).toBe('')
    form.setField('nick', undefined)
    expect(fake.value).toBe('')
  })

  it('syncs checkboxes through the checked property', () => {
    const form = useForm({ agree: { initial: false } })
    const fake = new FakeInput()
    fake.type = 'checkbox'
    bindModel(asInput(fake), form.values as unknown as Record<string, unknown>, 'agree')
    expect(fake.checked).toBe(false)
    // Element -> state.
    fake.checked = true
    fake.emit('input')
    expect(form.values['agree'] as unknown).toBe(true)
    // State -> element.
    form.setField('agree', false)
    expect(fake.checked).toBe(false)
  })

  it('initializes a checked checkbox from a true initial', () => {
    const form = useForm({ agree: { initial: true } })
    const fake = new FakeInput()
    fake.type = 'checkbox'
    bindModel(asInput(fake), form.values as unknown as Record<string, unknown>, 'agree')
    expect(fake.checked).toBe(true)
  })
})
