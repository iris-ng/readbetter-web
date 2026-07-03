import { useEffect, useState } from 'react'

/**
 * Single-open status for an entity, backed by a Web Lock.
 *
 * We QUEUE for the lock (a blocking request) rather than probe once. While another window holds the
 * lock, `lockedElsewhere` is true; the instant that window releases it (closes/detaches the tab),
 * our queued request is granted and the flag clears automatically. A probe-once approach
 * (`ifAvailable: true`, no retry) latches "locked" forever if it happens to check during the brief
 * window the previous holder is still releasing — which is exactly the detach hand-off, where the
 * hub releases the doc as the new window boots and requests it.
 */
export function useEntityLock(name: string | null): { lockedElsewhere: boolean } {
  const [lockedElsewhere, setLockedElsewhere] = useState(false)

  useEffect(() => {
    setLockedElsewhere(false)
    if (!name) return
    const locks = (navigator as unknown as { locks?: LockManager }).locks
    if (!locks) return // environment without Web Locks: treat as always available

    const ctrl = new AbortController()
    let release: (() => void) | null = null
    let acquired = false

    // Drive the initial notice: if someone holds it right now, show "open elsewhere" until we
    // acquire. query() is best-effort (absent in some minimal/test environments).
    const probe = locks.query?.()
    if (probe) {
      void probe
        .then((state) => {
          if (!acquired && state.held?.some((l) => l.name === name)) setLockedElsewhere(true)
        })
        .catch(() => {})
    }

    // Queue for the lock. The callback runs only once WE hold it (any prior holder has released),
    // so clear the notice and hold until teardown. Aborting cancels a still-queued request on
    // unmount; resolving `release` frees a lock we already hold.
    void locks
      .request(name, { mode: 'exclusive', signal: ctrl.signal }, () => {
        acquired = true
        setLockedElsewhere(false)
        return new Promise<void>((resolve) => {
          release = resolve
        })
      })
      .catch(() => {
        /* AbortError on unmount while queued, or a rejected request — nothing held */
      })

    return () => {
      ctrl.abort()
      release?.()
    }
  }, [name])

  return { lockedElsewhere }
}
