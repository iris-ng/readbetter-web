import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server } from 'http'
import { readFile, stat } from 'fs/promises'
import { extname, join, normalize, relative, isAbsolute } from 'path'
import { listLibrary, readDocument, readDocumentBytes } from '../core/library/library'
import { exportDirExistsCentral, writeExportFilesCentral } from '../core/library/export-store'
import { listCanvasesCentral, readCanvasCentral, writeCanvasCentral } from '../core/library/canvas-store'
import { readSidecarByContent, writeSidecarByContent } from '../core/library/sidecar-store'
import { parseSidecar } from '../core/sidecar/sidecar'
import { parseCanvas } from '../core/canvas/canvas'
import { safeExportDirName } from '../core/canvas/jsoncanvas'
import { parsePdfBytes, screenshotPdfPageBytes } from '../core/pdf/liteparse'
import { loadRegistry, registerProject, unregisterProject, findProject, relocateProject } from '../core/library/registry'
import { ProjectInfo } from '../core/library/types'
import { hashForRef, loadCache } from '../core/library/hash-cache'
import { pickFolder } from './pickFolder'

export interface ServerOptions {
  home: string
  webDir: string
}

export async function resolveProjectRoot(home: string, projectId: string): Promise<string> {
  const project = findProject(await loadRegistry(home), projectId)
  if (!project) throw new Error('unknown project')
  return project.path
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  // .mjs must be served as a JS module type or browsers refuse to load it (pdf.js worker).
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
}

/** Bounds on the fallback raster DPI accepted by /api/pdf-page-image (cost guardrail). */
const MIN_DPI = 72
const MAX_DPI = 300

/**
 * Loopback only: the Host header's hostname must be 127.0.0.1 or localhost.
 * Case-insensitive per RFC 7230. `[::1]` is intentionally excluded — the server
 * binds IPv4 127.0.0.1 only (see listen.ts), so IPv6 connections cannot reach it.
 */
function isLoopbackHost(req: IncomingMessage): boolean {
  const host = req.headers.host ?? ''
  const name = host.split(':')[0].toLowerCase()
  return name === '127.0.0.1' || name === 'localhost'
}

/** A present Origin header must be loopback — defends against cross-site (CSRF) requests. */
function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined) return true // same-origin requests typically omit Origin
  try {
    const name = new URL(origin).hostname.toLowerCase()
    return name === '127.0.0.1' || name === 'localhost'
  } catch {
    return false
  }
}

function send(res: ServerResponse, status: number, body: string, type = 'text/plain'): void {
  res.writeHead(status, { 'content-type': type })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

async function serveStatic(webDir: string, urlPath: string, res: ServerResponse): Promise<void> {
  // Normalize and strip leading slash; refuse escaping the web dir.
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  const candidate = safe === '' ? 'index.html' : safe
  const full = join(webDir, candidate)
  const rel = relative(webDir, full)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    send(res, 404, 'not found')
    return
  }
  try {
    const buf = await readFile(full)
    res.writeHead(200, { 'content-type': MIME[extname(full)] ?? 'application/octet-stream' })
    res.end(buf)
  } catch {
    // SPA fallback: any unknown non-asset route returns index.html.
    try {
      const html = await readFile(join(webDir, 'index.html'))
      res.writeHead(200, { 'content-type': MIME['.html'] })
      res.end(html)
    } catch {
      send(res, 404, 'not found')
    }
  }
}

async function projectInfo(home: string, project: { id: string; name: string; path: string }): Promise<ProjectInfo> {
  try {
    const info = await stat(project.path)
    if (!info.isDirectory()) return { id: project.id, name: project.name, path: project.path, docCount: 0, missing: true }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { id: project.id, name: project.name, path: project.path, docCount: 0, missing: true }
    }
    throw err
  }
  const docs = await listLibrary(project.path)
  return { id: project.id, name: project.name, path: project.path, docCount: docs.length }
}

