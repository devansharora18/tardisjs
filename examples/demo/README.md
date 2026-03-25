# tardisjs demo website

This is a small multi-page demo app for tardisjs.

## Routes

- `/` → Home (`pages/index.tardis`)
- `/about` → About (`pages/about.tardis`)
- `/:slug` → Dynamic page (`pages/[slug].tardis`)

## Run locally

From this folder (`examples/demo`), run the app with the tardis CLI.

```bash
npx tardis dev
npx tardis build
npx tardis preview
```

If you are developing `tardisjs` locally in this monorepo, link your local CLI first (or run the CLI entrypoint you use in your local workflow), then run the same commands above from `examples/demo`.
