import { useCallback, useEffect, useRef, useState } from 'react'
import type { Tab, UseTabs } from './useTabs'
import { usePinnedCanvas } from './usePinnedCanvas'

/** One shown pane, resolved from the tab it displays. Order in `panes[]` is left->right. */
export interface Pane {
  tabId: string
  kind: 'doc' | 'canvas'
  ref: string
  title: string
  focused: boolean
  pinned: boolean // true only for the pinned canvas (always the rightmost pane)
}

export interface UsePanes {
  /** Ordered, left->right, length 0..maxShown. The pinned canvas (if shown) is always last. */
  panes: Pane[]
  /** Ordered tabIds currently shown (mirrors `panes`). */
  shownIds: string[]
  /** Open tabs NOT shown (dimmed in the strip). Derived as tabs.tabs minus shownIds. */
  parkedIds: string[]
  /** The focused pane's tabId, or null when no pane is shown (library view). */
  focusedId: string | null
  /** Max simultaneous panes by viewport width: 3 (>=1100px) / 2 (>=720px) / 1 (<720px). */
  maxShown: number
  /** Show `tabId` in a pane. `at` inserts at that slot (drop-between); omitted/replaceFocused
   *  replaces the focused pane when at cap. Un-parks a parked tab. Focuses the shown pane. */
  show(tabId: string, opts?: { at?: number; replaceFocused?: boolean; keep?: string }): void
  /** Remove `tabId` from the shown set (the tab stays OPEN -> parked). Reflows the rest. */
  park(tabId: string): void
  /** Make `tabId` the focused pane (no-op if it is not shown). */
  focus(tabId: string): void
  /** True if `tabId` is the pinned canvas. */
  isPinned(tabId: string): boolean
  /** Pin/unpin a CANVAS tab to the rightmost slot (no-op for doc tabs). Persists via usePinnedCanvas. */
  togglePin(tabId: string): void
  /** The pinned canvas's ref (or null) — the single source of truth (App must not re-read storage). */
  pinnedRef: string | null
  /** Clear the pin (used when the pinned canvas is deleted). */
  unpin(): void
  /** Drop `tabId` from BOTH shown and pinned bookkeeping when its tab is closed. App calls this in
   *  the closeTab wrapper BEFORE tabs.closeTab so the reflow sees the tab gone. */
  releaseClosed(tabId: string): void
}

/** Width -> simultaneous pane cap. `1` where there is no window (SSR/jsdom-less) -- the safe floor. */
function computeMax(): number {
  if (typeof window === 'undefined') return 1
  const w = window.innerWidth
  return w >= 1100 ? 3 : w >= 720 ? 2 : 1
}

