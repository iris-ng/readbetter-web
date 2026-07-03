import { describe, it, expect, vi } from 'vitest'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {}
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker-url' }))

import { makeRenderPage } from './pdfjs'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function fakePdf(): { pdf: never; render: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn()
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel }))
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 100 * scale, height: 200 * scale })),
    render
  }
  const pdf = { getPage: vi.fn(async () => page) }
  return { pdf: pdf as never, render, cancel }
}

function fakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.getContext = vi.fn(() => ({})) as never
  return canvas
}

describe('makeRenderPage', () => {
  it('renders a single requested page exactly once and cancels nothing', async () => {
    const { pdf, render, cancel } = fakePdf()
    const rp = makeRenderPage(pdf)
    rp(0, fakeCanvas(), 100)
    await flush()
    expect(render).toHaveBeenCalledTimes(1)
    expect(cancel).not.toHaveBeenCalled()
  })

  it('does not run two concurrent renders on the same canvas (supersedes rapid repeat calls)', async () => {
    const { pdf, render } = fakePdf()
    const rp = makeRenderPage(pdf)
    const canvas = fakeCanvas()
    rp(0, canvas, 100)
    rp(0, canvas, 100) // second request before the first resolves → supersedes it
    await flush()
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('cancels the in-flight render task when a new render is requested for the same canvas', async () => {
    const { pdf, cancel } = fakePdf()
    const rp = makeRenderPage(pdf)
    const canvas = fakeCanvas()
    rp(0, canvas, 100)
    await flush() // let the first render task get created + stored
    rp(0, canvas, 100) // now there IS an in-flight task → it must be cancelled
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})

describe('makeRenderPage onError', () => {
  it('calls onError(pageIndex) when the page render rejects (non-cancellation)', async () => {
    const render = vi.fn(() => ({ promise: Promise.reject(new Error('JBig2Error')), cancel: vi.fn() }))
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 100 * scale, height: 200 * scale })),
      render
    }
    const pdf = { getPage: vi.fn(async () => page) }
    const onError = vi.fn()
    makeRenderPage(pdf as never)(3, fakeCanvas(), 100, onError)
    await flush()
    expect(onError).toHaveBeenCalledWith(3)
  })

  it('does NOT call onError on a RenderingCancelledException', async () => {
    const err = Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' })
    const render = vi.fn(() => ({ promise: Promise.reject(err), cancel: vi.fn() }))
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 100 * scale, height: 200 * scale })),
      render
    }
    const pdf = { getPage: vi.fn(async () => page) }
    const onError = vi.fn()
    makeRenderPage(pdf as never)(0, fakeCanvas(), 100, onError)
    await flush()
    expect(onError).not.toHaveBeenCalled()
  })

  it('does NOT call onError when a stale render generation rejects after being superseded', async () => {
    let rejectFirst!: (e: unknown) => void
    const firstPromise = new Promise((_resolve, reject) => {
      rejectFirst = reject
    })
    const render = vi
      .fn()
      .mockReturnValueOnce({ promise: firstPromise, cancel: vi.fn() })
      .mockReturnValueOnce({ promise: Promise.resolve(), cancel: vi.fn() })
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 100 * scale, height: 200 * scale })),
      render
    }
    const pdf = { getPage: vi.fn(async () => page) }
    const onError = vi.fn()
    const rp = makeRenderPage(pdf as never)
    const canvas = fakeCanvas()
    rp(0, canvas, 100, onError) // gen 1: starts the (pending) first render
    await flush()
    rp(0, canvas, 100, onError) // gen 2: cancels + supersedes gen 1
    await flush()
    rejectFirst(new Error('late JBig2 failure')) // gen 1 rejects AFTER it was superseded
    await flush()
    expect(onError).not.toHaveBeenCalled()
  })
})
