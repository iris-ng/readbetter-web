import { join } from 'path'
import { globalDir } from './registry'

/** Throws unless `hash` is exactly 64 lowercase hex chars. */
export function assertHash(hash: string): void {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error(`invalid content hash: ${hash}`)
}

export function projectsDir(home: string): string {
  return join(globalDir(home), 'projects')
}
export function projectDir(home: string, projectId: string): string {
  return join(projectsDir(home), projectId)
}
export function manifestPath(home: string, projectId: string): string {
  return join(projectDir(home, projectId), 'project.json')
}
export function sidecarsDir(home: string, projectId: string): string {
  return join(projectDir(home, projectId), 'sidecars')
}
export function sidecarPath(home: string, projectId: string, hash: string): string {
  assertHash(hash)
  return join(sidecarsDir(home, projectId), `${hash}.json`)
}
export function canvasesDir(home: string, projectId: string): string {
  return join(projectDir(home, projectId), 'canvases')
}
export function indexPath(home: string, projectId: string): string {
  return join(projectDir(home, projectId), 'index.json')
}
export function cachePath(home: string, projectId: string): string {
  return join(projectDir(home, projectId), 'cache.json')
}
export function exportsDir(home: string, projectId: string): string {
  return join(projectDir(home, projectId), 'exports')
}
