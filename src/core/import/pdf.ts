import { DocumentModel } from '../model/document'
import { slug } from '../model/slug'
import { layoutPdf } from '../pdf/pdfLayout'
import type { PdfParseResult } from '../pdf/liteparse'

/** Build the shared DocumentModel from a LiteParse parse result: one section per page. */
export function buildPdfModel(parse: PdfParseResult, title: string): DocumentModel {
  const { text, sections } = layoutPdf(parse)
  return { id: `doc-${slug(title)}`, title, format: 'pdf', text, sections }
}
