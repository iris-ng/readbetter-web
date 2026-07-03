import { resolveAnchor, type Anchor, type Quad } from '../anchor/anchor'
import type { RunOffset } from './pdfLayout'

/**
 * Every run whose offset span overlaps [start, end), as a whole-run quad.
 * Emits whole-run rectangles (word-level granularity); sub-run horizontal clipping is a deferred follow-up.
 */
export function quadsForRange(runIndex: RunOffset[], start: number, end: number): Quad[] {
  const quads: Quad[] = []
  for (const r of runIndex) {
    if (r.charEnd > start && r.charStart < end) {
      quads.push({ pageIndex: r.pageIndex, x: r.x, y: r.y, w: r.w, h: r.h })
    }
  }
  return quads
}

/** The secondary page+coords selector for a range, or undefined when it covers no run. */
export function computePageSelector(
  runIndex: RunOffset[],
  start: number,
  end: number
): { quads: Quad[] } | undefined {
  const quads = quadsForRange(runIndex, start, end)
  return quads.length > 0 ? { quads } : undefined
}

export interface PdfResolution {
  /**
   * When `viaFallback` is true, `range` holds the ORIGINAL creation-time offsets
   * (`anchor.start`/`anchor.end`) and is ADVISORY — it may be stale relative to the current
   * text, so callers doing offset comparisons (e.g. click hit-testing) should treat it as
   * approximate on the fallback path.
   */
  range: { start: number; end: number }
  quads: Quad[]
  viaFallback: boolean
}

/**
 * Three-layer resolution for a PDF annotation: text-hash primary (quads derived fresh from the
 * current run index) → persisted page+coords secondary → null (orphan). Defensive against a
 * malformed persisted `page`.
 */
export function resolvePdfAnnotation(
  anchor: Anchor,
  text: string,
  runIndex: RunOffset[]
): PdfResolution | null {
  const range = resolveAnchor(anchor, text)
  if (range) {
    return {
      range: { start: range.start, end: range.end },
      quads: quadsForRange(runIndex, range.start, range.end),
      viaFallback: false
    }
  }
  if (anchor.page && Array.isArray(anchor.page.quads) && anchor.page.quads.length > 0) {
    return {
      range: { start: anchor.start, end: anchor.end },
      quads: anchor.page.quads,
      viaFallback: true
    }
  }
  return null
}
