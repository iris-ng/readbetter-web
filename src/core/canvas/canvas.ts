import { Anchor } from '../anchor/anchor'
import { slug } from '../model/slug'

export const CANVAS_SCHEMA_VERSION = 1

export interface Viewport {
  x: number
  y: number
  zoom: number
}
export interface CardBase {
  id: string
  x: number
  y: number
  w?: number
  h?: number
}
export interface ExcerptCard extends CardBase {
  kind: 'excerpt'
  source: string
  anchor: Anchor
  snapshot: string
  note: string
  color?: string
  sourceAnnotationId?: string
}
export interface NoteCard extends CardBase {
  kind: 'note'
  note: string
}
export type Card = ExcerptCard | NoteCard
export interface Connection {
  from: string
  to: string
  label?: string
}
export interface CanvasModel {
  schemaVersion: number
  id: string
  title: string
  /** Soft-delete marker. Absent/false = active; true = in the trash (restorable). */
  deleted?: boolean
  viewport: Viewport
  cards: Card[]
  connections: Connection[]
}

export function emptyCanvas(id: string, title: string): CanvasModel {
  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    id,
    title,
    viewport: { x: 0, y: 0, zoom: 1 },
    cards: [],
    connections: []
  }
}

/** Root-relative ref for a new canvas, slugified from the title and de-duplicated. */
export function uniqueCanvasRef(title: string, existingRefs: string[]): string {
  const s = slug(title)
  const base = s === 'section' && title.trim() === '' ? 'canvas' : s
  const taken = new Set(existingRefs)
  let ref = `${base}.md`
  let n = 2
  while (taken.has(ref)) ref = `${base}-${n++}.md`
  return ref
}

// ---------- serialize ----------

function str(s: string): string {
  return JSON.stringify(s) // valid YAML double-quoted scalar; escapes quotes/colons/#/newlines
}

function emitAnchor(a: Anchor): string {
  const parts = [
    `start: ${a.start}`,
    `end: ${a.end}`,
    `exact: ${str(a.exact)}`,
    `prefix: ${str(a.prefix)}`,
    `suffix: ${str(a.suffix)}`
  ]
  if (a.page) {
    const quads = a.page.quads
      .map((q) => `{ pageIndex: ${q.pageIndex}, x: ${q.x}, y: ${q.y}, w: ${q.w}, h: ${q.h} }`)
      .join(', ')
    parts.push(`page: { quads: [${quads}] }`)
  }
  return `{ ${parts.join(', ')} }`
}

function emitCard(c: Card): string {
  const lines = [`  - id: ${str(c.id)}`, `    kind: ${str(c.kind)}`]
  if (c.kind === 'excerpt') {
    lines.push(`    source: ${str(c.source)}`)
    lines.push(`    anchor: ${emitAnchor(c.anchor)}`)
    if (c.color !== undefined) lines.push(`    color: ${str(c.color)}`)
    if (c.sourceAnnotationId !== undefined) lines.push(`    sourceAnnotationId: ${str(c.sourceAnnotationId)}`)
  }
  lines.push(`    x: ${c.x}`, `    y: ${c.y}`)
  if (c.w !== undefined) lines.push(`    w: ${c.w}`)
  if (c.h !== undefined) lines.push(`    h: ${c.h}`)
  return lines.join('\n')
}

function emitConnection(c: Connection): string {
  const parts = [`from: ${str(c.from)}`, `to: ${str(c.to)}`]
  if (c.label !== undefined) parts.push(`label: ${str(c.label)}`)
  return `  - { ${parts.join(', ')} }`
}

function emitBody(cards: Card[]): string {
  const blocks = cards.map((c) => {
    if (/\s|-->/.test(c.id)) throw new Error(`canvas: card id ${JSON.stringify(c.id)} is not marker-safe`)
    const head = `<!-- rb:card ${c.id} -->`
    if (c.kind === 'excerpt') {
      const quote = c.snapshot
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
      return c.note ? `${head}\n${quote}\n\n${c.note}` : `${head}\n${quote}`
    }
    return c.note ? `${head}\n${c.note}` : head
  })
  return blocks.join('\n\n')
}

