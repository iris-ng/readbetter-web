import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { hashForRef, loadCache } from './hash-cache'
import { hashBytes } from '../content-hash'
import { cachePath } from './paths'
import { writeFileAtomic } from '../fs-atomic'

let home: string
let root: string
const PID = 'proj-1'

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'rb-home-'))
  root = await mkdtemp(join(tmpdir(), 'rb-root-'))
})

describe('hashForRef', () => {
  it('hashes a document and caches the result', async () => {
    await writeFile(join(root, 'a.txt'), 'AAA')
    const h = await hashForRef(home, PID, root, 'a.txt')
    expect(h).toBe(hashBytes(Buffer.from('AAA')))
    const cache = await loadCache(home, PID)
    expect(cache['a.txt'].hash).toBe(h)
  })

  it('returns the cached hash without re-reading when size+mtime are unchanged', async () => {
    await writeFile(join(root, 'a.txt'), 'AAA')
    const real = await hashForRef(home, PID, root, 'a.txt')
    // Poison the cache entry's hash while keeping size+mtime; a cache hit must return the poison.
    const cache = await loadCache(home, PID)
    cache['a.txt'].hash = 'POISON'
    await writeFileAtomic(cachePath(home, PID), JSON.stringify(cache))
    expect(await hashForRef(home, PID, root, 'a.txt')).toBe('POISON')
    expect(real).not.toBe('POISON')
  })

  it('re-hashes when the file size changes', async () => {
    await writeFile(join(root, 'a.txt'), 'AAA')
    await hashForRef(home, PID, root, 'a.txt')
    const cache = await loadCache(home, PID)
    cache['a.txt'].hash = 'POISON'
    await writeFileAtomic(cachePath(home, PID), JSON.stringify(cache))
    await writeFile(join(root, 'a.txt'), 'BBBB') // different size → cache miss
    expect(await hashForRef(home, PID, root, 'a.txt')).toBe(hashBytes(Buffer.from('BBBB')))
  })
})
