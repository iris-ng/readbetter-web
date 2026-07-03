import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadIndex, updateIndexEntry, findHashByPath } from './index-store'

let home: string
const PID = 'p'
const H1 = '1'.repeat(64)
const H2 = '2'.repeat(64)

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'rb-idx-'))
})

describe('index-store', () => {
  it('upserts and reloads entries', async () => {
    await updateIndexEntry(home, PID, H1, { relPath: 'a.md', name: 'a.md' })
    expect((await loadIndex(home, PID))[H1]).toEqual({ relPath: 'a.md', name: 'a.md' })
  })

  it('findHashByPath returns the hash pointing at a path', async () => {
    await updateIndexEntry(home, PID, H1, { relPath: 'a.md', name: 'a.md' })
    await updateIndexEntry(home, PID, H2, { relPath: 'b.md', name: 'b.md' })
    const idx = await loadIndex(home, PID)
    expect(findHashByPath(idx, 'a.md')).toBe(H1)
    expect(findHashByPath(idx, 'missing.md')).toBeUndefined()
  })
})
