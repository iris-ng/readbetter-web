import { Section } from '../model/document'

export interface HighlightRange {
  start: number
  end: number
  id: string
  color: string
}

export interface Segment {
  text: string
  annotationIds: string[]
  colors: string[]
}

/**
 * Absolute offset into DocumentModel.text of each paragraph in a section, matching the
 * markdown importer's layout: `heading + '\n' + paragraphs.join('\n\n')` (preamble has no
 * heading; paragraphs are separated by '\n\n').
 */
export function paragraphOffsets(section: Section): number[] {
  const offsets: number[] = []
  let cursor = section.charStart + (section.heading ? section.heading.length + 1 : 0)
  for (const p of section.paragraphs) {
    offsets.push(cursor)
    cursor += p.length + 2 // '\n\n' separator between paragraphs
  }
  return offsets
}

/**
 * Cut a paragraph (`text`, starting at absolute `baseOffset`) at every highlight boundary.
 * Each returned segment lists the annotations covering it (0 = plain, 1 = single, 2+ = overlap).
 */
export function segmentParagraph(text: string, baseOffset: number, ranges: HighlightRange[]): Segment[] {
  const len = text.length
  const points = new Set<number>([0, len])
  for (const r of ranges) {
    const s = Math.max(0, r.start - baseOffset)
    const e = Math.min(len, r.end - baseOffset)
    if (e > s) {
      points.add(s)
      points.add(e)
    }
  }
  const sorted = [...points].sort((a, b) => a - b)
  const segs: Segment[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i]
    const e = sorted[i + 1]
    if (e <= s) continue
    const covering = ranges.filter((r) => r.start - baseOffset <= s && r.end - baseOffset >= e)
    segs.push({
      text: text.slice(s, e),
      annotationIds: covering.map((r) => r.id),
      colors: covering.map((r) => r.color)
    })
  }
  return segs
}
