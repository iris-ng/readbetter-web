import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { PlatformAdapter } from '../platform'
import type { Loaded } from '../App'
import type { ExcerptDropPayload } from '../canvas/excerptDrag'
import type { Anchor } from '../../core/anchor/anchor'
import type { PageRectRegion } from '../../core/anchor/region'
import type { Link } from '../../core/link/link'
import type { LinkPick } from '../annotations/linkPick'
import { linkPickFromPoint } from '../annotations/linkPick'
import { buildPdfRunIndex } from '../../core/pdf/pdfLayout'
import { PdfPageView, type PdfRegionAnchor } from './PdfPageView'
import { ZoomControl } from './ZoomControl'
import { useZoom } from '../hooks/useZoom'
import { useDocSearch } from '../hooks/useDocSearch'
import { Reader } from './Reader'
import { SearchBar } from './SearchBar'
import { OrphanTray } from './OrphanTray'
import { SavedViewsBar } from './SavedViewsBar'
import { GapBand } from './GapBand'
import { PinnedPassage } from './PinnedPassage'
import { useSectionNavigation } from './useSectionNavigation'
import { useAnnotations, ResolvedAnnotation } from '../annotations/useAnnotations'
import { usePins } from '../compare/usePins'
import { defaultViewName, planCompare } from '../../core/compare/squeeze'

/** DPI for the server-side raster fallback when pdf.js blanks a page (spec default). */
const PDF_FALLBACK_DPI = 150
const READING_POS_KEY = 'rb-reading-position'

interface DocumentPaneProps {
  loaded: Loaded
  platform: PlatformAdapter
  /** The active project's registry id; bound into this pane's sidecar I/O. */
 projectId: string
  flashRange: { start: number; end: number } | null
  flashPageRect?: { pageIndex: number; rect: PageRectRegion['rect']; nonce: number } | null
  regionAnchors?: PdfRegionAnchor[]
  onSendExcerpt: (payload: ExcerptDropPayload) => void
  onAnnotationsResolved?: (sourcePath: string, annotations: ResolvedAnnotation[]) => void
  /** Report this pane's resolved links up so App can pair them across panes and draw lines. */
  onLinksResolved?: (sourcePath: string, links: Link[]) => void
  /** Surface the SavedViewsBar restore outcome (App owns the restoreNote banner). */
  onRestoreNote?: (note: string | null) => void
  /** Register this pane's add/remove methods up to App's cross-pane registry (keyed by source ref). */
  registerPane?: (
    ref: string,
    api: { addLink: (l: Link) => void; removeLink: (id: string) => void }
  ) => void
  unregisterPane?: (ref: string) => void
  /** Imperative "scroll to + flash this char range" request from App (click a connection line). */
  connectionJump?: { start: number; end: number; nonce: number } | null
  /** When true, clicks in the Reader are intercepted for Connect tool word-pick. */
  connectMode?: boolean
  /** Called with a docRef + LinkPick when a word or highlight is clicked in Connect mode. */
  onConnectPick?: (docRef: string, pick: LinkPick) => void
  /** Whether this pane's find-in-page SearchBar row is open (App owns per-tab state). */
  searchOpen: boolean
  /** Close this pane's search (also resets the query so reopening starts empty). */
  onCloseSearch: () => void
}

function readingKey(projectId: string, ref: string): string {
  return JSON.stringify([projectId, ref])
}