export function usePanes(tabs: UseTabs, projectId?: string | null): UsePanes {
  const pinned = usePinnedCanvas(projectId)
  // Internal state is INSERTION order; the public shownIds/panes are derived with the pinned
  // canvas reordered to the rightmost slot -- so show/park never carry pin-aware ordering logic.
  const [rawShown, setRawShown] = useState<string[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [maxShown, setMaxShown] = useState<number>(() => computeMax())

  // Refs let the pure functional updaters read the latest cross-state without stale closures.
  const focusedRef = useRef(focusedId); focusedRef.current = focusedId
  const maxRef = useRef(maxShown); maxRef.current = maxShown
  const rawShownRef = useRef(rawShown); rawShownRef.current = rawShown

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = (): void => setMaxShown(computeMax())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const tabById = useCallback(
    (id: string): Tab | undefined => tabs.tabs.find((t) => t.id === id),
    [tabs.tabs]
  )

  const isPinned = useCallback(
    (tabId: string): boolean => {
      const t = tabById(tabId)
      return !!t && t.kind === 'canvas' && pinned.isPinned(t.ref)
    },
    [tabById, pinned]
  )

  // The tabId of the pinned canvas (if any), tracked in a ref so the functional updaters in show()
  // and the narrow effect can protect it from auto-eviction without stale closures (§5.6: a pinned
  // canvas always stays in the rightmost pane). null when nothing is pinned / its tab isn't open.
  const pinnedTabId = pinned.pinnedRef
    ? tabs.tabs.find((t) => t.kind === 'canvas' && t.ref === pinned.pinnedRef)?.id ?? null
    : null
  const pinnedTabIdRef = useRef<string | null>(pinnedTabId); pinnedTabIdRef.current = pinnedTabId

  // Window narrowed (maxShown dropped): park overflow from the RIGHT, never the focused pane
  // (skip it; if it is the only one left to drop, the remaining non-focused are removed first).
  useEffect(() => {
    setRawShown((prev) => {
      if (prev.length <= maxShown) return prev
      const kept = prev.slice()
      while (kept.length > maxShown) {
        let idx = kept.length - 1
        while (idx >= 0 && (kept[idx] === focusedRef.current || kept[idx] === pinnedTabIdRef.current)) idx--
        if (idx < 0) kept.pop() // only the focused + pinned remain and still overflow (e.g. max 1): drop right
        else kept.splice(idx, 1)
      }
      return kept
    })
  }, [maxShown])

  const show = useCallback((tabId: string, opts?: { at?: number; replaceFocused?: boolean; keep?: string }): void => {
    setRawShown((prev) => {
      if (prev.includes(tabId)) return prev // already shown -- just (re)focus below
      const next = prev.slice()
      const cap = maxRef.current
      if (opts?.at !== undefined) {
        const at = Math.max(0, Math.min(opts.at, next.length))
        next.splice(at, 0, tabId)
        const keep = opts.keep
        while (next.length > cap) {
          // drop a tab that is neither focused, the just-inserted one, explicitly kept, nor the pinned canvas
          let idx = next.length - 1
          while (idx >= 0 && (next[idx] === focusedRef.current || next[idx] === tabId || next[idx] === keep || next[idx] === pinnedTabIdRef.current)) idx--
          if (idx < 0) next.splice(next[next.length - 1] === tabId ? 0 : next.length - 1, 1)
          else next.splice(idx, 1)
        }
      } else if (next.length < cap) {
        next.push(tabId)
      } else {
        // Replace the focused pane (displaced -> parked) -- but NEVER the pinned canvas. If the
        // focused pane IS the pin (or there's no focus), evict the rightmost non-pinned slot instead.
        let ti = focusedRef.current ? next.indexOf(focusedRef.current) : -1
        if (ti < 0 || next[ti] === pinnedTabIdRef.current) {
          ti = next.length - 1
          while (ti >= 0 && next[ti] === pinnedTabIdRef.current) ti--
        }
        if (ti >= 0) next[ti] = tabId
        else next.push(tabId) // every slot is the pinned canvas (unreachable in practice) -- just append
      }
      return next
    })
    setFocusedId(tabId)
  }, [])

  const park = useCallback((tabId: string): void => {
    setRawShown((prev) => prev.filter((id) => id !== tabId))
    setFocusedId((cur) => (cur === tabId ? rawShownRef.current.filter((id) => id !== tabId)[0] ?? null : cur))
  }, [])

  const focus = useCallback((tabId: string): void => {
    setFocusedId((cur) => (rawShownRef.current.includes(tabId) ? tabId : cur))
  }, [])

  const togglePin = useCallback((tabId: string): void => {
    const t = tabById(tabId)
    if (!t || t.kind !== 'canvas') return
    pinned.toggle(t.ref) // re-order to rightmost happens in the derived output below
  }, [tabById, pinned])

  const releaseClosed = useCallback((tabId: string): void => {
    const t = tabById(tabId)
    if (t && t.kind === 'canvas' && pinned.pinnedRef === t.ref) pinned.unpin()
    setRawShown((prev) => prev.filter((id) => id !== tabId))
    setFocusedId((cur) => (cur === tabId ? rawShownRef.current.filter((id) => id !== tabId)[0] ?? null : cur))
  }, [tabById, pinned])

  // Derive the public ordering: drop tabs whose Tab is gone, then float the pinned canvas rightmost.
  const liveShown = rawShown.filter((id) => tabById(id) !== undefined)
  const pinnedShown = liveShown.filter((id) => isPinned(id))
  const restShown = liveShown.filter((id) => !isPinned(id))
  const ordered = [...restShown, ...pinnedShown]

  // A focused pane always exists when any pane is shown; null only in library view.
  const effectiveFocused =
    ordered.length === 0 ? null : focusedId && ordered.includes(focusedId) ? focusedId : ordered[0]

  const panes: Pane[] = ordered.map((id) => {
    const t = tabById(id)!
    return { tabId: id, kind: t.kind, ref: t.ref, title: t.title, focused: id === effectiveFocused, pinned: isPinned(id) }
  })
  const parkedIds = tabs.tabs.filter((t) => !ordered.includes(t.id)).map((t) => t.id)

  return { panes, shownIds: ordered, parkedIds, focusedId: effectiveFocused, maxShown, show, park, focus, isPinned, togglePin, pinnedRef: pinned.pinnedRef, unpin: pinned.unpin, releaseClosed }
}
