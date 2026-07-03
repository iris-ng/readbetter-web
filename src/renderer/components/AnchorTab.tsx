import type { JSX } from 'react'
import { Icon } from './Icon'

export function AnchorTab({
  passageText,
  fractions,
  onRelease
}: {
  passageText: string
  fractions: { pins: number[]; current: number }
  onRelease: () => void
}): JSX.Element {
  const preview = passageText.slice(0, 160)
  return (
    <aside
      role="region"
      aria-label="Pinned passage"
      style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', background: 'var(--surface-2)', flex: '0 0 auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', color: 'var(--warn)' }}><Icon name="pin" size={13} /> Pinned passage</strong>
        <button
          aria-label="Release pin"
          onClick={onRelease}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <p style={{ margin: 'var(--space-1) 0', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', lineHeight: 'var(--leading-tight)', color: 'var(--fg)' }}>{preview}</p>
      <div
        data-testid="position-bar"
        style={{ position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 4 }}
      >
        {fractions.pins.map((f, i) => (
          <span
            key={i}
            data-testid={`pos-pin-${i}`}
            style={{ position: 'absolute', top: -2, left: `${f * 100}%`, width: 8, height: 8, borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 45%, var(--surface-2))' }}
          />
        ))}
        <span
          data-testid="pos-current"
          style={{ position: 'absolute', top: -2, left: `${fractions.current * 100}%`, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }}
        />
      </div>
    </aside>
  )
}
