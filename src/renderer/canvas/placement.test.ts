import { describe, it, expect } from 'vitest'
import { placeNewCard, type PlacementCard } from './placement'

const vp = { x: 0, y: 0, zoom: 1 }
const base = { viewport: vp, paneWidth: 1000, viewportHeight: 600 } // visible board rect 0,0 → 1000,600

describe('placeNewCard', () => {
  it('places the first card near the center of the visible area', () => {
    expect(placeNewCard({ ...base, cards: [] })).toEqual({ x: 272, y: 182 })
  })

  it('skips the center slot when it is occupied and picks the nearest free slot', () => {
    const occupied: PlacementCard[] = [{ x: 272, y: 182, w: 240, h: 150 }]
    expect(placeNewCard({ ...base, cards: occupied })).toEqual({ x: 528, y: 182 })
  })

  it('falls back to a small cascade near center when every visible slot is full', () => {
    // The 3×3 candidate grid for this viewport is px∈{16,272,528}, py∈{16,182,348}.
    const grid: PlacementCard[] = []
    for (const x of [16, 272, 528]) for (const y of [16, 182, 348]) grid.push({ x, y, w: 240, h: 150 })
    // 9 cards → cascade = (9 % 8) * 28 = 28; center origin = (380, 225).
    expect(placeNewCard({ ...base, cards: grid })).toEqual({ x: 408, y: 253 })
  })
})
