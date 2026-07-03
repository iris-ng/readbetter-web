import { DocumentModel, Section } from '../model/document'
import { slug } from '../model/slug'

interface RawSection { level: number; heading: string; bodyLines: string[] }

function splitParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = []
  let current: string[] = []
  // Soft-wrap: consecutive non-blank lines fold into a single paragraph; a blank line separates paragraphs.
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length) { paragraphs.push(current.join(' ').trim()); current = [] }
    } else {
      current.push(line.trim())
    }
  }
  if (current.length) paragraphs.push(current.join(' ').trim())
  return paragraphs.filter((p) => p.length > 0)
}

export function importMarkdown(source: string, title: string): DocumentModel {
  const lines = source.split(/\r?\n/)
  const raw: RawSection[] = []
  let currentBody: string[] = []
  let opened = false

  const settle = (): void => {
    if (raw.length === 0 && !opened && currentBody.some((l) => l.trim() !== '')) {
      raw.push({ level: 0, heading: '', bodyLines: currentBody })
    } else if (opened) {
      raw[raw.length - 1].bodyLines = currentBody
    }
    currentBody = []
  }

  const flush = (level: number, heading: string): void => {
    settle()
    if (level > 0) { raw.push({ level, heading, bodyLines: [] }); opened = true }
  }

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (m) {
      flush(m[1].length, m[2])
    } else {
      currentBody.push(line)
    }
  }
  settle()

  const sections: Section[] = []
  let text = ''
  raw.forEach((r, order) => {
    const paragraphs = splitParagraphs(r.bodyLines)
    let sectionText: string
    if (r.heading === '') {
      sectionText = paragraphs.join('\n\n')                 // preamble: no synthetic leading newline
    } else if (paragraphs.length === 0) {
      sectionText = r.heading                                // heading with no body: no trailing newline
    } else {
      sectionText = r.heading + '\n' + paragraphs.join('\n\n')
    }
    const charStart = text.length
    text += sectionText
    const charEnd = text.length
    if (order < raw.length - 1) text += '\n\n'
    sections.push({
      id: `${order}-${slug(r.heading || 'section')}`,
      level: r.level,
      heading: r.heading,
      order,
      charStart,
      charEnd,
      paragraphs
    })
  })

  return { id: `doc-${slug(title)}`, title, format: 'markdown', text, sections }
}
