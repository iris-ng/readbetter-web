import { useCallback, useState } from 'react'

export const RAIL_MIN_W = 180
export const RAIL_MAX_W = 460
const DEFAULT_W = 236
const KEY_PIN = 'rb-rail-pinned'
const KEY_W = 'rb-rail-width'

const clamp = (px: number): number => Math.max(RAIL_MIN_W, Math.min(RAIL_MAX_W, Math.round(px)))

function read<T>(key: string, fallback: T, parse: (s: string) => T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : parse(v)
  } catch {
    return fallback
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* localStorage unavailable — ignore */
  }
}

export interface UseRailState {
  pinned: boolean
  width: number
  togglePin(): void
  setWidth(px: number): void
}

export function useRailState(): UseRailState {
  const [pinned, setPinned] = useState<boolean>(() => read(KEY_PIN, false, (s) => s === '1'))
  const [width, setWidthState] = useState<number>(() => read(KEY_W, DEFAULT_W, (s) => clamp(Number(s) || DEFAULT_W)))

  const togglePin = useCallback(() => {
    setPinned((cur) => {
      const next = !cur
      write(KEY_PIN, next ? '1' : null)
      return next
    })
  }, [])

  const setWidth = useCallback((px: number) => {
    const w = clamp(px)
    setWidthState(w)
    write(KEY_W, String(w))
  }, [])

  return { pinned, width, togglePin, setWidth }
}
