import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ZoomControl } from './ZoomControl'

it('applies arbitrary typed percentages between 25 and 200', () => {
  const onZoomChange = vi.fn()

  render(<ZoomControl zoom={1.25} onZoomChange={onZoomChange} />)

  const input = screen.getByRole('spinbutton', { name: /zoom percentage/i })
  expect(input).toHaveValue(125)

  fireEvent.change(input, { target: { value: '37' } })
  expect(input).toHaveValue(37)
  expect(onZoomChange).toHaveBeenLastCalledWith(0.37)

  fireEvent.change(input, { target: { value: '137.5' } })
  expect(input).toHaveValue(137.5)
  expect(onZoomChange).toHaveBeenLastCalledWith(1.375)
})

it('allows partial typing and clamps out-of-range values on commit', () => {
  const onZoomChange = vi.fn()

  render(<ZoomControl zoom={1} onZoomChange={onZoomChange} />)

  const input = screen.getByRole('spinbutton', { name: /zoom percentage/i })
  fireEvent.change(input, { target: { value: '2' } })
  expect(input).toHaveValue(2)
  expect(onZoomChange).not.toHaveBeenCalled()

  fireEvent.blur(input)
  expect(input).toHaveValue(25)
  expect(onZoomChange).toHaveBeenLastCalledWith(0.25)
})
