import { describe, it, expect } from 'vitest'
import { importMarkdown } from '../import/markdown'
import { MAX_PINS, planCompare, positionFractions, defaultViewName, PinSegment } from './squeeze'

// Two-section doc. text = 'A\nalpha beta\n\nB\ngamma delta'
const doc = importMarkdown('# A\nalpha beta\n\n# B\ngamma delta', 'd.md')
const text = doc.text
const [secA, secB] = doc.sections

/** Build a pinned range from a substring of the doc text. */
function rangeOf(sub: string, sectionId: string) {
  const start = text.indexOf(sub)
  if (start < 0) throw new Error(`substring not found: ${sub}`)
  return { start, end: start + sub.length, sectionId }
}

function kinds(segs: PinSegment[]): string[] {
  return segs.map((s) => s.kind)
}

describe('MAX_PINS', () => {
  it('is 3', () => expect(MAX_PINS).toBe(3))
})

describe('planCompare', () => {
  it('returns one gap spanning the whole doc when nothing is pinned', () => {
    const segs = planCompare(text, doc.sections, [])
    expect(segs).toHaveLength(1)
    expect(segs[0]).toEqual({
      kind: 'gap',
      ranges: [{ start: 0, end: text.length, sectionId: secA.id }]
    })
  })

  it('returns an empty plan for an empty document', () => {
    expect(planCompare('', [], [])).toEqual([])
  })

  it('wraps a single mid-document pin in gap·pin·gap', () => {
    const pin = rangeOf('alpha beta', secA.id)
    const segs = planCompare(text, doc.sections, [pin])
    expect(kinds(segs)).toEqual(['gap', 'pin', 'gap'])
    const p = segs[1]
    if (p.kind !== 'pin') throw new Error('expected pin')
    expect(p.passage.text).toBe('alpha beta')
    expect(p.passage.range).toEqual({ start: pin.start, end: pin.end })
    expect(p.passage.sectionId).toBe(secA.id)
  })

  it('omits the leading gap when a pin is at the very document start', () => {
    const pin = rangeOf('A\nalpha', secA.id)
    expect(pin.start).toBe(0)
    const segs = planCompare(text, doc.sections, [pin])
    expect(kinds(segs)).toEqual(['pin', 'gap'])
  })

  it('omits the trailing gap when a pin is at the very document end', () => {
    const pin = rangeOf('gamma delta', secB.id)
    expect(pin.end).toBe(text.length)
    const segs = planCompare(text, doc.sections, [pin])
    expect(kinds(segs)).toEqual(['gap', 'pin'])
  })

  it('two pins in the SAME section give gap·pin·gap·pin·gap with the between-text gap', () => {
    const pinAlpha = rangeOf('alpha', secA.id)
    const pinBeta = rangeOf('beta', secA.id)
    const segs = planCompare(text, doc.sections, [pinAlpha, pinBeta])
    expect(kinds(segs)).toEqual(['gap', 'pin', 'gap', 'pin', 'gap'])
    // The middle gap is the unpinned ' ' between 'alpha' and 'beta'.
    const mid = segs[2]
    if (mid.kind !== 'gap') throw new Error('expected gap')
    expect(text.slice(mid.ranges[0].start, mid.ranges[0].end)).toBe(' ')
  })

  it('two pins in different sections fold the inter-section text into one gap', () => {
    const pinA = rangeOf('alpha beta', secA.id)
    const pinB = rangeOf('gamma delta', secB.id)
    const segs = planCompare(text, doc.sections, [pinA, pinB])
    expect(kinds(segs)).toEqual(['gap', 'pin', 'gap', 'pin'])
    const mid = segs[2]
    if (mid.kind !== 'gap') throw new Error('expected gap')
    // The between gap spans the rest of A + separator + 'B\n' heading line.
    expect(mid.ranges[0].start).toBe(pinA.end)
    expect(mid.ranges[0].end).toBe(pinB.start)
  })

  it('produces no empty gap between adjacent pins', () => {
    // 'beta' immediately follows the space; make two pins that touch end-to-start.
    const alphaStart = text.indexOf('alpha')
    const pin1 = { start: alphaStart, end: alphaStart + 'alpha '.length, sectionId: secA.id }
    const pin2 = { start: alphaStart + 'alpha '.length, end: alphaStart + 'alpha beta'.length, sectionId: secA.id }
    const segs = planCompare(text, doc.sections, [pin1, pin2])
    expect(kinds(segs)).toEqual(['gap', 'pin', 'pin', 'gap'])
  })

  it('accepts a zero-length input range, emitting an empty-text pin (by design)', () => {
    // Callers should pass real passages, but a degenerate start===end range must not crash or
    // emit a negative gap; it surfaces as a zero-length pin with '' text.
    const at = text.indexOf('alpha')
    const segs = planCompare(text, doc.sections, [{ start: at, end: at, sectionId: secA.id }])
    const pin = segs.find((s) => s.kind === 'pin')
    if (!pin || pin.kind !== 'pin') throw new Error('expected a pin segment')
    expect(pin.passage.text).toBe('')
    expect(pin.passage.range).toEqual({ start: at, end: at })
    for (const s of segs) {
      if (s.kind === 'gap') for (const r of s.ranges) expect(r.end).toBeGreaterThan(r.start)
    }
  })

  it('is independent of pinnedRanges order', () => {
    const pinA = rangeOf('alpha', secA.id)
    const pinB = rangeOf('gamma', secB.id)
    const a = planCompare(text, doc.sections, [pinB, pinA])
    const b = planCompare(text, doc.sections, [pinA, pinB])
    expect(a).toEqual(b)
  })

  it('clamps overlapping pins so no negative-length gap is emitted', () => {
    const pinWide = rangeOf('alpha beta', secA.id)
    const pinInner = rangeOf('beta', secA.id) // fully inside pinWide
    const segs = planCompare(text, doc.sections, [pinWide, pinInner])
    // Every gap must be strictly positive length.
    for (const s of segs) {
      if (s.kind === 'gap') {
        for (const r of s.ranges) expect(r.end).toBeGreaterThan(r.start)
      }
    }
    // The inner pin is swallowed -> collapses to a zero-length pin at the cursor.
    const inner = segs.find((s) => s.kind === 'pin' && s.passage.range.start === s.passage.range.end)
    expect(inner).toBeDefined()
  })
})

