import { describe, it, expect } from 'vitest'
import { createAnchor, resolveAnchor, CONTEXT_LEN } from './anchor'

const TEXT = 'The quick brown fox jumps over the lazy dog near the river.'

describe('createAnchor', () => {
  it('captures exact text and bounded context', () => {
    const start = TEXT.indexOf('brown fox')
    const a = createAnchor(TEXT, start, start + 'brown fox'.length)
    expect(a.exact).toBe('brown fox')
    expect(TEXT.endsWith(a.suffix) || a.suffix.length === CONTEXT_LEN).toBe(true)
    expect(a.prefix.length).toBeLessThanOrEqual(CONTEXT_LEN)
    expect(a.start).toBe(start)
  })
})

describe('resolveAnchor', () => {
  it('resolves a unique quote to its range', () => {
    const start = TEXT.indexOf('lazy dog')
    const a = createAnchor(TEXT, start, start + 'lazy dog'.length)
    expect(resolveAnchor(a, TEXT)).toEqual({ start, end: start + 'lazy dog'.length })
  })

  it('survives an upstream insertion (text shifts)', () => {
    const start = TEXT.indexOf('lazy dog')
    const a = createAnchor(TEXT, start, start + 'lazy dog'.length)
    const edited = 'PREFACE. ' + TEXT
    const newStart = edited.indexOf('lazy dog')
    expect(resolveAnchor(a, edited)).toEqual({ start: newStart, end: newStart + 'lazy dog'.length })
  })

  it('disambiguates multiple matches by context', () => {
    const text = 'see note here. END. see note there.'
    const start = text.indexOf('note') // first "note"
    const a = createAnchor(text, start, start + 'note'.length)
    // second occurrence at index of "note there"
    const resolved = resolveAnchor(a, text)
    expect(resolved).toEqual({ start, end: start + 'note'.length })
  })

  it('prefers context over stored position when a new duplicate is inserted before the anchor', () => {
    const orig = 'A foo B'
    const start = orig.indexOf('foo')
    const a = createAnchor(orig, start, start + 'foo'.length)
    // Insert a new occurrence before the original, moving the true match rightward.
    const edited = 'C foo D. A foo B'
    const trueStart = edited.lastIndexOf('foo')
    expect(resolveAnchor(a, edited)).toEqual({ start: trueStart, end: trueStart + 3 })
  })

  it('orphans when the quote is gone', () => {
    const start = TEXT.indexOf('lazy dog')
    const a = createAnchor(TEXT, start, start + 'lazy dog'.length)
    expect(resolveAnchor(a, 'completely different content')).toBeNull()
  })

  it('orphans an empty-quote anchor', () => {
    expect(resolveAnchor({ start: 0, end: 0, exact: '', prefix: '', suffix: '' }, TEXT)).toBeNull()
  })
})
