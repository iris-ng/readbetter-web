import type { JSX } from 'react'
import { NoteCard as NoteCardModel } from '../../core/canvas/canvas'

export function NoteCard({
  card,
  onSetNote,
  onPointerDownDrag
}: {
  card: NoteCardModel
  onSetNote: (note: string) => void
  onPointerDownDrag: (e: React.PointerEvent) => void
}): JSX.Element {
  return (
    <div
      data-testid={`card-${card.id}`}
      onPointerDown={onPointerDownDrag}
      className="rb-card"
      style={{ width: card.w ?? 200, height: card.h, display: 'flex', flexDirection: 'column', background: 'var(--surface-2)', overflow: 'hidden' }}
    >
      {/* The textarea fills the card and swallows pointer-down for text editing, so this strip is
          the card's grab surface; pointer-down here bubbles to the outer card-drag gesture. */}
      <div
        title="Drag to move"
        style={{ flex: '0 0 auto', height: 14, cursor: 'grab', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      />
      <textarea
        value={card.note}
        onChange={(e) => onSetNote(e.target.value)}
        placeholder="Note…"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ flex: '1 1 auto', width: '100%', border: 'none', background: 'transparent', padding: '8px', font: '14px system-ui', resize: 'vertical', minHeight: 48, boxSizing: 'border-box' }}
      />
    </div>
  )
}
