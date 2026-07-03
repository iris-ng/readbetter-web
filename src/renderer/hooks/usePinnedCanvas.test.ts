import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePinnedCanvas } from './usePinnedCanvas'

describe('usePinnedCanvas', () => {
  beforeEach(() => localStorage.clear())

  it('toggles pin on and off and persists it in localStorage', () => {
    const { result } = renderHook(() => usePinnedCanvas())
    expect(result.current.pinnedRef).toBeNull()
    act(() => result.current.toggle('canvases/a.md'))
    expect(result.current.pinnedRef).toBe('canvases/a.md')
    expect(result.current.isPinned('canvases/a.md')).toBe(true)
    expect(localStorage.getItem('rb-pinned-canvas')).toBe('canvases/a.md')

    act(() => result.current.toggle('canvases/a.md'))
    expect(result.current.pinnedRef).toBeNull()
    expect(localStorage.getItem('rb-pinned-canvas')).toBeNull()
  })

  it('keeps only one pin at a time', () => {
    const { result } = renderHook(() => usePinnedCanvas())
    act(() => result.current.toggle('canvases/a.md'))
    act(() => result.current.toggle('canvases/b.md'))
    expect(result.current.pinnedRef).toBe('canvases/b.md')
    expect(result.current.isPinned('canvases/a.md')).toBe(false)
  })

  it('reads a persisted pin on init', () => {
    localStorage.setItem('rb-pinned-canvas', 'canvases/c.md')
    const { result } = renderHook(() => usePinnedCanvas())
    expect(result.current.pinnedRef).toBe('canvases/c.md')
  })

  it('unpin clears pin and storage', () => {
    localStorage.setItem('rb-pinned-canvas', 'canvases/c.md')
    const { result } = renderHook(() => usePinnedCanvas())
    act(() => result.current.unpin())
    expect(result.current.pinnedRef).toBeNull()
    expect(localStorage.getItem('rb-pinned-canvas')).toBeNull()
  })

  it('isolates same canvas refs across projects', () => {
    const a = renderHook(() => usePinnedCanvas('project-a'))
    const b = renderHook(() => usePinnedCanvas('project-b'))

    act(() => a.result.current.toggle('canvases/shared.md'))

    expect(a.result.current.pinnedRef).toBe('canvases/shared.md')
    expect(b.result.current.pinnedRef).toBeNull()
    expect(JSON.parse(localStorage.getItem('rb-pinned-canvas') ?? '{}')).toEqual({
      'project-a': 'canvases/shared.md'
    })
  })
})
