import { readFile } from 'fs/promises'
import { indexPath } from './paths'
import { writeFileAtomic } from '../fs-atomic'

export interface IndexEntry {
  relPath: string
  name: string
  title?: string
}

/** Load the per-project (hash → IndexEntry) index. Missing file → {}. */
export async function loadIndex(home: string, projectId: string): Promise<Record<string, IndexEntry>> {
  try {
    const raw = await readFile(indexPath(home, projectId), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, IndexEntry>) : {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

export async function saveIndex(
  home: string,
  projectId: string,
  index: Record<string, IndexEntry>
): Promise<void> {
  await writeFileAtomic(indexPath(home, projectId), JSON.stringify(index, null, 2))
}

export async function updateIndexEntry(
  home: string,
  projectId: string,
  hash: string,
  entry: IndexEntry
): Promise<void> {
  const index = await loadIndex(home, projectId)
  index[hash] = entry
  await saveIndex(home, projectId, index)
}

/** The hash whose entry currently points at `relPath`, if any. */
export function findHashByPath(index: Record<string, IndexEntry>, relPath: string): string | undefined {
  return Object.keys(index).find((h) => index[h].relPath === relPath)
}
