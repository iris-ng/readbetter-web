import { useRef, useEffect, useState, type JSX } from 'react'
import { Icon } from './Icon'
import { CanvasModel, Viewport } from '../../core/canvas/canvas'
import { ExcerptCard } from './ExcerptCard'
import { NoteCard } from './NoteCard'
import { CardFrame } from './CardFrame'
import type { Side } from '../canvas/connectionGeometry'
import { sideMidpoint } from '../canvas/connectionGeometry'
import { ConnectionsLayer, connectionViews, type ConnView } from './ConnectionsLayer'

export interface CanvasStudioProps {
  canvas: CanvasModel
  onMoveCard: (id: string, x: number, y: number) => void
  onCreateNote: (point: { x: number; y: number }) => void
  onSetNote: (id: string, note: string) => void
  onCardClick: (id: string) => void
  onSetViewport: (v: Viewport) => void
  onRemoveCard: (id: string) => void
  onResizeCard: (id: string, w: number, h: number) => void
  onAddConnection: (from: string, to: string) => void
  onRemoveConnection: (from: string, to: string) => void
  onSetConnectionLabel: (from: string, to: string, label: string) => void
  /** Returns the live annotation color for a card when its source is open in the same window. */
  colorFor?: (card: import('../../core/canvas/canvas').ExcerptCard) => string | undefined
  previewUrlFor?: (card: import('../../core/canvas/canvas').ExcerptCard) => string | undefined
}

