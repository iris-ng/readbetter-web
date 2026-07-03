import { describe, it, expect } from 'vitest'
import { summarizeStructure } from './structure'
import type { Section } from './document'

function sec(charStart: number, charEnd: number, order: number): Section {
  return { id: `${order}-x`, level: 1, heading: 'X', order, charStart, charEnd, paragraphs: [] }
}

describe('summarizeStructure', () => {
  it('returns empty proportions and zero count for no sections', () => {
    expect(summarizeStructure([])).toEqual({ sectionCount: 0, proportions: [] })
  })

  it('normalizes per-section lengths to proportions summing to ~1', () => {
    const s = summarizeStructure([sec(0, 10, 0), sec(10, 40, 1)]) // lengths 10, 30
    expect(s.sectionCount).toBe(2)
    expect(s.proportions.length).toBe(2)
    expect(s.proportions[0]).toBeCloseTo(0.25, 5)
    expect(s.proportions[1]).toBeCloseTo(0.75, 5)
  })

  it('buckets into at most maxBars bars, preserving total', () => {
    const sections = Array.from({ length: 50 }, (_, i) => sec(i * 10, i * 10 + 10, i))
    const s = summarizeStructure(sections, 8)
    expect(s.sectionCount).toBe(50)
    expect(s.proportions.length).toBe(8)
    expect(s.proportions.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
  })
})
