import { describe, it, expect } from 'vitest'
import { renderHook, act, fireEvent } from '@testing-library/react'
import { importMarkdown } from '../../core/import/markdown'
import { createAnchor } from '../../core/anchor/anchor'
import { PinAnchor } from '../../core/sidecar/sidecar'
import { usePins } from './usePins'

const doc = importMarkdown('# One\nAlpha body.\n\n## Two\nBeta body.\n\n## Three\nGamma body.\n\n## Four\nDelta body.', 'd.md')

/** Build an annotation-like object from a substring of doc.text. */
function annAt(id: string, needle: string): { id: string; anchor: ReturnType<typeof createAnchor>; range: { start: number; end: number } } {
  const start = doc.text.indexOf(needle)
  if (start < 0) throw new Error(`needle not found: ${needle}`)
  const end = start + needle.length
  return { id, anchor: createAnchor(doc.text, start, end), range: { start, end } }
}

/** Build a PinAnchor from a substring of doc.text (sectionId derived by containment). */
function pinAnchorAt(needle: string): PinAnchor {
  const start = doc.text.indexOf(needle)
  if (start < 0) throw new Error(`needle not found: ${needle}`)
  const end = start + needle.length
  const sec = doc.sections.find((s) => start >= s.charStart && start < s.charEnd) ?? doc.sections[0]
  return { anchor: createAnchor(doc.text, start, end), sectionId: sec.id }
}

describe('usePins (passage pins)', () => {
  it('toggleByAnnotation adds then removes; count and isPinnedAnnotation reflect it', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    const a = annAt('a1', 'Alpha body.')
    act(() => result.current.toggleByAnnotation(a))
    expect(result.current.count).toBe(1)
    expect(result.current.isPinnedAnnotation('a1')).toBe(true)
    expect(result.current.pins[0].sourceAnnotationId).toBe('a1')
    act(() => result.current.toggleByAnnotation(a))
    expect(result.current.count).toBe(0)
    expect(result.current.isPinnedAnnotation('a1')).toBe(false)
  })

  it('keeps pins in document order regardless of add order', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('g', 'Gamma body.')))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    const starts = result.current.pins.map((p) => p.resolvedRange.start)
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
    expect(result.current.pins[0].sourceAnnotationId).toBe('a')
    expect(result.current.pins[1].sourceAnnotationId).toBe('g')
  })

  it('compareActive flips at 2, atCap at 3, and a 4th add is a no-op', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    expect(result.current.compareActive).toBe(false)
    act(() => result.current.toggleByAnnotation(annAt('b', 'Beta body.')))
    expect(result.current.compareActive).toBe(true)
    expect(result.current.atCap).toBe(false)
    act(() => result.current.toggleByAnnotation(annAt('c', 'Gamma body.')))
    expect(result.current.atCap).toBe(true)
    act(() => result.current.toggleByAnnotation(annAt('d', 'Delta body.')))
    expect(result.current.count).toBe(3)
    expect(result.current.isPinnedAnnotation('d')).toBe(false)
  })

  it('release by pin id removes that pin only', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    act(() => result.current.toggleByAnnotation(annAt('b', 'Beta body.')))
    const targetId = result.current.pins[0].id
    act(() => result.current.release(targetId))
    expect(result.current.count).toBe(1)
    expect(result.current.pins.some((p) => p.id === targetId)).toBe(false)
  })

  it('release on an unknown pin id is a no-op', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    act(() => result.current.release('no-such-pin'))
    expect(result.current.count).toBe(1)
  })

  it('releaseAll clears every pin', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    act(() => result.current.toggleByAnnotation(annAt('b', 'Beta body.')))
    act(() => result.current.releaseAll())
    expect(result.current.count).toBe(0)
  })

  it('Escape releases all pins', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    act(() => result.current.toggleByAnnotation(annAt('b', 'Beta body.')))
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(result.current.count).toBe(0)
  })

  it('Escape is ignored while a text input is focused', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    act(() => { fireEvent.keyDown(input, { key: 'Escape' }) })
    expect(result.current.count).toBe(1)
    input.remove()
  })

  it('setPins resolves anchors, drops orphans, and returns {requested, resolved}', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    const orphan: PinAnchor = { anchor: createAnchor('not in this doc at all', 0, 22), sectionId: doc.sections[0].id }
    let ret: { requested: number; resolved: number } = { requested: 0, resolved: 0 }
    act(() => { ret = result.current.setPins([pinAnchorAt('Alpha body.'), orphan, pinAnchorAt('Beta body.')]) })
    expect(ret).toEqual({ requested: 3, resolved: 2 })
    expect(result.current.count).toBe(2)
    // Restored pins carry no source annotation.
    expect(result.current.pins.every((p) => p.sourceAnnotationId === undefined)).toBe(true)
  })

  it('setPins clamps to the cap of 3 (in document order)', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    let ret: { requested: number; resolved: number } = { requested: 0, resolved: 0 }
    act(() => {
      ret = result.current.setPins([
        pinAnchorAt('Delta body.'),
        pinAnchorAt('Alpha body.'),
        pinAnchorAt('Gamma body.'),
        pinAnchorAt('Beta body.')
      ])
    })
    expect(ret).toEqual({ requested: 4, resolved: 4 })
    expect(result.current.count).toBe(3)
    const starts = result.current.pins.map((p) => p.resolvedRange.start)
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
    // The clamp drops the last in document order (Delta), keeping Alpha/Beta/Gamma.
    expect(doc.text.slice(result.current.pins[0].resolvedRange.start, result.current.pins[0].resolvedRange.end)).toBe('Alpha body.')
  })

  it('toPinAnchors round-trips anchor + sectionId in document order', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    act(() => result.current.toggleByAnnotation(annAt('g', 'Gamma body.')))
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    const snapshot = result.current.toPinAnchors()
    expect(snapshot.map((p) => p.anchor.exact)).toEqual(['Alpha body.', 'Gamma body.'])
    // Round-trip: restoring the snapshot reproduces the same ranges.
    act(() => { result.current.releaseAll(); result.current.setPins(snapshot) })
    expect(result.current.pins.map((p) => p.anchor.exact)).toEqual(['Alpha body.', 'Gamma body.'])
  })

  it('resets pins when the document (sections) changes', () => {
    const { result, rerender } = renderHook(({ text, sections }) => usePins(text, sections), {
      initialProps: { text: doc.text, sections: doc.sections }
    })
    act(() => result.current.toggleByAnnotation(annAt('a', 'Alpha body.')))
    const other = importMarkdown('# Solo\nx.', 'd.md')
    rerender({ text: other.text, sections: other.sections })
    expect(result.current.count).toBe(0)
  })

  it('derives pinnedRanges correctly ({start, end, sectionId, id})', () => {
    const { result } = renderHook(() => usePins(doc.text, doc.sections))
    const a = annAt('a', 'Alpha body.')
    act(() => result.current.toggleByAnnotation(a))
    // pinnedRanges carries the ephemeral pin id so a rendered passage releases by exact identity.
    expect(result.current.pinnedRanges).toEqual([
      { start: a.range.start, end: a.range.end, sectionId: result.current.pins[0].sectionId, id: result.current.pins[0].id }
    ])
    expect(result.current.pinnedRanges[0].sectionId).not.toBe('')
  })

  it('isPinnedAnnotation is a stable reference across renders when pins are unchanged', () => {
    const { result, rerender } = renderHook(() => usePins(doc.text, doc.sections))
    const first = result.current.isPinnedAnnotation
    rerender()
    expect(result.current.isPinnedAnnotation).toBe(first)
  })
})
