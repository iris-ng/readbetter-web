import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'

function mockMatch(dark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  window.matchMedia = ((q: string) =>
    ({
      matches: dark,
      media: q,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false
    }) as unknown as MediaQueryList) as typeof window.matchMedia
  return { fire: (matches: boolean) => listeners.forEach((cb) => cb({ matches })) }
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })
  afterEach(() => vi.restoreAllMocks())

  it('defaults to system and applies the OS preference to data-theme', () => {
    mockMatch(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    expect(result.current.effective).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('setMode persists and overrides the OS', () => {
    mockMatch(true)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('light'))
    expect(result.current.effective).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('rb-theme')).toBe('light')
  })

  it('reads a persisted mode on init', () => {
    localStorage.setItem('rb-theme', 'dark')
    mockMatch(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('dark')
    expect(result.current.effective).toBe('dark')
  })

  it('re-resolves when the OS changes while in system mode', () => {
    const { fire } = mockMatch(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.effective).toBe('light')
    act(() => fire(true))
    expect(result.current.effective).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
