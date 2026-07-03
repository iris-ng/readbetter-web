import { useCallback, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

const KEY = 'rb-theme'
const QUERY = '(prefers-color-scheme: dark)'

function readMode(): ThemeMode {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

function systemDark(): boolean {
  return window.matchMedia(QUERY).matches
}

export function useTheme(): { mode: ThemeMode; setMode: (m: ThemeMode) => void; effective: EffectiveTheme } {
  const [mode, setModeState] = useState<ThemeMode>(() => readMode())
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => systemDark())

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (e: { matches: boolean }): void => setSystemIsDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const effective: EffectiveTheme = mode === 'system' ? (systemIsDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.dataset.theme = effective
  }, [effective])

  const setMode = useCallback((m: ThemeMode) => {
    localStorage.setItem(KEY, m)
    setModeState(m)
  }, [])

  return { mode, setMode, effective }
}
