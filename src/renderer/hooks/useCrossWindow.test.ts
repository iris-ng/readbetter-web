import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createBus } from '../crossWindow/bus'
import { createInMemoryChannelHub } from '../crossWindow/testChannel'
import { useCrossWindow } from './useCrossWindow'

// ---------------------------------------------------------------------------
// useCrossWindow tests
//
// Two hooks share one in-memory channel hub to simulate two browser windows
// communicating via BroadcastChannel.  Each hook is given a distinct windowId
// so we can tell them apart in the presence state (avoids crypto.randomUUID()
// collision in a single jsdom process).
// ---------------------------------------------------------------------------

describe('useCrossWindow', () => {
  // -------------------------------------------------------------------------
  // Core presence propagation
  // -------------------------------------------------------------------------

  it('hub receives satellite presence on mount', async () => {
    const channelHub = createInMemoryChannelHub()

    const hubWinId = 'window-hub-1'
    const satWinId = 'window-sat-1'

    // Mount hub FIRST — its presence message arrives before the satellite's bus exists,
    // so the hub sees itself only.  When the satellite mounts second, it posts its
    // presence, which IS received by the hub's already-running bus.
    const { result: hubResult } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: null },
        () => createBus(channelHub),
        hubWinId
      )
    )

    renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: { kind: 'doc', ref: 'a.md' } },
        () => createBus(channelHub),
        satWinId
      )
    )

    // Wait one tick for React state updates to flush.
    await act(async () => {})

    // Hub's presence should include the satellite's entry.
    expect(hubResult.current.presence[satWinId]).toBeDefined()
    expect(hubResult.current.presence[satWinId].role).toBe('satellite')
    expect(hubResult.current.presence[satWinId].entity).toEqual({ kind: 'doc', ref: 'a.md' })

    // windowHolding delegates to the current presence snapshot.
    expect(hubResult.current.windowHolding('doc', 'a.md')).toBe(satWinId)
  })

  it('names its browsing context after windowId so peers can raise it by name', async () => {
    const channelHub = createInMemoryChannelHub()
    renderHook(() =>
      useCrossWindow({ role: 'hub', entity: null }, () => createBus(channelHub), 'window-name-1')
    )
    await act(async () => {})
    // window.open('', windowId) from a peer targets this context by name and brings it forward.
    expect(window.name).toBe('window-name-1')
  })

  it('satellite sees hub presence when satellite mounts first', async () => {
    const channelHub = createInMemoryChannelHub()

    const hubWinId = 'window-hub-1b'
    const satWinId = 'window-sat-1b'

    // Satellite mounts first.  When hub mounts second, the hub's presence message
    // is delivered to the satellite's already-running bus.
    const { result: satResult } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: { kind: 'doc', ref: 'a.md' } },
        () => createBus(channelHub),
        satWinId
      )
    )

    renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: null },
        () => createBus(channelHub),
        hubWinId
      )
    )

    await act(async () => {})

    expect(satResult.current.presence[hubWinId]).toBeDefined()
    expect(satResult.current.presence[hubWinId].role).toBe('hub')
  })

  // -------------------------------------------------------------------------
  // windowHolding / hubWindowId queries
  // -------------------------------------------------------------------------

  it('hubWindowId() returns the hub window id as seen by the satellite', async () => {
    const channelHub = createInMemoryChannelHub()

    const hubWinId = 'window-hub-2'
    const satWinId = 'window-sat-2'

    // Satellite mounts first so it receives the hub's later presence message.
    const { result: satResult } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: { kind: 'doc', ref: 'b.md' } },
        () => createBus(channelHub),
        satWinId
      )
    )

    renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: null },
        () => createBus(channelHub),
        hubWinId
      )
    )

    await act(async () => {})

    expect(satResult.current.hubWindowId()).toBe(hubWinId)
  })

  it('windowHolding returns null when no window holds the entity', async () => {
    const channelHub = createInMemoryChannelHub()

    const { result: hubResult } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: null },
        () => createBus(channelHub),
        'window-hub-2b'
      )
    )

    await act(async () => {})

    expect(hubResult.current.windowHolding('doc', 'nobody.md')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Mutual presence discovery — late-joining satellite discovers earlier hub
  // -------------------------------------------------------------------------

  it('late-joining satellite discovers hub that was already mounted (mutual presence reply)', async () => {
    const channelHub = createInMemoryChannelHub()

    const hubWinId = 'window-hub-late'
    const satWinId = 'window-sat-late'

    // Mount hub FIRST — posts its own presence before the satellite's bus exists,
    // so the satellite would miss it without the mutual-presence-reply fix.
    const { result: hubResult } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: { kind: 'doc', ref: 'a.md' } },
        () => createBus(channelHub),
        hubWinId
      )
    )

    // Mount satellite SECOND — posts its presence, which the hub receives.
    // With the fix the hub replies with its own presence so the satellite learns
    // about the hub too.
    const { result: satResult } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: { kind: 'doc', ref: 'b.md' } },
        () => createBus(channelHub),
        satWinId
      )
    )

    // Flush React state updates and the reply round-trip.
    await act(async () => {})

    // Satellite must know the hub — this was the failing direction before the fix.
    expect(satResult.current.presence[hubWinId]).toBeDefined()
    expect(satResult.current.presence[hubWinId].role).toBe('hub')
    expect(satResult.current.windowHolding('doc', 'a.md')).toBe(hubWinId)

    // Hub must also know the satellite (already worked before the fix).
    expect(hubResult.current.presence[satWinId]).toBeDefined()
    expect(hubResult.current.presence[satWinId].role).toBe('satellite')
    expect(hubResult.current.windowHolding('doc', 'b.md')).toBe(satWinId)
  })

  // -------------------------------------------------------------------------
  // Unmount lifecycle (bye message)
  // -------------------------------------------------------------------------

  it('unmounting satellite posts bye and removes its entry from hub presence', async () => {
    const channelHub = createInMemoryChannelHub()

    const hubWinId = 'window-hub-3'
    const satWinId = 'window-sat-3'

    const { result: hubResult } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: null },
        () => createBus(channelHub),
        hubWinId
      )
    )

    const { unmount: unmountSat } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: { kind: 'doc', ref: 'c.md' } },
        () => createBus(channelHub),
        satWinId
      )
    )

    await act(async () => {})

    // Satellite should be present before unmount.
    expect(hubResult.current.presence[satWinId]).toBeDefined()

    // Unmount satellite — cleanup effect runs, posts 'bye'.
    act(() => { unmountSat() })

    await act(async () => {})

    // Hub should have processed the 'bye' and removed the satellite entry.
    expect(hubResult.current.presence[satWinId]).toBeUndefined()
    expect(hubResult.current.windowHolding('doc', 'c.md')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // pagehide lifecycle
  //
  // In production, pagehide fires in the closing window only.  In jsdom every
  // hook shares one global `window`, so firing pagehide hits all hooks.  We
  // therefore test the pagehide path in isolation: one hook mounted, verify it
  // posts 'bye' by inspecting messages received on a second bare bus.
  // -------------------------------------------------------------------------

  it('pagehide posts bye message from the hook', async () => {
    const channelHub = createInMemoryChannelHub()
    const winId = 'window-pagehide-test'

    // A listener bus to receive any messages the hook posts.
    const listenerBus = createBus(channelHub)
    const received: Array<{ type: string; windowId?: string }> = []
    listenerBus.subscribe((msg) => {
      received.push(msg as { type: string; windowId?: string })
    })

    const { unmount } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: { kind: 'doc', ref: 'd.md' } },
        () => createBus(channelHub),
        winId
      )
    )

    await act(async () => {})

    // Verify mount posted a presence message.
    const presenceMsgs = received.filter((m) => m.type === 'presence')
    expect(presenceMsgs.length).toBeGreaterThan(0)

    received.length = 0 // reset

    // Fire pagehide — should trigger the cleanup path (post bye + close bus).
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    await act(async () => {})

    const byeMsgs = received.filter((m) => m.type === 'bye' && m.windowId === winId)
    expect(byeMsgs.length).toBe(1)

    // Cleanup after this test — unmount (cleanup is idempotent after pagehide).
    unmount()
    listenerBus.close()
  })

  // -------------------------------------------------------------------------
  // onMessage — app-level handler (latest-ref pattern)
  // -------------------------------------------------------------------------

  it('onMessage handler receives non-presence messages from another window', async () => {
    const channelHub = createInMemoryChannelHub()

    const hubWinId = 'window-hub-5'
    const satWinId = 'window-sat-5'

    const { result: hubResult } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: null },
        () => createBus(channelHub),
        hubWinId
      )
    )

    const { result: satResult } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: { kind: 'doc', ref: 'e.md' } },
        () => createBus(channelHub),
        satWinId
      )
    )

    await act(async () => {})

    // Register a handler on the hub — it should receive non-presence messages
    // posted by the satellite.
    const received: Array<{ type: string }> = []
    act(() => {
      hubResult.current.onMessage((msg) => received.push(msg as { type: string }))
    })

    // Satellite posts a draw-mode message — hub's bus receives it.
    act(() => {
      satResult.current.post({ type: 'draw-mode', active: true })
    })

    await act(async () => {})

    const drawMsgs = received.filter((m) => m.type === 'draw-mode')
    expect(drawMsgs.length).toBe(1)
  })

  it('replacing onMessage handler via latest-ref pattern uses the newest handler', async () => {
    const channelHub = createInMemoryChannelHub()

    const hubWinId = 'window-hub-6'
    const satWinId = 'window-sat-6'

    const { result: hubResult } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: null },
        () => createBus(channelHub),
        hubWinId
      )
    )

    const { result: satResult } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: null },
        () => createBus(channelHub),
        satWinId
      )
    )

    await act(async () => {})

    const firstReceived: string[] = []
    const secondReceived: string[] = []

    act(() => {
      hubResult.current.onMessage(() => firstReceived.push('first'))
    })

    // Replace the handler before the message arrives.
    act(() => {
      hubResult.current.onMessage(() => secondReceived.push('second'))
    })

    act(() => {
      satResult.current.post({ type: 'draw-mode', active: false })
    })

    await act(async () => {})

    // Only the second (latest) handler should have been called.
    expect(secondReceived.length).toBe(1)
    expect(firstReceived.length).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Presence storm regression - entity object-reference churn
  // -------------------------------------------------------------------------

  it('re-renders with same entity values (new inline object) do not re-post presence (no storm)', async () => {
    const channelHub = createInMemoryChannelHub()

    const satWinId = 'window-sat-storm'

    // A listener bus to count how many presence messages the hook posts.
    const listenerBus = createBus(channelHub)
    let presencePostCount = 0
    listenerBus.subscribe((msg) => {
      if (msg.type === 'presence' && msg.windowId === satWinId) {
        presencePostCount++
      }
    })

    // entity is declared outside so we can swap the object reference while
    // keeping the same logical values - simulating a caller that passes an
    // inline object literal each render.
    let entityObj: { kind: 'doc' | 'canvas'; ref: string } = { kind: 'doc', ref: 'storm.md' }

    const { rerender } = renderHook(() =>
      useCrossWindow(
        { role: 'satellite', entity: entityObj },
        () => createBus(channelHub),
        satWinId
      )
    )

    await act(async () => {})

    // Capture baseline after mount (mount effect + initial self-change effect both fire
    // on first render; the design intentionally posts twice on mount, which is harmless
    // because presence messages are idempotent in the reducer).
    const countAfterMount = presencePostCount

    // Force three re-renders with a NEW object reference but identical values.
    // This simulates a parent component passing `entity={{ kind, ref }}` inline.
    await act(async () => {
      entityObj = { kind: 'doc', ref: 'storm.md' }
      rerender()
    })
    await act(async () => {
      entityObj = { kind: 'doc', ref: 'storm.md' }
      rerender()
    })
    await act(async () => {
      entityObj = { kind: 'doc', ref: 'storm.md' }
      rerender()
    })

    // With the bug (object dep): presencePostCount would be countAfterMount + 3.
    // With the fix (primitive deps): count must not increase beyond mount baseline.
    expect(presencePostCount).toBe(countAfterMount)

    listenerBus.close()
  })

  // -------------------------------------------------------------------------
  // Multi-entity presence (Plan 3b) — a window advertises ALL its shown panes
  // -------------------------------------------------------------------------

  it('a window advertising two doc panes exposes both; a peer resolves the second-pane ref', async () => {
    const channelHub = createInMemoryChannelHub()
    const aId = 'window-multi-a'
    const bId = 'window-multi-b'

    // A mounts FIRST with two shown doc panes (focused = a1.md, second pane = a2.md).
    const { result: aResult } = renderHook(() =>
      useCrossWindow(
        {
          role: 'hub',
          entity: { kind: 'doc', ref: 'a1.md' },
          entities: [
            { kind: 'doc', ref: 'a1.md' },
            { kind: 'doc', ref: 'a2.md' },
          ],
        },
        () => createBus(channelHub),
        aId
      )
    )

    // B mounts SECOND → posts its presence; A receives it and replies (mutual discovery),
    // so B learns A's FULL pane set via the reply.
    const { result: bResult } = renderHook(() =>
      useCrossWindow(
        {
          role: 'satellite',
          entity: { kind: 'doc', ref: 'b1.md' },
          entities: [{ kind: 'doc', ref: 'b1.md' }],
        },
        () => createBus(channelHub),
        bId
      )
    )

    await act(async () => {})

    // B sees BOTH of A's panes in presence.
    expect(bResult.current.presence[aId].entities).toEqual([
      { kind: 'doc', ref: 'a1.md' },
      { kind: 'doc', ref: 'a2.md' },
    ])
    // The back-compat mirror is the focused (first) entity.
    expect(bResult.current.presence[aId].entity).toEqual({ kind: 'doc', ref: 'a1.md' })
    // windowHolding resolves EITHER pane — including the non-focused second pane.
    expect(bResult.current.windowHolding('doc', 'a1.md')).toBe(aId)
    expect(bResult.current.windowHolding('doc', 'a2.md')).toBe(aId)
    // A likewise sees B.
    expect(aResult.current.windowHolding('doc', 'b1.md')).toBe(bId)
  })

  it('a doc held locally in a 2nd pane is NOT reported as held by another window (otherDocWindowOpen stays false for it)', async () => {
    const channelHub = createInMemoryChannelHub()
    const aId = 'window-local-a'
    const bId = 'window-local-b'

    // A holds docX (focused) AND docY (its 2nd pane) locally.
    const { result: aResult } = renderHook(() =>
      useCrossWindow(
        {
          role: 'hub',
          entity: { kind: 'doc', ref: 'docX.md' },
          entities: [
            { kind: 'doc', ref: 'docX.md' },
            { kind: 'doc', ref: 'docY.md' },
          ],
        },
        () => createBus(channelHub),
        aId
      )
    )
    // B holds an unrelated docZ.
    renderHook(() =>
      useCrossWindow(
        {
          role: 'satellite',
          entity: { kind: 'doc', ref: 'docZ.md' },
          entities: [{ kind: 'doc', ref: 'docZ.md' }],
        },
        () => createBus(channelHub),
        bId
      )
    )

    await act(async () => {})

    // BroadcastChannel never echoes a window to itself, so A never appears in its OWN presence.
    // → docY (held only by A, in A's 2nd pane) is reported by NO other window.
    // App's otherDocWindowOpen = "some presence doc is NOT in localRefs"; since docX/docY are
    // only in A's presence-absent self, they cannot light it up — only a genuinely-remote doc does.
    expect(aResult.current.windowHolding('doc', 'docY.md')).toBeNull()
    expect(aResult.current.windowHolding('doc', 'docX.md')).toBeNull()
    expect(aResult.current.windowHolding('doc', 'docZ.md')).toBe(bId)
  })

  it('re-posts presence when the shown pane set changes', async () => {
    const channelHub = createInMemoryChannelHub()
    const winId = 'window-repost'

    // Listener bus counts presence posts from winId.
    const listenerBus = createBus(channelHub)
    let presencePostCount = 0
    listenerBus.subscribe((msg) => {
      if (msg.type === 'presence' && msg.windowId === winId) presencePostCount++
    })

    let entities = [{ kind: 'doc' as const, ref: 'p1.md' }]
    const { rerender } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: entities[0], entities },
        () => createBus(channelHub),
        winId
      )
    )

    await act(async () => {})
    const countAfterMount = presencePostCount

    // Open a second pane → the pane set changes → exactly one re-post.
    await act(async () => {
      entities = [
        { kind: 'doc', ref: 'p1.md' },
        { kind: 'doc', ref: 'p2.md' },
      ]
      rerender()
    })

    expect(presencePostCount).toBe(countAfterMount + 1)

    listenerBus.close()
  })

  it('does not re-post on a new entities array with identical values (no storm)', async () => {
    const channelHub = createInMemoryChannelHub()
    const winId = 'window-repost-storm'

    const listenerBus = createBus(channelHub)
    let presencePostCount = 0
    listenerBus.subscribe((msg) => {
      if (msg.type === 'presence' && msg.windowId === winId) presencePostCount++
    })

    // New array reference each render, identical logical values.
    let entities = [{ kind: 'doc' as const, ref: 's1.md' }, { kind: 'doc' as const, ref: 's2.md' }]
    const { rerender } = renderHook(() =>
      useCrossWindow(
        { role: 'hub', entity: entities[0], entities },
        () => createBus(channelHub),
        winId
      )
    )

    await act(async () => {})
    const countAfterMount = presencePostCount

    await act(async () => {
      entities = [{ kind: 'doc', ref: 's1.md' }, { kind: 'doc', ref: 's2.md' }]
      rerender()
    })
    await act(async () => {
      entities = [{ kind: 'doc', ref: 's1.md' }, { kind: 'doc', ref: 's2.md' }]
      rerender()
    })

    // Stable pane-set key → no re-post beyond mount.
    expect(presencePostCount).toBe(countAfterMount)

    listenerBus.close()
  })
})
