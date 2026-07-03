import { readFile, stat } from 'fs/promises'
import { cachePath } from './paths'
import { writeFileAtomic } from '../fs-atomic'
import { hashBytes } from '../content-hash'
import { resolveRef } from './library'

export interface CacheEntry {
  size: number
  mtimeMs: number
  hash: string
}

/** Load the per-project (relPath → CacheEntry) hash cache. Missing file → {}. */
export async function loadCache(home: string, projectId: string): Promise<Record<string, CacheEntry>> {
  try {
    const raw = await readFile(cachePath(home, projectId), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, CacheEntry>) : {}
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

/**
 * Byte-hash for the document at `ref`. Cache key is (size, mtimeMs); on a hit the file is not
 * read. On a miss the file is read, hashed, and the cache is persisted. Documents are immutable,
 * so the common path is a hit and a given file is hashed at most once.
 */
export async function hashForRef(
  home: string,
  projectId: string,
  projectRoot: string,
  ref: string
): Promise<string> {
  const abs = resolveRef(projectRoot, ref) // traversal guard
  const st = await stat(abs)
  const cache = await loadCache(home, projectId)
  const hit = cache[ref]
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.hash
  const bytes = await readFile(abs)
  const hash = hashBytes(bytes)
  cache[ref] = { size: st.size, mtimeMs: st.mtimeMs, hash }
  await writeFileAtomic(cachePath(home, projectId), JSON.stringify(cache, null, 2))
  return hash
}
