import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LinkLayer } from './LinkLayer'

const links = [{ id: 'k1', from: { x: 10, y: 20 }, to: { x: 80, y: 60 } }]

describe('LinkLayer', () => {
  it('renders an arc and two dots per link', () => {
    render(<LinkLayer links={links} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByTestId('link-arc-k1')).toBeInTheDocument()
    expect(screen.getByTestId('link-dot-k1-from')).toBeInTheDocument()
    expect(screen.getByTestId('link-dot-k1-to')).toBeInTheDocument()
  })
  it('clicking the from-dot navigates to the to end (and selects)', () => {
    const onNavigate = vi.fn(); const onSelect = vi.fn()
    render(<LinkLayer links={links} selectedId={null} onNavigate={onNavigate} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('link-dot-k1-from'))
    expect(onNavigate).toHaveBeenCalledWith('k1', 'to')
    expect(onSelect).toHaveBeenCalledWith('k1')
  })
  it('clicking the to-dot navigates to the from end', () => {
    const onNavigate = vi.fn()
    render(<LinkLayer links={links} selectedId={null} onNavigate={onNavigate} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByTestId('link-dot-k1-to'))
    expect(onNavigate).toHaveBeenCalledWith('k1', 'from')
  })
  it('clicking the arc calls onNavigate with "both" to align both panes', () => {
    const onNavigate = vi.fn()
    render(<LinkLayer links={links} selectedId={null} onNavigate={onNavigate} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByTestId('link-arc-k1'), { clientX: 12, clientY: 22 })
    expect(onNavigate).toHaveBeenCalledWith('k1', 'both')
  })
  it('right-click requests remove with the click position', () => {
    const onRemoveRequest = vi.fn()
    render(<LinkLayer links={links} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} onRemoveRequest={onRemoveRequest} />)
    fireEvent.contextMenu(screen.getByTestId('link-dot-k1-from'), { clientX: 10, clientY: 20 })
    expect(onRemoveRequest).toHaveBeenCalledWith('k1', expect.objectContaining({ clientX: 10, clientY: 20 }))
  })
  it('marks the selected link', () => {
    render(<LinkLayer links={links} selectedId="k1" onNavigate={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByTestId('link-arc-k1')).toHaveAttribute('data-selected', 'true')
  })
  it('renders nothing for an empty list', () => {
    render(<LinkLayer links={[]} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByTestId(/^link-(arc|dot)-/)).toBeNull()
  })

  // AM2: per-endpoint nullability
  it('from-only: renders from-dot but no to-dot and no arc', () => {
    const partial = [{ id: 'k1', from: { x: 10, y: 20 }, to: null }]
    render(<LinkLayer links={partial} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByTestId('link-dot-k1-from')).toBeInTheDocument()
    expect(screen.queryByTestId('link-dot-k1-to')).toBeNull()
    expect(screen.queryByTestId('link-arc-k1')).toBeNull()
  })

  it('to-only: renders to-dot but no from-dot and no arc', () => {
    const partial = [{ id: 'k1', from: null, to: { x: 80, y: 60 } }]
    render(<LinkLayer links={partial} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByTestId('link-dot-k1-to')).toBeInTheDocument()
    expect(screen.queryByTestId('link-dot-k1-from')).toBeNull()
    expect(screen.queryByTestId('link-arc-k1')).toBeNull()
  })

  it('clicking the lone from-dot (to:null) navigates to the to end', () => {
    const onNavigate = vi.fn(); const onSelect = vi.fn()
    const partial = [{ id: 'k1', from: { x: 10, y: 20 }, to: null }]
    render(<LinkLayer links={partial} selectedId={null} onNavigate={onNavigate} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('link-dot-k1-from'))
    expect(onNavigate).toHaveBeenCalledWith('k1', 'to')
    expect(onSelect).toHaveBeenCalledWith('k1')
  })

  it('clicking the lone to-dot (from:null) navigates to the from end', () => {
    const onNavigate = vi.fn(); const onSelect = vi.fn()
    const partial = [{ id: 'k1', from: null, to: { x: 80, y: 60 } }]
    render(<LinkLayer links={partial} selectedId={null} onNavigate={onNavigate} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('link-dot-k1-to'))
    expect(onNavigate).toHaveBeenCalledWith('k1', 'from')
    expect(onSelect).toHaveBeenCalledWith('k1')
  })

  // AM3: arc hover thickens
  it('mouseEnter on arc sets data-hovered="true"; mouseLeave clears it', () => {
    render(<LinkLayer links={links} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} />)
    const arc = screen.getByTestId('link-arc-k1')
    fireEvent.mouseEnter(arc)
    expect(arc).toHaveAttribute('data-hovered', 'true')
    fireEvent.mouseLeave(arc)
    expect(arc).not.toHaveAttribute('data-hovered', 'true')
  })

  // CM2: overlay svg must be reliably the topmost hit-target (z-index 11) above the panes
  it('CM2: svg overlay has zIndex 11 to sit above the pane content', () => {
    const { container } = render(
      <LinkLayer links={links} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} />
    )
    const svg = container.querySelector('[data-testid="link-layer"]') as HTMLElement
    expect(svg).not.toBeNull()
    expect(svg.style.zIndex).toBe('11')
  })

  // CM1: dots must paint above all arc hit-paths (two-pass render order)
  it('with ≥2 full links, all arc elements precede all dot elements in DOM order', () => {
    const twoLinks = [
      { id: 'k1', from: { x: 10, y: 20 }, to: { x: 80, y: 60 } },
      { id: 'k2', from: { x: 20, y: 30 }, to: { x: 90, y: 70 } }
    ]
    const { container } = render(
      <LinkLayer links={twoLinks} selectedId={null} onNavigate={vi.fn()} onSelect={vi.fn()} />
    )
    const arcAndDotEls = Array.from(
      container.querySelectorAll('[data-testid^="link-arc-"], [data-testid^="link-dot-"]')
    )
    const lastArcIdx = arcAndDotEls.reduce(
      (acc, el, idx) => (el.getAttribute('data-testid')?.startsWith('link-arc-') ? idx : acc),
      -1
    )
    const firstDotIdx = arcAndDotEls.findIndex(el =>
      el.getAttribute('data-testid')?.startsWith('link-dot-')
    )
    expect(lastArcIdx).toBeGreaterThanOrEqual(0)
    expect(firstDotIdx).toBeGreaterThanOrEqual(0)
    expect(lastArcIdx).toBeLessThan(firstDotIdx)
  })
})
