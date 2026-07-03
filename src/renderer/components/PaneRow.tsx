import { Fragment, useEffect, useRef, useState, type JSX } from 'react'
import type { Pane as PaneModel } from '../hooks/usePanes'
import { LinkLayer, type RenderedLink } from './LinkLayer'

/** The single workspace row: ordered panes with hairline dividers and ONE LinkLayer overlay.
 *  `renderPane` is injected so the row stays presentational (App builds each <Pane/>). The divider
 *  drag is a session-only enhancement; panes are equal-flex and fully usable without it. */
export function PaneRow({
  panes,
  renderedLinks,
  selectedLinkId,
  paneRowRef,
  renderPane,
  onBackgroundClick,
  onLinkNavigate,
  onLinkSelect,
  onLinkRemoveRequest
}: {
  panes: PaneModel[]
  renderedLinks: RenderedLink[]
  selectedLinkId: string | null
  paneRowRef: React.RefObject<HTMLDivElement>
  renderPane: (pane: PaneModel) => JSX.Element
  onBackgroundClick: () => void
  onLinkNavigate: (id: string, toEnd: 'from' | 'to' | 'both') => void
  onLinkSelect: (id: string) => void
  onLinkRemoveRequest: (id: string, pos: { clientX: number; clientY: number }) => void
}): JSX.Element {
  // Session-only flex weights, reset to equal whenever the pane count changes.
  const [weights, setWeights] = useState<number[]>([])
  useEffect(() => { setWeights(panes.map(() => 1)) }, [panes.length])

  // Holds the cleanup function for any in-progress divider drag so unmount can remove window listeners.
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { cleanupRef.current?.() }, [])

  // Drag the divider before pane (i+1): re-proportion panes[i] / panes[i+1] within their shared sum.
  const beginResize = (i: number) => (e: React.PointerEvent<HTMLDivElement>): void => {
    const row = paneRowRef.current
    if (!row) return
    e.preventDefault()
    const startX = e.clientX
    const total = row.getBoundingClientRect().width || 1
    const base = weights.length === panes.length ? weights.slice() : panes.map(() => 1)
    const a = base[i] ?? 1
    const b = base[i + 1] ?? 1
    const sum = a + b
    const move = (ev: PointerEvent): void => {
      const dx = ((ev.clientX - startX) / total) * panes.length
      const na = Math.max(0.2, Math.min(sum - 0.2, a + dx))
      const next = base.slice()
      next[i] = na
      next[i + 1] = sum - na
      setWeights(next)
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

  return (
    <div
      ref={paneRowRef}
      data-testid="pane-row"
      style={{ position: 'relative', display: 'flex', flex: 1, minWidth: 0, minHeight: 0, isolation: 'isolate' }}
      onClick={onBackgroundClick}
    >
      {panes.map((p, i) => (
        <Fragment key={p.tabId}>
          {i > 0 && (
            <div
              data-testid={`pane-divider-${i}`}
              onPointerDown={beginResize(i - 1)}
              style={{ width: 1, cursor: 'col-resize', background: 'var(--border)', flex: '0 0 auto' }}
            />
          )}
          <div style={{ flex: weights[i] ?? 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {renderPane(p)}
          </div>
        </Fragment>
      ))}
      <LinkLayer
        links={renderedLinks}
        selectedId={selectedLinkId}
        onNavigate={onLinkNavigate}
        onSelect={onLinkSelect}
        onRemoveRequest={onLinkRemoveRequest}
      />
    </div>
  )
}
