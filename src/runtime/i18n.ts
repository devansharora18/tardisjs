// src/runtime/i18n.ts
import { createState, $update } from './state'

export interface Messages {
  [key: string]: string | Messages
}

export interface I18nOptions {
  locale: string
  fallbackLocale?: string
  messages: Record<string, Messages>
}

export interface I18n {
  locale(): string
  setLocale(l: string): void
  t(key: string, vars?: Record<string, string | number>): string
  has(key: string, locale?: string): boolean
  availableLocales(): string[]
}

function lookup(table: Messages | undefined, key: string): string | undefined {
  if (!table) return undefined
  let node: string | Messages | undefined = table
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Messages)[part]
    if (node === undefined) return undefined
  }
  return typeof node === 'string' ? node : undefined
}

export function createI18n(options: I18nOptions): I18n {
  const { messages, fallbackLocale } = options
  // Reactive so reads of locale() / t() inside withEffect re-run on setLocale.
  const state = createState({ locale: options.locale })

  // Unknown locales still switch: per-key lookup falls back to
  // fallbackLocale, then to the key itself.
  function setLocale(l: string): void {
    $update(state, 'locale', l)
  }

  function t(key: string, vars?: Record<string, string | number>): string {
    const loc = state['locale'] as string
    let template = lookup(messages[loc], key)
    if (template === undefined && fallbackLocale && fallbackLocale !== loc) {
      template = lookup(messages[fallbackLocale], key)
    }
    if (template === undefined) return key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (m, name: string) =>
      name in vars ? String(vars[name]) : m
    )
  }

  function has(key: string, locale?: string): boolean {
    const loc = locale ?? (state['locale'] as string)
    return lookup(messages[loc], key) !== undefined
  }

  function availableLocales(): string[] {
    return Object.keys(messages)
  }

  return {
    locale: () => state['locale'] as string,
    setLocale,
    t,
    has,
    availableLocales,
  }
}

// zero applies only when count === 0 and provided; one when === 1, else other.
export function plural(
  count: number,
  forms: { zero?: string; one: string; other: string }
): string {
  if (count === 0 && forms.zero !== undefined) return forms.zero
  if (count === 1) return forms.one
  return forms.other
}
