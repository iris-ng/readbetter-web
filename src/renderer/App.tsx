import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { getAdapter, PlatformAdapter, LibraryEntry } from './platform'
import { useProjects } from './hooks/useProjects'
import { ProjectsView } from './components/ProjectsView'
import { useTheme } from './hooks/useTheme'
import { ThemeToggle } from './components/ThemeToggle'
import { Icon } from './components/Icon'
import { CanvasStudio } from './components/CanvasStudio'
import { LibraryCockpit } from './components/LibraryCockpit'
import { useCanvas } from './canvas/useCanvas'
import { excerptCardFromDrop, type ExcerptDropPayload } from './canvas/excerptDrag'
import { placeNewCard } from './canvas/placement'
import { exportCanvasToObsidian } from './canvas/obsidianExport'
import { parseCanvas, serializeCanvas, type ExcerptCard as CanvasExcerptCard } from '../core/canvas/canvas'
import type { CanvasEntry } from './platform'
import { DocumentModel } from '../core/model/document'
import { importDocument } from '../core/import'
import { buildPdfModel } from '../core/import/pdf'
import type { PdfParseResult } from '../core/pdf/liteparse'
import type { RenderPage, PdfRegionAnchor } from './components/PdfPageView'
import { DocumentPane } from './components/DocumentPane'
import type { ResolvedAnnotation } from './annotations/useAnnotations'
import { useRecents } from './hooks/useRecents'
import { useTabs, isDetachedBoot, detachUrl } from './hooks/useTabs'
import { usePanes } from './hooks/usePanes'
import { useCrossWindow } from './hooks/useCrossWindow'
import { WINDOW_ID, type CrossWindowBus } from './crossWindow/bus'
import { OpenRail } from './components/OpenRail'
import { useRailState } from './hooks/useRailState'
import { QuickPicker } from './components/QuickPicker'
import { LockHolder } from './components/LockHolder'
import { resolveAnchor, type Anchor } from '../core/anchor/anchor'
import type { PageRectRegion } from '../core/anchor/region'
import { summarizeStructure } from '../core/model/structure'
import { makeLinkPair, type Link } from '../core/link/link'
import { LinkLayer, type RenderedLink } from './components/LinkLayer'
import type { LinkPick } from './annotations/linkPick'
import { planLinkNav, type LinkNavHolder } from './annotations/linkNav'
import { PaneRow } from './components/PaneRow'
import { Pane } from './components/Pane'
import { PaneHeader } from './components/PaneHeader'
import { DocPaneBody } from './components/DocPaneBody'
import { CanvasPaneBody } from './components/CanvasPaneBody'
import type { Pane as PaneModel } from './hooks/usePanes'

type Pt = { x: number; y: number }

export interface Loaded {
  doc: DocumentModel
  /** The document ref (root-relative path), carried under the legacy field name. */
  sourcePath: string
  content: string
  pdf: { parse: PdfParseResult; renderPage: RenderPage } | null
}

