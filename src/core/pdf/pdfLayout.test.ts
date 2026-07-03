import { describe, it, expect } from 'vitest'
import { layoutPdf, buildPdfRunIndex } from './pdfLayout'
import { buildPdfModel } from '../import/pdf'
import type { PdfParseResult } from './liteparse'

const PARSE: PdfParseResult = {
  pages: [
    { index: 0, width: 430, height: 680 },
    { index: 1, width: 430, height: 680 }
  ],
  runs: [
    { pageIndex: 0, text: 'Hello', x: 1, y: 2, w: 3, h: 4, ocr: false },
    { pageIndex: 0, text: 'world', x: 5, y: 6, w: 7, h: 8, ocr: false },
    { pageIndex: 1, text: 'next', x: 9, y: 10, w: 11, h: 12, ocr: true }
  ],
  scanned: false
}

describe('layoutPdf', () => {
  it('assigns each run a char-offset slice that equals its text', () => {
    const { text, runIndex } = layoutPdf(PARSE)
    // 'Page 1\n' is 7 chars; 'Hello' at 7..12, ' ' at 12, 'world' at 13..18.
    expect(text.startsWith('Page 1\nHello world')).toBe(true)
    expect(runIndex[0]).toEqual({ pageIndex: 0, text: 'Hello', x: 1, y: 2, w: 3, h: 4, ocr: false, charStart: 7, charEnd: 12 })
    expect(text.slice(runIndex[1].charStart, runIndex[1].charEnd)).toBe('world')
    expect(text.slice(runIndex[2].charStart, runIndex[2].charEnd)).toBe('next')
  })

  it('matches the same text the model builder produces (no drift)', () => {
    const { text, sections } = layoutPdf(PARSE)
    expect(sections).toHaveLength(2)
    expect(sections[0].heading).toBe('Page 1')
    expect(text.slice(sections[1].charStart, sections[1].charEnd)).toContain('next')
  })

  it('buildPdfRunIndex returns just the run index', () => {
    expect(buildPdfRunIndex(PARSE)).toEqual(layoutPdf(PARSE).runIndex)
  })

  it('buildPdfModel and layoutPdf produce identical text and sections', () => {
    const layout = layoutPdf(PARSE)
    const doc = buildPdfModel(PARSE, 'test')
    expect(layout.text).toBe(doc.text)
    expect(layout.sections).toEqual(doc.sections)
  })
})
