import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SavedViewsBar } from './SavedViewsBar'
import { SavedView } from '../../core/sidecar/sidecar'

const views: SavedView[] = [{ id: 'v1', name: 'A ⇄ B', pinnedAnchors: [] }]
const base = {
  views,
  canSave: false,
  onSave: vi.fn(),
  onRestore: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn()
}

describe('SavedViewsBar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists saved views as chips', () => {
    render(<SavedViewsBar {...base} />)
    expect(screen.getByRole('region', { name: /saved views/i })).toHaveTextContent('A ⇄ B')
  })

  it('restores a view when its chip is clicked', async () => {
    const onRestore = vi.fn()
    const user = userEvent.setup()
    render(<SavedViewsBar {...base} onRestore={onRestore} />)
    await user.click(screen.getByRole('button', { name: 'A ⇄ B' }))
    expect(onRestore).toHaveBeenCalledWith('v1')
  })

  it('disables Save current unless canSave', () => {
    const { rerender } = render(<SavedViewsBar {...base} canSave={false} />)
    expect(screen.getByRole('button', { name: /save current/i })).toBeDisabled()
    rerender(<SavedViewsBar {...base} canSave={true} />)
    expect(screen.getByRole('button', { name: /save current/i })).toBeEnabled()
  })

  it('calls onSave when Save current is clicked', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<SavedViewsBar {...base} canSave={true} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: /save current/i }))
    expect(onSave).toHaveBeenCalled()
  })

  it('deletes a view via its ✕ control', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<SavedViewsBar {...base} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: /delete A ⇄ B/i }))
    expect(onDelete).toHaveBeenCalledWith('v1')
  })

  it('renames a view via the rename button + Enter', async () => {
    const onRename = vi.fn()
    const user = userEvent.setup()
    render(<SavedViewsBar {...base} onRename={onRename} />)
    await user.click(screen.getByRole('button', { name: /rename A ⇄ B/i }))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'Renamed{Enter}')
    expect(onRename).toHaveBeenCalledWith('v1', 'Renamed')
  })

  it('does not restore when entering rename mode', async () => {
    const onRestore = vi.fn()
    const user = userEvent.setup()
    render(<SavedViewsBar {...base} onRestore={onRestore} />)
    await user.click(screen.getByRole('button', { name: /rename A ⇄ B/i }))
    expect(onRestore).not.toHaveBeenCalled()
  })

  it('Escape cancels a rename without calling onRename', async () => {
    const onRename = vi.fn()
    const user = userEvent.setup()
    render(<SavedViewsBar {...base} onRename={onRename} />)
    await user.click(screen.getByRole('button', { name: /rename A ⇄ B/i }))
    await user.type(screen.getByRole('textbox'), 'whatever{Escape}')
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('ignores a blank rename', async () => {
    const onRename = vi.fn()
    const user = userEvent.setup()
    render(<SavedViewsBar {...base} onRename={onRename} />)
    await user.click(screen.getByRole('button', { name: /rename A ⇄ B/i }))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '   {Enter}')
    expect(onRename).not.toHaveBeenCalled()
  })
})
