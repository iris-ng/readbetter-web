// src/renderer/hooks/useProjects.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlatformAdapter } from '../platform/PlatformAdapter'
import type { ProjectInfo } from '../../core/library/types'

const ACTIVE_KEY = 'rb.activeProject'

export interface UseProjects {
  projects: ProjectInfo[]
  activeId: string | null
  active: ProjectInfo | null
  refresh(): Promise<void>
  add(path: string): Promise<ProjectInfo>
  relocate(id: string, path: string): Promise<ProjectInfo>
  remove(id: string): Promise<void>
  select(id: string | null): void
}

export function useProjects(adapter: PlatformAdapter): UseProjects {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

  // Keep a stable adapter ref so effects do not re-run when tests create new
  // adapter objects on every render.
  const adapterRef = useRef<PlatformAdapter>(adapter)
  adapterRef.current = adapter

  const select = useCallback((id: string | null) => {
    setActiveId(id)
    try {
      id ? localStorage.setItem(ACTIVE_KEY, id) : localStorage.removeItem(ACTIVE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const refresh = useCallback(async () => {
    const list = await adapterRef.current.listProjects()
    setProjects(list)
  }, [])

  useEffect(() => {
    void (async () => {
      const list = await adapterRef.current.listProjects()
      setProjects(list)

      let stored: string | null = null
      try {
        stored = localStorage.getItem(ACTIVE_KEY)
      } catch {
        /* ignore */
      }
      if (stored && list.some((p) => p.id === stored && !p.missing)) setActiveId(stored)
    })()
  }, [])

  const add = useCallback(
    async (path: string) => {
      const p = await adapterRef.current.registerProject(path)
      setProjects((prev) => {
        const without = prev.filter((existing) => existing.id !== p.id)
        return [...without, p]
      })
      select(p.id)
      return p
    },
    [select]
  )

  const relocate = useCallback(
    async (id: string, path: string) => {
      const p = await adapterRef.current.relocateProject(id, path)
      setProjects((prev) => prev.map((existing) => (existing.id === id ? p : existing)))
      if (activeIdRef.current === id) select(id)
      return p
    },
    [select]
  )

  const remove = useCallback(
    async (id: string) => {
      await adapterRef.current.unregisterProject(id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      if (activeIdRef.current === id) select(null)
    },
    [select]
  )

  const active = projects.find((p) => p.id === activeId && !p.missing) ?? null

  return { projects, activeId, active, refresh, add, relocate, remove, select }
}
