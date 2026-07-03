import { useCallback, useEffect, useState } from 'react'

const KEY = 'rb-pinned-canvas'

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function readPinned(projectId?: string | null): string | null {
  try {
    if (!projectId) return localStorage.getItem(KEY)
    return readMap()[projectId] ?? null
  } catch {
    return null
  }
}

function writePinned(projectId: string | null | undefined, ref: string | null): void {
  try {
    if (!projectId) {
      if (ref) localStorage.setItem(KEY, ref)
      else localStorage.removeItem(KEY)
      return
    }

    const next = readMap()
    if (ref) next[projectId] = ref
    else delete next[projectId]
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable — ignore
  }
}

export interface UsePinnedCanvas {
  /** pinned canvas ref, or null. A pinned canvas is pinned as rightmost pane (§5.6). */
  pinnedRef: string | null
  isPinned(ref: string | null): boolean
  /** Pin `ref`; if it is already pinned, unpin. One canvas is pinned at a time per project. */
  toggle(ref: string | null): void
  unpin(): void
}

export function usePinnedCanvas(projectId?: string | null): UsePinnedCanvas {
  const [pinnedRef, setPinnedRef] = useState<string | null>(() => readPinned(projectId))

  useEffect(() => {
    setPinnedRef(readPinned(projectId))
  }, [projectId])

  const toggle = useCallback(
    (ref: string | null) => {
      if (!ref) return
      setPinnedRef((cur) => {
        const next = cur === ref ? null : ref
        writePinned(projectId, next)
        return next
      })
    },
    [projectId]
  )

  const unpin = useCallback(() => {
    setPinnedRef(null)
    writePinned(projectId, null)
  }, [projectId])

  const isPinned = useCallback((ref: string | null) => ref !== null && pinnedRef === ref, [pinnedRef])

  return { pinnedRef, isPinned, toggle, unpin }
}
