import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCanvas } from './useCanvas'
import { serializeCanvas, emptyCanvas, parseCanvas } from '../../core/canvas/canvas'

function fakeAdapter(initial?: string) {
  const store = new Map<string, string>()
  if (initial) store.set('canvases/a.md', initial)
  return {
    store,
    listCanvases: vi.fn(async () => [...store.keys()].map((ref) => ({ ref, name: ref.split('/')[1], title: 't' }))),
    readCanvas: vi.fn(async (ref: string) => store.get(ref) ?? null),
    writeCanvas: vi.fn(async (ref: string, md: string) => void store.set(ref, md))
  }
}

describe('useCanvas', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('opens a canvas and exposes its model', async () => {
    const a = fakeAdapter(serializeCanvas({ ...emptyCanvas('a', 'A') }))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    expect(result.current.canvas?.title).toBe('A')
  })

  it('adds an excerpt card and persists (debounced) as valid markdown', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    act(() => {
      result.current.addExcerptCard({
        source: 'documents/d.md',
        anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' },
        snapshot: 'abc',
        x: 10,
        y: 20
      })
    })
    expect(result.current.canvas?.cards).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    const saved = parseCanvas(a.store.get('canvases/a.md')!)
    expect(saved.cards).toHaveLength(1)
  })

  it('createCanvas writes an empty canvas and makes it active', async () => {
    const a = fakeAdapter()
    const { result } = renderHook(() => useCanvas(a as never))
    let ref = ''
    await act(async () => {
      ref = await result.current.createCanvas('My Board', [])
    })
    expect(ref).toBe('my-board.md')
    expect(result.current.canvas?.title).toBe('My Board')
    expect(a.store.has('my-board.md')).toBe(true)
  })

  it('moveCard and setCardNote mutate in place', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    act(() => result.current.addNoteCard({ x: 0, y: 0 }))
    const id = result.current.canvas!.cards[0].id
    act(() => result.current.moveCard(id, 99, 88))
    act(() => result.current.setCardNote(id, 'hi'))
    const c = result.current.canvas!.cards[0]
    expect([c.x, c.y]).toEqual([99, 88])
    expect(c.note).toBe('hi')
  })

  it('renames the active canvas and persists the new title', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    await act(async () => {
      await result.current.renameCanvas('Renamed')
    })
    expect(result.current.canvas?.title).toBe('Renamed')
    expect(parseCanvas(a.store.get('canvases/a.md')!).title).toBe('Renamed')
  })

  it('soft-deletes the active canvas: writes deleted, then closes it', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    await act(async () => {
      await result.current.deleteActive()
    })
    expect(result.current.canvas).toBeNull()
    expect(parseCanvas(a.store.get('canvases/a.md')!).deleted).toBe(true)
  })

  it('flushes unsaved changes to the previous canvas when switching', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    a.store.set('canvases/b.md', serializeCanvas(emptyCanvas('b', 'B')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    act(() => result.current.addNoteCard({ x: 1, y: 2 })) // dirty, still within debounce
    await act(async () => {
      await result.current.openCanvas('canvases/b.md') // switch BEFORE the 500ms debounce fires
    })
    // The pending edit to A was flushed on switch, not dropped.
    expect(parseCanvas(a.store.get('canvases/a.md')!).cards).toHaveLength(1)
    expect(result.current.canvas?.title).toBe('B')
  })

  it('never overwrites a canvas that failed to parse', async () => {
    const a = fakeAdapter('this is not a valid canvas')
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    expect(result.current.canvas).toBeNull()
    act(() => result.current.flush())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    // The corrupt file is untouched (write never called for this ref).
    expect(a.writeCanvas).not.toHaveBeenCalled()
    expect(a.store.get('canvases/a.md')).toBe('this is not a valid canvas')
  })

  it('adds/dedupes/labels/removes connections and prunes them with the card', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    act(() => result.current.addNoteCard({ x: 0, y: 0 }))
    act(() => result.current.addNoteCard({ x: 200, y: 0 }))
    const [c1, c2] = result.current.canvas!.cards.map((c) => c.id)
    act(() => result.current.addConnection(c1, c2))
    act(() => result.current.addConnection(c1, c2)) // dedupe
    act(() => result.current.addConnection(c1, c1)) // no self-link
    expect(result.current.canvas!.connections).toEqual([{ from: c1, to: c2 }])
    act(() => result.current.setConnectionLabel(c1, c2, 'supports'))
    expect(result.current.canvas!.connections[0]).toEqual({ from: c1, to: c2, label: 'supports' })
    act(() => result.current.setConnectionLabel(c1, c2, '')) // clearing drops the label key (clean round-trip)
    expect(result.current.canvas!.connections[0]).toEqual({ from: c1, to: c2 })
    act(() => result.current.removeConnection(c1, c2)) // explicit removal
    expect(result.current.canvas!.connections).toEqual([])
    act(() => result.current.addConnection(c1, c2)) // re-add to exercise pruning
    act(() => result.current.removeCard(c2)) // pruning
    expect(result.current.canvas!.connections).toEqual([])
  })

  it('resizeCard sets clamped w/h', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    act(() => result.current.addNoteCard({ x: 0, y: 0 }))
    const id = result.current.canvas!.cards[0].id
    act(() => result.current.resizeCard(id, 50, 1000)) // w clamps up to 140
    expect(result.current.canvas!.cards[0]).toMatchObject({ w: 140, h: 1000 })
  })

  it('addExcerptCard stores the highlight color', async () => {
    const a = fakeAdapter(serializeCanvas(emptyCanvas('a', 'A')))
    const { result } = renderHook(() => useCanvas(a as never))
    await act(async () => {
      await result.current.openCanvas('canvases/a.md')
    })
    act(() =>
      result.current.addExcerptCard({
        source: 'documents/d.md',
        anchor: { start: 0, end: 1, exact: 'a', prefix: '', suffix: '' },
        snapshot: 'a',
        x: 0,
        y: 0,
        color: '#86efac'
      })
    )
    expect(result.current.canvas!.cards[0]).toMatchObject({ kind: 'excerpt', color: '#86efac' })
  })
})
