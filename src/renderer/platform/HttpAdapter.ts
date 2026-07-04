import { PlatformAdapter, LibraryEntry, CanvasEntry, ProjectInfo } from './PlatformAdapter'
import type { PdfParseResult } from '../../core/pdf/liteparse'

/** Builds the query string for project-scoped endpoints. */
const q = (projectId: string, ref?: string): string =>
  `projectId=${encodeURIComponent(projectId)}${ref !== undefined ? `&ref=${encodeURIComponent(ref)}` : ''}`

/** Talks to the loopback server over same-origin relative fetches. */
export class HttpAdapter implements PlatformAdapter {
  async listProjects(): Promise<ProjectInfo[]> {
    const res = await fetch('/api/projects')
    if (!res.ok) throw new Error(`listProjects failed: ${res.status}`)
    return (await res.json()) as ProjectInfo[]
  }

  async registerProject(path: string): Promise<ProjectInfo> {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path })
    })
    if (!res.ok) throw new Error(`registerProject failed: ${res.status}`)
    return (await res.json()) as ProjectInfo
  }

  async unregisterProject(id: string): Promise<void> {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`unregisterProject failed: ${res.status}`)
  }

  async listLibrary(projectId: string): Promise<LibraryEntry[]> {
    const res = await fetch(`/api/documents?${q(projectId)}`)
    if (!res.ok) throw new Error(`listLibrary failed: ${res.status}`)
    return (await res.json()) as LibraryEntry[]
  }

  async openDocument(projectId: string, ref: string): Promise<{ ref: string; content: string; hash: string } | null> {
    const res = await fetch(`/api/document?${q(projectId, ref)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`openDocument failed: ${res.status}`)
    return (await res.json()) as { ref: string; content: string; hash: string }
  }

  async openDocumentBytes(projectId: string, ref: string): Promise<ArrayBuffer> {
    const res = await fetch(`/api/file?${q(projectId, ref)}`)
    if (!res.ok) throw new Error(`openDocumentBytes failed: ${res.status}`)
    return await res.arrayBuffer()
  }

  async readSidecar(projectId: string, ref: string): Promise<string | null> {
    const res = await fetch(`/api/sidecar?${q(projectId, ref)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`readSidecar failed: ${res.status}`)
    return await res.text()
  }

  async writeSidecar(projectId: string, ref: string, json: string): Promise<void> {
    const res = await fetch(`/api/sidecar?${q(projectId, ref)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: json,
      keepalive: true // survive a beforeunload flush
    })
    if (!res.ok) throw new Error(`writeSidecar failed: ${res.status}`)
  }

  async parsePdf(projectId: string, ref: string): Promise<PdfParseResult> {
    const res = await fetch(`/api/pdf-parse?${q(projectId, ref)}`)
    if (!res.ok) throw new Error(`parsePdf failed: ${res.status}`)
    return (await res.json()) as PdfParseResult
  }

  async renderPdfPageImage(projectId: string, ref: string, page: number, dpi: number): Promise<Blob> {
    const res = await fetch(`/api/pdf-page-image?${q(projectId, ref)}&page=${page}&dpi=${dpi}`)
    if (!res.ok) throw new Error(`renderPdfPageImage failed: ${res.status}`)
    return await res.blob()
  }

  async listCanvases(projectId: string): Promise<CanvasEntry[]> {
    const res = await fetch(`/api/canvases?${q(projectId)}`)
    if (!res.ok) throw new Error(`listCanvases failed: ${res.status}`)
    return (await res.json()) as CanvasEntry[]
  }

  async readCanvas(projectId: string, ref: string): Promise<string | null> {
    const res = await fetch(`/api/canvas?${q(projectId, ref)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`readCanvas failed: ${res.status}`)
    return await res.text()
  }

  async writeCanvas(projectId: string, ref: string, md: string): Promise<void> {
    const res = await fetch(`/api/canvas?${q(projectId, ref)}`, {
      method: 'POST',
      headers: { 'content-type': 'text/markdown' },
      body: md,
      keepalive: true
    })
 if (!res.ok) throw new Error(`writeCanvas failed: ${res.status}`)
 }

 async writeCanvasPreview(projectId: string, blob: Blob): Promise<{ ref: string }> {
 const res = await fetch(`/api/canvas-preview?${q(projectId)}`, {
 method: 'POST',
 headers: { 'content-type': 'image/png' },
 body: blob
 })
 if (!res.ok) throw new Error(`writeCanvasPreview failed: ${res.status}`)
 return (await res.json()) as { ref: string }
 }

 async readCanvasPreview(projectId: string, ref: string): Promise<Blob | null> {
 const res = await fetch(`/api/canvas-preview?${q(projectId, ref)}`)
 if (res.status === 404) return null
 if (!res.ok) throw new Error(`readCanvasPreview failed: ${res.status}`)
 return await res.blob()
 }

 async relocateProject(id: string, path: string): Promise<ProjectInfo> {
    const res = await fetch(`/api/projects/${encodeURIComponent(id)}/locate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path })
    })
    if (!res.ok) throw new Error(`relocateProject failed: ${res.status}`)
    return (await res.json()) as ProjectInfo
  }

  async pickFolder(): Promise<string | null> {
    const res = await fetch('/api/pick-folder')
    if (!res.ok) throw new Error(`pickFolder failed: ${res.status}`)
    return (await res.json() as { path: string | null }).path
  }

  async obsidianExportExists(projectId: string, title: string): Promise<boolean> {
    const res = await fetch(`/api/obsidian-export?projectId=${encodeURIComponent(projectId)}&title=${encodeURIComponent(title)}`)
    if (!res.ok) throw new Error(`obsidianExportExists failed: ${res.status}`)
    return (await res.json() as { exists: boolean }).exists
  }

  async writeObsidianExport(projectId: string, title: string, files: { path: string; content: string }[]): Promise<void> {
    const res = await fetch(`/api/obsidian-export?projectId=${encodeURIComponent(projectId)}&title=${encodeURIComponent(title)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files })
    })
    if (!res.ok) throw new Error(`writeObsidianExport failed: ${res.status}`)
  }
}