export function serializeCanvas(m: CanvasModel): string {
  const fm: string[] = [
    `schemaVersion: ${m.schemaVersion}`,
    `id: ${str(m.id)}`,
    `title: ${str(m.title)}`,
    `viewport: { x: ${m.viewport.x}, y: ${m.viewport.y}, zoom: ${m.viewport.zoom} }`
  ]
  // Emit the soft-delete marker only when set, so active canvases round-trip unchanged.
  if (m.deleted) fm.push('deleted: true')
  fm.push(m.cards.length === 0 ? 'cards: []' : 'cards:\n' + m.cards.map(emitCard).join('\n'))
  fm.push(
    m.connections.length === 0
      ? 'connections: []'
      : 'connections:\n' + m.connections.map(emitConnection).join('\n')
  )
  const body = emitBody(m.cards)
  return `---\n${fm.join('\n')}\n---\n\n${body}\n`
}

// ---------- parse ----------

/** Recursive-descent reader over our emitted inline grammar: "str" | num | bool | {..} | [..]. */
function parseInline(s: string): unknown {
  let i = 0
  const ws = (): void => {
    while (i < s.length && /\s/.test(s[i])) i++
  }
  function value(): unknown {
    ws()
    const ch = s[i]
    if (ch === '"') return string()
    if (ch === '{') return map()
    if (ch === '[') return array()
    return scalar()
  }
  function string(): string {
    let j = i + 1
    while (j < s.length) {
      if (s[j] === '\\') j += 2
      else if (s[j] === '"') break
      else j++
    }
    const lit = s.slice(i, j + 1)
    i = j + 1
    return JSON.parse(lit) as string
  }
  function scalar(): unknown {
    let j = i
    while (j < s.length && !',}]'.includes(s[j])) j++
    const tok = s.slice(i, j).trim()
    i = j
    if (tok === 'true') return true
    if (tok === 'false') return false
    const n = Number(tok)
    if (tok !== '' && !Number.isNaN(n)) return n
    return tok
  }
  function map(): Record<string, unknown> {
    const o: Record<string, unknown> = {}
    i++ // {
    ws()
    if (s[i] === '}') {
      i++
      return o
    }
    for (;;) {
      ws()
      let j = i
      while (j < s.length && s[j] !== ':') j++
      const key = s.slice(i, j).trim()
      i = j + 1
      o[key] = value()
      ws()
      if (s[i] === ',') {
        i++
        continue
      }
      if (s[i] === '}') {
        i++
        break
      }
      throw new Error('canvas: unterminated inline map')
    }
    return o
  }
  function array(): unknown[] {
    const a: unknown[] = []
    i++ // [
    ws()
    if (s[i] === ']') {
      i++
      return a
    }
    for (;;) {
      a.push(value())
      ws()
      if (s[i] === ',') {
        i++
        continue
      }
      if (s[i] === ']') {
        i++
        break
      }
      throw new Error('canvas: unterminated inline array')
    }
    return a
  }
  return value()
}

function splitFrontmatter(raw: string): { fm: string; body: string } {
  if (!raw.startsWith('---\n')) throw new Error('canvas: missing frontmatter')
  const end = raw.indexOf('\n---', 4)
  if (end === -1) throw new Error('canvas: unterminated frontmatter')
  const fm = raw.slice(4, end)
  const afterClose = raw.indexOf('\n', end + 1)
  if (afterClose === -1) throw new Error('canvas: frontmatter close marker not followed by newline')
  const body = raw.slice(afterClose + 1)
  return { fm, body }
}

