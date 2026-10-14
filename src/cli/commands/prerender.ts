// Static `tardis prerender` — render static routes to HTML files.
//
// Runs AFTER `tardis build`: imports the compiled page/component modules in
// Node, renders each static route with renderToString, and writes
// `<route>/index.html` documents (SPA shell + prerendered #app content).
// Dynamic routes ([id]) are skipped — their params are only known at request
// time. The client boots normally over prerendered markup; because rendering
// is deterministic the remount is byte-identical, so there is no flash.
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import type { Command } from 'commander'
import { CLIError } from '../lib/errors'
import { ensureDir, pathExists } from '../lib/fs'
import { collectArtifacts, loadConfig } from '../lib/project'
import { renderToString } from '../../ssr/render'
import type { ComponentFactory } from '../../ssr/render'

export interface PrerenderedRoute {
  route: string
  file: string
  bytes: number
}

export interface PrerenderResult {
  rendered: PrerenderedRoute[]
  skipped: string[]
}

// The compiled artifacts import the browser runtime via an absolute path.
// Point them at this package's Node-runnable runtime bundle instead.
// Layouts differ: src tree (../../../dist), bundled dist (../../../../../dist).
async function runtimeBundleUrl(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../runtime/index.mjs'),
    path.resolve(here, '../../../dist/runtime/index.mjs'),
    path.resolve(here, '../../../../../dist/runtime/index.mjs'),
    path.resolve(here, '../../../../dist/runtime/index.mjs'),
  ]
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return pathToFileURL(candidate).href
    }
  }
  throw new CLIError(
    'TardisError: runtime bundle not found\n  Run "npm run build" in the tardisjs package first'
  )
}

function routeToFile(routePath: string): string {
  if (routePath === '/') return 'index.html'
  return `${routePath.replace(/^\//, '')}/index.html`
}

export async function prerenderProject(cwd = process.cwd()): Promise<PrerenderResult> {
  const config = await loadConfig(cwd)
  const outDir = path.resolve(cwd, config.outDir)
  const pagesOut = path.join(outDir, 'pages')
  if (!(await pathExists(pagesOut))) {
    throw new CLIError('TardisError: no built pages found\n  Run "npx tardis build" first')
  }

  const { pageArtifacts, componentArtifacts, routes } = await collectArtifacts(cwd, config)
  const runtimeUrl = await runtimeBundleUrl()

  // Stage copies with a Node-resolvable runtime specifier. The emitted
  // artifacts are otherwise untouched.
  const stage = await fsp.mkdtemp(path.join(os.tmpdir(), 'tardis-prerender-'))
  try {
    const stagedPages = new Map<string, string>()
    for (const artifact of [...pageArtifacts, ...componentArtifacts]) {
      const staged = path.join(stage, artifact.outputPath)
      await ensureDir(path.dirname(staged))
      const code = artifact.outputCode.replace(
        /from\s+['"]\/tardis-runtime\.js['"]/g,
        `from '${runtimeUrl}'`
      )
      await fsp.writeFile(staged, code, 'utf8')
      stagedPages.set(artifact.outputPath, staged)
    }

    const components: Record<string, ComponentFactory> = {}
    for (const artifact of componentArtifacts) {
      const mod = await import(pathToFileURL(stagedPages.get(artifact.outputPath)!).href)
      const factory = (mod.default ?? mod[artifact.componentName]) as ComponentFactory | undefined
      if (typeof factory === 'function') {
        components[artifact.componentName] = factory
      }
    }

    const shellPath = path.join(outDir, 'index.html')
    const shell = await fsp.readFile(shellPath, 'utf8')
    const appOpen = '<div id="app">'
    if (!shell.includes(appOpen)) {
      throw new CLIError('TardisError: built index.html has no #app mount point')
    }

    const rendered: PrerenderedRoute[] = []
    const skipped: string[] = []
    for (const route of routes) {
      if (route.routePath.includes(':')) {
        skipped.push(route.routePath)
        continue
      }
      const staged = [...stagedPages.entries()].find(([out]) =>
        out === route.importPath.replace(/^\//, '')
      )?.[1]
      if (!staged) {
        skipped.push(route.routePath)
        continue
      }
      const mod = await import(pathToFileURL(staged).href)
      const factory = (mod.default ?? mod[route.exportName]) as ComponentFactory | undefined
      if (typeof factory !== 'function') {
        skipped.push(route.routePath)
        continue
      }
      const bodyHtml = renderToString(factory, { components })
      const html = shell.replace(appOpen, `${appOpen}${bodyHtml}`)
      const rel = routeToFile(route.routePath)
      const dest = path.join(outDir, rel)
      await ensureDir(path.dirname(dest))
      await fsp.writeFile(dest, html, 'utf8')
      rendered.push({ route: route.routePath, file: rel, bytes: Buffer.byteLength(html) })
    }

    console.log(`✅ Prerender complete`)
    console.log(`- routes rendered: ${rendered.length}`)
    if (skipped.length > 0) {
      console.log(`- skipped (dynamic or unloadable): ${skipped.join(', ')}`)
    }
    return { rendered, skipped }
  } finally {
    await fsp.rm(stage, { recursive: true, force: true })
  }
}

export function registerPrerenderCommand(program: Command): void {
  program
    .command('prerender')
    .description('Render static routes to HTML files (run after build)')
    .action(async () => {
      await prerenderProject(process.cwd())
    })
}
