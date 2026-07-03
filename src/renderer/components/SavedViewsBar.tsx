import { useState } from 'react'
import type { JSX } from 'react'
import { SavedView } from '../../core/sidecar/sidecar'

export function SavedViewsBar({
  views,
  canSave,
  onSave,
  onRestore,
  onRename,
  onDelete
}: {
  views: SavedView[]
  canSave: boolean
  onSave: () => void
  onRestore: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}): JSX.Element | null {
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  if (views.length === 0 && !canSave) return null

  const commitRename = (): void => {
    if (editing && editing.name.trim()) onRename(editing.id, editing.name.trim())
    setEditing(null)
  }

  return (
    <aside
      role="region"
      aria-label="Saved views"
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        padding: '6px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface-2)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-sans)',
        flex: '0 0 auto'
      }}
    >
      <span style={{ color: 'var(--muted)' }}>Saved views:</span>
      {views.map((v) =>
        editing?.id === v.id ? (
          <input
            key={v.id}
            autoFocus
            aria-label="Rename view"
            value={editing.name}
            onChange={(e) => setEditing({ id: v.id, name: e.target.value })}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') setEditing(null)
            }}
            style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)', padding: 'var(--space-1) var(--space-2)' }}
          />
        ) : (
          <span key={v.id} className="rb-card" style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <button
              onClick={() => onRestore(v.id)}
              style={{ border: 'none', background: 'transparent', padding: '3px 8px', cursor: 'pointer', color: 'var(--fg)' }}
            >
              {v.name}
            </button>
            <button
              aria-label={`Rename ${v.name}`}
              onClick={() => setEditing({ id: v.id, name: v.name })}
              style={{ border: 'none', background: 'transparent', padding: '3px 6px', cursor: 'pointer', color: 'var(--muted)' }}
            >
              ✎
            </button>
            <button
              aria-label={`Delete ${v.name}`}
              onClick={() => onDelete(v.id)}
              style={{ border: 'none', background: 'transparent', padding: '3px 6px', cursor: 'pointer', color: 'var(--muted)' }}
            >
              ✕
            </button>
          </span>
        )
      )}
      <button
        onClick={onSave}
        disabled={!canSave}
        style={{
          border: '1px dashed var(--border)',
          borderRadius: 12,
          background: 'transparent',
          padding: '3px 8px',
          cursor: canSave ? 'pointer' : 'default',
          color: canSave ? 'var(--fg)' : 'var(--muted)'
        }}
      >
        <span aria-hidden="true">＋ </span>Save current
      </button>
    </aside>
  )
}
