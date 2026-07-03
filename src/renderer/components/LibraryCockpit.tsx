import { useState, type JSX } from 'react'
import type { LibraryEntry, CanvasEntry } from '../platform'
import type { UseRecents } from '../hooks/useRecents'
import { buildDocTree, type TreeNode } from './docTree'
import { Icon } from './Icon'
import { useNarrow, CollapsibleControl } from './CollapsibleControl'

type Section = 'documents' | 'canvases' | 'trash'

function relTime(ms: number | null): string {
  if (ms === null) return 'not yet opened'
  const d = Date.now() - ms
  const h = Math.floor(d / 3_600_000)
  if (h < 1) return 'opened just now'
  if (h < 24) return `opened ${h}h ago`
  const days = Math.floor(h / 24)
  return days === 1 ? 'opened yesterday' : `opened ${days} days ago`
}

function folderContext(ref: string): string {
  const parts = ref.split('/')
  parts.pop()
  if (parts[0] === 'documents') parts.shift()
  return parts.join('/')
}

const pill = (on: boolean): React.CSSProperties => ({
  font: '600 13px var(--font-sans)',
  color: on ? 'var(--accent-contrast)' : 'var(--muted)',
  background: on ? 'var(--accent)' : 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  padding: '6px 13px',
  cursor: 'pointer',
  display: 'inline-flex',
  gap: 6,
  alignItems: 'center'
})

