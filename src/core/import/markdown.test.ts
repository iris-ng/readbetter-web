import { describe, it, expect } from 'vitest'
import { importMarkdown } from './markdown'

const SAMPLE = `# Intro
Hello world.

This is readbetter.

## Background
Some context.`

describe('importMarkdown', () => {
  it('produces one section per heading in reading order', () => {
    const doc = importMarkdown(SAMPLE, 'sample.md')
    expect(doc.sections.map((s) => s.heading)).toEqual(['Intro', 'Background'])
    expect(doc.sections.map((s) => s.level)).toEqual([1, 2])
    expect(doc.sections.map((s) => s.order)).toEqual([0, 1])
  })

  it('assigns deterministic ids', () => {
    const doc = importMarkdown(SAMPLE, 'sample.md')
    expect(doc.sections.map((s) => s.id)).toEqual(['0-intro', '1-background'])
  })

  it('groups body lines into paragraphs split on blank lines', () => {
    const doc = importMarkdown(SAMPLE, 'sample.md')
    expect(doc.sections[0].paragraphs).toEqual(['Hello world.', 'This is readbetter.'])
    expect(doc.sections[1].paragraphs).toEqual(['Some context.'])
  })

  it('char offsets round-trip against the normalized text', () => {
    const doc = importMarkdown(SAMPLE, 'sample.md')
    for (const s of doc.sections) {
      const expected =
        s.heading === ''
          ? s.paragraphs.join('\n\n')
          : s.paragraphs.length === 0
            ? s.heading
            : s.heading + '\n' + s.paragraphs.join('\n\n')
      expect(doc.text.slice(s.charStart, s.charEnd)).toBe(expected)
    }
  })

  it('returns an empty document for empty source', () => {
    const doc = importMarkdown('', 'empty.md')
    expect(doc.sections).toEqual([])
    expect(doc.text).toBe('')
  })

  it('ignores blank-only source without creating a phantom section', () => {
    const doc = importMarkdown('\n\n\n', 'blank.md')
    expect(doc.sections).toEqual([])
    expect(doc.text).toBe('')
  })

  it('handles a heading with no body (no trailing newline in its slice)', () => {
    const doc = importMarkdown('# Title', 'h.md')
    expect(doc.sections).toHaveLength(1)
    expect(doc.sections[0]).toMatchObject({ heading: 'Title', level: 1, paragraphs: [] })
    expect(doc.text.slice(doc.sections[0].charStart, doc.sections[0].charEnd)).toBe('Title')
  })

  it('char offsets round-trip for preamble + heading-only mix', () => {
    const doc = importMarkdown('Pre line.\n\n# H', 'mix.md')
    expect(doc.text.startsWith('\n')).toBe(false) // no synthetic leading newline
    for (const s of doc.sections) {
      const expected =
        s.heading === ''
          ? s.paragraphs.join('\n\n')
          : s.paragraphs.length === 0
            ? s.heading
            : s.heading + '\n' + s.paragraphs.join('\n\n')
      expect(doc.text.slice(s.charStart, s.charEnd)).toBe(expected)
    }
  })

  it('captures preamble before the first heading as a level-0 section', () => {
    const doc = importMarkdown('Loose intro line.\n\n# Real Heading\nBody.', 'x.md')
    expect(doc.sections[0]).toMatchObject({ level: 0, heading: '', order: 0 })
    expect(doc.sections[0].paragraphs).toEqual(['Loose intro line.'])
    expect(doc.sections[1].heading).toBe('Real Heading')
  })

  it('sets title and format', () => {
    const doc = importMarkdown(SAMPLE, 'sample.md')
    expect(doc.title).toBe('sample.md')
    expect(doc.format).toBe('markdown')
  })
})
