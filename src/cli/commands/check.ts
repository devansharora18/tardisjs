// Static `tardis check` — lex + parse every page/component blueprint,
// run the template checker, and print one `file:line:col code message` line
// per diagnostic. Parse failures become diagnostics so one broken file does
// not hide the rest.
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import { lex } from '../../lexer/lexer'
import { parseFile } from '../../parser/parser'
import { TardisError } from '../../parser/errors'
import { checkFile, type CheckDiagnostic } from '../../compiler/check'
import { listTardisFiles } from '../lib/fs'
import { loadConfig } from '../lib/project'

export async function checkProject(cwd = process.cwd()): Promise<{ diagnostics: CheckDiagnostic[]; ok: boolean }> {
  // Temp dirs in tests may lack a config — fall back to conventional dirs.
  let pagesDir = './pages'
  let componentsDir = './components'
  try {
    const config = await loadConfig(cwd)
    pagesDir = config.pages
    componentsDir = config.components
  } catch {
    // keep defaults
  }

  const files = [
    ...(await listTardisFiles(path.resolve(cwd, pagesDir))),
    ...(await listTardisFiles(path.resolve(cwd, componentsDir))),
  ].sort()

  const diagnostics: CheckDiagnostic[] = []
  for (const file of files) {
    const source = await fsp.readFile(file, 'utf8')
    try {
      const parsed = parseFile(lex(source), path.basename(file))
      diagnostics.push(...checkFile({ imports: parsed.imports, blueprint: parsed.blueprint, file }))
    } catch (error) {
      if (error instanceof TardisError) {
        diagnostics.push({
          file, line: error.line, col: error.col,
          code: 'unknown-ref', message: `parse error: ${error.message.split('\n').pop()?.trim() ?? error.message}`,
        })
      } else {
        throw error
      }
    }
  }

  diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col)

  if (diagnostics.length === 0) {
    console.log(`check passed — ${files.length} file(s), no issues`)
  } else {
    for (const d of diagnostics) {
      console.log(`${d.file}:${d.line}:${d.col} ${d.code} ${d.message}`)
    }
  }

  return { diagnostics, ok: diagnostics.length === 0 }
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Statically validate .tardis blueprints (helpers, refs, unused, slots)')
    .action(async () => {
      const { ok } = await checkProject(process.cwd())
      if (!ok) process.exit(1)
    })
}
