import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectsView } from './ProjectsView'

const one = [{ id: '1', name: 'Philosophy', path: '/p', docCount: 3 }]

function renderView(props: Partial<Parameters<typeof ProjectsView>[0]> = {}) {
  return render(
    <ProjectsView
      projects={one}
      onOpen={() => {}}
      onAdd={() => {}}
      onRemove={() => {}}
      onLocate={() => {}}
      {...props}
    />
  )
}

describe('ProjectsView', () => {
  it('shows card per project and opens one', () => {
    const onOpen = vi.fn()
    renderView({ onOpen })
    expect(screen.getByText('Philosophy')).toBeTruthy()
    expect(screen.getByText('3 documents')).toBeTruthy()
    fireEvent.click(screen.getByText('Philosophy'))
    expect(onOpen).toHaveBeenCalledWith('1')
  })

  it('renders add-folder tile and calls onAdd', () => {
    const onAdd = vi.fn()
    renderView({ onAdd })
    fireEvent.click(screen.getByRole('button', { name: /add folder/i }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('removes project from its hover control', () => {
    const onRemove = vi.fn()
    renderView({ onRemove })
    fireEvent.click(screen.getByRole('button', { name: 'Forget Philosophy registration' }))
    expect(onRemove).toHaveBeenCalledWith('1')
  })

  it('shows empty state with no projects', () => {
    renderView({ projects: [] })
    expect(screen.getByText(/no projects yet/i)).toBeTruthy()
  })

  it('shows missing project recovery without opening the project', () => {
    const onOpen = vi.fn()
    const onLocate = vi.fn()
    renderView({
      projects: [{ ...one[0], docCount: 0, missing: true }],
      onOpen,
      onLocate
    })

    expect(screen.getByText('Folder missing')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /locate/i }))
    expect(onLocate).toHaveBeenCalledWith('1')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
