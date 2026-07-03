import { mkdir, stat, rm } from 'fs/promises'
import { join } from 'path'
import { exportsDir } from './paths'
import { resolveRef } from './library'
import { writeFileAtomic } from '../fs-atomic'

export async function exportDirExistsCentral(home: string, projectId: string, safeName: string): Promise<boolean> {
  try {
    return (await stat(resolveRef(exportsDir(home, projectId), safeName))).isDirectory()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

/** Regenerate <exportsDir>/<safeName>/: clear it, then write each file (traversal-guarded). */
export async function writeExportFilesCentral(
  home: string,
  projectId: string,
  safeName: string,
  files: { path: string; content: string }[]
): Promise<string> {
  const dir = resolveRef(exportsDir(home, projectId), safeName)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  for (const f of files) {
    await writeFileAtomic(resolveRef(dir, f.path), f.content)
  }
  return dir
}
