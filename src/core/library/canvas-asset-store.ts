import { mkdir, readFile, writeFile } from 'fs/promises'
import { createHash } from 'crypto'
import { join, normalize, relative, isAbsolute } from 'path'
import { canvasPreviewsDir } from './paths'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function assertPreviewRef(ref: string): void {
  if (!/^previews\/[0-9a-f]{64}\.png$/.test(ref)) throw new Error('invalid preview ref')
}

function previewPath(home: string, projectId: string, ref: string): string {
  assertPreviewRef(ref)
  const root = canvasPreviewsDir(home, projectId)
  const full = join(canvasPreviewsDir(home, projectId), ref.replace(/^previews\//, ''))
  const rel = relative(root, normalize(full))
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('preview traversal')
  return full
}

export async function writeCanvasPreviewCentral(
  home: string,
  projectId: string,
  bytes: Uint8Array
): Promise<{ ref: string }> {
  const buf = Buffer.from(bytes)
  if (buf.length < PNG_MAGIC.length || !buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Error('preview must be png')
  }
  const hash = createHash('sha256').update(buf).digest('hex')
  const ref = `previews/${hash}.png`
  await mkdir(canvasPreviewsDir(home, projectId), { recursive: true })
  await writeFile(previewPath(home, projectId, ref), buf)
  return { ref }
}

export async function readCanvasPreviewCentral(home: string, projectId: string, ref: string): Promise<Buffer | null> {
  try {
    return await readFile(previewPath(home, projectId, ref))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}
