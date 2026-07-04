# Running readbetter locally

readbetter is a local-first application. "Deployment" means running it on a machine and pointing it at folders of documents. There is no hosted service or cloud component.

## Prerequisites

- Node.js 18 or later.
- The readbetter source code.
- One or more folders containing PDF or Markdown files.

## 1. Install dependencies

From the repository root:

```bash
npm install
```

This installs runtime and build dependencies. It does not require network access beyond the initial install.

## 2. Start the app

```bash
npm run start:web
```

This command:

1. Builds the web bundle in `out-web/`.
2. Builds the server in `out-server/`.
3. Runs `node out-server/start.mjs`.
4. Binds the server to `127.0.0.1` on port 7777, or a free fallback port if 7777 is taken.
5. Opens the browser unless `READBETTER_NO_OPEN=1`.

The terminal prints the app URL:

```text
readbetter: serving projects from registry
  at http://127.0.0.1:7777
```

If the browser does not open automatically, copy the printed URL into your browser. The actual URL is also written to `~/.readbetter/server.json`.

## 3. Register a project folder

On first start, readbetter shows the Projects screen.

### Windows folder picker

Click **+ Add folder**, choose a folder containing PDF or Markdown files, and confirm. readbetter adds the folder to the per-machine registry and lists it on the Projects screen.

### macOS, Linux, headless, or scripted runs

Use `READBETTER_LIBRARY` or `--library=` with an absolute folder path.

```bash
READBETTER_LIBRARY=/home/alice/Papers npm run start:web
```

```bash
npm run start:web -- --library=/absolute/path/to/folder
```

Windows PowerShell:

```powershell
$env:READBETTER_LIBRARY = "C:\Users\Alice\Documents\Papers"
npm run start:web
```

When the server starts with `READBETTER_LIBRARY` or `--library=`, it auto-registers the folder idempotently and writes the registry entry to `~/.readbetter/registry.json`.

## 4. Data locations

readbetter keeps source documents and generated app data separate.

| Data | Location |
| --- | --- |
| Per-machine project registry | `~/.readbetter/registry.json` |
| Server discovery file | `~/.readbetter/server.json` |
| Per-project readbetter metadata | `~/.readbetter/projects/<projectId>/` |
| Annotation sidecars | `~/.readbetter/projects/<projectId>/sidecars/` |
| Canvases | `~/.readbetter/projects/<projectId>/canvases/` |
| Generated exports | `~/.readbetter/projects/<projectId>/exports/` |
| Source documents | Untouched in the registered project folder |

Source documents stay where they are. readbetter metadata is stored centrally under `~/.readbetter/projects/<projectId>/`; project folders are not currently self-contained bundles.

## 5. Sharing or moving work

To use readbetter on another machine:

1. Copy or clone the readbetter repository.
2. Run `npm install` on that machine.
3. Copy or sync the source document folder.
4. Copy the relevant central project metadata from `~/.readbetter/projects/<projectId>/` if you need annotations, canvases, exports, or other app state.
5. Start readbetter and register the copied source folder.

The registry at `~/.readbetter/registry.json` is per-machine because it stores absolute paths. If a project folder moves, re-register the folder at its new path.

## 6. Environment variables and flags

| Setting | Effect |
| --- | --- |
| `READBETTER_LIBRARY=<path>` | Auto-register a project folder at startup. |
| `--library=<path>` | Same as `READBETTER_LIBRARY`, passed as a command-line flag. |
| `READBETTER_PORT=<n>` | Preferred loopback server port. Defaults to 7777 and falls back if taken. |
| `READBETTER_NO_OPEN=1` | Suppress automatic browser open on startup. |

Examples:

```bash
READBETTER_LIBRARY=/home/alice/Papers READBETTER_PORT=9000 npm run start:web
```

```bash
READBETTER_NO_OPEN=1 npm run start:web -- --library=/data/Documents
```

## 7. Troubleshooting

**The browser does not open automatically.**
Copy the URL printed in the terminal and open it manually.

**Port 7777 is already in use.**
The server falls back to a free port. Use the URL printed in the terminal instead of assuming the port.

**The app loads a blank page.**
You may have opened the Vite dev server at `http://localhost:5173`. The Vite dev server from `npm run dev` does not include the API server. Use `npm run start:web` for the full app.

**The Projects screen is empty after restarting.**
The registry is stored in `~/.readbetter/registry.json`. If the file is missing or a folder moved, register the folder again.

**Annotations or canvases are missing after moving machines.**
Copy the relevant central project metadata under `~/.readbetter/projects/<projectId>/` as well as the source document folder.
