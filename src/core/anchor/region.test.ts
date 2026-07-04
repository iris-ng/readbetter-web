import { describe, expect, it } from 'vitest'
import {
  anchorToTextRegion,
  clientPointsToDomRectRegion,
  clientPointsToPageRectRegion,
  denormalizePageRect,
  normalizePageRect,
  isDocumentRegion
} from './region'

describe('DocumentRegion text ranges', () => {
  it('builds a text-range region from an existing anchor', () => {
    expect(
      anchorToTextRegion({ start: 2, end: 8, exact: 'target', prefix: 'a ', suffix: ' b' })
    ).toEqual({
      kind: 'text-range',
      range: { start: 2, end: 8 }
    })
  })
})

describe('DocumentRegion page rectangles', () => {
  it('normalizes DOM capture rectangles against scrollable reader content', () => {
    expect(
      clientPointsToDomRectRegion(
        { x: 140, y: 260 },
        { x: 340, y: 460 },
        { left: 100, top: 200, width: 500, height: 400 },
        { scrollLeft: 25, scrollTop: 80, scrollWidth: 1000, scrollHeight: 1200 }
      )
    ).toEqual({
      kind: 'page-rect',
      pageIndex: 0,
      rect: { x: 0.065, y: 0.11666666666666667, w: 0.2, h: 0.16666666666666666 },
      units: 'page-normalized',
      origin: 'top-left'
    })
  })

  it('normalizes PDF page-unit rectangles into zoom-independent top-left ratios', () => {
    expect(normalizePageRect({ x: 120, y: 80, w: 240, h: 160 }, { width: 600, height: 800 })).toEqual({
      x: 0.2,
      y: 0.1,
      w: 0.4,
      h: 0.2
    })
  })

  it('denormalizes normalized page rectangles back into page units', () => {
    expect(denormalizePageRect({ x: 0.2, y: 0.1, w: 0.4, h: 0.2 }, { width: 600, height: 800 })).toEqual({
      x: 120,
      y: 80,
      w: 240,
      h: 160
    })
  })

  it('normalizes drag direction and clamps to page bounds', () => {
    expect(normalizePageRect({ x: 700, y: 900, w: -250, h: -200 }, { width: 600, height: 800 })).toEqual({
      x: 0.75,
      y: 0.875,
      w: 0.25,
      h: 0.125
    })
  })

  it('converts client drag points into zoom-independent page rectangles', () => {
    expect(
      clientPointsToPageRectRegion(
        { x: 250, y: 220 },
        { x: 610, y: 700 },
        { left: 10, top: 60, width: 1200, height: 1600 },
        { index: 1, width: 600, height: 800 }
      )
    ).toEqual({
      kind: 'page-rect',
      pageIndex: 1,
      rect: { x: 0.2, y: 0.1, w: 0.3, h: 0.3 },
      units: 'page-normalized',
      origin: 'top-left'
    })
  })

  it('clamps reversed client drags to page bounds', () => {
    expect(
      clientPointsToPageRectRegion(
        { x: 900, y: 1000 },
        { x: -100, y: -100 },
        { left: 100, top: 200, width: 600, height: 800 },
        { index: 0, width: 600, height: 800 }
      ).rect
    ).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('validates known region shapes and rejects malformed stale data', () => {
    expect(
      isDocumentRegion({
        kind: 'page-rect',
        pageIndex: 0,
        rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
        units: 'page-normalized',
        origin: 'top-left'
      })
    ).toBe(true)
    expect(isDocumentRegion({ kind: 'page-rect', pageIndex: 0, rect: { x: 2, y: 0, w: 1, h: 1 } })).toBe(false)
    expect(isDocumentRegion({ kind: 'text-range', range: { start: 4, end: 2 } })).toBe(false)
    expect(isDocumentRegion({ kind: 'text-range', range: { start: -1, end: 2 } })).toBe(false)
    expect(
      isDocumentRegion({
        kind: 'page-rect',
        pageIndex: -1,
        rect: { x: 0, y: 0, w: 1, h: 1 },
        units: 'page-normalized',
        origin: 'top-left'
      })
    ).toBe(false)
    expect(
      isDocumentRegion({
        kind: 'page-rect',
        pageIndex: 1.5,
        rect: { x: 0, y: 0, w: 1, h: 1 },
        units: 'page-normalized',
        origin: 'top-left'
      })
    ).toBe(false)
  })
})
