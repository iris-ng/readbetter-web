import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  assertPreviewRef,
  readCanvasPreviewCentral,
  writeCanvasPreviewCentral
} from './canvas-asset-store'

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'rb-canvas-assets-'))
  try {
    return await fn(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

describe('canvas asset store', () => {
  it('stores PNG previews by stable hashed ref and reads them back', async () => {
    await withHome(async (home) => {
      const { ref } = await writeCanvasPreviewCentral(home, 'p1', pngBytes)
      expect(ref).toMatch(/^previews\/[0-9a-f]{64}\.png$/)

      const read = await readCanvasPreviewCentral(home, 'p1', ref)
      expect(read).not.toBeNull()
      expect(Array.from(read ?? [])).toEqual(Array.from(pngBytes))
    })
  })

  it('rejects invalid refs and non-PNG bytes', async () => {
    await withHome(async (home) => {
      expect(() => assertPreviewRef('../x.png')).toThrow(/invalid preview ref/)
      await expect(readCanvasPreviewCentral(home, 'p1', '../x.png')).rejects.toThrow(/invalid preview ref/)
      await expect(writeCanvasPreviewCentral(home, 'p1', new Uint8Array([1, 2, 3]))).rejects.toThrow(/preview must be png/)
    })
  })

  it('returns null for missing valid preview refs', async () => {
    await withHome(async (home) => {
      const ref = `previews/${'0'.repeat(64)}.png`
      await expect(readCanvasPreviewCentral(home, 'p1', ref)).resolves.toBeNull()
    })
  })
})
