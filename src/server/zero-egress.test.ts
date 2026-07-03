// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import http, { Server } from 'http'
import https from 'https'
import { createServer } from './createServer'
import { registerProject } from '../core/library/registry'
import { emptySidecar, serializeSidecar } from '../core/sidecar/sidecar'

/**
 * Privacy guard (principle B): a full open→read→write cycle through the server must make
 * ZERO outbound network calls. We spy on the outbound clients and assert they never fire.
 * Covers http.request / https.request / fetch. Raw net.connect / tls.connect are not
 * intercepted; this is sufficient given the server's fs-only dependency surface.
 */
describe('zero egress', () => {
  let home: string
  let proj: string
  let webDir: string
  let projectId: string
  let server: Server
  let base: string
  const httpReq = vi.spyOn(http, 'request')
  const httpsReq = vi.spyOn(https, 'request')
  const fetchSpy = vi.spyOn(globalThis, 'fetch')

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'rb-egress-home-'))
    proj = await mkdtemp(join(tmpdir(), 'rb-egress-proj-'))
    webDir = await mkdtemp(join(tmpdir(), 'rb-egress-web-'))
    await writeFile(join(proj, 'a.md'), '# Hi', 'utf-8')
    await writeFile(join(webDir, 'index.html'), '<title>rb</title>', 'utf-8')
    const project = await registerProject(home, proj)
    projectId = project.id
    server = createServer({ home, webDir })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    httpReq.mockClear()
    httpsReq.mockClear()
    fetchSpy.mockClear()
  })
  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
    await rm(home, { recursive: true, force: true })
    await rm(proj, { recursive: true, force: true })
    await rm(webDir, { recursive: true, force: true })
  })

  it('makes no outbound requests during a full cycle', async () => {
    const pid = encodeURIComponent(projectId)
    const ref = encodeURIComponent('a.md')
    // The test's own fetch hits the loopback server; count outbound calls made BY the server.
    const before = fetchSpy.mock.calls.length

    const listRes = await fetch(`${base}/api/documents?projectId=${pid}`)
    expect(listRes.ok).toBe(true)

    const docRes = await fetch(`${base}/api/document?projectId=${pid}&ref=${ref}`)
    expect(docRes.ok).toBe(true)

    const sidecar = serializeSidecar(emptySidecar('doc-egress', 'hash-egress'))
    const postRes = await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sidecar
    })
    expect(postRes.ok).toBe(true)

    const getRes = await fetch(`${base}/api/sidecar?projectId=${pid}&ref=${ref}`)
    expect(getRes.ok).toBe(true)
    expect(await getRes.json()).toMatchObject({ documentId: 'doc-egress', sourceHash: 'hash-egress' })

    // Our 4 fetches are the only fetch calls; the server itself must not have added any.
    expect(fetchSpy.mock.calls.length - before).toBe(4)
    expect(httpReq).not.toHaveBeenCalled()
    expect(httpsReq).not.toHaveBeenCalled()
  })
})