/** Parse the top-level frontmatter into a plain record (scalars, inline maps, block lists). */
function parseFrontmatter(fm: string): Record<string, unknown> {
  const lines = fm.split('\n')
  const top: Record<string, unknown> = {}
  let idx = 0
  while (idx < lines.length) {
    const line = lines[idx]
    if (line.trim() === '' || /^\s/.test(line)) {
      idx++
      continue
    }
    const colon = line.indexOf(':')
    const key = line.slice(0, colon).trim()
    const rest = line.slice(colon + 1).trim()
    if ((key === 'cards' || key === 'connections') && rest !== '[]') {
      const groups: string[][] = []
      let cur: string[] | null = null
      idx++
      while (idx < lines.length && /^\s/.test(lines[idx]) && lines[idx].trim() !== '') {
        const l = lines[idx]
        if (/^\s*-\s/.test(l)) {
          if (cur) groups.push(cur)
          cur = [l.replace(/^\s*-\s/, '')]
        } else if (cur) cur.push(l.trim())
        idx++
      }
      if (cur) groups.push(cur)
      top[key] = groups.map(parseFields)
    } else {
      top[key] = parseInline(rest)
      idx++
    }
  }
  return top
}

/** A block-list item is a set of `key: value` lines (the first already has `- ` stripped), or a single-line inline map. */
function parseFields(fieldLines: string[]): Record<string, unknown> {
  // An inline-map item (e.g. a connection `{ from: ..., to: ... }`) is always a single line;
  // parse it directly. Reject continuation lines and non-object results rather than dropping/masking them.
  const first = fieldLines[0]
  if (first.startsWith('{') && first.endsWith('}')) {
    if (fieldLines.length > 1) throw new Error('canvas: malformed inline-map list item (unexpected continuation lines)')
    const parsed = parseInline(first)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('canvas: malformed inline-map list item')
    return parsed as Record<string, unknown>
  }
  // Otherwise, parse as field-list format (key: value pairs across lines)
  const o: Record<string, unknown> = {}
  for (const fl of fieldLines) {
    const c = fl.indexOf(':')
    o[fl.slice(0, c).trim()] = parseInline(fl.slice(c + 1).trim())
  }
  return o
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number') throw new Error(`canvas: ${name} must be a number`)
  return v
}
function string_(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new Error(`canvas: ${name} must be a string`)
  return v
}

function toAnchor(v: unknown): Anchor {
  if (typeof v !== 'object' || v === null) throw new Error('canvas: anchor must be a map')
  const a = v as Record<string, unknown>
  const anchor: Anchor = {
    start: num(a.start, 'anchor.start'),
    end: num(a.end, 'anchor.end'),
    exact: string_(a.exact, 'anchor.exact'),
    prefix: string_(a.prefix, 'anchor.prefix'),
    suffix: string_(a.suffix, 'anchor.suffix')
  }
  if (a.page !== undefined) {
    const p = a.page as { quads?: unknown }
    if (typeof p !== 'object' || p === null || !Array.isArray(p.quads))
      throw new Error('canvas: anchor.page malformed')
    anchor.page = {
      quads: p.quads.map((q) => {
        const r = q as Record<string, unknown>
        return {
          pageIndex: num(r.pageIndex, 'quad.pageIndex'),
          x: num(r.x, 'quad.x'),
          y: num(r.y, 'quad.y'),
          w: num(r.w, 'quad.w'),
          h: num(r.h, 'quad.h')
        }
      })
    }
  }
  return anchor
}

/** Map the body into { id → raw block text } using the card markers. */
function parseBodyBlocks(body: string, knownIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>()
  // Own-line markers only, and only for ids present in the frontmatter — so a marker-looking
  // line inside snapshot/note text can never split a card. (A note whose own text is exactly a
  // real card's marker line is an accepted v1 limitation; notes are plain prose.)
  const re = /^<!-- rb:card (\S+) -->$/gm
  const marks: { id: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (knownIds.has(m[1])) marks.push({ id: m[1], start: m.index, end: re.lastIndex })
  }
  for (let k = 0; k < marks.length; k++) {
    const contentStart = marks[k].end
    const contentEnd = k + 1 < marks.length ? marks[k + 1].start : body.length
    out.set(marks[k].id, body.slice(contentStart, contentEnd).replace(/^\n/, '').trimEnd())
  }
  return out
}