function readReadingPositions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(READING_POS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function writeReadingPosition(projectId: string, ref: string, pageIndex: number): void {
  try {
    localStorage.setItem(READING_POS_KEY, JSON.stringify({ ...readReadingPositions(), [readingKey(projectId, ref)]: pageIndex }))
  } catch {
    /* ignore */
  }
}

function readReadingPosition(projectId: string, ref: string): number | null {
  const value = readReadingPositions()[readingKey(projectId, ref)]
  return typeof value === 'number' ? value : null
}

/**
 * One document's self-contained workspace: the (Reader|PdfPageView) view, the SavedViewsBar,
 * and the OrphanTray, owning all per-document state (navigation, zoom, annotations, pins).
 * App renders this with `key={loaded.sourcePath}` so it remounts (fresh activeIndex / hooks)
 * when the active document changes.
 */
export function DocumentPane({
  loaded,
  platform,
  projectId,
  flashRange,
  flashPageRect,
  regionAnchors = [],
  onSendExcerpt,
  onAnnotationsResolved,
  onLinksResolved,
  onRestoreNote,
  registerPane,
  unregisterPane,
  connectionJump,
  connectMode,
  onConnectPick,
  searchOpen,
  onCloseSearch
}: DocumentPaneProps): JSX.Element {
  const doc = loaded.doc
  const { activeIndex, setActiveIndex } = useSectionNavigation(doc.sections.length)
  const zoom = useZoom()
  const search = useDocSearch(doc.text)
  const totalPages = loaded.pdf?.parse.pages.length ?? 0
 const [expandedCompareGaps, setExpandedCompareGaps] = useState<Set<number>>(new Set())
 const [captureRegionMode, setCaptureRegionMode] = useState(false)

  useEffect(() => {
    if (!loaded.pdf) return
    const restored = readReadingPosition(projectId, loaded.sourcePath)
    if (restored !== null) setActiveIndex(Math.max(0, Math.min(restored, totalPages - 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded.sourcePath, projectId])

  useEffect(() => {
    if (!loaded.pdf) return
    writeReadingPosition(projectId, loaded.sourcePath, activeIndex)
  }, [activeIndex, loaded.pdf, loaded.sourcePath, projectId])

  // Closing search resets the query so reopening starts empty (spec §3.4).
  useEffect(() => {
    if (!searchOpen) search.reset()
  }, [searchOpen, search.reset])

  // PDF-only: per-run char-offset index, the source for both the selectable text layer and
  // page+coords anchor resolution. Null for clean-DOM docs (the text-anchor path is used).
  const pdfRunIndex = useMemo(() => (loaded.pdf ? buildPdfRunIndex(loaded.pdf.parse) : null), [loaded])
  // Memoize the wrapper so useAnnotations' internal memos (resolution, createAnnotation,
  // reattach) see a stable reference between renders; an inline { runIndex } literal would
  // allocate a new object every render and defeat them.
  const pageAnchoring = useMemo(
    () => (pdfRunIndex ? { runIndex: pdfRunIndex } : undefined),
    [pdfRunIndex]
  )

  // Bind the active projectId into the sidecar I/O the way useAnnotations expects (ref-only),
  // memoized so the hook's effects don't re-run on every render (a fresh object would refire the
  // sidecar load loop). Re-created only when the adapter or project changes.
  const sidecarApi = useMemo(
    () => ({
      readSidecar: (ref: string) => platform.readSidecar(projectId, ref),
      writeSidecar: (ref: string, json: string) => platform.writeSidecar(projectId, ref, json)
    }),
    [platform, projectId]
  )

  const ann = useAnnotations(doc.text, loaded.content, loaded.sourcePath, sidecarApi, pageAnchoring)

  const docText = doc.text
  const sections = useMemo(() => doc.sections, [doc])
  const pins = usePins(docText, sections)

  // Flush this document's pending sidecar change when the page unloads.
  useEffect(() => {
    const onBeforeUnload = (): void => ann.flush()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [ann.flush])

  // Flush exactly once on unmount (the pane remounts on doc change via `key`), via a ref to the
  // latest flush so the empty-dep cleanup always fires the current closure.
  const flushRef = useRef(ann.flush)
  flushRef.current = ann.flush
  useEffect(() => () => flushRef.current(), [])

  // Report resolved annotations up so App can live-sync docked excerpt-card colors.
  useEffect(() => {
    onAnnotationsResolved?.(loaded.sourcePath, ann.annotations)
  }, [loaded.sourcePath, ann.annotations, onAnnotationsResolved])

  // Report this pane's links up so App can pair them by shared id across panes and render lines.
  useEffect(() => {
    onLinksResolved?.(loaded.sourcePath, ann.links)
  }, [loaded.sourcePath, ann.links, onLinksResolved])

  // Register this pane's addCrossLink in App's cross-pane registry so a link forged from the
  // OTHER pane can write into this document's sidecar. Clean up on unmount / ref change so the
  // registry never holds a stale entry (panes remount on doc change via `key`; the secondary
  // pane mounts/unmounts on Open-beside / ✕).
  useEffect(() => {
    registerPane?.(loaded.sourcePath, { addLink: ann.addLink, removeLink: ann.removeLink })
    return () => unregisterPane?.(loaded.sourcePath)
  }, [loaded.sourcePath, ann.addLink, ann.removeLink, registerPane, unregisterPane])

  // A back-link flash (driven by App via the flashRange prop) also scrolls the Reader to the
  // section containing it — replicating the old card-click navigate-and-flash behavior.
  useEffect(() => {
    if (!flashRange) return
    const idx = doc.sections.findIndex(
      (s) => flashRange.start >= s.charStart && flashRange.start < s.charEnd
    )
    if (idx >= 0) setActiveIndex(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashRange])

  // A transient flash for an incoming Jump (App → jumpTo). Routed through the SAME Reader flashRange
  // channel as the back-link flash, so a jumped passage flashes identically.
  const [jumpFlash, setJumpFlash] = useState<{ start: number; end: number } | null>(null)

  // React to an imperative connection Jump from App (click a connection line → the opposite pane
  // scrolls to the connection's endpoint here). Keyed on nonce so a repeat jump refires. Reuses the
  // same section-nav + transient jumpFlash as cross-link Jump, but keyed by char offset.
  useEffect(() => {
    if (!connectionJump) return
    const { start, end } = connectionJump
    const idx = doc.sections.findIndex(
      (s) => start >= s.charStart && start < s.charEnd
    )
    if (idx >= 0) setActiveIndex(idx)
    setJumpFlash({ start, end })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionJump?.nonce])

  // The jump flash is transient (mirrors App's flashRange clear) so it doesn't stick.
  useEffect(() => {
    if (!jumpFlash) return
    const h = setTimeout(() => setJumpFlash(null), 1600)
    return () => clearTimeout(h)
  }, [jumpFlash])

  // A Reader selection either creates a new highlight or rebinds the orphan being re-attached.
  const handleRange = (range: { start: number; end: number }): void => {
    if (ann.reattachingId) ann.reattach(ann.reattachingId, range)
    else ann.createAnnotation(range)
  }

  // Pins are independent of annotations: toggling a pin never creates/deletes the annotation.
  const togglePinAnnotation = (a: ResolvedAnnotation): void => {
    pins.toggleByAnnotation({ id: a.id, anchor: a.anchor, range: a.range })
  }
  const handleCaptureRegion = (anchor: Anchor, snapshot: string, previewBlob?: Blob): void => {
    void (async () => {
      let previewAssetRef: string | undefined
      if (previewBlob) {
        try {
          previewAssetRef = (await platform.writeCanvasPreview(projectId, previewBlob)).ref
        } catch {
          previewAssetRef = undefined
        }
      }
      onSendExcerpt({ source: loaded.sourcePath, anchor, snapshot, previewAssetRef })
    })()
    setCaptureRegionMode(false)
  }

  const toggleCompareGap = (key: number): void => {
    setExpandedCompareGaps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const pdfCompareBody = pins.compareActive
    ? planCompare(doc.text, doc.sections, pins.pinnedRanges).map((seg) =>
        seg.kind === 'pin' ? (
          <PinnedPassage
            key={`pin-${seg.passage.id ?? seg.passage.range.start}`}
            passage={seg.passage}
            onRelease={() => {
              if (seg.passage.id) pins.release(seg.passage.id)
            }}
          />
        ) : (
          <GapBand
            key={`gap-${seg.ranges[0].start}`}
            ranges={seg.ranges}
            documentText={doc.text}
            expanded={expandedCompareGaps.has(seg.ranges[0].start)}
            onToggle={() => toggleCompareGap(seg.ranges[0].start)}
          />
        )
      )
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
      {(loaded.pdf || !pins.compareActive) && (
        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', flex: '0 0 auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loaded.pdf && (
            <ZoomControl
              zoom={zoom.zoom}
              onZoomChange={zoom.setZoom}
            />
          )}
          <button
            type="button"
            aria-pressed={captureRegionMode}
            disabled={!!connectMode || pins.compareActive}
            onClick={() => setCaptureRegionMode((v) => !v)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: captureRegionMode ? 'var(--accent)' : 'transparent',
              color: captureRegionMode ? 'var(--accent-contrast)' : 'var(--fg)',
              cursor: connectMode || pins.compareActive ? 'not-allowed' : 'pointer',
              font: '600 12px var(--font-sans)'
            }}
          >
            Capture region
          </button>
        </div>
      )}
      {searchOpen && (
        <SearchBar
          query={search.query}
          matchCount={search.matches.length}
          activeOrdinal={search.activeIndex + 1}
          onQueryChange={search.setQuery}
          onNext={search.next}
          onPrev={search.prev}
          onClose={onCloseSearch}
        />
      )}
      <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}>
        {loaded.pdf ? (
          pins.compareActive ? (
            <div
              data-pane-content
              style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', fontSize: 'var(--text-base)', lineHeight: 'var(--leading-relaxed)' }}
            >
              {pdfCompareBody}
            </div>
          ) : (
            <PdfPageView
              parse={loaded.pdf.parse}
              runIndex={pdfRunIndex ?? []}
              activeIndex={activeIndex}
              zoom={zoom.zoom}
              renderPage={loaded.pdf.renderPage}
              renderPageImage={(page) => platform.renderPdfPageImage(projectId, loaded.sourcePath, page, PDF_FALLBACK_DPI)}
              annotations={ann.annotations}
              onCreateRange={handleRange}
              onSetNote={ann.setNote}
              onSetColor={ann.setColor}
              onDelete={ann.remove}
              isPinnedAnnotation={pins.isPinnedAnnotation}
              atCap={pins.atCap}
              onTogglePinAnnotation={togglePinAnnotation}
              sourceRef={loaded.sourcePath}
              docText={doc.text}
              onSendExcerpt={onSendExcerpt}
                connectMode={connectMode}
onConnectClick={(e) => {
const p = linkPickFromPoint(e.clientX, e.clientY, doc.text, ann.annotations)
if (p) onConnectPick?.(loaded.sourcePath, p)
}}
onConnectRegion={(anchor, region) => onConnectPick?.(loaded.sourcePath, { kind: 'region', anchor, region })}
regionAnchors={regionAnchors}
flashRange={jumpFlash ?? flashRange}
                captureRegionMode={captureRegionMode}
                onCaptureRegion={handleCaptureRegion}
                flashPageRect={flashPageRect}
                searchMatches={search.matches}
              activeMatch={search.activeMatch}
              onZoomIn={zoom.zoomIn}
              onZoomOut={zoom.zoomOut}
            />
          )
        ) : (
          <Reader
            doc={doc}
            sourceRef={loaded.sourcePath}
            activeIndex={activeIndex}
            annotations={ann.annotations}
            reattaching={ann.reattachingId !== null}
            onCreateRange={handleRange}
            onSetNote={ann.setNote}
            onSetColor={ann.setColor}
            onDelete={ann.remove}
            pins={pins.pins}
            pinnedRanges={pins.pinnedRanges}
            compareActive={pins.compareActive}
            onReleasePin={pins.release}
            isPinnedAnnotation={pins.isPinnedAnnotation}
            atCap={pins.atCap}
            onTogglePinAnnotation={togglePinAnnotation}
            flashRange={jumpFlash ?? flashRange}
            searchMatches={search.matches}
            activeMatch={search.activeMatch}
            onSendExcerpt={onSendExcerpt}
            connectMode={connectMode}
              onConnectClick={(e) => {
                const p = linkPickFromPoint(e.clientX, e.clientY, doc.text, ann.annotations)
                if (p) onConnectPick?.(loaded.sourcePath, p)
              }}
              captureRegionMode={captureRegionMode}
              onCaptureRegion={handleCaptureRegion}
              flashPageRect={flashPageRect}
            />
          )}
      </div>
      <SavedViewsBar
        views={ann.savedViews}
        canSave={pins.compareActive}
        onSave={() => ann.saveView(defaultViewName(docText, sections, pins.pinnedRanges), pins.toPinAnchors())}
        onRestore={(id) => {
          const v = ann.savedViews.find((x) => x.id === id)
          if (v) {
            const { resolved } = pins.setPins(v.pinnedAnchors)
            if (resolved < 2) onRestoreNote?.('Some passages in this view were not found.')
            else onRestoreNote?.(null)
          }
        }}
        onRename={ann.renameView}
        onDelete={ann.deleteView}
      />
      <OrphanTray
        orphans={ann.orphans}
        reattachingId={ann.reattachingId}
        onBeginReattach={ann.beginReattach}
        onCancelReattach={ann.cancelReattach}
        onDismiss={ann.remove}
      />
    </div>
  )
}
