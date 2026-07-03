import { describe, it, expect } from 'vitest'
import { expandToWord, nearestWord } from './wordAnchor'

describe('expandToWord', () => {
  const text = 'The quick brown fox'
  it('expands an offset inside a word to that whole word', () => {
    expect(expandToWord(text, 6)).toEqual({ start: 4, end: 9 })   // inside "quick"
    expect(expandToWord(text, 4)).toEqual({ start: 4, end: 9 })   // at word start
  })
  it('handles the first and last words', () => {
    expect(expandToWord(text, 0)).toEqual({ start: 0, end: 3 })   // "The"
    expect(expandToWord(text, 18)).toEqual({ start: 16, end: 19 }) // "fox"
  })
  it('on whitespace, returns a zero-width range at the offset (no word)', () => {
    expect(expandToWord(text, 3)).toEqual({ start: 3, end: 3 })   // the space after "The"
  })
})

describe('nearestWord', () => {
  const text = 'The quick brown fox'
  it('returns the word at the offset if not on whitespace', () => {
    expect(nearestWord(text, 6)).toEqual({ start: 4, end: 9 })   // inside "quick"
  })
  it('snaps from whitespace to the nearest word', () => {
    expect(nearestWord(text, 3)).toEqual({ start: 0, end: 3 })   // space after "The", snap to "The"
    expect(nearestWord(text, 9)).toEqual({ start: 4, end: 9 })   // space after "quick", snap to "quick"
  })
  it('on an equidistant gap, picks the PRECEDING word', () => {
    // 'a  b' has two spaces (indices 1,2). Offset 2: "a"{0,1} is 1 away, "b"{3,4} is 1 away → tie.
    // Preceding ("a") wins.
    expect(nearestWord('a  b', 2)).toEqual({ start: 0, end: 1 })
  })
  it('picks the following word when it is strictly closer', () => {
    // 'a   b' has three spaces (indices 1,2,3). Offset 3: "a"{0,1} is 2 away, "b"{4,5} is 1 away.
    expect(nearestWord('a   b', 3)).toEqual({ start: 4, end: 5 })
  })
  it('handles whitespace at the start', () => {
    expect(nearestWord(text, 0)).toEqual({ start: 0, end: 3 })   // "The"
  })
  it('handles whitespace at the end', () => {
    expect(nearestWord(text, 19)).toEqual({ start: 16, end: 19 }) // "fox"
  })
})
