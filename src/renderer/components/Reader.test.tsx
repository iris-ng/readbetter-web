import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Reader } from './Reader'
import { importMarkdown } from '../../core/import/markdown'
import { createAnchor } from '../../core/anchor/anchor'
import { Pin } from '../compare/usePins'
import { PinnedRange } from '../../core/compare/squeeze'
import { Section } from '../../core/model/document'
import { SearchMatch } from '../search/searchMatch'

// No heading -> a preamble section whose text starts at offset 0 (see importMarkdown).
const makeDoc = (text: string): ReturnType<typeof importMarkdown> => importMarkdown(text, 'd.md')

const doc = importMarkdown('# One\nAlpha beta gamma.\n\n## Two\nDelta.', 'd.md')

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const noop = (): void => {}
const baseProps = {
  sourceRef: 'documents/d.md',
  activeIndex: 0,
  annotations: [],
  reattaching: false,
  onCreateRange: noop,
  onSetNote: noop,
  onSetColor: noop,
  onDelete: noop,
  pins: [] as Pin[],
  pinnedRanges: [] as PinnedRange[],
  compareActive: false,
  onReleasePin: noop,
  isPinnedAnnotation: () => false,
  atCap: false,
  onTogglePinAnnotation: noop
}

// Build a Pin over a section's full char span (matches how App pins a passage range).
function pinForSection(text: string, s: Section, id: string): Pin {
  return {
    id,
    anchor: createAnchor(text, s.charStart, s.charEnd),
    resolvedRange: { start: s.charStart, end: s.charEnd },
    sectionId: s.id
  }
}
function rangesOf(pins: Pin[]): PinnedRange[] {
  return pins.map((p) => ({ start: p.resolvedRange.start, end: p.resolvedRange.end, sectionId: p.sectionId, id: p.id }))
}

