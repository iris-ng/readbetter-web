import { isDocumentRegion, type DocumentRegion } from './region'

/** Characters of surrounding context captured on each side of an anchor's quote. */
export const CONTEXT_LEN = 48

/** A page rectangle in page-dimension units (top-left origin, unscaled). */
export interface Quad {
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
}

export interface Anchor {
  /** Position selector: offsets into DocumentModel.text. */
  start: number
  end: number
  /** Quote selector: the matched text and bounded context for re-anchoring + orphan display. */
  exact: string
  prefix: string
  suffix: string
  /** Secondary page+coords selector (PDF only); fallback when the text layers fail to resolve. */
  page?: { quads: Quad[] }
  /** Optional durable region model for text ranges and page rectangles. */
  regions?: DocumentRegion[]
}

export interface ResolvedRange {
  start: number
  end: number
}

export function isValidAnchorShape(value: unknown): value is Anchor {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  const legacyShape =
    typeof a.start === 'number' &&
    typeof a.end === 'number' &&
    typeof a.exact === 'string' &&
    typeof a.prefix === 'string' &&
    typeof a.suffix === 'string'
  if (!legacyShape) return false
  if (a.regions !== undefined) {
    return Array.isArray(a.regions) && a.regions.every(isDocumentRegion)
  }
  return true
}

export function createAnchor(text: string, start: number, end: number): Anchor {
  return {
    start,
    end,
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT_LEN), start),
    suffix: text.slice(end, Math.min(text.length, end + CONTEXT_LEN))
  }
}

function allIndexesOf(haystack: string, needle: string): number[] {
  const out: number[] = []
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    out.push(i)
    i = haystack.indexOf(needle, i + 1)
  }
  return out
}

/** Length of the longest common suffix of a and b. */
function commonSuffixLen(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

/** Length of the longest common prefix of a and b. */
function commonPrefixLen(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * Resolve an anchor against (possibly edited) text.
 * Layer 1: unique quote match. Layer 2: disambiguate multiple matches by context + stored
 * position. Layer 3: orphan (null) when the quote no longer occurs.
 */
export function resolveAnchor(anchor: Anchor, text: string): ResolvedRange | null {
  const { exact, prefix, suffix, start } = anchor
  if (exact.length === 0) return null

  const occ = allIndexesOf(text, exact)
  if (occ.length === 0) return null
  if (occ.length === 1) return { start: occ[0], end: occ[0] + exact.length }

  let best = occ[0]
  let bestScore = -Infinity
  for (const c of occ) {
    const before = text.slice(Math.max(0, c - prefix.length), c)
    const after = text.slice(c + exact.length, c + exact.length + suffix.length)
    const ctx = commonSuffixLen(prefix, before) + commonPrefixLen(suffix, after)
    // Context dominates; stored position breaks ties (closer is better).
    const score = ctx * 1_000_000 - Math.abs(c - start)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return { start: best, end: best + exact.length }
}