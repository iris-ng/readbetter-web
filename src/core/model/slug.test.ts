import { describe, it, expect } from 'vitest'
import { slug } from './slug'

describe('slug', () => {
  it('lowercases and hyphenates words', () => {
    expect(slug('Background Notes')).toBe('background-notes')
  })
  it('strips punctuation and collapses separators', () => {
    expect(slug('  1.2 — Scope & Goals!! ')).toBe('1-2-scope-goals')
  })
  it('falls back to "section" for empty/symbol-only input', () => {
    expect(slug('***')).toBe('section')
    expect(slug('')).toBe('section')
  })
})
