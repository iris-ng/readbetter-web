# readbetter - Architecture

readbetter is a browser UI that talks to a loopback Node server over HTTP. Document and format logic lives in a pure, platform-free core. The main boundary is simple: the UI never touches the filesystem directly. It reaches documents, annotations, canvases, and exports through the `PlatformAdapter` seam.

```text
src/renderer/ (React browser UI)
  |
  | PlatformAdapter / HttpAdapter
  v
src/server/ (Node loopback HTTP server)
  |
  v
filesystem

src/core/ provides shared platform-free document, anchor, canvas, link, and storage logic.
```

## Runtime flow

1. The user acts in the React browser UI.
2. The UI calls a `PlatformAdapter` method.
3. `HttpAdapter` sends an HTTP request to `127.0.0.1:<port>`.
4. `src/server/createServer.ts` routes the request.
5. The server reads source documents from registered project folders and reads or writes readbetter metadata in central project storage.
6. The response flows back to the UI.

The server binds to loopback only. The renderer stays portable because all filesystem access is behind the server boundary.

## Layers

### `src/core/`

Platform-free logic shared by the app.

| Area | Responsibility |
| --- | --- |
| `model/` | Internal document model, section structure, and slugs. |
| `import/` | Importers that normalize supported source formats into the internal model. The current supported product surface is PDF and Markdown. |
| `anchor/` | Annotation anchoring and segment logic. |
| `sidecar/` | Open JSON annotation sidecar format. |
| `canvas/` | Canvas model, Markdown/YAML codec, and JSONCanvas export serializer. |
| `link/` | Cross-document link model. |
| `compare/` | Pin and Compare domain logic under development. |
| `pdf/` | PDF text and layout helpers. |
| `library/` | Project registry, path resolution, source document listing, storage paths, and store modules for sidecars, canvases, exports, cache, and index data. |

### `src/renderer/`

React browser UI.

- `App.tsx`, `main.tsx`, and `index.html` bootstrap the app.
- Reader, Canvas, annotation, project, tab, and detached-window UI live here.
- `src/renderer/platform/PlatformAdapter.ts` defines the UI boundary.
- `src/renderer/platform/HttpAdapter.ts` is the browser implementation of that boundary.
- The renderer does not hold direct filesystem authority.

### `src/server/`

Loopback server and local machine integration.

- `start.ts` starts the server and opens the browser unless `READBETTER_NO_OPEN=1`.
- `createServer.ts` defines HTTP routes for documents, sidecars, canvases, projects, exports, and related app data.
- `listen.ts` binds `127.0.0.1`, preferring port 7777 and falling back to an ephemeral port when needed.
- `pickFolder.ts` handles the native folder picker where supported.
- `openBrowser.ts` opens the local app URL.
- `zero-egress.test.ts` asserts the server does not make outbound network calls.

## Storage model

readbetter separates source documents from app metadata.

| Data | Location |
| --- | --- |
| Registered project paths | `~/.readbetter/registry.json` |
| Current server URL and port | `~/.readbetter/server.json` |
| Per-project readbetter metadata | `~/.readbetter/projects/<projectId>/` |
| Annotation sidecars | `~/.readbetter/projects/<projectId>/sidecars/` |
| Canvases | `~/.readbetter/projects/<projectId>/canvases/` |
| Generated exports | `~/.readbetter/projects/<projectId>/exports/` |
| Source documents | The registered project folder, untouched in place |

Project folders are ordinary folders containing your source documents. readbetter metadata is centrally stored per project under `~/.readbetter/projects/<projectId>/`; it is not currently embedded into each project folder as a self-contained bundle.

## Load-bearing decisions

1. **Browser UI plus loopback server.** The app gets a browser-native workspace while keeping filesystem access behind a small local server boundary.
2. **One internal document model.** Supported formats normalize into a shared model so Reader, annotations, Canvas, links, and future Compare logic can be implemented once.
3. **No proprietary document lock-in.** Source documents stay untouched. Sidecars are open JSON. Canvases are Markdown with YAML frontmatter.
4. **Canvas storage and export are separate.** Native canvas storage is Markdown/YAML. Obsidian Canvas export is an on-demand generated bundle containing JSONCanvas plus Markdown notes.
5. **Documents and canvases are independent top-level entities.** Excerpts connect them, allowing one document to feed many canvases and one canvas to use passages from multiple documents.
6. **Zero AI and zero egress by default.** The app does not require cloud services or AI calls to work.

See [FEATURES.md](FEATURES.md) for the product surface and [DEPLOYMENT.md](DEPLOYMENT.md) for local running details.
