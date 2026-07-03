import { Anchor, createAnchor } from '../../core/anchor/anchor'

const WORD = /\w/

/** Word boundaries around `offset`. On a non-word char, returns a zero-width range at `offset`. */
export function expandToWord(text: string, offset: number): { start: number; end: number } {
  if (offset < 0 || offset > text.length) return { start: offset, end: offset }
  if (!WORD.test(text[offset] ?? '')) return { start: offset, end: offset }
  let start = offset
  let end = offset
  while (start > 0 && WORD.test(text[start - 1])) start--
  while (end < text.length && WORD.test(text[end])) end++
  return { start, end }
}

/**
 * Find the nearest word to an offset. If the offset is on a word character, returns that word.
 * If the offset is on whitespace, returns the nearest word (preferring the preceding/left word
 * if equidistant — a click in the gap right after a word grabs that word).
 */
export function nearestWord(text: string, offset: number): { start: number; end: number } {
  const word = expandToWord(text, offset)
  if (word.end > word.start) return word

  // We're on whitespace; find the nearest word left and right
  let leftWord: { start: number; end: number } | null = null
  let rightWord: { start: number; end: number } | null = null

  // Scan left for a word
  for (let i = offset - 1; i >= 0; i--) {
    if (WORD.test(text[i])) {
      leftWord = expandToWord(text, i)
      break
    }
  }

  // Scan right for a word
  for (let i = offset + 1; i < text.length; i++) {
    if (WORD.test(text[i])) {
      rightWord = expandToWord(text, i)
      break
    }
  }

  // Return the nearest, preferring the preceding (left) word if equidistant
  if (!leftWord) return rightWord || word
  if (!rightWord) return leftWord

  const leftDist = offset - leftWord.end
  const rightDist = rightWord.start - offset
  return leftDist <= rightDist ? leftWord : rightWord
}

/**
 * Resolve a click point to the anchor of the word under it. Uses the reader's `data-cs`
 * (per-segment char-start) to map a DOM caret to a document char offset, then snaps to the
 * nearest word (on whitespace) or the word at the offset.
 * Returns null if the click isn't on resolvable document text. DOM-dependent → validated in smoke.
 */
export function wordAnchorFromPoint(clientX: number, clientY: number, docText: string): Anchor | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  let node: Node | null = null
  let nodeOffset = 0
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(clientX, clientY)
    if (r) { node = r.startContainer; nodeOffset = r.startOffset }
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(clientX, clientY)
    if (p) { node = p.offsetNode; nodeOffset = p.offset }
  }
  if (!node) return null
  const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))
  const csEl = el?.closest('[data-cs]') as HTMLElement | null
  if (!csEl) return null
  const base = Number(csEl.getAttribute('data-cs'))
  if (!Number.isFinite(base)) return null
  const charOffset = base + nodeOffset
  const { start, end } = nearestWord(docText, charOffset)
  if (end <= start) return null  // no word found at all
  return createAnchor(docText, start, end)
}
