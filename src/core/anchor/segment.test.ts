import { describe, it, expect } from 'vitest'
import { segmentParagraph, paragraphOffsets } from './segment'
import { importMarkdown } from '../import/markdown'

describe('paragraphOffsets', () => {
  it('locates each paragraph at its true offset in text', () => {
    const doc = importMarkdown('# H\nAlpha para.\n\nBeta para.', 'd.md')
    const section = doc.sections[0]
    const offsets = paragraphOffsets(section)
    expect(offsets).toHaveLength(2)
    expect(doc.text.slice(offsets[0], offsets[0] + section.paragraphs[0].length)).toBe(section.paragraphs[0])
    expect(doc.text.slice(offsets[1], offsets[1] + section.paragraphs[1].length)).toBe(section.paragraphs[1])
  })

  it('handles preamble (no heading)', () => {
    const doc = importMarkdown('Just preamble text.', 'd.md')
    const section = doc.sections[0]
    const offsets = paragraphOffsets(section)
    expect(offsets[0]).toBe(section.charStart)
  })
})

describe('segmentParagraph', () => {
  it('returns one plain segment when there are no ranges', () => {
    const segs = segmentParagraph('hello world', 100, [])
    expect(segs).toEqual([{ text: 'hello world', annotationIds: [], colors: [] }])
  })

  it('splits a mid-paragraph highlight into plain | mark | plain', () => {
    // paragraph "hello world" at base 100; highlight "lo wo" = abs [102,107)
    const segs = segmentParagraph('hello world', 100, [{ start: 102, end: 107, id: 'a', color: 'yellow' }])
    expect(segs).toEqual([
      { text: 'he', annotationIds: [], colors: [] },
      { text: 'llo w', annotationIds: ['a'], colors: ['yellow'] },
      { text: 'orld', annotationIds: [], colors: [] }
    ])
  })

  it('marks an overlapping region with both annotations', () => {
    // "hello world" base 100; A=[100,107) "hello w", B=[102,111) "llo world"
    const segs = segmentParagraph('hello world', 100, [
      { start: 100, end: 107, id: 'a', color: 'yellow' },
      { start: 102, end: 111, id: 'b', color: 'green' }
    ])
    // overlap [102,107) "llo w" is covered by both
    const overlap = segs.find((s) => s.text === 'llo w')
    expect(overlap?.annotationIds).toEqual(['a', 'b'])
  })

  it('clamps ranges that extend beyond the paragraph', () => {
    const segs = segmentParagraph('abc', 10, [{ start: 5, end: 100, id: 'a', color: 'y' }])
    expect(segs).toEqual([{ text: 'abc', annotationIds: ['a'], colors: ['y'] }])
  })
})
