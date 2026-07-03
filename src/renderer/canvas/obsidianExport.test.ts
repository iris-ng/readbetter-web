import { describe, expect, it, vi } from 'vitest'
import { emptyCanvas } from '../../core/canvas/canvas'
import type { PlatformAdapter } from '../platform'
import { exportCanvasToObsidian } from './obsidianExport'

function exportAdapter(exists: boolean): PlatformAdapter {
  return {
    obsidianExportExists: vi.fn().mockResolvedValue(exists),
    writeObsidianExport: vi.fn().mockResolvedValue(undefined)
  } as unknown as PlatformAdapter
}

describe('exportCanvasToObsidian', () => {
  it('writes an Obsidian export bundle for the active project', async () => {
    const platform = exportAdapter(false)
    const notify = vi.fn()
    const model = {
      ...emptyCanvas('canvas-1', 'My Canvas'),
      cards: [{ id: 'card-1', kind: 'note' as const, note: 'First thought\nMore detail', x: 10, y: 20 }]
    }

    await exportCanvasToObsidian({ model, platform, projectId: 'p1', notify })

    expect(platform.obsidianExportExists).toHaveBeenCalledWith('p1', 'My Canvas')
    expect(platform.writeObsidianExport).toHaveBeenCalledWith(
      'p1',
      'My Canvas',
      expect.arrayContaining([
        expect.objectContaining({ path: 'My Canvas.canvas' }),
        expect.objectContaining({ path: 'first-thought.md' })
      ])
    )
    const files = vi.mocked(platform.writeObsidianExport).mock.calls[0][2]
    expect(files.find((file) => file.path === 'My Canvas.canvas')?.content).toContain(
      'Obsidian Exports/My Canvas/first-thought.md'
    )
    expect(notify).toHaveBeenCalledWith('Exported central Obsidian bundle "My Canvas".')
  })

  it('does not overwrite an existing export when declined', async () => {
    const platform = exportAdapter(true)
    const confirmOverwrite = vi.fn().mockReturnValue(false)
    const notify = vi.fn()

    await exportCanvasToObsidian({
      model: emptyCanvas('canvas-1', 'My Canvas'),
      platform,
      projectId: 'p1',
      confirmOverwrite,
      notify
    })

    expect(confirmOverwrite).toHaveBeenCalledWith(
      'A central Obsidian export bundle named "My Canvas" already exists. Overwrite it?'
    )
    expect(platform.writeObsidianExport).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('overwrites an existing export when confirmed', async () => {
    const platform = exportAdapter(true)
    const confirmOverwrite = vi.fn().mockReturnValue(true)

    await exportCanvasToObsidian({
      model: emptyCanvas('canvas-1', 'My Canvas'),
      platform,
      projectId: 'p1',
      confirmOverwrite,
      notify: vi.fn()
    })

    expect(platform.writeObsidianExport).toHaveBeenCalledWith(
      'p1',
      'My Canvas',
      expect.arrayContaining([expect.objectContaining({ path: 'My Canvas.canvas' })])
    )
  })
})
