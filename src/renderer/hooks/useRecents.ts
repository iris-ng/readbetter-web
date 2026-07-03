import { useCallback, useState } from 'react'
import type { StructureSummary } from '../../core/model/structure'

const RECENTS_KEY = 'rb-recents'
const STRUCT_KEY = 'rb-structure'

function read<T>(key: string): Record<string, T> {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as Record<string, T>) : {}
  } catch {
    return {}
  }
}

function write<T>(key: string, value: Record<string, T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable — ignore
  }
}

function identity(projectId: string | null | undefined, ref: string): string {
  return projectId ? JSON.stringify([projectId, ref]) : ref
}

export interface UseRecents {
  recordOpen(ref: string, summary?: StructureSummary): void
  lastOpened(ref: string): number | null
  structure(ref: string): StructureSummary | null
  sortByRecent(refs: string[]): string[]
}

export function useRecents(projectId?: string | null): UseRecents {
  const [recents, setRecents] = useState<Record<string, number>>(() => read<number>(RECENTS_KEY))
  const [structs, setStructs] = useState<Record<string, StructureSummary>>(() => read<StructureSummary>(STRUCT_KEY))

  const recordOpen = useCallback(
    (ref: string, summary?: StructureSummary) => {
      const key = identity(projectId, ref)
      setRecents((prev) => {
        const next = { ...prev, [key]: Date.now() }
        write(RECENTS_KEY, next)
        return next
      })
      if (summary) {
        setStructs((prev) => {
          const next = { ...prev, [key]: summary }
          write(STRUCT_KEY, next)
          return next
        })
      }
    },
    [projectId]
  )

  const lastOpened = useCallback((ref: string) => recents[identity(projectId, ref)] ?? null, [projectId, recents])
  const structure = useCallback((ref: string) => structs[identity(projectId, ref)] ?? null, [projectId, structs])
  const sortByRecent = useCallback(
    (refs: string[]) => [...refs].sort((a, b) => (recents[identity(projectId, b)] ?? 0) - (recents[identity(projectId, a)] ?? 0)),
    [projectId, recents]
  )

  return { recordOpen, lastOpened, structure, sortByRecent }
}
