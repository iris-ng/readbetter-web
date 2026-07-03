import { describe, it, expect } from 'vitest'
import { getAdapter } from './index'
import { HttpAdapter } from './HttpAdapter'

describe('getAdapter', () => {
  it('returns the HTTP adapter', () => {
    expect(getAdapter()).toBeInstanceOf(HttpAdapter)
  })
})
