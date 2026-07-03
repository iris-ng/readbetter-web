import { useCallback, useEffect, useRef, useState } from 'react'
import { Anchor } from '../../core/anchor/anchor'
import {
  CanvasModel,
  Card,
  Viewport,
  emptyCanvas,
  parseCanvas,
  serializeCanvas,
  uniqueCanvasRef
} from '../../core/canvas/canvas'

const SAVE_DEBOUNCE_MS = 500

interface CanvasApi {
  readCanvas(ref: string): Promise<string | null>
  writeCanvas(ref: string, md: string): Promise<void>
}

export interface UseCanvas {
  canvas: CanvasModel | null
  activeRef: string | null
  openCanvas(ref: string): Promise<void>
  createCanvas(title: string, existingRefs: string[]): Promise<string>
  closeCanvas(): void
  addExcerptCard(input: { source: string; anchor: Anchor; snapshot: string; x: number; y: number; color?: string; sourceAnnotationId?: string }): void
  addNoteCard(input: { x: number; y: number }): void
  moveCard(id: string, x: number, y: number): void
  setCardNote(id: string, note: string): void
  removeCard(id: string): void
  addConnection(from: string, to: string): void
  removeConnection(from: string, to: string): void
  setConnectionLabel(from: string, to: string, label: string): void
  resizeCard(id: string, w: number, h: number): void
  setViewport(v: Viewport): void
  /** Rename the active canvas (persisted immediately; the file ref/id is unchanged). */
  renameCanvas(title: string): Promise<void>
  /** Soft-delete the active canvas: mark it deleted, persist, and close it. */
  deleteActive(): Promise<void>
  flush(): void
}

function cardId(): string {
  return crypto.randomUUID()
}

