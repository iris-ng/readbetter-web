import { useCallback, useEffect, useRef, useState } from 'react'

export type TabKind = 'doc' | 'canvas'
export interface Tab { id: string; kind: TabKind; ref: string; title: string }
export type ActiveView = { view: 'library' } | { view: 'tab'; id: string }

export interface UseTabs {
  tabs: Tab[]
  active: ActiveView
  activeTab: Tab | null
  openTab(kind: TabKind, ref: string, title: string): string
  closeTab(id: string): void
  focusTab(id: string): void
  focusLibrary(): void
}

function urlFor(active: ActiveView, tabs: Tab[]): string {
  if (active.view === 'library') return '/'
  const t = tabs.find((x) => x.id === active.id)
  if (!t) return '/'
  return `/?${t.kind}=${encodeURIComponent(t.ref)}`
}

/** Returns true when this window was opened as a satellite (URL has `detached=1`). */
export function isDetachedBoot(): boolean {
  return new URLSearchParams(window.location.search).get('detached') === '1'
}

/** Builds the URL to open a detached satellite window for the given entity. */
export function detachUrl(kind: 'doc' | 'canvas', ref: string): string {
  return `/?${kind}=${encodeURIComponent(ref)}&detached=1`
}

function parseUrl(): { kind: TabKind; ref: string } | null {
  const p = new URLSearchParams(window.location.search)
  const doc = p.get('doc')
  if (doc) return { kind: 'doc', ref: doc }
  const canvas = p.get('canvas')
  if (canvas) return { kind: 'canvas', ref: canvas }
  return null
}

export function useTabs(): UseTabs {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<ActiveView>({ view: 'library' })
  const tabsRef = useRef<Tab[]>(tabs)
  tabsRef.current = tabs

  // Seed from the initial URL (ref only; title defaults to the filename until the loader updates it).
  useEffect(() => {
    const init = parseUrl()
    if (!init) return
    const id = crypto.randomUUID()
    setTabs([{ id, kind: init.kind, ref: init.ref, title: init.ref.split('/').pop() ?? init.ref }])
    setActive({ view: 'tab', id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror active → URL.
  useEffect(() => {
    const url = urlFor(active, tabs)
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState({}, '', url)
    }
  }, [active, tabs])

  // URL (back/forward) → active.
  useEffect(() => {
    const onPop = (): void => {
      const u = parseUrl()
      if (!u) { setActive({ view: 'library' }); return }
      const existing = tabsRef.current.find((t) => t.kind === u.kind && t.ref === u.ref)
      if (existing) { setActive({ view: 'tab', id: existing.id }); return }
      const id = crypto.randomUUID()
      setTabs((prev) => [...prev, { id, kind: u.kind, ref: u.ref, title: u.ref.split('/').pop() ?? u.ref }])
      setActive({ view: 'tab', id })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const openTab = useCallback((kind: TabKind, ref: string, title: string) => {
    const existing = tabsRef.current.find((t) => t.kind === kind && t.ref === ref)
    const id = existing ? existing.id : crypto.randomUUID()
    if (!existing) setTabs((prev) => [...prev, { id, kind, ref, title }])
    setActive({ view: 'tab', id })
    return id
  }, [])

  const closeTab = useCallback((id: string) => {
    const cur = tabsRef.current
    const idx = cur.findIndex((t) => t.id === id)
    const next = cur.filter((t) => t.id !== id)
    setTabs((prev) => prev.filter((t) => t.id !== id))
    setActive((a) => {
      if (a.view === 'tab' && a.id === id) {
        const neighbor = next[idx] ?? next[idx - 1]
        return neighbor ? { view: 'tab', id: neighbor.id } : { view: 'library' }
      }
      return a
    })
  }, [])

  const focusTab = useCallback((id: string) => setActive({ view: 'tab', id }), [])
  const focusLibrary = useCallback(() => setActive({ view: 'library' }), [])

  const activeTab = active.view === 'tab' ? tabs.find((t) => t.id === active.id) ?? null : null
  return { tabs, active, activeTab, openTab, closeTab, focusTab, focusLibrary }
}
