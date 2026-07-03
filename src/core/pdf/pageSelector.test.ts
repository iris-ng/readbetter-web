import { describe, it, expect } from 'vitest'
import { quadsForRange, computePageSelector, resolvePdfAnnotation } from './pageSelector'
import type { RunOffset } from './pdfLayout'
import type { Anchor } from '../anchor/anchor'

const RUNS: RunOffset[] = [
  { pageIndex: 0, text: 'Hello', x: 10, y: 20, w: 30, h: 8, ocr: false, charStart: 7, charEnd: 12 },
  { pageIndex: 0, text: 'world', x: 50, y: 20, w: 30, h: 8, ocr: false, charStart: 13, charEnd: 18 },
  { pageIndex: 1, text: 'next', x: 5, y: 5, w: 20, h: 8, ocr: false, charStart: 25, charEnd: 29 }
]

describe('quadsForRange', () => {
  it('returns one quad per run that overlaps [start,end)', () => {
    expect(quadsForRange(RUNS, 7, 12)).toEqual([{ pageIndex: 0, x: 10, y: 20, w: 30, h: 8 }])
    expect(quadsForRange(RUNS, 9, 15)).toHaveLength(2) // Hello + world
  })
  it('spans pages, carrying each quad’s pageIndex', () => {
    const q = quadsForRange(RUNS, 9, 27) // Hello (p0) + world (p0) + next (p1)
    expect(q.map((x) => x.pageIndex)).toEqual([0, 0, 1])
  })
  it('returns nothing for a non-overlapping range', () => {
    expect(quadsForRange(RUNS, 100, 200)).toEqual([])
  })
})

describe('computePageSelector', () => {
  it('wraps quads, or returns undefined when empty', () => {
    expect(computePageSelector(RUNS, 7, 12)).toEqual({ quads: [{ pageIndex: 0, x: 10, y: 20, w: 30, h: 8 }] })
    expect(computePageSelector(RUNS, 100, 200)).toBeUndefined()
  })
})

describe('resolvePdfAnnotation', () => {
  const text = 'Page 1\nHello world' // Hello at 7..12
  it('text resolves → quads derived from the range, viaFallback false', () => {
    const anchor: Anchor = { start: 7, end: 12, exact: 'Hello', prefix: '', suffix: '' }
    const r = resolvePdfAnnotation(anchor, text, RUNS)!
    expect(r.viaFallback).toBe(false)
    expect(r.quads).toEqual([{ pageIndex: 0, x: 10, y: 20, w: 30, h: 8 }])
  })
  it('text fails but page fallback present → fallback quads, viaFallback true', () => {
    const anchor: Anchor = { start: 7, end: 12, exact: 'ZZZ', prefix: '', suffix: '', page: { quads: [{ pageIndex: 1, x: 5, y: 5, w: 20, h: 8 }] } }
    const r = resolvePdfAnnotation(anchor, text, RUNS)!
    expect(r.viaFallback).toBe(true)
    expect(r.quads).toEqual([{ pageIndex: 1, x: 5, y: 5, w: 20, h: 8 }])
  })
  it('text fails and no page fallback → null (orphan)', () => {
    const anchor: Anchor = { start: 7, end: 12, exact: 'ZZZ', prefix: '', suffix: '' }
    expect(resolvePdfAnnotation(anchor, text, RUNS)).toBeNull()
  })
})
