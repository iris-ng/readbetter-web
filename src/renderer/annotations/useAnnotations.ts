import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Anchor, Quad, createAnchor, resolveAnchor } from '../../core/anchor/anchor'
import type { RunOffset } from '../../core/pdf/pdfLayout'
import { computePageSelector, resolvePdfAnnotation } from '../../core/pdf/pageSelector'
import {
  Annotation,
  PinAnchor,
  SavedView,
  Sidecar,
  addSavedView,
  emptySidecar,
  parseSidecar,
  renameSavedView,
  removeSavedView,
  serializeSidecar
} from '../../core/sidecar/sidecar'
import { hashContent } from '../../core/hash'
import { DEFAULT_COLOR } from './palette'
import { Link } from '../../core/link/link'

const SAVE_DEBOUNCE_MS = 500

export interface ResolvedAnnotation {
  id: string
  color: string
  note: string
  range: { start: number; end: number }
  /** The annotation's own anchor, so callers (e.g. pinning) can pin the exact same range. */
  anchor: Anchor
  /** PDF only: page rectangles to draw (derived from the range, or the persisted fallback). */
  quads?: Quad[]
}

interface Api {
  readSidecar(sourcePath: string): Promise<string | null>
  writeSidecar(sourcePath: string, json: string): Promise<void>
}

export interface UseAnnotations {
  annotations: ResolvedAnnotation[]
  orphans: Annotation[]
  reattachingId: string | null
  createAnnotation(range: { start: number; end: number }): void
  setNote(id: string, note: string): void
  setColor(id: string, color: string): void
  remove(id: string): void
  beginReattach(id: string): void
  cancelReattach(): void
  reattach(id: string, range: { start: number; end: number }): void
  savedViews: SavedView[]
  saveView(name: string, pinnedAnchors: PinAnchor[]): void
  renameView(id: string, name: string): void
  deleteView(id: string): void
  links: Link[]
  addLink(l: Link): void
  removeLink(id: string): void
  /** Write immediately if dirty (e.g. on beforeunload). No-op when clean. */
  flush(): void
}

function uuid(): string {
  return crypto.randomUUID()
}

function anchorWithPage(
  documentText: string,
  range: { start: number; end: number },
  pageAnchoring: { runIndex: RunOffset[] } | undefined
): Anchor {
  const base = createAnchor(documentText, range.start, range.end)
  if (!pageAnchoring) return base
  const sel = computePageSelector(pageAnchoring.runIndex, range.start, range.end)
  return sel ? { ...base, page: sel } : base
}

