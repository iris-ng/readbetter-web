import { describe, it, expect, vi } from 'vitest'
import { normalizeLiteParse, parsePdfBytes, screenshotPdfPageBytes } from './liteparse'

// Shape mirrors @llamaindex/liteparse ParseResult (spec §14).
const RAW = {
  text: 'all text',
  pages: [
    {
      pageNum: 1,
      width: 430.8,
      height: 680.3,
      text: 'Page one text',
      textItems: [
        { text: 'Hello', x: 24, y: 43.6, width: 30, height: 8.2, confidence: 1 },
        { text: 'world', x: 60, y: 43.6, width: 28, height: 8.2, confidence: 1 }
      ]
    },
    { pageNum: 2, width: 430.8, height: 680.3, text: '', textItems: [] } // image-only page
  ]
}

describe('normalizeLiteParse', () => {
  it('maps pages (0-based) and runs to the PdfParseResult contract', () => {
    const r = normalizeLiteParse(RAW)
    expect(r.pages).toEqual([
      { index: 0, width: 430.8, height: 680.3 },
      { index: 1, width: 430.8, height: 680.3 }
    ])
    expect(r.runs[0]).toEqual({ pageIndex: 0, text: 'Hello', x: 24, y: 43.6, w: 30, h: 8.2, ocr: false })
    expect(r.runs).toHaveLength(2) // page 2 contributed none
  })

  it('flags ocr runs by confidence < 1 and marks the doc scanned when a page has no native text', () => {
    const raw = structuredClone(RAW)
    raw.pages[1].textItems = [{ text: 'scanned', x: 10, y: 10, width: 50, height: 12, confidence: 0.7 }]
    const r = normalizeLiteParse(raw)
    expect(r.runs.find((x) => x.pageIndex === 1)!.ocr).toBe(true)
    expect(r.scanned).toBe(true) // page 2 has only OCR-sourced items — no native text
  })

  it('is not scanned when every page has native text', () => {
    const raw = structuredClone(RAW)
    raw.pages[1].textItems = [{ text: 'x', x: 1, y: 1, width: 5, height: 5, confidence: 1 }]
    expect(normalizeLiteParse(raw).scanned).toBe(false)
  })
})

// A fully-digital raw result: every page has native text (confidence 1). Not scanned.
const RAW_DIGITAL = {
  text: 'all text',
  pages: [
    {
      pageNum: 1,
      width: 430.8,
      height: 680.3,
      text: 'Page one text',
      textItems: [
        { text: 'Hello', x: 24, y: 43.6, width: 30, height: 8.2, confidence: 1 },
        { text: 'world', x: 60, y: 43.6, width: 28, height: 8.2, confidence: 1 }
      ]
    }
  ]
}

// The OCR (second) pass over the same scanned bytes: items carry confidence < 1.
const RAW_OCR = {
  text: 'scanned text',
  pages: [
    {
      pageNum: 1,
      width: 430.8,
      height: 680.3,
      text: 'scanned text',
      textItems: [{ text: 'scanned', x: 10, y: 10, width: 50, height: 12, confidence: 0.92 }]
    }
  ]
}

describe('parsePdfBytes', () => {
  it('digital PDF: single fast pass (ocrEnabled:false) only — no OCR pass', async () => {
    const fakeParse = vi.fn().mockResolvedValue(RAW_DIGITAL)
    const FakeLP = vi.fn().mockImplementation(() => ({ parse: fakeParse }))
    const result = await parsePdfBytes(new Uint8Array([1, 2]), FakeLP as never)
    // Constructed exactly once, with OCR off.
    expect(FakeLP).toHaveBeenCalledTimes(1)
    expect(FakeLP).toHaveBeenCalledWith({ ocrEnabled: false, quiet: true })
    expect(fakeParse).toHaveBeenCalledTimes(1)
    expect(fakeParse).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(result.scanned).toBe(false)
    expect(result.runs).toHaveLength(2)
    expect(result.runs.every((r) => r.ocr === false)).toBe(true)
  })

  it('scanned PDF: re-parses with OCR on and returns the OCR runs', async () => {
    // First pass (ocrEnabled:false) sees an image-only page → scanned; second pass (ocrEnabled:true)
    // returns OCR'd runs over the same bytes.
    const fakeParse = vi
      .fn()
      .mockResolvedValueOnce(RAW) // page 1 native, page 2 empty → scanned
      .mockResolvedValueOnce(RAW_OCR)
    const FakeLP = vi.fn().mockImplementation(() => ({ parse: fakeParse }))
    const result = await parsePdfBytes(new Uint8Array([1, 2]), FakeLP as never)
    // Constructed twice: off then on, both quiet.
    expect(FakeLP).toHaveBeenCalledTimes(2)
    expect(FakeLP).toHaveBeenNthCalledWith(1, { ocrEnabled: false, quiet: true })
    expect(FakeLP).toHaveBeenNthCalledWith(2, { ocrEnabled: true, quiet: true })
    expect(fakeParse).toHaveBeenCalledTimes(2)
    // The returned result is the OCR pass: scanned, with ocr-flagged runs.
    expect(result.scanned).toBe(true)
    expect(result.runs).toHaveLength(1)
    expect(result.runs[0]).toMatchObject({ text: 'scanned', ocr: true })
  })
})

describe('screenshotPdfPageBytes', () => {
  it('renders a single 0-based page via LiteParse and maps the result to PdfPageImage', async () => {
    const fakeShot = vi
      .fn()
      .mockResolvedValue([{ pageNum: 1, width: 612, height: 792, imageBuffer: Buffer.from([0x89, 0x50]) }])
    const FakeLP = vi.fn().mockImplementation(() => ({ screenshot: fakeShot }))
    const out = await screenshotPdfPageBytes(new Uint8Array([1, 2]), 0, 150, FakeLP as never)
    expect(FakeLP).toHaveBeenCalledWith({ dpi: 150, quiet: true })
    expect(fakeShot).toHaveBeenCalledWith(expect.any(Uint8Array), [1]) // 0-based 0 → 1-based [1]
    expect(out).toEqual({ pageIndex: 0, width: 612, height: 792, png: Buffer.from([0x89, 0x50]) })
  })

  it('passes the right 1-based page for a non-zero index', async () => {
    const fakeShot = vi
      .fn()
      .mockResolvedValue([{ pageNum: 5, width: 10, height: 20, imageBuffer: Buffer.from([1]) }])
    const FakeLP = vi.fn().mockImplementation(() => ({ screenshot: fakeShot }))
    const out = await screenshotPdfPageBytes(new Uint8Array([9]), 4, 220, FakeLP as never)
    expect(FakeLP).toHaveBeenCalledWith({ dpi: 220, quiet: true })
    expect(fakeShot).toHaveBeenCalledWith(expect.any(Uint8Array), [5])
    expect(out.pageIndex).toBe(4)
  })

  it('throws when LiteParse returns no image for the page', async () => {
    const FakeLP = vi.fn().mockImplementation(() => ({ screenshot: vi.fn().mockResolvedValue([]) }))
    await expect(screenshotPdfPageBytes(new Uint8Array([1]), 4, 150, FakeLP as never)).rejects.toThrow()
  })
})
