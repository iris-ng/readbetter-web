import { describe, it, expect } from 'vitest'
import { pageOffsets, visiblePageWindow } from './pdfWindow'

const PAGES = [
  { index: 0, width: 600, height: 800 },
  { index: 1, width: 600, height: 400 },
  { index: 2, width: 600, height: 1000 },
  { index: 3, width: 600, height: 500 }
]

describe('pdfWindow', () => {
  it('pageOffsets accumulates top positions with a gap', () => {
    const offs = pageOffsets(PAGES, 10)
    expect(offs).toEqual([0, 810, 1220, 2230]) // 0; 800+10; +400+10; +1000+10
  })

  it('visiblePageWindow returns indices within the viewport plus overscan', () => {
    const offs = pageOffsets(PAGES, 10)
    // viewport showing roughly page 1; overscan 1 → pages 0..2
    const win = visiblePageWindow(offs, PAGES, 810, 400, 10, 1)
    expect(win).toEqual([0, 1, 2])
  })

  it('clamps to the document bounds', () => {
    const offs = pageOffsets(PAGES, 10)
    const win = visiblePageWindow(offs, PAGES, 0, 300, 10, 0)
    expect(win[0]).toBe(0)
    expect(win.at(-1)!).toBeLessThanOrEqual(3)
  })
})
