import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from './SearchBar'

function setup(over: Partial<React.ComponentProps<typeof SearchBar>> = {}) {
  const props = {
    query: 'the',
    matchCount: 12,
    activeOrdinal: 3,
    onQueryChange: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    ...over
  }
  render(<SearchBar {...props} />)
  return props
}

describe('SearchBar', () => {
  it('shows the ordinal / count', () => {
    setup()
    expect(screen.getByTestId('search-count').textContent).toBe('3 / 12')
  })

  it('shows a no-results state when a non-empty query matches nothing', () => {
    setup({ query: 'zzz', matchCount: 0 })
    expect(screen.getByTestId('search-count').textContent).toBe('0 results')
  })

  it('Enter goes next, Shift+Enter goes prev, Escape closes', () => {
    const p = setup()
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(p.onNext).toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(p.onPrev).toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(p.onClose).toHaveBeenCalled()
  })

  it('next/prev/close buttons fire their handlers', () => {
    const p = setup()
    fireEvent.click(screen.getByLabelText('Next match'))
    fireEvent.click(screen.getByLabelText('Previous match'))
    fireEvent.click(screen.getByLabelText('Close search'))
    expect(p.onNext).toHaveBeenCalled()
    expect(p.onPrev).toHaveBeenCalled()
    expect(p.onClose).toHaveBeenCalled()
  })
})
