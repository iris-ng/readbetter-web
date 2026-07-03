import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanvasStudio } from './CanvasStudio'
import { CanvasModel } from '../../core/canvas/canvas'

const model: CanvasModel = {
  schemaVersion: 1,
  id: 'a',
  title: 'A',
  viewport: { x: 0, y: 0, zoom: 1 },
  cards: [
    { kind: 'excerpt', id: 'c1', source: 'documents/d.md', anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }, snapshot: 'abc', note: '', x: 10, y: 20 },
    { kind: 'note', id: 'c2', note: 'hello', x: 100, y: 100 }
  ],
  connections: []
}

function noop() {}
const handlers = { onMoveCard: noop, onCreateNote: noop, onSetNote: noop, onCardClick: noop, onSetViewport: noop, onRemoveCard: noop, onResizeCard: noop, onAddConnection: noop, onRemoveConnection: noop, onSetConnectionLabel: noop }

describe('CanvasStudio', () => {
  it('renders excerpt snapshot and note card text', () => {
    render(<CanvasStudio canvas={model} {...handlers} />)
    expect(screen.getByText('abc')).toBeInTheDocument()
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument()
  })

  it('double-clicking empty board requests a note card at board coords', () => {
    const onCreateNote = vi.fn()
    render(<CanvasStudio canvas={model} {...handlers} onCreateNote={onCreateNote} />)
    fireEvent.doubleClick(screen.getByTestId('canvas-board'))
    expect(onCreateNote).toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
  })

  it('double-clicking the transform surface (the real empty-space target) creates a note', () => {
    const onCreateNote = vi.fn()
    render(<CanvasStudio canvas={model} {...handlers} onCreateNote={onCreateNote} />)
    fireEvent.doubleClick(screen.getByTestId('canvas-surface'))
    expect(onCreateNote).toHaveBeenCalled()
  })

  it('clicking an excerpt card body fires onCardClick with its id', () => {
    const onCardClick = vi.fn()
    render(<CanvasStudio canvas={model} {...handlers} onCardClick={onCardClick} />)
    fireEvent.click(screen.getByTestId('card-c1'))
    expect(onCardClick).toHaveBeenCalledWith('c1')
  })

  it('renders a plain connection path (no arrowhead) for each connection', () => {
    const withConn = { ...model, connections: [{ from: 'c1', to: 'c2', label: 'supports' }] }
    render(<CanvasStudio canvas={withConn} {...handlers} />)
    expect(screen.getByTestId('connection-c1-c2')).toBeInTheDocument()
    expect(screen.getByTestId('connection-c1-c2')).not.toHaveAttribute('marker-end') // plain line
    expect(screen.getByText('supports')).toBeInTheDocument()
  })

  // Ports/resize/delete only exist while a card is hovered, so reveal them first.
  const hoverCard = (container: HTMLElement, id: string): void => {
    fireEvent.pointerEnter(container.querySelector(`[data-card-id="${id}"]`) as HTMLElement)
  }

  it('dragging from a port and releasing over another card creates a connection', () => {
    const onAddConnection = vi.fn()
    const { container } = render(<CanvasStudio canvas={model} {...handlers} onAddConnection={onAddConnection} />)
    hoverCard(container, 'c1')
    fireEvent.pointerDown(screen.getByTestId('port-c1-right'))
    // jsdom has no layout; stub the drop hit-test to land on card c2.
    const target = screen.getByTestId('card-c2')
    document.elementFromPoint = (() => target) as typeof document.elementFromPoint
    fireEvent.pointerUp(window)
    expect(onAddConnection).toHaveBeenCalledWith('c1', 'c2')
  })

  it('dropping a port-drag on the source card itself creates no connection', () => {
    const onAddConnection = vi.fn()
    const { container } = render(<CanvasStudio canvas={model} {...handlers} onAddConnection={onAddConnection} />)
    hoverCard(container, 'c1')
    fireEvent.pointerDown(screen.getByTestId('port-c1-right'))
    const self = screen.getByTestId('card-c1')
    document.elementFromPoint = (() => self) as typeof document.elementFromPoint
    fireEvent.pointerUp(window)
    expect(onAddConnection).not.toHaveBeenCalled()
  })

  it('dropping a port-drag on empty board creates no connection', () => {
    const onAddConnection = vi.fn()
    const { container } = render(<CanvasStudio canvas={model} {...handlers} onAddConnection={onAddConnection} />)
    hoverCard(container, 'c1')
    fireEvent.pointerDown(screen.getByTestId('port-c1-right'))
    document.elementFromPoint = (() => null) as typeof document.elementFromPoint
    fireEvent.pointerUp(window)
    expect(onAddConnection).not.toHaveBeenCalled()
  })

  it('dragging the resize handle calls onResizeCard with the new size', () => {
    const onResizeCard = vi.fn()
    const { container } = render(<CanvasStudio canvas={model} {...handlers} onResizeCard={onResizeCard} />)
    hoverCard(container, 'c1')
    fireEvent.pointerDown(screen.getByTestId('resize-c1'))
    fireEvent.pointerMove(window, { clientX: 60, clientY: 40 })
    fireEvent.pointerUp(window)
    expect(onResizeCard).toHaveBeenCalledWith('c1', expect.any(Number), expect.any(Number))
  })

  it('dragging a note card by its move handle moves it', () => {
    const onMoveCard = vi.fn()
    render(<CanvasStudio canvas={model} {...handlers} onMoveCard={onMoveCard} />)
    // The note card (c2) is all textarea, which swallows pointer-down; its move handle is the
    // grabbable surface. Pointer-down there must reach the card-drag gesture.
    fireEvent.pointerDown(screen.getByTitle('Drag to move'))
    fireEvent.pointerMove(window, { clientX: 30, clientY: 40 })
    fireEvent.pointerUp(window)
    expect(onMoveCard).toHaveBeenCalled()
  })

  it('renders a resized card at its explicit width and height', () => {
    const sized = {
      ...model,
      cards: [
        { kind: 'excerpt' as const, id: 'c5', source: 'documents/d.md', anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }, snapshot: 'abc', note: '', x: 0, y: 0, w: 320, h: 200 }
      ],
      connections: []
    }
    render(<CanvasStudio canvas={sized} {...handlers} />)
    expect(screen.getByTestId('card-c5')).toHaveStyle({ width: '320px', height: '200px' })
  })

  it('renders an excerpt card with its highlight color as tint', () => {
    const tintColor = '#fde68a'
    const colorCanvas = {
      ...model,
      cards: [
        { kind: 'excerpt' as const, id: 'c3', source: 'documents/d.md', anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }, snapshot: 'tinted', note: '', x: 10, y: 20, color: tintColor },
      ],
      connections: [],
    }
    render(<CanvasStudio canvas={colorCanvas} {...handlers} />)
    // ExcerptCard carries the full highlight color on the blockquote left edge and a soft
    // color-mix wash of it on the header (readable in both themes, not a garish solid fill).
    const card = screen.getByTestId('card-c3')
    const header = card.querySelector('div[title="Open source"]') as HTMLElement
    const blockquote = card.querySelector('blockquote') as HTMLElement
    expect(blockquote).toHaveStyle({ borderLeft: `3px solid ${tintColor}` })
    expect(header.style.background).toContain('fde68a')
  })

  it('edits a connection label and deletes the connection from the midpoint control', async () => {
    const onSetConnectionLabel = vi.fn()
    const onRemoveConnection = vi.fn()
    const withConn = { ...model, connections: [{ from: 'c1', to: 'c2' }] }
    const user = userEvent.setup()
    render(<CanvasStudio canvas={withConn} {...handlers} onSetConnectionLabel={onSetConnectionLabel} onRemoveConnection={onRemoveConnection} />)
    await user.click(screen.getByRole('button', { name: /edit connection label/i }))
    const input = screen.getByRole('textbox', { name: /connection label/i })
    await user.type(input, 'supports')
    fireEvent.blur(input)
    expect(onSetConnectionLabel).toHaveBeenCalledWith('c1', 'c2', 'supports')
    await user.click(screen.getByRole('button', { name: /delete connection/i }))
    expect(onRemoveConnection).toHaveBeenCalledWith('c1', 'c2')
  })

  it('commits a connection label on Enter', async () => {
    const onSetConnectionLabel = vi.fn()
    const withConn = { ...model, connections: [{ from: 'c1', to: 'c2' }] }
    const user = userEvent.setup()
    render(<CanvasStudio canvas={withConn} {...handlers} onSetConnectionLabel={onSetConnectionLabel} />)
    await user.click(screen.getByRole('button', { name: /edit connection label/i }))
    const input = screen.getByRole('textbox', { name: /connection label/i })
    await user.type(input, 'refutes')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSetConnectionLabel).toHaveBeenCalledWith('c1', 'c2', 'refutes')
  })

  it('clearing a label to whitespace commits an empty label', async () => {
    const onSetConnectionLabel = vi.fn()
    const withConn = { ...model, connections: [{ from: 'c1', to: 'c2', label: 'supports' }] }
    const user = userEvent.setup()
    render(<CanvasStudio canvas={withConn} {...handlers} onSetConnectionLabel={onSetConnectionLabel} />)
    await user.click(screen.getByRole('button', { name: /edit connection label/i }))
    const input = screen.getByRole('textbox', { name: /connection label/i })
    await user.clear(input)
    await user.type(input, '   ')
    fireEvent.blur(input)
    expect(onSetConnectionLabel).toHaveBeenCalledWith('c1', 'c2', '')
  })
})
