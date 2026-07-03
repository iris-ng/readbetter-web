import type { CrossWindowMessage } from './bus'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresenceEntry {
  windowId: string
  role: 'hub' | 'satellite'
  /** The FOCUSED pane's entity, kept as a back-compat mirror (= entities[0] ?? null).
   *  App.tsx's otherDocWindowOpen still reads this; keep until that consumer migrates. */
  entity: { kind: 'doc' | 'canvas'; ref: string } | null
  /** ALL shown doc/canvas panes of this window (length 0..maxShown). windowHolding scans this. */
  entities: { kind: 'doc' | 'canvas'; ref: string }[]
}

export type PresenceState = Record<string /* windowId */, PresenceEntry>

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer: handles 'presence' (upsert by windowId) and 'bye' (delete by
 * windowId). All other message types are ignored and the same state reference
 * is returned, enabling React consumers to bail on `===`.
 */
export function presenceReducer(
  state: PresenceState,
  msg: CrossWindowMessage
): PresenceState {
  if (msg.type === 'presence') {
    const entities = msg.entities ?? (msg.entity ? [msg.entity] : [])
    const entity = msg.entity ?? entities[0] ?? null
    const next: PresenceEntry = {
      windowId: msg.windowId,
      role: msg.role,
      entity,
      entities,
    }
    return { ...state, [msg.windowId]: next }
  }

  if (msg.type === 'bye') {
    if (!(msg.windowId in state)) {
      // No change — return identical reference for === bail-out
      return state
    }
    const { [msg.windowId]: _removed, ...rest } = state
    return rest
  }

  // All other message types: no change
  return state
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns the windowId of the window whose entity matches {kind, ref},
 * or null if no window holds that entity.
 */
export function windowHolding(
  state: PresenceState,
  kind: 'doc' | 'canvas',
  ref: string
): string | null {
  for (const entry of Object.values(state)) {
    for (const e of entry.entities) {
      if (e.kind === kind && e.ref === ref) {
        return entry.windowId
      }
    }
  }
  return null
}

/**
 * Returns the windowId of the window whose role is 'hub', or null if none.
 */
export function hubWindowId(state: PresenceState): string | null {
  for (const entry of Object.values(state)) {
    if (entry.role === 'hub') {
      return entry.windowId
    }
  }
  return null
}
