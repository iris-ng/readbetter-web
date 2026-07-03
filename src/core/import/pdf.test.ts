import { describe, it, expect } from 'vitest'
import { buildPdfModel } from './pdf'
import type { PdfParseResult } from '../pdf/liteparse'

const PARSE: PdfParseResult = {
  pages: [
    { index: 0, width: 430, height: 680 },
    { index: 1, width: 430, height: 680 }
  ],
  runs: [
    { pageIndex: 0, text: 'Hello world', x: 24, y: 43, w: 80, h: 8, ocr: false },
    { pageIndex: 1, text: 'Second page', x: 24, y: 43, w: 80, h: 8, ocr: false }
  ],
  scanned: false
}

describe('buildPdfModel', () => {
  it('builds one section per page with char offsets into the text', () => {
    const doc = buildPdfModel(PARSE, 'paper.pdf')
    expect(doc.format).toBe('pdf')
    expect(doc.title).toBe('paper.pdf')
    expect(doc.sections).toHaveLength(2)
    expect(doc.sections[0].heading).toBe('Page 1')
    const s0 = doc.sections[0]
    expect(doc.text.slice(s0.charStart, s0.charEnd)).toContain('Hello world')
    expect(doc.text.slice(doc.sections[1].charStart, doc.sections[1].charEnd)).toContain('Second page')
  })

  it('joins a page\'s runs in order as its body text', () => {
    const doc = buildPdfModel(PARSE, 'p.pdf')
    expect(doc.sections[0].paragraphs).toEqual(['Hello world'])
  })

  it('handles a page with no runs: heading-only span, empty paragraphs', () => {
    const parse: PdfParseResult = {
      pages: [{ index: 0, width: 430, height: 680 }],
      runs: [],
      scanned: false
    }
    const doc = buildPdfModel(parse, 'empty.pdf')
    expect(doc.sections).toHaveLength(1)
    expect(doc.sections[0].paragraphs).toEqual([])
    const s = doc.sections[0]
    expect(doc.text.slice(s.charStart, s.charEnd)).toBe('Page 1')
  })
})
