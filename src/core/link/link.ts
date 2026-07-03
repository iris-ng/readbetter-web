import { Anchor } from '../anchor/anchor'

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

function isAnchorShape(x: unknown): x is Anchor {
  if (typeof x !== 'object' || x === null) return false
  const a = x as Record<string, unknown>
  return (
    typeof a.start === 'number' &&
    typeof a.end === 'number' &&
    typeof a.exact === 'string' &&
    typeof a.prefix === 'string' &&
    typeof a.suffix === 'string'
  )
}

export function isValidLink(x: unknown): x is Link {
  if (typeof x !== 'object' || x === null) return false
  const l = x as Record<string, unknown>
  if (typeof l.id !== 'string' || typeof l.otherDocRef !== 'string') return false
  return isAnchorShape(l.anchor)
}