/** For an excerpt block: leading blockquote = snapshot, trailing prose = note. */
function splitExcerptBlock(block: string): { snapshot: string; note: string } {
  const lines = block.split('\n')
  const quote: string[] = []
  let i = 0
  while (i < lines.length && lines[i].startsWith('>')) {
    quote.push(lines[i].replace(/^>\s?/, ''))
    i++
  }
  while (i < lines.length && lines[i].trim() === '') i++
  return { snapshot: quote.join('\n'), note: lines.slice(i).join('\n').trim() }
}

export function parseCanvas(raw: string): CanvasModel {
  const { fm, body } = splitFrontmatter(raw)
  const top = parseFrontmatter(fm)
  const id = string_(top.id, 'id')
  const title = string_(top.title, 'title')
  const vp = top.viewport as Record<string, unknown> | undefined
  if (!vp || typeof vp !== 'object') throw new Error('canvas: viewport required')
  const viewport: Viewport = {
    x: num(vp.x, 'viewport.x'),
    y: num(vp.y, 'viewport.y'),
    zoom: num(vp.zoom, 'viewport.zoom')
  }
  const rawCards = Array.isArray(top.cards) ? (top.cards as Record<string, unknown>[]) : []
  const knownIds = new Set(rawCards.map((rc) => String(rc.id)))
  const blocks = parseBodyBlocks(body, knownIds)
  const cards: Card[] = rawCards.map((rc) => {
    const cid = string_(rc.id, 'card.id')
    const kind = string_(rc.kind, 'card.kind')
    const base = { id: cid, x: num(rc.x, 'card.x'), y: num(rc.y, 'card.y') } as CardBase
    if (rc.w !== undefined) base.w = num(rc.w, 'card.w')
    if (rc.h !== undefined) base.h = num(rc.h, 'card.h')
    const block = blocks.get(cid) ?? ''
    if (kind === 'excerpt') {
      const { snapshot, note } = splitExcerptBlock(block)
      const ex: ExcerptCard = { ...base, kind: 'excerpt', source: string_(rc.source, 'card.source'), anchor: toAnchor(rc.anchor), snapshot, note }
      if (rc.color !== undefined) ex.color = string_(rc.color, 'card.color')
      if (rc.sourceAnnotationId !== undefined) ex.sourceAnnotationId = string_(rc.sourceAnnotationId, 'card.sourceAnnotationId')
      return ex
    }
    if (kind === 'note') return { ...base, kind: 'note', note: block.trim() }
    throw new Error(`canvas: unknown card kind ${kind}`)
  })
  const rawConns = Array.isArray(top.connections) ? (top.connections as Record<string, unknown>[]) : []
  const connections: Connection[] = rawConns.map((c) => {
    const conn: Connection = { from: string_(c.from, 'connection.from'), to: string_(c.to, 'connection.to') }
    if (c.label !== undefined) conn.label = string_(c.label, 'connection.label')
    return conn
  })
  const model: CanvasModel = {
    schemaVersion: typeof top.schemaVersion === 'number' ? top.schemaVersion : CANVAS_SCHEMA_VERSION,
    id,
    title,
    viewport,
    cards,
    connections
  }
  if (top.deleted === true) model.deleted = true
  return model
}

/** Cheap soft-delete read for listing (no full parse). */
export function canvasDeleted(raw: string): boolean {
  if (!raw.startsWith('---\n')) return false
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return false
  return /^deleted:\s*true\s*$/m.test(raw.slice(4, end))
}

/** Cheap title read for listing (no full parse); null if no title line. */
export function canvasTitle(raw: string): string | null {
  if (!raw.startsWith('---\n')) return null
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return null
  for (const line of raw.slice(4, end).split('\n')) {
    const m = /^title:\s*(.*)$/.exec(line)
    if (m) {
      try {
        return JSON.parse(m[1]) as string
      } catch {
        return m[1].trim()
      }
    }
  }
  return null
}
