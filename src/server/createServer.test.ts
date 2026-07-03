// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, stat, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { request as httpRequest } from 'http'
import type { Server } from 'http'
import { createServer, resolveProjectRoot } from './createServer'
import { registerProject } from '../core/library/registry'
import { sidecarPath } from '../core/library/paths'
import { hashBytes } from '../core/content-hash'
import { emptySidecar, serializeSidecar } from '../core/sidecar/sidecar'
import { parsePdfBytes } from '../core/pdf/liteparse'
import { emptyCanvas, serializeCanvas } from '../core/canvas/canvas'

// Mock the LiteParse wrapper so the route test never touches the native binary.
vi.mock('../core/pdf/liteparse', async (orig) => {
  const actual = await orig<typeof import('../core/pdf/liteparse')>()
  return {
    ...actual,
    parsePdfBytes: vi.fn(async () => ({
      pages: [{ index: 0, width: 100, height: 200 }],
      runs: [{ pageIndex: 0, text: 'hi', x: 1, y: 2, w: 3, h: 4, ocr: false }],
      scanned: false
    })),
    screenshotPdfPageBytes: vi.fn(async () => ({
      pageIndex: 0,
      width: 100,
      height: 200,
      png: Buffer.from([0x89, 0x50, 0x4e, 0x47]) // "‰PNG"
    }))
  }
})

/** Sends a raw HTTP GET with a spoofed Host header (Node fetch forbids overriding Host). */
function getWithHost(url: string, host: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = httpRequest(
      { hostname: u.hostname, port: Number(u.port), path: u.pathname + u.search, method: 'GET', headers: { host } },
      (res) => { res.resume(); resolve({ status: res.statusCode ?? 0 }) }
    )
    req.on('error', reject)
    req.end()
  })
}

/**
 * Sends a raw HTTP request with arbitrary headers (Node fetch forbids overriding
 * forbidden headers like Origin). Returns the response status code.
 */
function requestStatus(
  base: string,
  urlPath: string,
  options: { method?: string; headers?: Record<string, string> } = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    const u = new URL(base)
    const req = httpRequest(
      {
        hostname: u.hostname,
        port: Number(u.port),
        path: urlPath,
        method: options.method ?? 'GET',
        headers: options.headers ?? {}
      },
      (res) => { res.resume(); resolve(res.statusCode ?? 0) }
    )
    req.on('error', reject)
    req.end()
  })
}

async function start(home: string, webDir: string): Promise<{ server: Server; base: string }> {
  const server = createServer({ home, webDir })
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return { server, base: `http://127.0.0.1:${port}` }
}

