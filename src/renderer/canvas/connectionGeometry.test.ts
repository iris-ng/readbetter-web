import { describe, it, expect } from 'vitest'
import { sideMidpoint, nearestSidePoints, connectionCurve, type Box } from './connectionGeometry'

const a: Box = { x: 0, y: 0, w: 100, h: 100 }

describe('connectionGeometry', () => {
  it('sideMidpoint returns the center of each side', () => {
    expect(sideMidpoint(a, 'top')).toEqual({ x: 50, y: 0 })
    expect(sideMidpoint(a, 'right')).toEqual({ x: 100, y: 50 })
    expect(sideMidpoint(a, 'bottom')).toEqual({ x: 50, y: 100 })
    expect(sideMidpoint(a, 'left')).toEqual({ x: 0, y: 50 })
  })

  it('nearestSidePoints picks facing sides — right(a)/left(b) when side by side', () => {
    const b: Box = { x: 300, y: 0, w: 100, h: 100 }
    expect(nearestSidePoints(a, b)).toEqual({ from: { x: 100, y: 50 }, to: { x: 300, y: 50 } })
  })

  it('nearestSidePoints picks bottom(a)/top(b) when stacked', () => {
    const b: Box = { x: 0, y: 300, w: 100, h: 100 }
    expect(nearestSidePoints(a, b)).toEqual({ from: { x: 50, y: 100 }, to: { x: 50, y: 300 } })
  })

  it('connectionCurve returns a quadratic path from a to b and a midpoint between them', () => {
    const { path, mid } = connectionCurve({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(path.startsWith('M 0 0 Q ')).toBe(true)
    expect(path.endsWith(' 100 0')).toBe(true)
    expect(mid.x).toBeCloseTo(50)
    expect(mid.y).toBeCloseTo(10) // pinned: the curve bows perpendicular (len 100 → bow 20 → mid.y 0.5*bow)
  })

  it('nearestSidePoints is safe for identical/overlapping boxes (no NaN)', () => {
    const { from, to } = nearestSidePoints(a, { ...a })
    expect(Number.isFinite(from.x) && Number.isFinite(from.y)).toBe(true)
    expect(Number.isFinite(to.x) && Number.isFinite(to.y)).toBe(true)
  })

  it('connectionCurve is safe when a === b (zero-length, no NaN)', () => {
    const { path, mid } = connectionCurve({ x: 50, y: 50 }, { x: 50, y: 50 })
    expect(path).not.toMatch(/NaN/)
    expect(Number.isFinite(mid.x) && Number.isFinite(mid.y)).toBe(true)
  })
})
