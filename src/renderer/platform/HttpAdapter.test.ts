import { describe, it, expect, vi, afterEach } from 'vitest'
import { HttpAdapter } from './HttpAdapter'

const PID = 'proj-abc'

describe('HttpAdapter', () => {
  afterEach(() => vi.restoreAllMocks())

  // ── project management ──────────────────────────────────────────────────────

  it('listProjects GETs /api/projects', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([{ id: 'proj-abc', name: 'My Library', path: '/srv/readbetter-library', docCount: 3 }]),
        { status: 200 }
      )
    )
    const result = await new HttpAdapter().listProjects()
    expect(result).toEqual([{ id: 'proj-abc', name: 'My Library', path: '/srv/readbetter-library', docCount: 3 }])
    expect(fetchMock).toHaveBeenCalledWith('/api/projects')
  })

  it('registerProject POSTs path to /api/projects', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'proj-abc', name: 'My Library', path: '/srv/readbetter-library', docCount: 0 }),
        { status: 200 }
      )
    )
    const result = await new HttpAdapter().registerProject('/srv/readbetter-library')
    expect(result).toMatchObject({ id: 'proj-abc', name: 'My Library' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/projects')
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } })
    expect(JSON.parse(init!.body as string)).toEqual({ path: '/srv/readbetter-library' })
  })

  it('unregisterProject DELETEs /api/projects/:id', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 })
    )
    await new HttpAdapter().unregisterProject('proj-abc')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('proj-abc')
    expect(String(url)).toContain('/api/projects/')
    expect(init).toMatchObject({ method: 'DELETE' })
  })

  // ── project-scoped methods ──────────────────────────────────────────────────

  it('listLibrary GETs /api/documents with projectId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ ref: 'documents/a.md', name: 'a.md', ext: 'md' }]), {
        status: 200
      })
    )
    const a = new HttpAdapter()
    expect(await a.listLibrary(PID)).toEqual([{ ref: 'documents/a.md', name: 'a.md', ext: 'md' }])
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/documents')
    expect(String(url)).toContain(`projectId=${encodeURIComponent(PID)}`)
  })

  it('openDocument GETs /api/document with projectId and an encoded ref', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ref: 'documents/a b.md', content: '# Hi' }), { status: 200 })
    )
    const a = new HttpAdapter()
    expect(await a.openDocument(PID, 'documents/a b.md')).toEqual({
      ref: 'documents/a b.md',
      content: '# Hi'
    })
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`projectId=${encodeURIComponent(PID)}`)
    expect(String(url)).toContain(`ref=${encodeURIComponent('documents/a b.md')}`)
  })

  it('readSidecar returns null on 404, string on 200', async () => {
    const a = new HttpAdapter()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('no sidecar', { status: 404 }))
    expect(await a.readSidecar(PID, 'documents/a.md')).toBeNull()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"x":1}', { status: 200 }))
    expect(await a.readSidecar(PID, 'documents/a.md')).toBe('{"x":1}')
  })

  it('readSidecar URL contains projectId', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"x":1}', { status: 200 }))
    await new HttpAdapter().readSidecar(PID, 'documents/a.md')
    expect(String(fetchMock.mock.calls[0][0])).toContain(`projectId=${encodeURIComponent(PID)}`)
  })

  it('writeSidecar POSTs the json body with projectId; throws on non-2xx', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    const a = new HttpAdapter()
    await a.writeSidecar(PID, 'documents/a.md', '{"x":1}')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`projectId=${encodeURIComponent(PID)}`)
    expect(String(url)).toContain(`ref=${encodeURIComponent('documents/a.md')}`)
    expect(init).toMatchObject({ method: 'POST', body: '{"x":1}', keepalive: true })
  })

  it('openDocumentBytes GETs /api/file with projectId and returns an ArrayBuffer', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(bytes, { status: 200 }))
    const a = new HttpAdapter()
    const out = await a.openDocumentBytes(PID, 'documents/a.pdf')
    expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]))
    expect(String(fetchMock.mock.calls[0][0])).toContain(`projectId=${encodeURIComponent(PID)}`)
  })

  it('parsePdf GETs /api/pdf-parse with projectId and returns the JSON', async () => {
    const result = { pages: [{ index: 0, width: 1, height: 2 }], runs: [], scanned: false }
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }))
    const out = await new HttpAdapter().parsePdf(PID, 'documents/p.pdf')
    expect(out).toEqual(result)
    expect(String(fetchMock.mock.calls[0][0])).toContain(`projectId=${encodeURIComponent(PID)}`)
  })

  it('throws on a 500 from readSidecar', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(new HttpAdapter().readSidecar(PID, 'documents/a.md')).rejects.toThrow()
  })

  it('listCanvases GETs /api/canvases with projectId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ ref: 'canvases/a.md', name: 'a.md', title: 'A' }]), { status: 200 })
    )
    expect(await new HttpAdapter().listCanvases(PID)).toEqual([
      { ref: 'canvases/a.md', name: 'a.md', title: 'A' }
    ])
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`projectId=${encodeURIComponent(PID)}`)
  })

  it('readCanvas returns null on 404, string on 200', async () => {
    const a = new HttpAdapter()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('no canvas', { status: 404 }))
    expect(await a.readCanvas(PID, 'canvases/x.md')).toBeNull()
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('md', { status: 200 }))
    expect(await a.readCanvas(PID, 'canvases/x.md')).toBe('md')
  })

  it('readCanvas URL contains projectId', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('md', { status: 200 }))
    await new HttpAdapter().readCanvas(PID, 'canvases/x.md')
    expect(String(fetchMock.mock.calls[0][0])).toContain(`projectId=${encodeURIComponent(PID)}`)
  })

  it('writeCanvas POSTs the markdown body with projectId', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    await new HttpAdapter().writeCanvas(PID, 'canvases/x.md', 'md')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain(`projectId=${encodeURIComponent(PID)}`)
    expect(String(url)).toContain(`ref=${encodeURIComponent('canvases/x.md')}`)
    expect(init).toMatchObject({
      method: 'POST',
      body: 'md',
      headers: { 'content-type': 'text/markdown' }
    })
  })

  // ── native folder picker ────────────────────────────────────────────────────

  it('pickFolder GETs /api/pick-folder and returns the chosen path', async () => {
    const fetchMock = vi.fn(async (_url: unknown) => new Response(JSON.stringify({ path: 'C:\\Books' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const a = new HttpAdapter()
    expect(await a.pickFolder()).toBe('C:\\Books')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/pick-folder')
  })

  // ── obsidian export ─────────────────────────────────────────────────────────

  it('obsidianExportExists GETs /api/obsidian-export with projectId + title', async () => {
    const fetchMock = vi.fn(async (_url: unknown) => new Response(JSON.stringify({ exists: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await new HttpAdapter().obsidianExportExists('p1', 'My Canvas')).toBe(true)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/obsidian-export')
    expect(url).toContain('projectId=p1')
    expect(url).toContain('title=My%20Canvas')
  })

  it('writeObsidianExport POSTs the files as JSON', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ written: 1, dir: 'x' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await new HttpAdapter().writeObsidianExport('p1', 'C', [{ path: 'a.md', content: 'A' }])
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ files: [{ path: 'a.md', content: 'A' }] })
  })

  it('renderPdfPageImage GETs /api/pdf-page-image with projectId + ref and returns a Blob', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }))
    const blob = await new HttpAdapter().renderPdfPageImage(PID, 'documents/p.pdf', 2, 150)
    expect(blob).toBeInstanceOf(Blob)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png)
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/pdf-page-image')
    expect(String(url)).toContain(`projectId=${encodeURIComponent(PID)}`)
    expect(String(url)).toContain(`ref=${encodeURIComponent('documents/p.pdf')}`)
    expect(String(url)).toContain('page=2')
    expect(String(url)).toContain('dpi=150')
  })

  it('renderPdfPageImage throws on a non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(new HttpAdapter().renderPdfPageImage(PID, 'documents/p.pdf', 0, 150)).rejects.toThrow()
  })
})