describe('createServer', () => {
  let home: string
  let projectDir: string
  let projectId: string
  let webDir: string
  let server: Server
  let base: string

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'rb-home-'))
    projectDir = await mkdtemp(join(tmpdir(), 'rb-srv-'))
    webDir = await mkdtemp(join(tmpdir(), 'rb-web-'))
    await mkdir(join(projectDir, 'documents'), { recursive: true })
    await writeFile(join(projectDir, 'documents', 'a.md'), '# Hello', 'utf-8')
    await writeFile(join(webDir, 'index.html'), '<!doctype html><title>rb</title>', 'utf-8')
    const project = await registerProject(home, projectDir)
    projectId = project.id
    ;({ server, base } = await start(home, webDir))
  })
  afterEach(async () => {
    await new Promise<void>((res) => server.close(() => res()))
    await rm(home, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
    await rm(webDir, { recursive: true, force: true })
  })

  it('GET /api/documents returns the document list', async () => {
    const res = await fetch(`${base}/api/documents?projectId=${encodeURIComponent(projectId)}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([{ ref: 'documents/a.md', name: 'a.md', ext: 'md' }])
  })

  it('GET /api/document?ref= returns content', async () => {
    const res = await fetch(`${base}/api/document?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('documents/a.md')}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ref: 'documents/a.md', content: '# Hello' })
  })

  it('serves a .mjs asset with a JavaScript module content-type (pdf.js worker)', async () => {
    await writeFile(join(webDir, 'worker.mjs'), 'export const x = 1', 'utf-8')
    const res = await fetch(`${base}/worker.mjs`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/javascript/)
  })

  it('GET /api/sidecar?ref= is 404 when absent, 200 after POST', async () => {
    const ref = encodeURIComponent('documents/a.md')
    const pid = encodeURIComponent(projectId)
    expect((await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`)).status).toBe(404)
    const sidecar = serializeSidecar(emptySidecar('doc-1', 'hash-1'))
    const post = await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sidecar
    })
    expect(post.status).toBe(204)
    const get = await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`)
    expect(get.status).toBe(200)
    expect(await get.text()).toBe(sidecar)
  })

  it('persists a sidecar centrally keyed by content hash (round-trip)', async () => {
    // Write the source doc so its byte-hash can be computed
    await writeFile(join(projectDir, 'report.txt'), 'DOC', 'utf-8')
    const pid = encodeURIComponent(projectId)
    const sidecar = serializeSidecar(emptySidecar('doc-1', 'h'))
    const post = await fetch(`${base}/api/sidecar?projectId=${pid}&ref=report.txt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sidecar
    })
    expect(post.status).toBe(204)
    const get = await fetch(`${base}/api/sidecar?projectId=${pid}&ref=report.txt`)
    expect(get.status).toBe(200)
    expect(await get.text()).toBe(sidecar)

    // (a) Source folder must be untouched — new code writes nothing into the source folder.
    //     Old code wrote <sourceFolder>/.readbetter/sidecars/...; new code must not.
    const srcEntries = await readdir(projectDir)
    expect(srcEntries).not.toContain('.readbetter')

    // (b) Sidecar must land in the central store, keyed by the document's content hash.
    const docHash = hashBytes(Buffer.from('DOC', 'utf-8'))
    await expect(stat(sidecarPath(home, projectId, docHash))).resolves.toBeTruthy()
  })

  it('rejects a corrupt sidecar POST body with 400 and does not write it', async () => {
    const ref = encodeURIComponent('documents/a.md')
    const pid = encodeURIComponent(projectId)
    // not valid JSON
    expect(
      (await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json'
      })).status
    ).toBe(400)
    // valid JSON but not a sidecar shape
    expect(
      (await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"hello":1}'
      })).status
    ).toBe(400)
    // nothing was written → still 404
    expect((await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`)).status).toBe(404)
  })

  it('refuses a traversal ref with 400', async () => {
    const res = await fetch(`${base}/api/document?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('../../etc/passwd')}`)
    expect(res.status).toBe(400)
  })

  it('GET /api/file?ref= returns raw bytes', async () => {
    const res = await fetch(`${base}/api/file?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('documents/a.md')}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('# Hello')
  })

  it('GET /api/file refuses a traversal ref with 400', async () => {
    const res = await fetch(`${base}/api/file?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('../../etc/passwd')}`)
    expect(res.status).toBe(400)
  })

  it('GET /api/file returns binary content byte-identical', async () => {
    const { writeFile } = await import('fs/promises')
    const { join } = await import('path')
    const bytes = Uint8Array.from([0x00, 0x7f, 0x80, 0xff, 0x10])
    await writeFile(join(projectDir, 'documents', 'b.bin'), bytes)
    const res = await fetch(`${base}/api/file?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('documents/b.bin')}`)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it('GET /api/pdf-parse?ref= returns the normalized parse result', async () => {
    await writeFile(join(projectDir, 'documents', 'p.pdf'), Buffer.from([1, 2, 3]))
    const res = await fetch(`${base}/api/pdf-parse?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('documents/p.pdf')}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pages).toHaveLength(1)
    expect(body.runs[0].text).toBe('hi')
    expect(parsePdfBytes).toHaveBeenCalledWith(expect.any(Buffer))
  })

  it('GET /api/pdf-page-image returns image/png bytes', async () => {
    await writeFile(join(projectDir, 'documents', 'p.pdf'), Buffer.from([1, 2, 3]))
    const res = await fetch(
      `${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('documents/p.pdf')}&page=0&dpi=150`
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  })

  it('GET /api/pdf-page-image rejects a bad page with 400', async () => {
    await writeFile(join(projectDir, 'documents', 'p.pdf'), Buffer.from([1, 2, 3]))
    const ref = encodeURIComponent('documents/p.pdf')
    expect((await fetch(`${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${ref}&page=-1&dpi=150`)).status).toBe(400)
    expect((await fetch(`${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${ref}&page=abc&dpi=150`)).status).toBe(400)
    expect((await fetch(`${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${ref}&dpi=150`)).status).toBe(400)
  })

  it('GET /api/pdf-page-image rejects an out-of-range or non-numeric dpi with 400', async () => {
    await writeFile(join(projectDir, 'documents', 'p.pdf'), Buffer.from([1, 2, 3]))
    const ref = encodeURIComponent('documents/p.pdf')
    expect((await fetch(`${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${ref}&page=0&dpi=50`)).status).toBe(400)
    expect((await fetch(`${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${ref}&page=0&dpi=99999`)).status).toBe(400)
    expect((await fetch(`${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${ref}&page=0&dpi=xyz`)).status).toBe(400)
  })

  it('GET /api/pdf-page-image is 404 for a missing ref', async () => {
    const res = await fetch(
      `${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('documents/none.pdf')}&page=0&dpi=150`
    )
    expect(res.status).toBe(404)
  })

  it('GET /api/pdf-page-image refuses a traversal ref with 400', async () => {
    const res = await fetch(
      `${base}/api/pdf-page-image?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('../../etc/passwd')}&page=0&dpi=150`
    )
    expect(res.status).toBe(400)
  })

  it('rejects a non-loopback Host header with 403', async () => {
    // Node's global fetch (undici) treats Host as a forbidden header and ignores overrides,
    // so we use http.request directly to send a spoofed Host header.
    const res = await getWithHost(`${base}/api/documents?projectId=${encodeURIComponent(projectId)}`, 'evil.example.com')
    expect(res.status).toBe(403)
  })

  it('accepts a case-insensitive loopback Host', async () => {
    const status = await getWithHost(`${base}/api/documents?projectId=${encodeURIComponent(projectId)}`, 'LOCALHOST')
    expect(status.status).toBe(200)
  })

  it('serves index.html for an unknown non-API route (SPA fallback)', async () => {
    const res = await fetch(`${base}/some/spa/route`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>rb</title>')
  })

  it('rejects a sidecar POST without application/json content-type (415)', async () => {
    const ref = encodeURIComponent('documents/a.md')
    const pid = encodeURIComponent(projectId)
    const res = await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'whatever'
    })
    expect(res.status).toBe(415)
  })

  it('rejects a cross-site Origin with 403', async () => {
    // Node fetch (undici) forbids overriding the Origin header, so we use http.request directly.
    const status = await requestStatus(base, `/api/documents?projectId=${encodeURIComponent(projectId)}`, {
      headers: { origin: 'http://evil.example.com' }
    })
    expect(status).toBe(403)
  })

  it('lists, writes (validated), reads, and round-trips a canvas', async () => {
    const pid = encodeURIComponent(projectId)
    const md =
      '---\nschemaVersion: 1\nid: "t"\ntitle: "T"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const ref = encodeURIComponent('t.md')
    const post = await fetch(`${base}/api/canvas?projectId=${pid}&ref=${ref}`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: md
    })
    expect(post.status).toBe(204)
    const get = await fetch(`${base}/api/canvas?projectId=${pid}&ref=${ref}`)
    expect(get.status).toBe(200)
    expect(await get.text()).toBe(md)
    const list = await fetch(`${base}/api/canvases?projectId=${pid}`)
    expect(list.status).toBe(200)
    expect(await list.json()).toContainEqual({ ref: 't.md', name: 't.md', title: 'T' })
  })

  it('GET /api/canvas is 404 when absent', async () => {
    const res = await fetch(`${base}/api/canvas?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('none.md')}`)
    expect(res.status).toBe(404)
  })

  it('rejects a malformed canvas POST body with 400 and does not write it', async () => {
    const pid = encodeURIComponent(projectId)
    const ref = encodeURIComponent('bad.md')
    const res = await fetch(`${base}/api/canvas?projectId=${pid}&ref=${ref}`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: 'garbage'
    })
    expect(res.status).toBe(400)
    expect((await fetch(`${base}/api/canvas?projectId=${pid}&ref=${ref}`)).status).toBe(404)
  })

  it('rejects a canvas POST without text/markdown content-type (415)', async () => {
    const pid = encodeURIComponent(projectId)
    const res = await fetch(`${base}/api/canvas?projectId=${pid}&ref=${encodeURIComponent('x.md')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    expect(res.status).toBe(415)
  })

  it('stores canvases centrally by bare ref (round-trip + list)', async () => {
    const md = serializeCanvas(emptyCanvas('c1', 'Free Will'))
    const post = await fetch(`${base}/api/canvas?projectId=${projectId}&ref=free-will.md`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: md
    })
    expect(post.status).toBe(204)
    const list = (await (await fetch(`${base}/api/canvases?projectId=${projectId}`)).json()) as { ref: string }[]
    expect(list.map((c) => c.ref)).toContain('free-will.md')
  })

  it('GET /api/canvas refuses a traversal ref with 400', async () => {
    const res = await fetch(`${base}/api/canvas?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('../../etc/passwd')}`)
    expect(res.status).toBe(400)
  })

  it('POST /api/canvas refuses a traversal ref with 400 (write guard)', async () => {
    const md =
      '---\nschemaVersion: 1\nid: "t"\ntitle: "T"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const res = await fetch(`${base}/api/canvas?projectId=${encodeURIComponent(projectId)}&ref=${encodeURIComponent('../../etc/evil.md')}`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: md
    })
    expect(res.status).toBe(400)
  })

  it('a project-scoped route without projectId returns 400 matching unknown project', async () => {
    const res = await fetch(`${base}/api/documents`)
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/unknown project/i)
  })

  it('GET/POST /api/obsidian-export checks existence then writes the bundle', async () => {
    // (use the file's existing helper to start a server with a registered tmp project → { base, projectId })
    const before = await fetch(`${base}/api/obsidian-export?projectId=${projectId}&title=My%20Canvas`)
    expect(await before.json()).toEqual({ exists: false })

    const post = await fetch(`${base}/api/obsidian-export?projectId=${projectId}&title=My%20Canvas`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'My Canvas.canvas', content: '{}' }, { path: 'a.md', content: 'A' }] })
    })
    expect(post.status).toBe(200)
    const postJson = await post.json() as { written: number; dir: string }
    expect(postJson.written).toBe(2)
    expect(postJson.dir).toMatch(/[/\\]exports[/\\]My Canvas$/)

    const after = await fetch(`${base}/api/obsidian-export?projectId=${projectId}&title=My%20Canvas`)
    expect(await after.json()).toEqual({ exists: true })
  })

  it('writes Obsidian export centrally, not into the source folder', async () => {
    const res = await fetch(`${base}/api/obsidian-export?projectId=${projectId}&title=My%20Vault`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'note.md', content: '# hi' }] })
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { written: number }
    expect(body.written).toBe(1)
    // Source folder must remain free of an "Obsidian Exports" dir.
    expect(await readdir(projectDir)).not.toContain('Obsidian Exports')
  })

  it('returns the content hash on document open', async () => {
    await writeFile(join(projectDir, 'report.txt'), 'DOC', 'utf-8')
    const pid = encodeURIComponent(projectId)
    const res = await fetch(`${base}/api/document?projectId=${pid}&ref=report.txt`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ref: string; content: string; hash: string }
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('projects CRUD routes', () => {
  it('registers, lists, and unregisters a project over HTTP', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rb-home-'))
    const proj = await mkdtemp(join(tmpdir(), 'rb-proj-'))
    const webDir2 = await mkdtemp(join(tmpdir(), 'rb-web-'))
    await writeFile(join(proj, 'a.md'), '# A', 'utf-8')
    let srv2: Server | undefined
    try {
      const started2 = await start(home, webDir2)
      srv2 = started2.server
      const base2 = started2.base

      // POST /api/projects → 201, body has id and docCount === 1
      const postRes = await fetch(`${base2}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: proj })
      })
      expect(postRes.status).toBe(201)
      const created = await postRes.json() as { id: string; docCount: number }
      expect(typeof created.id).toBe('string')
      expect(created.docCount).toBe(1)

      // GET /api/projects → array length 1
      const listRes = await fetch(`${base2}/api/projects`)
      expect(listRes.status).toBe(200)
      const list = await listRes.json() as unknown[]
      expect(list).toHaveLength(1)

      // DELETE /api/projects/:id → 204
      const delRes = await fetch(`${base2}/api/projects/${encodeURIComponent(created.id)}`, {
        method: 'DELETE'
      })
      expect(delRes.status).toBe(204)

      // GET /api/projects → empty
      const listRes2 = await fetch(`${base2}/api/projects`)
      expect(listRes2.status).toBe(200)
      const list2 = await listRes2.json() as unknown[]
      expect(list2).toHaveLength(0)
    } finally {
      if (srv2) await new Promise<void>((res) => srv2!.close(() => res()))
      await rm(home, { recursive: true, force: true })
      await rm(proj, { recursive: true, force: true })
      await rm(webDir2, { recursive: true, force: true })
    }
  })

  it('marks registered projects with missing source folders', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rb-home-'))
    const proj = await mkdtemp(join(tmpdir(), 'rb-proj-'))
    const webDir2 = await mkdtemp(join(tmpdir(), 'rb-web-'))
    let srv2: Server | undefined
    try {
      const project = await registerProject(home, proj)
      await rm(proj, { recursive: true, force: true })
      const started2 = await start(home, webDir2)
      srv2 = started2.server

      const listRes = await fetch(`${started2.base}/api/projects`)
      expect(listRes.status).toBe(200)
      const list = (await listRes.json()) as { id: string; docCount: number; missing?: boolean }[]
      expect(list).toEqual([
        expect.objectContaining({ id: project.id, docCount: 0, missing: true })
      ])
    } finally {
      if (srv2) await new Promise<void>((res) => srv2!.close(() => res()))
      await rm(home, { recursive: true, force: true })
      await rm(proj, { recursive: true, force: true })
      await rm(webDir2, { recursive: true, force: true })
    }
  })
})

