import { Section } from '../model/document'
import { slug } from '../model/slug'
import type { PdfParseResult, PdfRun } from './liteparse'

/** A parsed run enriched with its char-offset span into DocumentModel.text. */
export interface RunOffset extends PdfRun {
  charStart: number // inclusive offset into DocumentModel.text
  charEnd: number // exclusive
}

export interface PdfLayout {
  text: string
  sections: Section[]
  runIndex: RunOffset[]
}

/**
 * Single source of the PDF offset space: builds DocumentModel.text + sections (one per page)
 * AND the per-run offset index in one pass, so "what selection sees" and "what render maps"
 * can never drift. One section per page; the section span includes the synthetic heading line,
 * `paragraphs` holds the joined body only.
 */
export function layoutPdf(parse: PdfParseResult): PdfLayout {
  const sections: Section[] = []
  const runIndex: RunOffset[] = []
  let text = ''
  parse.pages.forEach((page, i) => {
    const runs = parse.runs.filter((r) => r.pageIndex === page.index)
    const body = runs.map((r) => r.text).join(' ')
    const heading = `Page ${page.index + 1}`
    const charStart = text.length
    text += heading
    if (runs.length > 0) {
      text += '\n'
      runs.forEach((r, k) => {
        if (k > 0) text += ' '
        const runStart = text.length
        text += r.text
        runIndex.push({ ...r, charStart: runStart, charEnd: text.length })
      })
    }
    const charEnd = text.length
    if (i < parse.pages.length - 1) text += '\n\n'
    sections.push({
      id: `${page.index}-${slug(heading)}`,
      level: 1,
      heading,
      order: page.index,
      charStart,
      charEnd,
      paragraphs: body ? [body] : []
    })
  })
  return { text, sections, runIndex }
}

export function buildPdfRunIndex(parse: PdfParseResult): RunOffset[] {
  return layoutPdf(parse).runIndex
}