describe('positionFractions', () => {
  it('places pin starts and the current marker as fractions of the doc char length', () => {
    const pinA = rangeOf('alpha', secA.id)
    const pinB = rangeOf('gamma', secB.id)
    const { pins, current } = positionFractions(text, doc.sections, [pinB, pinA], 1)
    expect(pins).toEqual([pinA.start / text.length, pinB.start / text.length])
    // pins sorted ascending
    expect(pins[0]).toBeLessThanOrEqual(pins[1])
    expect(current).toBeCloseTo(secB.charStart / text.length)
  })

  it('returns 0/0 for a single-char document (length-1 guard, no divide-by-zero)', () => {
    expect(positionFractions('x', [{ id: 's', level: 1, heading: 'x', order: 0, charStart: 0, charEnd: 1, paragraphs: [] }], [{ start: 0, end: 1 }], 0)).toEqual({ pins: [0], current: 0 })
  })

  it('clamps a too-large activeIndex to the last section', () => {
    const { current } = positionFractions(text, doc.sections, [], 99)
    expect(current).toBeCloseTo(secB.charStart / text.length)
  })

  it('clamps a negative activeIndex to the first section', () => {
    const { current } = positionFractions(text, doc.sections, [], -5)
    expect(current).toBe(0)
  })
})

describe('defaultViewName', () => {
  it('joins the pinned passage texts with the arrow separator', () => {
    const pinA = rangeOf('alpha beta', secA.id)
    const pinB = rangeOf('gamma delta', secB.id)
    expect(defaultViewName(text, doc.sections, [pinA, pinB])).toBe('alpha beta ⇄ gamma delta')
  })

  it('truncates long passage text to ~30 chars', () => {
    const long = importMarkdown('# H\n' + 'x'.repeat(60), 'd.md')
    const body = 'x'.repeat(60)
    const start = long.text.indexOf(body)
    const name = defaultViewName(long.text, long.sections, [{ start, end: start + 60, sectionId: long.sections[0].id }])
    expect(name).toBe('x'.repeat(30))
  })

  it('falls back to the section heading when the passage text is empty', () => {
    // A zero-length range -> empty text -> use heading.
    const r = { start: secB.charStart, end: secB.charStart, sectionId: secB.id }
    expect(defaultViewName(text, doc.sections, [r])).toBe('B')
  })

  it('falls back to Introduction for an empty heading (preamble)', () => {
    const pre = importMarkdown('Intro text.\n\n# Head\nx.', 'd.md')
    const preId = pre.sections[0].id
    const r = { start: pre.sections[0].charStart, end: pre.sections[0].charStart, sectionId: preId }
    expect(defaultViewName(pre.text, pre.sections, [r])).toBe('Introduction')
  })

  it('returns a placeholder name when there are no pins', () => {
    expect(defaultViewName(text, doc.sections, [])).toBe('Untitled view')
  })
})
