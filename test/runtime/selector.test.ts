// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'

import { $, DOMSelection, ComponentSelection } from '../../src/runtime/selector'
import { register, clearRegistry, getById } from '../../src/runtime/registry'
import { createState } from '../../src/runtime/state'

beforeEach(() => {
  clearRegistry()
  document.body.innerHTML = ''
})

// ────────────────────────────────────────────────────────────────────────────
// DOM selection
// ────────────────────────────────────────────────────────────────────────────
describe('$ — DOM selection', () => {
  it('$() with # returns a DOMSelection containing the element', () => {
    const el = document.createElement('div')
    el.id = 'app'
    document.body.appendChild(el)

    const sel = $('#app')
    expect(sel).toBeInstanceOf(DOMSelection)
    expect((sel as DOMSelection).elements[0]).toBe(el)
  })

  it('$() with . returns all matching elements', () => {
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div')
      el.className = 'card'
      document.body.appendChild(el)
    }
    const sel = $('.card') as DOMSelection
    expect(sel).toBeInstanceOf(DOMSelection)
    expect(sel.elements).toHaveLength(3)
  })

  it('.hide() sets display:none', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').hide()
    expect(el.style.display).toBe('none')
  })

  it('.show() clears display style', () => {
    const el = document.createElement('div')
    el.id = 'target'
    el.style.display = 'none'
    document.body.appendChild(el)
    $('#target').show()
    expect(el.style.display).toBe('')
  })

  it('.toggle() flips visibility back and forth', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').toggle()
    expect(el.style.display).toBe('none')
    $('#target').toggle()
    expect(el.style.display).toBe('')
  })

  it('.addClass() adds and .removeClass() removes a CSS class', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').addClass('active')
    expect(el.classList.contains('active')).toBe(true)
    $('#target').removeClass('active')
    expect(el.classList.contains('active')).toBe(false)
  })

  it('.toggleClass() toggles a class on/off', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').toggleClass('highlight')
    expect(el.classList.contains('highlight')).toBe(true)
    $('#target').toggleClass('highlight')
    expect(el.classList.contains('highlight')).toBe(false)
  })

  it('.disable() sets the disabled attribute and .enable() removes it', () => {
    const btn = document.createElement('button')
    btn.id = 'btn'
    document.body.appendChild(btn)
    $('#btn').disable()
    expect(btn.hasAttribute('disabled')).toBe(true)
    $('#btn').enable()
    expect(btn.hasAttribute('disabled')).toBe(false)
  })

  it('.attr(key, val) sets an attribute; .attr(key) reads it back', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').attr('data-role', 'dialog')
    expect($('#target').attr('data-role')).toBe('dialog')
  })

  it('.attr(key) returns null for an unset attribute', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    expect($('#target').attr('data-missing')).toBeNull()
  })

  it('.val(value) sets input value; .val() reads it back', () => {
    const input = document.createElement('input')
    input.id = 'name'
    document.body.appendChild(input)
    $('#name').val('Alice')
    expect($('#name').val()).toBe('Alice')
  })

  it('.remove() detaches the element from the DOM', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').remove()
    expect(document.getElementById('target')).toBeNull()
  })

  it('.fadeIn() sets opacity to 1 and clears display', () => {
    const el = document.createElement('div')
    el.id = 'target'
    el.style.display = 'none'
    document.body.appendChild(el)
    $('#target').fadeIn()
    expect(el.style.opacity).toBe('1')
    expect(el.style.display).toBe('')
  })

  it('.fadeOut() sets opacity to 0', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').fadeOut()
    expect(el.style.opacity).toBe('0')
  })

  it('.slideUp() collapses the element', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    $('#target').slideUp()
    expect(el.style.maxHeight).toBe('0px')
    expect(el.style.overflow).toBe('hidden')
  })

  it('.slideDown() expands the element', () => {
    const el = document.createElement('div')
    el.id = 'target'
    el.style.maxHeight = '0'
    document.body.appendChild(el)
    $('#target').slideDown()
    expect(el.style.maxHeight).toBe('')
  })

  it('methods return this for chaining', () => {
    const el = document.createElement('div')
    el.id = 'chain'
    document.body.appendChild(el)
    const sel = $('#chain')
    const result = sel.hide().show().addClass('a').removeClass('a').toggle()
    expect(result).toBe(sel)
  })

  it('empty DOM selection is a safe no-op on every method', () => {
    expect(() =>
      $('#does-not-exist')
        .hide().show().toggle()
        .addClass('x').removeClass('x').toggleClass('x')
        .disable().enable().remove()
        .fadeIn().fadeOut().slideUp().slideDown()
        .scrollIntoView()
    ).not.toThrow()
  })

  it('empty selection .attr() returns null and .val() returns empty string', () => {
    expect($('#does-not-exist').attr('data-x')).toBeNull()
    expect($('#does-not-exist').val()).toBe('')
  })

  it('.width() and .height() return 0 for empty selection', () => {
    expect($('#does-not-exist').width()).toBe(0)
    expect($('#does-not-exist').height()).toBe(0)
  })

  it('.rect() returns null for empty selection', () => {
    expect($('#does-not-exist').rect()).toBeNull()
  })

  it('DOM selection .$update and .$reset are no-ops that return this', () => {
    const sel = $('#does-not-exist')
    expect(sel.$update('x', 1)).toBe(sel)
    expect(sel.$reset()).toBe(sel)
  })

  it('DOM selection .methods.anything() is a no-op that returns this', () => {
    const el = document.createElement('div')
    el.id = 'target'
    document.body.appendChild(el)
    const sel = $('#target')
    expect(sel.methods.nonExistentMethod()).toBe(sel)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Component selection
// ────────────────────────────────────────────────────────────────────────────
describe('$ — component selection', () => {
  it('$("Name") returns a ComponentSelection with all registered instances', () => {
    register('Button', {})
    register('Button', {})
    const sel = $('Button')
    expect(sel).toBeInstanceOf(ComponentSelection)
    expect((sel as ComponentSelection).instances).toHaveLength(2)
  })

  it('$("Name") returns empty ComponentSelection for unknown blueprint', () => {
    const sel = $('Unknown') as ComponentSelection
    expect(sel).toBeInstanceOf(ComponentSelection)
    expect(sel.instances).toHaveLength(0)
  })

  it('$("Name.cls") filters instances by el CSS class', () => {
    const id1 = register('Button', {})
    register('Button', {})

    const el = document.createElement('button')
    el.classList.add('primary')
    getById(id1)!.el = el

    const sel = $('Button.primary') as ComponentSelection
    expect(sel.instances).toHaveLength(1)
    expect(sel.instances[0].id).toBe(id1)
  })

  it('$("Name#elid") filters instances by el.id', () => {
    const id1 = register('Button', {})
    register('Button', {})

    const el = document.createElement('button')
    el.id = 'submit'
    getById(id1)!.el = el

    const sel = $('Button#submit') as ComponentSelection
    expect(sel.instances).toHaveLength(1)
    expect(sel.instances[0].id).toBe(id1)
  })

  it('$("Name[prop=\\"val\\"]") filters by string prop value', () => {
    register('Button', { props: { variant: 'danger' } })
    register('Button', { props: { variant: 'primary' } })

    const sel = $('Button[variant="danger"]') as ComponentSelection
    expect(sel.instances).toHaveLength(1)
    expect(sel.instances[0].props.variant).toBe('danger')
  })

  it('$("Name[prop=true]") filters by boolean prop value', () => {
    register('Button', { props: { disabled: true } })
    register('Button', { props: { disabled: false } })

    const sel = $('Button[disabled=true]') as ComponentSelection
    expect(sel.instances).toHaveLength(1)
    expect(sel.instances[0].props.disabled).toBe(true)
  })

  it('$("Name[state.key>n]") filters by state value with > operator', () => {
    register('Counter', { state: createState({ count: 15 }) })
    register('Counter', { state: createState({ count: 5 }) })

    const sel = $('Counter[state.count>10]') as ComponentSelection
    expect(sel.instances).toHaveLength(1)
    expect(sel.instances[0].state.count).toBe(15)
  })

  it('$("Name[state.key<n]") filters by state value with < operator', () => {
    register('Counter', { state: createState({ count: 3 }) })
    register('Counter', { state: createState({ count: 20 }) })

    const sel = $('Counter[state.count<10]') as ComponentSelection
    expect(sel.instances).toHaveLength(1)
    expect(sel.instances[0].state.count).toBe(3)
  })

  it('.$update() updates state on every matched instance', () => {
    const s1 = createState({ count: 0 })
    const s2 = createState({ count: 0 })
    register('Counter', { state: s1 })
    register('Counter', { state: s2 })

    $('Counter').$update('count', 99)
    expect(s1.count).toBe(99)
    expect(s2.count).toBe(99)
  })

  it('.$update() returns this for chaining', () => {
    register('Counter', { state: createState({ count: 0 }) })
    const sel = $('Counter')
    expect(sel.$update('count', 1)).toBe(sel)
  })

  it('.$reset() resets state on every matched instance', () => {
    const s1 = createState({ count: 5, label: 'A' })
    const s2 = createState({ count: 10, label: 'B' })
    register('Counter', { state: s1 })
    register('Counter', { state: s2 })

    ;($('Counter') as ComponentSelection).$reset({ count: 0, label: 'X' })
    expect(s1.count).toBe(0)
    expect(s1.label).toBe('X')
    expect(s2.count).toBe(0)
    expect(s2.label).toBe('X')
  })

  it('.methods.x() calls the named method on every matched instance', () => {
    const calls: string[] = []
    const state = createState({})
    register('Button', { state, methods: { ping: () => calls.push('a') } })
    register('Button', { state, methods: { ping: () => calls.push('b') } })

    $('Button').methods.ping()
    expect(calls).toEqual(['a', 'b'])
  })

  it('.methods.x() returns the selection for chaining', () => {
    const state = createState({})
    register('Button', { state, methods: { noop: () => {} } })
    const sel = $('Button')
    expect(sel.methods.noop()).toBe(sel)
  })

  it('.methods.missing() is a safe no-op', () => {
    register('Button', { methods: {} })
    expect(() => $('Button').methods.nonExistent()).not.toThrow()
  })

  it('.hide() and .show() operate on each instance el', () => {
    const id = register('Card', {})
    const el = document.createElement('div')
    getById(id)!.el = el

    $('Card').hide()
    expect(el.style.display).toBe('none')
    $('Card').show()
    expect(el.style.display).toBe('')
  })

  it('.addClass() and .removeClass() operate on each instance el', () => {
    const id = register('Card', {})
    const el = document.createElement('div')
    getById(id)!.el = el

    $('Card').addClass('featured')
    expect(el.classList.contains('featured')).toBe(true)
    $('Card').removeClass('featured')
    expect(el.classList.contains('featured')).toBe(false)
  })

  it('.disable() and .enable() operate on each instance el', () => {
    const id = register('Card', {})
    const el = document.createElement('div')
    getById(id)!.el = el

    $('Card').disable()
    expect(el.hasAttribute('disabled')).toBe(true)
    $('Card').enable()
    expect(el.hasAttribute('disabled')).toBe(false)
  })

  it('.attr(key, val) sets attribute on each instance el; .attr(key) reads first', () => {
    const id = register('Card', {})
    const el = document.createElement('div')
    getById(id)!.el = el

    $('Card').attr('data-id', '42')
    expect($('Card').attr('data-id')).toBe('42')
  })

  it('.fadeOut() and .fadeIn() animate each instance el', () => {
    const id = register('Modal', {})
    const el = document.createElement('div')
    getById(id)!.el = el

    $('Modal').fadeOut()
    expect(el.style.opacity).toBe('0')
    $('Modal').fadeIn()
    expect(el.style.opacity).toBe('1')
  })

  it('.slideUp() and .slideDown() animate each instance el', () => {
    const id = register('Panel', {})
    const el = document.createElement('div')
    getById(id)!.el = el

    $('Panel').slideUp()
    expect(el.style.maxHeight).toBe('0px')
    $('Panel').slideDown()
    expect(el.style.maxHeight).toBe('')
  })

  it('empty component selection is a safe no-op on every method', () => {
    expect(() =>
      ($('Ghost') as ComponentSelection)
        .hide().show().toggle()
        .addClass('x').removeClass('x').toggleClass('x')
        .disable().enable().remove()
        .fadeIn().fadeOut().slideUp().slideDown()
        .$update('k', 1)
        .$reset({ k: 0 })
        .methods.anything()
    ).not.toThrow()
  })

  it('instances without el are silently skipped by DOM methods', () => {
    register('Widget', {}) // el defaults to null
    expect(() => $('Widget').hide().addClass('x').disable()).not.toThrow()
  })

  it('chained component methods return the same selection', () => {
    const id = register('Chip', {})
    const el = document.createElement('span')
    getById(id)!.el = el

    const sel = $('Chip')
    const result = sel.hide().show().addClass('a').removeClass('a')
    expect(result).toBe(sel)
  })
})
