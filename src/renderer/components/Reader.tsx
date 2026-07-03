import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { DocumentModel, Section } from '../../core/model/document'
import { HighlightRange } from '../../core/anchor/segment'
import { planCompare, positionFractions, PinnedRange } from '../../core/compare/squeeze'
import { Pin } from '../compare/usePins'
import { ResolvedAnnotation } from '../annotations/useAnnotations'
import { rangeFromSelection } from '../annotations/selection'
import { type ExcerptDropPayload } from '../canvas/excerptDrag'
import { NotePopover } from './NotePopover'
import { SectionView } from './SectionView'
import { GapBand } from './GapBand'
import { PinnedPassage } from './PinnedPassage'
import { AnchorTab } from './AnchorTab'
import { BACKLINK_FLASH_ID, BACKLINK_FLASH_COLOR } from './backlinkFlash'
import { SearchMatch, SEARCH_MATCH_ID, SEARCH_ACTIVE_ID } from '../search/searchMatch'
interface ReaderProps {
  doc: DocumentModel
  sourceRef: string
  activeIndex: number
  annotations: ResolvedAnnotation[]
  reattaching: boolean
  onCreateRange: (range: { start: number; end: number }) => void
  onSetNote: (id: string, note: string) => void
  onSetColor: (id: string, color: string) => void
  onDelete: (id: string) => void
  pins: Pin[]
  pinnedRanges: PinnedRange[]
  compareActive: boolean
  onReleasePin: (pinId: string) => void
  isPinnedAnnotation: (annotationId: string) => boolean
  atCap: boolean
  onTogglePinAnnotation: (ann: ResolvedAnnotation) => void
  flashRange?: { start: number; end: number } | null
  /** Send a highlight to the active canvas as an excerpt (double-click / right-click a highlight). */
  onSendExcerpt?: (payload: ExcerptDropPayload) => void
  /** When true, clicks on the article are intercepted for Connect tool word-pick. */
  connectMode?: boolean
  /** Called (in connectMode) with the click event so DocumentPane can resolve the word anchor. */
  onConnectClick?: (e: React.MouseEvent) => void
  /** In-document search hits (case-insensitive substring matches); rendered under annotations. */
  searchMatches?: SearchMatch[]
  /** The currently-selected search hit (from searchMatches); scrolled into view when it changes. */
  activeMatch?: SearchMatch | null
}

function rangesFor(annotations: ResolvedAnnotation[]): HighlightRange[] {
  return annotations.map((a) => ({ start: a.range.start, end: a.range.end, id: a.id, color: a.color }))
}

