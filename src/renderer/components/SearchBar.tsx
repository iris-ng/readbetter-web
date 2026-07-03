import { useRef, useEffect } from 'react'
import type { JSX } from 'react'
import { Icon } from './Icon'

export interface SearchBarProps {
  query: string
  matchCount: number
  activeOrdinal: number
  onQueryChange(q: string): void
  onNext(): void
  onPrev(): void
  onClose(): void
}

const iconBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--muted)',
  padding: '2px 4px',
  display: 'inline-flex',
  alignItems: 'center',
}

/** The slim per-pane find-in-page row (same row idiom as ZoomControl / SavedViewsBar). Presentational:
 *  all state lives in useDocSearch; open/close visibility is controlled by the parent. */
export function SearchBar({
  query,
  matchCount,
  activeOrdinal,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: SearchBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => inputRef.current?.focus(), [])

  const count = matchCount === 0 ? (query.trim() ? '0 results' : '') : `${activeOrdinal} / ${matchCount}`

  return (
    <div
      data-testid="search-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '3px 8px',
        }}
      >
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search this document"
          placeholder="Find in document…"
          spellCheck={false}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.shiftKey ? onPrev() : onNext()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--fg)', font: 'var(--text-base) var(--font-sans)' }}
        />
      </div>
      <span data-testid="search-count" style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {count}
      </span>
      <button aria-label="Previous match" title="Previous match (⇧⏎)" onClick={onPrev} style={iconBtn}>
        <Icon name="chevron-up" size={15} />
      </button>
      <button aria-label="Next match" title="Next match (⏎)" onClick={onNext} style={iconBtn}>
        <Icon name="chevron-down" size={15} />
      </button>
      <button aria-label="Close search" title="Close search (Esc)" onClick={onClose} style={iconBtn}>
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
