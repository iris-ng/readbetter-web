import type { JSX } from 'react'
import type { LibraryEntry, CanvasEntry } from '../platform'
import { Icon } from './Icon'

export interface QuickPickerProps {
  query: string
  documents: LibraryEntry[]
  canvases: CanvasEntry[]
  canOpenBeside: boolean
  onOpenDocument: (ref: string) => void
  onOpenBeside: (ref: string) => void
  onOpenCanvas: (ref: string) => void
  onNewCanvas: () => void
  onClose: () => void
}

const rowBtn: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: '7px 10px',
  borderRadius: 6,
  font: '500 13px var(--font-sans)',
  color: 'var(--fg)',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  lineHeight: 1.35
}

function folderContext(ref: string): string {
  const parts = ref.split('/')
  parts.pop()
  if (parts[0] === 'documents' || parts[0] === 'canvases') parts.shift()
  return parts.join('/')
}

function matches(needle: string, ...values: string[]): boolean {
  return values.some((value) => value.toLowerCase().includes(needle))
}

export function QuickPicker(props: QuickPickerProps): JSX.Element {
  const needle = props.query.trim().toLowerCase()
  const docs = needle ? props.documents.filter((d) => matches(needle, d.name, d.ref)) : props.documents
  const cvs = needle ? props.canvases.filter((c) => matches(needle, c.title, c.ref)) : props.canvases
  const muted: React.CSSProperties = { padding: '8px 10px', color: 'var(--muted)', font: '500 12px var(--font-sans)' }

  return (
    <div
      aria-label="Search results"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 6,
        zIndex: 1000,
        minWidth: 280,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 380,
        overflowY: 'auto',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 4,
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      <button
        onClick={() => {
          props.onNewCanvas()
          props.onClose()
        }}
        style={{ ...rowBtn, color: 'var(--accent)', fontWeight: 600 }}
      >
        <span aria-hidden>+</span> New canvas
      </button>

      {props.documents.length === 0 && props.canvases.length === 0 ? (
        <div style={muted}>No documents or canvases in this project yet.</div>
      ) : docs.length === 0 && cvs.length === 0 ? (
        <div style={muted}>No matches for "{props.query}"</div>
      ) : null}

      {docs.map((d) => {
        const context = folderContext(d.ref)
        return (
          <div key={d.ref} style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            <button
              aria-label={`Open in new tab: ${d.name}`}
              title={d.ref}
              onClick={() => {
                props.onOpenDocument(d.ref)
                props.onClose()
              }}
              style={rowBtn}
            >
              <span>{d.name}</span>
              {context && <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{context}/</span>}
            </button>
            {props.canOpenBeside && (
              <button
                aria-label={`Open beside: ${d.name}`}
                title={`Open ${d.ref} in a second pane`}
                onClick={() => {
                  props.onOpenBeside(d.ref)
                  props.onClose()
                }}
                style={{
                  flex: '0 0 auto',
                  marginTop: 4,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  borderRadius: 6,
                  font: '500 11px var(--font-sans)',
                  color: 'var(--muted)',
                  whiteSpace: 'nowrap'
                }}
              >
                Beside
              </button>
            )}
          </div>
        )
      })}

      {cvs.map((c) => {
        const context = folderContext(c.ref)
        return (
          <button
            key={c.ref}
            onClick={() => {
              props.onOpenCanvas(c.ref)
              props.onClose()
            }}
            style={{ ...rowBtn, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span aria-hidden style={{ color: 'var(--accent)' }}>
              <Icon name="diamond" size={14} />
            </span>
            <span>
              {c.title}
              {context && <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{context}/</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
