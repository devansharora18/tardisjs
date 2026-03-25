// src/runtime/registry.ts

import { ReactiveState } from './state'

export interface ComponentInstance {
  name: string
  id: string
  el: HTMLElement | null
  state: ReactiveState
  methods: Record<string, (...args: unknown[]) => unknown>
  props: Record<string, unknown>
}

// global registry of all mounted component instances
const registry = new Map<string, ComponentInstance[]>()

export function register(
  name: string,
  instance: Partial<ComponentInstance>
): string {
  const id = `${name}_${Math.random().toString(36).slice(2, 9)}`
  const full: ComponentInstance = {
    name,
    id,
    el: null,
    state: instance.state ?? ({} as ReactiveState),
    methods: instance.methods ?? {},
    props: instance.props ?? {},
  }

  if (!registry.has(name)) registry.set(name, [])
  registry.get(name)!.push(full)

  return id
}

export function unregister(id: string): void {
  for (const [name, instances] of registry.entries()) {
    const idx = instances.findIndex(i => i.id === id)
    if (idx >= 0) {
      instances.splice(idx, 1)
      if (instances.length === 0) registry.delete(name)
      return
    }
  }
}

export function getAll(name: string): ComponentInstance[] {
  return registry.get(name) ?? []
}

export function getById(id: string): ComponentInstance | null {
  for (const instances of registry.values()) {
    const found = instances.find(i => i.id === id)
    if (found) return found
  }
  return null
}

export function getByClass(name: string, cls: string): ComponentInstance[] {
  return getAll(name).filter(i => i.el?.classList.contains(cls))
}

export function getByPropValue(
  name: string,
  prop: string,
  value: unknown
): ComponentInstance[] {
  return getAll(name).filter(i => i.props[prop] === value)
}

export function getByStateValue(
  name: string,
  key: string,
  value: unknown
): ComponentInstance[] {
  return getAll(name).filter(i => i.state[key] === value)
}

export function clearRegistry(): void {
  registry.clear()
}