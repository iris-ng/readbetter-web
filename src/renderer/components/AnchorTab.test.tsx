import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnchorTab } from './AnchorTab'

describe('AnchorTab', () => {
  it('renders the pinned-passage label and the passage text', () => {
    render(<AnchorTab passageText="Alpha passage text." fractions={{ pins: [0], current: 0.5 }} onRelease={vi.fn()} />)
    expect(screen.getByRole('region', { name: /pinned passage/i })).toHaveTextContent('Pinned passage')
    expect(screen.getByText(/Alpha passage text/)).toBeInTheDocument()
  })

  it('positions the pin and current markers from the fractions', () => {
    render(<AnchorTab passageText="Alpha passage text." fractions={{ pins: [0.25], current: 0.75 }} onRelease={vi.fn()} />)
    expect(screen.getByTestId('pos-pin-0')).toHaveStyle({ left: '25%' })
    expect(screen.getByTestId('pos-current')).toHaveStyle({ left: '75%' })
  })

  it('calls onRelease when ✕ is clicked', async () => {
    const onRelease = vi.fn()
    const user = userEvent.setup()
    render(<AnchorTab passageText="Alpha passage text." fractions={{ pins: [0], current: 0 }} onRelease={onRelease} />)
    await user.click(screen.getByRole('button', { name: /release pin/i }))
    expect(onRelease).toHaveBeenCalled()
  })
})
