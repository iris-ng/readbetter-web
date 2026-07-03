import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAnnotations } from './useAnnotations'
import { emptySidecar, serializeSidecar, Sidecar, SavedView, PinAnchor } from '../../core/sidecar/sidecar'
import { createAnchor } from '../../core/anchor/anchor'
import { hashContent } from '../../core/hash'
import type { RunOffset } from '../../core/pdf/pdfLayout'
import type { Link } from '../../core/link/link'

const CONTENT = 'The quick brown fox jumps over the lazy dog.'

// A PinAnchor over a slice of CONTENT, denormalized to a fake section id.
function pin(needle: string, sectionId: string): PinAnchor {
  const start = CONTENT.indexOf(needle)
  return { anchor: createAnchor(CONTENT, start, start + needle.length), sectionId }
}
// In this single-section doc, text === CONTENT (markdown preamble normalizes 1:1 here).

function makeApi(sidecarJson: string | null) {
  return {
    openFile: vi.fn(),
    readSidecar: vi.fn().mockResolvedValue(sidecarJson),
    writeSidecar: vi.fn().mockResolvedValue(undefined)
  }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('useAnnotations', () => {
  it('starts empty when there is no sidecar', async () => {
    const api = makeApi(null)
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await waitFor(() => expect(api.readSidecar).toHaveBeenCalled())
    expect(result.current.annotations).toEqual([])
    expect(result.current.orphans).toEqual([])
  })

  it('does not write a sidecar when a document is merely opened (no mutation)', async () => {
    vi.useFakeTimers()
    const api = makeApi(null)
    renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(api.writeSidecar).not.toHaveBeenCalled()
  })

  it('never overwrites a corrupt sidecar', async () => {
    vi.useFakeTimers()
    const api = makeApi('{ this is not valid json')
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(api.writeSidecar).not.toHaveBeenCalled()
    expect(result.current.annotations).toEqual([])
    expect(result.current.orphans).toEqual([])
  })

  it('loads and resolves annotations from a matching sidecar', async () => {
    const side = emptySidecar('doc-1', hashContent(CONTENT))
    const start = CONTENT.indexOf('brown fox')
    side.annotations.push({
      id: 'a1',
      anchor: createAnchor(CONTENT, start, start + 'brown fox'.length),
      color: 'yellow',
      note: 'beast'
    })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await waitFor(() => expect(result.current.annotations).toHaveLength(1))
    expect(result.current.annotations[0].range).toEqual({ start, end: start + 'brown fox'.length })
    expect(result.current.orphans).toEqual([])
  })

  it('routes unresolvable anchors to orphans when the source changed', async () => {
    const side = emptySidecar('doc-1', 'STALEHASH')
    side.annotations.push({
      id: 'a1',
      anchor: createAnchor('gone text here', 0, 4), // "gone" not present in CONTENT
      color: 'yellow',
      note: 'lost'
    })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await waitFor(() => expect(result.current.orphans).toHaveLength(1))
    expect(result.current.annotations).toEqual([])
  })

  it('createAnnotation adds a highlight and persists', async () => {
    vi.useFakeTimers()
    const api = makeApi(null)
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() }) // flush initial load
    const start = CONTENT.indexOf('lazy dog')
    act(() => result.current.createAnnotation({ start, end: start + 'lazy dog'.length }))
    expect(result.current.annotations).toHaveLength(1)
    await act(async () => { await vi.runAllTimersAsync() }) // flush debounced save
    expect(api.writeSidecar).toHaveBeenCalled()
    const written = JSON.parse(api.writeSidecar.mock.calls.at(-1)![1]) as Sidecar
    expect(written.annotations).toHaveLength(1)
    expect(written.annotations[0].anchor.exact).toBe('lazy dog')
  })

  it('reattach rebinds an orphan to a new range', async () => {
    const side = emptySidecar('doc-1', 'STALE')
    side.annotations.push({
      id: 'a1',
      anchor: createAnchor('missing words', 0, 7),
      color: 'yellow',
      note: 'keep me'
    })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await waitFor(() => expect(result.current.orphans).toHaveLength(1))
    const start = CONTENT.indexOf('quick')
    act(() => result.current.reattach('a1', { start, end: start + 'quick'.length }))
    expect(result.current.orphans).toEqual([])
    expect(result.current.annotations).toHaveLength(1)
    expect(result.current.annotations[0].note).toBe('keep me')
  })
})

