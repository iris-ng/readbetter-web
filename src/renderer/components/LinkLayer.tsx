import { type JSX, useState } from 'react'

export type Pt = { x: number; y: number }
export type RenderedLink = { id: string; from: Pt | null; to: Pt | null }

function curve(a: Pt, b: Pt): string {
  const mx = (a.x + b.x) / 2
  return `M ${a.x} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`
}

export function LinkLayer({
  links,
  selectedId,
  onNavigate,
  onSelect,
  onRemoveRequest
}: {
  links: RenderedLink[]
  selectedId: string | null
  onNavigate: (id: string, toEnd: 'from' | 'to' | 'both') => void
  onSelect: (id: string) => void
  onRemoveRequest?: (id: string, pos: { clientX: number; clientY: number }) => void
}): JSX.Element {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handleArcClick = (e: React.MouseEvent<SVGPathElement>, link: RenderedLink) => {
    e.stopPropagation()
    onNavigate(link.id, 'both')
    onSelect(link.id)
  }

  const handleDotClick = (
    e: React.MouseEvent<SVGCircleElement>,
    link: RenderedLink,
    end: 'from' | 'to'
  ) => {
    e.stopPropagation()
    const otherEnd = end === 'from' ? 'to' : 'from'
    onNavigate(link.id, otherEnd)
    onSelect(link.id)
  }

  const handleContextMenu = (
    e: React.MouseEvent<SVGCircleElement | SVGPathElement>,
    link: RenderedLink
  ) => {
    e.stopPropagation()
    if (onRemoveRequest) {
      onRemoveRequest(link.id, { clientX: e.clientX, clientY: e.clientY })
    }
  }

  return (
    <svg
      data-testid="link-layer"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11, overflow: 'visible' }}
    >
      {/* Pass 1 — arcs layer: hit-path + visible arc for every link.
          Rendered first so all arc hit-paths are below all dots in document order. */}
      {links.map((l) => {
        const selected = l.id === selectedId
        const hovered = l.id === hoveredId
        const arcPath = l.from !== null && l.to !== null ? curve(l.from, l.to) : null
        if (arcPath === null) return null
        return (
          <g key={`arc-${l.id}`}>
            {/* Wide transparent hit path for easy mouse targeting — no testid needed */}
            <path
              d={arcPath}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => handleArcClick(e, l)}
              onContextMenu={(e) => handleContextMenu(e, l)}
              onMouseEnter={() => setHoveredId(l.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
            {/* Visible arc — carries testid, data-selected, data-hovered, and all handlers */}
            <path
              data-testid={`link-arc-${l.id}`}
              data-selected={selected ? 'true' : undefined}
              data-hovered={hovered ? 'true' : undefined}
              d={arcPath}
              fill="none"
              stroke="var(--ink-connection, rgba(60,60,90,0.5))"
              strokeWidth={hovered || selected ? 5 : 2.5}
              strokeOpacity={hovered || selected ? 0.95 : 0.5}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => handleArcClick(e, l)}
              onContextMenu={(e) => handleContextMenu(e, l)}
              onMouseEnter={() => setHoveredId(l.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          </g>
        )
      })}
      {/* Pass 2a — dot hit halos: a transparent enlarged target (r16) under every visible dot, so a
          near-miss still triggers the link (the visible dot is only r9). Painted before all visible
          dots (Pass 2b) so a dot is never hijacked by a neighbour's halo — mirrors the arc/dot order. */}
      {links.map((l) => (
        <g key={`dot-hit-${l.id}`}>
          {l.from !== null && (
            <circle
              cx={l.from.x}
              cy={l.from.y}
              r={16}
              fill="transparent"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={(e) => handleDotClick(e, l, 'from')}
              onContextMenu={(e) => handleContextMenu(e, l)}
            />
          )}
          {l.to !== null && (
            <circle
              cx={l.to.x}
              cy={l.to.y}
              r={16}
              fill="transparent"
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={(e) => handleDotClick(e, l, 'to')}
              onContextMenu={(e) => handleContextMenu(e, l)}
            />
          )}
        </g>
      ))}
      {/* Pass 2b — visible dots: painted last so every dot sits above every halo and arc hit-path,
          and its click is never hijacked by a neighbour's halo or a later link's wide arc hit-path. */}
      {links.map((l) => {
        const selected = l.id === selectedId
        return (
          <g key={`dot-${l.id}`}>
            {l.from !== null && (
              <circle
                data-testid={`link-dot-${l.id}-from`}
                cx={l.from.x}
                cy={l.from.y}
                r={selected ? 11 : 9}
                fill="var(--ink-connection, rgba(60,60,90,0.5))"
                opacity={selected ? 0.95 : 0.7}
                data-selected={selected ? 'true' : undefined}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={(e) => handleDotClick(e, l, 'from')}
                onContextMenu={(e) => handleContextMenu(e, l)}
              />
            )}
            {l.to !== null && (
              <circle
                data-testid={`link-dot-${l.id}-to`}
                cx={l.to.x}
                cy={l.to.y}
                r={selected ? 11 : 9}
                fill="var(--ink-connection, rgba(60,60,90,0.5))"
                opacity={selected ? 0.95 : 0.7}
                data-selected={selected ? 'true' : undefined}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={(e) => handleDotClick(e, l, 'to')}
                onContextMenu={(e) => handleContextMenu(e, l)}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
