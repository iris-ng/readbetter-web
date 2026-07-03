import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDocSearch } from './useDocSearch'

const TEXT = 'alpha beta alpha gamma alpha'

describe('useDocSearch', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useDocSearch(TEXT))
    expect(result.current.matches).toEqual([])
    expect(result.current.activeIndex).toBe(-1)
    expect(result.current.activeMatch).toBeNull()
  })

  it('computes matches and points activeIndex at the first', () => {
    const { result } = renderHook(() => useDocSearch(TEXT))
    act(() => result.current.setQuery('alpha'))
    expect(result.current.matches).toHaveLength(3)
    expect(result.current.activeIndex).toBe(0)
    expect(result.current.activeMatch).toEqual({ start: 0, end: 5 })
  })

  it('next/prev wrap around', () => {
    const { result } = renderHook(() => useDocSearch(TEXT))
    act(() => result.current.setQuery('alpha'))
    act(() => result.current.next())
    expect(result.current.activeIndex).toBe(1)
    act(() => result.current.prev())
    act(() => result.current.prev())
    expect(result.current.activeIndex).toBe(2) // wrapped past 0
  })

  it('resets activeIndex to 0 when the query changes', () => {
    const { result } = renderHook(() => useDocSearch(TEXT))
    act(() => result.current.setQuery('alpha'))
    act(() => result.current.next())
    act(() => result.current.setQuery('gamma'))
    expect(result.current.activeIndex).toBe(0)
    expect(result.current.matches).toHaveLength(1)
  })

  it('reset clears query and matches', () => {
    const { result } = renderHook(() => useDocSearch(TEXT))
    act(() => result.current.setQuery('alpha'))
    act(() => result.current.reset())
    expect(result.current.query).toBe('')
    expect(result.current.matches).toEqual([])
    expect(result.current.activeIndex).toBe(-1)
  })
})
