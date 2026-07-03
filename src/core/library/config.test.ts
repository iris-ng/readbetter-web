// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  writeDiscovery,
  readDiscovery,
  DEFAULT_PORT
} from './config'

describe('library config', () => {
  let home: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'rb-cfg-'))
  })
  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('writes and reads back the discovery file under <home>/.readbetter/server.json', async () => {
    await writeDiscovery(home, { port: 7777, url: 'http://127.0.0.1:7777' })
    const raw = await readFile(join(home, '.readbetter', 'server.json'), 'utf-8')
    expect(JSON.parse(raw)).toMatchObject({ port: 7777, url: 'http://127.0.0.1:7777' })
    const back = await readDiscovery(home)
    expect(back?.port).toBe(7777)
  })

  it('readDiscovery returns null when file is absent', async () => {
    expect(await readDiscovery(home)).toBeNull()
  })

  it('DEFAULT_PORT is 7777', () => {
    expect(DEFAULT_PORT).toBe(7777)
  })
})
