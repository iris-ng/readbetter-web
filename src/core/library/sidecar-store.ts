// src/core/library/sidecar-store.ts
import { readFile } from 'fs/promises'
import { basename } from 'path'
import { hashForRef } from './hash-cache'
import { loadIndex, saveIndex, updateIndexEntry, findHashByPath } from './index-store'
import { sidecarPath } from './paths'
import { writeFileAtomic } from '../fs-atomic'

export interface SidecarRead {
  hash: string
  json: string | null
}

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * Read the content-addressed sidecar for the document at `ref`. If the current byte-hash has no
 * sidecar but the index shows this path previously held a different hash whose sidecar exists,
 * carry that sidecar forward to the new hash (the file changed in place). The old sidecar file is
 * left on disk (never deleted); only its index entry is repointed.
 */
export async function readSidecarByContent(
  home: string,
  projectId: string,
  projectRoot: string,
  ref: string
): Promise<SidecarRead> {
  const hash = await hashForRef(home, projectId, projectRoot, ref)
  const current = await readFileOrNull(sidecarPath(home, projectId, hash))
  if (current !== null) return { hash, json: current }

  // Carry-forward: did this path recently hold a different hash with a sidecar?
  const index = await loadIndex(home, projectId)
  const prevHash = findHashByPath(index, ref)
  if (prevHash !== undefined && prevHash !== hash) {
    const prevJson = await readFileOrNull(sidecarPath(home, projectId, prevHash))
    if (prevJson !== null) {
      await writeFileAtomic(sidecarPath(home, projectId, hash), prevJson)
      index[hash] = { ...index[prevHash], relPath: ref, name: basename(ref) }
      delete index[prevHash]
      await saveIndex(home, projectId, index)
      return { hash, json: prevJson }
    }
  }
  return { hash, json: null }
}

/** Write the sidecar JSON for the document at `ref`, keyed by its byte-hash; index the location. */
export async function writeSidecarByContent(
  home: string,
  projectId: string,
  projectRoot: string,
  ref: string,
  json: string
): Promise<string> {
  const hash = await hashForRef(home, projectId, projectRoot, ref)
  await writeFileAtomic(sidecarPath(home, projectId, hash), json)
  await updateIndexEntry(home, projectId, hash, { relPath: ref, name: basename(ref) })
  return hash
}
