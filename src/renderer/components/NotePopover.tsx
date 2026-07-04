import type { JSX } from 'react'
import { Icon } from './Icon'
import { ResolvedAnnotation } from '../annotations/useAnnotations'
import { PALETTE } from '../annotations/palette'

const POPOVER_MARGIN = 8
const POPOVER_WIDTH = 220
const POPOVER_ESTIMATED_HEIGHT = 180

function clampPopoverPosition(x: number, y: number): { left: number; top: number } {
  const maxLeft = Math.max(POPOVER_MARGIN, window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN)
  const maxTop = Math.max(POPOVER_MARGIN, window.innerHeight - POPOVER_ESTIMATED_HEIGHT - POPOVER_MARGIN)
  return {
    left: Math.min(Math.max(x, POPOVER_MARGIN), maxLeft),
    top: Math.min(Math.max(y, POPOVER_MARGIN), maxTop)
  }
}

export function NotePopover({
  annotation,
  x,
  y,
  onSetNote,
  onSetColor,
  onDelete,
  onClose,
  isPinned,
  atCap,
  onTogglePin,
  showPin = true
}: {
  annotation: ResolvedAnnotation
  x: number
  y: number
  onSetNote: (id: string, note: string) => void
  onSetColor: (id: string, color: string) => void
  onDelete: (id: string) => void
  onClose: () => void
  isPinned: boolean
  atCap: boolean
  onTogglePin: () => void
  /** When false, the pin button is hidden (e.g. PDF, where pins are not yet supported). */
  showPin?: boolean
}): JSX.Element {
  const pinDisabled = atCap && !isPinned
  const { left, top } = clampPopoverPosition(x, y)
  return (
    <div
      role="dialog"
      aria-label="Annotation"
      className="rb-card"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 10,
        boxShadow: 'var(--shadow-md)',
        padding: 8,
        width: POPOVER_WIDTH,
        maxHeight: `calc(100vh - ${POPOVER_MARGIN * 2}px)`,
        overflowY: 'auto',
        boxSizing: 'border-box'
      }}
    >
      <textarea
        key={annotation.id}
        aria-label="Note"
        defaultValue={annotation.note}
        onChange={(e) => onSetNote(annotation.id, e.target.value)}
        placeholder="Add a note…"
        style={{ width: '100%', minHeight: 56, resize: 'vertical', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)' }}
      />
      <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={`color ${c}`}
            onClick={() => onSetColor(annotation.id, c)}
            style={{
              width: 18,
              height: 18,
              background: c,
              border: annotation.color === c ? '2px solid var(--fg)' : '1px solid var(--border)',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          />
        ))}
      </div>
      {showPin && (
        <div style={{ margin: '6px 0' }}>
          <button
            aria-label={isPinned ? 'Unpin passage' : 'Pin passage'}
            onClick={onTogglePin}
            disabled={pinDisabled}
            title={pinDisabled ? '3 pin maximum' : undefined}
            style={{
              width: '100%',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              color: 'var(--warn)',
              background: isPinned ? 'var(--surface-2)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: pinDisabled ? 'not-allowed' : 'pointer',
              opacity: pinDisabled ? 0.5 : 1
            }}
          >
            <><Icon name="pin" size={13} /> {isPinned ? 'Unpin' : 'Pin'}</>
          </button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => onDelete(annotation.id)}>Delete</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
