import { describe, it, expect } from 'vitest'
import { planLinkNav } from './linkNav'

const H = (idx: number) => ({ idx, tabId: `t${idx}` })

describe('planLinkNav', () => {
  it('no holders → empty plan', () => {
    expect(planLinkNav([], 'both', 3)).toEqual({ jump: [] })
  })

  it('two holders, both → jump both ends', () => {
    expect(planLinkNav([H(1), H(2)], 'both', 3)).toEqual({ jump: [1, 2] })
  })

  it('two holders, from → jump the lower-index (left) end only', () => {
    expect(planLinkNav([H(1), H(2)], 'from', 3)).toEqual({ jump: [1] })
  })

  it('two holders, to → jump the higher-index (right) end only', () => {
    expect(planLinkNav([H(1), H(2)], 'to', 3)).toEqual({ jump: [2] })
  })

  it('lone left dot (idx 0), to → follow beside on the right (room available)', () => {
    expect(planLinkNav([H(0)], 'to', 3)).toEqual({ jump: [], follow: { holderIdx: 0, at: 1 } })
  })

  it('lone left dot (idx 0), from → jump the local end only', () => {
    expect(planLinkNav([H(0)], 'from', 3)).toEqual({ jump: [0] })
  })

  it('lone right dot (idx 1 of 2), from → follow the absent left partner', () => {
    // holder is the "to" end; the absent partner is the "from" end → follow
    expect(planLinkNav([H(1)], 'from', 3)).toEqual({ jump: [], follow: { holderIdx: 1, at: 2 } })
  })

  it('lone right dot at capacity (idx 2, maxShown 3) → open to the LEFT of the holder', () => {
    // no room to the right (2+1 == maxShown) → at = holderIdx
    expect(planLinkNav([H(2)], 'from', 3)).toEqual({ jump: [], follow: { holderIdx: 2, at: 2 } })
  })

  it('lone dot, both → jump the local end AND follow the partner', () => {
    expect(planLinkNav([H(0)], 'both', 3)).toEqual({ jump: [0], follow: { holderIdx: 0, at: 1 } })
  })
})