describe('useAnnotations saved views', () => {
  it('loads saved views from the sidecar', async () => {
    const side = emptySidecar('doc-1', hashContent(CONTENT))
    side.savedViews.push({ id: 'v1', name: 'A ⇄ B', pinnedAnchors: [pin('quick', '0-a'), pin('lazy', '2-b')] })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await waitFor(() => expect(result.current.savedViews).toHaveLength(1))
    expect(result.current.savedViews[0].name).toBe('A ⇄ B')
  })

  it('saveView adds a view and persists it', async () => {
    vi.useFakeTimers()
    const api = makeApi(null)
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })
    const anchors = [pin('quick', '0-a'), pin('lazy', '1-b')]
    act(() => result.current.saveView('My view', anchors))
    expect(result.current.savedViews).toHaveLength(1)
    await act(async () => { await vi.runAllTimersAsync() })
    expect(api.writeSidecar).toHaveBeenCalled()
    const written = JSON.parse(api.writeSidecar.mock.calls.at(-1)![1]) as { savedViews: SavedView[] }
    expect(written.savedViews).toHaveLength(1)
    expect(written.savedViews[0].name).toBe('My view')
    expect(written.savedViews[0].pinnedAnchors).toHaveLength(2)
    expect(written.savedViews[0].pinnedAnchors[0].sectionId).toBe('0-a')
  })

  it('deleteView removes a view', async () => {
    const side = emptySidecar('doc-1', hashContent(CONTENT))
    side.savedViews.push({ id: 'v1', name: 'gone', pinnedAnchors: [pin('quick', '0-a')] })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await waitFor(() => expect(result.current.savedViews).toHaveLength(1))
    act(() => result.current.deleteView('v1'))
    expect(result.current.savedViews).toEqual([])
  })

  it('renameView changes a view name', async () => {
    const side = emptySidecar('doc-1', hashContent(CONTENT))
    side.savedViews.push({ id: 'v1', name: 'old', pinnedAnchors: [pin('quick', '0-a')] })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await waitFor(() => expect(result.current.savedViews).toHaveLength(1))
    act(() => result.current.renameView('v1', 'new'))
    expect(result.current.savedViews[0].name).toBe('new')
  })

  it('deleteView persists the removal', async () => {
    vi.useFakeTimers()
    const side = emptySidecar('doc-1', hashContent(CONTENT))
    side.savedViews.push({ id: 'v1', name: 'gone', pinnedAnchors: [pin('quick', '0-a')] })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })
    act(() => result.current.deleteView('v1'))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(api.writeSidecar).toHaveBeenCalled()
    const written = JSON.parse(api.writeSidecar.mock.calls.at(-1)![1]) as { savedViews: unknown[] }
    expect(written.savedViews).toEqual([])
  })

  it('renameView persists the new name', async () => {
    vi.useFakeTimers()
    const side = emptySidecar('doc-1', hashContent(CONTENT))
    side.savedViews.push({ id: 'v1', name: 'old', pinnedAnchors: [pin('quick', '0-a')] })
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })
    act(() => result.current.renameView('v1', 'fresh'))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(api.writeSidecar).toHaveBeenCalled()
    const written = JSON.parse(api.writeSidecar.mock.calls.at(-1)![1]) as { savedViews: { name: string }[] }
    expect(written.savedViews[0].name).toBe('fresh')
  })
})

