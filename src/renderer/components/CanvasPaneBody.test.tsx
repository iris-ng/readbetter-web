import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { CanvasModel } from '../../core/canvas/canvas'

const seen: { props?: Record<string, unknown> } = {}
vi.mock('./CanvasStudio', () => ({
  CanvasStudio: (props: Record<string, unknown>) => {
    seen.props = props
    return <div data-testid="canvas-studio-stub" />
  }
}))

import { CanvasPaneBody } from './CanvasPaneBody'

describe('CanvasPaneBody', () => {
  it('forwards canvas + handlers through to CanvasStudio', () => {
    const onMoveCard = vi.fn()
    const canvas = { title: 'My Canvas' } as unknown as CanvasModel
    const { getByTestId } = render(
      <CanvasPaneBody
        canvas={canvas}
        onMoveCard={onMoveCard}
        onCreateNote={vi.fn()}
        onSetNote={vi.fn()}
        onCardClick={vi.fn()}
        onSetViewport={vi.fn()}
        onRemoveCard={vi.fn()}
        onResizeCard={vi.fn()}
        onAddConnection={vi.fn()}
        onRemoveConnection={vi.fn()}
        onSetConnectionLabel={vi.fn()}
      />
    )
    expect(getByTestId('canvas-studio-stub')).toBeTruthy()
    expect(seen.props?.canvas).toBe(canvas)
    expect(seen.props?.onMoveCard).toBe(onMoveCard)
  })
})
