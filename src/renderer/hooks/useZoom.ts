import { useCallback, useState } from 'react'

const KEY = 'rb-pdf-zoom'
const MIN = 0.25
const MAX = 2.0
const STEP = 0.25

interface StoredZoom {
  zoom: number
}

const clamp = (z: number): number => Math.min(MAX, Math.max(MIN, Math.round(z * 100) / 100))

function read(): StoredZoom {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return { zoom: 1 }
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<StoredZoom>
      return { zoom: typeof parsed.zoom === 'number' && parsed.zoom >= MIN && parsed.zoom <= MAX ? parsed.zoom : 1 }
    }
    const legacy = Number(raw)
    return { zoom: legacy >= MIN && legacy <= MAX ? legacy : 1 }
  } catch {
    return { zoom: 1 }
  }
}

function persist(value: StoredZoom): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* storage unavailable - zoom still works for the session */
  }
}

export function useZoom(): {
  zoom: number
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
} {
  const [state, setState] = useState<StoredZoom>(() => read())

  const update = useCallback((fn: (prev: StoredZoom) => StoredZoom) => {
    setState((prev) => {
      const next = fn(prev)
      persist(next)
      return next
    })
  }, [])

  const setZoom = useCallback((zoom: number) => {
    if (!Number.isFinite(zoom)) return
    update(() => ({ zoom: clamp(zoom) }))
  }, [update])

  const step = useCallback((delta: number) => update((prev) => ({ zoom: clamp(prev.zoom + delta) })), [update])

  return {
    zoom: state.zoom,
    setZoom,
    zoomIn: () => step(STEP),
    zoomOut: () => step(-STEP),
    reset: () => setZoom(1)
  }
}
