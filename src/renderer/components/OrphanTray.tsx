import type { JSX } from 'react'
import { Annotation } from '../../core/sidecar/sidecar'

export function OrphanTray({
  orphans,
  reattachingId,
  onBeginReattach,
  onCancelReattach,
  onDismiss
}: {
  orphans: Annotation[]
  reattachingId: string | null
  onBeginReattach: (id: string) => void
  onCancelReattach: () => void
  onDismiss: (id: string) => void
}): JSX.Element | null {
  if (orphans.length === 0) return null
  return (
    <aside
      aria-label="Orphaned annotations"
      style={{ borderTop: '1px solid var(--border)', padding: 12, background: 'var(--surface-2)', maxHeight: 200, overflowY: 'auto' }}
    >
      <strong style={{ fontSize: 13 }}>Orphaned annotations ({orphans.length})</strong>
      {orphans.map((o) => {
        const reattaching = reattachingId === o.id
        return (
          <div key={o.id} style={{ marginTop: 8, fontSize: 13 }}>
            <span className="rb-pill rb-pill--warn">drifted</span>
            <div style={{ color: 'var(--muted)', marginTop: 4 }}>
              …{o.anchor.prefix}
              <span style={{ background: o.color }}>{o.anchor.exact}</span>
              {o.anchor.suffix}…
            </div>
            {o.note && <div style={{ fontStyle: 'italic' }}>{o.note}</div>}
            {reattaching ? (
              <div>
                <span>Select the new location in the document…</span>{' '}
                <button onClick={onCancelReattach}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onBeginReattach(o.id)}>Re-attach</button>
                <button onClick={() => onDismiss(o.id)}>Dismiss</button>
              </div>
            )}
          </div>
        )
      })}
    </aside>
  )
}
