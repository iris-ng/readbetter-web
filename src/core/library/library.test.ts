// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveRef, listLibrary, listCanvases, readCanvasFor, writeCanvasFor, readSidecarFor, writeSidecarFor, obsidianExportDirExists, writeObsidianExportFiles } from './library'

describe('library service — resolveRef + listLibrary', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rb-lib-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('resolves a normal root-relative ref to an absolute path inside the root', () => {
    const abs = resolveRef(root, 'a.md')
    expect(abs).toBe(join(root, 'a.md'))
  })

  it('refuses path traversal escaping the root', () => {
    expect(() => resolveRef(root, '../secret.txt')).toThrow(/traversal/i)
    expect(() => resolveRef(root, 'kant/../../etc/passwd')).toThrow(/traversal/i)
  })

  it('refuses an absolute ref', () => {
    expect(() => resolveRef(root, '/etc/passwd')).toThrow(/traversal/i)
  })

  it('refuses a ref pointing at the root itself', () => {
    expect(() => resolveRef(root, '.')).toThrow(/traversal/i)
  })

  it('lists documents recursively as project-relative posix refs, excluding .readbetter and dotfiles', async () => {
    await writeFile(join(root, 'a.md'), '# A', 'utf-8')
    await mkdir(join(root, 'kant'), { recursive: true })
    await writeFile(join(root, 'kant', 'critique.epub'), 'x', 'utf-8')
    await mkdir(join(root, '.readbetter', 'sidecars'), { recursive: true })
    await writeFile(join(root, '.readbetter', 'sidecars', 'a.md.json'), '{}', 'utf-8')
    await writeFile(join(root, '.hidden'), 'x', 'utf-8')
    const entries = await listLibrary(root)
    expect(entries.map((e) => e.ref).sort()).toEqual(['a.md', 'kant/critique.epub'])
    expect(entries.find((e) => e.ref === 'kant/critique.epub')).toMatchObject({ name: 'critique.epub', ext: 'epub' })
  })

  it('returns [] for an empty project folder', async () => {
    expect(await listLibrary(root)).toEqual([])
  })

  it('refuses a ref containing a NUL byte', () => {
    expect(() => resolveRef(root, 'a\0.md')).toThrow(/traversal/i)
  })
})

describe('sidecar fs', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rb-sidecar-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes and reads a sidecar under .readbetter/sidecars, mirroring subfolders', async () => {
    await mkdir(join(root, 'kant'), { recursive: true })
    await writeFile(join(root, 'kant', 'critique.epub'), 'x', 'utf-8')
    expect(await readSidecarFor(root, 'kant/critique.epub')).toBeNull()
    await writeSidecarFor(root, 'kant/critique.epub', '{"documentId":"d","sourceHash":"h","annotations":[]}')
    const onDisk = await readFile(join(root, '.readbetter', 'sidecars', 'kant', 'critique.epub.json'), 'utf-8')
    expect(JSON.parse(onDisk).documentId).toBe('d')
    expect(await readSidecarFor(root, 'kant/critique.epub')).toContain('"documentId"')
  })

  it('refuses a traversing sidecar ref', async () => {
    await expect(writeSidecarFor(root, '../evil.md', '{}')).rejects.toThrow(/traversal/i)
  })
})

describe('canvas fs', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rb-canvas-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('listCanvases returns [] when the dir is missing', async () => {
    expect(await listCanvases(root)).toEqual([])
  })

  it('lists canvases from .readbetter/canvases with titles', async () => {
    await mkdir(join(root, '.readbetter', 'canvases'), { recursive: true })
    await writeFile(join(root, '.readbetter', 'canvases', 'free-will.md'),
      '---\ntitle: "Free Will"\n---\n', 'utf-8')
    const list = await listCanvases(root)
    expect(list).toEqual([{ ref: '.readbetter/canvases/free-will.md', name: 'free-will.md', title: 'Free Will' }])
  })

  it('round-trips a canvas via writeCanvasFor/readCanvasFor', async () => {
    await writeCanvasFor(root, '.readbetter/canvases/x.md', '---\ntitle: "X"\n---\n')
    expect(await readCanvasFor(root, '.readbetter/canvases/x.md')).toContain('title: "X"')
  })

  it('readCanvasFor returns content or null when absent', async () => {
    await writeCanvasFor(root, '.readbetter/canvases/a.md', 'hello')
    expect(await readCanvasFor(root, '.readbetter/canvases/a.md')).toBe('hello')
    expect(await readCanvasFor(root, '.readbetter/canvases/missing.md')).toBeNull()
  })

  it('writeCanvasFor writes atomically (final content present, no .tmp left)', async () => {
    await writeCanvasFor(root, '.readbetter/canvases/a.md', 'final')
    expect(await readFile(join(root, '.readbetter', 'canvases', 'a.md'), 'utf-8')).toBe('final')
    await expect(stat(join(root, '.readbetter', 'canvases', 'a.md.tmp'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses path traversal', async () => {
    await expect(readCanvasFor(root, '../escape.md')).rejects.toThrow(/traversal/i)
    await expect(writeCanvasFor(root, '../escape.md', 'x')).rejects.toThrow(/traversal/i)
  })
})

const tmps: string[] = []
async function root(): Promise<string> { const d = await mkdtemp(join(tmpdir(), 'rb-')); tmps.push(d); return d }
afterEach(async () => { for (const d of tmps.splice(0)) await rm(d, { recursive: true, force: true }) })

describe('obsidian export fs', () => {
  it('reports existence and writes files under "Obsidian Exports/<name>/"', async () => {
    const r = await root()
    expect(await obsidianExportDirExists(r, 'My Canvas')).toBe(false)
    await writeObsidianExportFiles(r, 'My Canvas', [{ path: 'My Canvas.canvas', content: '{}' }, { path: 'a.md', content: 'A' }])
    expect(await obsidianExportDirExists(r, 'My Canvas')).toBe(true)
    expect(await readFile(join(r, 'Obsidian Exports', 'My Canvas', 'a.md'), 'utf-8')).toBe('A')
  })
  it('clears stale files on re-export', async () => {
    const r = await root()
    await writeObsidianExportFiles(r, 'C', [{ path: 'old.md', content: 'x' }])
    await writeObsidianExportFiles(r, 'C', [{ path: 'new.md', content: 'y' }])
    await expect(readFile(join(r, 'Obsidian Exports', 'C', 'old.md'), 'utf-8')).rejects.toThrow()
    expect(await readFile(join(r, 'Obsidian Exports', 'C', 'new.md'), 'utf-8')).toBe('y')
  })
  it('refuses a traversing per-file path', async () => {
    const r = await root()
    await expect(writeObsidianExportFiles(r, 'C', [{ path: '../escape.md', content: 'x' }])).rejects.toThrow(/traversal/)
  })
})
