import { PlatformAdapter } from './PlatformAdapter'
import { HttpAdapter } from './HttpAdapter'

export type { PlatformAdapter } from './PlatformAdapter'
export type { LibraryEntry } from './PlatformAdapter'
export type { CanvasEntry } from './PlatformAdapter'

/** The renderer talks to the loopback server over HTTP. */
export function getAdapter(): PlatformAdapter {
  return new HttpAdapter()
}
