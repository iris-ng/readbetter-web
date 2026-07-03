import type { JSX } from 'react'
import { type Box, type Point, nearestSidePoints, connectionCurve } from '../canvas/connectionGeometry'
import type { Connection } from '../../core/canvas/canvas'

export interface ConnView {
  connection: Connection
  path: string
  mid: Point
}

/** Compute the curve geometry for every connection whose endpoints are both measured. */
export function connectionViews(connections: Connection[], boxes: Map<string, Box>): ConnView[] {
  const out: ConnView[] = []
  for (const cn of connections) {
    const a = boxes.get(cn.from)
    const b = boxes.get(cn.to)
    if (!a || !b) continue
    const { from, to } = nearestSidePoints(a, b)
    const { path, mid } = connectionCurve(from, to)
    out.push({ connection: cn, path, mid })
  }
  return out
}

export function ConnectionsLayer({ views, rubber }: { views: ConnView[]; rubber: { path: string } | null }): JSX.Element {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
    >
      {views.map((v) => (
        <path
          key={`${v.connection.from}-${v.connection.to}`}
          data-testid={`connection-${v.connection.from}-${v.connection.to}`}
          d={v.path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
      ))}
      {rubber && (
        <path data-testid="connection-rubber" d={rubber.path} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.5} />
      )}
    </svg>
  )
}
