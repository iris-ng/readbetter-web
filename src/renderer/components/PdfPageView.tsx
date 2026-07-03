import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { PdfParseResult } from '../../core/pdf/liteparse'
import type { RunOffset } from '../../core/pdf/pdfLayout'
import type { ResolvedAnnotation } from '../annotations/useAnnotations'
import { rangeFromSelection, offsetOf } from '../annotations/selection'
import type { ExcerptDropPayload } from '../canvas/excerptDrag'
import { mapRun } from './pdfTextLayer'
import { PdfHighlightLayer, HighlightBox } from './PdfHighlightLayer'
import { NotePopover } from './NotePopover'
import { pageOffsets, visiblePageWindow } from './pdfWindow'
import { quadsForRange } from '../../core/pdf/pageSelector'
import { BACKLINK_FLASH_ID, BACKLINK_FLASH_COLOR } from './backlinkFlash'
import { SearchMatch, SEARCH_MATCH_ID, SEARCH_ACTIVE_ID } from '../search/searchMatch'

const GAP = 12
const OVERSCAN = 1
/** Horizontal padding inside the scroll container (must match the container's `padding`). */
const PADDING = 16
/** Backstop on cached fallback page rasters — bounds object-URL memory (cost is naturally tiny). */
const MAX_FALLBACK_PAGES = 12

/** Renders a single page's bitmap into the given canvas at the given CSS width. */
export type RenderPage = (
  pageIndex: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  /** Called once if the page render fails for a real (non-cancellation) reason. */
  onError?: (pageIndex: number) => void
) => void

interface Props {
  parse: PdfParseResult
  /** Per-run char-offsets + geometry; the text layer + highlight source. */
  runIndex: RunOffset[]
  activeIndex: number
  /** Display scale: displayWidth / page.width (spec §14). */
  zoom: number
  /** Injected so tests can stub pdf.js canvas rendering. App passes the real pdf.js renderer. */
  renderPage: RenderPage
  /** Server-side raster fallback for a page pdf.js failed to render (JBIG2 etc.); 0-based page. */
  renderPageImage?: (page: number) => Promise<Blob>
  annotations: ResolvedAnnotation[]
  onCreateRange: (range: { start: number; end: number }) => void
  onSetNote: (id: string, note: string) => void
  onSetColor: (id: string, color: string) => void
  onDelete: (id: string) => void
  /** The document ref + text, so a highlight can be sent to a canvas as an excerpt. */
  sourceRef?: string
  docText?: string
  /** Double-click / right-click a highlight → send it to the active canvas. */
  onSendExcerpt?: (payload: ExcerptDropPayload) => void
  /** When true, clicks are intercepted for Connect tool word-pick (mirrors Reader.tsx). */
  connectMode?: boolean
  /** Called with the synthetic React mouse event when a click fires in Connect mode. */
  onConnectClick?: (e: React.MouseEvent) => void
  /** A fresh object per navigate; scrolls the target page into view + flashes its quads. */
  flashRange?: { start: number; end: number } | null
  /** In-document search hits (find-in-page); rendered as a wash under the text layer. */
  searchMatches?: SearchMatch[]
  /** The currently-active search hit, if any; rendered with an accent outline and scrolled into view. */
  activeMatch?: SearchMatch | null
  onZoomIn?: () => void
  onZoomOut?: () => void
}

function runsByPage(runs: RunOffset[]): Map<number, RunOffset[]> {
  const m = new Map<number, RunOffset[]>()
  for (const r of runs) {
    const arr = m.get(r.pageIndex) ?? []
    arr.push(r)
    m.set(r.pageIndex, arr)
  }
  return m
}

/** A page's text came from OCR when it has runs and every one of them is OCR-sourced. */
function isOcrPage(runs: RunOffset[] | undefined): boolean {
  return !!runs && runs.length > 0 && runs.every((r) => r.ocr)
}

