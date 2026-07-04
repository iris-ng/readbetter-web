import type { Anchor } from './anchor'

export interface TextRangeRegion {
  kind: 'text-range'
  range: { start: number; end: number }
}

export interface PageRectRegion {
  kind: 'page-rect'
  /** Zero-based PDF/page index. */
  pageIndex: number
  /**
   * Normalized page rectangle, top-left origin, ratios of the unscaled page box.
   * Values are zoom-independent and expected to be within [0, 1].
   */
  rect: { x: number; y: number; w: number; h: number }
  units: 'page-normalized'
  origin: 'top-left'
}

export type DocumentRegion = TextRangeRegion | PageRectRegion

export function clientPointsToPageRectRegion(
  start: { x: number; y: number },
  end: { x: number; y: number },
  pageBounds: { left: number; top: number; width: number; height: number },
  page: { index: number; width: number; height: number }
): PageRectRegion {
  const scaleX = page.width / pageBounds.width
  const scaleY = page.height / pageBounds.height
  return {
    kind: 'page-rect',
    pageIndex: page.index,
    rect: normalizePageRect(
      {
        x: (start.x - pageBounds.left) * scaleX,
        y: (start.y - pageBounds.top) * scaleY,
        w: (end.x - start.x) * scaleX,
        h: (end.y - start.y) * scaleY
      },
      page
    ),
    units: 'page-normalized',
    origin: 'top-left'
  }
}

export function clientPointsToDomRectRegion(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: { left: number; top: number; width: number; height: number },
  scroll: { scrollLeft: number; scrollTop: number; scrollWidth: number; scrollHeight: number }
): PageRectRegion {
  const width = Math.max(1, scroll.scrollWidth, bounds.width)
  const height = Math.max(1, scroll.scrollHeight, bounds.height)
  return {
    kind: 'page-rect',
    pageIndex: 0,
    rect: normalizePageRect(
      {
        x: start.x - bounds.left + scroll.scrollLeft,
        y: start.y - bounds.top + scroll.scrollTop,
        w: end.x - start.x,
        h: end.y - start.y
      },
      { width, height }
    ),
    units: 'page-normalized',
    origin: 'top-left'
  }
}

export function anchorToTextRegion(anchor: Anchor): TextRangeRegion {
  return { kind: 'text-range', range: { start: anchor.start, end: anchor.end } }
}

export function normalizePageRect(
  rect: { x: number; y: number; w: number; h: number },
  page: { width: number; height: number }
): PageRectRegion['rect'] {
  const left = Math.min(rect.x, rect.x + rect.w)
  const right = Math.max(rect.x, rect.x + rect.w)
  const top = Math.min(rect.y, rect.y + rect.h)
  const bottom = Math.max(rect.y, rect.y + rect.h)
  const clampedLeft = clamp(left, 0, page.width)
  const clampedRight = clamp(right, 0, page.width)
  const clampedTop = clamp(top, 0, page.height)
  const clampedBottom = clamp(bottom, 0, page.height)
  return {
    x: clampedLeft / page.width,
    y: clampedTop / page.height,
    w: (clampedRight - clampedLeft) / page.width,
    h: (clampedBottom - clampedTop) / page.height
  }
}

export function denormalizePageRect(
  rect: PageRectRegion['rect'],
  page: { width: number; height: number }
): { x: number; y: number; w: number; h: number } {
  return {
    x: rect.x * page.width,
    y: rect.y * page.height,
    w: rect.w * page.width,
    h: rect.h * page.height
  }
}

export function isDocumentRegion(value: unknown): value is DocumentRegion {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.kind === 'text-range') {
    const r = v.range as Record<string, unknown> | undefined
    return (
      !!r &&
      typeof r.start === 'number' &&
      typeof r.end === 'number' &&
      Number.isInteger(r.start) &&
      Number.isInteger(r.end) &&
      r.start >= 0 &&
      r.start <= r.end
    )
  }
  if (v.kind === 'page-rect') {
    const r = v.rect as Record<string, unknown> | undefined
    return (
      typeof v.pageIndex === 'number' &&
      Number.isInteger(v.pageIndex) &&
      v.pageIndex >= 0 &&
      !!r &&
      typeof r.x === 'number' &&
      typeof r.y === 'number' &&
      typeof r.w === 'number' &&
      typeof r.h === 'number' &&
      v.units === 'page-normalized' &&
      v.origin === 'top-left' &&
      r.x >= 0 &&
      r.y >= 0 &&
      r.w >= 0 &&
      r.h >= 0 &&
      r.x + r.w <= 1 &&
      r.y + r.h <= 1
    )
  }
  return false
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
