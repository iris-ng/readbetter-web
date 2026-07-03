import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PdfHighlightLayer } from './PdfHighlightLayer'

describe('PdfHighlightLayer', () => {
  it('draws one scaled, non-interactive rect per box', () => {
    render(
      <PdfHighlightLayer
        boxes={[{ id: 'a', color: '#fde68a', quad: { pageIndex: 0, x: 10, y: 20, w: 30, h: 8 } }]}
        zoom={2}
      />
    )
    const rect = screen.getByTestId('pdf-highlight')
    expect(rect.style.left).toBe('20px') // 10 * 2
    expect(rect.style.width).toBe('60px') // 30 * 2
    expect(rect.style.pointerEvents).toBe('none')
    expect(rect.getAttribute('data-annotation-id')).toBe('a')
  })

  it('keeps the active search box legible: translucent multiply wash, not an opaque cover', () => {
    render(
      <PdfHighlightLayer
        boxes={[{ id: 'x', color: 'var(--pdf-search-hl-active)', quad: { pageIndex: 0, x: 0, y: 0, w: 40, h: 8 }, active: true }]}
        zoom={1}
      />
    )
    const rect = screen.getByTestId('pdf-highlight')
    // A 'normal' blend with an opaque wash hides the glyphs beneath (the reported bug).
    // Search hits must composite like the annotation highlighter so text stays readable.
    expect(rect.style.mixBlendMode).toBe('multiply')
    expect(rect.getAttribute('data-search-active')).toBe('true')
    expect(rect.style.outline).toContain('var(--accent)') // active still picked out by the ring
  })
})
