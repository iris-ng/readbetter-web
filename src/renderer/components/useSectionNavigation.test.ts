import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSectionNavigation } from './useSectionNavigation'

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useSectionNavigation', () => {
  it('starts at index 0', () => {
    const { result } = renderHook(() => useSectionNavigation(3))
    expect(result.current.activeIndex).toBe(0)
  })

  it('ArrowDown/ArrowUp move and clamp to range', () => {
    const { result } = renderHook(() => useSectionNavigation(3))
    act(() => press('ArrowDown'))
    expect(result.current.activeIndex).toBe(1)
    act(() => { press('ArrowDown'); press('ArrowDown') })
    expect(result.current.activeIndex).toBe(2) // clamped at last
    act(() => { press('ArrowUp'); press('ArrowUp'); press('ArrowUp') })
    expect(result.current.activeIndex).toBe(0) // clamped at first
  })

  it('setActiveIndex clamps out-of-range values', () => {
    const { result } = renderHook(() => useSectionNavigation(3))
    act(() => result.current.setActiveIndex(10))
    expect(result.current.activeIndex).toBe(2)
    act(() => result.current.setActiveIndex(-5))
    expect(result.current.activeIndex).toBe(0)
  })

  it('does nothing on an empty document', () => {
    const { result } = renderHook(() => useSectionNavigation(0))
    act(() => press('ArrowDown'))
    expect(result.current.activeIndex).toBe(0)
  })
})
