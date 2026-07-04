import { Anchor } from '../../core/anchor/anchor'
import type { PageRectRegion } from '../../core/anchor/region'
import { wordAnchorFromPoint } from './wordAnchor'

export type LinkPickAnnotation = {
  id: string
  anchor: Anchor
  range: { start: number; end: number }
}

/** A resolved link endpoint: text word or whole annotation under the click point. */
export type LinkPick =
  | { kind: 'text'; anchor: Anchor }
  | { kind: 'annotation'; anchor: Anchor; annotationId: string }
  | { kind: 'region'; anchor: Anchor; region: PageRectRegion }

/**
 * Resolve the click point to a whole annotation when the clicked word falls inside one;
 * otherwise use the word anchor under it (or, on whitespace, the nearest word).
 */
export function linkPickFromPoint(
  clientX: number,
  clientY: number,
  docText: string,
  annotations: LinkPickAnnotation[] = []
): LinkPick | null {
  const anchor = wordAnchorFromPoint(clientX, clientY, docText)
  if (!anchor) return null
  const hit = annotations.find((a) => anchor.start >= a.range.start && anchor.start < a.range.end)
  if (hit) return { kind: 'annotation', anchor: hit.anchor, annotationId: hit.id }
  return { kind: 'text', anchor }
}
