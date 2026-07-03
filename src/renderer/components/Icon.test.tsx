import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon } from './Icon'

describe('Icon', () => {
  it('renders an svg that inherits color and is decorative by default', () => {
    const { container } = render(<Icon name="home" />)
    const svg = container.querySelector('svg')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('honors the size prop', () => {
    const { container } = render(<Icon name="close" size={20} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
  })

  it.each(['document', 'diamond', 'search'] as const)('renders the %s glyph', (name) => {
    const { container } = render(<Icon name={name} />)
    expect(container.querySelector('svg')).toBeTruthy()
  })
})
