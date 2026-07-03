export type DocumentFormat = 'markdown' | 'html' | 'epub' | 'pdf'

/** One section of a document, in reading order. The anchor space is DocumentModel.text. */
export interface Section {
  /** Deterministic id: `${order}-${slug(heading)}`. Stable across re-imports of identical input. */
  id: string
  /** Heading level 1-6; 0 for preamble content before the first heading. */
  level: number
  /** Heading text; '' for preamble. */
  heading: string
  /** 0-based reading-order index. */
  order: number
  /** Inclusive start offset into DocumentModel.text. */
  charStart: number
  /** Exclusive end offset into DocumentModel.text. */
  charEnd: number
  /** Plain-text paragraphs of this section's body, in order. */
  paragraphs: string[]
}

export interface DocumentModel {
  id: string
  title: string
  format: DocumentFormat
  /** Full normalized plain text; the stable anchor space for sections and (later) annotations. */
  text: string
  sections: Section[]
}

export function isDocumentModel(value: unknown): value is DocumentModel {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.text === 'string' &&
    // Intentionally shallow: validates only the top-level shape, not `format` or section contents.
    Array.isArray(v.sections)
  )
}
