import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GapBand } from './GapBand'
import { PinnedRange } from '../../core/compare/squeeze'

const documentText = 'Alpha beta gamma. Delta epsilon zeta.'
// Two unpinned ranges within the gap.
const ranges: PinnedRange[] = [
  { start: 0, end: 17, sectionId: '0-one' },
  { start: 18, end: 37, sectionId: '1-two' }
]

describe('GapBand', () => {
  it('shows a collapsed summary with the hidden character count', () => {
    // 17 + 19 chars across the two ranges = 36.
    render(<GapBand ranges={ranges} documentText={documentText} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByTestId('gap-band')).toHaveTextContent(/36 characters hidden/i)
    expect(screen.getByTestId('gap-band')).toHaveTextContent(/expand/i)
  })

  it('counts a single-range gap by its character span', () => {
    render(<GapBand ranges={[ranges[0]]} documentText={documentText} expanded={false} onToggle={vi.fn()} />)
    expect(screen.getByTestId('gap-band')).toHaveTextContent(/17 characters hidden/i)
  })

  it('keeps the gap-band testid when expanded (stable across collapse/expand)', () => {
    render(<GapBand ranges={ranges} documentText={documentText} expanded={true} onToggle={vi.fn()} />)
    expect(screen.getByTestId('gap-band')).toHaveAttribute('data-expanded', 'true')
  })

  it('calls onToggle when the collapsed band is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<GapBand ranges={ranges} documentText={documentText} expanded={false} onToggle={onToggle} />)
    await user.click(screen.getByTestId('gap-band'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('renders each range as raw text when expanded', () => {
    render(<GapBand ranges={ranges} documentText={documentText} expanded={true} onToggle={vi.fn()} />)
    expect(screen.getByTestId('gap-range-0')).toHaveTextContent('Alpha beta gamma.')
    expect(screen.getByTestId('gap-range-18')).toHaveTextContent('Delta epsilon zeta.')
  })

  it('fires onToggle from the expanded collapse control', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<GapBand ranges={ranges} documentText={documentText} expanded={true} onToggle={onToggle} />)
    await user.click(screen.getByRole('button', { name: /collapse/i }))
    expect(onToggle).toHaveBeenCalled()
  })

  it('renders nothing for an empty gap', () => {
    const { container } = render(
      <GapBand ranges={[]} documentText={documentText} expanded={false} onToggle={vi.fn()} />
    )
    expect(container.querySelector('[data-testid="gap-band"]')).toBeNull()
  })
})
