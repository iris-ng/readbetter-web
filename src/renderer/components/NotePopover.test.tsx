import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotePopover } from './NotePopover'

const annotation = {
  id: 'a1',
  color: '#fde68a',
  note: 'hello',
  range: { start: 0, end: 4 },
  anchor: { start: 0, end: 4, exact: 'test', prefix: '', suffix: '' }
}

describe('NotePopover', () => {
  it('shows the current note text', () => {
    render(
      <NotePopover
        annotation={annotation}
        x={10}
        y={10}
        onSetNote={vi.fn()}
        onSetColor={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        isPinned={false}
        atCap={false}
        onTogglePin={vi.fn()}
      />
    )
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('calls onDelete', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <NotePopover
        annotation={annotation}
        x={10}
        y={10}
        onSetNote={vi.fn()}
        onSetColor={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
        isPinned={false}
        atCap={false}
        onTogglePin={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith('a1')
  })

  it('calls onSetNote when the text changes', async () => {
    const onSetNote = vi.fn()
    const user = userEvent.setup()
    render(
      <NotePopover
        annotation={annotation}
        x={10}
        y={10}
        onSetNote={onSetNote}
        onSetColor={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        isPinned={false}
        atCap={false}
        onTogglePin={vi.fn()}
      />
    )
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'x')
    expect(onSetNote).toHaveBeenCalledWith('a1', 'x')
  })

  it('calls onTogglePin when the pin button is clicked', async () => {
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(
      <NotePopover
        annotation={annotation}
        x={10}
        y={10}
        onSetNote={vi.fn()}
        onSetColor={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        isPinned={false}
        atCap={false}
        onTogglePin={onTogglePin}
      />
    )
    await user.click(screen.getByRole('button', { name: /pin passage/i }))
    expect(onTogglePin).toHaveBeenCalled()
  })

  it('shows Unpin when the passage is pinned', () => {
    render(
      <NotePopover
        annotation={annotation}
        x={10}
        y={10}
        onSetNote={vi.fn()}
        onSetColor={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        isPinned={true}
        atCap={false}
        onTogglePin={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /unpin passage/i })).toHaveTextContent('Unpin')
  })

  it('disables the pin button at cap when not already pinned', () => {
    render(
      <NotePopover
        annotation={annotation}
        x={10}
        y={10}
        onSetNote={vi.fn()}
        onSetColor={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        isPinned={false}
        atCap={true}
        onTogglePin={vi.fn()}
      />
    )
    const btn = screen.getByRole('button', { name: /pin passage/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', '3 pin maximum')
  })
})

describe('NotePopover positioning', () => {
  it('keeps the popover inside the viewport when opened near the edge', () => {
    vi.stubGlobal('innerWidth', 320)
    vi.stubGlobal('innerHeight', 240)

    render(
      <NotePopover
        annotation={annotation}
        x={999}
        y={999}
        onSetNote={vi.fn()}
        onSetColor={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        isPinned={false}
        atCap={false}
        onTogglePin={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Annotation' })).toHaveStyle({
      left: '92px',
      top: '52px'
    })

    vi.unstubAllGlobals()
  })
})

describe('NotePopover link button (C3: retired)', () => {
  // The "Link to…" button and onLink prop were removed in C3 — Connect mode is the only
  // cross-link create path. Verify the button is gone entirely.
  const ann = { id: 'a1', color: '#fde68a', note: '', range: { start: 0, end: 3 }, anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' } }
  const base = { annotation: ann, x: 0, y: 0, onSetNote: vi.fn(), onSetColor: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(), isPinned: false, atCap: false, onTogglePin: vi.fn() }

  it('renders no "Link to…" button (removed in C3)', () => {
    render(<NotePopover {...base} />)
    expect(screen.queryByRole('button', { name: /link to/i })).toBeNull()
  })
})
