import { Anchor } from '../anchor/anchor'
import { Link, isValidLink } from '../link/link'

export const SCHEMA_VERSION = 3

export interface Annotation {
  id: string
  anchor: Anchor
  color: string
  /** '' === a bare highlight (no comment). */
  note: string
}

/** A pinned text range (passage) within a section. */
export interface PinAnchor {
  anchor: Anchor
  /** Denormalized containing-section id. */
  sectionId: string
}

export interface SavedView {
  id: string
  name: string
  pinnedAnchors: PinAnchor[]
}

export interface Sidecar {
  schemaVersion: number
  documentId: string
  sourceHash: string
  annotations: Annotation[]
  readingHeat: null // reserved; not populated in this slice
  links: Link[]
  /** Annotations that failed to re-anchor after the source changed; kept, never deleted (decision #6). */
  orphans: Annotation[]
  savedViews: SavedView[]
}

export function emptySidecar(documentId: string, sourceHash: string): Sidecar {
  return {
    schemaVersion: SCHEMA_VERSION,
    documentId,
    sourceHash,
    annotations: [],
    readingHeat: null,
    links: [],
    orphans: [],
    savedViews: []
  }
}

export function serializeSidecar(sidecar: Sidecar): string {
  return JSON.stringify(sidecar, null, 2)
}

function isValidAnchorShape(anc: unknown): anc is Anchor {
  if (typeof anc !== 'object' || anc === null) return false
  const a = anc as Record<string, unknown>
  return (
    typeof a.start === 'number' &&
    typeof a.end === 'number' &&
    typeof a.exact === 'string' &&
    typeof a.prefix === 'string' &&
    typeof a.suffix === 'string'
  )
}

function isValidAnnotation(a: unknown): a is Annotation {
  if (typeof a !== 'object' || a === null) return false
  const x = a as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    typeof x.color === 'string' &&
    typeof x.note === 'string' &&
    isValidAnchorShape(x.anchor)
  )
}

export function isValidPinAnchor(x: unknown): x is PinAnchor {
  if (typeof x !== 'object' || x === null) return false
  const p = x as Record<string, unknown>
  return typeof p.sectionId === 'string' && isValidAnchorShape(p.anchor)
}

function isValidSavedView(x: unknown): x is SavedView {
  if (typeof x !== 'object' || x === null) return false
  const v = x as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.pinnedAnchors) &&
    (v.pinnedAnchors as unknown[]).every(isValidPinAnchor)
  )
}

/** Parse + validate a sidecar. Tolerant of missing reserved fields; strict on required ones. */
export function parseSidecar(raw: string): Sidecar {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('sidecar: root must be a JSON object')
  }
  const v = parsed as Record<string, unknown>
  if (typeof v.documentId !== 'string') throw new Error('sidecar: documentId must be a string')
  if (typeof v.sourceHash !== 'string') throw new Error('sidecar: sourceHash must be a string')
  if (!Array.isArray(v.annotations)) throw new Error('sidecar: annotations must be an array')
  if (!(v.annotations as unknown[]).every(isValidAnnotation)) {
    throw new Error('sidecar: malformed annotation entry')
  }
  return {
    schemaVersion: typeof v.schemaVersion === 'number' ? v.schemaVersion : SCHEMA_VERSION,
    documentId: v.documentId,
    sourceHash: v.sourceHash,
    annotations: v.annotations as Annotation[],
    readingHeat: null,
    links: Array.isArray(v.links) ? (v.links as unknown[]).filter(isValidLink) : [],
    orphans: Array.isArray(v.orphans) ? (v.orphans as unknown[]).filter(isValidAnnotation) : [],
    savedViews: Array.isArray(v.savedViews)
      ? (v.savedViews as unknown[]).filter(isValidSavedView)
      : []
  }
}

export function addSavedView(views: SavedView[], view: SavedView): SavedView[] {
  return [...views, view]
}

export function renameSavedView(views: SavedView[], id: string, name: string): SavedView[] {
  return views.map((v) => (v.id === id ? { ...v, name } : v))
}

export function removeSavedView(views: SavedView[], id: string): SavedView[] {
  return views.filter((v) => v.id !== id)
}