describe('Reader (annotation-aware)', () => {
  it('renders headings and paragraphs in order', () => {
    render(<Reader doc={doc} {...baseProps} />)
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['One', 'Two'])
    expect(screen.getByText(/Alpha beta gamma\./)).toBeInTheDocument()
  })

  it('double-clicking or right-clicking a highlight sends it to the canvas', () => {
    const start = doc.text.indexOf('Alpha')
    const end = start + 'Alpha beta gamma.'.length
    const ann = {
      id: 'a1',
      color: '#fde68a',
      note: '',
      range: { start, end },
      anchor: createAnchor(doc.text, start, end)
    }
    const onSendExcerpt = vi.fn()
    render(<Reader doc={doc} {...baseProps} annotations={[ann]} onSendExcerpt={onSendExcerpt} />)
    const mark = document.querySelector('[data-annotation-id="a1"]') as HTMLElement
    fireEvent.doubleClick(mark)
    expect(onSendExcerpt).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'documents/d.md', snapshot: 'Alpha beta gamma.' })
    )
    onSendExcerpt.mockClear()
    fireEvent.contextMenu(mark)
    expect(onSendExcerpt).toHaveBeenCalledTimes(1)
  })

  it('marks the active section', () => {
    render(<Reader doc={doc} {...baseProps} activeIndex={1} />)
    expect(screen.getByTestId('section-1-two')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('section-0-one')).toHaveAttribute('data-active', 'false')
  })

  it('renders a highlight as a <mark> over the annotated range', () => {
    const para = doc.sections[0].paragraphs[0]
    const paraStart = doc.text.indexOf(para)
    const start = doc.text.indexOf('beta', paraStart)
    render(
      <Reader
        doc={doc}
        {...baseProps}
        annotations={[
          { id: 'a1', color: 'yellow', note: '', range: { start, end: start + 4 }, anchor: createAnchor(doc.text, start, start + 4) }
        ]}
      />
    )
    const mark = screen.getByText('beta')
    expect(mark.tagName).toBe('MARK')
    expect(mark).toHaveAttribute('data-annotation-id', 'a1')
  })

  it('opens a popover when a highlight is clicked', async () => {
    const para = doc.sections[0].paragraphs[0]
    const paraStart = doc.text.indexOf(para)
    const start = doc.text.indexOf('beta', paraStart)
    const user = userEvent.setup()
    render(
      <Reader
        doc={doc}
        {...baseProps}
        annotations={[
          { id: 'a1', color: '#fde68a', note: 'hi', range: { start, end: start + 4 }, anchor: createAnchor(doc.text, start, start + 4) }
        ]}
      />
    )
    await user.click(screen.getByText('beta'))
    expect(screen.getByRole('dialog', { name: /annotation/i })).toBeInTheDocument()
  })

  it('clicking the popover Pin button toggles the pin for that annotation', async () => {
    const para = doc.sections[0].paragraphs[0]
    const paraStart = doc.text.indexOf(para)
    const start = doc.text.indexOf('beta', paraStart)
    const onTogglePinAnnotation = vi.fn()
    const user = userEvent.setup()
    render(
      <Reader
        doc={doc}
        {...baseProps}
        onTogglePinAnnotation={onTogglePinAnnotation}
        annotations={[
          { id: 'a1', color: '#fde68a', note: '', range: { start, end: start + 4 }, anchor: createAnchor(doc.text, start, start + 4) }
        ]}
      />
    )
    await user.click(screen.getByText('beta'))
    await user.click(screen.getByRole('button', { name: /pin passage/i }))
    expect(onTogglePinAnnotation).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }))
  })

  it('stamps text leaves with data-cs', () => {
    render(<Reader doc={doc} {...baseProps} />)
    const heading = screen.getByRole('heading', { name: 'One' })
    expect(heading).toHaveAttribute('data-cs', String(doc.sections[0].charStart))
  })

  it('captures a dragged DOM rectangle as a region excerpt', () => {
    const onCaptureRegion = vi.fn()
    const { container } = render(
      <Reader doc={doc} {...baseProps} captureRegionMode onCaptureRegion={onCaptureRegion} />
    )
    const article = container.querySelector('article') as HTMLElement
    Object.defineProperties(article, {
      scrollLeft: { configurable: true, value: 0 },
      scrollTop: { configurable: true, value: 0 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollHeight: { configurable: true, value: 800 }
    })
    article.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 500, height: 400, right: 600, bottom: 600 } as DOMRect)
    article.setPointerCapture = vi.fn()
    article.releasePointerCapture = vi.fn()
    const pointer = (type: string, clientX: number, clientY: number): void => {
      const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      fireEvent(article, event)
    }

    pointer('pointerdown', 150, 240)
    pointer('pointermove', 350, 360)
    pointer('pointerup', 350, 360)

    expect(onCaptureRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        regions: [
          expect.objectContaining({
            kind: 'page-rect',
            pageIndex: 0,
            rect: { x: 0.05, y: 0.05, w: 0.2, h: 0.15 }
          })
        ]
      }),
      expect.stringContaining('Alpha')
    )
  })

  it('uses text intersecting the drawn DOM rectangle for the region snapshot', () => {
    const onCaptureRegion = vi.fn()
    const { container } = render(
      <Reader doc={doc} {...baseProps} activeIndex={0} captureRegionMode onCaptureRegion={onCaptureRegion} />
    )
    const article = container.querySelector('article') as HTMLElement
    Object.defineProperties(article, {
      scrollLeft: { configurable: true, value: 0 },
      scrollTop: { configurable: true, value: 0 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollHeight: { configurable: true, value: 800 }
    })
    article.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 500, height: 400, right: 600, bottom: 600 } as DOMRect)
    article.setPointerCapture = vi.fn()
    article.releasePointerCapture = vi.fn()
    ;(screen.getByText('Delta.') as HTMLElement).getBoundingClientRect = () =>
      ({ left: 150, top: 430, width: 80, height: 20, right: 230, bottom: 450 } as DOMRect)
    const pointer = (type: string, clientX: number, clientY: number): void => {
      const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      fireEvent(article, event)
    }

    pointer('pointerdown', 145, 425)
    pointer('pointermove', 235, 455)
    pointer('pointerup', 235, 455)

    expect(onCaptureRegion).toHaveBeenCalledWith(expect.objectContaining({ exact: 'Delta.' }), 'Delta.')
  })

  it('falls back to active section text when a DOM region captures no text leaves', () => {
    const onCaptureRegion = vi.fn()
    const { container } = render(
      <Reader doc={doc} {...baseProps} activeIndex={0} captureRegionMode onCaptureRegion={onCaptureRegion} />
    )
    const article = container.querySelector('article') as HTMLElement
    Object.defineProperties(article, {
      scrollLeft: { configurable: true, value: 0 },
      scrollTop: { configurable: true, value: 0 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollHeight: { configurable: true, value: 800 }
    })
    article.getBoundingClientRect = () =>
      ({ left: 100, top: 200, width: 500, height: 400, right: 600, bottom: 600 } as DOMRect)
    article.setPointerCapture = vi.fn()
    article.releasePointerCapture = vi.fn()
    for (const leaf of Array.from(container.querySelectorAll<HTMLElement>('[data-cs]'))) {
      leaf.getBoundingClientRect = () =>
        ({ left: 700, top: 700, width: 10, height: 10, right: 710, bottom: 710 } as DOMRect)
    }
    const pointer = (type: string, clientX: number, clientY: number): void => {
      const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      fireEvent(article, event)
    }

    pointer('pointerdown', 145, 425)
    pointer('pointermove', 235, 455)
    pointer('pointerup', 235, 455)

    expect(onCaptureRegion).toHaveBeenCalledWith(
      expect.objectContaining({ exact: expect.stringContaining('Alpha beta gamma.') }),
      expect.stringContaining('Alpha beta gamma.')
    )
  })

  it('renders and scrolls a DOM region flash for Canvas back-navigation', () => {
    const { rerender } = render(
      <Reader
        doc={doc}
        {...baseProps}
        flashPageRect={{ pageIndex: 0, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.25 }, nonce: 1 }}
      />
    )
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
    rerender(
      <Reader
        doc={doc}
        {...baseProps}
        flashPageRect={{ pageIndex: 0, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.25 }, nonce: 2 }}
      />
    )
    expect(screen.getByTestId('reader-region-flash')).toBeInTheDocument()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('keeps normal text selection highlight creation when DOM capture is off', () => {
    const onCreateRange = vi.fn()
    const { container } = render(<Reader doc={doc} {...baseProps} onCreateRange={onCreateRange} />)
    const textNode = screen.getByText('Alpha beta gamma.').firstChild as Text
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 5)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.mouseUp(container.querySelector('article') as HTMLElement)

    expect(onCreateRange).toHaveBeenCalledWith({
      start: doc.text.indexOf('Alpha'),
      end: doc.text.indexOf('Alpha') + 5
    })
  })
})

