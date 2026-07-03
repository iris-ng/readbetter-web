import { homedir } from 'os'
import { resolve } from 'path'
import { createServer } from './createServer'
import { listenLoopback } from './listen'
import { openBrowser } from './openBrowser'
import { writeDiscovery, DEFAULT_PORT } from '../core/library/config'
import { registerProject } from '../core/library/registry'

function parseFlag(name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : undefined
}

async function main(): Promise<void> {
  const home = homedir()
  // Convenience: a --library= flag or READBETTER_LIBRARY env auto-registers that folder.
  const seed = parseFlag('library') ?? process.env.READBETTER_LIBRARY
  if (seed) {
    try { await registerProject(home, seed) } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`readbetter: could not register ${seed}:`, err)
    }
  }

  const webDir = resolve(process.cwd(), 'out-web')
  const preferredPort = Number(process.env.READBETTER_PORT) || DEFAULT_PORT

  const server = createServer({ home, webDir })
  const port = await listenLoopback(server, preferredPort)
  const url = `http://127.0.0.1:${port}`
  await writeDiscovery(home, { port, url, startedAt: new Date().toISOString() })

  // eslint-disable-next-line no-console
  console.log(`readbetter: serving projects from registry\n  at ${url}`)
  if (process.env.READBETTER_NO_OPEN !== '1') openBrowser(url)
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('readbetter server failed to start:', err)
  process.exitCode = 1
})
