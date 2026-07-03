import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRecents } from './useRecents'

describe('useRecents', () => {
  beforeEach(() => localStorage.clear())

  it('records and reads last-opened + structure', () => {
    const { result } = renderHook(() => useRecents())
    act(() => result.current.recordOpen('a.md', { sectionCount: 3, proportions: [0.5, 0.5] }))
    expect(result.current.lastOpened('a.md')).not.toBeNull()
    expect(result.current.structure('a.md')?.sectionCount).toBe(3)
    expect(result.current.structure('b.md')).toBeNull()
  })

  it('sorts refs most-recently-opened first; unopened sink to end', () => {
    const { result } = renderHook(() => useRecents())
    let t = 1000
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => ++t)
    act(() => {
      result.current.recordOpen('old.md')
    })
    act(() => {
      result.current.recordOpen('new.md')
    })
    spy.mockRestore()
    expect(result.current.sortByRecent(['unopened.md', 'old.md', 'new.md'])).toEqual([
      'new.md',
      'old.md',
      'unopened.md'
    ])
  })

  it('isolates same document refs across projects', () => {
    const a = renderHook(() => useRecents('project-a'))
    const b = renderHook(() => useRecents('project-b'))

    act(() => a.result.current.recordOpen('documents/shared.pdf', { sectionCount: 1, proportions: [1] }))

    expect(a.result.current.lastOpened('documents/shared.pdf')).not.toBeNull()
    expect(a.result.current.structure('documents/shared.pdf')?.sectionCount).toBe(1)
    expect(b.result.current.lastOpened('documents/shared.pdf')).toBeNull()
    expect(b.result.current.structure('documents/shared.pdf')).toBeNull()
  })
})
