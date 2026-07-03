import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEntityLock } from './useEntityLock'

// A minimal exclusive lock manager for ONE name at a time, modelling grant / queue / release /
// abort — enough to exercise the hook's queue-and-self-heal behavior. A holder is released when the
// callback's returned promise resolves (which the hook does on unmount), at which point the next
// queued waiter is granted.
function installLockEnv(): void {
  let held: string | null = null
  const waiters: Array<{ name: string; grant: () => void }> = []
  const grantNext = (): void => {
    const w = waiters.shift()
    if (w) w.grant()
  }
  ;(navigator as unknown as { locks: unknown }).locks = {
    query: async () => ({ held: held ? [{ name: held }] : [] }),
    request: (
      name: string,
      opts: { mode?: string; signal?: AbortSignal },
      cb: (lock: unknown) => Promise<void>
    ) => {
      expect(opts.mode).toBe('exclusive')
      const grant = (): Promise<void> => {
        held = name
        const p = Promise.resolve(cb({}))
        void p.then(() => {
          held = null
          grantNext()
        })
        return p
      }
      if (held === null) return Promise.resolve().then(grant)
      return new Promise<void>((resolve, reject) => {
        const w = { name, grant: () => { void grant(); resolve() } }
        waiters.push(w)
        opts.signal?.addEventListener('abort', () => {
          const i = waiters.indexOf(w)
          if (i >= 0) waiters.splice(i, 1)
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    }
  }
}

describe('useEntityLock', () => {
  beforeEach(() => installLockEnv())

  it('acquires a free lock → not locked elsewhere', async () => {
    const { result } = renderHook(() => useEntityLock('rb:doc:a'))
    await waitFor(() => expect(result.current.lockedElsewhere).toBe(false))
  })

  it('null name → never locked', () => {
    const { result } = renderHook(() => useEntityLock(null))
    expect(result.current.lockedElsewhere).toBe(false)
  })

  it('shows locked while another window holds it, then self-heals when that window releases', async () => {
    // Window A holds the lock.
    const a = renderHook(() => useEntityLock('rb:doc:a'))
    await waitFor(() => expect(a.result.current.lockedElsewhere).toBe(false))

    // Window B queues behind A → shows locked-elsewhere.
    const b = renderHook(() => useEntityLock('rb:doc:a'))
    await waitFor(() => expect(b.result.current.lockedElsewhere).toBe(true))

    // A releases (its tab/window goes away) → B's queued request is granted → notice clears.
    a.unmount()
    await waitFor(() => expect(b.result.current.lockedElsewhere).toBe(false))
  })
})
