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
