import { getDocument as pdfGetDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api'
// Vite resolves this to a hashed URL for the worker bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

// pdf.js v6 loads its image decoders (JBIG2, JPEG2000, …) as WASM from `wasmUrl` (a directory,
// trailing slash required). Without it, scanned PDFs whose page images use those codecs fail to
// decode and render blank. The pdfjs-wasm plugin in vite.config.web.ts serves the files here.
const wasmUrl = `${import.meta.env.BASE_URL}wasm/`

/** getDocument with our app-wide asset config (worker + WASM decoders) always applied. */
export function getDocument(params: DocumentInitParameters): ReturnType<typeof pdfGetDocument> {
  return pdfGetDocument({ wasmUrl, ...params })
}

export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { RenderPage } from '../components/PdfPageView'

/**
 * Build a RenderPage bound to a loaded pdf.js document, for PdfPageView. Renders the page
 * bitmap to fill `cssWidth` CSS px, scaled by devicePixelRatio so it stays crisp on HiDPI
 * screens (the canvas's CSS size is controlled by PdfPageView; here we set its intrinsic size).
 *
 * Per-canvas render state: pdf.js forbids two concurrent render() calls on one canvas and
 * corrupts the bitmap (a transient 180° flip) if you do. PdfPageView can request a render
 * repeatedly for the same canvas (re-render, zoom, window re-entry), so we cancel/supersede
 * the previous request per canvas with a generation token.
 */
export function makeRenderPage(pdf: PDFDocumentProxy): RenderPage {
  const state = new WeakMap<HTMLCanvasElement, { gen: number; task?: { cancel: () => void } }>()
  return (pageIndex, canvas, cssWidth, onError) => {
    let s = state.get(canvas)
    if (!s) {
      s = { gen: 0 }
      state.set(canvas, s)
    }
    s.task?.cancel()
    s.task = undefined
    const myGen = ++s.gen
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    void pdf
      .getPage(pageIndex + 1)
      .then((page) => {
        if (s.gen !== myGen) return // superseded while getPage was pending
        const base = page.getViewport({ scale: 1 })
        const scale = (cssWidth / base.width) * dpr
        const viewport = page.getViewport({ scale })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const task = page.render({ canvas, canvasContext: ctx, viewport })
        s.task = task
        return task.promise
      })
      .catch((err) => {
        // Cancelling an in-flight render rejects with RenderingCancelledException — expected, ignore.
        if (err && err.name === 'RenderingCancelledException') return
        console.warn(`[pdf] page ${pageIndex + 1} render failed`, err)
        // Only report if this render is still the current one for the canvas (not superseded).
        if (s.gen === myGen) onError?.(pageIndex)
      })
  }
}
