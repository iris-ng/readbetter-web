import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollapsibleControl } from './CollapsibleControl'

describe('CollapsibleControl', () => {
  it('shows the label when expanded and keeps it accessible', () => {
    render(<CollapsibleControl collapsed={false} icon="search" label="Search" />)
    const btn = screen.getByRole('button', { name: 'Search' })
    expect(btn).toHaveTextContent('Search')
    expect(btn).toHaveAttribute('title', 'Search')
  })

  it('hides the text but keeps name + title when collapsed', () => {
    render(<CollapsibleControl collapsed icon="search" label="Search" />)
    const btn = screen.getByRole('button', { name: 'Search' }) // aria-label still resolves it
    expect(btn).not.toHaveTextContent('Search')
    expect(btn).toHaveAttribute('aria-label', 'Search')
    expect(btn).toHaveAttribute('title', 'Search')
  })

  it('forwards onClick and button props', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<CollapsibleControl collapsed={false} icon="trash" label="Delete" onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
