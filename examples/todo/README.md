# Todo Demo (tardisjs)

A runnable todo app demo website for tardisjs.

## Structure

- `pages/index.tardis` — todo app page (`/`)
- `components/TodoApp.tardis` — reusable component example
- `tardis.config.js` — demo config (`port: 3002`)

## Run

From this folder:

```bash
npx tsx ../../bin/tardis.ts dev
```

Open `http://localhost:3002`.

## Build + Preview

```bash
npx tsx ../../bin/tardis.ts build
npx tsx ../../bin/tardis.ts preview
```
