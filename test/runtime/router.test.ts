import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { createRouter, $navigate, $params, $back, $forward } from '../../src/runtime/router'
import { registerEvents } from '../../src/runtime/events'

let dom: JSDOM

function setupDom(url = 'http://localhost/') {
  dom = new JSDOM('<!doctype html><html><body><div id="app"></div><a id="about" href="/about">About</a></body></html>', { url })
  vi.stubGlobal('window', dom.window as unknown as Window & typeof globalThis)
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('history', dom.window.history)
  vi.stubGlobal('location', dom.window.location)
}

describe('runtime router', () => {
  beforeEach(() => {
    setupDom()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('matches static route and mounts initial component', () => {
    const Home = () => {
      const el = document.createElement('div')
      el.textContent = 'home'
      return el
    }

    const router = createRouter([{ path: '/', component: Home }])
    router.start()

    expect(document.getElementById('app')?.textContent).toContain('home')
  })

  it('extracts dynamic params from path segments', () => {
    setupDom('http://localhost/post/hello-world')

    const Post = () => {
      const el = document.createElement('div')
      el.textContent = 'post'
      return el
    }

    const router = createRouter([{ path: '/post/:slug', component: Post }])
    router.start()

    expect($params.slug).toBe('hello-world')
    expect(document.getElementById('app')?.textContent).toContain('post')
  })

  it('navigates programmatically with $navigate', () => {
    const Home = () => {
      const el = document.createElement('div')
      el.textContent = 'home'
      return el
    }

    const About = () => {
      const el = document.createElement('div')
      el.textContent = 'about'
      return el
    }

    const router = createRouter([
      { path: '/', component: Home },
      { path: '/about', component: About },
    ])

    router.start()
    $navigate('/about')

    expect(window.location.pathname).toBe('/about')
    expect(document.getElementById('app')?.textContent).toContain('about')
  })

  it('intercepts internal anchor clicks and navigates', () => {
    const Home = () => {
      const el = document.createElement('div')
      el.textContent = 'home'
      return el
    }

    const About = () => {
      const el = document.createElement('div')
      el.textContent = 'about'
      return el
    }

    const router = createRouter([
      { path: '/', component: Home },
      { path: '/about', component: About },
    ])

    router.start()
    const link = document.getElementById('about') as HTMLAnchorElement
    link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(window.location.pathname).toBe('/about')
    expect(document.getElementById('app')?.textContent).toContain('about')
  })

  it('handles internal links with hash fragments without 404', () => {
    setupDom('http://localhost/docs')

    const Home = () => {
      const el = document.createElement('div')
      const section = document.createElement('section')
      section.id = 'features'
      section.textContent = 'home features'
      el.appendChild(section)
      return el
    }

    const Docs = () => {
      const el = document.createElement('div')
      el.textContent = 'docs'
      return el
    }

    const router = createRouter([
      { path: '/', component: Home },
      { path: '/docs', component: Docs },
    ])

    router.start()

    const link = document.createElement('a')
    link.href = '/#features'
    link.textContent = 'Features'
    document.body.appendChild(link)

    link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(window.location.pathname).toBe('/')
    expect(window.location.hash).toBe('#features')
    expect(document.getElementById('app')?.textContent).toContain('home features')
    expect(document.getElementById('app')?.textContent).not.toContain('404')
  })

  it('delegates back and forward calls to browser history', () => {
    const backSpy = vi.spyOn(window.history, 'back')
    const forwardSpy = vi.spyOn(window.history, 'forward')

    $back()
    $forward()

    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(forwardSpy).toHaveBeenCalledTimes(1)
  })

  it('flushes onMount callbacks after route mount', () => {
    const onMountSpy = vi.fn()

    const Home = () => {
      registerEvents({ onMount: onMountSpy })
      const el = document.createElement('div')
      el.textContent = 'home'
      return el
    }

    const router = createRouter([{ path: '/', component: Home }])
    router.start()

    expect(onMountSpy).toHaveBeenCalledTimes(1)
  })
})
