// src/core/library/config.ts
import { mkdir, readFile, writeFile, rename } from 'fs/promises'
import { join } from 'path'
import { globalDir } from './registry'

export const DEFAULT_PORT = 7777

export interface Discovery {
  port: number
  url: string
  startedAt?: string
}

function discoveryPath(home: string): string {
  return join(globalDir(home), 'server.json')
}

export async function writeDiscovery(home: string, d: Discovery): Promise<void> {
  await mkdir(globalDir(home), { recursive: true })
  const path = discoveryPath(home)
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(d, null, 2), 'utf-8')
  await rename(tmp, path)
}

export async function readDiscovery(home: string): Promise<Discovery | null> {
  try {
    return JSON.parse(await readFile(discoveryPath(home), 'utf-8')) as Discovery
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}
