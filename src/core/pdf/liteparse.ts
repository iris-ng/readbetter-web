// Normalized, app-owned PDF parse contract (decoupled from LiteParse's raw shape).
export interface PdfPageMeta {
  index: number // 0-based
  width: number // page-dimension units (top-left origin space)
  height: number
}
export interface PdfRun {
  pageIndex: number
  text: string
  x: number
  y: number
  w: number
  h: number
  ocr: boolean
}
export interface PdfParseResult {
  pages: PdfPageMeta[]
  runs: PdfRun[]
  scanned: boolean
}

// Minimal structural shape of @llamaindex/liteparse's ParseResult (spec §14).
interface RawItem {
  text: string
  x: number
  y: number
  width: number
  height: number
  confidence?: number
}
interface RawPage {
  pageNum: number
  width: number
  height: number
  text: string
  textItems: RawItem[]
}
export interface RawParseResult {
  pages: RawPage[]
  text: string
}

const isOcrItem = (it: RawItem): boolean => typeof it.confidence === 'number' && it.confidence < 1

export function normalizeLiteParse(raw: RawParseResult): PdfParseResult {
  const pages: PdfPageMeta[] = raw.pages.map((p) => ({
    index: p.pageNum - 1,
    width: p.width,
    height: p.height
  }))
  const runs: PdfRun[] = []
  for (const p of raw.pages) {
    for (const it of p.textItems) {
      if (it.text === '') continue
      runs.push({
        pageIndex: p.pageNum - 1,
        text: it.text,
        x: it.x,
        y: it.y,
        w: it.width,
        h: it.height,
        ocr: isOcrItem(it)
      })
    }
  }
  // A page with no native (digital) text is treated as a scan needing OCR. Native text items
  // carry confidence === 1 (or undefined); OCR-sourced items carry confidence < 1. A page with
  // no items at all, or whose only items are OCR-sourced, has no native text.
  const hasNativeText = (p: RawPage): boolean =>
    p.textItems.some((it) => it.text !== '' && !isOcrItem(it))
  const scanned = raw.pages.some((p) => !hasNativeText(p))
  return { pages, runs, scanned }
}

type LiteParseCtor = new (cfg?: Record<string, unknown>) => {
  parse(input: Buffer | Uint8Array): Promise<RawParseResult>
}

/**
 * Parse PDF bytes via LiteParse, two-pass. The class is injected so unit tests pass a fake;
 * production lazily imports the real (ESM, native) module. Runs server-side only.
 *
 * 1. Fast native pass (`ocrEnabled: false`). 2. If the result is digital (`!scanned`), return it —
 * digital PDFs pay no OCR cost. 3. If scanned, re-parse the same bytes with `ocrEnabled: true`
 * (the slow path, ~5s) and return that. OCR is automatic, so there is no caller-facing toggle.
 */
export async function parsePdfBytes(
  bytes: Buffer | Uint8Array,
  LiteParseClass?: LiteParseCtor
): Promise<PdfParseResult> {
  const LP = LiteParseClass ?? ((await import('@llamaindex/liteparse')).LiteParse as LiteParseCtor)
  const nativeRaw = await new LP({ ocrEnabled: false, quiet: true }).parse(bytes)
  const native = normalizeLiteParse(nativeRaw)
  if (!native.scanned) return native
  const ocrRaw = await new LP({ ocrEnabled: true, quiet: true }).parse(bytes)
  return normalizeLiteParse(ocrRaw)
}

/** A single page raster from LiteParse's PDFium-backed screenshot(). */
export interface PdfPageImage {
  pageIndex: number // 0-based
  width: number
  height: number
  png: Buffer
}

// Minimal structural shape of LiteParse's ScreenshotResult.
interface RawScreenshot {
  pageNum: number // 1-based
  width: number
  height: number
  imageBuffer: Buffer | Uint8Array
}
type LiteParseScreenshotCtor = new (cfg?: Record<string, unknown>) => {
  screenshot(input: Buffer | Uint8Array, pages: number[]): Promise<RawScreenshot[]>
}

/**
 * Rasterize ONE page of a PDF to PNG via LiteParse/PDFium. Server-side only (the class is the
 * same native module that parses the file). The class is injected so unit tests pass a fake;
 * production lazily imports the real (ESM, native) module. `pageIndex` is 0-based — converted to
 * LiteParse's 1-based page number at the call, and back on the way out.
 */
export async function screenshotPdfPageBytes(
  bytes: Buffer | Uint8Array,
  pageIndex: number,
  dpi: number,
  LiteParseClass?: LiteParseScreenshotCtor
): Promise<PdfPageImage> {
  const LP =
    LiteParseClass ??
    ((await import('@llamaindex/liteparse')).LiteParse as unknown as LiteParseScreenshotCtor)
  const results = await new LP({ dpi, quiet: true }).screenshot(bytes, [pageIndex + 1])
  const shot = results[0]
  if (!shot) throw new Error(`screenshot returned no image for page ${pageIndex + 1}`)
  return {
    pageIndex: shot.pageNum - 1,
    width: shot.width,
    height: shot.height,
    png: Buffer.isBuffer(shot.imageBuffer) ? shot.imageBuffer : Buffer.from(shot.imageBuffer)
  }
}
