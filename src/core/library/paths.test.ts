import { describe, it, expect } from 'vitest'
import { join } from 'path'
import {
  projectDir, manifestPath, sidecarPath, canvasesDir, indexPath, cachePath, exportsDir, assertHash
} from './paths'

const HOME = '/home/u'
const PID = 'proj-1'
const HASH = 'a'.repeat(64)

describe('central paths', () => {
  it('places everything under <home>/.readbetter/projects/<id>/', () => {
    const base = join(HOME, '.readbetter', 'projects', PID)
    expect(projectDir(HOME, PID)).toBe(base)
    expect(manifestPath(HOME, PID)).toBe(join(base, 'project.json'))
    expect(sidecarPath(HOME, PID, HASH)).toBe(join(base, 'sidecars', `${HASH}.json`))
    expect(canvasesDir(HOME, PID)).toBe(join(base, 'canvases'))
    expect(indexPath(HOME, PID)).toBe(join(base, 'index.json'))
    expect(cachePath(HOME, PID)).toBe(join(base, 'cache.json'))
    expect(exportsDir(HOME, PID)).toBe(join(base, 'exports'))
  })

  it('sidecarPath rejects a non-hash (traversal guard)', () => {
    expect(() => sidecarPath(HOME, PID, '../evil')).toThrow(/hash/i)
    expect(() => sidecarPath(HOME, PID, 'ABC')).toThrow(/hash/i)
    expect(() => sidecarPath(HOME, PID, 'a'.repeat(63))).toThrow(/hash/i)
  })

  it('assertHash accepts a valid 64-char lowercase hex', () => {
    expect(() => assertHash(HASH)).not.toThrow()
  })
})
