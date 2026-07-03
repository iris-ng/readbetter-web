import { describe, it, expect } from 'vitest'
import { hashBytes } from './content-hash'

describe('hashBytes', () => {
  it('returns the known SHA-256 of "abc"', () => {
    expect(hashBytes(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('returns the known SHA-256 of the empty input', () => {
    expect(hashBytes(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('accepts a Uint8Array', () => {
    expect(hashBytes(new Uint8Array([97, 98, 99]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})