describe('useAnnotations links', () => {
  const anchor = { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }

  it('addLink persists links alongside annotations in the same sidecar write', async () => {
    vi.useFakeTimers()
    const api = makeApi(null)
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })

    const start = CONTENT.indexOf('lazy dog')
    act(() => result.current.createAnnotation({ start, end: start + 'lazy dog'.length }))

    const link: Link = { id: 'l1', anchor, otherDocRef: 'documents/b.md' }
    act(() => result.current.addLink(link))
    expect(result.current.links).toHaveLength(1)

    await act(async () => { await vi.runAllTimersAsync() })

    const written = JSON.parse(api.writeSidecar.mock.calls.at(-1)![1]) as Sidecar
    expect(written.links).toHaveLength(1)
    expect(written.links[0].id).toBe('l1')
    expect(written.annotations).toHaveLength(1)
    vi.useRealTimers()
  })

  it('removeLink removes the link and persists', async () => {
    vi.useFakeTimers()
    const api = makeApi(null)
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })

    const link: Link = { id: 'l1', anchor, otherDocRef: 'documents/b.md' }
    act(() => result.current.addLink(link))
    expect(result.current.links).toHaveLength(1)

    act(() => result.current.removeLink('l1'))
    expect(result.current.links).toHaveLength(0)

    await act(async () => { await vi.runAllTimersAsync() })
    const written = JSON.parse(api.writeSidecar.mock.calls.at(-1)![1]) as Sidecar
    expect(written.links).toHaveLength(0)
    vi.useRealTimers()
  })

  it('does not write on load even when the sidecar has links (dirty-gate holds)', async () => {
    vi.useFakeTimers()
    const side: Sidecar = {
      ...emptySidecar('doc-1', hashContent(CONTENT)),
      links: [{ id: 'l1', anchor, otherDocRef: 'documents/b.md' }]
    }
    const api = makeApi(serializeSidecar(side))
    const { result } = renderHook(() => useAnnotations(CONTENT, CONTENT, 'd.md', api))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(result.current.links).toHaveLength(1)
    expect(api.writeSidecar).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

const RUN_INDEX: RunOffset[] = [
  { pageIndex: 0, text: 'Hello', x: 10, y: 20, w: 30, h: 8, ocr: false, charStart: 0, charEnd: 5 }
]

function memApi() {
  const store: Record<string, string> = {}
  return {
    store,
    readSidecar: vi.fn(async (p: string) => store[p] ?? null),
    writeSidecar: vi.fn(async (p: string, json: string) => {
      store[p] = json
    })
  }
}

describe('useAnnotations with PDF page anchoring', () => {
  it('attaches an anchor.page selector and exposes quads when a run index is injected', async () => {
    const api = memApi()
    const { result } = renderHook(() =>
      useAnnotations('Hello world', '', 'documents/p.pdf', api, { runIndex: RUN_INDEX })
    )
    await act(async () => {}) // drain mount-time readSidecar microtask
    act(() => result.current.createAnnotation({ start: 0, end: 5 }))
    expect(result.current.annotations[0].quads).toEqual([{ pageIndex: 0, x: 10, y: 20, w: 30, h: 8 }])
  })

  it('resolves a text-failed annotation via its stored page fallback (not orphaned)', async () => {
    const api = memApi()
    api.store['documents/p.pdf'] = serializeSidecar({
      ...emptySidecar('doc-1', 'h'),
      annotations: [
        {
          id: 'a1',
          anchor: { start: 0, end: 5, exact: 'ZZZ', prefix: '', suffix: '', page: { quads: [{ pageIndex: 0, x: 1, y: 2, w: 3, h: 4 }] } },
          color: '#fde68a',
          note: ''
        }
      ]
    })
    const { result } = renderHook(() =>
      useAnnotations('Hello world', '', 'documents/p.pdf', api, { runIndex: RUN_INDEX })
    )
    await act(async () => {}) // let readSidecar resolve
    expect(result.current.orphans).toHaveLength(0)
    expect(result.current.annotations[0].quads).toEqual([{ pageIndex: 0, x: 1, y: 2, w: 3, h: 4 }])
  })
})
