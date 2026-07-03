import type { JSX } from 'react'
import { Icon } from './Icon'

export function PinnedPassage({
  passage,
  onRelease
}: {
  passage: { text: string; sectionId: string; range: { start: number; end: number } }
  onRelease: () => void
}): JSX.Element {
  return (
    <section
      data-testid="pinned-passage"
      data-pinned="true"
      style={{
        borderLeft: '3px solid var(--accent)',
        paddingLeft: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8
      }}
    >
      <p
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          font: '14px/1.5 system-ui, sans-serif',
          color: 'var(--fg)',
          flex: '1 1 auto'
        }}
      >
        {passage.text}
      </p>
      <button
        aria-label="Release pin"
        onClick={onRelease}
        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', flex: '0 0 auto' }}
      >
        <Icon name="close" size={14} />
      </button>
    </section>
  )
}
