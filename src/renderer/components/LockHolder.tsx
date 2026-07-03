import { useEffect } from 'react'
import { useEntityLock } from '../hooks/useEntityLock'

export function LockHolder({ name, onStatus }: { name: string; onStatus: (locked: boolean) => void }): null {
  const { lockedElsewhere } = useEntityLock(name)
  useEffect(() => onStatus(lockedElsewhere), [lockedElsewhere, onStatus])
  return null
}
