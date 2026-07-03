// src/core/library/sidecar-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readSidecarByContent, writeSidecarByContent } from './sidecar-store'
import { sidecarPath } from './paths'
import { loadIndex, findHashByPath } from './index-store'
import { emptySidecar, serializeSidecar, parseSidecar } from '../sidecar/sidecar'

let home: string
let root: string
const PID = 'p'

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'rb-sc-home-'))
  root = await mkdtemp(join(tmpdir(), 'rb-sc-root-'))
})

function sidecarWithNote(note: string): string {
  const s = emptySidecar('doc', 'h')
  s.annotations.push({ id: 'a1', color: 'yellow', note, anchor: { start: 0, end: 1, exact: 'A', prefix: '', suffix: '' } })
  return serializeSidecar(s)
}

describe('sidecar-store', () => {
  it('writes by content hash and indexes the location', async () => {
    await writeFile(join(root, 'a.txt'), 'AAA')
    const hash = await writeSidecarByContent(home, PID, root, 'a.txt', sidecarWithNote('hi'))
    await stat(sidecarPath(home, PID, hash)) // exists or throws
    expect((await loadIndex(home, PID))[hash]).toEqual({ relPath: 'a.txt', name: 'a.txt' })
  })

  it('reads back the sidecar for an unchanged file', async () => {
    await writeFile(join(root, 'a.txt'), 'AAA')
    await writeSidecarByContent(home, PID, root, 'a.txt', sidecarWithNote('hi'))
    const { json } = await readSidecarByContent(home, PID, root, 'a.txt')
    expect(json).not.toBeNull()
    expect(parseSidecar(json as string).annotations[0].note).toBe('hi')
  })

  it('returns null json for a never-annotated document', async () => {
    await writeFile(join(root, 'fresh.txt'), 'ZZZ')
    const { json } = await readSidecarByContent(home, PID, root, 'fresh.txt')
    expect(json).toBeNull()
  })

  it('carries annotations forward when the file bytes change at the same path', async () => {
    await writeFile(join(root, 'a.txt'), 'AAA')
    const oldHash = await writeSidecarByContent(home, PID, root, 'a.txt', sidecarWithNote('keep me'))
    await writeFile(join(root, 'a.txt'), 'AAAA-changed') // different bytes → new hash
    const { hash: newHash, json } = await readSidecarByContent(home, PID, root, 'a.txt')
    expect(newHash).not.toBe(oldHash)
    expect(json).not.toBeNull()
    expect(parseSidecar(json as string).annotations[0].note).toBe('keep me')
    await stat(sidecarPath(home, PID, newHash)) // new sidecar written
    await stat(sidecarPath(home, PID, oldHash)) // old sidecar file kept on disk (decision #6)
    const idx = await loadIndex(home, PID)
    expect(findHashByPath(idx, 'a.txt')).toBe(newHash) // index repointed
    expect(idx[oldHash]).toBeUndefined() // old index entry dropped (file kept on disk)
  })
})
