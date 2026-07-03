import { useEffect, useRef, useState, type JSX, type ButtonHTMLAttributes, type RefObject } from 'react'
import { Icon, type IconName } from './Icon'

/** Attach the returned ref to a container; `narrow` flips true once it is below `threshold` px.
 *  Stays false where ResizeObserver is unavailable (jsdom) — the safe, label-showing default. */
export function useNarrow(threshold: number): [RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setNarrow(e.contentRect.width < threshold)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [threshold])
  return [ref, narrow]
}

type Props = { collapsed: boolean; icon: IconName; label: string }
  & ButtonHTMLAttributes<HTMLButtonElement>

/** A control that shows its label when there is room and collapses to icon-only when squashed,
 *  always keeping title + aria-label (spec §6). */
export function CollapsibleControl({ collapsed, icon, label, ...rest }: Props): JSX.Element {
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...rest.style }}
    >
      <Icon name={icon} />
      {!collapsed && <span>{label}</span>}
    </button>
  )
}