export function Reader({
  doc,
  sourceRef,
  activeIndex,
  annotations,
  reattaching,
  onCreateRange,
  onSetNote,
  onSetColor,
  onDelete,
  pins,
  pinnedRanges,
  compareActive,
  onReleasePin,
  isPinnedAnnotation,
  atCap,
  onTogglePinAnnotation,
  flashRange,
  onSendExcerpt,
  connectMode,
  onConnectClick,
  searchMatches = [],
  activeMatch = null
}: ReaderProps): JSX.Element {
  const refs = useRef<Array<HTMLElement | null>>([])
  const articleRef = useRef<HTMLElement | null>(null)
  const [popover, setPopover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [chooser, setChooser] = useState<{ ids: string[]; x: number; y: number } | null>(null)
  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set())
  // Search hits render under annotations (annotations stay the clickable "top" on overlap); the
  // active hit carries a distinct id so SectionView can style/target it separately.
  const searchRanges: HighlightRange[] = searchMatches.map((m) => ({
    start: m.start,
    end: m.end,
    id: activeMatch && m.start === activeMatch.start && m.end === activeMatch.end ? SEARCH_ACTIVE_ID : SEARCH_MATCH_ID,
    color: 'transparent' // unused: SectionView renders search hits via id, not color
  }))

  // Prepend the flash so genuine annotations stay the "top" id (click still opens them); a
  // flashed passage with no annotation shows the flash highlight on its own. Search ranges sit
  // between the flash and the annotations — still under annotations for click priority.
  const ranges: HighlightRange[] = [
    ...(flashRange
      ? [{ start: flashRange.start, end: flashRange.end, id: BACKLINK_FLASH_ID, color: BACKLINK_FLASH_COLOR }]
      : []),
    ...searchRanges,
    ...rangesFor(annotations)
  ]

  useEffect(() => {
    refs.current[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  // A navigate always re-flashes (a fresh flashRange object) — scroll the flashed passage into view
  // even when its section is already the active one. (setActiveIndex bails on an unchanged index, so
  // the [activeIndex] effect alone would not scroll — the cause of "navigate did nothing when the
  // target was already on screen".) Centered for consistent, obvious feedback.
  useEffect(() => {
    if (!flashRange) return
    const el = articleRef.current?.querySelector('[data-testid="backlink-flash"]')
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [flashRange])

  // Scroll the active search match into view when it changes (mirrors the flash scroll above).
  useEffect(() => {
    if (!activeMatch) return
    const el = articleRef.current?.querySelector('[data-testid="search-active"]')
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeMatch?.start, activeMatch?.end])

  // Dismiss the note popover on Escape (no INPUT/TEXTAREA guard — note content is already
  // persisted via onSetNote, so closing from within the textarea loses nothing).
  useEffect(() => {
    if (!popover && !chooser) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setPopover(null)
        setChooser(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chooser, popover])

  // Clear stale gap-expansion keys when the document changes. (Gaps are keyed by their first
  // range's start offset, so they stay correctly attributed across pin changes within a doc.)
  useEffect(() => {
    setExpandedGaps(new Set())
  }, [doc])

  const handleMouseUp = (e: React.MouseEvent): void => {
    if (compareActive) return // Compare Mode is read-only: no selection-to-create.
    if (e.detail > 1) return // double/triple-click selects a word — reserved for "send to canvas"
    const range = rangeFromSelection(window.getSelection())
    if (range) {
      onCreateRange(range)
      window.getSelection()?.removeAllRanges()
    }
  }

  const toggleGap = (key: number): void =>
    setExpandedGaps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const open = annotations.find((a) => a.id === popover?.id) ?? null

  // Section ids that contain at least one pinned passage (drives the gutter indicator).
  const pinnedSectionIds = new Set(pins.map((p) => p.sectionId))

  // Build the excerpt payload for a highlight — used by double-click / right-click send.
  // Reuses the annotation's own anchor.
  const excerptPayloadFor = (id: string): ExcerptDropPayload | null => {
    const a = annotations.find((x) => x.id === id)
    if (!a || !sourceRef) return null
    return { source: sourceRef, anchor: a.anchor, snapshot: doc.text.slice(a.range.start, a.range.end), color: a.color, sourceAnnotationId: a.id }
  }

  // Double-click / right-click a highlight to send it to the active canvas (no drag needed).
  const sendAnnotationToCanvas = (id: string): void => {
    const payload = excerptPayloadFor(id)
    if (payload) onSendExcerpt?.(payload)
    window.getSelection()?.removeAllRanges() // clear the word a double-click selected
  }

  const renderSection = (s: Section): JSX.Element => (
    <SectionView
      key={s.id}
      section={s}
      active={s.order === activeIndex}
      ranges={ranges}
      onOpenAnnotation={(id, e, ids) => {
        if (compareActive) return
        const annotationIds = (ids ?? [id]).filter((annId) => annotations.some((a) => a.id === annId))
        if (annotationIds.length > 1) {
          setPopover(null)
          setChooser({ ids: annotationIds, x: e.clientX, y: e.clientY })
        } else {
          setChooser(null)
          setPopover({ id, x: e.clientX, y: e.clientY })
        }
      }}
      onSendAnnotation={sendAnnotationToCanvas}
      hasPinnedPassages={pinnedSectionIds.has(s.id)}
      sectionRef={(el) => {
        refs.current[s.order] = el
      }}
    />
  )

  const body = compareActive
    ? planCompare(doc.text, doc.sections, pinnedRanges).map((seg) =>
        seg.kind === 'pin' ? (
          <PinnedPassage
            key={`pin-${seg.passage.id ?? seg.passage.range.start}`}
            passage={seg.passage}
            onRelease={() => {
              // Release by exact pin id (carried through planCompare) so overlapping pins that
              // clamp to the same range still release the right one.
              if (seg.passage.id) onReleasePin(seg.passage.id)
            }}
          />
        ) : (
          <GapBand
            key={`gap-${seg.ranges[0].start}`}
            ranges={seg.ranges}
            documentText={doc.text}
            expanded={expandedGaps.has(seg.ranges[0].start)}
            onToggle={() => toggleGap(seg.ranges[0].start)}
          />
        )
      )
    : doc.sections.map(renderSection)

  const soloPin = pins.length === 1 ? pins[0] : undefined

  return (
    <article
      ref={articleRef}
      aria-label={doc.title}
      data-pane-content
      data-reattaching={reattaching ? 'true' : undefined}
      onMouseUp={handleMouseUp}
      onClickCapture={connectMode ? (e) => { e.preventDefault(); e.stopPropagation(); onConnectClick?.(e) } : undefined}
      style={{ flex: 1, overflowY: 'auto', padding: '0 24px', fontSize: 'var(--text-base)', lineHeight: 'var(--leading-relaxed)' }}
    >
      {body}
      {soloPin && (
        <AnchorTab
          passageText={doc.text.slice(soloPin.resolvedRange.start, soloPin.resolvedRange.end)}
          fractions={positionFractions(doc.text, doc.sections, pinnedRanges, activeIndex)}
          onRelease={() => onReleasePin(soloPin.id)}
        />
      )}
      {!compareActive && chooser && (
        <div
          role="dialog"
          aria-label="Choose annotation"
          className="rb-card"
          style={{
            position: 'fixed',
            left: chooser.x,
            top: chooser.y,
            zIndex: 11,
            padding: 8,
            width: 240,
            boxShadow: 'var(--shadow-md)'
          }}
        >
          {chooser.ids.map((id) => {
            const ann = annotations.find((a) => a.id === id)
            if (!ann) return null
            const label = ann.note.trim() || doc.text.slice(ann.range.start, ann.range.end)
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setChooser(null)
                  setPopover({ id, x: chooser.x, y: chooser.y })
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  gap: 8,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--fg)',
                  padding: '6px 4px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: ann.color,
                    flex: '0 0 12px'
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {!compareActive && open && popover && (
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
          isPinned={isPinnedAnnotation(open.id)}
          atCap={atCap}
          onTogglePin={() => onTogglePinAnnotation(open)}
        />
      )}
    </article>
  )
}
