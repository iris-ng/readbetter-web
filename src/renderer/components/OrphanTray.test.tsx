import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrphanTray } from './OrphanTray'

const orphan = {
  id: 'a1',
  anchor: { start: 0, end: 4, exact: 'gone', prefix: 'see ', suffix: ' now' },
  color: '#fde68a',
  note: 'keep me'
}

describe('OrphanTray', () => {
  it('renders nothing when there are no orphans', () => {
    const { container } = render(
      <OrphanTray orphans={[]} reattachingId={null} onBeginReattach={vi.fn()} onCancelReattach={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows each orphan with its quote and note', () => {
    render(
      <OrphanTray orphans={[orphan]} reattachingId={null} onBeginReattach={vi.fn()} onCancelReattach={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.getByText(/gone/)).toBeInTheDocument()
    expect(screen.getByText(/keep me/)).toBeInTheDocument()
  })

  it('calls onDismiss', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <OrphanTray orphans={[orphan]} reattachingId={null} onBeginReattach={vi.fn()} onCancelReattach={vi.fn()} onDismiss={onDismiss} />
    )
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledWith('a1')
  })

  it('calls onBeginReattach', async () => {
    const onBeginReattach = vi.fn()
    const user = userEvent.setup()
    render(
      <OrphanTray orphans={[orphan]} reattachingId={null} onBeginReattach={onBeginReattach} onCancelReattach={vi.fn()} onDismiss={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: /re-attach/i }))
    expect(onBeginReattach).toHaveBeenCalledWith('a1')
  })

  it('prompts to select new text while reattaching', () => {
    render(
      <OrphanTray orphans={[orphan]} reattachingId="a1" onBeginReattach={vi.fn()} onCancelReattach={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.getByText(/select.*new/i)).toBeInTheDocument()
  })

  it('marks each orphaned annotation with a warn pill', () => {
    const { container } = render(
      <OrphanTray orphans={[orphan]} reattachingId={null} onBeginReattach={vi.fn()} onCancelReattach={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelector('.rb-pill--warn')).toBeTruthy()
  })
})
