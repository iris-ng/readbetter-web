// useProjects.test.ts
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useProjects } from './useProjects'
import type { ProjectInfo } from '../../core/library/types'

function mockAdapter(initial: ProjectInfo[] = []) {
  let list = [...initial]
  return {
    listProjects: async () => list,
    registerProject: async (path: string) => {
      const p = { id: path, name: path, path, docCount: 0 }
      list = [...list, p]
      return p
    },
    relocateProject: async (id: string, path: string) => {
      const p = { id, name: path, path, docCount: 2 }
      list = list.map((existing) => (existing.id === id ? p : existing))
      return p
    },
    unregisterProject: async (id: string) => {
      list = list.filter((p) => p.id !== id)
    }
  } as any
}

beforeEach(() => localStorage.clear())

it('loads projects on mount', async () => {
  const { result } = renderHook(() => useProjects(mockAdapter([{ id: '1', name: 'A', path: '/a', docCount: 2 }])))
  await waitFor(() => expect(result.current.projects.length).toBe(1))
})

it('add registers, selects, persists active id', async () => {
  const { result } = renderHook(() => useProjects(mockAdapter()))
  await act(async () => {
    await result.current.add('/p')
  })
  expect(result.current.activeId).toBe('/p')
  expect(localStorage.getItem('rb.activeProject')).toBe('/p')
})

it('relocate updates the existing project without changing identity', async () => {
  const { result } = renderHook(() =>
    useProjects(mockAdapter([{ id: '1', name: 'Old', path: '/old', docCount: 0, missing: true }]))
  )
  await waitFor(() => expect(result.current.projects.length).toBe(1))

  await act(async () => {
    await result.current.relocate('1', '/new')
  })

  expect(result.current.projects[0]).toMatchObject({ id: '1', path: '/new', docCount: 2 })
  expect(result.current.projects[0].missing).toBeUndefined()
})

it('does not restore a missing project as active', async () => {
  localStorage.setItem('rb.activeProject', '1')
  const { result } = renderHook(() =>
    useProjects(mockAdapter([{ id: '1', name: 'A', path: '/a', docCount: 0, missing: true }]))
  )
  await waitFor(() => expect(result.current.projects.length).toBe(1))
  expect(result.current.active).toBeNull()
})

it('remove clears active project when active project is removed', async () => {
  const { result } = renderHook(() => useProjects(mockAdapter([{ id: '1', name: 'A', path: '/a', docCount: 0 }])))
  await waitFor(() => expect(result.current.projects.length).toBe(1))
  act(() => result.current.select('1'))
  await act(async () => {
    await result.current.remove('1')
  })
  expect(result.current.activeId).toBeNull()
})