export function useCanvas(api: CanvasApi | undefined): UseCanvas {
  const [canvas, setCanvas] = useState<CanvasModel | null>(null)
  const [activeRef, setActiveRef] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const corruptRef = useRef(false)

  // Persist unsaved changes to the active canvas before we switch away from it, so opening or
  // creating another canvas never silently drops a within-debounce edit (data is never lost).
  const flushCurrent = useCallback(async () => {
    if (api && dirtyRef.current && activeRef && canvas && !corruptRef.current) {
      await api.writeCanvas(activeRef, serializeCanvas(canvas))
      dirtyRef.current = false
    }
  }, [api, activeRef, canvas])

  const openCanvas = useCallback(
    async (ref: string) => {
      if (!api) return
      await flushCurrent()
      const raw = await api.readCanvas(ref)
      dirtyRef.current = false
      corruptRef.current = false
      if (raw === null) {
        setCanvas(null)
        setActiveRef(null)
        return
      }
      try {
        setCanvas(parseCanvas(raw))
        setActiveRef(ref)
      } catch {
        corruptRef.current = true
        setCanvas(null)
        setActiveRef(ref)
      }
    },
    [api, flushCurrent]
  )

  const createCanvas = useCallback(
    async (title: string, existingRefs: string[]) => {
      await flushCurrent()
      const ref = uniqueCanvasRef(title, existingRefs)
      const model = emptyCanvas(ref.replace(/^canvases\//, '').replace(/\.md$/, ''), title)
      if (api) await api.writeCanvas(ref, serializeCanvas(model))
      dirtyRef.current = false
      corruptRef.current = false
      setCanvas(model)
      setActiveRef(ref)
      return ref
    },
    [api, flushCurrent]
  )

  const closeCanvas = useCallback(() => {
    setCanvas(null)
    setActiveRef(null)
    dirtyRef.current = false
  }, [])

  const mutate = useCallback((fn: (m: CanvasModel) => CanvasModel) => {
    dirtyRef.current = true
    setCanvas((prev) => (prev ? fn(prev) : prev))
  }, [])

  const addExcerptCard = useCallback(
    (input: { source: string; anchor: Anchor; snapshot: string; x: number; y: number; color?: string; sourceAnnotationId?: string }) =>
      mutate((m) => ({
        ...m,
        cards: [...m.cards, { kind: 'excerpt', id: cardId(), note: '', ...input }]
      })),
    [mutate]
  )

  const addNoteCard = useCallback(
    (input: { x: number; y: number }) =>
      mutate((m) => ({ ...m, cards: [...m.cards, { kind: 'note', id: cardId(), note: '', ...input }] })),
    [mutate]
  )

  const moveCard = useCallback(
    (id: string, x: number, y: number) =>
      mutate((m) => ({ ...m, cards: m.cards.map((c) => (c.id === id ? { ...c, x, y } : c)) })),
    [mutate]
  )

  const setCardNote = useCallback(
    (id: string, note: string) =>
      mutate((m) => ({
        ...m,
        cards: m.cards.map((c) => (c.id === id ? ({ ...c, note } as Card) : c))
      })),
    [mutate]
  )

  const removeCard = useCallback(
    (id: string) =>
      mutate((m) => ({
        ...m,
        cards: m.cards.filter((c) => c.id !== id),
        connections: m.connections.filter((cn) => cn.from !== id && cn.to !== id)
      })),
    [mutate]
  )

  const setViewport = useCallback((v: Viewport) => mutate((m) => ({ ...m, viewport: v })), [mutate])

  const addConnection = useCallback(
    (from: string, to: string) =>
      mutate((m) =>
        from === to || m.connections.some((c) => c.from === from && c.to === to)
          ? m
          : { ...m, connections: [...m.connections, { from, to }] }
      ),
    [mutate]
  )

  const removeConnection = useCallback(
    (from: string, to: string) =>
      mutate((m) => ({ ...m, connections: m.connections.filter((c) => !(c.from === from && c.to === to)) })),
    [mutate]
  )

  const setConnectionLabel = useCallback(
    (from: string, to: string, label: string) =>
      mutate((m) => ({
        ...m,
        connections: m.connections.map((c) =>
          c.from === from && c.to === to ? (label ? { ...c, label } : { from, to }) : c
        )
      })),
    [mutate]
  )

  const resizeCard = useCallback(
    (id: string, w: number, h: number) =>
      mutate((m) => ({
        ...m,
        cards: m.cards.map((c) =>
          c.id === id ? { ...c, w: Math.max(140, Math.round(w)), h: Math.max(60, Math.round(h)) } : c
        )
      })),
    [mutate]
  )

  // Rename writes immediately (not via the debounce) so the library list reflects it at once.
  const renameCanvas = useCallback(
    async (title: string) => {
      if (!api || !activeRef || !canvas || corruptRef.current) return
      const next = { ...canvas, title }
      setCanvas(next)
      dirtyRef.current = false
      await api.writeCanvas(activeRef, serializeCanvas(next))
    },
    [api, activeRef, canvas]
  )

  // Soft-delete: write the deleted model explicitly (no debounce race), then close it.
  const deleteActive = useCallback(async () => {
    if (!api || !activeRef || !canvas || corruptRef.current) return
    await api.writeCanvas(activeRef, serializeCanvas({ ...canvas, deleted: true }))
    dirtyRef.current = false
    setCanvas(null)
    setActiveRef(null)
  }, [api, activeRef, canvas])

  // Debounced persistence — only after a real mutation; never on load; never overwrite a corrupt file.
  useEffect(() => {
    if (!api || !activeRef || !canvas || corruptRef.current || !dirtyRef.current) return
    const handle = setTimeout(() => {
      void api.writeCanvas(activeRef, serializeCanvas(canvas))
      dirtyRef.current = false
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [api, activeRef, canvas])

  const flush = useCallback(() => {
    if (!api || !activeRef || !canvas || corruptRef.current || !dirtyRef.current) return
    void api.writeCanvas(activeRef, serializeCanvas(canvas))
    dirtyRef.current = false
  }, [api, activeRef, canvas])

  return {
    canvas,
    activeRef,
    openCanvas,
    createCanvas,
    closeCanvas,
    addExcerptCard,
    addNoteCard,
    moveCard,
    setCardNote,
    removeCard,
    addConnection,
    removeConnection,
    setConnectionLabel,
    resizeCard,
    setViewport,
    renameCanvas,
    deleteActive,
    flush
  }
}
