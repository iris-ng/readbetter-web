/**
 * Fast, deterministic, NON-cryptographic hash (FNV-1a, 32-bit) of a string.
 * Used only to detect whether a source document changed since the sidecar was written.
 */
export function hashContent(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
