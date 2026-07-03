import { Anchor } from '../../core/anchor/anchor'
import { wordAnchorFromPoint } from './wordAnchor'

/** A resolved link endpoint: the word anchor under (or nearest to) the click point. */
export type LinkPick = { anchor: Anchor }

/**
 * Resolve a click point to the word anchor under it (or, on whitespace, the nearest word —
 * see wordAnchorFromPoint). Format-agnostic: highlights are never consulted. Returns null when
 * the point resolves to no document text.
 */
export function linkPickFromPoint(clientX: number, clientY: number, docText: string): LinkPick | null {
  const anchor = wordAnchorFromPoint(clientX, clientY, docText)
  return anchor ? { anchor } : null
}
