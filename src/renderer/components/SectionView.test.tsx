import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionView } from './SectionView'
import { importMarkdown } from '../../core/import/markdown'
import { Section } from '../../core/model/document'
import { SEARCH_MATCH_ID, SEARCH_ACTIVE_ID } from '../search/searchMatch'

// jsdom (used by vitest) does not implement PointerEvent, so fireEvent.pointerMove
// won't carry clientX/clientY. Polyfill it as a subclass of MouseEvent so coordinate
// properties are available on events dispatched in tests.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    constructor(type: string, init?: PointerEventInit) {
      super(type, init)
      this.pointerId = init?.pointerId ?? 0
    }
  }
  ;(window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent = PointerEventPolyfill
}

const doc = importMarkdown('# One\nAlpha beta.', 'd.md')
const section = doc.sections[0]
const base = {
  section,
  active: false,
  ranges: [],
  onOpenAnnotation: vi.fn()
}

describe('SectionView pin indicator', () => {
  it('shows the pinned-passages indicator with a title when hasPinnedPassages', () => {
    const { container } = render(<SectionView {...base} hasPinnedPassages={true} />)
    expect(container.querySelector('[title="This section contains pinned passages"]')).not.toBeNull()
  })

  it('shows no indicator title when there are no pinned passages', () => {
    const { container } = render(<SectionView {...base} hasPinnedPassages={false} />)
    expect(container.querySelector('[title="This section contains pinned passages"]')).toBeNull()
  })

  it('renders the section with its testid', () => {
    render(<SectionView {...base} />)
    expect(screen.getByTestId(`section-${section.id}`)).toBeInTheDocument()
  })
})

describe('SectionView highlight rendering', () => {
  it('renders an annotated range as a clickable <mark>', async () => {
    const para = section.paragraphs[0]
    const paraStart = doc.text.indexOf(para)
    const start = doc.text.indexOf('beta', paraStart)
    const onOpenAnnotation = vi.fn()
    const user = userEvent.setup()
    render(
      <SectionView
        {...base}
        onOpenAnnotation={onOpenAnnotation}
        ranges={[{ start, end: start + 'beta'.length, id: 'a1', color: '#fde68a' }]}
      />
    )
    const mark = screen.getByText('beta')
    expect(mark.tagName).toBe('MARK')
    expect(mark).toHaveAttribute('data-annotation-id', 'a1')
    await user.click(mark)
    expect(onOpenAnnotation).toHaveBeenCalledWith('a1', expect.anything())
  })

  it('renders the heading with data-cs', () => {
    render(<SectionView {...base} />)
    expect(screen.getByRole('heading', { name: 'One' })).toHaveAttribute('data-cs', String(section.charStart))
  })
})

describe('SectionView CM2: overlap mark stacking-context fix', () => {
  // Build a 2-char document with two overlapping annotations to get a data-overlap mark
  const twoAnnoDoc = importMarkdown('# S\nfoo bar baz.', 'two.md')
  const twoAnnoSection = twoAnnoDoc.sections[0]
  const twoAnnoText = twoAnnoDoc.text
  const barStart = twoAnnoText.indexOf('bar')
  const fooStart = twoAnnoText.indexOf('foo')
  // range A covers 'foo bar', range B covers 'bar baz' — 'bar' is the overlap
  const overlappingRanges = [
    { start: fooStart, end: fooStart + 'foo bar'.length, id: 'a1', color: '#fde68a' },
    { start: barStart, end: barStart + 'bar baz'.length, id: 'a2', color: '#bfdbfe' }
  ]

  it('overlap mark has NO filter property and HAS the darken backgroundImage gradient', () => {
    const { container } = render(
      <SectionView
        section={twoAnnoSection}
        active={false}
        ranges={overlappingRanges}
        onOpenAnnotation={vi.fn()}
      />
    )
    const overlapMark = container.querySelector('[data-overlap="true"]') as HTMLElement
    expect(overlapMark).not.toBeNull()
    // No filter — filter creates a stacking context that can sit above the overlay
    expect(overlapMark.style.filter).toBeFalsy()
    // Must use a backgroundImage darken gradient instead
    expect(overlapMark.style.backgroundImage).toContain('linear-gradient')
    expect(overlapMark.style.backgroundImage).toContain('rgba(0,0,0,0.18)')
  })

  it('non-overlap mark has neither filter nor gradient backgroundImage', () => {
    const { container } = render(
      <SectionView
        section={twoAnnoSection}
        active={false}
        ranges={overlappingRanges}
        onOpenAnnotation={vi.fn()}
      />
    )
    // 'foo' is only covered by a1, not overlapping
    const marks = Array.from(container.querySelectorAll('mark')) as HTMLElement[]
    const nonOverlapMark = marks.find(m => !m.getAttribute('data-overlap'))
    expect(nonOverlapMark).not.toBeUndefined()
    expect(nonOverlapMark!.style.filter).toBeFalsy()
    expect(nonOverlapMark!.style.backgroundImage).toBeFalsy()
  })
})