const three = importMarkdown('# One\nAlpha.\n\n## Two\nBeta.\n\n## Three\nGamma.', 'd.md')

describe('Reader compare mode', () => {
  it('folds the document into pinned passages and a gap when two passages are pinned', () => {
    const pins = [
      pinForSection(three.text, three.sections[0], 'p1'),
      pinForSection(three.text, three.sections[2], 'p2')
    ]
    render(
      <Reader doc={three} {...baseProps} pins={pins} pinnedRanges={rangesOf(pins)} compareActive={true} />
    )
    expect(screen.getAllByTestId('pinned-passage')).toHaveLength(2)
    expect(screen.getByTestId('gap-band')).toBeInTheDocument()
    // No section views in compare mode (the body is passages + gaps).
    expect(screen.queryByTestId('section-1-two')).toBeNull()
  })

  it('expands a collapsed gap on click to reveal its text', async () => {
    const pins = [
      pinForSection(three.text, three.sections[0], 'p1'),
      pinForSection(three.text, three.sections[2], 'p2')
    ]
    const user = userEvent.setup()
    render(
      <Reader doc={three} {...baseProps} pins={pins} pinnedRanges={rangesOf(pins)} compareActive={true} />
    )
    await user.click(screen.getByTestId('gap-band'))
    const expanded = screen.getByTestId('gap-band')
    expect(expanded).toHaveAttribute('data-expanded', 'true')
    expect(expanded).toHaveTextContent(/Beta/)
  })

  it('releases the right pin when a passage release control is clicked', async () => {
    const pins = [
      pinForSection(three.text, three.sections[0], 'p1'),
      pinForSection(three.text, three.sections[2], 'p2')
    ]
    const onReleasePin = vi.fn()
    const user = userEvent.setup()
    render(
      <Reader
        doc={three}
        {...baseProps}
        pins={pins}
        pinnedRanges={rangesOf(pins)}
        compareActive={true}
        onReleasePin={onReleasePin}
      />
    )
    const releaseButtons = screen.getAllByRole('button', { name: /release pin/i })
    await user.click(releaseButtons[0])
    expect(onReleasePin).toHaveBeenCalledWith('p1')
  })

  it('shows the AnchorTab at exactly one pin and not at two', () => {
    const onePin = [pinForSection(three.text, three.sections[0], 'p1')]
    const { rerender } = render(
      <Reader doc={three} {...baseProps} pins={onePin} pinnedRanges={rangesOf(onePin)} />
    )
    expect(screen.getByRole('region', { name: /pinned passage/i })).toBeInTheDocument()
    const twoPins = [
      pinForSection(three.text, three.sections[0], 'p1'),
      pinForSection(three.text, three.sections[2], 'p2')
    ]
    rerender(
      <Reader doc={three} {...baseProps} pins={twoPins} pinnedRanges={rangesOf(twoPins)} compareActive={true} />
    )
    expect(screen.queryByRole('region', { name: /pinned passage/i })).toBeNull()
  })

  it('shows the pinned-passage gutter indicator on a section containing a pin (not compare)', () => {
    const onePin = [pinForSection(three.text, three.sections[0], 'p1')]
    const { container } = render(
      <Reader doc={three} {...baseProps} pins={onePin} pinnedRanges={rangesOf(onePin)} />
    )
    expect(container.querySelector('[title="This section contains pinned passages"]')).not.toBeNull()
  })

  it('Escape dismisses an open note popover', async () => {
    const para = doc.sections[0].paragraphs[0]
    const paraStart = doc.text.indexOf(para)
    const start = doc.text.indexOf('beta', paraStart)
    const user = userEvent.setup()
    render(
      <Reader
        doc={doc}
        {...baseProps}
        annotations={[
          { id: 'a1', color: '#fde68a', note: 'hi', range: { start, end: start + 4 }, anchor: createAnchor(doc.text, start, start + 4) }
        ]}
      />
    )
    await user.click(screen.getByText('beta'))
    expect(screen.getByRole('dialog', { name: /annotation/i })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape dismisses an open note popover even when focus is inside the textarea', async () => {
    const para = doc.sections[0].paragraphs[0]
    const paraStart = doc.text.indexOf(para)
    const start = doc.text.indexOf('beta', paraStart)
    const user = userEvent.setup()
    render(
      <Reader
        doc={doc}
        {...baseProps}
        annotations={[
          { id: 'a1', color: '#fde68a', note: 'hi', range: { start, end: start + 4 }, anchor: createAnchor(doc.text, start, start + 4) }
        ]}
      />
    )
    await user.click(screen.getByText('beta'))
    const dialog = screen.getByRole('dialog', { name: /annotation/i })
    expect(dialog).toBeInTheDocument()
    const textarea = dialog.querySelector('textarea')
    if (textarea) await user.click(textarea)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('navigate scrolls the flashed passage into view even when activeIndex is unchanged', () => {
    // This is the CM3 regression test: a navigate to an already-active section must still scroll.
    // Before the fix: no scroll-on-flash effect exists, so after clearing the mount scroll,
    // a flashRange change triggers NO scrollIntoView → RED.
    const start = doc.text.indexOf('Alpha')
    const end = start + 'Alpha beta gamma.'.length
    const flashRange1 = { start, end }

    const { rerender } = render(
      <Reader doc={doc} {...baseProps} activeIndex={0} flashRange={flashRange1} />
    )

    // Clear the mount-time scroll (the [activeIndex] effect fires on mount)
    vi.mocked(Element.prototype.scrollIntoView).mockClear()

    // Re-render with a NEW flashRange object targeting the SAME section (activeIndex still 0).
    // A fresh object ensures the effect refires even though the section index is unchanged.
    const flashRange2 = { start, end }
    rerender(
      <Reader doc={doc} {...baseProps} activeIndex={0} flashRange={flashRange2} />
    )

    // The scroll-on-flash effect must have called scrollIntoView (on the backlink-flash element).
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('does not open the note popover when a highlight is clicked in Compare Mode (read-only)', async () => {
    // In compare mode the body is passages; the pinned passage text contains "Alpha".
    const pins = [
      pinForSection(three.text, three.sections[0], 'p1'),
      pinForSection(three.text, three.sections[2], 'p2')
    ]
    const start = three.text.indexOf('Alpha')
    const user = userEvent.setup()
    render(
      <Reader
        doc={three}
        {...baseProps}
        pins={pins}
        pinnedRanges={rangesOf(pins)}
        compareActive={true}
        annotations={[
          { id: 'a1', color: '#fde68a', note: 'hi', range: { start, end: start + 'Alpha'.length }, anchor: createAnchor(three.text, start, start + 'Alpha'.length) }
        ]}
      />
    )
    // The passage text is plain (no marks rendered in compare mode); clicking it opens nothing.
    await user.click(screen.getByText(/Alpha/))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Reader search', () => {
  it('renders search matches and scrolls the active one into view', () => {
    const scrollSpy = vi.fn()
    // jsdom has no scrollIntoView
    Element.prototype.scrollIntoView = scrollSpy
    const searchDoc = makeDoc('alpha beta alpha') // text starts at offset 0
    const searchMatches: SearchMatch[] = [{ start: 0, end: 5 }, { start: 11, end: 16 }]
    const activeMatch: SearchMatch = { start: 11, end: 16 }
    render(
      <Reader doc={searchDoc} {...baseProps} searchMatches={searchMatches} activeMatch={activeMatch} />
    )
    expect(screen.getAllByTestId('search-match').length + screen.getAllByTestId('search-active').length).toBe(2)
    expect(screen.getByTestId('search-active').textContent).toBe('alpha')
    expect(scrollSpy).toHaveBeenCalled()
  })
})

describe('Reader overlapping annotations', () => {
  it('lets the user choose which overlapping annotation to open', async () => {
    const overlapDoc = makeDoc('alpha beta gamma')
    const start = overlapDoc.text.indexOf('beta')
    const end = start + 'beta'.length
    const annotations = [
      { id: 'a1', color: '#fde68a', note: 'first note', range: { start, end }, anchor: createAnchor(overlapDoc.text, start, end) },
      { id: 'a2', color: '#bfdbfe', note: 'second note', range: { start, end }, anchor: createAnchor(overlapDoc.text, start, end) }
    ]
    const user = userEvent.setup()

    render(<Reader doc={overlapDoc} {...baseProps} annotations={annotations} />)
    await user.click(screen.getByText('beta'))

    expect(screen.getByRole('dialog', { name: /choose annotation/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /first note/i }))
    expect(screen.getByRole('dialog', { name: /^annotation$/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /note/i })).toHaveValue('first note')
  })
})
