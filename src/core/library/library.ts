import { readdir, readFile, rename, unlink, writeFile, mkdir, stat, rm } from 'fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import { canvasTitle, canvasDeleted } from '../canvas/canvas'
import { CanvasEntry, LibraryEntry } from './types'

/**
 * Map a root-relative ref to an absolute path, refusing anything that escapes the root.
 * This is the single path-traversal guard for the whole app.
 */
export function resolveRef(root: string, ref: string): string {
  if (ref.includes('\0')) {
    throw new Error(`path traversal refused: invalid ref`)
  }
  const abs = resolve(root, ref)
  const rel = relative(root, abs)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path traversal refused: ${ref}`)
  }
  return abs
}

/** List documents anywhere under the project root, excluding the hidden .readbetter dir
 *  and dot-entries. Refs are project-relative POSIX paths. Missing root → []. */
export async function listLibrary(projectRoot: string): Promise<LibraryEntry[]> {
  const out: LibraryEntry[] = []
  async function walk(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      throw err
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue // skips .readbetter and any dotfile/dot-dir
      const abs = join(dir, e.name)
      if (e.isDirectory()) {
        await walk(abs)
      } else if (e.isFile()) {
        const ref = relative(projectRoot, abs).split(/[\\/]/).join('/')
        out.push({ ref, name: e.name, ext: extname(e.name).slice(1).toLowerCase() })
      }
    }
  }
  await walk(projectRoot)
  return out
}

/** Sidecar path under the hidden dir: <project>/.readbetter/sidecars/<ref>.json (subfolders mirrored). */
export function sidecarPathFor(projectRoot: string, ref: string): string {
  resolveRef(projectRoot, ref) // validate the doc ref does not escape the project
  return join(projectRoot, '.readbetter', 'sidecars', `${ref}.json`)
}

export async function readDocument(root: string, ref: string): Promise<string> {
  return readFile(resolveRef(root, ref), 'utf-8')
}

export async function readDocumentBytes(root: string, ref: string): Promise<Buffer> {
  return readFile(resolveRef(root, ref))
}

/**
 * Returns the raw JSON string for the sidecar under .readbetter/sidecars/<ref>.json, or null if it does not exist.
 * Does not require the source document to exist; only the traversal guard is enforced.
 */
export async function readSidecarFor(projectRoot: string, ref: string): Promise<string | null> {
  try {
    return await readFile(sidecarPathFor(projectRoot, ref), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Atomic: creates nested parent dirs, writes to a temp file, then renames over the target. Cleans up the temp on failure. */
export async function writeSidecarFor(projectRoot: string, ref: string, json: string): Promise<void> {
  const path = sidecarPathFor(projectRoot, ref)
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, json, 'utf-8')
  try {
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => undefined) // best-effort; don't mask the original error
    throw err
  }
}

/** List <root>/.readbetter/canvases/*.md with titles read from frontmatter. Missing dir → []. */
export async function listCanvases(root: string): Promise<CanvasEntry[]> {
  const dir = join(root, '.readbetter', 'canvases')
  let entries: import('fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const out: CanvasEntry[] = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    const raw = await readFile(join(dir, e.name), 'utf-8').catch(() => '')
    const entry: CanvasEntry = { ref: `.readbetter/canvases/${e.name}`, name: e.name, title: canvasTitle(raw) ?? e.name }
    if (canvasDeleted(raw)) entry.deleted = true
    out.push(entry)
  }
  return out
}

export async function readCanvasFor(root: string, ref: string): Promise<string | null> {
  try {
    return await readFile(resolveRef(root, ref), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Atomic write to <root>/<ref>; creates the canvases dir if needed. */
export async function writeCanvasFor(root: string, ref: string, md: string): Promise<void> {
  const path = resolveRef(root, ref)
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, md, 'utf-8')
  try {
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

const OBSIDIAN_EXPORTS = 'Obsidian Exports'

/** True if <root>/Obsidian Exports/<safeName> exists as a directory. */
export async function obsidianExportDirExists(root: string, safeName: string): Promise<boolean> {
  try {
    return (await stat(resolveRef(root, `${OBSIDIAN_EXPORTS}/${safeName}`))).isDirectory()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

/** Regenerate <root>/Obsidian Exports/<safeName>/: clear it, then write each file. resolveRef
 *  guards every path so neither safeName nor a per-file path can escape the export dir. */
export async function writeObsidianExportFiles(
  root: string,
  safeName: string,
  files: { path: string; content: string }[]
): Promise<void> {
  const dir = resolveRef(root, `${OBSIDIAN_EXPORTS}/${safeName}`)
  await rm(dir, { recursive: true, force: true })
  for (const f of files) {
    const abs = resolveRef(dir, f.path)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, f.content, 'utf-8')
  }
}
