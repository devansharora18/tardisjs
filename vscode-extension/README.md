# TardisJS Syntax Extension

Syntax highlighting for `*.tardis` files in VS Code.

## Features

- Registers the `tardis` language for `.tardis` files
- Highlights Tardis blueprint blocks (`state`, `props`, `computed`, `methods`, `events`, `style`, `ui`, `script`)
- Highlights control helpers (`$if`, `$each`, `$show`, `$fetch`, `$update`, `$toggle`, `$reset`, `$batch`)
- Highlights HTML-like markup inside `ui` blocks

## Local Usage

Package and install via VSIX:

```bash
npx @vscode/vsce package
code --install-extension tardisjs-syntax-0.1.0.vsix
```
