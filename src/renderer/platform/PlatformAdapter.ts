import { CanvasEntry, LibraryEntry, ProjectInfo } from '../../core/library/types'
import type { PdfParseResult } from '../../core/pdf/liteparse'

export type { CanvasEntry, LibraryEntry, ProjectInfo }

/**
 * The one seam between the format-clean renderer and the privileged shell.
 * Reference-based and async: the renderer never holds an absolute OS path.
 */
export interface PlatformAdapter {
  listProjects(): Promise<ProjectInfo[]>
  registerProject(path: string): Promise<ProjectInfo>
  unregisterProject(id: string): Promise<void>
  listLibrary(projectId: string): Promise<LibraryEntry[]>
  openDocument(projectId: string, ref: string): Promise<{ ref: string; content: string; hash: string } | null>
  openDocumentBytes(projectId: string, ref: string): Promise<ArrayBuffer>
  readSidecar(projectId: string, ref: string): Promise<string | null>
  writeSidecar(projectId: string, ref: string, json: string): Promise<void>
  parsePdf(projectId: string, ref: string): Promise<PdfParseResult>
  /** Server-rendered PNG raster of a single PDF page (0-based), used as a pdf.js render fallback. */
  renderPdfPageImage(projectId: string, ref: string, page: number, dpi: number): Promise<Blob>
  listCanvases(projectId: string): Promise<CanvasEntry[]>
  readCanvas(projectId: string, ref: string): Promise<string | null>
  writeCanvas(projectId: string, ref: string, md: string): Promise<void>
  relocateProject(id: string, path: string): Promise<ProjectInfo>
  pickFolder(): Promise<string | null>
  obsidianExportExists(projectId: string, title: string): Promise<boolean>
  writeObsidianExport(projectId: string, title: string, files: { path: string; content: string }[]): Promise<void>
}
