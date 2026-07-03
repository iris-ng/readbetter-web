import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeExportFilesCentral, exportDirExistsCentral } from './export-store'
import { exportsDir } from './paths'

let home: string
const PID = 'p'
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'rb-exp-'))
})

describe('export-store (central)', () => {
  it('writes export files under the central exports dir', async () => {
    expect(await exportDirExistsCentral(home, PID, 'My Vault')).toBe(false)
    const dir = await writeExportFilesCentral(home, PID, 'My Vault', [
      { path: 'note.md', content: '# hi' },
      { path: 'sub/other.md', content: 'x' }
    ])
    expect(dir).toBe(join(exportsDir(home, PID), 'My Vault'))
    expect(await readFile(join(dir, 'note.md'), 'utf-8')).toBe('# hi')
    expect(await readFile(join(dir, 'sub', 'other.md'), 'utf-8')).toBe('x')
    expect(await exportDirExistsCentral(home, PID, 'My Vault')).toBe(true)
  })
})
