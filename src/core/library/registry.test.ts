// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, readFile, writeFile, stat, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  loadRegistry, saveRegistry, registerProject, unregisterProject, findProject,
  ensureProjectScaffold, projectName, relocateProject
} from './registry'
import { projectDir } from './paths'

describe('registry', () => {
  let home: string
  let proj: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'rb-home-'))
    proj = await mkdtemp(join(tmpdir(), 'rb-proj-'))
  })
  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
    await rm(proj, { recursive: true, force: true })
  })

  it('loadRegistry returns [] when absent', async () => {
    expect(await loadRegistry(home)).toEqual([])
  })

  it('registerProject validates, scaffolds, persists, dedupes', async () => {
    const p = await registerProject(home, proj)
    expect(p.path).toBe(proj)
    expect(p.id).toMatch(/[0-9a-f-]{36}/)
    // scaffold present in central location (nothing written to source folder)
    expect((await stat(join(projectDir(home, p.id), 'sidecars'))).isDirectory()).toBe(true)
    expect((await stat(join(projectDir(home, p.id), 'canvases'))).isDirectory()).toBe(true)
    const manifest = JSON.parse(await readFile(join(projectDir(home, p.id), 'project.json'), 'utf-8'))
    expect(manifest.schemaVersion).toBe(1)
    // persisted + deduped by path
    const again = await registerProject(home, proj)
    expect(again.id).toBe(p.id)
    expect((await loadRegistry(home)).length).toBe(1)
  })

  it('registerProject rejects a non-directory path', async () => {
    await expect(registerProject(home, join(proj, 'nope'))).rejects.toThrow()
  })

  it('unregisterProject forgets the path but leaves files', async () => {
    const p = await registerProject(home, proj)
    await unregisterProject(home, p.id)
    expect(await loadRegistry(home)).toEqual([])
    expect((await stat(projectDir(home, p.id))).isDirectory()).toBe(true) // central files untouched
  })

  it('projectName reads manifest name, falls back to basename', async () => {
    const p = await registerProject(home, proj)
    expect(await projectName(home, p.id, proj)).toBe(require('path').basename(proj))
    await writeFile(join(projectDir(home, p.id), 'project.json'),
      JSON.stringify({ schemaVersion: 1, name: 'Philosophy', description: '', createdAt: 'x' }), 'utf-8')
    expect(await projectName(home, p.id, proj)).toBe('Philosophy')
  })

  it('findProject locates by id', () => {
    const list = [{ id: 'a', path: '/x', name: 'X', addedAt: 't' }]
    expect(findProject(list, 'a')?.path).toBe('/x')
    expect(findProject(list, 'z')).toBeUndefined()
  })
})

describe('central scaffold + relocate', () => {
  let home: string
  let folder: string
  let folder2: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'rb-reg-'))
    folder = await mkdtemp(join(tmpdir(), 'rb-src-'))
    folder2 = await mkdtemp(join(tmpdir(), 'rb-src2-'))
  })

  it('scaffolds centrally and writes nothing into the source folder', async () => {
    const p = await registerProject(home, folder)
    await stat(join(projectDir(home, p.id), 'sidecars'))
    await stat(join(projectDir(home, p.id), 'canvases'))
    await stat(join(projectDir(home, p.id), 'project.json'))
    expect(await readdir(folder)).toEqual([]) // source folder untouched
  })

  it('relocate updates the path but keeps the id', async () => {
    const p = await registerProject(home, folder)
    const moved = await relocateProject(home, p.id, folder2)
    expect(moved.id).toBe(p.id)
    expect(moved.path).toBe(folder2)
    expect((await loadRegistry(home)).find((x) => x.id === p.id)?.path).toBe(folder2)
  })
})
