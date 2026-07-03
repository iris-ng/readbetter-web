# End-to-end tests (Playwright)

These specs are **not** part of the default `npm test` run (Vitest only collects
`src/**/*.{test,spec}.{ts,tsx}`) and are **not** typechecked by `tsconfig.json` (which
includes only `src`). They are the W0 acceptance E2E and require Playwright, which is not
installed by default.

## One-time setup (networked)

```bash
NODE_OPTIONS=--use-system-ca npm install -D @playwright/test
NODE_OPTIONS=--use-system-ca npx playwright install chromium
```

## Run

1. Create a scratch library folder containing `documents/sample.md` (any Markdown whose first
   section contains the text "First paragraph", or adjust the spec).
2. In one terminal, start the loopback server against it:
   ```bash
   READBETTER_LIBRARY=<that folder> npm run start:web
   ```
   (It serves at `http://127.0.0.1:7777` unless `READBETTER_PORT` is set or 7777 is taken —
   check `<library>/.readbetter/server.json` for the actual port.)
3. In another terminal:
   ```bash
   npx playwright test e2e/w0-open-annotate-persist.spec.ts
   ```

## Status

`w0-open-annotate-persist.spec.ts` is scaffolded with the open → reload flow. The
select-text-and-highlight step is marked `TODO` — wire it to the same gesture used in the
manual GUI smoke before relying on it in CI. Until then, the **manual GUI smoke** (see the W0
plan's "Manual GUI smoke" section) is the W0 acceptance gate.
