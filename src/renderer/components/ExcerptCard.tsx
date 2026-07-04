import type { JSX } from 'react'
import { ExcerptCard as ExcerptCardModel } from '../../core/canvas/canvas'

export function ExcerptCard({
  card,
  liveColor,
  previewUrl,
  onClick,
  onSetNote,
  onPointerDownDrag
}: {
  card: ExcerptCardModel
  liveColor?: string
  previewUrl?: string
  onClick: () => void
  onSetNote: (note: string) => void
  onPointerDownDrag: (e: React.PointerEvent) => void
}): JSX.Element {
  const title = card.source.split('/').pop() ?? card.source
  // liveColor overrides the cached card.color when the source annotation is open in the same window.
  const tint = liveColor ?? card.color
  // The full highlight color is a bright pastel — painting it solid behind the title made the header
  // garish and, in dark mode, swallowed the var(--fg) text. Use a SOFT WASH of the color over the
  // surface for the header (title stays readable in both themes); carry the full color identity on
  // the left edge instead. Untinted cards keep their structural tokens.
  const headerBg = tint ? `color-mix(in srgb, ${tint} 24%, var(--surface))` : 'color-mix(in srgb, var(--accent) 12%, var(--surface))'
  const edge = tint ?? 'var(--accent)'
  // When the user has resized the card (h set) it renders at that fixed height with the snapshot
  // scrolling inside; otherwise it is content-sized. Width follows card.w (default 240).
  const sized = card.h !== undefined
  const imageUrl = previewUrl ?? card.previewDataUrl
  return (
    <div
      data-testid={`card-${card.id}`}
      onPointerDown={onPointerDownDrag}
      onClick={onClick}
      className="rb-card"
      style={{ width: card.w ?? 240, height: card.h, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-md)', overflow: 'hidden', cursor: 'pointer' }}
    >
      <div title="Open source" style={{ flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: headerBg, padding: '6px 8px', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', fontFamily: 'var(--font-sans)', color: 'var(--fg)' }}>
 {title}
 </div>
      {imageUrl && (
        <img
          src={imageUrl}
 alt=""
 style={{
 flex: '0 0 auto',
 display: 'block',
 width: '100%',
 maxHeight: sized ? 120 : 180,
 objectFit: 'contain',
 background: '#fff',
 borderBottom: '1px solid var(--border)'
 }}
 />
 )}
 <blockquote style={{ flex: sized ? '1 1 auto' : '0 0 auto', minHeight: 0, overflow: sized ? 'auto' : 'visible', margin: 0, padding: '8px', borderLeft: `3px solid ${edge}`, fontSize: 'var(--text-base)', lineHeight: 'var(--leading-normal)', fontFamily: 'var(--font-sans)', color: 'var(--fg)', whiteSpace: 'pre-wrap' }}>
        {card.snapshot}
      </blockquote>
      <textarea
        value={card.note}
        onChange={(e) => onSetNote(e.target.value)}
        placeholder="Add a note…"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ flex: '0 0 auto', width: '100%', border: 'none', borderTop: '1px solid var(--border)', padding: '6px 8px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', resize: 'vertical', minHeight: 28, boxSizing: 'border-box' }}
      />
    </div>
  )
}
