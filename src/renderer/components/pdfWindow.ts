/** Minimal page-sizing shape this module needs; structurally matches PdfPageMeta. */
export interface PageGeom {
  index: number
  width: number
  height: number
}

/** Top offset (px) of each page in the stacked layout, given a uniform gap between pages. */
export function pageOffsets(pages: PageGeom[], gap: number): number[] {
  const offs: number[] = []
  let y = 0
  for (const p of pages) {
    offs.push(y)
    y += p.height + gap
  }
  return offs
}

/** Indices of pages intersecting [scrollTop, scrollTop+viewportH], expanded by `overscan`. */
export function visiblePageWindow(
  offsets: number[],
  pages: PageGeom[],
  scrollTop: number,
  viewportH: number,
  _gap: number,
  overscan: number
): number[] {
  const top = scrollTop
  const bottom = scrollTop + viewportH
  let first = -1
  let last = -1
  for (let i = 0; i < pages.length; i++) {
    const pTop = offsets[i]
    const pBottom = pTop + pages[i].height
    if (pBottom >= top && pTop <= bottom) {
      if (first === -1) first = i
      last = i
    }
  }
  if (first === -1) {
    // Nothing intersects (e.g. empty viewport before layout) — render the first page.
    return pages.length ? [0] : []
  }
  const lo = Math.max(0, first - overscan)
  const hi = Math.min(pages.length - 1, last + overscan)
  const out: number[] = []
  for (let i = lo; i <= hi; i++) out.push(i)
  return out
}
