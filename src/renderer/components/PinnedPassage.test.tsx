import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PinnedPassage } from './PinnedPassage'

const passage = { text: 'Alpha passage text.', sectionId: 's1', range: { start: 0, end: 19 } }

describe('PinnedPassage', () => {
  it('renders the passage text', () => {
    render(<PinnedPassage passage={passage} onRelease={vi.fn()} />)
    expect(screen.getByText('Alpha passage text.')).toBeInTheDocument()
  })

  it('has the pinned-passage testid', () => {
    render(<PinnedPassage passage={passage} onRelease={vi.fn()} />)
    expect(screen.getByTestId('pinned-passage')).toBeInTheDocument()
  })

  it('calls onRelease when ✕ is clicked', async () => {
    const onRelease = vi.fn()
    const user = userEvent.setup()
    render(<PinnedPassage passage={passage} onRelease={onRelease} />)
    await user.click(screen.getByRole('button', { name: /release pin/i }))
    expect(onRelease).toHaveBeenCalled()
  })
})
