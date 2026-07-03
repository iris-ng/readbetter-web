import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardFrame } from './CardFrame'

const handlers = { onStartConnect: vi.fn(), onResizeStart: vi.fn(), onDelete: vi.fn(), registerRef: () => {} }

describe('CardFrame', () => {
  it('reveals four ports, a resize handle and a delete control only while hovered', () => {
    const { container } = render(
      <CardFrame id="c1" {...handlers}>
        <div>card body</div>
      </CardFrame>
    )
    const root = container.querySelector('[data-card-id="c1"]') as HTMLElement
    // The body is always present; the affordances are hidden until hover (a clean card at rest).
    expect(screen.getByText('card body')).toBeInTheDocument()
    expect(screen.queryByTestId('port-c1-top')).toBeNull()
    expect(screen.queryByTestId('resize-c1')).toBeNull()
    expect(screen.queryByRole('button', { name: /delete card/i })).toBeNull()

    fireEvent.pointerEnter(root)
    expect(screen.getByTestId('port-c1-top')).toBeInTheDocument()
    expect(screen.getByTestId('port-c1-right')).toBeInTheDocument()
    expect(screen.getByTestId('port-c1-bottom')).toBeInTheDocument()
    expect(screen.getByTestId('port-c1-left')).toBeInTheDocument()
    expect(screen.getByTestId('resize-c1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete card/i })).toBeInTheDocument()

    fireEvent.pointerLeave(root)
    expect(screen.queryByTestId('port-c1-top')).toBeNull()
  })

  it('delete fires onDelete; a port pointer-down fires onStartConnect with its side', () => {
    const onDelete = vi.fn()
    const onStartConnect = vi.fn()
    const { container } = render(
      <CardFrame id="c1" {...handlers} onDelete={onDelete} onStartConnect={onStartConnect}>
        <div>body</div>
      </CardFrame>
    )
    fireEvent.pointerEnter(container.querySelector('[data-card-id="c1"]') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: /delete card/i }))
    expect(onDelete).toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByTestId('port-c1-right'))
    expect(onStartConnect).toHaveBeenCalledWith('right', expect.anything())
  })
})
