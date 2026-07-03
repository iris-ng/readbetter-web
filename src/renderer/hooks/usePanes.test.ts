import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTabs } from './useTabs'
import { usePanes } from './usePanes'

// usePanes consumes useTabs; drive both from one harness so opens + shows interleave realistically.
function useHarness() {
  const tabs = useTabs()
  const panes = usePanes(tabs)
  return { tabs, panes }
}

describe('usePanes', () => {
  beforeEach(() => {
    localStorage.clear()
    window.innerWidth = 1200 // >=1100 -> maxShown 3 for the multi-pane cases
  })

  it('open -> 1, open 2nd -> 2, open 3rd -> 3 (focus follows the newest)', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = '', c = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    expect(result.current.panes.panes).toHaveLength(1)
    expect(result.current.panes.focusedId).toBe(a)
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    expect(result.current.panes.panes).toHaveLength(2)
    act(() => { c = result.current.tabs.openTab('doc', 'documents/c.md', 'C'); result.current.panes.show(c) })
    expect(result.current.panes.shownIds).toEqual([a, b, c])
    expect(result.current.panes.focusedId).toBe(c)
  })

  it('a 4th open at cap replaces the focused pane; the displaced tab is parked', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = '', c = '', d = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    act(() => { c = result.current.tabs.openTab('doc', 'documents/c.md', 'C'); result.current.panes.show(c) }) // focused = c
    act(() => { d = result.current.tabs.openTab('doc', 'documents/d.md', 'D'); result.current.panes.show(d) })
    expect(result.current.panes.panes).toHaveLength(3)
    expect(result.current.panes.shownIds).toEqual([a, b, d]) // c (focused) was replaced
    expect(result.current.panes.focusedId).toBe(d)
    expect(result.current.panes.parkedIds).toContain(c)
  })

  it('park reflows and show un-parks; focus moves a pane', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = '', c = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    act(() => { c = result.current.tabs.openTab('doc', 'documents/c.md', 'C'); result.current.panes.show(c) })
    act(() => result.current.panes.park(a))
    expect(result.current.panes.shownIds).toEqual([b, c])
    expect(result.current.panes.parkedIds).toContain(a)
    act(() => result.current.panes.show(a)) // un-park -> appended
    expect(result.current.panes.shownIds).toEqual([b, c, a])
    expect(result.current.panes.parkedIds).not.toContain(a)
    act(() => result.current.panes.focus(b))
    expect(result.current.panes.focusedId).toBe(b)
  })

  it('releaseClosed drops a tab from the shown set ahead of tabs.closeTab', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    act(() => { result.current.panes.releaseClosed(a); result.current.tabs.closeTab(a) })
    expect(result.current.panes.shownIds).toEqual([b])
    expect(result.current.panes.parkedIds).not.toContain(a) // the tab is gone entirely
  })

  it('isPinned / togglePin forces the pinned canvas rightmost and persists via rb-pinned-canvas', () => {
    const { result } = renderHook(() => useHarness())
    let c = '', a = ''
    act(() => { c = result.current.tabs.openTab('canvas', 'canvases/c.md', 'C'); result.current.panes.show(c) })
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    expect(result.current.panes.shownIds).toEqual([c, a]) // insertion order, not yet pinned
    act(() => result.current.panes.togglePin(c))
    expect(result.current.panes.isPinned(c)).toBe(true)
    expect(result.current.panes.shownIds).toEqual([a, c]) // pinned canvas reordered rightmost
    expect(result.current.panes.panes[result.current.panes.panes.length - 1].tabId).toBe(c)
    expect(result.current.panes.panes[result.current.panes.panes.length - 1].pinned).toBe(true)
    expect(localStorage.getItem('rb-pinned-canvas')).toBe('canvases/c.md')
  })

  it('togglePin is a no-op for a doc tab', () => {
    const { result } = renderHook(() => useHarness())
    let a = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => result.current.panes.togglePin(a))
    expect(result.current.panes.isPinned(a)).toBe(false)
    expect(localStorage.getItem('rb-pinned-canvas')).toBeNull()
  })

  it('a persisted pin re-occupies the rightmost slot on a fresh mount (survives reload)', () => {
    localStorage.setItem('rb-pinned-canvas', 'canvases/c.md')
    const { result } = renderHook(() => useHarness())
    let a = '', c = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { c = result.current.tabs.openTab('canvas', 'canvases/c.md', 'C'); result.current.panes.show(c) })
    expect(result.current.panes.isPinned(c)).toBe(true)
    expect(result.current.panes.panes[result.current.panes.panes.length - 1].tabId).toBe(c)
  })

  it('maxShown shrink parks overflow from the right but never the focused pane', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = '', d = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    act(() => { d = result.current.tabs.openTab('doc', 'documents/d.md', 'D'); result.current.panes.show(d) }) // focused = d (rightmost)
    expect(result.current.panes.shownIds).toEqual([a, b, d])
    act(() => { window.innerWidth = 800; window.dispatchEvent(new Event('resize')) }) // 800 -> maxShown 2
    expect(result.current.panes.maxShown).toBe(2)
    expect(result.current.panes.shownIds).toEqual([a, d]) // b parked (rightmost non-focused), d (focused) kept
    expect(result.current.panes.focusedId).toBe(d)
    expect(result.current.panes.parkedIds).toContain(b)
  })

  it('library view = empty shownIds + null focusedId', () => {
    const { result } = renderHook(() => useHarness())
    expect(result.current.panes.shownIds).toEqual([])
    expect(result.current.panes.focusedId).toBeNull()
    expect(result.current.panes.panes).toEqual([])
  })

  it('show({ at, keep }) evicts a non-kept pane, never the kept one, at capacity', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = '', c = '', d = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    act(() => { c = result.current.tabs.openTab('doc', 'documents/c.md', 'C'); result.current.panes.show(c) })
    act(() => result.current.panes.focus(a)) // focused = A
    expect(result.current.panes.shownIds).toEqual([a, b, c])
    expect(result.current.panes.focusedId).toBe(a)
    act(() => { d = result.current.tabs.openTab('doc', 'documents/d.md', 'D'); result.current.panes.show(d, { at: 2, keep: c }) })
    expect(result.current.panes.panes).toHaveLength(3)
    expect(result.current.panes.shownIds).toContain(a) // focused -- not evicted
    expect(result.current.panes.shownIds).toContain(d) // inserted
    expect(result.current.panes.shownIds).toContain(c) // kept -- not evicted
    expect(result.current.panes.shownIds).not.toContain(b) // evicted
  })

  it('a pinned canvas is never evicted when a doc opens at capacity (even while focused)', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = '', c = '', d = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    act(() => { c = result.current.tabs.openTab('canvas', 'canvases/c.md', 'C'); result.current.panes.show(c) })
    act(() => result.current.panes.togglePin(c)) // pin the canvas; it stays focused + rightmost
    expect(result.current.panes.shownIds).toEqual([a, b, c])
    expect(result.current.panes.focusedId).toBe(c)
    // open a 4th doc at cap: the focused pane is the pinned canvas, so a NON-pinned pane must yield.
    act(() => { d = result.current.tabs.openTab('doc', 'documents/d.md', 'D'); result.current.panes.show(d) })
    expect(result.current.panes.panes).toHaveLength(3)
    expect(result.current.panes.shownIds).toContain(c) // pinned canvas survives
    expect(result.current.panes.shownIds).toContain(d) // new doc shown
    expect(result.current.panes.isPinned(c)).toBe(true)
    expect(result.current.panes.panes[result.current.panes.panes.length - 1].tabId).toBe(c) // still rightmost
  })

  it('window narrowing parks from the right but never the pinned canvas', () => {
    const { result } = renderHook(() => useHarness())
    let a = '', b = '', c = ''
    act(() => { a = result.current.tabs.openTab('doc', 'documents/a.md', 'A'); result.current.panes.show(a) })
    act(() => { b = result.current.tabs.openTab('doc', 'documents/b.md', 'B'); result.current.panes.show(b) })
    act(() => { c = result.current.tabs.openTab('canvas', 'canvases/c.md', 'C'); result.current.panes.show(c) })
    act(() => result.current.panes.togglePin(c)) // c pinned, rightmost
    act(() => result.current.panes.focus(a)) // focus a non-pinned pane so the pinned canvas is a park candidate
    act(() => { window.innerWidth = 800; window.dispatchEvent(new Event('resize')) }) // -> maxShown 2
    expect(result.current.panes.maxShown).toBe(2)
    expect(result.current.panes.shownIds).toContain(c) // pinned canvas kept despite being rightmost
    expect(result.current.panes.parkedIds).toContain(b) // a non-pinned pane parked instead
    expect(result.current.panes.panes[result.current.panes.panes.length - 1].tabId).toBe(c)
  })
})
