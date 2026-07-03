import { describe, it, expect } from 'vitest'
import {
  CanvasModel,
  emptyCanvas,
  serializeCanvas,
  parseCanvas,
  canvasTitle,
  canvasDeleted,
  uniqueCanvasRef
} from './canvas'

const sample: CanvasModel = {
  schemaVersion: 1,
  id: 'free-will',
  title: 'Free will vs determinism',
  viewport: { x: 10, y: -20, zoom: 1.5 },
  cards: [
    {
      kind: 'excerpt',
      id: 'c1',
      source: 'documents/hume.md',
      anchor: { start: 4210, end: 4380, exact: 'Reason is, and ought', prefix: 'pre', suffix: 'suf' },
      snapshot: 'Reason is, and ought only to be the slave of the passions.',
      note: "Hume's is-ought hinge.",
      x: 120,
      y: 80
    },
    { kind: 'note', id: 'c2', note: 'Does this defeat moral responsibility?', x: 420, y: 80 }
  ],
  connections: []
}

describe('canvas codec', () => {
  it('round-trips a model through serialize → parse', () => {
    expect(parseCanvas(serializeCanvas(sample))).toEqual(sample)
  })

  it('round-trips arbitrary text (quotes, colons, #, newlines, emoji)', () => {
    const gnarly: CanvasModel = {
      ...emptyCanvas('x', 'Title: with "quotes" # and 🙂'),
      cards: [
        {
          kind: 'excerpt',
          id: 'c1',
          source: 'documents/a.md',
          anchor: { start: 0, end: 5, exact: 'a"b:c\n# d', prefix: '', suffix: '🙂' },
          snapshot: 'line one\nline two: with "quotes" # hash',
          note: 'note "with"\nmultiple lines',
          x: 0,
          y: 0
        }
      ]
    }
    expect(parseCanvas(serializeCanvas(gnarly))).toEqual(gnarly)
  })

  it('round-trips snapshot text whose own line looks like a card marker', () => {
    const m: CanvasModel = {
      ...emptyCanvas('x', 'X'),
      cards: [
        {
          kind: 'excerpt',
          id: 'c1',
          source: 'documents/a.md',
          anchor: { start: 0, end: 1, exact: 'a', prefix: '', suffix: '' },
          snapshot: 'line one\n<!-- rb:card bogus -->\nline three',
          note: 'note with <!-- rb:card bogus --> mention',
          x: 0,
          y: 0
        }
      ]
    }
    expect(parseCanvas(serializeCanvas(m))).toEqual(m)
  })

  it('preserves a PDF anchor page selector', () => {
    const pdf: CanvasModel = {
      ...emptyCanvas('p', 'Pdf'),
      cards: [
        {
          kind: 'excerpt',
          id: 'c1',
          source: 'documents/p.pdf',
          anchor: {
            start: 1,
            end: 2,
            exact: 'x',
            prefix: '',
            suffix: '',
            page: { quads: [{ pageIndex: 3, x: 1.5, y: 2, w: 3, h: 4 }] }
          },
          snapshot: 'x',
          note: '',
          x: 0,
          y: 0
        }
      ]
    }
    expect(parseCanvas(serializeCanvas(pdf))).toEqual(pdf)
  })

  it('serializes a clean readable body (blockquote + note, hidden markers)', () => {
    const out = serializeCanvas(sample)
    expect(out).toContain('<!-- rb:card c1 -->')
    expect(out).toContain('> Reason is, and ought only to be the slave of the passions.')
    expect(out).toContain("Hume's is-ought hinge.")
    expect(out).toContain('Does this defeat moral responsibility?')
  })

  it('round-trips an empty canvas', () => {
    const e = emptyCanvas('empty', 'Empty')
    expect(parseCanvas(serializeCanvas(e))).toEqual(e)
  })

  it('round-trips the soft-delete flag and reads it cheaply', () => {
    const active = emptyCanvas('a', 'A')
    expect(parseCanvas(serializeCanvas(active)).deleted).toBeUndefined()
    expect(canvasDeleted(serializeCanvas(active))).toBe(false)
    const trashed: CanvasModel = { ...emptyCanvas('a', 'A'), deleted: true }
    const out = serializeCanvas(trashed)
    expect(parseCanvas(out)).toEqual(trashed)
    expect(canvasDeleted(out)).toBe(true)
  })

  it('round-trips connections, a resized card (w/h), and an excerpt color', () => {
    const m: CanvasModel = {
      ...emptyCanvas('x', 'X'),
      cards: [
        {
          kind: 'excerpt',
          id: 'c1',
          source: 'documents/a.md',
          anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' },
          snapshot: 'abc',
          note: '',
          color: '#fde68a',
          x: 10,
          y: 20,
          w: 300,
          h: 180
        },
        { kind: 'note', id: 'c2', note: 'hi', x: 400, y: 20 }
      ],
      connections: [
        { from: 'c1', to: 'c2', label: 'contradicts' },
        { from: 'c2', to: 'c1' }
      ]
    }
    expect(parseCanvas(serializeCanvas(m))).toEqual(m)
  })

  it('throws on a malformed file (so the caller never overwrites it)', () => {
    expect(() => parseCanvas('not a canvas')).toThrow()
    expect(() => parseCanvas('---\nid: "x"\n---\n')).toThrow() // missing required keys
  })

  it('throws on a malformed inline-map list item rather than silently dropping data', () => {
    const head = '---\nid: "x"\ntitle: "X"\nschemaVersion: 1\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections:\n'
    // A complete inline map followed by a stray continuation line must not be silently dropped.
    expect(() => parseCanvas(`${head}  - { from: "a", to: "b" }\n    stray: "x"\n---\n`)).toThrow()
  })

  it('canvasTitle extracts the title without a full parse, null when absent', () => {
    expect(canvasTitle(serializeCanvas(sample))).toBe('Free will vs determinism')
    expect(canvasTitle('no frontmatter')).toBeNull()
  })

  it('uniqueCanvasRef slugifies to a bare <slug>.md and avoids collisions', () => {
    expect(uniqueCanvasRef('Free Will!', [])).toBe('free-will.md')
    expect(uniqueCanvasRef('Free Will!', ['free-will.md']))
      .toBe('free-will-2.md')
    expect(uniqueCanvasRef('', [])).toBe('canvas.md')
  })
})

describe('ExcerptCard.sourceAnnotationId round-trip', () => {
  it('omits the field when absent (existing files byte-unchanged) and round-trips when present', () => {
    const base = emptyCanvas('c', 'C')
    const withCard = {
      ...base,
      cards: [
        { kind: 'excerpt', id: 'k1', source: 'd.md', anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }, snapshot: 'abc', note: '', x: 0, y: 0 }
      ] as typeof base.cards
    }
    expect(serializeCanvas(withCard)).not.toContain('sourceAnnotationId')

    const withId = {
      ...withCard,
      cards: [{ ...withCard.cards[0], sourceAnnotationId: 'ann-7' }] as typeof base.cards
    }
    const round = parseCanvas(serializeCanvas(withId))
    const c = round.cards[0]
    expect(c.kind).toBe('excerpt')
    if (c.kind === 'excerpt') expect(c.sourceAnnotationId).toBe('ann-7')
  })
})

describe('uniqueCanvasRef (central)', () => {
  it('mints a bare <slug>.md ref', () => {
    expect(uniqueCanvasRef('Free Will', [])).toBe('free-will.md')
  })
  it('de-duplicates against existing refs', () => {
    expect(uniqueCanvasRef('Free Will', ['free-will.md'])).toBe('free-will-2.md')
  })
})
