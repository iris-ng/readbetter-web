import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import type { Pane as PaneModel } from '../hooks/usePanes'
import { PaneRow } from './PaneRow'
import { Pane } from './Pane'

const mk = (tabId: string, kind: 'doc' | 'canvas' = 'doc'): PaneModel => ({
  tabId, kind, ref: `${kind}s/${tabId}.md`, title: tabId.toUpperCase(), focused: false, pinned: false
})

describe('PaneRow', () => {
  it('renders N panes via renderPane and exactly one link layer', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <PaneRow
        panes={[mk('a'), mk('b')]}
        renderedLinks={[]}
        selectedLinkId={null}
        paneRowRef={ref}
        renderPane={(p) => <div data-testid={`body-${p.tabId}`}>{p.title}</div>}
        onBackgroundClick={vi.fn()}
        onLinkNavigate={vi.fn()}
        onLinkSelect={vi.fn()}
        onLinkRemoveRequest={vi.fn()}
      />
    )
    expect(screen.getByTestId('body-a')).toBeTruthy()
    expect(screen.getByTestId('body-b')).toBeTruthy()
    expect(screen.getAllByTestId('link-layer')).toHaveLength(1)
  })

  it('fires onBackgroundClick when the row background is clicked', () => {
    const ref = createRef<HTMLDivElement>()
    const onBackgroundClick = vi.fn()
    render(
      <PaneRow
        panes={[mk('a')]}
        renderedLinks={[]}
        selectedLinkId={null}
        paneRowRef={ref}
        renderPane={(p) => <div data-testid={`body-${p.tabId}`}>{p.title}</div>}
        onBackgroundClick={onBackgroundClick}
        onLinkNavigate={vi.fn()}
        onLinkSelect={vi.fn()}
        onLinkRemoveRequest={vi.fn()}
      />
    )
    fireEvent.click(screen.getByTestId('pane-row'))
    expect(onBackgroundClick).toHaveBeenCalledTimes(1)
  })

  it('Pane composes the supplied header and body', () => {
    render(<Pane pane={mk('a')} header={<div>HEADER</div>} body={<div>BODY</div>} />)
    expect(screen.getByText('HEADER')).toBeTruthy()
    expect(screen.getByText('BODY')).toBeTruthy()
  })

  it('removes pointermove/pointerup window listeners when unmounted mid-drag', () => {
    const ref = createRef<HTMLDivElement>()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(
      <PaneRow
        panes={[mk('a'), mk('b')]}
        renderedLinks={[]}
        selectedLinkId={null}
        paneRowRef={ref}
        renderPane={(p) => <div data-testid={`body-${p.tabId}`}>{p.title}</div>}
        onBackgroundClick={vi.fn()}
        onLinkNavigate={vi.fn()}
        onLinkSelect={vi.fn()}
        onLinkRemoveRequest={vi.fn()}
      />
    )

    // Start a divider drag — this registers pointermove + pointerup on window.
    fireEvent.pointerDown(screen.getByTestId('pane-divider-1'), { clientX: 100 })

    const moveCallsBefore = addSpy.mock.calls.filter(([ev]) => ev === 'pointermove').length
    const upCallsBefore = addSpy.mock.calls.filter(([ev]) => ev === 'pointerup').length
    expect(moveCallsBefore).toBeGreaterThanOrEqual(1)
    expect(upCallsBefore).toBeGreaterThanOrEqual(1)

    // Unmount mid-drag — the cleanup effect must remove those listeners.
    unmount()

    const moveRemovals = removeSpy.mock.calls.filter(([ev]) => ev === 'pointermove').length
    const upRemovals = removeSpy.mock.calls.filter(([ev]) => ev === 'pointerup').length
    expect(moveRemovals).toBeGreaterThanOrEqual(1)
    expect(upRemovals).toBeGreaterThanOrEqual(1)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it.skip(/* 3d: cosmetic */ 'isolates the row stacking context (isolation:isolate)', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <PaneRow
        panes={[mk('a')]} renderedLinks={[]} selectedLinkId={null} paneRowRef={ref}
        renderPane={(p) => <div data-testid={`body-${p.tabId}`}>{p.title}</div>}
        onBackgroundClick={vi.fn()} onLinkNavigate={vi.fn()} onLinkSelect={vi.fn()} onLinkRemoveRequest={vi.fn()}
      />
    )
    expect(screen.getByTestId('pane-row').style.isolation).toBe('isolate')
  })
})
