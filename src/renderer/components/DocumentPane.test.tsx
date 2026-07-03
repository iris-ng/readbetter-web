import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Loaded } from '../App'
import type { PlatformAdapter } from '../platform'
import type { PdfParseResult } from '../../core/pdf/liteparse'
import { buildPdfModel } from '../../core/import/pdf'
import { DocumentPane } from './DocumentPane'

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

function loadedPdf(): Loaded {
  const doc = buildPdfModel(parse, 'p.pdf')
  return {
    doc,
    sourcePath: 'documents/p.pdf',
    content: doc.text,
    pdf: { parse, renderPage: vi.fn() }
  }
}

function adapter(sidecar: string | null): PlatformAdapter {
  return {
    readSidecar: vi.fn(async () => sidecar),
    writeSidecar: vi.fn(async () => {}),
    renderPdfPageImage: vi.fn()
  } as unknown as PlatformAdapter
}

const noop = (): void => {}

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
})

describe('DocumentPane PDF ergonomics', () => {
  it('restores page position and accepts typed zoom percentage', async () => {
    const loaded = loadedPdf()
    localStorage.setItem('rb-reading-position', JSON.stringify({ [JSON.stringify(['proj', 'documents/p.pdf'])]: 1 }))

    render(
      <DocumentPane
        loaded={loaded}
        platform={adapter(null)}
        projectId="proj"
        flashRange={null}
        onSendExcerpt={noop}
        searchOpen={false}
        onCloseSearch={noop}
      />
    )

    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled())

    const zoomInput = screen.getByRole('spinbutton', { name: /zoom percentage/i })
    expect(zoomInput).toHaveValue(100)
    fireEvent.change(zoomInput, { target: { value: '150' } })
    expect(zoomInput).toHaveValue(150)
    expect(JSON.parse(localStorage.getItem('rb-pdf-zoom') ?? '{}')).toEqual({ zoom: 1.5 })
    expect(screen.queryByRole('button', { name: /previous page/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: /annotations/i })).not.toBeInTheDocument()
  })
})
