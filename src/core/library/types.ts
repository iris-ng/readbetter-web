export interface Project {
  /** Stable registry id (uuid). */
  id: string
  /** Absolute folder path on this machine. */
  path: string
  /** Display name (manifest override or folder basename). */
  name: string
  /** ISO timestamp the folder was registered. */
  addedAt: string
}

export interface ProjectInfo {
  id: string
  name: string
  path: string
  docCount: number
  /** True when the registered source folder can no longer be found. */
  missing?: boolean
}

export interface LibraryEntry {
  /** Root-relative POSIX path, e.g. "documents/plato-republic.md". */
  ref: string
  /** Filename, e.g. "plato-republic.md". */
  name: string
  /** Lowercase extension without the dot, e.g. "md". */
  ext: string
  /** Byte content-hash (sha256). Present once computed; absent until first hashed. */
  hash?: string
}

export interface CanvasEntry {
  /** Root-relative path, e.g. ".readbetter/canvases/free-will.md". */
  ref: string
  /** Filename, e.g. "free-will.md". */
  name: string
  /** Title from frontmatter, or the filename when absent/unreadable. */
  title: string
  /** Present and true only for soft-deleted (trashed) canvases. */
  deleted?: boolean
}
