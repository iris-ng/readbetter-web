import type { CanvasModel } from '../../core/canvas/canvas'
import { buildObsidianExport, safeExportDirName } from '../../core/canvas/jsoncanvas'
import type { PlatformAdapter } from '../platform'

export async function exportCanvasToObsidian({
  model,
  platform,
  projectId,
  confirmOverwrite = window.confirm,
  notify = window.alert
}: {
  model: CanvasModel
  platform: PlatformAdapter
  projectId: string
  confirmOverwrite?: (message: string) => boolean
  notify?: (message: string) => void
}): Promise<void> {
  const safeName = safeExportDirName(model.title)
  const exists = await platform.obsidianExportExists(projectId, model.title)
  if (exists && !confirmOverwrite(`A central Obsidian export bundle named "${safeName}" already exists. Overwrite it?`)) {
    return
  }

  const bundle = buildObsidianExport(model, { vaultRelDir: `Obsidian Exports/${safeName}` })
  const files = [
    { path: bundle.canvasFileName, content: bundle.canvasJson },
    ...bundle.notes.map((n) => ({ path: n.fileName, content: n.markdown }))
  ]
  await platform.writeObsidianExport(projectId, model.title, files)
  notify(`Exported central Obsidian bundle "${safeName}".`)
}