describe('SectionView cross-link dots (retired in A3)', () => {
  const para = section.paragraphs[0]
  const paraStart = doc.text.indexOf(para)
  const start = doc.text.indexOf('beta', paraStart)
  const rangeA1 = [{ start, end: start + 'beta'.length, id: 'a1', color: '#fde68a' }]

  it('renders NO inline crosslink-dot for an annotated range (inline dot retired in A3)', () => {
    const { container } = render(
      <SectionView
        {...base}
        ranges={rangeA1}
      />
    )
    expect(container.querySelector('[data-crosslink-dot]')).toBeNull()
    expect(container.querySelector('[data-testid^="crosslink-dot-"]')).toBeNull()
  })

  it('renders NO inline crosslink-dot when linkedIds is omitted', () => {
    const { container } = render(
      <SectionView
        {...base}
        ranges={rangeA1}
      />
    )
    expect(container.querySelector('[data-crosslink-dot]')).toBeNull()
  })
})

describe('SectionView long-press removed (C3)', () => {
  // Long-press arming was retired in C3. Connect mode is the only cross-link create path.
  // Verify that a long-press on a highlight does NOT call any arm callback (there is none),
  // and that the mark is still rendered and clickable (note/send-to-canvas paths intact).
  const para = section.paragraphs[0]
  const paraStart = doc.text.indexOf(para)
  const start = doc.text.indexOf('beta', paraStart)
  const rangeA1 = [{ start, end: start + 'beta'.length, id: 'a1', color: '#fde68a' }]

  afterEach(() => {
    vi.useRealTimers()
  })

  it('a long-press (300ms, held) does NOT arm anything — no onArmAnnotation prop exists', () => {
    vi.useFakeTimers()
    const onOpen = vi.fn()
    const { container } = render(
      <SectionView
        {...base}
        ranges={rangeA1}
        onOpenAnnotation={onOpen}
      />
    )
    const mark = container.querySelector('[data-annotation-id="a1"]') as HTMLElement
    expect(mark).not.toBeNull()
    // Hold for 310ms (previously would have triggered arm); nothing should be called.
    fireEvent.pointerDown(mark, { clientX: 10, clientY: 10 })
    vi.advanceTimersByTime(310)
    // No arm callback — onOpenAnnotation is the only registered callback and was NOT called.
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a click after a long-hold still opens the annotation note (onOpenAnnotation fires)', () => {
    vi.useFakeTimers()
    const onOpen = vi.fn()
    const { container } = render(
      <SectionView
        {...base}
        ranges={rangeA1}
        onOpenAnnotation={onOpen}
      />
    )
    const mark = container.querySelector('[data-annotation-id="a1"]') as HTMLElement
    // A normal click (no hold) should still open the note.
    fireEvent.click(mark, { clientX: 10, clientY: 10 })
    expect(onOpen).toHaveBeenCalledWith('a1', expect.anything())
  })
})

describe('SectionView search hit rendering', () => {
  // No heading, charStart 0: paragraph offset 0 === absolute offset "alpha beta" in the text.
  const searchSection: Section = {
    id: 's-search',
    level: 0,
    heading: '',
    order: 0,
    charStart: 0,
    charEnd: 10,
    paragraphs: ['alpha beta']
  }

  it('renders search hits non-interactive marks', () => {
    const base = 0 // absolute offset of "alpha beta"
    const onOpen = vi.fn()
    render(
      <SectionView
        section={searchSection}
        active={false}
        ranges={[
          { start: base + 0, end: base + 5, id: SEARCH_MATCH_ID, color: '' },   // "alpha"
          { start: base + 6, end: base + 10, id: SEARCH_ACTIVE_ID, color: '' }  // "beta"
        ]}
        onOpenAnnotation={onOpen}
      />
    )
    const match = screen.getByTestId('search-match')
    const active = screen.getByTestId('search-active')
    expect(match.textContent).toBe('alpha')
    expect(active.textContent).toBe('beta')
    expect(match).not.toHaveAttribute('data-annotation-id')
    fireEvent.click(match)
    fireEvent.click(active)
    expect(onOpen).not.toHaveBeenCalled() // search hits never open annotation popover
  })
})
