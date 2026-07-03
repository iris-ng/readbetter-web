// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { createServer as createHttp, Server } from 'http'
import { listenLoopback } from './listen'

describe('listenLoopback', () => {
  const servers: Server[] = []
  afterEach(async () => {
    for (const s of servers) await new Promise<void>((r) => s.close(() => r()))
    servers.length = 0
  })

  it('binds 127.0.0.1 and returns the actual port', async () => {
    const s = createHttp()
    servers.push(s)
    const port = await listenLoopback(s, 0)
    expect(port).toBeGreaterThan(0)
    const addr = s.address()
    expect(typeof addr === 'object' && addr ? addr.address : '').toBe('127.0.0.1')
  })

  it('falls back to an ephemeral port when the preferred one is taken', async () => {
    const blocker = createHttp()
    servers.push(blocker)
    const taken = await listenLoopback(blocker, 0)

    const s = createHttp()
    servers.push(s)
    const port = await listenLoopback(s, taken) // preferred == taken → must fall back
    expect(port).toBeGreaterThan(0)
    expect(port).not.toBe(taken)
  })
})
