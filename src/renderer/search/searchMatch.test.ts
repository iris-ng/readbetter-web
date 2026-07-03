import { describe, it, expect } from 'vitest'
import { findMatches } from './searchMatch'

describe('findMatches', () => {
  it('finds all non-overlapping occurrences, case-insensitively', () => {
    expect(findMatches('The theme of the Theme.', 'the')).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },   // "the" inside "theme"
      { start: 13, end: 16 },
      { start: 17, end: 20 }  // "The" inside "Theme"
    ])
  })

  it('does not return overlapping matches', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 }
    ])
  })

  it('returns [] for empty or whitespace-only query', () => {
    expect(findMatches('hello', '')).toEqual([])
    expect(findMatches('hello', '   ')).toEqual([])
  })

  it('returns [] when nothing matches', () => {
    expect(findMatches('hello', 'zzz')).toEqual([])
  })
})
