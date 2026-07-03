import type { JSX } from 'react'
import { ThemeMode } from '../hooks/useTheme'
import { Icon, IconName } from './Icon'

const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
const ICON: Record<ThemeMode, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' }

export function ThemeToggle({
  mode,
  setMode
}: {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
}): JSX.Element {
  return (
    <button
      aria-label={`Theme: ${mode}. Click to change.`}
      title={`Theme: ${mode}`}
      onClick={() => setMode(NEXT[mode])}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--fg)',
        borderRadius: 8,
        padding: 6,
        cursor: 'pointer'
      }}
    >
      <Icon name={ICON[mode]} />
    </button>
  )
}
