import { describe, it, expect } from 'vitest'
import { presenceReducer, windowHolding, hubWindowId } from './presence'
import type { PresenceState } from './presence'

describe('presenceReducer', () => {
  const empty: PresenceState = {}

  it('upserts a new entry on a presence message', () => {
    const msg = {
      type: 'presence' as const,
      windowId: 'win-1',
      role: 'hub' as const,
      entity: { kind: 'doc' as const, ref: 'doc-abc' },
    }
    const next = presenceReducer(empty, msg)
    expect(next['win-1']).toEqual({
      windowId: 'win-1',
      role: 'hub',
      entity: { kind: 'doc', ref: 'doc-abc' },
      entities: [{ kind: 'doc', ref: 'doc-abc' }],
    })
  })

  it('updates entity and role on a second presence from the same windowId', () => {
    const first = presenceReducer(empty, {
      type: 'presence',
      windowId: 'win-1',
      role: 'hub',
      entity: { kind: 'doc', ref: 'doc-abc' },
    })
    const second = presenceReducer(first, {
      type: 'presence',
      windowId: 'win-1',
      role: 'satellite',
      entity: { kind: 'canvas', ref: 'canvas-xyz' },
    })
    expect(second['win-1']).toEqual({
      windowId: 'win-1',
      role: 'satellite',
      entity: { kind: 'canvas', ref: 'canvas-xyz' },
      entities: [{ kind: 'canvas', ref: 'canvas-xyz' }],
    })
    // should not have extra keys
    expect(Object.keys(second)).toHaveLength(1)
  })

  it('accepts a presence message with null entity', () => {
    const next = presenceReducer(empty, {
      type: 'presence',
      windowId: 'win-2',
      role: 'satellite',
      entity: null,
    })
    expect(next['win-2']).toEqual({
      windowId: 'win-2',
      role: 'satellite',
      entity: null,
      entities: [],
    })
  })

  it('removes an entry on a bye message', () => {
    const withEntry = presenceReducer(empty, {
      type: 'presence',
      windowId: 'win-1',
      role: 'hub',
      entity: { kind: 'doc', ref: 'doc-abc' },
    })
    expect(withEntry['win-1']).toBeDefined()

    const afterBye = presenceReducer(withEntry, { type: 'bye', windowId: 'win-1' })
    expect(afterBye['win-1']).toBeUndefined()
    expect(Object.keys(afterBye)).toHaveLength(0)
  })

  it('returns the same reference for a bye of an unknown windowId', () => {
    const state: PresenceState = {}
    const next = presenceReducer(state, { type: 'bye', windowId: 'unknown-win' })
    expect(next).toBe(state)
  })

  it('returns the same reference for a non-presence/non-bye message', () => {
    const state: PresenceState = {}
    const next = presenceReducer(state, { type: 'draw-mode', active: true })
    expect(next).toBe(state)
  })

  it('does not mutate the input state', () => {
    const state: PresenceState = {}
    const frozen = Object.freeze(state)
    expect(() =>
      presenceReducer(frozen, {
        type: 'presence',
        windowId: 'win-1',
        role: 'hub',
        entity: null,
      })
    ).not.toThrow()
  })
})

describe('windowHolding', () => {
  it('returns the windowId whose entity matches the given kind+ref', () => {
    const state = presenceReducer(
      {},
      { type: 'presence', windowId: 'win-1', role: 'hub', entity: { kind: 'doc', ref: 'doc-abc' } }
    )
    expect(windowHolding(state, 'doc', 'doc-abc')).toBe('win-1')
  })

  it('returns null when no window holds the given kind+ref', () => {
    const state = presenceReducer(
      {},
      { type: 'presence', windowId: 'win-1', role: 'hub', entity: { kind: 'doc', ref: 'doc-abc' } }
    )
    expect(windowHolding(state, 'doc', 'doc-xyz')).toBeNull()
    expect(windowHolding(state, 'canvas', 'doc-abc')).toBeNull()
  })

  it('returns null for an empty state', () => {
    expect(windowHolding({}, 'doc', 'doc-abc')).toBeNull()
  })

  it('returns null when the matching window has a null entity', () => {
    const state = presenceReducer(
      {},
      { type: 'presence', windowId: 'win-1', role: 'satellite', entity: null }
    )
    expect(windowHolding(state, 'doc', 'doc-abc')).toBeNull()
  })
})