export function LibraryCockpit({
  documents,
  canvases,
  recents,
  onOpenDocument,
  onOpenCanvas,
  onNewCanvas,
  onRestoreCanvas
}: {
  documents: LibraryEntry[]
  canvases: CanvasEntry[]
  recents: UseRecents
  onOpenDocument: (ref: string) => void
  onOpenCanvas: (ref: string) => void
  onNewCanvas: () => void
  onRestoreCanvas: (ref: string) => void
}): JSX.Element {
  const [section, setSection] = useState<Section>('documents')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [titleRowRef, narrow] = useNarrow(480)
  const needle = query.trim().toLowerCase()
  const byRef = new Map(documents.map((d) => [d.ref, d]))
  const visibleDocs = needle
    ? documents.filter((d) => d.name.toLowerCase().includes(needle) || d.ref.toLowerCase().includes(needle))
    : documents
  const tree = buildDocTree(visibleDocs)
  const allActive = canvases.filter((c) => !c.deleted)
  const active = needle ? allActive.filter((c) => c.title.toLowerCase().includes(needle)) : allActive
  const trashed = canvases.filter((c) => c.deleted)
  const visibleTrashed = needle ? trashed.filter((c) => c.title.toLowerCase().includes(needle)) : trashed
  const showInput = !narrow || searchOpen

  const renderFile = (ref: string): JSX.Element | null => {
    const e = byRef.get(ref)
    if (!e) return null
    const s = recents.structure(ref)
    const context = folderContext(ref)
    return (
      <li key={ref} style={{ borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => onOpenDocument(ref)}
          style={{
            width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: 16,
            alignItems: 'center', padding: '13px 8px', border: 'none', background: 'transparent',
            cursor: 'pointer', textAlign: 'left'
          }}
        >
          <span>
              <span style={{ font: '600 15px var(--font-sans)', color: 'var(--fg)' }}>{e.name}</span>
              {context && <span style={{ display: 'block', font: '500 11px var(--font-sans)', color: 'var(--muted)', marginTop: 2 }}>{context}/</span>}
              <span style={{ display: 'block', font: '500 11px var(--font-sans)', color: 'var(--muted)', marginTop: 3 }}>
              {e.ext.toUpperCase()} · {relTime(recents.lastOpened(ref))}{s ? ` · ${s.sectionCount} sections` : ''}
            </span>
          </span>
          <span style={{ font: '700 9px var(--font-sans)', letterSpacing: '.09em', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 5, padding: '3px 7px' }}>
            {e.ext.toUpperCase()}
          </span>
        </button>
      </li>
    )
  }

  const renderNodes = (nodes: TreeNode[], depth: number): JSX.Element[] =>
    nodes.map((n) =>
      n.ref !== undefined ? (
        renderFile(n.ref) ?? <span key={`miss-${n.name}`} />
      ) : (
        <li key={`dir-${depth}-${n.name}`} style={{ listStyle: 'none' }}>
          <div style={{ font: '700 11px var(--font-sans)', letterSpacing: '.04em', color: 'var(--muted)', textTransform: 'uppercase', padding: '12px 8px 4px', marginLeft: depth * 12 }}>
            {n.name}/
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginLeft: depth * 12 }}>
            {renderNodes(n.children, depth + 1)}
          </ul>
        </li>
      )
    )

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '20px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div ref={titleRowRef} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ font: '800 22px var(--font-sans)', color: 'var(--fg)', margin: 0 }}>
              read<span style={{ color: 'var(--accent)' }}>better</span>
            </h2>
            <div style={{ font: '500 13px var(--font-sans)', color: 'var(--muted)', margin: '4px 0 0' }}>
              {documents.length} {documents.length === 1 ? 'document' : 'documents'} · {allActive.length} {allActive.length === 1 ? 'canvas' : 'canvases'}
            </div>
          </div>
          <div style={{ alignSelf: 'center' }}>
            {showInput ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
                <Icon name="search" size={15} />
                <input
                  aria-label="Search documents and canvases"
                  placeholder={`Search…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--fg)', font: '500 13px var(--font-sans)', outline: 'none', width: 160 }}
                />
              </span>
            ) : (
              <CollapsibleControl
                collapsed
                icon="search"
                label="Search"
                onClick={() => setSearchOpen(true)}
              />
            )}
          </div>
        </div>

        <div role="tablist" aria-label="Library sections" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button role="tab" aria-selected={section === 'documents'} style={pill(section === 'documents')} onClick={() => setSection('documents')}>Documents</button>
          <button role="tab" aria-selected={section === 'canvases'} style={pill(section === 'canvases')} onClick={() => setSection('canvases')}>Canvases</button>
          <button role="tab" aria-selected={section === 'trash'} style={pill(section === 'trash')} onClick={() => setSection('trash')}>
            Trash{trashed.length > 0 && <span style={{ font: '700 11px var(--font-sans)' }}>{trashed.length}</span>}
          </button>
        </div>

        {section === 'documents' && (
          documents.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No documents in your library yet.</p>
          ) : needle && visibleDocs.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No matches for {'“'}{query}{'”'}</p>
          ) : (
            <ul data-testid="library-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {renderNodes(tree, 0)}
            </ul>
          )
        )}

        {section === 'canvases' && (
          needle && active.length === 0 && allActive.length > 0 ? (
            <p style={{ color: 'var(--muted)' }}>No matches for {'“'}{query}{'”'}</p>
          ) : (
            <ul data-testid="canvas-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {active.map((c) => (
                <li key={c.ref}>
                  <button
                    onClick={() => onOpenCanvas(c.ref)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '14px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', font: '600 14px var(--font-sans)', color: 'var(--fg)' }}
                  >
                    <span aria-hidden style={{ color: 'var(--accent)' }}><Icon name="diamond" size={15} /></span>
                    {c.title}
                  </button>
                </li>
              ))}
              <li>
                <button
                  onClick={onNewCanvas}
                  style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', font: '600 14px var(--font-sans)' }}
                >
                  <span aria-hidden>+</span> New canvas
                </button>
              </li>
            </ul>
          )
        )}

        {section === 'trash' && (
          trashed.length === 0 ? (
            <p data-testid="canvas-trash" style={{ color: 'var(--muted)' }}>Trash is empty.</p>
          ) : needle && visibleTrashed.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No matches for {'“'}{query}{'”'}</p>
          ) : (
            <ul data-testid="canvas-trash" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {visibleTrashed.map((c) => (
                <li key={c.ref} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0' }}>
                  <span style={{ color: 'var(--muted)', font: '500 14px var(--font-sans)' }}>{c.title}</span>
                  <button onClick={() => onRestoreCanvas(c.ref)}>Restore</button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  )
}