/** Small corner badge marking a page whose text was recovered via OCR. Non-interactive. */
function OcrChip({ pageIndex }: { pageIndex: number }): JSX.Element {
  return (
    <span
      data-testid={`ocr-chip-${pageIndex}`}
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        zIndex: 2,
        padding: '1px 5px',
        fontSize: 10,
        fontFamily: 'sans-serif',
        lineHeight: 1.4,
        letterSpacing: 0.5,
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.55)',
        borderRadius: 3,
        pointerEvents: 'none',
        userSelect: 'none'
      }}
    >
      OCR
    </span>
  )
}

/**
 * A transparent, selectable overlay aligned to the rendered page bitmap. Each run is positioned
 * and sized by a single scale (`zoom`) — LiteParse coords are top-left, page-unit, no Y-flip
 * (spec §14) — so positions map 1:1 onto the displayed page.
 */
function PdfTextLayer({ runs, zoom }: { runs: RunOffset[]; zoom: number }): JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {runs.map((run, i) => {
        const box = mapRun(run, zoom)
        return (
          <span
            key={i}
            data-cs={run.charStart}
            style={{
              position: 'absolute',
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              fontSize: `${box.fontSize}px`,
              fontFamily: 'sans-serif',
              lineHeight: 1,
              color: 'transparent',
              whiteSpace: 'pre',
              transformOrigin: '0 0',
              cursor: 'text'
            }}
          >
            {run.text}
          </span>
        )
      })}
    </div>
  )
}

type FallbackState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' }

/** Fills the page box (same geometry as the <canvas>) with the server raster, or a status note. */
function PdfFallbackImage({ state, pageIndex }: { state?: FallbackState; pageIndex: number }): JSX.Element {
  const base: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' }
  const note: React.CSSProperties = {
    ...base,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
    fontSize: 13,
    textAlign: 'center',
    padding: 16
  }
  if (state?.status === 'ready') {
    return (
      <img
        data-testid={`pdf-fallback-${pageIndex}`}
        src={state.url}
        alt=""
        style={{ ...base, objectFit: 'contain' }}
      />
    )
  }
  if (state?.status === 'error') {
    return (
      <div data-testid={`pdf-fallback-error-${pageIndex}`} style={{ ...note, color: '#666' }}>
        This page couldn't be rendered.
      </div>
    )
  }
  return (
    <div data-testid={`pdf-fallback-loading-${pageIndex}`} style={{ ...note, color: '#999' }}>
      Rendering page…
    </div>
  )
}

