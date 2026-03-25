// src/runtime/styles.ts

import { ReactiveState } from './state'

export type StyleMode = 'tailwind' | 'css'

export type StyleRules = Record<string, string>

export interface StylesObject {
  mode: StyleMode
  rules: StyleRules
  resolve(props: Record<string, unknown>, state: ReactiveState): string
}

export function createStyles(
  mode: StyleMode,
  rules: StyleRules,
  props: Record<string, unknown>,
  state: ReactiveState
): StylesObject {

  function resolve(): string {
    const classes: string[] = []

    for (const [key, value] of Object.entries(rules)) {
      if (key === 'base') {
        classes.push(value)
        continue
      }

      // dotted key — variant.primary, disabled.true, size.sm
      const dotIdx = key.indexOf('.')
      if (dotIdx >= 0) {
        const propOrState = key.slice(0, dotIdx)
        const expectedVal = key.slice(dotIdx + 1)

        // check props first then state
        const actualVal = props[propOrState] !== undefined
          ? props[propOrState]
          : state[propOrState]

        if (actualVal === undefined) continue

        // match boolean shorthand — disabled.true
        if (expectedVal === 'true' && actualVal === true) {
          classes.push(value)
        } else if (expectedVal === 'false' && actualVal === false) {
          classes.push(value)
        } else if (String(actualVal) === expectedVal) {
          // match string value — variant.primary
          classes.push(value)
        }
      }
    }

    if (mode === 'tailwind') {
      return classes.join(' ')
    } else {
      // css mode — join as inline style string
      return classes.join('; ')
    }
  }

  return {
    mode,
    rules,
    resolve,
  }
}