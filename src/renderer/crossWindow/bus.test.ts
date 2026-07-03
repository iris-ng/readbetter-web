import { describe, it, expect } from 'vitest'
import { createBus, WINDOW_ID } from './bus'
import type { CrossWindowMessage } from './bus'
import { createInMemoryChannelHub } from './testChannel'

describe('CrossWindowBus', () => {
  const msg: CrossWindowMessage = { type: 'draw-mode', active: true }

  it('delivers busA.post to busB subscriber', () => {
    const factory = createInMemoryChannelHub()
    const busA = createBus(factory)
    const busB = createBus(factory)

    const receivedB: CrossWindowMessage[] = []
    busB.subscribe((m) => receivedB.push(m))

    busA.post(msg)

    expect(receivedB).toHaveLength(1)
    expect(receivedB[0]).toEqual(msg)

    busA.close()
    busB.close()
  })

  it('does NOT deliver busA.post back to busA subscriber (no self-echo)', () => {
    const factory = createInMemoryChannelHub()
    const busA = createBus(factory)
    const busB = createBus(factory)

    const receivedA: CrossWindowMessage[] = []
    busA.subscribe((m) => receivedA.push(m))
    // busB subscriber just to have a second channel registered
    busB.subscribe(() => {})

    busA.post(msg)

    expect(receivedA).toHaveLength(0)

    busA.close()
    busB.close()
  })

  it('unsubscribe stops receiving messages', () => {
    const factory = createInMemoryChannelHub()
    const busA = createBus(factory)
    const busB = createBus(factory)

    const received: CrossWindowMessage[] = []
    const unsub = busB.subscribe((m) => received.push(m))

    busA.post(msg)
    expect(received).toHaveLength(1)

    unsub()

    busA.post(msg)
    expect(received).toHaveLength(1) // no new messages after unsubscribe

    busA.close()
    busB.close()
  })

  it('close() removes the listener — no more messages received after close', () => {
    const factory = createInMemoryChannelHub()
    const busA = createBus(factory)
    const busB = createBus(factory)

    const received: CrossWindowMessage[] = []
    busB.subscribe((m) => received.push(m))

    busA.post(msg)
    expect(received).toHaveLength(1)

    busB.close()

    busA.post(msg)
    expect(received).toHaveLength(1) // busB closed, no new messages

    busA.close()
  })

  it('multiple subscribers on the same bus all receive the message', () => {
    const factory = createInMemoryChannelHub()
    const busA = createBus(factory)
    const busB = createBus(factory)

    const calls: number[] = []
    busB.subscribe(() => calls.push(1))
    busB.subscribe(() => calls.push(2))

    busA.post(msg)

    expect(calls).toHaveLength(2)
    expect(calls).toContain(1)
    expect(calls).toContain(2)

    busA.close()
    busB.close()
  })

  it('two addEventListener calls on one in-memory channel both fire (listener-set semantics)', () => {
    const factory = createInMemoryChannelHub()
    const busA = createBus(factory)
    const busB = createBus(factory)

    // Add two independent subscribers on busB — both must receive the message
    const calls: string[] = []
    busB.subscribe(() => calls.push('first'))
    busB.subscribe(() => calls.push('second'))

    busA.post(msg)

    expect(calls).toContain('first')
    expect(calls).toContain('second')
    expect(calls).toHaveLength(2)

    busA.close()
    busB.close()
  })

  it('post() after close() does not throw and delivers nothing', () => {
    const factory = createInMemoryChannelHub()
    const busA = createBus(factory)
    const busB = createBus(factory)

    const received: CrossWindowMessage[] = []
    busB.subscribe((m) => received.push(m))

    busA.close()

    // Should not throw, and busB should receive nothing
    expect(() => busA.post(msg)).not.toThrow()
    expect(received).toHaveLength(0)

    busB.close()
  })

  it('WINDOW_ID is a non-empty string', () => {
    expect(typeof WINDOW_ID).toBe('string')
    expect(WINDOW_ID.length).toBeGreaterThan(0)
  })
})
