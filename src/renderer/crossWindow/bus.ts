import type { LinkPick } from '../annotations/linkPick'
import type { ExcerptDropPayload } from '../canvas/excerptDrag'
import type { Link } from '../../core/link/link'
import type { Anchor } from '../../core/anchor/anchor'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrossWindowMessage =
  | { type: 'presence'; windowId: string; role: 'hub' | 'satellite'; entity: { kind: 'doc' | 'canvas'; ref: string } | null; entities?: { kind: 'doc' | 'canvas'; ref: string }[] }
  | { type: 'bye'; windowId: string }
  | { type: 'draw-mode'; active: boolean }
  | { type: 'pending-pick'; windowId: string; docRef: string; pick: LinkPick }
  | { type: 'link-create'; forDocRef: string; record: Link }
  | { type: 'link-changed'; docRefs: string[] }
  // A cross-window navigation request. Exactly ONE of `linkId`/`anchor` is set:
  //   linkId → follow a link (Task 5): the receiver resolves its OWN endpoint of the shared link
  //            from its sidecar records (the clicker's anchor is foreign text in the partner doc).
  //   anchor → card→source (Task 8): the anchor IS the source doc's own anchor (the excerpt was
  //            lifted from `targetRef`), so it resolves directly in the receiver's loaded text.
  | { type: 'navigate'; targetRef: string; linkId?: string; anchor?: Anchor }
  | { type: 'open-entity'; kind: 'doc' | 'canvas'; ref: string; linkId?: string; anchor?: Anchor }
  | { type: 'excerpt'; payload: ExcerptDropPayload }
  | { type: 'card-color'; annotationId: string; color: string }
  | { type: 'active-canvas'; ref: string }

export interface CrossWindowBus {
  post(msg: CrossWindowMessage): void
  subscribe(handler: (msg: CrossWindowMessage) => void): () => void
  close(): void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Stable identity for this window instance, generated once per module load. */
export const WINDOW_ID: string = crypto.randomUUID()

// ---------------------------------------------------------------------------
// Channel interface (narrower than BroadcastChannel to keep test injection simple)
// ---------------------------------------------------------------------------

/** Minimal channel surface the bus needs — structurally assignable from BroadcastChannel. */
export interface BusChannel {
  postMessage(data: unknown): void
  addEventListener(type: string, listener: (event: MessageEvent) => void): void
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void
  close(): void
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a cross-window bus backed by a BroadcastChannel.
 *
 * @param channelFactory - Optional factory for the underlying channel.
 *   Defaults to `new BroadcastChannel('readbetter')`. Tests inject an
 *   in-memory channel that replicates real BroadcastChannel semantics
 *   (messages are NOT delivered back to the posting channel).
 */
export function createBus(
  channelFactory?: () => BusChannel
): CrossWindowBus {
  // `as unknown as BusChannel`: BroadcastChannel's overloaded addEventListener
  // signatures (EventListener | EventListenerObject overload) don't structurally
  // match the flat `(event: MessageEvent) => void` in our BusChannel stub, so
  // we cast through `unknown` to satisfy TypeScript without widening the interface.
  const channel: BusChannel = channelFactory
    ? channelFactory()
    : new BroadcastChannel('readbetter') as unknown as BusChannel

  let closed = false
  const handlers = new Set<(msg: CrossWindowMessage) => void>()

  const listener = (event: MessageEvent) => {
    const msg = event.data as CrossWindowMessage
    for (const handler of handlers) {
      handler(msg)
    }
  }

  channel.addEventListener('message', listener)

  return {
    post(msg: CrossWindowMessage): void {
      if (closed) return
      channel.postMessage(msg)
    },

    subscribe(handler: (msg: CrossWindowMessage) => void): () => void {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },

    close(): void {
      if (closed) return
      closed = true
      channel.removeEventListener('message', listener)
      handlers.clear()
      channel.close()
    }
  }
}
