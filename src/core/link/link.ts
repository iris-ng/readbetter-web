import { Anchor, isValidAnchorShape } from '../anchor/anchor'

/** A document-scoped link to another document, pinned to a plain word anchor. Stored as a
 *  mirrored pair (one record per side, sharing `id`), each pointing back via `otherDocRef`. */
export interface Link {
  id: string
  anchor: Anchor
  otherDocRef: string
}

export function makeLinkPair(
  docARef: string,
  anchorA: Anchor,
  docBRef: string,
  anchorB: Anchor
): { id: string; a: Link; b: Link } {
  const id = crypto.randomUUID()
  return {
    id,
    a: { id, anchor: anchorA, otherDocRef: docBRef },
    b: { id, anchor: anchorB, otherDocRef: docARef }
  }
}

export function removeLink(links: Link[], id: string): Link[] {
  return links.filter((l) => l.id !== id)
}

export function isValidLink(x: unknown): x is Link {
  if (typeof x !== 'object' || x === null) return false
  const l = x as Record<string, unknown>
  if (typeof l.id !== 'string' || typeof l.otherDocRef !== 'string') return false
  return isValidAnchorShape(l.anchor)
}
