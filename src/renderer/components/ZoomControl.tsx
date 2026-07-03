import { useEffect, useState } from 'react'
import type { JSX } from 'react'

const MIN_PERCENT = 25
const MAX_PERCENT = 200

function clampPercent(value: number): number {
  return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, value))
}

export function ZoomControl({
  zoom,
  onZoomChange
}: {
  zoom: number
  onZoomChange: (zoom: number) => void
}): JSX.Element {
  const [draft, setDraft] = useState(() => String(Math.round(zoom * 100)))

  useEffect(() => {
    setDraft(String(Math.round(zoom * 100)))
  }, [zoom])

  const commit = (): void => {
    const percent = Number(draft)
    if (!Number.isFinite(percent)) {
      setDraft(String(Math.round(zoom * 100)))
      return
    }
    const next = clampPercent(percent)
    setDraft(String(next))
    onZoomChange(next / 100)
  }

  return (
    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      Zoom
      <input
        aria-label="Zoom percentage"
        type="number"
        min={MIN_PERCENT}
        max={MAX_PERCENT}
        step="any"
        value={draft}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          const percent = Number(next)
          if (next.trim() !== '' && Number.isFinite(percent) && percent >= MIN_PERCENT && percent <= MAX_PERCENT) {
            onZoomChange(percent / 100)
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        style={{ width: 64 }}
      />
      %
    </label>
  )
}
