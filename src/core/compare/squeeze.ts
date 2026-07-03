import { Section } from '../model/document'

export const MAX_PINS = 3

/** `id` is the optional ephemeral pin id (set by usePins) so a rendered passage can be released
 *  by exact identity even when two pins clamp to the same range. */
export type PinnedRange = { start: number; end: number; sectionId: string; id?: string }

export type PinSegment =
  | { kind: 'pin'; passage: { text: string; sectionId: string; range: { start: number; end: number }; id?: string } }
  | { kind: 'gap'; ranges: PinnedRange[] }

/** Id of the section containing the absolute char offset (the section whose span covers it).
 *  Falls back to the last section starting at/before the offset (trailing whitespace lands
 *  past every section's end), or the first section, or '' if there are none — so a pin/gap
 *  always carries a sectionId. Shared with `usePins` to keep the two callers in lockstep. */
export function sectionIdAt(sections: Section[], offset: number): string {
  for (const s of sections) {
    if (offset >= s.charStart && offset < s.charEnd) return s.id
  }
  // Sections are in reading order, so the last one starting at/before the offset is the best
  // fallback; if even the first starts after it, use the first.
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].charStart <= offset) return sections[i].id
  }
  return sections.length ? sections[0].id : ''
}

/**
 * Fold the document around pinned ranges. Returns ordered segments covering the whole doc:
 * pinned ranges render as `pin` segments (with their exact text), and every maximal run of
 * unpinned character span between/around them becomes one `gap` segment. Empty gaps (a pin at
 * the very document start, a pin at the end, or two adjacent pins) are omitted.
 *
 * Pure and order-independent in `pinnedRanges` (sorted internally by start, tie-broken by end).
 *
 * Overlapping/adjacent pins: after sorting, each pin's effective start is clamped to never go
 * below the running cursor (the end of the prior pin). A pin fully swallowed by a previous pin
 * collapses to a zero-length pin at the cursor; the emitted gap before it is then zero-length
 * and omitted. This guarantees no negative-length gaps and a strictly forward cursor.
 */
export function planCompare(
  documentText: string,
  sections: Section[],
  pinnedRanges: PinnedRange[]
): PinSegment[] {
  const docEnd = documentText.length

  if (pinnedRanges.length === 0) {
    if (docEnd === 0) return []
    return [{ kind: 'gap', ranges: [{ start: 0, end: docEnd, sectionId: sectionIdAt(sections, 0) }] }]
  }

  const sorted = [...pinnedRanges].sort((a, b) => a.start - b.start || a.end - b.end)

  const segs: PinSegment[] = []
  let cursor = 0

  for (const r of sorted) {
    const pinStart = Math.max(cursor, r.start)
    const pinEnd = Math.max(pinStart, r.end)

    // Gap before this pin (omit if empty).
    if (pinStart > cursor) {
      segs.push({ kind: 'gap', ranges: [{ start: cursor, end: pinStart, sectionId: sectionIdAt(sections, cursor) }] })
    }

    segs.push({
      kind: 'pin',
      passage: {
        text: documentText.slice(pinStart, pinEnd),
        sectionId: r.sectionId,
        range: { start: pinStart, end: pinEnd },
        id: r.id
      }
    })

    cursor = pinEnd
  }

  // Trailing gap after the last pin (omit if empty).
  if (cursor < docEnd) {
    segs.push({ kind: 'gap', ranges: [{ start: cursor, end: docEnd, sectionId: sectionIdAt(sections, cursor) }] })
  }

  return segs
}

/**
 * Marker positions for the anchor-tab position bar, as fractions [0,1] of the document by
 * CHARACTER offset (over documentText length). `current` follows the active section's start;
 * `pins` are the pinned ranges' start offsets as fractions, sorted ascending.
 */
export function positionFractions(
  documentText: string,
  sections: Section[],
  pinnedRanges: Array<{ start: number; end: number }>,
  activeIndex: number
): { pins: number[]; current: number } {
  const len = documentText.length
  // length-1 guard: a single-char (or empty) doc has no span to position within -> 0.
  const frac = (offset: number): number => (len <= 1 ? 0 : Math.max(0, Math.min(1, offset / len)))

  const pins = pinnedRanges.map((r) => frac(r.start)).sort((a, b) => a - b)

  let current = 0
  if (sections.length) {
    const clamped = Math.max(0, Math.min(sections.length - 1, activeIndex))
    current = frac(sections[clamped].charStart)
  }

  return { pins, current }
}

/**
 * Auto name for a saved view, from the pinned passages' text (first ~30 chars each, trimmed),
 * joined with ' ⇄ '. Falls back to the containing section heading if the passage text is empty.
 * With no pins (not a real save flow — a view requires ≥2 pins) returns 'Untitled view'.
 */
export function defaultViewName(
  documentText: string,
  sections: Section[],
  pinnedRanges: PinnedRange[]
): string {
  if (pinnedRanges.length === 0) return 'Untitled view'
  return pinnedRanges
    .map((r) => {
      const raw = documentText.slice(r.start, r.end).trim()
      const text = raw.slice(0, 30).trim()
      if (text) return text
      const s = sections.find((sec) => sec.id === r.sectionId)
      return (s?.heading ?? '').trim() || 'Introduction'
    })
    .join(' ⇄ ')
}
