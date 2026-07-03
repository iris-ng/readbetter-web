import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaneHeader } from './PaneHeader'

describe('PaneHeader', () => {
  it('renders the title and fires onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<PaneHeader title="alpha.md" onClose={onClose} />)
    expect(screen.getByText('alpha.md')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /close pane/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('omits the close control when onClose is absent (satellite header)', () => {
    render(<PaneHeader title="alpha.md" />)
    expect(screen.queryByRole('button', { name: /close pane/i })).toBeNull()
  })

  it('fires onDetach and onTogglePin, and reflects the pinned label', async () => {
    const onDetach = vi.fn(), onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(<PaneHeader title="My Canvas" pinned onDetach={onDetach} onTogglePin={onTogglePin} />)
    await user.click(screen.getByRole('button', { name: /detach pane/i }))
    expect(onDetach).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: /unpin canvas/i })) // pinned => "Unpin"
    expect(onTogglePin).toHaveBeenCalledTimes(1)
  })

  it('renders supplied actions', () => {
    render(<PaneHeader title="My Canvas" actions={<button>Obsidian</button>} />)
    expect(screen.getByRole('button', { name: 'Obsidian' })).toBeTruthy()
  })

  it('renders a search toggle only when onToggleSearch is given, reflecting active state', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<PaneHeader title="Doc" />)
    expect(screen.queryByLabelText('Search this document')).toBeNull()

    rerender(<PaneHeader title="Doc" onToggleSearch={onToggle} searchActive={false} />)
    const btn = screen.getByLabelText('Search this document')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()

    rerender(<PaneHeader title="Doc" onToggleSearch={onToggle} searchActive={true} />)
    expect(screen.getByLabelText('Search this document')).toHaveAttribute('aria-pressed', 'true')
  })
})

// NOTE: the pin affordance's dimmed/lit `opacity` and final copy are COSMETIC and are deferred
// WHOLLY to Plan 3d (overview triage). 3a-1 renders the pin button with NO opacity distinction;
// 3d adds the `opacity: pinned ? 1 : 0.5` styling + its assertion. Do not add a pin-opacity test here.
