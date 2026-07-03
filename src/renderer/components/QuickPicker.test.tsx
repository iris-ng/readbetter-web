import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuickPicker } from './QuickPicker'

const documents = [
  { ref: 'documents/a.md', name: 'Alpha.md', ext: 'md' },
  { ref: 'documents/folder/b.pdf', name: 'Beta.pdf', ext: 'pdf' }
]
const canvases = [{ ref: 'canvases/c.md', name: 'c.md', title: 'Carbon', deleted: false }]

function setup(over: Partial<React.ComponentProps<typeof QuickPicker>> = {}) {
  const props = {
    documents,
    canvases,
    canOpenBeside: false,
    onOpenDocument: vi.fn(),
    onOpenBeside: vi.fn(),
    onOpenCanvas: vi.fn(),
    onNewCanvas: vi.fn(),
    onClose: vi.fn(),
    query: '',
    ...over
  }
  render(<QuickPicker {...props} />)
  return props
}

describe('QuickPicker', () => {
  it('opens a document in a new tab', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: /open in new tab: alpha\.md/i }))
    expect(p.onOpenDocument).toHaveBeenCalledWith('documents/a.md')
  })

  it('opens a canvas and offers New canvas', async () => {
    const p = setup()
    await userEvent.click(screen.getByText('Carbon'))
    expect(p.onOpenCanvas).toHaveBeenCalledWith('canvases/c.md')
    await userEvent.click(screen.getByRole('button', { name: /new canvas/i }))
    expect(p.onNewCanvas).toHaveBeenCalledTimes(1)
  })

  it('filters by search query across doc names, paths, and canvases', () => {
    setup({ query: 'folder' })
    expect(screen.getByText('Beta.pdf')).toBeTruthy()
    expect(screen.getByText('folder/')).toBeTruthy()
    expect(screen.queryByText('Alpha.md')).toBeNull()
  })

  it('disambiguates duplicate document names with folder context', () => {
    setup({
      documents: [
        { ref: 'documents/a/report.pdf', name: 'report.pdf', ext: 'pdf' },
        { ref: 'documents/b/report.pdf', name: 'report.pdf', ext: 'pdf' }
      ],
      canvases: []
    })
    expect(screen.getAllByText('report.pdf')).toHaveLength(2)
    expect(screen.getByText('a/')).toBeTruthy()
    expect(screen.getByText('b/')).toBeTruthy()
  })

  it('shows Beside only when document already loaded', async () => {
    const p = setup({ canOpenBeside: true })
    await userEvent.click(screen.getByRole('button', { name: /open beside: beta\.pdf/i }))
    expect(p.onOpenBeside).toHaveBeenCalledWith('documents/folder/b.pdf')
  })
})
