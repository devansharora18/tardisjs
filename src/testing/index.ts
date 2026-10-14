// src/testing/index.ts
export { renderBlueprint, mountHtml, flushAll } from './render'
export type { RenderOptions, RenderResult, BlueprintComponent } from './render'
export { fireClick, fireInput, fireKey, tick } from './events'
export { isVisible, textOf, queryAll } from './assertions'
