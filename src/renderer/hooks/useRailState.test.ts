import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRailState, RAIL_MIN_W, RAIL_MAX_W } from './useRailState'

describe('useRailState', () => {
  beforeEach(() => localStorage.clear())

  it('defaults: not pinned, default width', () => {
    const { result } = renderHook(() => useRailState())
    expect(result.current.pinned).toBe(false)
    expect(result.current.width).toBeGreaterThanOrEqual(RAIL_MIN_W)
  })

  it('togglePin flips and persists across remount', () => {
    const a = renderHook(() => useRailState())
    act(() => a.result.current.togglePin())
    expect(a.result.current.pinned).toBe(true)
    const b = renderHook(() => useRailState())
    expect(b.result.current.pinned).toBe(true)
  })

  it('setWidth clamps to [MIN, MAX] and persists', () => {
    const a = renderHook(() => useRailState())
    act(() => a.result.current.setWidth(10_000))
    expect(a.result.current.width).toBe(RAIL_MAX_W)
    act(() => a.result.current.setWidth(1))
    expect(a.result.current.width).toBe(RAIL_MIN_W)
    act(() => a.result.current.setWidth(300))
    const b = renderHook(() => useRailState())
    expect(b.result.current.width).toBe(300)
  })
})
