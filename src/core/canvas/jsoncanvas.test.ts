import { describe, it, expect } from 'vitest'
import { safeExportDirName, noteFileNames, atomicNotesFor, canvasJsonFor, buildObsidianExport } from './jsoncanvas'
import { emptyCanvas } from './canvas'
import type { CanvasModel } from './canvas'

describe('safeExportDirName', () => {
  it('preserves spaces and case', () => expect(safeExportDirName('My Canvas')).toBe('My Canvas'))
  it('turns path separators into spaces', () => expect(safeExportDirName('a/b\\c')).toBe('a b c'))
  it('strips traversal and leading dots', () => expect(safeExportDirName('../x')).toBe('x'))
  it('falls back to Canvas when empty', () => expect(safeExportDirName('   ')).toBe('Canvas'))
})

function model(cards: CanvasModel['cards']): CanvasModel {
  return { ...emptyCanvas('c', 'T'), cards }
}

describe('noteFileNames', () => {
  it('slugs the first line of a note card', () => {
    const m = model([{ id: 'n1', kind: 'note', note: 'Thesis Statement\nmore', x: 0, y: 0 }])
    expect(noteFileNames(m).get('n1')).toBe('thesis-statement')
  })
  it('uses the snapshot for an excerpt with no note, and de-dups collisions', () => {
    const m = model([
      { id: 'e1', kind: 'excerpt', source: 'a.md', anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' }, snapshot: 'Same Title', note: '', x: 0, y: 0 },
      { id: 'e2', kind: 'excerpt', source: 'a.md', anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' }, snapshot: 'Same Title', note: '', x: 0, y: 0 }
    ])
    const names = noteFileNames(m)
    expect(names.get('e1')).toBe('same-title')
    expect(names.get('e2')).toBe('same-title-2')
  })
  it('falls back to a card-id name when there is no text', () => {
    const m = model([{ id: 'abcdef0123', kind: 'note', note: '', x: 0, y: 0 }])
    expect(noteFileNames(m).get('abcdef0123')).toBe('note-abcdef01')
  })
})

describe('atomicNotesFor', () => {
  it('note card → frontmatter + body', () => {
    const m = model([{ id: 'n1', kind: 'note', note: 'Hello', x: 0, y: 0 }])
    const md = atomicNotesFor(m, noteFileNames(m))[0].markdown
    expect(md).toContain('card-id: "n1"')
    expect(md).toContain('Hello')
  })
  it('excerpt card → blockquote + note + markdown source backlink', () => {
    const m = model([{ id: 'e1', kind: 'excerpt', source: 'sub/notes.md', anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' }, snapshot: 'Quoted line', note: 'My take', x: 0, y: 0 }])
    const md = atomicNotesFor(m, noteFileNames(m))[0].markdown
    expect(md).toContain('> Quoted line')
    expect(md).toContain('My take')
    expect(md).toContain('**Source:** [[notes]]')
  })
  it('PDF excerpt source backlink carries the 1-based page', () => {
    const m = model([{ id: 'e1', kind: 'excerpt', source: 'the-book.pdf', anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '', page: { quads: [{ pageIndex: 11, x: 0, y: 0, w: 1, h: 1 }] } }, snapshot: 'q', note: '', x: 0, y: 0 }])
    const md = atomicNotesFor(m, noteFileNames(m))[0].markdown
    expect(md).toContain('**Source:** [[the-book.pdf#page=12]]')
  })
  it('writes outgoing connection links following the arrow, with the label', () => {
    const m = model([
      { id: 'a', kind: 'note', note: 'A', x: 0, y: 0 },
      { id: 'b', kind: 'note', note: 'B', x: 0, y: 0 }
    ])
    m.connections = [{ from: 'a', to: 'b', label: 'supports' }]
    const notes = atomicNotesFor(m, noteFileNames(m))
    const a = notes.find((n) => n.fileName === 'a.md')!.markdown
    const b = notes.find((n) => n.fileName === 'b.md')!.markdown
    expect(a).toContain('## Connections')
    expect(a).toContain('- [[b]] — supports')
    expect(b).not.toContain('## Connections')
  })
})

describe('canvasJsonFor', () => {
  it('maps cards to file nodes and connections to arrow edges', () => {
    const m = model([
      { id: 'e1', kind: 'excerpt', source: 'a.md', anchor: { start: 0, end: 1, exact: 'x', prefix: '', suffix: '' }, snapshot: 'Quote', note: '', color: '#fde68a', x: 12.6, y: 4, w: 300, h: 180 },
      { id: 'n1', kind: 'note', note: 'Note', x: 400, y: 0 }
    ])
    m.connections = [{ from: 'e1', to: 'n1', label: 'links' }]
    const parsed = JSON.parse(canvasJsonFor(m, noteFileNames(m), 'Obsidian Exports/T'))
    const e1 = parsed.nodes.find((n: { id: string }) => n.id === 'e1')
    expect(e1).toMatchObject({ type: 'file', file: 'Obsidian Exports/T/quote.md', x: 13, y: 4, width: 300, height: 180, color: '#fde68a' })
    const n1 = parsed.nodes.find((n: { id: string }) => n.id === 'n1')
    expect(n1).toMatchObject({ type: 'file', width: 260, height: 160 })
    expect(n1.color).toBeUndefined()
    expect(parsed.edges).toEqual([{ id: 'e1--n1', fromNode: 'e1', toNode: 'n1', toEnd: 'arrow', label: 'links' }])
  })
  it('drops a connection that references a missing card', () => {
    const m = model([{ id: 'a', kind: 'note', note: 'A', x: 0, y: 0 }])
    m.connections = [{ from: 'a', to: 'ghost' }]
    expect(JSON.parse(canvasJsonFor(m, noteFileNames(m), 'D')).edges).toEqual([])
  })
})

describe('buildObsidianExport', () => {
  it('returns a .canvas named after the dir plus one note per card, with matching file paths', () => {
    const m = model([{ id: 'n1', kind: 'note', note: 'Alpha', x: 0, y: 0 }])
    const b = buildObsidianExport(m, { vaultRelDir: 'Obsidian Exports/My Canvas' })
    expect(b.canvasFileName).toBe('My Canvas.canvas')
    expect(b.notes.map((n) => n.fileName)).toEqual(['alpha.md'])
    expect(JSON.parse(b.canvasJson).nodes[0].file).toBe('Obsidian Exports/My Canvas/alpha.md')
  })
})
