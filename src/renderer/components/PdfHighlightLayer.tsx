import type { JSX } from 'react'
import type { Quad } from '../../core/anchor/anchor'

export interface HighlightBox {
  id: string
  color: string
  quad: Quad
  /** True for the currently-active search match: rendered with a solid wash + accent outline. */
  active?: boolean
}

/**
 * Visual-only highlight rects for one page, scaled by the same factor as the text overlay.
 * `pointerEvents: none` so highlights never block text selection; clicks to open a highlight
 * are detected on the selectable text layer above (see PdfPageView).
 */
export function PdfHighlightLayer({ boxes, zoom }: { boxes: HighlightBox[]; zoom: number }): JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {boxes.map((b, i) => (
        <div
          key={`${b.id}-${i}`}
          data-testid="pdf-highlight"
          data-annotation-id={b.id}
          data-search-active={b.active ? 'true' : undefined}
          style={{
            position: 'absolute',
            left: b.quad.x * zoom,
            top: b.quad.y * zoom,
            width: b.quad.w * zoom,
            height: b.quad.h * zoom,
            background: b.color,
            // Always multiply so the wash reads like a highlighter over the (white) page raster
            // and never hides the glyphs beneath. The active hit is picked out by the accent ring,
            // not by an opaque fill (a 'normal' blend here made the active line unreadable).
            mixBlendMode: 'multiply',
            outline: b.active ? '2px solid var(--accent)' : undefined,
            pointerEvents: 'none'
          }}
        />
      ))}
    </div>
  )
}
