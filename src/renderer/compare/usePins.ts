import { useCallback, useEffect, useMemo, useState } from 'react'
import { Section } from '../../core/model/document'
import { Anchor, resolveAnchor } from '../../core/anchor/anchor'
import { PinAnchor } from '../../core/sidecar/sidecar'
import { MAX_PINS, PinnedRange, sectionIdAt } from '../../core/compare/squeeze'

export interface Pin {
  /** Ephemeral uuid; NOT persisted. */
  id: string
  /** The pinned range's anchor (own copy, independent of any source annotation). */
  anchor: Anchor
  /** Anchor resolved against the current documentText. */
  resolvedRange: { start: number; end: number }
  /** Containing section id (range.start within [charStart, charEnd)). */
  sectionId: string
  /** The annotation this pin was created from, if any. */
  sourceAnnotationId?: string
}

export interface UsePins {
  /** Sorted ascending by resolvedRange.start (document order). */
  pins: Pin[]
  count: number
  /** MAX_PINS (3). */
  max: number
  /** count >= max */
  atCap: boolean
  /** count >= 2 */
  compareActive: boolean
  /** Derived ranges for planCompare/positionFractions. */
  pinnedRanges: PinnedRange[]
  /** True iff a LIVE pin was created from this annotation. Note: pins restored from a saved view
   *  (via setPins) carry no sourceAnnotationId, so this returns false for them — a NotePopover
   *  reopened on a restored pin shows the Pin button as inactive (re-pinning just makes a new pin).
   *  Acceptable for v1; overlapping/duplicate pins are allowed anyway. Identity changes on any
   *  pin-set mutation. */
  isPinnedAnnotation(annotationId: string): boolean
  toggleByAnnotation(ann: { id: string; anchor: Anchor; range: { start: number; end: number } }): void
  release(pinId: string): void
  releaseAll(): void
  setPins(anchors: PinAnchor[]): { requested: number; resolved: number }
  toPinAnchors(): PinAnchor[]
}

// Sort by document position; tie-break by end so overlapping pins (allowed) order deterministically
// and toPinAnchors round-trips stably. Matches squeeze.ts's planCompare ordering.
function byStart(a: Pin, b: Pin): number {
  return a.resolvedRange.start - b.resolvedRange.start || a.resolvedRange.end - b.resolvedRange.end
}

// `sections` (and `documentText`) must be stable for the lifetime of a loaded document; a fresh
// `sections` reference is the signal for "new document opened" and clears all pins. Because text
// is stable per document, resolvedRange is computed once at add/restore time and stored.
export function usePins(documentText: string, sections: Section[]): UsePins {
  const [pins, setPinsState] = useState<Pin[]>([])

  // Reset when the open document changes (sections is a fresh array per document).
  useEffect(() => {
    setPinsState([])
  }, [sections])

  const isPinnedAnnotation = useCallback(
    (annotationId: string): boolean => pins.some((p) => p.sourceAnnotationId === annotationId),
    [pins]
  )

  const toggleByAnnotation = useCallback(
    (ann: { id: string; anchor: Anchor; range: { start: number; end: number } }): void => {
      setPinsState((prev) => {
        if (prev.some((p) => p.sourceAnnotationId === ann.id)) {
          return prev.filter((p) => p.sourceAnnotationId !== ann.id)
        }
        if (prev.length >= MAX_PINS) return prev
        const pin: Pin = {
          id: crypto.randomUUID(),
          anchor: ann.anchor,
          resolvedRange: { start: ann.range.start, end: ann.range.end },
          sectionId: sectionIdAt(sections, ann.range.start),
          sourceAnnotationId: ann.id
        }
        return [...prev, pin].sort(byStart)
      })
    },
    [sections]
  )

  const release = useCallback((pinId: string): void => {
    setPinsState((prev) => (prev.some((p) => p.id === pinId) ? prev.filter((p) => p.id !== pinId) : prev))
  }, [])

  const releaseAll = useCallback((): void => {
    setPinsState((prev) => (prev.length ? [] : prev))
  }, [])

  const setPins = useCallback(
    (anchors: PinAnchor[]): { requested: number; resolved: number } => {
      const candidates: Pin[] = []
      for (const pa of anchors) {
        const range = resolveAnchor(pa.anchor, documentText)
        if (!range) continue
        candidates.push({
          id: crypto.randomUUID(),
          anchor: pa.anchor,
          resolvedRange: { start: range.start, end: range.end },
          sectionId: pa.sectionId
        })
      }
      candidates.sort(byStart)
      // `resolved` counts every anchor that re-anchored, even if clamping later drops some past
      // the cap; we keep min(resolved, MAX_PINS) so the caller can still report a "found N" note.
      const resolved = candidates.length
      setPinsState(candidates.slice(0, MAX_PINS))
      return { requested: anchors.length, resolved }
    },
    [documentText]
  )

  const toPinAnchors = useCallback(
    (): PinAnchor[] => pins.map((p) => ({ anchor: p.anchor, sectionId: p.sectionId })),
    [pins]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      setPinsState((prev) => (prev.length ? [] : prev))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pinnedRanges = useMemo<PinnedRange[]>(
    () => pins.map((p) => ({ start: p.resolvedRange.start, end: p.resolvedRange.end, sectionId: p.sectionId, id: p.id })),
    [pins]
  )

  return {
    pins,
    count: pins.length,
    max: MAX_PINS,
    atCap: pins.length >= MAX_PINS,
    compareActive: pins.length >= 2,
    pinnedRanges,
    isPinnedAnnotation,
    toggleByAnnotation,
    release,
    releaseAll,
    setPins,
    toPinAnchors
  }
}