export function createServer(opts: ServerOptions): Server {
  return createHttpServer((req, res) => {
    void handle(req, res, opts).catch((err) => {
      send(res, 500, String(err instanceof Error ? err.message : err))
    })
  })
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: ServerOptions): Promise<void> {
  if (!isLoopbackHost(req)) {
    send(res, 403, 'forbidden: loopback only')
    return
  }
  if (!isAllowedOrigin(req)) {
    send(res, 403, 'forbidden: cross-site origin')
    return
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const path = url.pathname

  if (path.startsWith('/api/')) {
    await handleApi(req, res, opts, url)
    return
  }

  if (req.method !== 'GET') {
    send(res, 405, 'method not allowed')
    return
  }
  await serveStatic(opts.webDir, path, res)
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ServerOptions,
  url: URL
): Promise<void> {
  const path = url.pathname
  const ref = url.searchParams.get('ref') ?? ''
  const projectId = url.searchParams.get('projectId') ?? ''
  const title = url.searchParams.get('title') ?? ''

  // Project-scoped routes need a root; /api/projects and /api/pick-folder do not.
  const needsProject = path !== '/api/projects' && !path.startsWith('/api/projects/') && path !== '/api/pick-folder'
  let root = ''

  try {
    if (needsProject) root = await resolveProjectRoot(opts.home, projectId) // throws 'unknown project' → 400

    if (path === '/api/documents' && req.method === 'GET') {
      const entries = await listLibrary(root)
      const cache = await loadCache(opts.home, projectId)
      const withHash = entries.map((e) => (cache[e.ref] ? { ...e, hash: cache[e.ref].hash } : e))
      send(res, 200, JSON.stringify(withHash), MIME['.json'])
      return
    }
    if (path === '/api/document' && req.method === 'GET') {
      const content = await readDocument(root, ref)
      const hash = await hashForRef(opts.home, projectId, root, ref)
      send(res, 200, JSON.stringify({ ref, content, hash }), MIME['.json'])
      return
    }
    if (path === '/api/file' && req.method === 'GET') {
      const buf = await readDocumentBytes(root, ref)
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': buf.byteLength })
      res.end(buf)
      return
    }
    if (path === '/api/pdf-parse' && req.method === 'GET') {
      const bytes = await readDocumentBytes(root, ref)
      send(res, 200, JSON.stringify(await parsePdfBytes(bytes)), MIME['.json'])
      return
    }
    if (path === '/api/pdf-page-image' && req.method === 'GET') {
      const pageRaw = url.searchParams.get('page')
      const dpiRaw = url.searchParams.get('dpi')
      if (pageRaw === null || !/^\d+$/.test(pageRaw)) {
        send(res, 400, 'invalid page')
        return
      }
      if (dpiRaw === null || !/^\d+$/.test(dpiRaw)) {
        send(res, 400, 'invalid dpi')
        return
      }
      const page = Number(pageRaw)
      const dpi = Number(dpiRaw)
      if (dpi < MIN_DPI || dpi > MAX_DPI) {
        send(res, 400, 'invalid dpi')
        return
      }
      const bytes = await readDocumentBytes(root, ref)
      const img = await screenshotPdfPageBytes(bytes, page, dpi)
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': img.png.byteLength })
      res.end(img.png)
      return
    }
    if (path === '/api/sidecar' && req.method === 'GET') {
      const { json } = await readSidecarByContent(opts.home, projectId, root, ref)
      if (json === null) {
        send(res, 404, 'no sidecar')
        return
      }
      send(res, 200, json, MIME['.json'])
      return
    }
    if (path === '/api/sidecar' && req.method === 'POST') {
      const ctype = (req.headers['content-type'] ?? '').toLowerCase()
      if (!ctype.includes('application/json')) {
        send(res, 415, 'unsupported media type: expected application/json')
        return
      }
      const body = await readBody(req)
      try {
        parseSidecar(body) // reject a corrupt body before it can overwrite good data
      } catch {
        send(res, 400, 'invalid sidecar')
        return
      }
      await writeSidecarByContent(opts.home, projectId, root, ref, body)
      res.writeHead(204)
      res.end()
      return
    }
    if (path === '/api/canvases' && req.method === 'GET') {
      send(res, 200, JSON.stringify(await listCanvasesCentral(opts.home, projectId)), MIME['.json'])
      return
    }
    if (path === '/api/canvas' && req.method === 'GET') {
      const raw = await readCanvasCentral(opts.home, projectId, ref)
      if (raw === null) {
        send(res, 404, 'no canvas')
        return
      }
      send(res, 200, raw, MIME['.md'])
      return
    }
    if (path === '/api/canvas' && req.method === 'POST') {
      const ctype = (req.headers['content-type'] ?? '').toLowerCase()
      if (!ctype.includes('text/markdown')) {
        send(res, 415, 'unsupported media type: expected text/markdown')
        return
      }
      const body = await readBody(req)
      try {
        parseCanvas(body) // reject a corrupt body before it can overwrite good data
      } catch {
        send(res, 400, 'invalid canvas')
        return
      }
      await writeCanvasCentral(opts.home, projectId, ref, body)
      res.writeHead(204)
      res.end()
      return
    }
    if (path === '/api/obsidian-export' && req.method === 'GET') {
      send(res, 200, JSON.stringify({ exists: await exportDirExistsCentral(opts.home, projectId, safeExportDirName(title)) }), MIME['.json'])
      return
    }
    if (path === '/api/obsidian-export' && req.method === 'POST') {
      const ctype = (req.headers['content-type'] ?? '').toLowerCase()
      if (!ctype.includes('application/json')) { send(res, 415, 'expected application/json'); return }
      const body = JSON.parse(await readBody(req)) as { files?: { path: string; content: string }[] }
      if (!Array.isArray(body.files)) { send(res, 400, 'files required'); return }
      const safe = safeExportDirName(title)
      const dir = await writeExportFilesCentral(opts.home, projectId, safe, body.files)
      send(res, 200, JSON.stringify({ written: body.files.length, dir }), MIME['.json'])
      return
    }
    if (path === '/api/projects' && req.method === 'GET') {
      const projects = await loadRegistry(opts.home)
      const infos = await Promise.all(projects.map((p) => projectInfo(opts.home, p)))
      send(res, 200, JSON.stringify(infos), MIME['.json'])
      return
    }
    if (path === '/api/projects' && req.method === 'POST') {
      const ctype = (req.headers['content-type'] ?? '').toLowerCase()
      if (!ctype.includes('application/json')) { send(res, 415, 'expected application/json'); return }
      const body = JSON.parse(await readBody(req)) as { path?: unknown }
      if (typeof body.path !== 'string' || body.path === '') { send(res, 400, 'path required'); return }
      const project = await registerProject(opts.home, body.path)
      send(res, 201, JSON.stringify(await projectInfo(opts.home, project)), MIME['.json'])
      return
    }
    if (path.startsWith('/api/projects/') && path.endsWith('/locate') && req.method === 'POST') {
      const id = decodeURIComponent(path.slice('/api/projects/'.length, -'/locate'.length))
      const ctype = (req.headers['content-type'] ?? '').toLowerCase()
      if (!ctype.includes('application/json')) { send(res, 415, 'expected application/json'); return }
      const body = JSON.parse(await readBody(req)) as { path?: unknown }
      if (typeof body.path !== 'string' || body.path === '') { send(res, 400, 'path required'); return }
      const project = await relocateProject(opts.home, id, body.path)
      send(res, 200, JSON.stringify(await projectInfo(opts.home, project)), MIME['.json'])
      return
    }
    if (path.startsWith('/api/projects/') && req.method === 'DELETE') {
      const id = decodeURIComponent(path.slice('/api/projects/'.length))
      await unregisterProject(opts.home, id)
      res.writeHead(204); res.end()
      return
    }
    if (path === '/api/pick-folder' && req.method === 'GET') {
      send(res, 200, JSON.stringify({ path: await pickFolder() }), MIME['.json'])
      return
    }
    send(res, 404, 'unknown api route')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/traversal/i.test(msg)) {
      send(res, 400, msg)
      return
    }
    if (/unknown project/i.test(msg)) {
      send(res, 400, msg)
      return
    }
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      send(res, 404, 'not found')
      return
    }
    throw err
  }
}
