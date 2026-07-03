import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Loaded } from '../App'
import type { PlatformAdapter } from '../platform'
import { importMarkdown } from '../../core/import/markdown'
import { buildPdfModel } from '../../core/import/pdf'
import type { PdfParseResult } from '../../core/pdf/liteparse'
import type { DocPaneBodyProps } from './DocPaneBody'

// A mutable, hoisted flag lets one test opt into the REAL DocumentPane (to exercise the actual
// search wiring end-to-end) while every other test keeps the lightweight stub below.
const mockState = vi.hoisted(() => ({ useReal: false }))

const seen: { props?: Record<string, unknown> } = {}
vi.mock('./DocumentPane', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./DocumentPane')>()
  const Real = actual.DocumentPane
  return {
    DocumentPane: (props: Record<string, unknown>) => {
      if (mockState.useReal) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return <Real {...(props as any)} />
      }
      seen.props = props
      return <div data-testid="doc-pane-stub" />
    }
  }
})

import { DocPaneBody } from './DocPaneBody'

/** Builds a minimal clean-DOM `Loaded` from raw markdown text (no heading, so `doc.text` equals
 *  the raw text verbatim — see importMarkdown's preamble-section behavior). */
function makeLoadedDoc(text: string): Loaded {
  return {
    doc: importMarkdown(text, 'd.md'),
    sourcePath: 'd.md',
    content: text,
    pdf: null
  }
}

/** Builds a minimal single-page PDF `Loaded` whose one run holds `text` verbatim, so
 *  `buildPdfModel`'s `doc.text` and `buildPdfRunIndex`'s run char-offsets stay aligned (proven
 *  identical by pdfLayout.test.ts) — a search match on `text` resolves to real page quads. */
function makeLoadedPdf(text: string): Loaded {
  const parse: PdfParseResult = {
    pages: [{ index: 0, width: 600, height: 800 }],
    runs: [{ pageIndex: 0, text, x: 10, y: 20, w: 200, h: 12, ocr: false }],
    scanned: false
  }
  return {
    doc: buildPdfModel(parse, 'p.pdf'),
    sourcePath: 'documents/p.pdf',
    content: '',
    pdf: { parse, renderPage: vi.fn() }
  }
}

const baseProps: DocPaneBodyProps = {
  loaded: { sourcePath: 'documents/a.md' } as unknown as Loaded,
  tabId: 'tab-1',
  platform: {
    readSidecar: vi.fn().mockResolvedValue(null),
    writeSidecar: vi.fn().mockResolvedValue(undefined)
  } as unknown as PlatformAdapter,
  projectId: 'proj',
  flashRange: null,
  connectionJump: null,
  connectMode: false,
  onConnectPick: vi.fn(),
  onSendExcerpt: vi.fn(),
  onAnnotationsResolved: vi.fn(),
  onLinksResolved: vi.fn(),
  onRestoreNote: vi.fn(),
  registerPane: vi.fn(),
  unregisterPane: vi.fn(),
  searchOpen: false,
  onCloseSearch: vi.fn()
}

describe('DocPaneBody', () => {
  beforeEach(() => {
    // jsdom has no layout engine; the real Reader (mounted below for the search test) calls
    // this on scroll-to-active-section effects (mirrors Reader.test.tsx's own setup).
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('forwards its wiring through to DocumentPane', () => {
    const onConnectPick = vi.fn()
    const registerPane = vi.fn()
    const { getByTestId } = render(
      <DocPaneBody {...baseProps} onConnectPick={onConnectPick} registerPane={registerPane} />
    )
    expect(getByTestId('doc-pane-stub')).toBeTruthy()
    expect(seen.props?.projectId).toBe('proj')
    expect(seen.props?.connectMode).toBe(false)
    expect(seen.props?.onConnectPick).toBe(onConnectPick)
    expect(seen.props?.registerPane).toBe(registerPane)
  })

  it('shows the SearchBar and highlights matches only when searchOpen', async () => {
    mockState.useReal = true
    try {
      const loaded = makeLoadedDoc('gamma delta gamma')
      const { rerender } = render(
        <DocPaneBody {...baseProps} loaded={loaded} searchOpen={false} onCloseSearch={vi.fn()} />
      )
      // Flush the real DocumentPane's async sidecar-load microtask before asserting.
      await act(async () => {})
      expect(screen.queryByTestId('search-bar')).toBeNull()

      rerender(<DocPaneBody {...baseProps} loaded={loaded} searchOpen={true} onCloseSearch={vi.fn()} />)
      const input = screen.getByLabelText('Search this document')
      fireEvent.change(input, { target: { value: 'gamma' } })
      expect(screen.getByTestId('search-count').textContent).toBe('1 / 2')
      // The active match and the other match are both rendered.
      expect(
        screen.getAllByTestId('search-match').length + screen.getAllByTestId('search-active').length
      ).toBe(2)
    } finally {
      mockState.useReal = false
    }
  })

  it('highlights search matches in a PDF pane', async () => {
    mockState.useReal = true
    try {
      const loaded = makeLoadedPdf('foo bar baz')
      render(<DocPaneBody {...baseProps} loaded={loaded} searchOpen={true} onCloseSearch={vi.fn()} />)
      // Flush the real DocumentPane's async sidecar-load microtask before asserting.
      await act(async () => {})
      fireEvent.change(screen.getByLabelText('Search this document'), { target: { value: 'bar' } })
      expect(screen.getAllByTestId('pdf-highlight').length).toBeGreaterThan(0)
    } finally {
      mockState.useReal = false
    }
  })
})