export function App({
  adapter,
  busFactory
}: {
  adapter?: PlatformAdapter
  /** Test seam: inject an in-memory cross-window bus (forwarded to useCrossWindow). Prod omits it
   *  so the hook defaults to a real BroadcastChannel. Used only by the cross-window App tests. */
  busFactory?: () => CrossWindowBus
} = {}): JSX.Element {
  const [platform] = useState<PlatformAdapter>(() => adapter ?? getAdapter())
  const theme = useTheme()
  // Registry + active-project state lives entirely in this hook (spec §8.1). `platform` is the
  // STABLE adapter from useState above, so useProjects' mount effect runs exactly once.
  const projects = useProjects(platform)
  const projectId = projects.active?.id ?? null
  const [library, setLibrary] = useState<LibraryEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [restoreNote, setRestoreNote] = useState<string | null>(null)
  // Per-tabId parsed doc model (C3). Was `docCacheRef` (a ref) + `loaded` (state); lifted to STATE
  // so an async model arrival re-renders the pane that shows it. Type is still Map<tabId, Loaded>.
  const [docModelByTab, setDocModelByTab] = useState<Map<string, Loaded>>(() => new Map())
  const recents = useRecents(projectId)
  // Bind the active projectId into the narrow CanvasApi useCanvas expects (ref-only), memoized so
  // the hook's debounce/flush effects don't churn. `null` projectId → a harmless empty id; the
  // workspace (and thus useCanvas calls) only render once a project is active.
  const canvasApi = useMemo(
    () => ({
      readCanvas: (ref: string) => platform.readCanvas(projectId ?? '', ref),
      writeCanvas: (ref: string, md: string) => platform.writeCanvas(projectId ?? '', ref, md)
    }),
    [platform, projectId]
  )
  const canvasState = useCanvas(canvasApi)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const previewRefsSig =
    canvasState.canvas?.cards
      .filter((card): card is CanvasExcerptCard => card.kind === 'excerpt' && !!card.previewAssetRef)
      .map((card) => card.previewAssetRef)
      .sort()
      .join('|') ?? ''
  useEffect(() => {
    const refs = Array.from(
      new Set(
        canvasState.canvas?.cards
          .filter((card): card is CanvasExcerptCard => card.kind === 'excerpt' && !!card.previewAssetRef)
          .map((card) => card.previewAssetRef as string) ?? []
      )
    )
    let cancelled = false
    const objectUrls: string[] = []
    if (!projectId || refs.length === 0) {
      setPreviewUrls({})
      return
    }
    void Promise.all(
      refs.map(async (ref) => {
        try {
          const blob = await platform.readCanvasPreview(projectId, ref)
          if (!blob || cancelled) return null
          const url = URL.createObjectURL(blob)
          objectUrls.push(url)
          return { ref, url }
        } catch {
          // Missing or unreadable preview assets should not hide the text fallback.
          return null
        }
      })
    ).then((entries) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const entry of entries) {
        if (entry) next[entry.ref] = entry.url
      }
      setPreviewUrls(next)
    })
    return () => {
      cancelled = true
      for (const url of objectUrls) URL.revokeObjectURL(url)
    }
  }, [platform, projectId, previewRefsSig])
  const tabs = useTabs()
  const panes = usePanes(tabs, projectId)
  // usePanes returns a FRESH `panes` array every render, so using it directly in useCallback/useEffect
  // deps would make every memo change each render (recomputeLines → setRenderedLinks → infinite loop).
  // These stable string/ref signatures change only when the relevant pane set actually changes.
  const docPaneSig = panes.panes.filter((p) => p.kind === 'doc').map((p) => `${p.tabId}:${p.ref}`).join('|')
  const canvasPaneRef = panes.panes.find((p) => p.kind === 'canvas')?.ref ?? null
  // Satellite mode: this window was opened with &detached=1 (move-semantics from the hub).
  // Captured in a ref so it stays stable even after useTabs rewrites the URL (mirror effect).
  const detachedRef = useRef<boolean>(isDetachedBoot())
  const detached = detachedRef.current
  // Presence entity = the FOCUSED pane (back-compat single-entity mirror, C5). entities = ALL shown
  // doc/canvas panes, so a peer can resolve a doc held in ANY of this window's panes (3b consumes it).
  const focusedPane = panes.panes.find((p) => p.focused) ?? null
  const presenceEntity = focusedPane ? { kind: focusedPane.kind, ref: focusedPane.ref } : null
  const presenceEntities = panes.panes.map((p) => ({ kind: p.kind, ref: p.ref }))
  const crossWindow = useCrossWindow(
    { role: detached ? 'satellite' : 'hub', entity: presenceEntity, entities: presenceEntities },
    busFactory
  )
  // The pinned canvas (persisted via rb-pinned-canvas) is owned by usePanes; App reads/clears it
  // through panes.pinnedRef / panes.unpin (single source of truth — no second usePinnedCanvas).
  const rail = useRailState()
  // Per-tab single-open status: true when this tab's entity is held by another window.
  const [lockedTabs, setLockedTabs] = useState<Record<string, boolean>>({})
  const [canvasList, setCanvasList] = useState<CanvasEntry[]>([])
  const [showQuickPick, setShowQuickPick] = useState(false)
  const [pickQuery, setPickQuery] = useState('')
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [flashRange, setFlashRange] = useState<{ start: number; end: number } | null>(null)
  // Each open DocumentPane reports its resolved annotations up, keyed by its source ref, so the
  // docked canvas can live-sync excerpt-card colors (App can no longer read a pane's annotations
  // directly). Keyed by ref because two panes may report concurrently. Seed of the cross-pane
  // registry Task 7 will formalize.
  const [paneAnnotations, setPaneAnnotations] = useState<Record<string, ResolvedAnnotation[]>>({})
  // Cross-window card-color sync (Task 8). When an annotation's color changes in THIS window, a
  // detached canvas window can't see it (it has no doc pane), so broadcast the change. We detect it
  // by diffing each reported annotation's color against the last color we saw for that id. The post
  // happens HERE (in the report handler), never inside the setState updater — React 18-safe.
  const prevAnnColorsRef = useRef<Map<string, string>>(new Map())
  const reportAnnotations = useCallback(
    (ref: string, anns: ResolvedAnnotation[]) => {
      const seen = prevAnnColorsRef.current
      for (const a of anns) {
        const prev = seen.get(a.id)
        // Seed silently on first sight (prev === undefined); only an actual color CHANGE broadcasts.
        if (prev !== undefined && prev !== a.color) {
          crossWindow.post({ type: 'card-color', annotationId: a.id, color: a.color })
        }
        seen.set(a.id, a.color)
      }
      setPaneAnnotations((prev) => ({ ...prev, [ref]: anns }))
    },
    // Depend on the STABLE `post` (useCallback [] in the hook), NOT the `crossWindow` object, which
    // is a fresh literal every render — depending on it would give reportAnnotations a new identity
    // each render, refiring DocumentPane's report effect → setState → re-render → infinite loop.
    [crossWindow.post]
  )
  // Cross-window card-color OVERRIDES (Task 8, receiver side). A detached canvas window has no doc
  // pane, so colorForCard's paneAnnotations lookup is empty; the `card-color` messages a doc window
  // broadcasts land here (annotationId → color) and win in colorForCard. In-memory render state only
  // (never persisted — the sidecar still holds the authoritative color).
  const [cardColorOverrides, setCardColorOverrides] = useState<Record<string, string>>({})
  // Each open DocumentPane reports its links up, keyed by source ref. App pairs the two panes'
  // links by shared id and resolves each endpoint to a point relative to paneRowRef,
  // feeding the always-on LinkLayer.
  const [paneLinks, setPaneLinks] = useState<Record<string, Link[]>>({})
  const reportLinks = useCallback(
    (ref: string, links: Link[]) => setPaneLinks((prev) => ({ ...prev, [ref]: links })),
    []
  )
  // Cross-pane registry: each open DocumentPane registers its useAnnotations.addCrossLink here,
  // keyed by its source ref, so a link forged in one pane can write into the other's sidecar.
  // A ref-held Map (mutated imperatively — never state): the link writer reads it synchronously
  // and re-renders should not depend on its contents. The VALUE is an object { addCrossLink } so
  // Task 9 can add removeCrossLink to the same shape without re-plumbing the registry.
  const paneRegistry = useRef<
    Map<string, { addLink: (l: Link) => void; removeLink: (id: string) => void }>
  >(new Map())
  const registerPane = useCallback(
    (ref: string, api: { addLink: (l: Link) => void; removeLink: (id: string) => void }) => {
      paneRegistry.current.set(ref, api)
    },
    []
  )
  const unregisterPane = useCallback((ref: string) => {
    paneRegistry.current.delete(ref)
  }, [])
  // Connect tool: two-click smart create across two panes.
  // highlight+highlight → cross-link; any bare-text pick (word+word or mixed) → connection.
  const [connectMode, setConnectMode] = useState(false)
  const [pendingPick, setPendingPick] = useState<{ docRef: string; pick: LinkPick } | null>(null)
  // A pick whose SOURCE is in another window (Task 6): arrives over the bus as `pending-pick`.
  // Held in a ref (read synchronously by handleConnectPick, never drives render) — the LOCAL
  // pendingPick remains the visible "click the other pane…" affordance.
  const remotePendingPickRef = useRef<{ windowId: string; docRef: string; pick: LinkPick } | null>(null)
  // The ref of the most-recently-active canvas across ALL windows (Task 7). Updated when THIS
  // window opens a canvas (posted to bus) or when another window posts active-canvas. Read
  // synchronously in handleSendExcerpt — no render needed, so a ref (not state) is correct.
  const remoteActiveCanvasRef = useRef<string | null>(null)
  // Latest-ref for handleSendExcerpt (Task 7). Allows the onMessage effect to call the current
  // send handler without listing it as a dep (handleSendExcerpt is defined later in the component).
  const handleSendExcerptRef = useRef<((payload: import('./canvas/excerptDrag').ExcerptDropPayload) => void) | null>(null)
  // Mirror connectMode into a ref so the stable onMessage closure can read the current value
  // without going stale (the closure is re-registered only when effect deps change, not on every
  // connectMode flip). Pattern mirrors handleSendExcerptRef above.
  const connectModeRef = useRef(connectMode)
  connectModeRef.current = connectMode
  // Legacy alias kept for the Escape / secondaryRef clear-effects below.
  const pendingConnStart = pendingPick

  // Toggle Draw locally AND announce it so every window arms/disarms together (Task 6). Clearing
  // local + remote pending picks on every toggle keeps the two-window handshake from carrying a
  // stale source across a disarm/re-arm. `crossWindow.post` is stable.
  const toggleDraw = useCallback(() => {
    const next = !connectMode
    setConnectMode(next)
    crossWindow.post({ type: 'draw-mode', active: next })
    setPendingPick(null)
    remotePendingPickRef.current = null
  }, [connectMode, crossWindow])

  const handleConnectPick = useCallback((docRef: string, pick: LinkPick) => {
    if (!connectMode) return // defense-in-depth: create only in Connect mode (C2)
    // ── Cross-window completion (Task 6) ─────────────────────────────────────────────────────
    const remote = remotePendingPickRef.current
    if (!pendingPick && remote && remote.docRef !== docRef) {
      const pair = makeLinkPair(remote.docRef, remote.pick.anchor, docRef, pick.anchor)
      paneRegistry.current.get(docRef)?.addLink(pair.b)
      crossWindow.post({ type: 'link-create', forDocRef: remote.docRef, record: pair.a })
      setPendingPick(null)
      remotePendingPickRef.current = null
      return
    }
    if (!pendingPick) {
      // First LOCAL pick: arm locally AND broadcast it so a pick in another window can complete it.
      setPendingPick({ docRef, pick })
      crossWindow.post({ type: 'pending-pick', windowId: WINDOW_ID, docRef, pick })
      return
    }
    if (pendingPick.docRef === docRef) {
      if (pendingPick.pick.kind === 'region' || pick.kind === 'region') {
        const pair = makeLinkPair(pendingPick.docRef, pendingPick.pick.anchor, docRef, pick.anchor)
        paneRegistry.current.get(docRef)?.addLink(pair.a)
        paneRegistry.current.get(docRef)?.addLink(pair.b)
        setPendingPick(null)
        return
      }
      // Same pane: re-pick start (and re-broadcast the new source).
      setPendingPick({ docRef, pick })
      crossWindow.post({ type: 'pending-pick', windowId: WINDOW_ID, docRef, pick })
      return
    }
    // One Link per completed pair, pinned to each end's word anchor.
    const pair = makeLinkPair(pendingPick.docRef, pendingPick.pick.anchor, docRef, pick.anchor)
    paneRegistry.current.get(pendingPick.docRef)?.addLink(pair.a)
    paneRegistry.current.get(docRef)?.addLink(pair.b)
    setPendingPick(null)
  }, [connectMode, pendingPick, crossWindow])

  // Escape key clears Connect mode.
  useEffect(() => {
    if (!connectMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { setConnectMode(false); setPendingPick(null); remotePendingPickRef.current = null }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [connectMode])


  // Selected link id (A3): set when a path is clicked; cleared on Delete/Backspace,
  // Escape, or a click on empty space. Null means no selection. Carries either a
  // connection id or a cross-link id.
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)

  // Shared removal helper: removes a link (connection OR cross-link) from BOTH open panes.
  // Captures refs synchronously; registry removes run OUTSIDE any setState updater (React-18 safe).
  const removeLinkById = useCallback((id: string): void => {
    for (const p of panes.panes) if (p.kind === 'doc') paneRegistry.current.get(p.ref)?.removeLink(id)
  }, [panes.panes])

  // Keydown handler for the selected link (A3).
  // Active only while a link is selected; cleans up on dep-change or unmount (React-18 safe).
  useEffect(() => {
    if (!selectedLinkId) return
    const onKey = (e: KeyboardEvent): void => {
      const t = document.activeElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return // don't eat edits
      if (!connectMode) return // gate: Delete only removes in Connect mode (C2)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const id = selectedLinkId
        removeLinkById(id)
        setSelectedLinkId(null)
      } else if (e.key === 'Escape') {
        setSelectedLinkId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [connectMode, selectedLinkId, removeLinkById])

  // Right-click a dot/arc → Remove (C1). Connect mode guard is load-bearing: no-op in normal mode.
  // Removes immediately (no menu) — same removal logic as Delete keydown via the shared helper.
  // The `pos` arg is available for a future menu; C1 ignores it and removes immediately.
  const handleLinkRemoveRequest = useCallback(
    (_id: string, _pos: { clientX: number; clientY: number }): void => {
      if (!connectMode) return
      const id = _id // capture synchronously
      removeLinkById(id)
      setSelectedLinkId(null)
    },
    [connectMode, removeLinkById]
  )


  // Per-pane imperative "scroll to + flash this range" requests (clicking a link dot/arc). The
  // `nonce` (a monotonic ref counter, computed synchronously — React 18-safe) guarantees the pane's
  // jump effect refires even when the SAME range is jumped to twice in a row.
  // Per-tabId imperative "scroll to + flash this range" requests (C3). Each DocPaneBody reads its
  // own entry connJumpByTab[tabId]. The nonce (a monotonic ref counter, synchronous → React-18
  // safe) refires a pane's jump effect even when the SAME range is jumped twice in a row.
const [connJumpByTab, setConnJumpByTab] = useState<Record<string, { start: number; end: number; nonce: number } | null>>({})
 const [regionJumpByTab, setRegionJumpByTab] = useState<
  Record<string, { pageIndex: number; rect: PageRectRegion['rect']; nonce: number } | null>
 >({})
 const jumpNonce = useRef(0)
 const setConnJump = (tabId: string, v: { start: number; end: number; nonce: number } | null): void =>
 setConnJumpByTab((prev) => ({ ...prev, [tabId]: v }))
 const setRegionJump = (
  tabId: string,
  v: { pageIndex: number; rect: PageRectRegion['rect']; nonce: number } | null
 ): void => setRegionJumpByTab((prev) => ({ ...prev, [tabId]: v }))

const firstPageRectRegion = (anchor: Anchor): PageRectRegion | null => {
 return (anchor.regions?.find((r) => r.kind === 'page-rect') as PageRectRegion | undefined) ?? null
}
const samePageRect = (
 a: { pageIndex: number; rect: PageRectRegion['rect'] } | null | undefined,
 b: PageRectRegion
): boolean => {
 return (
  !!a &&
  a.pageIndex === b.pageIndex &&
  a.rect.x === b.rect.x &&
  a.rect.y === b.rect.y &&
  a.rect.w === b.rect.w &&
  a.rect.h === b.rect.h
 )
}
  // Per-tabId find-in-page open state (Task 8). Each DocPaneBody reads its own entry; the header
  // magnifier toggles it, Cmd/Ctrl+F opens (never toggles) it on the FOCUSED doc pane. Pure updaters
  // (React-18 safe) — two panes hold independent state, keyed by tabId like connJumpByTab above.
  const [searchOpenByTab, setSearchOpenByTab] = useState<Record<string, boolean>>({})
  const toggleSearch = (tabId: string): void =>
    setSearchOpenByTab((m) => ({ ...m, [tabId]: !m[tabId] }))
  const closeSearch = (tabId: string): void =>
    setSearchOpenByTab((m) => ({ ...m, [tabId]: false }))
  // Cmd/Ctrl+F (not Shift, so it never collides with a browser/OS "find all" chord) OPENS — never
  // toggles — search on the FOCUSED doc pane, so the shortcut can never accidentally close a pane's
  // search row. Canvas-focused / no focused pane → no-op (search is doc-only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        const fp = panes.panes.find((p) => p.focused)
        if (fp && fp.kind === 'doc') {
          e.preventDefault()
          setSearchOpenByTab((m) => ({ ...m, [fp.tabId]: true }))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panes.panes])
  // Resolve which SHOWN doc pane holds a ref (scans panes instead of checking primary/secondary).
  const docPaneForRef = (ref: string): PaneModel | null =>
    panes.panes.find((p) => p.kind === 'doc' && p.ref === ref) ?? null
  // A cross-window open-entity jump: the hub opened a doc tab in response to an `open-entity`
  // message; apply the jump to the PRIMARY pane once the doc loads (reuses the jump-after-load
  // pattern, keyed on loaded.sourcePath). The shared link id travels over the bus (not persisted);
  // the receiver resolves its OWN endpoint from the id once the doc's records are reported.
  const pendingOpenJump = useRef<{ ref: string; linkId?: string; anchor?: Anchor } | null>(null)

  // Route a follow-link whose partner endpoint is NOT a shown doc pane in this window. Three cases:
  //   • another window holds the partner doc → ask it to navigate (carry the shared link `id`, not
  //     any anchor — our endpoint anchor is meaningless in the partner's different text);
  //   • nobody holds it and we ARE the hub → open it locally and jump once it loads (the
  //     pendingOpenJump pattern; BroadcastChannel never echoes a post to its own sender, so routing
  //     this to ourselves over the bus would silently do nothing);
  //   • nobody holds it and we're a satellite → ask the hub to open it.
  // `at` is the slot the partner occupies when opened locally; planLinkNav decides it with a uniform
  // rule: beside the holder on the right (holderIdx + 1), or to the holder's left (holderIdx) when
  // the layout is at capacity. `keep` is the holder's tabId, protecting it from cap-eviction in
  // panes.show so the doc the user followed FROM stays visible.
  const followLinkCrossWindow = useCallback((partnerRef: string, linkId: string, at: number, keep?: string): void => {
    const holderWindowId = crossWindow.windowHolding('doc', partnerRef)
    if (holderWindowId) {
      // Raise the holder window to the front BEFORE navigating. A background window cannot focus
      // itself (browsers block programmatic focus without a user gesture in THAT window), so the
      // receiver's window.focus() alone is silently ignored — the doc scrolls but the window you
      // clicked in shows nothing ("detach dot does nothing"). We raise it here instead, inside THIS
      // window's click gesture, by targeting the holder's browsing-context name (== its windowId,
      // which every window sets on boot in useCrossWindow). Empty URL → focus-only, no reload.
      try { window.open('', holderWindowId) } catch { /* pop-up blocked — the navigate below still routes */ }
      crossWindow.post({ type: 'navigate', targetRef: partnerRef, linkId })
  } else if (!detached) {
    pendingOpenJump.current = { ref: partnerRef, linkId }
    const title = partnerRef.split('/').pop() ?? partnerRef
    const id = tabs.openTab('doc', partnerRef, title)
    if (panes.panes.length >= panes.maxShown) {
      const canvasPane = panes.panes.find((p) => p.kind === 'canvas')
      if (canvasPane && canvasPane.tabId !== keep && !panes.isPinned(canvasPane.tabId)) panes.park(canvasPane.tabId)
    }
    panes.show(id, { at, keep })
  } else {
      crossWindow.post({ type: 'open-entity', kind: 'doc', ref: partnerRef, linkId })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossWindow, detached, tabs])

  // Receiver-side resolution (Task 5): jump the local pane that holds `ref` to ITS OWN endpoint of
  // the link `linkId`. The clicking window sent only the shared id — we look the link up in THIS
  // pane's reported records (connections → resolveAnchor; cross-links → that record's own
  // annotationId, matching the in-window cross-link nav). Returns true if a jump was triggered.
  // Mirrors handleLinkNavigate's per-pane resolution, but keyed on a single ref (no 'from'/'to':
  // there is exactly one endpoint of a given link in a given doc).
  const jumpPaneToLink = useCallback((ref: string, linkId: string): boolean => {
    const pane = docPaneForRef(ref)
    if (!pane) return false
    const model = docModelByTab.get(pane.tabId)
    if (!model) return false
    const link = (paneLinks[ref] ?? []).find((l) => l.id === linkId)
    if (!link) return false
    const region = firstPageRectRegion(link.anchor)
    if (region) {
      setRegionJump(pane.tabId, { pageIndex: region.pageIndex, rect: region.rect, nonce: ++jumpNonce.current })
      return true
    }
    const r = resolveAnchor(link.anchor, model.doc.text)
    if (!r) return false
    setConnJump(pane.tabId, { start: r.start, end: r.end, nonce: ++jumpNonce.current })
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes.panes, docModelByTab, paneLinks])

  // Receiver-side resolution for card→source (Task 8). Unlike the linkId path, the message carries
  // the SOURCE doc's OWN anchor (the excerpt was lifted from `ref`), so it resolves directly in this
  // pane's loaded text. Jump whichever local pane holds `ref` to that range. Returns true if jumped.
const jumpPaneToAnchor = useCallback((ref: string, anchor: Anchor): boolean => {
 const pane = docPaneForRef(ref)
 if (!pane) return false
 const region = firstPageRectRegion(anchor)
 if (region) {
  setRegionJump(pane.tabId, { pageIndex: region.pageIndex, rect: region.rect, nonce: ++jumpNonce.current })
  return true
 }
 const model = docModelByTab.get(pane.tabId)
 if (!model) return false
    const r = resolveAnchor(anchor, model.doc.text)
    if (!r) return false
    setConnJump(pane.tabId, { start: r.start, end: r.end, nonce: ++jumpNonce.current })
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panes.panes, docModelByTab])

  // Unified LinkLayer navigate callback (A2/AM1): handles both connections and cross-links.
  // `toEnd` is the END to navigate TO:
  //   'from' = primary pane endpoint → jump PRIMARY pane only (dot click on secondary dot);
  //   'to'   = secondary pane endpoint → jump SECONDARY pane only (dot click on primary dot);
  //   'both' = arc body click → jump EACH pane to its own endpoint simultaneously.
  // Task 5: a link may have ONE endpoint in this window and its partner in another window (lone
  // dot). When the navigation TARGET is not a local pane, route it over the cross-window bus.
  const handleLinkNavigate = useCallback((id: string, toEnd: 'from' | 'to' | 'both') => {
    const docPanes = panes.panes.filter((p) => p.kind === 'doc')
    if (docPanes.length === 0) return
    const nonce = ++jumpNonce.current
    // Find the pane(s) actually holding this link id (ascending index). 0/1/2 holders.
    const holders: LinkNavHolder[] = []
    docPanes.forEach((p, idx) => {
      if ((paneLinks[p.ref] ?? []).some((l) => l.id === id)) holders.push({ idx, tabId: p.tabId })
    })
    if (holders.length === 0) return
    const jumpAnchorInPane = (pane: PaneModel, anchor: Anchor): void => {
      const region = firstPageRectRegion(anchor)
      if (region) {
        setRegionJump(pane.tabId, { pageIndex: region.pageIndex, rect: region.rect, nonce })
        return
      }
      const text = docModelByTab.get(pane.tabId)?.doc.text ?? ''
      const r = resolveAnchor(anchor, text)
      if (r) setConnJump(pane.tabId, { start: r.start, end: r.end, nonce })
    }
    if (holders.length === 1) {
      const pane = docPanes[holders[0].idx]
      const sameDocLinks = (paneLinks[pane.ref] ?? []).filter((l) => l.id === id && l.otherDocRef === pane.ref)
      if (sameDocLinks.length >= 2) {
        const targets =
          toEnd === 'both' ? [sameDocLinks[0], sameDocLinks[1]] : toEnd === 'from' ? [sameDocLinks[0]] : [sameDocLinks[1]]
        for (const target of targets) jumpAnchorInPane(pane, target.anchor)
        return
      }
    }

    const plan = planLinkNav(holders, toEnd, panes.maxShown)
    const jump = (pane: PaneModel): void => {
      const link = (paneLinks[pane.ref] ?? []).find((l) => l.id === id)
      if (!link) return
      jumpAnchorInPane(pane, link.anchor)
    }
    for (const idx of plan.jump) jump(docPanes[idx])
    if (plan.follow) {
      const holder = docPanes[plan.follow.holderIdx]
      const link = (paneLinks[holder.ref] ?? []).find((l) => l.id === id)
      const holderPaneIdx = panes.panes.findIndex((p) => p.tabId === holder.tabId)
      const openAt =
        holderPaneIdx >= 0
          ? plan.follow.at > plan.follow.holderIdx
            ? holderPaneIdx + 1
            : holderPaneIdx
          : plan.follow.at
      if (link) followLinkCrossWindow(link.otherDocRef, link.id, openAt, holder.tabId)
    }
  }, [panes.panes, panes.maxShown, paneLinks, docModelByTab, followLinkCrossWindow])

  // Unified LinkLayer select callback (A3): any link id (connection OR cross-link) is held in
  // selection state so the arc gets data-selected="true". Delete removes either type (A3).
  const handleLinkSelect = useCallback((id: string) => {
    setSelectedLinkId(id)
  }, [])

  // Apply a pending open-jump once its target doc has loaded — into EITHER pane: the cross-window
  // `open-entity` path opens it as the PRIMARY tab, while a local follow-link opens it BESIDE (the
  // secondary pane). Resolve the link id against the now-loaded pane's OWN reported records and jump.
  // Keyed on paneLinks too: opening loads the doc, but the pane reports its records on a later
  // commit, so this effect must refire when those arrive (jumpPaneToLink no-ops until then).
  useEffect(() => {
    const p = pendingOpenJump.current
    if (p && docPaneForRef(p.ref)) {
      const jumped = p.linkId ? jumpPaneToLink(p.ref, p.linkId) : p.anchor ? jumpPaneToAnchor(p.ref, p.anchor) : false
      if (jumped) pendingOpenJump.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPaneSig, docModelByTab, paneLinks, jumpPaneToLink, jumpPaneToAnchor])

  // Active-canvas advertisement (Task 7). When THIS window opens (or changes) its canvas, broadcast
  // the ref so other windows know where to route excerpt sends. `crossWindow.post` is stable.
  useEffect(() => {
    if (canvasState.activeRef) {
      crossWindow.post({ type: 'active-canvas', ref: canvasState.activeRef })
    }
  }, [canvasState.activeRef, crossWindow])

  // Cross-window follow-link receiver (Task 5). Register a single stable app handler with the bus
  // (the hook owns the bus lifecycle / subscription). Incoming `navigate` jumps the matching local
  // pane; `open-entity` opens the entity in the hub (then jumps once it loads). Best-effort focus.
  useEffect(() => {
    crossWindow.onMessage((msg) => {
      if (msg.type === 'draw-mode') {
        // Global Draw (Task 6): arm/disarm in lockstep with every other window. Clear any pending
        // source on disarm so a stale handshake can't carry across a re-arm.
        setConnectMode(msg.active)
        if (!msg.active) { setPendingPick(null); remotePendingPickRef.current = null }
        return
      }
      if (msg.type === 'presence') {
        // A window joined (or re-announced itself) after mount. If THIS window currently has Draw
        // armed, re-broadcast draw-mode:true so the newcomer arms itself automatically (Task 6 fix:
        // late-joining windows never received the original toggle broadcast). BroadcastChannel does
        // not self-echo, so we only receive presence from OTHER windows — no loop risk. We do NOT
        // re-broadcast when Draw is off (idle windows must not generate traffic).
        if (connectModeRef.current) crossWindow.post({ type: 'draw-mode', active: true })
        return
      }
      if (msg.type === 'pending-pick') {
        // A source pick is waiting in ANOTHER window (Task 6). Stash it so the next LOCAL pick can
        // complete the cross-window pair. Ignore our own echo (the in-memory hub never self-echoes,
        // but a real BroadcastChannel from THIS window's own post would never arrive here either).
        if (msg.windowId !== WINDOW_ID) {
          remotePendingPickRef.current = { windowId: msg.windowId, docRef: msg.docRef, pick: msg.pick }
        }
        return
      }
      if (msg.type === 'link-create') {
        // The completing window forged a pair and asks US to persist the end we OWN (Task 6).
        const api = paneRegistry.current.get(msg.forDocRef)
        if (api) api.addLink(msg.record)
        return
      }
      if (msg.type === 'active-canvas') {
        // Another window opened/focused a canvas (Task 7). Track the most-recently-active canvas
        // ref so handleSendExcerpt can route excerpts cross-window when no local canvas is open.
        remoteActiveCanvasRef.current = msg.ref
        return
      }
      if (msg.type === 'excerpt') {
        // Another window sent an excerpt to the active canvas (Task 7). Drop the card locally via
        // the latest-ref so the handler reads current canvas state at call time (no stale closure).
        handleSendExcerptRef.current?.(msg.payload)
        return
      }
      if (msg.type === 'card-color') {
        // A doc window recolored an annotation (Task 8). Record the override so a card whose
        // sourceAnnotationId matches recolors here even with no local doc pane. Pure updater.
        setCardColorOverrides((prev) => ({ ...prev, [msg.annotationId]: msg.color }))
        return
      }
      if (msg.type === 'navigate') {
        // Two cases, exactly one field set:
        //   linkId → follow-link (Task 5): resolve OUR OWN endpoint of the link from the targeted
        //            pane's reported records (the sender's anchor is foreign text in the partner).
        //   anchor → card→source (Task 8): the anchor IS this doc's own anchor → resolve directly.
        const jumped = msg.linkId
          ? jumpPaneToLink(msg.targetRef, msg.linkId)
          : msg.anchor
            ? jumpPaneToAnchor(msg.targetRef, msg.anchor)
            : false
        if (jumped) {
          try { window.focus() } catch { /* best-effort raise */ }
        }
        // Not held here (or link not yet reported) → ignore (the holding window handles it).
      } else if (msg.type === 'open-entity') {
        // Only the hub opens entities (satellites show a single fixed doc). Open/focus the tab,
        // stash the link id OR anchor to resolve+jump once the doc loads, and raise.
        if (detached) return
        const title = msg.ref.split('/').pop() ?? msg.ref
        if (msg.kind === 'doc') pendingOpenJump.current = { ref: msg.ref, linkId: msg.linkId, anchor: msg.anchor }
        tabs.openTab(msg.kind, msg.ref, title)
        try { window.focus() } catch { /* best-effort raise */ }
      }
    })
    // crossWindow.onMessage stores the latest handler (no resubscribe); re-register when the
    // captured panes/refs change so the closure reads current state. The hook cleans up the bus.
    // handleSendExcerpt is accessed via handleSendExcerptRef (latest-ref) — not listed here.
  }, [crossWindow, detached, jumpPaneToLink, jumpPaneToAnchor, tabs])

  const paneRowRef = useRef<HTMLDivElement | null>(null)

  // Resolve a char range to a point relative to the pane-row container.
  //   1. Find the [data-cs] element whose segment covers `range.start`.
  //   2. Build a DOM Range at the char offset within that element and getBoundingClientRect.
  //   3. Return its center MINUS paneRowRef's origin.
  // Off-screen hide: the <article> element uses overflowY:'auto' and is therefore its own
  // scroll container — its getBoundingClientRect() is the visible viewport for the content.
  // When the endpoint center falls outside the article's visible rect, return null; the dot
  // for that endpoint is then omitted by LinkLayer (arc also omitted). The partner dot on the
  // other pane stays rendered and clickable. Both null → nothing renders. (jsdom: every rect
  // is 0 → all checks pass → returns {0,0} — correct for testing without real layout.)
  const pointForRange = (article: HTMLElement | null, range: { start: number; end: number } | null): Pt | null => {
    if (!range) return null
    const row = paneRowRef.current
    if (!row || !article) return null
    const segs = Array.from(article.querySelectorAll<HTMLElement>('[data-cs]'))
    let owner: HTMLElement | null = null
    let ownerBase = -1
    for (const el of segs) {
      const base = Number(el.getAttribute('data-cs'))
      if (Number.isFinite(base) && base <= range.start && base > ownerBase) {
        owner = el
        ownerBase = base
      }
    }
    if (!owner) return null
    const r = document.createRange()
    const textNode = owner.firstChild ?? owner
    const offset = Math.max(0, Math.min(range.start - ownerBase, (textNode.textContent ?? '').length))
    try {
      r.setStart(textNode, offset)
      r.setEnd(textNode, offset)
    } catch {
      r.selectNode(owner)
    }
    const rect = typeof r.getBoundingClientRect === 'function'
      ? r.getBoundingClientRect()
      : (owner as HTMLElement).getBoundingClientRect()
    const o = row.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    // Hide off-screen: if the endpoint is outside the article's visible area, drop the link.
    const box = article.getBoundingClientRect()
    if (cy < box.top || cy > box.bottom || cx < box.left || cx > box.right) return null
    return { x: cx - o.left, y: cy - o.top }
  }

  // Resolve one connection endpoint to a point relative to the pane-row container.
  // (jsdom has no layout → every rect is 0 → returns {0,0}, which still renders a path;
  // a truly unresolved anchor → null → skipped. Coordinate accuracy is smoke-only.)
  const pointForAnchor = (article: HTMLElement | null, anchor: Anchor, docText: string): Pt | null => {
    const region = firstPageRectRegion(anchor)
    if (region) {
      const row = paneRowRef.current
      const page = article?.querySelector<HTMLElement>(`[data-pdf-page-index="${region.pageIndex}"]`)
      if (!row || !article || !page) return null
      const pageRect = page.getBoundingClientRect()
      const articleRect = article.getBoundingClientRect()
      const center = {
        x: pageRect.left + (region.rect.x + region.rect.w / 2) * pageRect.width,
        y: pageRect.top + (region.rect.y + region.rect.h / 2) * pageRect.height
      }
      if (center.y < articleRect.top || center.y > articleRect.bottom || center.x < articleRect.left || center.x > articleRect.right) return null
      const rowRect = row.getBoundingClientRect()
      return { x: center.x - rowRect.left, y: center.y - rowRect.top }
    }
    return pointForRange(article, resolveAnchor(anchor, docText))
  }

  // ── Always-on link lines ─────────────────────────────────────────────────────────────────────
  // Unified RenderedLink list (A2/A3): connections + cross-links merged into one feed for LinkLayer.
  const [renderedLinks, setRenderedLinks] = useState<RenderedLink[]>([])

  // Recompute the connector lines from this window's pane(s) reported connections and cross-links.
  //   PASS 1 (in-window pair): for each connection/cross-link in the PRIMARY pane, find its partner
  //   in the SECONDARY pane by shared id and resolve BOTH endpoints → a full link (arc + 2 dots).
  //   PASS 2 (cross-window lone dot, Task 5): for any connection/cross-link in THIS window's pane(s)
  //   whose partner ref is NOT a pane here, resolve the LOCAL endpoint and emit a link with the
  //   partner endpoint null (LinkLayer draws a lone dot, no arc). Ids already emitted in pass 1 are
  //   skipped (no double-emit). Works with one pane (satellite) or two (hub).
  // Reads the live DOM (article elements + their rects) so it must run after layout — invoked from
  // the recompute effect below and from scroll/resize via rAF.
  const recomputeLines = useCallback((): void => {
    const row = paneRowRef.current
    if (!row) { setRenderedLinks((prev) => (prev.length ? [] : prev)); return }
    // 1. docPanes left→right; 2. articles in DOM order zip to docPanes by index (canvas panes carry
    //    NO [data-pane-content], so they never appear here). articles[i] ↔ docPanes[i].
    const docPanes = panes.panes.filter((p) => p.kind === 'doc')
    const articles = Array.from(row.querySelectorAll<HTMLElement>('[data-pane-content]'))
    const refOf = (i: number): string => docPanes[i].ref
    const textOf = (i: number): string => docModelByTab.get(docPanes[i].tabId)?.doc.text ?? ''
    const linksOf = (i: number): Link[] => paneLinks[refOf(i)] ?? []
    const linked: RenderedLink[] = []
    const seen = new Set<string>()
    // PASS 0 (same-document region links): two records with the same id can live
    // in one sidecar when linking two captured rectangles from the same PDF.
    for (let i = 0; i < docPanes.length; i++) {
      const links = linksOf(i)
      const byId = new Map<string, Link[]>()
      for (const link of links) {
        if (link.otherDocRef !== refOf(i)) continue
        const group = byId.get(link.id) ?? []
        group.push(link)
        byId.set(link.id, group)
      }
      for (const [id, group] of byId) {
        if (group.length < 2) continue
        const from = pointForAnchor(articles[i] ?? null, group[0].anchor, textOf(i))
        const to = pointForAnchor(articles[i] ?? null, group[1].anchor, textOf(i))
        if (from || to) {
          linked.push({ id, from, to })
          seen.add(id)
        }
      }
    }
    // PASS 1 (paired arcs): every UNORDERED PAIR (i<j); a link present in both → resolve both ends.
    for (let i = 0; i < docPanes.length; i++) {
      for (let j = i + 1; j < docPanes.length; j++) {
        for (const a of linksOf(i)) {
          const b = linksOf(j).find((l) => l.id === a.id)
          if (!b) continue
          const from = pointForAnchor(articles[i] ?? null, a.anchor, textOf(i)) // left pane → right pane
          const to = pointForAnchor(articles[j] ?? null, b.anchor, textOf(j))
          if (from || to) { linked.push({ id: a.id, from, to }); seen.add(a.id) }
        }
      }
    }
    // PASS 2 (lone dots): a link whose id is NOT seen and whose partner is NOT a shown doc ref.
    // Leftmost pane (i=0) emits a `from` dot (to:null); later panes emit a `to` dot (from:null) —
    // this preserves the existing single-pane (`-from`) and lone-secondary (`-to`) dot ids.
    const shownDocRefs = new Set(docPanes.map((p) => p.ref))
    for (let i = 0; i < docPanes.length; i++) {
      for (const l of linksOf(i)) {
        if (seen.has(l.id) || shownDocRefs.has(l.otherDocRef)) continue
        const pt = pointForAnchor(articles[i] ?? null, l.anchor, textOf(i))
        if (!pt) continue
        if (i === 0) linked.push({ id: l.id, from: pt, to: null })
        else linked.push({ id: l.id, from: null, to: pt })
        seen.add(l.id)
      }
    }
    setRenderedLinks(linked)
    // docPaneSig (not panes.panes) is the stable dep — panes.panes is a fresh array each render.
    // pointForAnchor/pointForRange read only refs/args; safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPaneSig, docModelByTab, paneLinks])

  // Recompute whenever the inputs change (panes, reported connections). A layout pass has already
  // happened by the time this commit-phase effect runs, so the rects are current.
  useEffect(() => {
    recomputeLines()
  }, [recomputeLines])

  // Re-fit on motion: recompute on either pane's scroll (CAPTURE phase, so the inner <article>
  // scroll bubbles up to the row container) and on window resize. Each event schedules ONE rAF
  // (coalescing bursts). Clean up both listeners AND any pending rAF on unmount / row change.
  useEffect(() => {
    const row = paneRowRef.current
    if (!row) return
    let raf = 0
    const schedule = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        recomputeLines()
      })
    }
    row.addEventListener('scroll', schedule, true) // capture: catches the inner article's scroll
    window.addEventListener('resize', schedule)
    return () => {
      row.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [recomputeLines])

  // Load the active project's library (re-runs when the active project changes).
  useEffect(() => {
    if (!projectId) { setLibrary([]); return }
    let cancelled = false
    void platform
      .listLibrary(projectId)
      .then((entries) => {
        if (!cancelled) setLibrary(entries)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [platform, projectId])

  // Load the active project's canvas list (re-runs when the active project changes).
  useEffect(() => {
    if (!projectId) { setCanvasList([]); return }
    let cancelled = false
    void platform
      .listCanvases(projectId)
      .then((c) => {
        if (!cancelled) setCanvasList(c)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [platform, projectId])

  // Restore the active project from the URL on mount (addressable windows). The `?project=<id>`
  // query wins over the hook's localStorage restore when present, so a copied/detached URL lands in
  // its project. We wait until the projects list is loaded before honoring it (id must be known).
  const urlProjectAppliedRef = useRef(false)
  useEffect(() => {
    if (urlProjectAppliedRef.current) return
    if (projects.projects.length === 0) return
    const wanted = new URLSearchParams(window.location.search).get('project')
    urlProjectAppliedRef.current = true
    if (wanted && wanted !== projectId && projects.projects.some((p) => p.id === wanted)) {
      projects.select(wanted)
    }
  }, [projects, projectId])

  // Mirror the active project id into the URL (?project=<id>). useTabs rewrites the URL for tab
  // navigation and would drop the param, so this runs on the same [active, tabs] inputs to re-append
  // it. Detached satellites keep their own URL untouched here (they restore from localStorage).
  useEffect(() => {
    if (detached) return
    const url = new URL(window.location.href)
    const current = url.searchParams.get('project')
    if (projectId) {
      if (current !== projectId) {
        url.searchParams.set('project', projectId)
        window.history.replaceState({}, '', url.pathname + url.search)
      }
    } else if (current !== null) {
      url.searchParams.delete('project')
      window.history.replaceState({}, '', url.pathname + (url.search || ''))
    }
    // Depend on tabs.active/tabs so we re-assert the param after useTabs' own URL pushState.
  }, [projectId, detached, tabs.active, tabs.tabs])

  // Write any pending CANVAS change before the page unloads. (Each DocumentPane registers its
  // own beforeunload listener to flush its document sidecar.)
  useEffect(() => {
    const onBeforeUnload = (): void => {
      canvasState.flush()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [canvasState.flush])

  // The back-link flash is transient.
  useEffect(() => {
    if (!flashRange) return
    const h = setTimeout(() => setFlashRange(null), 1600)
    return () => clearTimeout(h)
  }, [flashRange])

  // Satellite window title: set document.title to the active entity's display name when detached.
  // Restore the prior title on cleanup so navigation within the satellite doesn't leak stale titles.
  // Hub (non-detached) path is never touched.
  useEffect(() => {
    if (!detached) return
    const focused = panes.panes.find((p) => p.focused) ?? null
    const model = focused && focused.kind === 'doc' ? docModelByTab.get(focused.tabId) ?? null : null
    const entityTitle = model
      ? (model.doc.title || (model.sourcePath.split('/').pop() ?? model.sourcePath))
      : focused?.kind === 'canvas'
        ? (focused.title || (focused.ref.split('/').pop() ?? focused.ref))
        : null
    if (!entityTitle) return
    const prev = document.title
    document.title = entityTitle
    return () => { document.title = prev }
  }, [detached, panes.panes, docModelByTab])

  // For each shown DOC pane lacking a cached model, parse it and cache by tabId (C3). openRef
  // pre-caches on the open path, so the pane it just opened takes the cache-HIT branch here and is
  // not re-parsed (the loop/double-load guard, generalized from the old single-doc version). The
  // projectId guard mirrors the old loads: a detached satellite renders before useProjects restores
  // the active project, so we skip until projectId resolves (it is in the deps → retried then).
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    for (const p of panes.panes) {
      if (p.kind !== 'doc' || docModelByTab.has(p.tabId)) continue
      const tabId = p.tabId
      void parseLoaded(p.ref).then((l) => {
        if (!cancelled && l) setDocModelByTab((m) => (m.has(tabId) ? m : new Map(m).set(tabId, l)))
      })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docPaneSig, projectId])

  // Bind the single useCanvas instance to the shown CANVAS pane, if any (canvas binding decision,
  // Task 5). The pane model permits at most one canvas pane (the pinned/rightmost). Open/close the
  // canvas to match; flush before switching so a within-debounce edit is never dropped.
  useEffect(() => {
    const canvasPane = panes.panes.find((p) => p.kind === 'canvas') ?? null
    if (canvasPane) {
      if (canvasState.activeRef !== canvasPane.ref) { canvasState.flush(); void canvasState.openCanvas(canvasPane.ref) }
    } else if (canvasState.activeRef) {
      canvasState.flush(); canvasState.closeCanvas()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPaneRef])

  // Boot bridge: a tab seeded from the URL (?doc=/?canvas=, incl. a detached satellite or a copied
  // link) exists in useTabs but was never routed through panes.show. Show it once so the workspace
  // renders it. Ref-gated so it fires only for the initial seed and never fights later parking.
  const bootShownRef = useRef(false)
  useEffect(() => {
    if (bootShownRef.current) return
    const t = tabs.activeTab
    if (t) { bootShownRef.current = true; panes.show(t.id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.activeTab])

  // Open or focus a document tab. The entry path for opening a document: it parses the model
  // (or, if its tab already exists and is cached, the caller's switch effect reuses the cache),
  // opens/focuses the tab, then caches the parsed model under the RELIABLE tab id returned by
  // openTab. Setting `loaded` here is what the switch effect would otherwise do — doing it inline
  // avoids a flash and means the effect, firing on the resulting active change, sees a cache HIT
  // and does NOT re-load (the loop/double-load guard).
  // Build the parsed Loaded model for a ref (pdf-vs-cleanDOM). No side effects beyond setError
  // on the not-found / unsupported case — used both by openRef (which adds the tab + caching
  // side effects) and by the secondary-pane load effect.
  const parseLoaded = async (ref: string): Promise<Loaded | null> => {
    if (ref.toLowerCase().endsWith('.pdf')) {
      // Lazy-load pdf.js (~1.9 MB incl. worker) only on first PDF open, so Markdown-only
      // sessions never pay its download/parse cost. Keeps the clean-DOM path lean.
      const { getDocument, makeRenderPage } = await import('./pdf/pdfjs')
      const [bytes, parse] = await Promise.all([platform.openDocumentBytes(projectId ?? '', ref), platform.parsePdf(projectId ?? '', ref)])
      const name = ref.split('/').pop() ?? ref
      const doc = buildPdfModel(parse, name)
      const pdf = await getDocument({ data: bytes }).promise
      return { doc, sourcePath: ref, content: '', pdf: { parse, renderPage: makeRenderPage(pdf) } }
    }
    const opened = await platform.openDocument(projectId ?? '', ref)
    if (!opened) {
      setError(`Could not open ${ref}`)
      return null
    }
    const doc = importDocument(opened.ref, opened.content)
    return { doc, sourcePath: opened.ref, content: opened.content, pdf: null }
  }

  // `at`/`keep` (when supplied) open the doc BESIDE an existing pane rather than replacing the
  // focused one — used by the card-click path to keep the source's canvas pane visible.
  const openRef = async (ref: string, opts?: { at?: number; keep?: string }): Promise<DocumentModel | null> => {
    setError(null)
    try {
      const value = await parseLoaded(ref)
      if (!value) return null
      const title = value.doc.title || (ref.split('/').pop() ?? ref)
      const id = tabs.openTab('doc', ref, title)
      setDocModelByTab((m) => new Map(m).set(id, value))
      panes.show(id, opts)
      recents.recordOpen(ref, summarizeStructure(value.doc.sections))
      setRestoreNote(null) // a stale "passages not found" note shouldn't carry into a new document
      return value.doc
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  // Clicking an excerpt card flashes (and, via the DocumentPane's flashRange effect, navigates
  // to) its source passage. App resolves the anchor → range to build flashRange; the active
  // DocumentPane owns the navigation it implies (it remounts per-doc, so App can't hold activeIndex).
  const handleCardClick = async (id: string): Promise<void> => {
    const card = canvasState.canvas?.cards.find((c) => c.id === id)
    if (!card || card.kind !== 'excerpt') return
    // Cross-window routing (Task 8). The card's anchor IS the source doc's OWN anchor, so it carries
    // directly (unlike a link, where only the shared id travels — anchor-vs-linkId differ).
    //   • source already shown/openable here (a doc pane is active in this window) → local flash.
    //   • another window holds the source → ask it to scroll+flash (navigate{anchor}).
    //   • nobody holds it and there's no local reader (canvas-only / satellite window) → ask the hub
    //     to open it + jump (open-entity{anchor}).
 const sourcePane = docPaneForRef(card.source)
 const sourceLocal = sourcePane !== null
 const pageRect = firstPageRectRegion(card.anchor)
 if (sourceLocal && pageRect) {
  jumpPaneToAnchor(card.source, card.anchor)
  return
 }
 if (!sourceLocal) {
      if (crossWindow.windowHolding('doc', card.source)) {
        crossWindow.post({ type: 'navigate', targetRef: card.source, anchor: card.anchor })
        return
      }
      if (panes.panes.every((p) => p.kind !== 'doc')) {
        // No reader in this window to open the doc into → route to the hub.
        crossWindow.post({ type: 'open-entity', kind: 'doc', ref: card.source, anchor: card.anchor })
        return
      }
    }
    // Local path (this window has a reader for the source, or can openRef it beside the canvas):
    // resolve here and flash in this window. (Preserves the existing single-window behavior.)
    // When the source isn't shown, open it BESIDE the canvas pane (at its slot, keeping it) so the
    // click never replaces the canvas the user is looking at.
 const canvasPos = panes.panes.findIndex((p) => p.kind === 'canvas')
 const canvasPane = canvasPos >= 0 ? panes.panes[canvasPos] : null
 if (pageRect) {
  pendingOpenJump.current = { ref: card.source, anchor: card.anchor }
  await openRef(card.source, canvasPane ? { at: canvasPos, keep: canvasPane.tabId } : undefined)
  return
 }
 const activeDoc = sourcePane
      ? docModelByTab.get(sourcePane.tabId)?.doc ?? null
      : await openRef(card.source, canvasPane ? { at: canvasPos, keep: canvasPane.tabId } : undefined)
    if (!activeDoc) return
    const range = resolveAnchor(card.anchor, activeDoc.text)
    if (!range) {
      setRestoreNote('That passage was not found in its source.')
      return
    }
    setFlashRange(range)
  }

  // Double-click / right-click a highlight → drop an excerpt card on the open canvas. Placed
  // in the nearest open slot to the center of the currently-visible area (center-out scan),
  // falling back to a small cascade from center only when the visible area is saturated.
  const handleSendExcerpt = (payload: ExcerptDropPayload): void => {
    if (!canvasState.canvas) {
      // No local canvas open. If another window is holding an active canvas, route the excerpt
      // there over the bus (Task 7) — no "open a canvas" note needed.
      if (remoteActiveCanvasRef.current !== null) {
        crossWindow.post({ type: 'excerpt', payload })
        return
      }
      setRestoreNote('Open a canvas (Studio → + New canvas) to send passages to it.')
      return
    }
    const point = placeNewCard({
      cards: canvasState.canvas.cards,
      viewport: canvasState.canvas.viewport,
      // The canvas is now a flex pane (no tracked width); use a nominal width for center-out placement.
      paneWidth: 480,
      viewportHeight: (typeof window !== 'undefined' ? window.innerHeight : 800) - 120
    })
    canvasState.addExcerptCard(excerptCardFromDrop(payload, point))
  }
  // Keep the latest-ref in sync so the onMessage handler always calls the current closure.
  handleSendExcerptRef.current = handleSendExcerpt

  // Restore a soft-deleted canvas (by ref; it need not be open) — clear its deleted flag.
  const restoreCanvas = async (ref: string): Promise<void> => {
    const raw = await platform.readCanvas(projectId ?? '', ref)
    if (raw === null) return
    await platform.writeCanvas(projectId ?? '', ref, serializeCanvas({ ...parseCanvas(raw), deleted: false }))
    setCanvasList(await platform.listCanvases(projectId ?? ''))
  }

  // Open (or focus) a canvas as a tab and show it in a pane. A canvas pane binds to the single
  // useCanvas instance via the canvas-pane sync effect (Task 1).
  const openCanvasTab = (ref: string): void => {
    const title = canvasList.find((c) => c.ref === ref)?.title ?? (ref.split('/').pop() ?? ref)
    const id = tabs.openTab('canvas', ref, title)
    panes.show(id)
  }

  // Create a canvas from the in-project Home (no active doc to dock to) and open it as a tab.
  const handleNewCanvas = async (): Promise<void> => {
    const title = window.prompt('New canvas title', 'Untitled canvas') ?? ''
    if (!title.trim()) return
    const existing = await platform.listCanvases(projectId ?? '')
    const newRef = await canvasState.createCanvas(title.trim(), existing.map((c) => c.ref))
    setCanvasList(await platform.listCanvases(projectId ?? ''))
    const id = tabs.openTab('canvas', newRef, title.trim())
    panes.show(id)
  }

  // Returns the live annotation color for an excerpt card when its source annotation is currently
  // open in EITHER pane (looked up by the card's own source ref). Falls back to the card's stored
  // color via ExcerptCard's own liveColor ?? card.color logic — this resolver returns undefined
  // when the source doc is open in no pane (no entry) or the annotation isn't found.
  const colorForCard = useCallback(
    (card: CanvasExcerptCard): string | undefined => {
      if (!card.sourceAnnotationId) return undefined
      // A synced override (from a doc window over the bus) wins when there's no local doc pane to
      // resolve the live color (Task 8); otherwise fall back to the local pane's annotations. Either
      // way ExcerptCard's `liveColor ?? card.color` covers the undefined (no-doc, never-synced) case.
      return (
        cardColorOverrides[card.sourceAnnotationId] ??
        paneAnnotations[card.source]?.find((a) => a.id === card.sourceAnnotationId)?.color
      )
    },
    [paneAnnotations, cardColorOverrides]
  )
  const previewUrlForCard = useCallback(
    (card: CanvasExcerptCard): string | undefined => {
      return card.previewAssetRef ? previewUrls[card.previewAssetRef] : undefined
    },
    [previewUrls]
  )

const handleRemoveCanvasCard = (id: string): void => {
 const card = canvasState.canvas?.cards.find((c) => c.id === id)
 const region = card?.kind === 'excerpt' ? firstPageRectRegion(card.anchor) : null
 canvasState.removeCard(id)
 if (!region || !card || card.kind !== 'excerpt') return
 setRegionJumpByTab((prev) => {
  let changed = false
  const next = { ...prev }
  for (const pane of panes.panes) {
   if (pane.kind !== 'doc' || pane.ref !== card.source) continue
   if (!samePageRect(next[pane.tabId], region)) continue
   next[pane.tabId] = null
   changed = true
  }
  return changed ? next : prev
 })
}
const cv = canvasState.canvas
  const activeTab = tabs.activeTab
  const shownDocPanes = panes.panes.filter((p) => p.kind === 'doc')
  // Split-pane Draw: two LOCAL doc panes side by side (≥2 shown doc panes).
  const splitDrawAvailable = shownDocPanes.length >= 2
  // Refs held LOCALLY in any shown doc pane (so a doc open here never lights cross-window Draw).
  const localRefs = new Set<string>(shownDocPanes.map((p) => p.ref))
  // Cross-window Draw: some OTHER window holds a different doc. Reads presence `.entity` (the focused
  // mirror 3b keeps); a window in 2+ doc panes still advertises its focused doc here.
  const otherDocWindowOpen = Object.values(crossWindow.presence).some(
    (e) => e.entity?.kind === 'doc' && !localRefs.has(e.entity.ref)
  )
  const localRegionDrawAvailable =
    shownDocPanes.length >= 1 &&
    !!canvasState.canvas?.cards.some(
      (card) => card.kind === 'excerpt' && localRefs.has(card.source) && !!firstPageRectRegion(card.anchor)
    )
  const drawAvailable = shownDocPanes.length >= 1 && (splitDrawAvailable || otherDocWindowOpen || localRegionDrawAvailable)

  // Close a tab and drop ALL per-tab bookkeeping. releaseClosed runs BEFORE tabs.closeTab so
  // usePanes' reflow sees the tab gone (C2). Clears docModelByTab / connJumpByTab / lockedTabs and
  // any pinned bookkeeping (releaseClosed handles the pin drop).
  const closeTabFully = (id: string): void => {
    panes.releaseClosed(id)
    setDocModelByTab((m) => { if (!m.has(id)) return m; const n = new Map(m); n.delete(id); return n })
    setConnJumpByTab((m) => { if (!(id in m)) return m; const n = { ...m }; delete n[id]; return n })
    setLockedTabs((m) => { if (!(id in m)) return m; const n = { ...m }; delete n[id]; return n })
    setSearchOpenByTab((m) => { if (!(id in m)) return m; const n = { ...m }; delete n[id]; return n })
    tabs.closeTab(id)
  }

  // Home: park every shown pane (tabs stay open in the strip) and focus the library, so the cockpit
  // renders (panes empty). Re-showing a parked tab from the strip brings it back into a pane.
  const goHome = (): void => {
    for (const id of panes.shownIds) panes.park(id)
    tabs.focusLibrary()
  }

  // Park a shown tab (✕ on a doc pane); a canvas pane's ✕ closes the canvas tab (§5.5).
  const closePane = (p: PaneModel): void => {
    if (p.kind === 'canvas') closeTabFully(p.tabId)   // canvas: ✕ closes the tab
    else panes.park(p.tabId)                           // doc: ✕ parks (tab stays open in the strip)
  }

  // Detach THIS pane's entity to its own window (was the global header Detach). Open the satellite,
  // then close this pane's tab so the hub reflows onto the remaining panes (never bounces to Home).
  const detachPane = (p: PaneModel): void => {
    window.open(detachUrl(p.kind, p.ref), '_blank')
    closeTabFully(p.tabId)
  }

  // Canvas pane extra actions (Obsidian export / rename / delete). Pin + close live on PaneHeader
  // itself; these are the canvas-only extras passed as PaneHeader's `actions`. Preserved verbatim
  // from the retired canvasPaneEl header.
  const renderCanvasActions = (model: import('../core/canvas/canvas').CanvasModel | null): JSX.Element | undefined => {
    if (!model) return undefined
    return (
      <>
        <button
          aria-label="Export to Obsidian"
          title="Export this canvas to readbetter's central Obsidian bundle store (.canvas + atomic notes)"
          style={{ font: '600 11px system-ui' }}
          onClick={async () => {
            try {
              await exportCanvasToObsidian({ model, platform, projectId: projectId ?? '' })
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Obsidian
        </button>
        <button
          aria-label="Rename canvas"
          title="Rename canvas"
          onClick={async () => {
            const t = window.prompt('Rename canvas', model.title)
            if (t && t.trim()) { await canvasState.renameCanvas(t.trim()); setCanvasList(await platform.listCanvases(projectId ?? '')) }
          }}
        >
          <Icon name="edit" size={15} />
        </button>
        <button
          aria-label="Delete canvas"
          title="Move canvas to trash"
          onClick={async () => {
            const wasRef = canvasState.activeRef
            await canvasState.deleteActive()
            if (wasRef && panes.pinnedRef === wasRef) panes.unpin()
            setCanvasList(await platform.listCanvases(projectId ?? ''))
            // The canvas tab is gone from the board → close its tab so we land on a neighbor/Home.
            const ct = panes.panes.find((pp) => pp.kind === 'canvas')
            if (ct) closeTabFully(ct.tabId)
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      </>
    )
  }

  // The back-link flash (from a card click) belongs to the focused doc pane, or — when a non-doc
  // (canvas) pane is focused — the leftmost doc pane (mirrors the old "primary pane gets flashRange").
  const focusedPaneNow = panes.panes.find((p) => p.focused) ?? null
  const flashTabId =
    focusedPaneNow?.kind === 'doc' ? focusedPaneNow.tabId : (panes.panes.find((p) => p.kind === 'doc')?.tabId ?? null)
  const regionAnchorsForRef = (ref: string): PdfRegionAnchor[] =>
    canvasState.canvas?.cards
      .filter((card): card is CanvasExcerptCard => card.kind === 'excerpt' && card.source === ref && !!firstPageRectRegion(card.anchor))
      .map((card) => ({ id: card.id, anchor: card.anchor, region: firstPageRectRegion(card.anchor)! })) ?? []

  const renderPane = (p: PaneModel): JSX.Element => {
    if (p.kind === 'canvas') {
      const model = canvasState.canvas
      const header = (
        <PaneHeader
          title={model?.title ?? p.title}
          onClose={detached ? undefined : () => closePane(p)}
          onDetach={detached ? undefined : () => detachPane(p)}
          pinned={panes.isPinned(p.tabId)}
          onTogglePin={() => panes.togglePin(p.tabId)}
          actions={renderCanvasActions(model)}
        />
      )
      const body = model ? (
        <CanvasPaneBody
          canvas={model}
          onMoveCard={canvasState.moveCard}
          onCreateNote={(pt) => canvasState.addNoteCard(pt)}
          onSetNote={canvasState.setCardNote}
          onCardClick={(id) => void handleCardClick(id)}
          onSetViewport={canvasState.setViewport}
onRemoveCard={handleRemoveCanvasCard}
          onResizeCard={canvasState.resizeCard}
          onAddConnection={canvasState.addConnection}
            onRemoveConnection={canvasState.removeConnection}
            onSetConnectionLabel={canvasState.setConnectionLabel}
            colorFor={colorForCard}
            previewUrlFor={previewUrlForCard}
          />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading…</div>
      )
      return <Pane key={p.tabId} pane={p} header={header} body={body} />
    }
    // doc pane
    const model = docModelByTab.get(p.tabId) ?? null
    const header = (
      <PaneHeader
        title={model?.doc.title ?? p.title}
        onClose={detached ? undefined : () => closePane(p)}
        onDetach={detached ? undefined : () => detachPane(p)}
        searchActive={!!searchOpenByTab[p.tabId]}
        onToggleSearch={() => toggleSearch(p.tabId)}
      />
    )
    const body = lockedTabs[p.tabId] ? (
      lockNotice
    ) : model ? (
      <DocPaneBody
        loaded={model}
        tabId={p.tabId}
        platform={platform}
        projectId={projectId ?? ''}
            flashRange={p.tabId === flashTabId ? flashRange : null}
            flashPageRect={regionJumpByTab[p.tabId] ?? null}
            regionAnchors={regionAnchorsForRef(p.ref)}
            connectionJump={connJumpByTab[p.tabId] ?? null}
        connectMode={connectMode}
        onConnectPick={handleConnectPick}
        onSendExcerpt={handleSendExcerpt}
        onAnnotationsResolved={reportAnnotations}
        onLinksResolved={reportLinks}
        onRestoreNote={setRestoreNote}
        registerPane={registerPane}
        unregisterPane={unregisterPane}
        searchOpen={!!searchOpenByTab[p.tabId]}
        onCloseSearch={() => closeSearch(p.tabId)}
      />
    ) : (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Loading…</div>
    )
    return <Pane key={p.tabId} pane={p} header={header} body={body} />
  }

  // The single-open notice, shown when a document's Web Lock is held by another window. Shared
  // by the primary-locked branch and the secondary pane (when secondaryLocked) — identical markup.
  const lockNotice = (
    <div
      role="alert"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 32,
        color: 'var(--muted)',
        background: 'var(--surface)',
        font: '500 15px Inter, system-ui, sans-serif',
        textAlign: 'center'
      }}
    >
      <span style={{ font: '700 16px Inter, system-ui, sans-serif', color: 'var(--fg)' }}>
        Open in another window
      </span>
      <span>This is open in another window. Close it there to edit here.</span>
    </div>
  )

  // Project gate (spec §5): with no active project, the window shows the projects cockpit — pick a
  // project to enter its workspace, or add a folder via the native OS picker. A detached satellite
  // is exempt: it shows a single fixed entity and inherits the active project from localStorage.
  if (!detached && projects.active === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', font: '16px/1.6 Inter, system-ui, sans-serif' }}>
        <div style={{ position: 'absolute', top: 10, right: 14, zIndex: 1 }}>
          <ThemeToggle mode={theme.mode} setMode={theme.setMode} />
        </div>
        <ProjectsView
          projects={projects.projects}
          onOpen={projects.select}
          onAdd={async () => { const p = await platform.pickFolder(); if (p) await projects.add(p) }}
          onLocate={async (id) => { const p = await platform.pickFolder(); if (p) await projects.relocate(id, p) }}
          onRemove={(id) => void projects.remove(id)}
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', font: '16px/1.6 Inter, system-ui, sans-serif' }}>
      {!detached && <header
        className="rb-glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          flex: '0 0 auto',
          // Lift the header's stacking context above the workspace pane-row (which sets
          // isolation:isolate, creating a later-painted stacking context). Without this, header
          // dropdowns (project switcher, search picker) overflow into the workspace and are
          // painted UNDER the panes — appearing as an unclickable transparent overlay.
          position: 'relative',
          zIndex: 30
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            aria-label="Switch project"
            title="Switch project"
            onClick={() => setShowProjectMenu((o) => !o)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: 'var(--fg)', cursor: 'pointer', font: '600 14px var(--font-sans)' }}
          >
            {projects.active?.name ?? 'All projects'} <span aria-hidden style={{ color: 'var(--muted)' }}>&#9662;</span>
          </button>
          {showProjectMenu && (
            <>
              <div onClick={() => setShowProjectMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
              <div role="menu" aria-label="Projects" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 1000, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column' }}>
                {activeTab && (
                  <button role="menuitem" onClick={() => { goHome(); setShowProjectMenu(false) }} style={{ textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', borderRadius: 6, font: '600 13px var(--font-sans)', color: 'var(--fg)' }}>Home</button>
                )}
                {projects.projects.map((p) => (
                  <button key={p.id} role="menuitem" onClick={() => { canvasState.flush(); projects.select(p.id); setShowProjectMenu(false) }} style={{ textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', borderRadius: 6, font: '500 13px var(--font-sans)', color: p.id === projects.active?.id ? 'var(--accent)' : 'var(--fg)' }}>{p.name}</button>
                ))}
                <button role="menuitem" onClick={() => { canvasState.flush(); projects.select(null); setShowProjectMenu(false) }} style={{ textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer', padding: '8px 10px', borderRadius: 6, font: '500 13px var(--font-sans)', color: 'var(--muted)', borderTop: '1px solid var(--border)', marginTop: 2 }}>All projects&#x2026;</button>
              </div>
            </>
          )}
        </span>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 8px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--muted)' }}>
            <Icon name="search" size={15} />
            <input
              aria-label="Search documents and canvases"
              placeholder="Search…"
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
              onFocus={() => setShowQuickPick(true)}
              style={{ width: 200, padding: '7px 0', border: 'none', background: 'transparent', color: 'var(--fg)', font: '500 13px var(--font-sans)', outline: 'none' }}
            />
          </span>
          {showQuickPick && (
            <>
              <div onClick={() => { setShowQuickPick(false); setPickQuery('') }} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
              <QuickPicker
                query={pickQuery}
                documents={library}
                canvases={canvasList.filter((c) => !c.deleted)}
                canOpenBeside={shownDocPanes.length >= 1}
                onOpenDocument={(ref) => void openRef(ref)}
                onOpenBeside={(ref) => {
                  // Refuse a doc ref already shown (dual-writer guard): openTab dedupes by kind+ref,
                  // so an already-shown doc maps to its existing tab/pane — never two panes for one ref.
                  if (panes.panes.some((p) => p.kind === 'doc' && p.ref === ref)) return
                  const title = library.find((d) => d.ref === ref)?.name ?? (ref.split('/').pop() ?? ref)
                  const id = tabs.openTab('doc', ref, title)
                  const focusedIndex = panes.panes.findIndex((p) => p.tabId === panes.focusedId)
                  panes.show(id, { at: (focusedIndex < 0 ? panes.panes.length - 1 : focusedIndex) + 1 })
                }}
                onOpenCanvas={(ref) => openCanvasTab(ref)}
                onNewCanvas={() => void handleNewCanvas()}
                onClose={() => { setShowQuickPick(false); setPickQuery('') }}
              />
            </>
          )}
        </span>
        {drawAvailable && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              aria-label={connectMode ? 'Exit Draw mode' : 'Draw: click a word, highlight, or region to link them'}
              title="Draw: click a word, highlight, or captured region to link them"
              onClick={toggleDraw}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: connectMode ? 'var(--accent)' : 'transparent',
                color: connectMode ? 'var(--accent-contrast)' : 'var(--fg)',
                cursor: 'pointer'
              }}
            >
              <Icon name="link" size={14} /> Draw
            </button>
            {connectMode && pendingConnStart && (
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>Click another endpoint…</span>
            )}
          </span>
        )}
        {error && <span role="alert" className="rb-pill rb-pill--danger" style={{ marginLeft: 4 }}>{error}</span>}
        {restoreNote && (
          <span role="status" className="rb-pill rb-pill--warn" style={{ marginLeft: 4 }}>
            {restoreNote}
            <button
              aria-label="Dismiss"
              onClick={() => setRestoreNote(null)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', marginLeft: 6 }}
            >
              <Icon name="close" size={14} />
            </button>
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <ThemeToggle mode={theme.mode} setMode={theme.setMode} />
        </span>
      </header>}
      {/* One Web Lock per open tab; a tab held by another window flips its lockedTabs flag. */}
      {tabs.tabs.map((t) => (
        <LockHolder
          key={t.id}
          name={`rb:${t.kind}:${t.ref}`}
          onStatus={(locked) => setLockedTabs((m) => (m[t.id] === locked ? m : { ...m, [t.id]: locked }))}
        />
      ))}
      <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
        {!detached && tabs.tabs.length > 0 && (
          <OpenRail
            tabs={tabs.tabs}
            active={tabs.active}
            shownIds={panes.shownIds}
            paneOf={(id) => panes.shownIds.indexOf(id)}
            onFocusTab={(id) => { tabs.focusTab(id); panes.show(id) }}
            onAssignPane={(id) => { tabs.focusTab(id); panes.show(id) }}
            onCloseTab={(id) => closeTabFully(id)}
            onQuickPick={() => setShowQuickPick(true)}
            pinned={rail.pinned}
            width={rail.width}
            onTogglePin={rail.togglePin}
            onSetWidth={rail.setWidth}
          />
        )}
        <div style={{
          flex: 1, minWidth: 0, minHeight: 0, display: 'flex',
          marginLeft: !detached && tabs.tabs.length > 0 && rail.pinned ? rail.width : 0,
          transition: 'margin-left .2s cubic-bezier(.2,.7,.2,1)'
        }}>
          {panes.panes.length > 0 ? (
            <PaneRow
              panes={panes.panes}
              renderedLinks={renderedLinks}
              selectedLinkId={selectedLinkId}
              paneRowRef={paneRowRef}
              renderPane={renderPane}
              onBackgroundClick={() => setSelectedLinkId(null)}
              onLinkNavigate={handleLinkNavigate}
              onLinkSelect={connectMode ? handleLinkSelect : () => {}}
              onLinkRemoveRequest={handleLinkRemoveRequest}
            />
          ) : !detached ? (
            <LibraryCockpit
              documents={library}
              canvases={canvasList}
              recents={recents}
              onOpenDocument={(ref) => void openRef(ref)}
              onOpenCanvas={(ref) => openCanvasTab(ref)}
              onNewCanvas={() => void handleNewCanvas()}
              onRestoreCanvas={(ref) => void restoreCanvas(ref)}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
