import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAnnotations } from './useAnnotations'

const TEXT = 'The quick brown fox jumps over the lazy dog. Second sentence here.'

function api() {
  return {
    readSidecar: vi.fn().mockResolvedValue(null),
    writeSidecar: vi.fn().mockResolvedValue(undefined)
  }
}

describe('useAnnotations.flush', () => {
  it('writes immediately when dirty, bypassing the debounce', async () => {
    const a = api()
    const { result } = renderHook(() => useAnnotations(TEXT, TEXT, 'documents/a.md', a))
    // let the initial load settle
    await waitFor(() => expect(a.readSidecar).toHaveBeenCalled())

    act(() => result.current.createAnnotation({ start: 4, end: 9 }))
    act(() => result.current.flush())

    expect(a.writeSidecar).toHaveBeenCalledTimes(1)
    const [ref, json] = a.writeSidecar.mock.calls[0]
    expect(ref).toBe('documents/a.md')
    expect(JSON.parse(json).annotations).toHaveLength(1)
  })

  it('is a no-op when not dirty', async () => {
    const a = api()
    const { result } = renderHook(() => useAnnotations(TEXT, TEXT, 'documents/a.md', a))
    await waitFor(() => expect(a.readSidecar).toHaveBeenCalled())
    act(() => result.current.flush())
    expect(a.writeSidecar).not.toHaveBeenCalled()
  })
})
