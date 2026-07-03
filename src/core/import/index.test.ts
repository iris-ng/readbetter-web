import { describe, it, expect } from 'vitest'
import { importDocument } from './index'

describe('importDocument', () => {
  it('routes .md to the Markdown importer', () => {
    const doc = importDocument('/path/to/notes.md', '# Title\nBody.')
    expect(doc.format).toBe('markdown')
    expect(doc.sections[0].heading).toBe('Title')
  })

  it('routes .markdown to the Markdown importer', () => {
    const doc = importDocument('C:/docs/notes.markdown', '# A\nb.')
    expect(doc.format).toBe('markdown')
  })

  it('uses the file basename as the title', () => {
    const doc = importDocument('/a/b/c/report.md', '# X\ny.')
    expect(doc.title).toBe('report.md')
  })

  it('throws on an unsupported extension', () => {
    expect(() => importDocument('/x/file.pdf', 'data')).toThrow(/unsupported/i)
  })

  it('handles Windows backslash separators for basename', () => {
    const doc = importDocument('C:\\Users\\abc\\notes.md', '# H\ntext.')
    expect(doc.title).toBe('notes.md')
  })

  it('throws on an extension-free filename', () => {
    expect(() => importDocument('/docs/README', 'data')).toThrow(/unsupported/i)
  })
})
