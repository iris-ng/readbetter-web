import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { canvasTitle, canvasDeleted } from '../canvas/canvas'
import { CanvasEntry } from './types'
import { canvasesDir } from './paths'
import { resolveRef } from './library'
import { writeFileAtomic } from '../fs-atomic'

/** List <canvasesDir>/*.md with titles from frontmatter. Missing dir → []. */
export async function listCanvasesCentral(home: string, projectId: string): Promise<CanvasEntry[]> {
  const dir = canvasesDir(home, projectId)
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
    const entry: CanvasEntry = { ref: e.name, name: e.name, title: canvasTitle(raw) ?? e.name }
    if (canvasDeleted(raw)) entry.deleted = true
    out.push(entry)
  }
  return out
}

export async function readCanvasCentral(home: string, projectId: string, ref: string): Promise<string | null> {
  try {
    return await readFile(resolveRef(canvasesDir(home, projectId), ref), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function writeCanvasCentral(home: string, projectId: string, ref: string, md: string): Promise<void> {
  await writeFileAtomic(resolveRef(canvasesDir(home, projectId), ref), md)
}
