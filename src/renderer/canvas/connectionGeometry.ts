export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export type Side = 'top' | 'right' | 'bottom' | 'left'
export interface Point {
  x: number
  y: number
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

export function sideMidpoint(b: Box, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: b.x + b.w / 2, y: b.y }
    case 'right':
      return { x: b.x + b.w, y: b.y + b.h / 2 }
    case 'bottom':
      return { x: b.x + b.w / 2, y: b.y + b.h }
    case 'left':
      return { x: b.x, y: b.y + b.h / 2 }
  }
}

/** The mutually-nearest pair of side-midpoints between two boxes. */
export function nearestSidePoints(a: Box, b: Box): { from: Point; to: Point } {
  let best = { d: Infinity, from: sideMidpoint(a, 'top'), to: sideMidpoint(b, 'top') }
  for (const sa of SIDES) {
    const pa = sideMidpoint(a, sa)
    for (const sb of SIDES) {
      const pb = sideMidpoint(b, sb)
      const d = (pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2
      if (d < best.d) best = { d, from: pa, to: pb }
    }
  }
  return { from: best.from, to: best.to }
}

/** A gentle quadratic bezier from a to b (perpendicular bow capped at 40), plus its t=0.5 point. */
export function connectionCurve(a: Point, b: Point): { path: string; mid: Point } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const bow = Math.min(40, len * 0.2)
  const cx = (a.x + b.x) / 2 + (-dy / len) * bow
  const cy = (a.y + b.y) / 2 + (dx / len) * bow
  const path = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
  const mid = { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y }
  return { path, mid }
}
