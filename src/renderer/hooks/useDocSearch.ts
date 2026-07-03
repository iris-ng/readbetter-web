import { useCallback, useEffect, useMemo, useState } from 'react'
import { findMatches, SearchMatch } from '../search/searchMatch'

export interface UseDocSearch {
  query: string
  setQuery(q: string): void
  matches: SearchMatch[]
  activeIndex: number
  activeMatch: SearchMatch | null
  next(): void
  prev(): void
  reset(): void
}

/** Owns per-document find-in-page state. Matching is a synchronous indexOf scan (sub-millisecond,
 *  even for large docs), so results recompute via useMemo — no debounce needed. */
export function useDocSearch(docText: string): UseDocSearch {
  const [query, setQueryRaw] = useState('')
  const [rawIndex, setRawIndex] = useState(0)

  const matches = useMemo(() => findMatches(docText, query), [docText, query])

  // A new query (or a document swap) restarts navigation at the first match.
  useEffect(() => setRawIndex(0), [query, docText])

  const activeIndex = matches.length === 0 ? -1 : Math.min(rawIndex, matches.length - 1)
  const activeMatch = activeIndex >= 0 ? matches[activeIndex] : null

  const setQuery = useCallback((q: string) => setQueryRaw(q), [])
  const next = useCallback(
    () => setRawIndex((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length)),
    [matches.length],
  )
  const prev = useCallback(
    () => setRawIndex((i) => (matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length)),
    [matches.length],
  )
  const reset = useCallback(() => {
    setQueryRaw('')
    setRawIndex(0)
  }, [])

  return { query, setQuery, matches, activeIndex, activeMatch, next, prev, reset }
}
