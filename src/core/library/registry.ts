import { mkdir, readFile, writeFile, rename, stat } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { Project } from './types'
import { manifestPath, sidecarsDir, canvasesDir } from './paths'

export function globalDir(home: string): string {
  return join(home, '.readbetter')
}

function registryPath(home: string): string {
  return join(globalDir(home), 'registry.json')
}

export async function loadRegistry(home: string): Promise<Project[]> {
  try {
    const raw = await readFile(registryPath(home), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Project[]) : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

export async function saveRegistry(home: string, projects: Project[]): Promise<void> {
  await mkdir(globalDir(home), { recursive: true })
  const path = registryPath(home)
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(projects, null, 2), 'utf-8')
  await rename(tmp, path)
}

/** Create the central project dirs + manifest. Writes nothing into the source folder. */
export async function ensureProjectScaffold(home: string, projectId: string, displayName: string): Promise<void> {
  await mkdir(sidecarsDir(home, projectId), { recursive: true })
  await mkdir(canvasesDir(home, projectId), { recursive: true })
  const manifest = manifestPath(home, projectId)
  try {
    await stat(manifest)
  } catch {
    const body = { schemaVersion: 1, name: displayName, description: '', createdAt: new Date().toISOString() }
    await writeFile(manifest, JSON.stringify(body, null, 2), 'utf-8')
  }
}

/** Display name from the central manifest, falling back to the folder basename. */
export async function projectName(home: string, projectId: string, projectPath: string): Promise<string> {
  try {
    const m = JSON.parse(await readFile(manifestPath(home, projectId), 'utf-8')) as { name?: unknown }
    if (typeof m.name === 'string' && m.name.trim() !== '') return m.name
  } catch {
    /* fall through to basename */
  }
  return basename(projectPath)
}

export function findProject(projects: Project[], id: string): Project | undefined {
  return projects.find((p) => p.id === id)
}

export async function registerProject(home: string, absPath: string): Promise<Project> {
  const path = resolve(absPath)
  const info = await stat(path) // throws ENOENT for a missing path
  if (!info.isDirectory()) throw new Error(`not a directory: ${path}`)
  const projects = await loadRegistry(home)
  const existing = projects.find((p) => p.path === path)
  if (existing) {
    await ensureProjectScaffold(home, existing.id, existing.name)
    return existing
  }
  const id = crypto.randomUUID()
  const name = basename(path)
  await ensureProjectScaffold(home, id, name)
  const project: Project = { id, path, name, addedAt: new Date().toISOString() }
  await saveRegistry(home, [...projects, project])
  return project
}

/** Re-point a registered project at a new folder path, keeping its id. */
export async function relocateProject(home: string, id: string, newPath: string): Promise<Project> {
  const path = resolve(newPath)
  const info = await stat(path)
  if (!info.isDirectory()) throw new Error(`not a directory: ${path}`)
  const projects = await loadRegistry(home)
  const target = projects.find((p) => p.id === id)
  if (!target) throw new Error('unknown project')
  const updated = projects.map((p) => (p.id === id ? { ...p, path } : p))
  await saveRegistry(home, updated)
  return { ...target, path }
}

export async function unregisterProject(home: string, id: string): Promise<void> {
  const projects = await loadRegistry(home)
  await saveRegistry(home, projects.filter((p) => p.id !== id))
}
