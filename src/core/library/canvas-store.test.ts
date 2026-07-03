import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { listCanvasesCentral, readCanvasCentral, writeCanvasCentral } from './canvas-store'
import { emptyCanvas, serializeCanvas } from '../canvas/canvas'

let home: string
const PID = 'p'
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'rb-cv-'))
})

describe('canvas-store (central)', () => {
  it('missing dir lists empty', async () => {
    expect(await listCanvasesCentral(home, PID)).toEqual([])
  })
  it('writes, reads, and lists a canvas by bare ref', async () => {
    const md = serializeCanvas(emptyCanvas('c1', 'Free Will'))
    await writeCanvasCentral(home, PID, 'free-will.md', md)
    expect(await readCanvasCentral(home, PID, 'free-will.md')).toBe(md)
    const list = await listCanvasesCentral(home, PID)
    expect(list).toEqual([{ ref: 'free-will.md', name: 'free-will.md', title: 'Free Will' }])
  })
})
