import type { JSX } from 'react'
import { Section } from '../../core/model/document'
import { paragraphOffsets, segmentParagraph, HighlightRange } from '../../core/anchor/segment'
import { BACKLINK_FLASH_ID } from './backlinkFlash'
import { SEARCH_ACTIVE_ID, SEARCH_MATCH_ID } from '../search/searchMatch'

interface OpenAnnotation {
  (id: string, e: { clientX: number; clientY: number }, ids?: string[]): void
}

function Paragraph({
  text,
  baseOffset,
  ranges,
  onOpenAnnotation,
  onSendAnnotation
}: {
  text: string
  baseOffset: number
  ranges: HighlightRange[]
  onOpenAnnotation: OpenAnnotation
  onSendAnnotation?: (id: string) => void
}): JSX.Element {
  const segments = segmentParagraph(text, baseOffset, ranges)
  let cursor = baseOffset
  return (
    <p>
      {segments.map((seg, i) => {
        const cs = cursor
        cursor += seg.text.length
        if (seg.annotationIds.length === 0) {
          return (
            <span key={i} data-cs={cs}>
              {seg.text}
            </span>
          )
        }

        const overlap = seg.annotationIds.length > 1
        const topId = seg.annotationIds[seg.annotationIds.length - 1]
        const topColor = seg.colors[seg.colors.length - 1]

        if (topId === SEARCH_MATCH_ID || topId === SEARCH_ACTIVE_ID) {
          const isActiveHit = topId === SEARCH_ACTIVE_ID
          return (
            <mark
              key={i}
              data-cs={cs}
              data-testid={isActiveHit ? 'search-active' : 'search-match'}
              className={isActiveHit ? 'rb-search-hit rb-search-hit--active' : 'rb-search-hit'}
            >
              {seg.text}
            </mark>
          )
        }

        const isAnnotation = topId !== BACKLINK_FLASH_ID
        const sendable = onSendAnnotation && isAnnotation
        return (
          <mark
            key={i}
            data-cs={cs}
            data-annotation-id={topId}
            data-testid={topId === BACKLINK_FLASH_ID ? 'backlink-flash' : undefined}
            data-conn-flash={topId === BACKLINK_FLASH_ID ? 'true' : undefined}
            data-overlap={overlap ? 'true' : undefined}
            onClick={(e) => {
              if (overlap) onOpenAnnotation(topId, e, seg.annotationIds)
              else onOpenAnnotation(topId, e)
            }}
            onDoubleClick={sendable ? () => onSendAnnotation?.(topId) : undefined}
            onContextMenu={
              sendable
                ? (e) => {
                    e.preventDefault()
                    onSendAnnotation?.(topId)
                  }
                : undefined
            }
            title={sendable ? 'Double-click or right-click send canvas' : undefined}
            style={{
              backgroundColor: `color-mix(in var(--hl-mix, srgb), ${topColor} 45%, transparent)`,
              backgroundImage: overlap ? 'linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.18))' : undefined,
              color: 'var(--fg)',
              cursor: 'pointer',
              outline: overlap ? '1px dashed var(--accent)' : undefined
            }}
          >
            {seg.text}
          </mark>
        )
      })}
    </p>
  )
}

function PinGutter({ hasPinnedPassages }: { hasPinnedPassages: boolean }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      title={hasPinnedPassages ? 'This section contains pinned passages' : undefined}
      style={{
        width: 22,
        flex: '0 0 22px',
        borderRight: '1px solid var(--border)',
        background: hasPinnedPassages ? 'var(--surface-2)' : 'transparent',
        color: 'var(--warn)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 4,
        fontSize: 'var(--text-xs)'
      }}
    >
      <span style={{ opacity: hasPinnedPassages ? 0.7 : 0 }}>pin</span>
    </div>
  )
}

export interface SectionViewProps {
  section: Section
  active: boolean
  ranges: HighlightRange[]
  onOpenAnnotation: OpenAnnotation
  onSendAnnotation?: (id: string) => void
  hasPinnedPassages?: boolean
  sectionRef?: (el: HTMLElement | null) => void
}

export function SectionView({
  section,
  active,
  ranges,
  onOpenAnnotation,
  onSendAnnotation,
  hasPinnedPassages = false,
  sectionRef
}: SectionViewProps): JSX.Element {
  const offsets = paragraphOffsets(section)
  return (
    <section
      data-testid={`section-${section.id}`}
      data-active={active ? 'true' : 'false'}
      ref={sectionRef}
      style={{ display: 'flex', alignItems: 'stretch' }}
    >
      <PinGutter hasPinnedPassages={hasPinnedPassages} />
      <div
        style={{
          flex: 1,
          borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
          paddingLeft: 12
        }}
      >
        {section.heading && (
          <h2 data-cs={section.charStart} style={{ fontSize: 'var(--text-lg)' }}>
            {section.heading}
          </h2>
        )}
        {section.paragraphs.map((p, j) => (
          <Paragraph
            key={j}
            text={p}
            baseOffset={offsets[j]}
            ranges={ranges}
            onOpenAnnotation={onOpenAnnotation}
            onSendAnnotation={onSendAnnotation}
          />
        ))}
      </div>
    </section>
  )
}
