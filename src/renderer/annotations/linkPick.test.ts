import { describe, it, expect, vi, afterEach } from 'vitest'
import { linkPickFromPoint } from './linkPick'
import * as wordAnchorMod from './wordAnchor'
import { createAnchor } from '../../core/anchor/anchor'

describe('linkPickFromPoint', () => {
  const docText = 'The quick brown fox jumps over the lazy dog'
  afterEach(() => vi.restoreAllMocks())

  it('wraps the resolved word anchor', () => {
    const wordAnchor = createAnchor(docText, 4, 9)
    vi.spyOn(wordAnchorMod, 'wordAnchorFromPoint').mockReturnValue(wordAnchor)
    const result = linkPickFromPoint(100, 100, docText)
    expect(result).not.toBeNull()
    expect(result?.kind).toBe('text')
    expect(result?.anchor.start).toBe(4)
    expect(result?.anchor.end).toBe(9)
    expect(result?.anchor.exact).toBe('quick')
    expect(wordAnchorMod.wordAnchorFromPoint).toHaveBeenCalledWith(100, 100, docText)
  })

  it('returns null when the point resolves to no text', () => {
    vi.spyOn(wordAnchorMod, 'wordAnchorFromPoint').mockReturnValue(null)
    expect(linkPickFromPoint(100, 100, docText)).toBeNull()
  })
})

describe('linkPickFromPoint annotation preference', () => {
  const docText = 'quick brown fox jumps over lazy dog'

  afterEach(() => vi.restoreAllMocks())

  it('returns the full annotation anchor when the clicked word is inside a highlight', () => {
    const wordAnchor = createAnchor(docText, 10, 15)
    const annotationAnchor = createAnchor(docText, 10, 25)
    vi.spyOn(wordAnchorMod, 'wordAnchorFromPoint').mockReturnValue(wordAnchor)

    const result = linkPickFromPoint(100, 100, docText, [
      {
        id: 'a1',
        anchor: annotationAnchor,
        range: { start: 10, end: 25 }
      }
    ])

    expect(result).toEqual({ kind: 'annotation', anchor: annotationAnchor, annotationId: 'a1' })
  })

  it('returns a word pick when the clicked word is outside highlights', () => {
    const wordAnchor = createAnchor(docText, 4, 9)
    const annotationAnchor = createAnchor(docText, 10, 25)
    vi.spyOn(wordAnchorMod, 'wordAnchorFromPoint').mockReturnValue(wordAnchor)

    const result = linkPickFromPoint(100, 100, docText, [
      {
        id: 'a1',
        anchor: annotationAnchor,
        range: { start: 10, end: 25 }
      }
    ])

    expect(result).toEqual({ kind: 'text', anchor: wordAnchor })
  })
})
