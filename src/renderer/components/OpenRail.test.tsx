import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OpenRail } from './OpenRail'

// jsdom does not ship PointerEvent; polyfill it as a MouseEvent subclass so that
// fireEvent.pointer* events carry clientX through to native DOM listeners.
if (!('PointerEvent' in globalThis)) {
  ;(globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {}
}

const tabs = [
  { id: '1', kind: 'doc' as const, ref: 'documents/a.md', title: 'a.md' },
  { id: '2', kind: 'canvas' as const, ref: 'canvases/c.md', title: 'C' }
]
const base = {
  tabs, active: { view: 'tab' as const, id: '1' },
  shownIds: ['1'], paneOf: (id: string) => (id === '1' ? 0 : -1),
  onFocusTab: vi.fn(), onAssignPane: vi.fn(), onCloseTab: vi.fn(), onQuickPick: vi.fn(),
  pinned: false, width: 236, onTogglePin: vi.fn(), onSetWidth: vi.fn()
}
const props = (over = {}) => ({ ...base, onFocusTab: vi.fn(), onAssignPane: vi.fn(), onCloseTab: vi.fn(), onTogglePin: vi.fn(), onSetWidth: vi.fn(), ...over })

describe('OpenRail', () => {
  it('marks a shown tab with its pane index; a parked tab as parked', () => {
    render(<OpenRail {...props()} />)
    expect(screen.getByRole('button', { name: 'a.md' })).toHaveAttribute('data-pane-index', '0')
    const parked = screen.getByRole('button', { name: /^C$/ })
    expect(parked).toHaveAttribute('data-parked', 'true')
    expect(parked).not.toHaveAttribute('data-pane-index')
  })

  it('clicking a parked tab assigns it; clicking a shown tab focuses it', async () => {
    const p = props({ shownIds: ['1', '2'], paneOf: (id: string) => (id === '1' ? 0 : 1) })
    const user = userEvent.setup()
    render(<OpenRail {...p} />)
    await user.click(screen.getByRole('button', { name: 'a.md' }))
    expect(p.onFocusTab).toHaveBeenCalledWith('1')

    const q = props({ shownIds: ['1'], paneOf: (id: string) => (id === '1' ? 0 : -1) })
    render(<OpenRail {...q} />)
    // Two renders are in the DOM: p's C button (shown, index 0) and q's C button (parked, index 1).
    // Click q's parked C button (index 1) to test the assign-pane path.
    await user.click(screen.getAllByRole('button', { name: /^C$/ })[1])
    expect(q.onAssignPane).toHaveBeenCalledWith('2')
    expect(q.onFocusTab).not.toHaveBeenCalled()
  })

  it('closes a tab and opens the quick picker', async () => {
    const p = props()
    const user = userEvent.setup()
    render(<OpenRail {...p} />)
    await user.click(screen.getByRole('button', { name: /close a\.md/i }))
    expect(p.onCloseTab).toHaveBeenCalledWith('1')
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(p.onQuickPick).toHaveBeenCalledTimes(1)
  })

  it('pin button reflects state and toggles', async () => {
    const p = props({ pinned: false })
    const user = userEvent.setup()
    const { rerender } = render(<OpenRail {...p} />)
    const pin = screen.getByTestId('rail-pin')
    expect(pin).toHaveAttribute('aria-label', 'Pin the rail open')
    await user.click(pin)
    expect(p.onTogglePin).toHaveBeenCalledTimes(1)
    rerender(<OpenRail {...p} pinned />)
    expect(screen.getByTestId('rail-pin')).toHaveAttribute('aria-label', 'Unpin the rail')
    expect(screen.getByTestId('open-rail')).toHaveAttribute('data-pinned', 'true')
  })

  it('sets the width CSS variable from the width prop', () => {
    render(<OpenRail {...props({ width: 300 })} />)
    expect(screen.getByTestId('open-rail').style.getPropertyValue('--rb-rail-w')).toBe('300px')
  })

  it('dragging the resizer reports a clamped width', () => {
    const p = props()
    render(<OpenRail {...p} />)
    const r = screen.getByTestId('rail-resizer')
    // jsdom: getBoundingClientRect on the workspace ancestor is 0; clientX maps directly to width.
    fireEvent.pointerDown(r, { pointerId: 1, clientX: 236 })
    fireEvent.pointerMove(r, { pointerId: 1, clientX: 320 })
    fireEvent.pointerUp(r, { pointerId: 1, clientX: 320 })
    expect(p.onSetWidth).toHaveBeenCalled()
    const last = p.onSetWidth.mock.calls.at(-1)![0]
    expect(last).toBeGreaterThanOrEqual(180)
    expect(last).toBeLessThanOrEqual(460)
  })
})
