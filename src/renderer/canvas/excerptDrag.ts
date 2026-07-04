import { Anchor } from '../../core/anchor/anchor'

export interface ExcerptDropPayload {
 source: string
 anchor: Anchor
 /**
 * Captured display text passage drag time. Equals `anchor.exact` creation, but is
 * stored separately card stays readable if source later drifts anchor
 * re-resolves (or orphans): anchor live link, snapshot durable copy.
 */
 snapshot: string
 /** source highlight's color, so card tinted match. */
 color?: string
 /** Asset-backed preview for visual PDF regions. */
 previewAssetRef?: string
 /** Optional rendered crop for visual PDF regions. */
 previewDataUrl?: string
 /** id annotation excerpt created from, for color-sync. */
 sourceAnnotationId?: string
}

export function excerptCardFromDrop(
 payload: ExcerptDropPayload,
 point: { x: number; y: number }
): {
 source: string
 anchor: Anchor
 snapshot: string
 x: number
 y: number
 color?: string
 previewAssetRef?: string
 previewDataUrl?: string
 sourceAnnotationId?: string
} {
 return {
 source: payload.source,
 anchor: payload.anchor,
 snapshot: payload.snapshot,
 color: payload.color,
 previewAssetRef: payload.previewAssetRef,
 previewDataUrl: payload.previewDataUrl,
 sourceAnnotationId: payload.sourceAnnotationId,
 x: point.x,
 y: point.y
 }
}
