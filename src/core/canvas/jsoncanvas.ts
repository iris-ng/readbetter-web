import { slug } from '../model/slug'
import type { CanvasModel, ExcerptCard } from './canvas'

/** One filesystem-safe path segment from a canvas title. Preserves spaces + case; strips
 *  path separators, traversal, control chars, and any leading dot (Obsidian hides dotfolders). */
export function safeExportDirName(title: string): string {
  const cleaned = title
    .replace(/[\\/]/g, ' ')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()
  return cleaned || 'Canvas'
}

function firstLine(s: string): string {
  return (s.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '').slice(0, 60)
}

/** Card id → unique note basename (no extension). Slug of the card's first note line (or, for an
 *  empty-note excerpt, its snapshot); fallback `note-<id8>`/`excerpt-<id8>`; `-2`/`-3` on collision. */
export function noteFileNames(model: CanvasModel): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()
  for (const c of model.cards) {
    const seed = c.kind === 'excerpt' ? (firstLine(c.note) || firstLine(c.snapshot)) : firstLine(c.note)
    const base = seed.trim() === ''
      ? `${c.kind === 'excerpt' ? 'excerpt' : 'note'}-${c.id.slice(0, 8)}`
      : slug(seed)
    let name = base
    let n = 2
    while (used.has(name.toLowerCase())) name = `${base}-${n++}`
    used.add(name.toLowerCase())
    out.set(c.id, name)
  }
  return out
}

export interface AtomicNote { fileName: string; markdown: string }

const yamlStr = (s: string): string => JSON.stringify(s) // double-quoted YAML scalar

function sourceLink(card: ExcerptCard): string {
  const base = card.source.split('/').pop() ?? card.source
  const isMd = /\.md$/i.test(base)
  const target = isMd ? base.replace(/\.md$/i, '') : base
  const page = card.anchor.page?.quads?.[0]?.pageIndex
  const suffix = !isMd && typeof page === 'number' ? `#page=${page + 1}` : ''
  return `[[${target}${suffix}]]`
}

function connectionsSection(model: CanvasModel, cardId: string, names: Map<string, string>): string {
  const outs = model.connections.filter((c) => c.from === cardId && names.has(c.to))
  if (outs.length === 0) return ''
  const lines = outs.map((c) => `- [[${names.get(c.to)}]]${c.label ? ` — ${c.label}` : ''}`)
  return `\n\n## Connections\n${lines.join('\n')}`
}

export function atomicNotesFor(model: CanvasModel, names: Map<string, string>): AtomicNote[] {
  return model.cards.map((card) => {
    const fm = ['---', `canvas: ${yamlStr(model.title)}`, `card-id: ${yamlStr(card.id)}`]
    if (card.kind === 'excerpt') fm.push(`source: ${yamlStr(card.source)}`)
    fm.push('---')
    let body: string
    if (card.kind === 'excerpt') {
      const quote = card.snapshot.split('\n').map((l) => `> ${l}`).join('\n')
      const note = card.note ? `\n\n${card.note}` : ''
      body = `${quote}${note}\n\n**Source:** ${sourceLink(card)}`
    } else {
      body = card.note
    }
    const markdown = `${fm.join('\n')}\n\n${body}${connectionsSection(model, card.id, names)}\n`
    return { fileName: `${names.get(card.id)}.md`, markdown }
  })
}

const DEFAULT_W = 260
const DEFAULT_H = 160

export function canvasJsonFor(model: CanvasModel, names: Map<string, string>, vaultRelDir: string): string {
  const nodes = model.cards.map((card) => {
    const node: Record<string, unknown> = {
      id: card.id,
      type: 'file',
      file: `${vaultRelDir}/${names.get(card.id)}.md`,
      x: Math.round(card.x),
      y: Math.round(card.y),
      width: Math.round(card.w ?? DEFAULT_W),
      height: Math.round(card.h ?? DEFAULT_H)
    }
    if (card.kind === 'excerpt' && card.color) node.color = card.color
    return node
  })
  const ids = new Set(model.cards.map((c) => c.id))
  const seen = new Set<string>()
  const edges = model.connections
    .filter((c) => ids.has(c.from) && ids.has(c.to))
    .map((c) => {
      let id = `${c.from}--${c.to}`
      let n = 2
      while (seen.has(id)) id = `${c.from}--${c.to}-${n++}`
      seen.add(id)
      const edge: Record<string, unknown> = { id, fromNode: c.from, toNode: c.to, toEnd: 'arrow' }
      if (c.label) edge.label = c.label
      return edge
    })
  return JSON.stringify({ nodes, edges }, null, 2) + '\n'
}

export interface ExportBundle {
  canvasFileName: string
  canvasJson: string
  notes: AtomicNote[]
}

export function buildObsidianExport(model: CanvasModel, opts: { vaultRelDir: string }): ExportBundle {
  const names = noteFileNames(model)
  const dirName = opts.vaultRelDir.split('/').pop() ?? 'Canvas'
  return {
    canvasFileName: `${dirName}.canvas`,
    canvasJson: canvasJsonFor(model, names, opts.vaultRelDir),
    notes: atomicNotesFor(model, names)
  }
}
