import { describe, it, expect } from 'vitest'

import { createI18n, plural } from '../../src/runtime/i18n'
import { withEffect } from '../../src/runtime/state'

function setup() {
  return createI18n({
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
      en: {
        hello: 'Hello',
        greet: 'Hello, {name}!',
        count: 'You have {n} messages',
        nested: { deep: { value: 'deep value' } },
      },
      es: { hello: 'Hola', greet: 'Hola, {name}!' },
    },
  })
}

describe('i18n', () => {
  it('looks up a simple key in the current locale', () => {
    expect(setup().t('hello')).toBe('Hello')
  })

  it('resolves nested keys via dot notation', () => {
    expect(setup().t('nested.deep.value')).toBe('deep value')
  })

  it('falls back to fallbackLocale for keys missing in the current locale', () => {
    const i18n = setup()
    i18n.setLocale('es')
    expect(i18n.t('nested.deep.value')).toBe('deep value')
  })

  it('returns the key itself when missing in all locales', () => {
    expect(setup().t('nope.missing')).toBe('nope.missing')
  })

  it('interpolates string vars', () => {
    expect(setup().t('greet', { name: 'Ada' })).toBe('Hello, Ada!')
  })

  it('interpolates number vars', () => {
    expect(setup().t('count', { n: 5 })).toBe('You have 5 messages')
  })

  it('leaves unknown placeholders as-is', () => {
    expect(setup().t('greet')).toBe('Hello, {name}!')
    expect(setup().t('greet', { other: 'x' })).toBe('Hello, {name}!')
  })

  it('re-runs withEffect bindings on setLocale', () => {
    const i18n = setup()
    const seen: string[] = []
    const effect = () => {
      seen.push(withEffect(effect, () => i18n.t('hello')))
    }
    effect()
    i18n.setLocale('es')
    expect(seen).toEqual(['Hello', 'Hola'])
  })

  it('has() checks current and explicit locales', () => {
    const i18n = setup()
    expect(i18n.has('hello')).toBe(true)
    expect(i18n.has('missing')).toBe(false)
    expect(i18n.has('hello', 'es')).toBe(true)
    expect(i18n.has('nested.deep.value', 'es')).toBe(false)
  })

  it('availableLocales() lists message locales', () => {
    expect(setup().availableLocales().sort()).toEqual(['en', 'es'])
  })

  it('plural picks zero/one/other', () => {
    const forms = { zero: 'none', one: 'one item', other: '{n} items' }
    expect(plural(0, forms)).toBe('none')
    expect(plural(1, forms)).toBe('one item')
    expect(plural(7, forms)).toBe('{n} items')
  })

  it('plural falls through to other when zero is not provided', () => {
    expect(plural(0, { one: 'one', other: 'many' })).toBe('many')
  })

  it('setLocale to an unknown locale still switches with per-key fallback', () => {
    const i18n = setup()
    i18n.setLocale('xx')
    expect(i18n.locale()).toBe('xx')
    expect(i18n.t('hello')).toBe('Hello')
    expect(i18n.t('totally.unknown')).toBe('totally.unknown')
  })
})
