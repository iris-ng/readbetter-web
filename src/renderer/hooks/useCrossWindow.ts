import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createBus,
  WINDOW_ID,
  type CrossWindowBus,
  type CrossWindowMessage,
} from '../crossWindow/bus'
import {
  presenceReducer,
  windowHolding as windowHoldingQuery,
  hubWindowId as hubWindowIdQuery,
  type PresenceState,
} from '../crossWindow/presence'

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UseCrossWindow {
  post: CrossWindowBus['post']
  presence: PresenceState
  windowHolding(kind: 'doc' | 'canvas', ref: string): string | null
  hubWindowId(): string | null
  /** Register a stable app-level message handler (latest-ref pattern). */
  onMessage(handler: (msg: CrossWindowMessage) => void): void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Wire the cross-window bus into React.
 *
 * @param self - This window's role and entity (the entity it is currently displaying).
 * @param busFactory - Optional factory injected in tests. Defaults to `createBus()`.
 * @param windowId - Optional window identity override for tests (avoids crypto.randomUUID()
 *   collisions when two hooks run in the same jsdom process). Defaults to `WINDOW_ID`.
 */
export function useCrossWindow(
  self: {
    role: 'hub' | 'satellite'
    entity: { kind: 'doc' | 'canvas'; ref: string } | null      // KEEP — focused pane (back-compat)
    entities?: { kind: 'doc' | 'canvas'; ref: string }[]        // NEW (C5) — ALL shown doc/canvas panes
  },
  busFactory?: () => CrossWindowBus,
  windowId: string = WINDOW_ID
): UseCrossWindow {
  const [presence, setPresence] = useState<PresenceState>({})

  // Latest-ref for the app-level handler so we only subscribe once.
  const appHandlerRef = useRef<((msg: CrossWindowMessage) => void) | null>(null)

  // Stable bus ref — created once on mount.
  const busRef = useRef<CrossWindowBus | null>(null)

  // Latest-ref for self so the subscribe closure (captured at mount) can read
  // the current role/entity when replying to a newly-joined peer.
  const selfRef = useRef(self)
  selfRef.current = self

  // Track known peers so we reply exactly once per newly-seen window (no loop).
  const knownPeersRef = useRef<Set<string>>(new Set())

  // -------------------------------------------------------------------------
  // Mount: create bus, subscribe, post initial presence
  // -------------------------------------------------------------------------
  useEffect(() => {
    // Name this browsing context after its windowId so peers can raise it to the front via
    // window.open('', windowId) from within their own click gesture (a background window is not
    // allowed to focus itself). Presence carries the same windowId, so the raiser needs no lookup.
    try { window.name = windowId } catch { /* non-browser env — naming is best-effort */ }

    const bus = busFactory ? busFactory() : createBus()
    busRef.current = bus

    // Subscribe once.  Messages both update presence state (pure updater) AND
    // are forwarded to the app handler via the latest-ref.
    const unsub = bus.subscribe((msg) => {
      setPresence((prev) => presenceReducer(prev, msg))
      // Forward to app handler (latest-ref — no stale closure issue).
      appHandlerRef.current?.(msg)
      // Mutual presence discovery: when a new peer announces itself, reply once
      // with our own current presence so the newcomer learns about this window.
      // Gated on genuinely-new peers to prevent reply loops.
      if (msg.type === 'presence' && msg.windowId !== windowId && !knownPeersRef.current.has(msg.windowId)) {
        knownPeersRef.current.add(msg.windowId)
        bus.post({
          type: 'presence',
          windowId,
          role: selfRef.current.role,
          entity: selfRef.current.entity,
          entities: selfRef.current.entities ?? (selfRef.current.entity ? [selfRef.current.entity] : []),
        })
      } else if (msg.type === 'bye') {
        knownPeersRef.current.delete(msg.windowId)
      }
    })

    // Post our own presence so every other window knows we exist.
    bus.post({
      type: 'presence',
      windowId,
      role: self.role,
      entity: self.entity,
      entities: self.entities ?? (self.entity ? [self.entity] : []),
    })

    // Cleanup on both unmount and pagehide.
    const cleanup = () => {
      bus.post({ type: 'bye', windowId })
      unsub()
      bus.close()
      busRef.current = null
      window.removeEventListener('pagehide', cleanup)
    }

    window.addEventListener('pagehide', cleanup)

    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  // -------------------------------------------------------------------------
  // Re-post presence whenever `self` changes (role or entity changed)
  // -------------------------------------------------------------------------

  // Stable primitive key over the shown pane set, so a new inline `entities` array with the
  // same logical values does NOT re-fire the re-post effect (mirrors the entity-primitive guard
  // that prevents the presence storm).
  const selfEntities = self.entities ?? (self.entity ? [self.entity] : [])
  const selfEntitiesKey = selfEntities.map((e) => `${e.kind}:${e.ref}`).join('|')

  useEffect(() => {
    const bus = busRef.current
    if (!bus) return
    bus.post({
      type: 'presence',
      windowId,
      role: self.role,
      entity: self.entity,
      entities: selfEntities,
    })
  // Depend on primitives + the pane-set key, not the entity object / entities array, to avoid
  // a presence-storm from callers that pass new inline literals each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self.role, self.entity?.kind ?? null, self.entity?.ref ?? null, selfEntitiesKey, windowId])

  // -------------------------------------------------------------------------
  // Stable callbacks
  // -------------------------------------------------------------------------

  const post = useCallback<CrossWindowBus['post']>((msg) => {
    busRef.current?.post(msg)
  }, [])

  const onMessage = useCallback((handler: (msg: CrossWindowMessage) => void) => {
    appHandlerRef.current = handler
  }, [])

  const windowHolding = useCallback(
    (kind: 'doc' | 'canvas', ref: string): string | null =>
      windowHoldingQuery(presence, kind, ref),
    [presence]
  )

  const hubWindowId = useCallback(
    (): string | null => hubWindowIdQuery(presence),
    [presence]
  )

  return {
    post,
    presence,
    windowHolding,
    hubWindowId,
    onMessage,
  }
}
