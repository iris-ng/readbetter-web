import { describe, it, expect } from 'vitest'
import { makeLinkPair, removeLink, isValidLink } from './link'

const anchor = { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }
const anchorB = { start: 5, end: 8, exact: 'def', prefix: '', suffix: '' }

describe('makeLinkPair', () => {
  it('creates two mirrored halves sharing one id, each holding its own anchor', () => {
    const { id, a, b } = makeLinkPair('documents/a.md', anchor, 'documents/b.md', anchorB)
    expect(a).toEqual({ id, anchor, otherDocRef: 'documents/b.md' })
    expect(b).toEqual({ id, anchor: anchorB, otherDocRef: 'documents/a.md' })
  })
})

describe('removeLink', () => {
  it('removes the link with the given id', () => {
    const links = [{ id: 'x', anchor, otherDocRef: 'd' }, { id: 'y', anchor, otherDocRef: 'd' }]
    expect(removeLink(links, 'x')).toEqual([{ id: 'y', anchor, otherDocRef: 'd' }])
  })
})

describe('isValidLink', () => {
  it('accepts a flat link and rejects malformed ones', () => {
    expect(isValidLink({ id: 'i', anchor, otherDocRef: 'd' })).toBe(true)
    expect(isValidLink({ id: 'i', otherDocRef: 'd' })).toBe(false)
    expect(isValidLink({ id: 'i', anchor: { start: 0 }, otherDocRef: 'd' })).toBe(false)
    expect(isValidLink({ anchor, otherDocRef: 'd' })).toBe(false)
    expect(isValidLink(null)).toBe(false)
  })
})
