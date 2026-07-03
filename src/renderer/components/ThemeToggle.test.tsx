import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('shows the current mode and cycles system→light→dark→system', async () => {
    const setMode = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<ThemeToggle mode="system" setMode={setMode} />)
    await user.click(screen.getByRole('button', { name: /theme/i }))
    expect(setMode).toHaveBeenCalledWith('light')

    rerender(<ThemeToggle mode="light" setMode={setMode} />)
    await user.click(screen.getByRole('button', { name: /theme/i }))
    expect(setMode).toHaveBeenCalledWith('dark')

    rerender(<ThemeToggle mode="dark" setMode={setMode} />)
    await user.click(screen.getByRole('button', { name: /theme/i }))
    expect(setMode).toHaveBeenCalledWith('system')
  })
})
