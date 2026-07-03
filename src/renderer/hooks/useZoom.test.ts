import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useZoom } from './useZoom'

describe('useZoom', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 100%, steps, clamps, and persists', () => {
    const { result } = renderHook(() => useZoom())
    expect(result.current.zoom).toBe(1)

    act(() => result.current.zoomOut())
    expect(result.current.zoom).toBe(0.75)
    act(() => {
      result.current.zoomOut()
      result.current.zoomOut()
    })
    expect(result.current.zoom).toBe(0.25)
    expect(JSON.parse(localStorage.getItem('rb-pdf-zoom') ?? '{}')).toEqual({ zoom: 0.25 })
  })

  it('sets an explicit percentage zoom and clamps to supported bounds', () => {
    const { result } = renderHook(() => useZoom())

    act(() => result.current.setZoom(1.37))
    expect(result.current.zoom).toBe(1.37)

    act(() => result.current.setZoom(4))
    expect(result.current.zoom).toBe(2)

    act(() => result.current.setZoom(0.1))
    expect(result.current.zoom).toBe(0.25)
  })

  it('applies two rapid steps from a non-boundary value correctly', () => {
    const { result } = renderHook(() => useZoom())
    act(() => result.current.zoomIn())
    act(() => {
      result.current.zoomOut()
      result.current.zoomOut()
    })
    expect(result.current.zoom).toBe(0.75)
  })
})
