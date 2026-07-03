import { Anchor } from '../../core/anchor/anchor'

export interface ExcerptDropPayload {
  source: string
  anchor: Anchor
  /**
   * Captured display text of the passage at drag time. Equals `anchor.exact` at creation, but is
   * stored separately so the card stays readable if the source later drifts and the anchor
   * re-resolves (or orphans): the anchor is the live link, the snapshot is the durable copy.
   */
  snapshot: string
  /** The source highlight's color, so the card is tinted to match. */
  color?: string
  /** The id of the annotation this excerpt was created from, for color-sync. */
  sourceAnnotationId?: string
}

export function excerptCardFromDrop(
  payload: ExcerptDropPayload,
  point: { x: number; y: number }
): { source: string; anchor: Anchor; snapshot: string; x: number; y: number; color?: string; sourceAnnotationId?: string } {
  return {
    source: payload.source,
    anchor: payload.anchor,
    snapshot: payload.snapshot,
    color: payload.color,
    sourceAnnotationId: payload.sourceAnnotationId,
    x: point.x,
    y: point.y
  }
}