export function CanvasStudio(props: CanvasStudioProps): JSX.Element {
  const { canvas, onMoveCard, onCreateNote, onSetNote, onCardClick, onSetViewport, onRemoveCard, onResizeCard, onAddConnection, onRemoveConnection, onSetConnectionLabel, colorFor, previewUrlFor } = props
  const boardRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<HTMLDivElement>(null)
  // True while a card drag actually moved, so the click that follows a drag does not also
  // trigger the card's back-link navigation.
 const draggedRef = useRef(false)
 const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  // Cleanup for an in-progress drag, invoked on unmount so window listeners never leak.
 const cleanupRef = useRef<(() => void) | null>(null)
 useEffect(() => () => cleanupRef.current?.(), [])
 useEffect(() => {
  if (!selectedCardId) return
  const onKey = (e: KeyboardEvent): void => {
   const target = e.target as HTMLElement | null
   if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
   if (e.key !== 'Delete' && e.key !== 'Backspace') return
   e.preventDefault()
   onRemoveCard(selectedCardId)
   setSelectedCardId(null)
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
 }, [selectedCardId, onRemoveCard])
 const { x, y, zoom } = canvas.viewport

  const sizes = useRef(new Map<string, { w: number; h: number }>())
  const elemId = useRef(new WeakMap<Element, string>())
 const [, bump] = useState(0)
 const [rubber, setRubber] = useState<{ path: string } | null>(null)
  // Create the observer lazily during render so it exists before the card ref callbacks fire
  // on the first mount — an effect runs after commit and would miss the initially-rendered cards.
  const roRef = useRef<ResizeObserver | null>(null)
  if (roRef.current === null && typeof ResizeObserver !== 'undefined') {
    roRef.current = new ResizeObserver((entries) => {
      let changed = false
      for (const ent of entries) {
        const id = elemId.current.get(ent.target)
        if (!id) continue
        const el = ent.target as HTMLElement
        const w = el.offsetWidth
        const h = el.offsetHeight
        const prev = sizes.current.get(id)
        if (!prev || prev.w !== w || prev.h !== h) {
          sizes.current.set(id, { w, h })
          changed = true
        }
      }
      if (changed) bump((n) => n + 1)
    })
  }
  useEffect(() => () => roRef.current?.disconnect(), [])

  const registerCard = (id: string) => (el: HTMLDivElement | null): void => {
    const ro = roRef.current
    if (!el) {
      // Card unmounted (e.g. deleted): evict its measurement so the size store can't grow
      // unbounded and a recycled id can never read a stale box.
      sizes.current.delete(id)
      return
    }
    elemId.current.set(el, id)
    sizes.current.set(id, { w: el.offsetWidth, h: el.offsetHeight })
    ro?.observe(el)
  }

  // A card's box in board space: explicit/default width, measured (or fallback) height.
  const boxFor = (card: { id: string; x: number; y: number; kind: string; w?: number }) => {
    const measured = sizes.current.get(card.id)
    const w = card.w ?? measured?.w ?? (card.kind === 'note' ? 200 : 240)
    const h = measured?.h ?? 80
    return { x: card.x, y: card.y, w, h }
  }

  const toBoard = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = boardRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return { x: (clientX - rect.left - x) / zoom, y: (clientY - rect.top - y) / zoom }
  }

  const startCardDrag = (id: string) => (e: React.PointerEvent): void => {
    e.stopPropagation()
    const card = canvas.cards.find((c) => c.id === id)
    if (!card) return
    draggedRef.current = false
    const origin = toBoard(e.clientX, e.clientY)
    const dx = origin.x - card.x
    const dy = origin.y - card.y
    const move = (ev: PointerEvent): void => {
      draggedRef.current = true
      const p = toBoard(ev.clientX, ev.clientY)
      onMoveCard(id, Math.round(p.x - dx), Math.round(p.y - dy))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      cleanupRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    cleanupRef.current = up
  }

  const handleCardClick = (id: string) => (): void => {
 if (draggedRef.current) {
 draggedRef.current = false
 return
 }
 setSelectedCardId(id)
 onCardClick(id)
 }

  const startResize = (id: string, e: React.PointerEvent): void => {
    const start = toBoard(e.clientX, e.clientY)
    const box = boxFor(canvas.cards.find((c) => c.id === id)!)
    const move = (ev: PointerEvent): void => {
      const p = toBoard(ev.clientX, ev.clientY)
      onResizeCard(id, box.w + (p.x - start.x), box.h + (p.y - start.y))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      cleanupRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    cleanupRef.current = up
  }

  const startConnect = (id: string, side: Side, _e: React.PointerEvent): void => {
    const box = boxFor(canvas.cards.find((c) => c.id === id)!)
    const origin = sideMidpoint(box, side)
    const move = (ev: PointerEvent): void => {
      const p = toBoard(ev.clientX, ev.clientY)
      setRubber({ path: `M ${origin.x} ${origin.y} L ${p.x} ${p.y}` })
    }
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      cleanupRef.current = null
      setRubber(null)
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const card = el?.closest('[data-card-id]') as HTMLElement | null
      const targetId = card?.dataset.cardId
      if (targetId && targetId !== id) onAddConnection(id, targetId)
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setRubber(null) // drop the rubber-band if the drag is torn down mid-flight (e.g. unmount)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    cleanupRef.current = cleanup
  }

  const startPan = (e: React.PointerEvent): void => {
    // Pan only when grabbing empty board space — the board itself OR its transform surface
    // (the inner div covers the board, so it, not boardRef, is the real empty-space target).
 if (e.target !== boardRef.current && e.target !== transformRef.current) return
 setSelectedCardId(null)
    const sx = e.clientX
    const sy = e.clientY
    const ox = x
    const oy = y
    const move = (ev: PointerEvent): void => onSetViewport({ x: ox + (ev.clientX - sx), y: oy + (ev.clientY - sy), zoom })
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      cleanupRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    cleanupRef.current = up
  }

  const onWheel = (e: React.WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const rect = boardRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const cursor = toBoard(e.clientX, e.clientY)
    const next = Math.min(2.5, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.1 : 0.9)))
    // Keep the board point under the cursor fixed while zooming.
    onSetViewport({ x: e.clientX - rect.left - cursor.x * next, y: e.clientY - rect.top - cursor.y * next, zoom: next })
  }

  const boxes = new Map(canvas.cards.map((c) => [c.id, boxFor(c)]))
  const views = connectionViews(canvas.connections, boxes)

  return (
    <div
      ref={boardRef}
      data-testid="canvas-board"
      onPointerDown={startPan}
      onDoubleClick={(e) => {
        if (e.target === boardRef.current || e.target === transformRef.current)
          onCreateNote(toBoard(e.clientX, e.clientY))
      }}
      onWheel={onWheel}
      style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', background: 'var(--bg)', cursor: 'grab' }}
    >
      <div
        ref={transformRef}
        data-testid="canvas-surface"
        style={{ position: 'absolute', inset: 0, transform: `translate(${x}px, ${y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <ConnectionsLayer views={views} rubber={rubber} />
        {canvas.cards.map((card) => (
 <div key={card.id} style={{ position: 'absolute', left: card.x, top: card.y }} onPointerDownCapture={() => setSelectedCardId(card.id)}>
            <CardFrame
              id={card.id}
              registerRef={registerCard(card.id)}
              onStartConnect={(side, e) => startConnect(card.id, side, e)}
              onResizeStart={(e) => startResize(card.id, e)}
 onDelete={() => {
 setSelectedCardId((id) => (id === card.id ? null : id))
 onRemoveCard(card.id)
 }}
 selected={selectedCardId === card.id}
>
              {card.kind === 'excerpt' ? (
                <ExcerptCard card={card} liveColor={colorFor?.(card)} previewUrl={previewUrlFor?.(card)} onClick={handleCardClick(card.id)} onSetNote={(n) => onSetNote(card.id, n)} onPointerDownDrag={startCardDrag(card.id)} />
              ) : (
                <NoteCard card={card} onSetNote={(n) => onSetNote(card.id, n)} onPointerDownDrag={startCardDrag(card.id)} />
              )}
            </CardFrame>
          </div>
        ))}
        {views.map((v) => (
          <ConnectionLabel
            key={`lbl-${v.connection.from}-${v.connection.to}`}
            view={v}
            onSetLabel={(label) => onSetConnectionLabel(v.connection.from, v.connection.to, label)}
            onRemove={() => onRemoveConnection(v.connection.from, v.connection.to)}
          />
        ))}
      </div>
    </div>
  )
}

function ConnectionLabel({
  view,
  onSetLabel,
  onRemove
}: {
  view: ConnView
  onSetLabel: (label: string) => void
  onRemove: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(view.connection.label ?? '')
  // Keep the draft in sync with the model when not actively editing, so an externally-changed
  // label (e.g. a different value flowing back in) doesn't leave a stale draft on the next edit.
  useEffect(() => {
    if (!editing) setDraft(view.connection.label ?? '')
  }, [view.connection.label, editing])
  return (
    <div
      style={{ position: 'absolute', left: view.mid.x, top: view.mid.y, transform: 'translate(-50%, -50%)', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 2, font: '11px system-ui' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {editing ? (
        <input
          aria-label="Connection label"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onSetLabel(draft.trim())
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{ width: 90, font: '11px system-ui', border: '1px solid var(--accent)', borderRadius: 4, padding: '0 4px' }}
        />
      ) : (
        <button
          aria-label="Edit connection label"
          onClick={() => setEditing(true)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px', color: view.connection.label ? 'var(--fg)' : 'var(--muted)', cursor: 'pointer', font: '11px system-ui' }}
        >
          {view.connection.label || '+ label'}
        </button>
      )}
      <button
        aria-label="Delete connection"
        onClick={onRemove}
        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
