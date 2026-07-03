import type { JSX } from 'react'
import { Icon } from './Icon'

/** The ONE slim pane header (replaces the split paneHeader IIFE, the satellite-header, and the
 *  docked-canvas header). Each optional control renders only when its handler is supplied. */
export function PaneHeader({
  title,
  onClose,
  onDetach,
  pinned,
  onTogglePin,
  searchActive,
  onToggleSearch,
  actions
}: {
  title: string
  onClose?: () => void // close pane (doc) or closes (canvas) per §5.5; omitted on satellite
  onDetach?: () => void // moves THIS pane's entity to its own window (was global)
  pinned?: boolean // canvas only
  onTogglePin?: () => void // canvas only — outline pin icon
  searchActive?: boolean // doc panes only
  onToggleSearch?: () => void // doc panes only — opens/closes search row
  actions?: JSX.Element // canvas extras: Obsidian / rename / delete
}): JSX.Element {
  const iconBtn: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--muted)',
    padding: '0 4px',
    display: 'inline-flex',
    alignItems: 'center'
  }
  return (
    <div
      data-testid="pane-header"
      className="rb-glass"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 8px',
        borderBottom: '1px solid var(--border)',
        font: '600 12px Inter, system-ui, sans-serif',
        color: 'var(--fg)',
        flex: '0 0 auto'
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {onToggleSearch && (
          <button
            aria-label="Search this document"
            aria-pressed={searchActive}
            title="Search this document (⌘F)"
            onClick={onToggleSearch}
            style={searchActive ? { ...iconBtn, color: 'var(--accent)' } : iconBtn}
          >
            <Icon name="search" size={15} />
          </button>
        )}
        {onTogglePin && (
          <button
            aria-label={pinned ? 'Unpin canvas' : 'Pin canvas'}
            aria-pressed={pinned}
            title={pinned ? 'Unpin — stop keeping this canvas in the rightmost pane' : 'Pin — keep this canvas in the rightmost pane'}
            onClick={onTogglePin}
            // Accent the icon when pinned so toggling is visible (otherwise the glyph is identical).
            style={pinned ? { ...iconBtn, color: 'var(--accent)' } : iconBtn}
          >
            <Icon name="pin" size={15} />
          </button>
        )}
        {actions}
        {onDetach && (
          <button aria-label="Detach pane" title="Move this pane into its own window" onClick={onDetach} style={iconBtn}>
            <Icon name="detach" size={14} />
          </button>
        )}
        {onClose && (
          <button aria-label="Close pane" title="Close this pane" onClick={onClose} style={{ ...iconBtn, padding: '0 6px' }}>
            <Icon name="close" size={14} />
          </button>
        )}
      </span>
    </div>
  )
}