describe('locate endpoint', () => {
  it('relocates a project to a new folder, keeping its id', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rb-home-'))
    const folder1 = await mkdtemp(join(tmpdir(), 'rb-loc1-'))
    const folder2 = await mkdtemp(join(tmpdir(), 'rb-loc2-'))
    const webDir2 = await mkdtemp(join(tmpdir(), 'rb-web-'))
    let srv: Server | undefined
    try {
      const project = await registerProject(home, folder1)
      const pid = project.id
      const started = await start(home, webDir2)
      srv = started.server
      const base2 = started.base
      const res = await fetch(`${base2}/api/projects/${encodeURIComponent(pid)}/locate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: folder2 })
      })
      expect(res.status).toBe(200)
      const info = (await res.json()) as { id: string; path: string }
      expect(info.id).toBe(pid)
      expect(info.path).toBe(folder2)
    } finally {
      if (srv) await new Promise<void>((res) => srv!.close(() => res()))
      await rm(home, { recursive: true, force: true })
      await rm(folder1, { recursive: true, force: true })
      await rm(folder2, { recursive: true, force: true })
      await rm(webDir2, { recursive: true, force: true })
    }
  })
})

describe('resolveProjectRoot', () => {
  it('resolveProjectRoot resolves a registered id and rejects an unknown one', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rb-home-'))
    const projectDir = await mkdtemp(join(tmpdir(), 'rb-proj-'))
    try {
      const project = await registerProject(home, projectDir)
      await expect(resolveProjectRoot(home, project.id)).resolves.toBe(projectDir)
      await expect(resolveProjectRoot(home, 'does-not-exist')).rejects.toThrow(/unknown project/i)
    } finally {
      await rm(home, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
    }
  })
})
