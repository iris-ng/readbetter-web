import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import { LibraryCockpit } from './LibraryCockpit'
import { useRecents } from '../hooks/useRecents'

const docs = [
  { ref: 'documents/a.md', name: 'a.md', ext: 'md' },
  { ref: 'documents/b.pdf', name: 'b.pdf', ext: 'pdf' }
]
const canvases = [
  { ref: 'canvases/live.md', name: 'live.md', title: 'Live', deleted: false },
  { ref: 'canvases/gone.md', name: 'gone.md', title: 'Gone', deleted: true }
]

function renderCockpit(over: Partial<React.ComponentProps<typeof LibraryCockpit>> = {}) {
  const { result } = renderHook(() => useRecents())
  const props = {
    documents: docs, canvases, recents: result.current,
    onOpenDocument: vi.fn(), onOpenCanvas: vi.fn(), onNewCanvas: vi.fn(), onRestoreCanvas: vi.fn(),
    ...over
  }
  render(<LibraryCockpit {...props} />)
  return props
}

describe('LibraryCockpit', () => {
  beforeEach(() => localStorage.clear())

  it('lists documents text-forward and opens one on click', async () => {
    const onOpenDocument = vi.fn()
    const user = userEvent.setup()
    renderCockpit({ onOpenDocument })
    const list = screen.getByTestId('library-list')
    await user.click(within(list).getByText(/a\.md/))
    expect(onOpenDocument).toHaveBeenCalledWith('documents/a.md')
    expect(within(list).getAllByText(/MD|PDF/).length).toBeGreaterThan(0) // EXT chip/meta, no leading icon
  })

  it('switches to Canvases, opens one, and offers New canvas', async () => {
    const onOpenCanvas = vi.fn(), onNewCanvas = vi.fn()
    const user = userEvent.setup()
    renderCockpit({ onOpenCanvas, onNewCanvas })
    await user.click(screen.getByRole('tab', { name: /^Canvases/ }))
    const list = screen.getByTestId('canvas-list')
    await user.click(within(list).getByText('Live'))
    expect(onOpenCanvas).toHaveBeenCalledWith('canvases/live.md')
    await user.click(within(list).getByRole('button', { name: /new canvas/i }))
    expect(onNewCanvas).toHaveBeenCalledTimes(1)
  })

  it('switches to Trash and restores a canvas', async () => {
    const onRestoreCanvas = vi.fn()
    const user = userEvent.setup()
    renderCockpit({ onRestoreCanvas })
    await user.click(screen.getByRole('tab', { name: /^Trash/ }))
    await user.click(within(screen.getByTestId('canvas-trash')).getByRole('button', { name: /restore/i }))
    expect(onRestoreCanvas).toHaveBeenCalledWith('canvases/gone.md')
  })

  it('orders documents most-recently-opened first', () => {
    const { result } = renderHook(() => useRecents())
    act(() => { result.current.recordOpen('documents/b.pdf') }) // open b after a → b first
    render(
      <LibraryCockpit
        documents={docs} canvases={[]} recents={result.current}
        onOpenDocument={vi.fn()} onOpenCanvas={vi.fn()} onNewCanvas={vi.fn()} onRestoreCanvas={vi.fn()}
      />
    )
    const items = within(screen.getByTestId('library-list')).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('b.pdf')
  })

  it('filters documents by the search query', async () => {
    const user = userEvent.setup()
    renderCockpit()
    const search = screen.getByRole('textbox', { name: /search documents and canvases/i })
    await user.type(search, 'a.md')
    const list = screen.getByTestId('library-list')
    expect(within(list).queryByText(/a\.md/)).toBeTruthy()
    expect(within(list).queryByText(/b\.pdf/)).toBeNull()
  })

  it('filters documents by relative path and shows folder context for duplicate names', async () => {
    const user = userEvent.setup()
    renderCockpit({
      documents: [
        { ref: 'documents/a/report.pdf', name: 'report.pdf', ext: 'pdf' },
        { ref: 'documents/b/report.pdf', name: 'report.pdf', ext: 'pdf' }
      ]
    })

    expect(screen.getAllByText('report.pdf')).toHaveLength(2)
    expect(screen.getAllByText('a/').length).toBeGreaterThan(0)
    expect(screen.getAllByText('b/').length).toBeGreaterThan(0)

    await user.type(screen.getByRole('textbox', { name: /search documents and canvases/i }), 'documents/b')
    const list = screen.getByTestId('library-list')
    expect(within(list).getAllByText('b/').length).toBeGreaterThan(0)
    expect(within(list).queryByText('a/')).toBeNull()
  })

  it('filters canvases by the search query', async () => {
    const user = userEvent.setup()
    renderCockpit()
    await user.click(screen.getByRole('tab', { name: /^Canvases/ }))
    await user.type(screen.getByRole('textbox', { name: /search documents and canvases/i }), 'live')
    const list = screen.getByTestId('canvas-list')
    expect(within(list).queryByText('Live')).toBeTruthy()
    // (the New-canvas card stays; only existing canvases are filtered)
  })
})
