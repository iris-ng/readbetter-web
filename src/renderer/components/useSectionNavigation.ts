import { useCallback, useEffect, useState } from 'react'

/** Tracks the active section index and moves it with ArrowUp/ArrowDown, clamped to range. */
export function useSectionNavigation(count: number): {
  activeIndex: number
  setActiveIndex: (i: number) => void
} {
  const [activeIndex, setActiveIndexState] = useState(0)

  const setActiveIndex = useCallback(
    (i: number) => setActiveIndexState(Math.max(0, Math.min(count - 1, i))),
    [count]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (count === 0) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndexState((i) => Math.min(count - 1, i + 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndexState((i) => Math.max(0, i - 1)) }
    }
    // Forward-looking: this is a window-level listener and preventDefaults arrows app-wide.
    // Scope it to the reader container (or check e.target) before adding text inputs/other surfaces.
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [count])

  // setActiveIndex is the programmatic-navigation entry point — a back-link flash or a
  // connection Jump scrolls the Reader/PDF view to the target section through it.
  return { activeIndex, setActiveIndex }
}