export function useAnnotations(
  documentText: string,
  content: string,
  sourcePath: string | null,
  api: Api | undefined,
  pageAnchoring?: { runIndex: RunOffset[] }
): UseAnnotations {
  // The authoritative list of annotations (anchors), independent of resolution.
  const [annos, setAnnos] = useState<Annotation[]>([])
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [reattachingId, setReattachingId] = useState<string | null>(null)
  const documentIdRef = useRef<string>('')
  // Only a real user mutation marks state dirty. Loading a document must never trigger a
  // write — no clutter for un-annotated docs, no needless rewrite of an unchanged file.
  const dirtyRef = useRef(false)

  // Load + parse the sidecar whenever the document changes.
  useEffect(() => {
    let cancelled = false
    documentIdRef.current = ''
    dirtyRef.current = false
    setReattachingId(null)
    if (!sourcePath || !api) {
      setAnnos([])
      setSavedViews([])
      setLinks([])
      return
    }
    void api.readSidecar(sourcePath).then((raw) => {
      if (cancelled) return
      if (!raw) {
        setAnnos([])
        setSavedViews([])
        setLinks([])
        return
      }
      try {
        const sidecar = parseSidecar(raw)
        documentIdRef.current = sidecar.documentId
        setAnnos(sidecar.annotations)
        setSavedViews(sidecar.savedViews)
        setLinks(sidecar.links)
      } catch {
        // Corrupt/unreadable: treat as none, but never overwrite (see save guard below).
        setAnnos([])
        setSavedViews([])
        setLinks([])
        documentIdRef.current = '__corrupt__'
      }
    })
    return () => {
      cancelled = true
    }
  }, [sourcePath, api])

  // Persist (debounced) ONLY after a real user mutation. Never write on load, and never
  // overwrite a sidecar that failed to parse (avoid clobbering recoverable data).
  useEffect(() => {
    if (!sourcePath || !api) return
    if (documentIdRef.current === '__corrupt__') return
    if (!dirtyRef.current) return
    const handle = setTimeout(() => {
      if (!documentIdRef.current) documentIdRef.current = uuid()
      const sidecar: Sidecar = {
        ...emptySidecar(documentIdRef.current, hashContent(content)),
        annotations: annos,
        savedViews,
        links
      }
      void api.writeSidecar(sourcePath, serializeSidecar(sidecar))
      dirtyRef.current = false
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [annos, savedViews, links, sourcePath, api, content])

  // Derive resolved annotations + orphans from anchors against the current document text.
  const { annotations, orphans } = useMemo(() => {
    const resolved: ResolvedAnnotation[] = []
    const orphaned: Annotation[] = []
    for (const a of annos) {
      if (pageAnchoring) {
        const res = resolvePdfAnnotation(a.anchor, documentText, pageAnchoring.runIndex)
        if (res)
          resolved.push({ id: a.id, color: a.color, note: a.note, range: res.range, anchor: a.anchor, quads: res.quads })
        else orphaned.push(a)
      } else {
        const range = resolveAnchor(a.anchor, documentText)
        if (range) resolved.push({ id: a.id, color: a.color, note: a.note, range, anchor: a.anchor })
        else orphaned.push(a)
      }
    }
    return { annotations: resolved, orphans: orphaned }
  }, [annos, documentText, pageAnchoring])

  const createAnnotation = useCallback(
    (range: { start: number; end: number }) => {
      const anchor = anchorWithPage(documentText, range, pageAnchoring)
      dirtyRef.current = true
      setAnnos((prev) => [...prev, { id: uuid(), anchor, color: DEFAULT_COLOR, note: '' }])
    },
    [documentText, pageAnchoring]
  )

  const setNote = useCallback((id: string, note: string) => {
    dirtyRef.current = true
    setAnnos((prev) => prev.map((a) => (a.id === id ? { ...a, note } : a)))
  }, [])

  const setColor = useCallback((id: string, color: string) => {
    dirtyRef.current = true
    setAnnos((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)))
  }, [])

  const remove = useCallback((id: string) => {
    dirtyRef.current = true
    setAnnos((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const beginReattach = useCallback((id: string) => setReattachingId(id), [])
  const cancelReattach = useCallback(() => setReattachingId(null), [])

  const reattach = useCallback(
    (id: string, range: { start: number; end: number }) => {
      const anchor = anchorWithPage(documentText, range, pageAnchoring)
      dirtyRef.current = true
      setAnnos((prev) => prev.map((a) => (a.id === id ? { ...a, anchor } : a)))
      setReattachingId(null)
    },
    [documentText, pageAnchoring]
  )

  const saveView = useCallback((name: string, pinnedAnchors: PinAnchor[]) => {
    dirtyRef.current = true
    setSavedViews((prev) => addSavedView(prev, { id: uuid(), name, pinnedAnchors }))
  }, [])

  const renameView = useCallback((id: string, name: string) => {
    dirtyRef.current = true
    setSavedViews((prev) => renameSavedView(prev, id, name))
  }, [])

  const deleteView = useCallback((id: string) => {
    dirtyRef.current = true
    setSavedViews((prev) => removeSavedView(prev, id))
  }, [])

  const addLink = useCallback((l: Link) => {
    dirtyRef.current = true
    setLinks((prev) => [...prev, l])
  }, [])

  const removeLink = useCallback((id: string) => {
    dirtyRef.current = true
    setLinks((prev) => prev.filter((l) => l.id !== id))
  }, [])

  const flush = useCallback(() => {
    if (!sourcePath || !api) return
    if (documentIdRef.current === '__corrupt__') return
    if (!dirtyRef.current) return
    if (!documentIdRef.current) documentIdRef.current = uuid()
    const sidecar: Sidecar = {
      ...emptySidecar(documentIdRef.current, hashContent(content)),
      annotations: annos,
      savedViews,
      links
    }
    void api.writeSidecar(sourcePath, serializeSidecar(sidecar))
    dirtyRef.current = false
  }, [sourcePath, api, content, annos, savedViews, links])

  return {
    annotations,
    orphans,
    reattachingId,
    createAnnotation,
    setNote,
    setColor,
    remove,
    beginReattach,
    cancelReattach,
    reattach,
    savedViews,
    saveView,
    renameView,
    deleteView,
    links,
    addLink,
    removeLink,
    flush
  }
}
