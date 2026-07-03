// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readDocument, readDocumentBytes, readSidecarFor, writeSidecarFor } from './library'

describe('library service — document + sidecar IO', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rb-io-'))
    await mkdir(join(root, 'documents'), { recursive: true })
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads a document by ref', async () => {
    await writeFile(join(root, 'documents', 'a.md'), '# Hello', 'utf-8')
    expect(await readDocument(root, 'documents/a.md')).toBe('# Hello')
  })

  it('returns null for a missing sidecar', async () => {
    await writeFile(join(root, 'documents', 'a.md'), '# Hello', 'utf-8')
    expect(await readSidecarFor(root, 'documents/a.md')).toBeNull()
  })

  it('writes a sidecar under .readbetter/sidecars and reads it back', async () => {
    await writeFile(join(root, 'documents', 'a.md'), '# Hello', 'utf-8')
    await writeSidecarFor(root, 'documents/a.md', '{"x":1}')
    expect(await readFile(join(root, '.readbetter', 'sidecars', 'documents', 'a.md.json'), 'utf-8')).toBe('{"x":1}')
    expect(await readSidecarFor(root, 'documents/a.md')).toBe('{"x":1}')
  })

  it('write leaves no .tmp on success', async () => {
    await writeFile(join(root, 'documents', 'a.md'), '# Hello', 'utf-8')
    await writeSidecarFor(root, 'documents/a.md', '{"x":2}')
    const { readdir } = await import('fs/promises')
    const files = await readdir(join(root, '.readbetter', 'sidecars', 'documents'))
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  it('reads document bytes by ref', async () => {
    await writeFile(join(root, 'documents', 'a.pdf'), Buffer.from([1, 2, 3, 4]))
    const buf = await readDocumentBytes(root, 'documents/a.pdf')
    expect(Buffer.from(buf)).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  it('refuses to read a document escaping the root', async () => {
    await expect(readDocument(root, '../../etc/passwd')).rejects.toThrow(/traversal/i)
  })
})