describe('hubWindowId', () => {
  it('returns the windowId whose role is hub', () => {
    let state: PresenceState = {}
    state = presenceReducer(state, {
      type: 'presence',
      windowId: 'win-hub',
      role: 'hub',
      entity: { kind: 'doc', ref: 'doc-abc' },
    })
    state = presenceReducer(state, {
      type: 'presence',
      windowId: 'win-sat',
      role: 'satellite',
      entity: { kind: 'canvas', ref: 'canvas-1' },
    })
    expect(hubWindowId(state)).toBe('win-hub')
  })

  it('returns null when there is no hub', () => {
    const state = presenceReducer(
      {},
      { type: 'presence', windowId: 'win-sat', role: 'satellite', entity: null }
    )
    expect(hubWindowId(state)).toBeNull()
  })

  it('returns null for empty state', () => {
    expect(hubWindowId({})).toBeNull()
  })
})

describe('presenceReducer — multi-entity (Plan 3b)', () => {
  const empty: PresenceState = {}

  it('stores the full entities array and mirrors the focused entity', () => {
    const next = presenceReducer(empty, {
      type: 'presence',
      windowId: 'win-multi',
      role: 'hub',
      entity: { kind: 'doc', ref: 'p1.md' },
      entities: [
        { kind: 'doc', ref: 'p1.md' },
        { kind: 'doc', ref: 'p2.md' },
      ],
    })
    expect(next['win-multi'].entities).toEqual([
      { kind: 'doc', ref: 'p1.md' },
      { kind: 'doc', ref: 'p2.md' },
    ])
    // back-compat mirror = the focused (first) entity
    expect(next['win-multi'].entity).toEqual({ kind: 'doc', ref: 'p1.md' })
  })

  it('derives entities from a legacy single-entity presence (no entities field)', () => {
    const next = presenceReducer(empty, {
      type: 'presence',
      windowId: 'win-legacy',
      role: 'satellite',
      entity: { kind: 'doc', ref: 'only.md' },
    })
    expect(next['win-legacy'].entities).toEqual([{ kind: 'doc', ref: 'only.md' }])
  })

  it('yields an empty entities array when entity is null and none are given', () => {
    const next = presenceReducer(empty, {
      type: 'presence',
      windowId: 'win-empty',
      role: 'satellite',
      entity: null,
    })
    expect(next['win-empty'].entities).toEqual([])
    expect(next['win-empty'].entity).toBeNull()
  })
})

describe('windowHolding — multi-entity (Plan 3b)', () => {
  it('resolves ANY entity in the array, not just the first/focused', () => {
    const state = presenceReducer(
      {},
      {
        type: 'presence',
        windowId: 'win-A',
        role: 'hub',
        entity: { kind: 'doc', ref: 'a1.md' },
        entities: [
          { kind: 'doc', ref: 'a1.md' },
          { kind: 'doc', ref: 'a2.md' },
        ],
      }
    )
    // the focused pane AND the second pane both resolve to win-A
    expect(windowHolding(state, 'doc', 'a1.md')).toBe('win-A')
    expect(windowHolding(state, 'doc', 'a2.md')).toBe('win-A')
    // an unheld ref still resolves to null
    expect(windowHolding(state, 'doc', 'a3.md')).toBeNull()
  })

  it('resolves a ref held in a second window when several windows are present', () => {
    let state = presenceReducer(
      {},
      {
        type: 'presence',
        windowId: 'win-A',
        role: 'hub',
        entity: { kind: 'doc', ref: 'a1.md' },
        entities: [{ kind: 'doc', ref: 'a1.md' }],
      }
    )
    state = presenceReducer(state, {
      type: 'presence',
      windowId: 'win-B',
      role: 'satellite',
      entity: { kind: 'doc', ref: 'b1.md' },
      entities: [
        { kind: 'doc', ref: 'b1.md' },
        { kind: 'canvas', ref: 'b2.canvas' },
      ],
    })
    expect(windowHolding(state, 'canvas', 'b2.canvas')).toBe('win-B')
    expect(windowHolding(state, 'doc', 'a1.md')).toBe('win-A')
  })
})