export function PdfPageView({
  parse,
  runIndex,
  activeIndex,
  zoom,
  renderPage,
  renderPageImage,
  annotations,
  onCreateRange,
  onSetNote,
  onSetColor,
  onDelete,
  sourceRef,
  docText,
  onSendExcerpt,
  connectMode,
  onConnectClick,
  flashRange,
  searchMatches = [],
  activeMatch = null,
  onZoomIn,
  onZoomOut
}: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  // Cache keyed by the canvas element rendered at a given cssWidth; a zoom change (new cssWidth)
  // forces a re-render at the new size.
  const canvasEls = useRef<Map<number, { el: HTMLCanvasElement; cssWidth: number }>>(new Map())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(800)
  const [popover, setPopover] = useState<{ id: string; x: number; y: number } | null>(null)
  const scale = zoom
  // Offsets are computed in scaled (display) px so the window math matches what's on screen.
  const scaledPages = useMemo(
    () => parse.pages.map((p) => ({ index: p.index, width: p.width * scale, height: p.height * scale })),
    [parse, scale]
  )
  const offsets = useMemo(() => pageOffsets(scaledPages, GAP), [scaledPages])
  const byPage = useMemo(() => runsByPage(runIndex), [runIndex])
  // Highlight boxes per page, flattened from resolved annotations' quads — plus a transient
  // back-link flash for the current flashRange (auto-clears when DocumentPane nulls jumpFlash).
  const boxesByPage = useMemo(() => {
    const m = new Map<number, HighlightBox[]>()
    for (const a of annotations) {
      for (const q of a.quads ?? []) {
        const arr = m.get(q.pageIndex) ?? []
        arr.push({ id: a.id, color: a.color, quad: q })
        m.set(q.pageIndex, arr)
      }
    }
    // Prepend the flash boxes so a genuine annotation sharing the same spot keeps the later
    // (top) id (mirrors Reader's "prepend the flash"); the flash layer is pointer-events:none.
    if (flashRange) {
      for (const q of quadsForRange(runIndex, flashRange.start, flashRange.end)) {
        const arr = m.get(q.pageIndex) ?? []
        arr.unshift({ id: BACKLINK_FLASH_ID, color: BACKLINK_FLASH_COLOR, quad: q })
        m.set(q.pageIndex, arr)
      }
    }
    // Search hits render as a translucent highlighter wash over the page (multiply blend, see
    // PdfHighlightLayer); the active hit uses a deeper wash + accent outline and is what the
    // scroll-into-view effect below tracks. The wash uses the PDF-specific token (works over the
    // white page raster in both themes), NOT --search-hl (which swaps dark for the app surface).
    const activeKey = activeMatch ? `${activeMatch.start}:${activeMatch.end}` : null
    for (const match of searchMatches) {
      const active = activeKey === `${match.start}:${match.end}`
      for (const q of quadsForRange(runIndex, match.start, match.end)) {
        const arr = m.get(q.pageIndex) ?? []
        arr.push({
          id: active ? SEARCH_ACTIVE_ID : SEARCH_MATCH_ID,
          color: active ? 'var(--pdf-search-hl-active)' : 'var(--pdf-search-hl)',
          quad: q,
          active
        })
        m.set(q.pageIndex, arr)
      }
    }
    return m
  }, [annotations, flashRange, runIndex, searchMatches, activeMatch])
  const win = visiblePageWindow(offsets, scaledPages, scrollTop, viewportH, GAP, OVERSCAN)

  // Pages where pdf.js render failed (JBIG2 etc.) → render the server raster instead of a blank canvas.
  const [failedPages, setFailedPages] = useState<Set<number>>(() => new Set())
  const [fallbacks, setFallbacks] = useState<Map<number, FallbackState>>(() => new Map())
  // Pages whose raster fetch has already been kicked off — prevents duplicate fetches (ref, not state).
  const fallbackStarted = useRef<Set<number>>(new Set())
  // Mirror of `fallbacks` for unmount cleanup without re-subscribing the effect.
  const fallbacksRef = useRef(fallbacks)
  fallbacksRef.current = fallbacks

  const onPageRenderError = useCallback((pageIndex: number) => {
    setFailedPages((prev) => (prev.has(pageIndex) ? prev : new Set(prev).add(pageIndex)))
  }, [])

  // Fetch a server raster for each newly-failed page exactly once; revoke + evict beyond the cap.
  useEffect(() => {
    if (!renderPageImage) return
    for (const page of failedPages) {
      if (fallbackStarted.current.has(page)) continue
      fallbackStarted.current.add(page)
      setFallbacks((prev) => new Map(prev).set(page, { status: 'loading' }))
      renderPageImage(page)
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          setFallbacks((prev) => new Map(prev).set(page, { status: 'ready', url }))
        })
        .catch(() => setFallbacks((prev) => new Map(prev).set(page, { status: 'error' })))
    }
  }, [failedPages, renderPageImage])

  // Enforce the cache cap OUTSIDE the state updater (updaters must stay pure): revoke + drop the
  // oldest entries beyond MAX_FALLBACK_PAGES. Insertion order = Map iteration order, so the front
  // entries are the oldest.
  useEffect(() => {
    if (fallbacks.size <= MAX_FALLBACK_PAGES) return
    const victims: number[] = []
    let over = fallbacks.size - MAX_FALLBACK_PAGES
    for (const [k] of fallbacks) {
      if (over <= 0) break
      victims.push(k)
      over--
    }
    for (const k of victims) {
      const v = fallbacks.get(k)
      if (v && v.status === 'ready') URL.revokeObjectURL(v.url)
      fallbackStarted.current.delete(k)
    }
    setFallbacks((prev) => {
      const next = new Map(prev)
      for (const k of victims) next.delete(k)
      return next
    })
  }, [fallbacks])

  // Revoke any outstanding object URLs when the pane unmounts.
  useEffect(() => {
    return () => {
      for (const v of fallbacksRef.current.values()) if (v.status === 'ready') URL.revokeObjectURL(v.url)
    }
  }, [])

  // Measure the pane height before first paint, and keep it current as the pane resizes so
  // virtualized page windowing remains accurate.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = (): void => {
      setViewportH(el.clientHeight || 800)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    pageRefs.current[activeIndex]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [activeIndex])

  // A navigate always re-flashes (a fresh flashRange object) — scroll the target page into view
  // even when it is already the active page (setActiveIndex bails on an unchanged index, so the
  // [activeIndex] effect alone would not scroll). Mirrors the clean-DOM Reader scroll-on-flash.
  useEffect(() => {
    if (!flashRange) return
    pageRefs.current[activeIndex]?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashRange])

  // Stepping to a new active search match scrolls its page into view, independent of activeIndex
  // (a match on the current page still needs a within-page scroll to bring it into frame).
  useEffect(() => {
    if (!activeMatch) return
    const q = quadsForRange(runIndex, activeMatch.start, activeMatch.end)[0]
    if (q) pageRefs.current[q.pageIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch?.start, activeMatch?.end])

  // The popover is pinned to viewport coords captured at click time; any scale change (zoom or a
  // pane resize re-fitting the page) repositions the page/highlights but not the popover, leaving
  // it floating over blank space. Dismiss it.
  useEffect(() => {
    setPopover(null)
  }, [scale])

  const onScroll = (): void => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop)
  }

  // A drag-selection creates a new annotation; a plain click inside a highlighted run opens
  // that annotation's note popover (pins are hidden on PDF — see W6).
  const handleMouseUp = (e: React.MouseEvent): void => {
    if (e.detail > 1) return // double/triple-click selects a word — reserved for "send to canvas"
    const sel = window.getSelection()
    const range = rangeFromSelection(sel)
    if (range) {
      onCreateRange(range)
      sel?.removeAllRanges()
      return
    }
    if (connectMode) return // Draw mode: a plain click is reserved for the connect pick — don't open the note card
    const off = sel ? offsetOf(sel.anchorNode, sel.anchorOffset) : null
    if (off === null) return
    // NOTE: for a fallback-resolved annotation (anchor.page used because text failed),
    // a.range holds advisory creation-time offsets that may be stale, so this offset-based
    // hit-test can be imprecise. Acceptable for v1; a precise fix would expose viaFallback
    // on ResolvedAnnotation. Highlight quads still render from the persisted coords.
    const hit = annotations.find((a) => off >= a.range.start && off < a.range.end)
    if (hit) setPopover({ id: hit.id, x: e.clientX, y: e.clientY })
    else setPopover(null)
  }

  // Find the highlighted annotation under a screen point (the text layer sits above the
  // pointer-events:none highlight layer, so the element there carries the run's data-cs offset).
  const annotationAtPoint = (clientX: number, clientY: number): ResolvedAnnotation | null => {
    const el = document.elementFromPoint(clientX, clientY)
    const off = el ? offsetOf(el, 0) : null
    if (off === null) return null
    return annotations.find((a) => off >= a.range.start && off < a.range.end) ?? null
  }

  // Double-click / right-click a highlight → send it to the active canvas as an excerpt.
  const sendHit = (a: ResolvedAnnotation): void => {
    if (!onSendExcerpt || !sourceRef) return
    onSendExcerpt({
      source: sourceRef,
      anchor: a.anchor,
      snapshot: (docText ?? '').slice(a.range.start, a.range.end),
      color: a.color,
      sourceAnnotationId: a.id
    })
    window.getSelection()?.removeAllRanges()
  }

  const open = annotations.find((a) => a.id === popover?.id) ?? null

  return (
    <div
      ref={scrollRef}
      role="article"
      data-pane-content
      onScroll={onScroll}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        if (e.deltaY < 0) onZoomIn?.()
        else if (e.deltaY > 0) onZoomOut?.()
      }}
      onClickCapture={connectMode ? (e) => { e.preventDefault(); e.stopPropagation(); onConnectClick?.(e) } : undefined}
      onMouseUp={handleMouseUp}
      onDoubleClick={(e) => {
        const a = annotationAtPoint(e.clientX, e.clientY)
        if (a) sendHit(a)
      }}
      onContextMenu={(e) => {
        const a = annotationAtPoint(e.clientX, e.clientY)
        if (a) {
          e.preventDefault()
          sendHit(a)
        }
      }}
      style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: '#525659', padding: 16 }}
    >
      {parse.pages.map((p) => {
        const visible = win.includes(p.index)
        const cssWidth = p.width * scale
        const cssHeight = p.height * scale
        return (
          <div
            key={p.index}
            ref={(el) => {
              pageRefs.current[p.index] = el
            }}
            data-testid={`pdf-page-${p.index}`}
            style={{
              position: 'relative',
              overflow: 'hidden',
              transformOrigin: '0 0',
              width: cssWidth,
              height: cssHeight,
              margin: '0 auto',
              marginBottom: GAP,
              background: '#fff'
            }}
          >
            {/* Chip lives on the always-mounted page box (not gated by `visible`/windowing) so it shows whenever the page is on screen, even before its canvas/text layer mount. */}
            {isOcrPage(byPage.get(p.index)) && <OcrChip pageIndex={p.index} />}
            {visible && (
              <>
                {failedPages.has(p.index) ? (
                  <PdfFallbackImage state={fallbacks.get(p.index)} pageIndex={p.index} />
                ) : (
                  <canvas
                    width={p.width}
                    height={p.height}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                    ref={(el) => {
                      // Don't clear the cache on detach. An inline ref re-runs ref(null)/ref(el) on
                      // every re-render, and the burst of re-renders at open (viewportH + smooth
                      // scrollIntoView) would otherwise re-invoke renderPage repeatedly for the same
                      // canvas — concurrent pdf.js renders corrupt the bitmap. When a page truly
                      // leaves the window and re-enters, React mounts a NEW canvas, so the
                      // `cached.el === el` identity check below already forces a fresh render then.
                      if (!el) return
                      const cached = canvasEls.current.get(p.index)
                      if (cached && cached.el === el && cached.cssWidth === cssWidth) return // already rendered at this size
                      canvasEls.current.set(p.index, { el, cssWidth })
                      renderPage(p.index, el, cssWidth, onPageRenderError)
                    }}
                  />
                )}
                {/* Highlights sit UNDER the transparent selectable text so clicks/selection
                    still land on the text layer above (highlight layer is pointer-events:none). */}
                <PdfHighlightLayer boxes={boxesByPage.get(p.index) ?? []} zoom={scale} />
                <PdfTextLayer runs={byPage.get(p.index) ?? []} zoom={scale} />
              </>
            )}
          </div>
        )
      })}
      {open && popover && (
        <NotePopover
          annotation={open}
          x={popover.x}
          y={popover.y}
          onSetNote={onSetNote}
          onSetColor={onSetColor}
          onDelete={(id) => {
            onDelete(id)
            setPopover(null)
          }}
          onClose={() => setPopover(null)}
          isPinned={false}
          atCap={false}
          onTogglePin={() => {}}
          showPin={false}
        />
      )}
    </div>
  )
}
