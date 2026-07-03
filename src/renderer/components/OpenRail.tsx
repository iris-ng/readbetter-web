import { useRef, type JSX } from 'react'
import type { Tab, ActiveView } from '../hooks/useTabs'
import { Icon } from './Icon'
import './OpenRail.css'

export function OpenRail({
  tabs, active, shownIds, paneOf,
  onFocusTab, onAssignPane, onCloseTab, onQuickPick,
  pinned, width, onTogglePin, onSetWidth
}: {
  tabs: Tab[]
  active: ActiveView
  shownIds: string[]
  paneOf: (id: string) => number
  onFocusTab: (id: string) => void
  onAssignPane: (id: string) => void
  onCloseTab: (id: string) => void
  onQuickPick?: () => void
  pinned: boolean
  width: number
  onTogglePin: () => void
  onSetWidth: (px: number) => void
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const isShown = (id: string): boolean => shownIds.includes(id)
  // Trackpad-first: a plain click on a PARKED tab assigns it to a pane; a SHOWN tab focuses.
  const activate = (id: string): void => { if (!isShown(id)) onAssignPane(id); else onFocusTab(id) }

  const beginResize = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const root = rootRef.current
    const target = e.currentTarget
    target.setPointerCapture?.(e.pointerId)
    root?.setAttribute('data-resizing', 'true')
    const left = root?.getBoundingClientRect().left ?? 0
    const move = (ev: PointerEvent): void => onSetWidth(ev.clientX - left)
    const up = (): void => {
      root?.removeAttribute('data-resizing')
      target.releasePointerCapture?.(e.pointerId)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={rootRef}
      data-testid="open-rail"
      className="rb-rail-root"
      data-pinned={pinned ? 'true' : undefined}
      style={{ ['--rb-rail-w' as string]: `${width}px` }}
    >
      <div className="rb-rail-edge" data-testid="rail-edge" title="Open documents" />
      <aside className="rb-rail rb-glass" aria-label="Open documents">
        <div className="rb-rail-head">
          <span className="rb-rail-title">Open</span>
          <button
            data-testid="rail-pin"
            className="rb-rail-pin"
            aria-label={pinned ? 'Unpin the rail' : 'Pin the rail open'}
            aria-pressed={pinned}
            title={pinned ? 'Unpin — let the rail auto-hide' : 'Pin the rail open'}
            onClick={onTogglePin}
          >
            {pinned ? '📌' : '📍'}
          </button>
        </div>
        <ul className="rb-rail-list">
          {tabs.map((t) => {
            const on = active.view === 'tab' && active.id === t.id
            const shown = isShown(t.id)
            return (
              <li
                key={t.id}
                className="rb-rail-item"
                data-active={on ? 'true' : undefined}
                data-pane-index={shown ? paneOf(t.id) : undefined}
                data-parked={!shown ? 'true' : undefined}
              >
                <button
                  className="rb-rail-open"
                  onClick={() => activate(t.id)}
                  data-active={on ? 'true' : undefined}
                  data-pane-index={shown ? paneOf(t.id) : undefined}
                  data-parked={!shown ? 'true' : undefined}
                >
                  <span className="rb-rail-glyph" aria-hidden>
                    {t.kind === 'canvas' ? '◇' : (t.title[0] ?? '?').toUpperCase()}
                  </span>
                  {t.title}
                </button>
                <button className="rb-rail-close" aria-label={`Close ${t.title}`} onClick={() => onCloseTab(t.id)}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            )
          })}
        </ul>
        {onQuickPick && (
          <div className="rb-rail-foot">
            <div className="rb-rail-sep" />
            <ul className="rb-rail-list">
              <li className="rb-rail-item">
                <button className="rb-rail-open rb-rail-new" aria-label="Open" title="Open a document or canvas" onClick={onQuickPick}>
                  <span className="rb-rail-glyph" aria-hidden>+</span>
                  Open / New…
                </button>
              </li>
            </ul>
          </div>
        )}
        <div
          className="rb-rail-resizer"
          data-testid="rail-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize rail"
          title="Drag to resize"
          onPointerDown={beginResize}
        />
      </aside>
      <div className="rb-rail-backdrop" />
    </div>
  )
}
