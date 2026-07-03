import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTabs, isDetachedBoot, detachUrl } from './useTabs'

describe('useTabs', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'))

  it('opens, dedupes by kind+ref, and reflects the active ref in the URL', () => {
    const { result } = renderHook(() => useTabs())
    act(() => { result.current.openTab('doc', 'documents/a.md', 'a.md') })
    expect(result.current.tabs.length).toBe(1)
    expect(result.current.active).toEqual({ view: 'tab', id: result.current.tabs[0].id })
    expect(window.location.search).toContain('doc=documents%2Fa.md')

    const firstId = result.current.tabs[0].id
    act(() => { result.current.openTab('doc', 'documents/a.md', 'a.md') }) // dedupe
    expect(result.current.tabs.length).toBe(1)
    expect(result.current.activeTab?.id).toBe(firstId)
  })

  it('closing the active tab falls back to the library', () => {
    const { result } = renderHook(() => useTabs())
    act(() => { result.current.openTab('canvas', 'canvases/c.md', 'C') })
    const id = result.current.tabs[0].id
    act(() => { result.current.closeTab(id) })
    expect(result.current.tabs.length).toBe(0)
    expect(result.current.active).toEqual({ view: 'library' })
    expect(window.location.search).toBe('')
  })

  it('openTab + closeTab in one act: closeTab composes (functional setTabs) so the newly-appended tab survives', () => {
    // Reproduces the race: openTab appends via functional updater, closeTab must compose (not clobber from stale ref)
    const { result } = renderHook(() => useTabs())
    let idA = ''
    act(() => { idA = result.current.openTab('doc', 'documents/a.md', 'a') })
    act(() => {
      result.current.openTab('doc', 'documents/b.md', 'b')   // appends B (functional updater)
      result.current.closeTab(idA)                            // must compose: remove A, keep B
    })
    expect(result.current.tabs.map((t) => t.ref)).toEqual(['documents/b.md'])
    expect(result.current.active).toEqual({ view: 'tab', id: result.current.tabs[0].id })
  })

  it('returns the id of the opened tab, and the same id when focusing an existing one', () => {
    const { result } = renderHook(() => useTabs())
    let id1 = ''
    act(() => { id1 = result.current.openTab('doc', 'documents/a.md', 'a.md') })
    expect(id1).not.toBe('')
    expect(id1).toBe(result.current.tabs[0].id)
    let id2 = ''
    act(() => { id2 = result.current.openTab('doc', 'documents/a.md', 'a.md') }) // dedupe
    expect(id2).toBe(id1)
    expect(result.current.tabs.length).toBe(1)
  })
})

describe('isDetachedBoot', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'))

  it('returns false when URL has no detached param', () => {
    window.history.replaceState({}, '', '/?doc=documents%2Fa.md')
    expect(isDetachedBoot()).toBe(false)
  })

  it('returns true when URL has detached=1', () => {
    window.history.replaceState({}, '', '/?doc=documents%2Fa.md&detached=1')
    expect(isDetachedBoot()).toBe(true)
  })

  it('returns false when URL has detached=0', () => {
    window.history.replaceState({}, '', '/?doc=documents%2Fa.md&detached=0')
    expect(isDetachedBoot()).toBe(false)
  })
})

describe('detachUrl', () => {
  it('builds the correct URL for a doc with detached=1', () => {
    expect(detachUrl('doc', 'documents/a.md')).toBe('/?doc=documents%2Fa.md&detached=1')
  })

  it('builds the correct URL for a canvas with detached=1', () => {
    expect(detachUrl('canvas', 'canvases/b.md')).toBe('/?canvas=canvases%2Fb.md&detached=1')
  })
})
