import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { PdfPageView } from './PdfPageView'
import type { PdfParseResult } from '../../core/pdf/liteparse'
import type { RunOffset } from '../../core/pdf/pdfLayout'
import type { ResolvedAnnotation } from '../annotations/useAnnotations'
import type { SearchMatch } from '../search/searchMatch'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
  globalThis.URL.revokeObjectURL = vi.fn()
})

const parse: PdfParseResult = {
  pages: [
    { index: 0, width: 600, height: 800 },
    { index: 1, width: 600, height: 800 }
  ],
  runs: [
    { pageIndex: 0, text: 'Hello', x: 10, y: 20, w: 30, h: 12, ocr: false },
    { pageIndex: 1, text: 'Second', x: 10, y: 20, w: 40, h: 12, ocr: false }
  ],
  scanned: false
}
const runIndex: RunOffset[] = [
  { pageIndex: 0, text: 'Hello', x: 10, y: 20, w: 30, h: 12, ocr: false, charStart: 7, charEnd: 12 },
  { pageIndex: 1, text: 'Second', x: 10, y: 20, w: 40, h: 12, ocr: false, charStart: 30, charEnd: 36 }
]
const noop = (): void => {}
const baseProps = {
  parse,
  runIndex,
  activeIndex: 0,
  zoom: 1,
  renderPage: vi.fn(),
  annotations: [] as ResolvedAnnotation[],
  onCreateRange: noop,
  onSetNote: noop,
  onSetColor: noop,
  onDelete: noop
}

