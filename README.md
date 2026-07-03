# readbetter

readbetter is a local-first, browser-based reader for PDF and Markdown. It is built around the browser's native window and tab model so you can spread reading, writing, and annotation across more usable space: open documents in tabs, detach tabs as windows, and arrange them with your operating system's window manager.

Your documents remain ordinary files on disk. readbetter does not lock your work into a proprietary document format, and it does not require cloud storage, sync, subscriptions, or AI calls.

## What readbetter does

Documents are usually treated as endless scrolls. You lose your place, marginalia gets separated from the thing you were reading, and comparison means juggling tabs or remembering where a passage was.

readbetter makes reading spatial:

1. Register an existing folder as a project.
2. Open a PDF or Markdown document from that project.
3. Read in a focused browser-based Reader with section-aware position tracking.
4. Highlight passages and attach notes.
5. Use browser tabs and detached windows to keep documents, notes, and canvases visible at the same time.
6. Build synthesis on Canvas with excerpt cards, note cards, connections, and portable Markdown storage.

Pin and Compare is coming soon. The goal is to let you pin passages side by side and compress the space between them so comparison does not depend on endless scrolling or memory.

## Why it is different

- **Local-first:** readbetter runs on your machine. The server binds to `127.0.0.1`, and the app is designed to work without outbound network calls.
- **Browser-based workspace:** readbetter uses the browser architecture you already have: tabs, windows, detachable views, browser zoom, and your OS window manager. More reading surface does not require a custom desktop shell.
- **No proprietary format lock-in:** source documents stay as source documents. Annotations are saved as open JSON sidecars, and canvases are Markdown with YAML frontmatter.
- **Current file support is intentionally narrow:** PDF and Markdown are the supported document formats today.
- **Projects are ordinary folders:** point readbetter at folders you already use. Source files are not rewritten or imported into a managed library.
- **Reading and writing stay connected:** highlighted passages can become Canvas excerpt cards with backlinks to their source.

## Getting started

### Prerequisites

- Node.js 18+
- A folder containing PDF or Markdown files

### Install and run

```bash
npm install
npm run start:web
```

`npm run start:web` builds the web bundle and server, starts the local Node server, binds to `127.0.0.1` on port 7777 or a free fallback port, and prints the browser URL.

On first run, register a project folder:

- **Windows:** click **+ Add folder** in the Projects screen and choose a folder.
- **macOS, Linux, headless, or scripted runs:** start with `READBETTER_LIBRARY=/path/to/folder npm run start:web` or pass `--library=/path/to/folder`.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for local running and sharing details.

## Development

```bash
npm run dev          # Vite dev server for UI work only
npm test             # Vitest, offline
npm run test:watch   # Watch mode tests
npm run typecheck    # TypeScript type-check
npm run build        # Build web bundle and server
npm run build:web    # Build only the web bundle
npm run build:server # Build only the server
npm run start:web    # Build and start the full local app
```

`npm run dev` starts the Vite dev server only. Use `npm run start:web` to run the full app with the local API server.

## Key directories

- `src/core/` - platform-free document model, importing, anchoring, canvas data structures, and storage logic.
- `src/renderer/` - React browser UI for Reader, Canvas, annotations, projects, and tabs.
- `src/renderer/platform/` - `PlatformAdapter` and `HttpAdapter`, the renderer's seam to the local server.
- `src/server/` - loopback Node server, HTTP routes, filesystem access, project registry, and browser launching.

For a layer-by-layer map, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```text
Browser UI (React + Vite)
  |
  | PlatformAdapter / HttpAdapter
  v
HTTP on 127.0.0.1:PORT
  |
  v
Node.js loopback server
  |
  v
Filesystem-backed projects and sidecars
```

## Features

### Documents and reading

- **Supported formats:** PDF and Markdown.
- **Reader:** browser-based reading surface with section-aware position tracking.
- **Annotations:** highlights and optional notes saved outside the source document.
- **Anchoring:** stable text anchors with fallback behavior so annotations are not silently deleted when source text changes.
- **Detached windows:** open tabs as separate browser windows to compare, write, and annotate across more screen space.

### Canvas

- **Excerpt cards:** turn highlighted passages into linked cards.
- **Note cards:** add your own writing alongside excerpts.
- **Connections:** draw labeled relationships between cards.
- **Pan and zoom:** arrange work freely on a spatial board.
- **Portable storage:** canvases are stored as Markdown with YAML frontmatter.
- **Obsidian Canvas export:** export a JSONCanvas `.canvas` board and Markdown notes for use in Obsidian.

### Coming soon

- **Pin and Compare:** pin passages side by side, compress intervening content, and compare without losing your place.

## Current status

readbetter is in active development. The current product surface is:

- PDF and Markdown reading
- Local project registration
- Browser-based tabs and detachable windows
- Highlights, notes, and sidecar storage
- Canvas Studio with excerpts, notes, connections, Markdown storage, and Obsidian Canvas export

Deferred work includes Pin and Compare, broader file format support, multi-document comparison workflows, AI-assisted features, session mode, and canvas auto-layout or drawing/images.

## Privacy and local-first

- The app runs locally and talks to a loopback server on `127.0.0.1`.
- Source documents remain untouched on disk.
- Generated app data is stored as inspectable files.
- There is no cloud service, account, sync backend, subscription, or AI call by default.

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Contributing

This is a solo/tiny-team project. Contributions are not open by default.
