import type { JSX } from 'react'
import { PinnedRange } from '../../core/compare/squeeze'

/**
 * The collapsed/expanded span between pinned passages in Compare Mode. Renders the *raw text*
 * of each unpinned range (the gap is a stretch of document, not whole sections). Collapsed it
 * is a single summary button; expanded it shows each range's text with a collapse control.
 * Expansion state is owned by the Reader (keyed by the gap's first range start).
 */
export function GapBand({
  ranges,
  documentText,
  expanded,
  onToggle
}: {
  ranges: PinnedRange[]
  documentText: string
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  if (ranges.length === 0) return <></>
  // A gap is a contiguous stretch of unpinned document; describe it by how much text is hidden
  // (counting ranges would be misleading — planCompare emits one contiguous range per gap).
  const chars = ranges.reduce((n, r) => n + (r.end - r.start), 0)
  const label = `${chars} characters hidden`

  if (!expanded) {
    return (
      <button
        data-testid="gap-band"
        onClick={onToggle}
        aria-expanded={false}
        aria-label={`Expand hidden text: ${label}`}
        style={{
          display: 'block',
          width: '100%',
          margin: '8px 0',
          padding: 6,
          border: '1px dashed var(--border)',
          borderRadius: 4,
          background: 'var(--surface-2)',
          color: 'var(--muted)',
          font: '12px system-ui, sans-serif',
          cursor: 'pointer'
        }}
      >
        ⋯ {label} · click to expand ⋯
      </button>
    )
  }

  return (
    // Keep the stable `gap-band` testid in BOTH states so "is a gap present" checks survive expansion.
    <div data-testid="gap-band" data-expanded="true">
      <button
        onClick={onToggle}
        aria-expanded={true}
        aria-label={`Collapse hidden text: ${label}`}
        style={{
          display: 'block',
          width: '100%',
          margin: '8px 0',
          padding: 4,
          border: 'none',
          background: 'transparent',
          color: 'var(--muted)',
          font: '12px system-ui, sans-serif',
          cursor: 'pointer'
        }}
      >
        ▴ collapse ▴
      </button>
      {ranges.map((r) => (
        <p
          key={r.start}
          data-testid={`gap-range-${r.start}`}
          style={{ whiteSpace: 'pre-wrap', margin: '4px 0', font: '14px/1.5 system-ui, sans-serif', color: 'var(--muted)' }}
        >
          {documentText.slice(r.start, r.end)}
        </p>
      ))}
    </div>
  )
}