describe('PdfPageView', () => {
  it('renders a placeholder per page and the run text', () => {
    render(<PdfPageView {...baseProps} />)
    expect(screen.getByTestId('pdf-page-0')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('stamps each run span with its char-offset (data-cs) for selection', () => {
    render(<PdfPageView {...baseProps} />)
    const span = screen.getByText('Hello')
    expect(span.getAttribute('data-cs')).toBe('7')
  })

  it('renders a highlight rect for a resolved annotation with quads on the page', () => {
    const annotations: ResolvedAnnotation[] = [
      {
        id: 'a1',
        color: '#fde68a',
        note: '',
        range: { start: 7, end: 12 },
        anchor: { start: 7, end: 12, exact: 'Hello', prefix: '', suffix: '' },
        quads: [{ pageIndex: 0, x: 10, y: 20, w: 30, h: 12 }]
      }
    ]
    render(<PdfPageView {...baseProps} annotations={annotations} />)
    expect(screen.getByTestId('pdf-highlight')).toBeInTheDocument()
  })

  it('double-click / right-click a highlight sends it to the canvas', () => {
    const annotations: ResolvedAnnotation[] = [
      {
        id: 'a1',
        color: '#fde68a',
        note: '',
        range: { start: 7, end: 12 },
        anchor: {
          start: 7,
          end: 12,
          exact: 'Hello',
          prefix: '',
          suffix: '',
          page: { quads: [{ pageIndex: 0, x: 10, y: 20, w: 30, h: 12 }] }
        },
        quads: [{ pageIndex: 0, x: 10, y: 20, w: 30, h: 12 }]
      }
    ]
    const onSendExcerpt = vi.fn()
    render(
      <PdfPageView
        {...baseProps}
        annotations={annotations}
        sourceRef="documents/p.pdf"
        docText="xxxxxxxHello"
        onSendExcerpt={onSendExcerpt}
      />
    )
    // jsdom has no layout/elementFromPoint, so stub the hit-test to land on the run span.
    const span = screen.getByText('Hello')
    document.elementFromPoint = (() => span) as typeof document.elementFromPoint
    fireEvent.doubleClick(screen.getByRole('article'))
    expect(onSendExcerpt).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'documents/p.pdf', snapshot: 'Hello' })
    )
    onSendExcerpt.mockClear()
    fireEvent.contextMenu(screen.getByRole('article'))
    expect(onSendExcerpt).toHaveBeenCalledTimes(1)
  })

  it('scrolls the active page into view when activeIndex changes', () => {
    const { rerender } = render(<PdfPageView {...baseProps} activeIndex={0} />)
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()
    rerender(<PdfPageView {...baseProps} activeIndex={1} />)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('navigate scrolls the flashed page into view even when activeIndex is unchanged', () => {
    // CM3 regression mirror for PDF: a navigate to an already-active page must still scroll.
    // Before the fix PdfPageView has no flashRange prop and only scrolls on [activeIndex],
    // so a fresh flashRange object targeting the same active page triggers NO scrollIntoView → RED.
    const flashRange1 = { start: 7, end: 12 } // the "Hello" run on page 0
    const { rerender } = render(
      <PdfPageView {...baseProps} activeIndex={0} flashRange={flashRange1} />
    )
    // Discard the mount-time [activeIndex] scroll.
    ;(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear()
    // A NEW flashRange object pointing into the SAME (already-active) page must re-scroll.
    const flashRange2 = { start: 7, end: 12 }
    rerender(<PdfPageView {...baseProps} activeIndex={0} flashRange={flashRange2} />)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('renders a transient flash highlight for the flashRange', () => {
    render(<PdfPageView {...baseProps} activeIndex={0} flashRange={{ start: 7, end: 12 }} />)
    const flash = screen.getAllByTestId('pdf-highlight').find(
      (el) => el.getAttribute('data-annotation-id') === '__backlink_flash__'
    )
    expect(flash).toBeTruthy()
  })

  it('sizes the page container by width/height × zoom when the pane is unmeasured', () => {
    render(<PdfPageView {...baseProps} zoom={2} />)
    const page = screen.getByTestId('pdf-page-0')
    expect(page.style.width).toBe('1200px')
    expect(page.style.height).toBe('1600px')
  })

  it('uses 100% zoom as native PDF scale even when the pane is narrower', () => {
    // The pane content box is 400px wide; with 16px padding each side the usable width is 368px.
    // The widest page (600 units) must scale down to exactly fill it — never render at native 600px.
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(400)
    try {
      render(<PdfPageView {...baseProps} zoom={1} />)
      const page = screen.getByTestId('pdf-page-0')
      expect(page.style.width).toBe('600px')
    } finally {
      widthSpy.mockRestore()
    }
  })

  it('the scroll container has min-width:0 so it can shrink below page width and re-fit on resize', () => {
    // Without min-width:0 the fixed-width page pins the flex item's min-content width: the pane
    // can never shrink, so the ResizeObserver never fires and the PDF stops re-fitting on resize.
    render(<PdfPageView {...baseProps} />)
    expect(screen.getByRole('article').style.minWidth).toBe('0')
  })

  it('applies zoom as a literal PDF scale', () => {
    const widthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(400)
    try {
      render(<PdfPageView {...baseProps} zoom={2} />)
      const page = screen.getByTestId('pdf-page-0')
      expect(page.style.width).toBe('1200px')
    } finally {
      widthSpy.mockRestore()
    }
  })

  it('shows no OCR chip on digital pages (all runs ocr:false)', () => {
    render(<PdfPageView {...baseProps} />)
    expect(screen.queryByTestId('ocr-chip-0')).toBeNull()
    expect(screen.queryByTestId('ocr-chip-1')).toBeNull()
  })

  it('shows an OCR chip on a page whose runs are all ocr:true, but not on a digital page', () => {
    const scannedParse: PdfParseResult = {
      pages: [
        { index: 0, width: 600, height: 800 },
        { index: 1, width: 600, height: 800 }
      ],
      runs: [
        { pageIndex: 0, text: 'scanned', x: 10, y: 20, w: 30, h: 12, ocr: true },
        { pageIndex: 1, text: 'digital', x: 10, y: 20, w: 30, h: 12, ocr: false }
      ],
      scanned: true
    }
    const scannedRunIndex: RunOffset[] = [
      { pageIndex: 0, text: 'scanned', x: 10, y: 20, w: 30, h: 12, ocr: true, charStart: 7, charEnd: 14 },
      { pageIndex: 1, text: 'digital', x: 10, y: 20, w: 30, h: 12, ocr: false, charStart: 30, charEnd: 37 }
    ]
    render(<PdfPageView {...baseProps} parse={scannedParse} runIndex={scannedRunIndex} />)
    const chip = screen.getByTestId('ocr-chip-0')
    expect(chip).toBeInTheDocument()
    expect(within(screen.getByTestId('pdf-page-0')).getByText('OCR')).toBeInTheDocument()
    expect(screen.queryByTestId('ocr-chip-1')).toBeNull()
  })

  it('shows no OCR chip on a page with mixed ocr:true and ocr:false runs', () => {
    const mixedParse: PdfParseResult = {
      pages: [{ index: 0, width: 600, height: 800 }],
      runs: [
        { pageIndex: 0, text: 'native', x: 10, y: 20, w: 30, h: 12, ocr: false },
        { pageIndex: 0, text: 'scanned', x: 10, y: 40, w: 30, h: 12, ocr: true }
      ],
      scanned: true
    }
    const mixedRunIndex: RunOffset[] = [
      { pageIndex: 0, text: 'native', x: 10, y: 20, w: 30, h: 12, ocr: false, charStart: 7, charEnd: 13 },
      { pageIndex: 0, text: 'scanned', x: 10, y: 40, w: 30, h: 12, ocr: true, charStart: 14, charEnd: 21 }
    ]
    render(<PdfPageView {...baseProps} parse={mixedParse} runIndex={mixedRunIndex} />)
    expect(screen.queryByTestId('ocr-chip-0')).toBeNull()
  })

  it('renders each visible page once and does not re-render its canvas on an unrelated re-render', () => {
    const renderPage = vi.fn()
    const { rerender } = render(<PdfPageView {...baseProps} renderPage={renderPage} />)
    const initial = renderPage.mock.calls.length
    expect(initial).toBeGreaterThan(0) // page 0 rendered on mount
    rerender(<PdfPageView {...baseProps} renderPage={renderPage} />)
    expect(renderPage).toHaveBeenCalledTimes(initial) // no extra render from the re-render churn
  })

  it('shows no OCR chip on a page with zero runs', () => {
    const emptyPage: PdfParseResult = {
      pages: [{ index: 0, width: 600, height: 800 }],
      runs: [],
      scanned: false
    }
    render(<PdfPageView {...baseProps} parse={emptyPage} runIndex={[]} />)
    expect(screen.queryByTestId('ocr-chip-0')).toBeNull()
  })

  // ── Task 2: Connect-mode wiring ──────────────────────────────────────────────────────────────

  it('Connect mode: click on scroll container fires onConnectClick', () => {
    const onConnectClick = vi.fn()
    render(<PdfPageView {...baseProps} connectMode onConnectClick={onConnectClick} />)
    fireEvent.click(screen.getByRole('article'))
    expect(onConnectClick).toHaveBeenCalledTimes(1)
  })

  it('Connect mode: click inside captured region emits region pick before text fallback', () => {
    const anchor = {
      start: 0,
      end: 0,
      exact: '',
      prefix: '',
      suffix: '',
      regions: [
        {
          kind: 'page-rect' as const,
          pageIndex: 0,
          rect: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
          units: 'page-normalized' as const,
          origin: 'top-left' as const
        }
      ]
    }
    const item = { id: 'region-card-1', anchor, region: anchor.regions[0] }
    const onConnectRegion = vi.fn()
    const onConnectClick = vi.fn()

    render(
      <PdfPageView
        {...baseProps}
        connectMode
        regionAnchors={[item]}
        onConnectRegion={onConnectRegion}
        onConnectClick={onConnectClick}
      />
    )

    expect(screen.getByTestId('pdf-region-outline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('article'), { clientX: 150, clientY: 150 })
    expect(onConnectRegion).toHaveBeenCalledWith(anchor, anchor.regions[0])
    expect(onConnectClick).not.toHaveBeenCalled()
  })

  it('Connect mode off: click on scroll container does NOT fire onConnectClick', () => {
    const onConnectClick = vi.fn()
    render(<PdfPageView {...baseProps} connectMode={false} onConnectClick={onConnectClick} />)
    fireEvent.click(screen.getByRole('article'))
    expect(onConnectClick).not.toHaveBeenCalled()
  })

  // ── Draw/Connect mode: suppress highlight card on plain click ──────────────────────────────────

  const hloAnnotation: ResolvedAnnotation[] = [
    {
      id: 'a1',
      color: 'yellow',
      note: '',
      range: { start: 7, end: 12 },
      anchor: {} as ResolvedAnnotation['anchor'],
      quads: []
    }
  ]

  // handleMouseUp resolves the click offset from the current selection's anchorNode; point it at
  // the 'Hello' span (data-cs=7) so the hit-test lands inside annotation a1 (range 7..12).
  const mockSelectionInHello = (): void => {
    const helloNode = screen.getByText('Hello').firstChild as Node
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
      anchorNode: helloNode,
      anchorOffset: 0,
      focusNode: helloNode,
      focusOffset: 0,
      removeAllRanges: vi.fn()
    } as unknown as Selection)
  }

  it('normal mode: clicking inside a highlight opens the NotePopover', () => {
    render(<PdfPageView {...baseProps} annotations={hloAnnotation} connectMode={false} />)
    mockSelectionInHello()
    fireEvent.mouseUp(screen.getByRole('article'))
    expect(screen.queryByRole('dialog', { name: 'Annotation' })).not.toBeNull()
    vi.restoreAllMocks()
  })

  it('Draw/Connect mode: clicking inside a highlight does NOT open the NotePopover', () => {
    render(<PdfPageView {...baseProps} annotations={hloAnnotation} connectMode />)
    mockSelectionInHello()
    fireEvent.mouseUp(screen.getByRole('article'))
    expect(screen.queryByRole('dialog', { name: 'Annotation' })).toBeNull()
    vi.restoreAllMocks()
  })

  it('keeps the pdf.js canvas and never fetches a raster when rendering succeeds', () => {
    const renderPage = vi.fn() // never invokes onError
    const renderPageImage = vi.fn()
    const { container } = render(
      <PdfPageView {...baseProps} renderPage={renderPage} renderPageImage={renderPageImage} />
    )
    expect(container.querySelector('canvas')).toBeInTheDocument()
    expect(renderPageImage).not.toHaveBeenCalled()
  })

  it('renders the server raster fallback when pdf.js fails on a page (text layer intact)', async () => {
    const renderPage = vi.fn((pageIndex: number, _c: unknown, _w: number, onError?: (p: number) => void) =>
      onError?.(pageIndex)
    )
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    const renderPageImage = vi.fn(async () => blob)
    render(<PdfPageView {...baseProps} renderPage={renderPage} renderPageImage={renderPageImage} />)
    await waitFor(() => expect(renderPageImage).toHaveBeenCalledWith(0))
    expect(await screen.findByTestId('pdf-fallback-0')).toBeInTheDocument()
    // The transparent selectable text layer is still present on the fallback page.
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('shows a placeholder when the fallback raster fetch fails', async () => {
    const renderPage = vi.fn((pageIndex: number, _c: unknown, _w: number, onError?: (p: number) => void) =>
      onError?.(pageIndex)
    )
    const renderPageImage = vi.fn(async () => {
      throw new Error('500')
    })
    render(<PdfPageView {...baseProps} renderPage={renderPage} renderPageImage={renderPageImage} />)
    expect(await screen.findByTestId('pdf-fallback-error-0')).toBeInTheDocument()
  })

  it('fetches a failed page raster only once across re-renders', async () => {
    const renderPage = vi.fn((pageIndex: number, _c: unknown, _w: number, onError?: (p: number) => void) =>
      onError?.(pageIndex)
    )
    const renderPageImage = vi.fn(async () => new Blob([new Uint8Array([1])], { type: 'image/png' }))
    const { rerender } = render(
      <PdfPageView {...baseProps} renderPage={renderPage} renderPageImage={renderPageImage} />
    )
    await screen.findByTestId('pdf-fallback-0')
    // Capture how many pages have been fetched so far (OVERSCAN may make multiple pages visible).
    const callsBefore = renderPageImage.mock.calls.length
    rerender(<PdfPageView {...baseProps} zoom={1.5} renderPage={renderPage} renderPageImage={renderPageImage} />)
    // A zoom re-render must NOT trigger any additional server raster fetches.
    await waitFor(() => expect(renderPageImage).toHaveBeenCalledTimes(callsBefore))
  })

  // ── Task 9: search matches ──────────────────────────────────────────────────────────────────

  it('renders a highlight box per search match and marks the active one', () => {
    // 'Hello' run spans charStart 7 / charEnd 12 (see runIndex fixture above).
    const searchMatches: SearchMatch[] = [{ start: 7, end: 12 }]
    render(<PdfPageView {...baseProps} searchMatches={searchMatches} activeMatch={{ start: 7, end: 12 }} />)
    const boxes = screen.getAllByTestId('pdf-highlight')
    expect(boxes.length).toBeGreaterThan(0)
    expect(boxes.some((b) => b.getAttribute('data-search-active') === 'true')).toBe(true)
  })

  it('ctrl/cmd wheel zooms without normal scrolling', () => {
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    render(<PdfPageView {...baseProps} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />)
    const article = screen.getByRole('article')

    fireEvent.wheel(article, { ctrlKey: true, deltaY: -100 })
    expect(onZoomIn).toHaveBeenCalledTimes(1)

    fireEvent.wheel(article, { metaKey: true, deltaY: 100 })
    expect(onZoomOut).toHaveBeenCalledTimes(1)
  })

  it('uses the typed zoom as the literal PDF display scale', () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
    try {
      render(<PdfPageView {...baseProps} zoom={0.75} />)
      const page = screen.getByTestId('pdf-page-0')
      expect(page.style.width).toBe('450px')
      expect(page.style.height).toBe('600px')
    } finally {
      widthSpy.mockRestore()
      heightSpy.mockRestore()
    }
  })
})
describe('PdfPageView PDF region capture', () => {
  function mockPageRect(page: HTMLElement): void {
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 1200,
      height: 1600,
      right: 1210,
      bottom: 1620,
      x: 10,
      y: 20,
      toJSON: () => ({})
    })
  }

  function dispatchPointer(page: HTMLElement, type: string, x: number, y: number): void {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, {
      clientX: { value: x },
      clientY: { value: y },
      pageX: { value: x },
      pageY: { value: y },
      pointerId: { value: 1 }
    })
    fireEvent(page, event)
  }

  it('captures a dragged rectangle as a normalized page-rect anchor', async () => {
    const onCaptureRegion = vi.fn()
    render(<PdfPageView {...baseProps} zoom={2} captureRegionMode onCaptureRegion={onCaptureRegion} />)
    const page = screen.getByTestId('pdf-page-0')
    mockPageRect(page)

    dispatchPointer(page, 'pointerdown', 30, 50)
    dispatchPointer(page, 'pointermove', 100, 90)
    expect(screen.getByTestId('pdf-region-preview')).toBeInTheDocument()
    dispatchPointer(page, 'pointerup', 100, 90)
    await waitFor(() => expect(onCaptureRegion).toHaveBeenCalled())

    const [anchor, snapshot] = onCaptureRegion.mock.calls[0]
    expect(snapshot).toBe('Hello')
    expect(anchor).toEqual(
      expect.objectContaining({
        start: 0,
        end: 0,
        exact: '',
        regions: [expect.objectContaining({ kind: 'page-rect', pageIndex: 0, units: 'page-normalized', origin: 'top-left' })]
      })
    )
  })

  it('cancels an in-progress capture with Escape', () => {
    const onCaptureRegion = vi.fn()
    render(<PdfPageView {...baseProps} captureRegionMode onCaptureRegion={onCaptureRegion} />)
    const page = screen.getByTestId('pdf-page-0')
    mockPageRect(page)

    dispatchPointer(page, 'pointerdown', 130, 180)
    dispatchPointer(page, 'pointermove', 610, 500)
    expect(screen.getByTestId('pdf-region-preview')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('pdf-region-preview')).toBeNull()
    dispatchPointer(page, 'pointerup', 610, 500)
    expect(onCaptureRegion).not.toHaveBeenCalled()
  })

  it('renders and scrolls a flashed page rectangle', () => {
    render(
      <PdfPageView
        {...baseProps}
        flashPageRect={{
          pageIndex: 1,
          rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
          nonce: 1
        }}
      />
    )

    const flash = screen.getByTestId('pdf-region-flash')
    expect(flash.style.left).toBe('60px')
    expect(flash.style.top).toBe('160px')
    expect(flash.style.width).toBe('180px')
    expect(flash.style.height).toBe('320px')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})
describe('PdfPageView PDF pin popover', () => {
  const pinAnnotation: ResolvedAnnotation = {
    id: 'pin-a1',
    color: 'yellow',
    note: '',
    range: { start: 7, end: 12 },
    anchor: { start: 7, end: 12, exact: 'Hello', prefix: '', suffix: '' },
    quads: []
  }

  const mockSelectionInHello = (): void => {
    const helloNode = screen.getByText('Hello').firstChild as Node
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
      anchorNode: helloNode,
      anchorOffset: 0,
      focusNode: helloNode,
      focusOffset: 0,
      removeAllRanges: vi.fn()
    } as unknown as Selection)
  }

  const openPinPopover = (props: Partial<ComponentProps<typeof PdfPageView>> = {}) => {
    const view = render(<PdfPageView {...baseProps} annotations={[pinAnnotation]} connectMode={false} {...props} />)
    mockSelectionInHello()
    fireEvent.mouseUp(screen.getByRole('article'))
    return view
  }

  it('shows Pin and toggles the PDF annotation pin', () => {
    const onTogglePinAnnotation = vi.fn()
    openPinPopover({
      isPinnedAnnotation: () => false,
      atCap: false,
      onTogglePinAnnotation
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pin passage' }))
    expect(onTogglePinAnnotation).toHaveBeenCalledWith(pinAnnotation)
    vi.restoreAllMocks()
  })

  it('mirrors pinned and cap state', () => {
    const firstView = openPinPopover({
      isPinnedAnnotation: () => false,
      atCap: true,
      onTogglePinAnnotation: vi.fn()
    })
    expect(screen.getByRole('button', { name: 'Pin passage' })).toBeDisabled()
    vi.restoreAllMocks()
    firstView.unmount()

    openPinPopover({
      isPinnedAnnotation: () => true,
      atCap: true,
      onTogglePinAnnotation: vi.fn()
    })
    expect(screen.getByRole('button', { name: 'Unpin passage' })).not.toBeDisabled()
    vi.restoreAllMocks()
  })
})
