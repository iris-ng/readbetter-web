import { mkdir, writeFile, rename, unlink } from 'fs/promises'
import { dirname } from 'path'

/** Create parent dirs, write to a temp file, then rename over the target. Cleans up on failure. */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, data, 'utf-8')
  try {
    await rename(tmp, path)
  } catch (err) {
    await unlink(tmp).catch(() => undefined) // best-effort; don't mask the original error
    throw err
  }
}
