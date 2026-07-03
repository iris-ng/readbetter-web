import { DocumentModel } from '../model/document'
import { importMarkdown } from './markdown'

function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function importDocument(path: string, content: string): DocumentModel {
  const base = basename(path)
  const dotIdx = base.lastIndexOf('.')
  const ext = dotIdx > 0 ? base.slice(dotIdx + 1).toLowerCase() : ''
  const title = base
  switch (ext) {
    case 'md':
    case 'markdown':
      return importMarkdown(content, title)
    default:
      throw new Error(`Unsupported format: .${ext}`)
  }
}
