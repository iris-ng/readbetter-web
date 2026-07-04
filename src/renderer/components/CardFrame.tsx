import { useState, type JSX, type ReactNode } from 'react'
import { Icon } from './Icon'
import type { Side } from '../canvas/connectionGeometry'

const PORTS: { side: Side; style: React.CSSProperties }[] = [
  { side: 'top', style: { top: 0, left: '50%' } },
  { side: 'right', style: { top: '50%', left: '100%' } },
  { side: 'bottom', style: { top: '100%', left: '50%' } },
  { side: 'left', style: { top: '50%', left: 0 } }
]

export function CardFrame({
  id,
  children,
  registerRef,
  onStartConnect,
  onResizeStart,
  onDelete,
  selected = false
}: {
  id: string
  children: ReactNode
  registerRef: (el: HTMLDivElement | null) => void
  onStartConnect: (side: Side, e: React.PointerEvent) => void
  onResizeStart: (e: React.PointerEvent) => void
  onDelete: () => void
  selected?: boolean
}): JSX.Element {
  // Affordances (ports, resize grip, delete) stay hidden until the card is hovered, so a card at
  // rest reads as just its content. Hovering a descendant (a port sits visually outside the card
  // box but is a DOM child) keeps the card "entered", so the controls don't flicker.
  const [hovered, setHovered] = useState(false)
  return (
    <div
      ref={registerRef}
      data-card-id={id}
    style={{ position: 'relative', outline: selected ? '2px solid var(--accent)' : undefined, outlineOffset: selected ? 3 : undefined }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {children}
      {hovered && (
        <>
      <button
        aria-label="Delete card"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          width: 18,
          height: 18,
          lineHeight: '16px',
          fontSize: 11,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--muted)',
          cursor: 'pointer',
          padding: 0
        }}
      >
        <Icon name="close" size={14} />
      </button>
      {PORTS.map(({ side, style }) => (
        <div
          key={side}
          data-testid={`port-${id}-${side}`}
          onPointerDown={(e) => {
            e.stopPropagation()
            onStartConnect(side, e)
          }}
          style={{
            position: 'absolute',
            ...style,
            transform: 'translate(-50%, -50%)',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--surface-2)',
            border: '1px solid var(--accent)',
            cursor: 'crosshair'
          }}
        />
      ))}
      <div
        data-testid={`resize-${id}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          onResizeStart(e)
        }}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 12,
          height: 12,
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, var(--muted) 50%)'
        }}
      />
        </>
      )}
    </div>
  )
}
