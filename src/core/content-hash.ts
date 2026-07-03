import { createHash } from 'node:crypto'

/**
 * SHA-256 of raw document bytes, lowercase hex. This is the central-store identity
 * for a document (the `<sha256>.json` sidecar filename). Server/core-only — never
 * import this from the renderer bundle.
 */
export function hashBytes(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
