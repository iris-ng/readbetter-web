import type { BusChannel } from './bus'

// ---------------------------------------------------------------------------
// In-memory BroadcastChannel hub for testing
//
// Mirrors real BroadcastChannel semantics: postMessage delivers to all
// listeners EXCEPT the channel that posted.
// ---------------------------------------------------------------------------

type ChannelListener = (event: MessageEvent) => void

/**
 * Creates a factory function that produces in-memory BusChannel instances
 * sharing a single message hub. All channels created by the returned factory
 * share the same listener map — messages posted to one channel are delivered
 * to all OTHER channels registered with the same hub (no self-echo).
 */
export function createInMemoryChannelHub(): () => BusChannel {
  // Map each channel to a SET of listeners, mirroring real BroadcastChannel
  // accumulate-listeners semantics (multiple addEventListener calls must all fire).
  const listeners = new Map<BusChannel, Set<ChannelListener>>()

  function createChannel(): BusChannel {
    const channel: BusChannel = {
      postMessage(data: unknown) {
        for (const [key, listenerSet] of listeners) {
          if (key !== channel) {
            for (const listener of listenerSet) {
              listener(new MessageEvent('message', { data }))
            }
          }
        }
      },
      addEventListener(_type: string, handler: ChannelListener) {
        let set = listeners.get(channel)
        if (!set) {
          set = new Set()
          listeners.set(channel, set)
        }
        set.add(handler)
      },
      removeEventListener(_type: string, handler: ChannelListener) {
        listeners.get(channel)?.delete(handler)
      },
      close() {
        listeners.delete(channel)
      }
    }
    return channel
  }

  return createChannel
}
