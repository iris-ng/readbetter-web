import { describe, it, expect } from 'vitest'
import { hashContent } from './hash'

describe('hashContent', () => {
  it('is deterministic for the same input', () => {
    expect(hashContent('hello world')).toBe(hashContent('hello world'))
  })

  it('differs for different input', () => {
    expect(hashContent('hello world')).not.toBe(hashContent('hello worlds'))
  })

  it('returns a non-empty hex string', () => {
    expect(hashContent('abc')).toMatch(/^[0-9a-f]+$/)
  })

  it('handles the empty string', () => {
    expect(hashContent('')).toMatch(/^[0-9a-f]+$/)
  })
})
