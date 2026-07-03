/** Map a DOM point (text node + in-node offset) to an absolute offset into DocumentModel.text. */
export function offsetOf(node: Node | null, offsetInNode: number): number | null {
  if (!node) return null
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
  const leaf = el?.closest('[data-cs]') as HTMLElement | null
  if (!leaf || leaf.dataset.cs === undefined) return null
  return Number(leaf.dataset.cs) + offsetInNode
}

/** Convert the current selection to an ordered [start, end) range, or null if unusable. */
export function rangeFromSelection(sel: Selection | null): { start: number; end: number } | null {
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const a = offsetOf(sel.anchorNode, sel.anchorOffset)
  const b = offsetOf(sel.focusNode, sel.focusOffset)
  if (a === null || b === null || a === b) return null
  return { start: Math.min(a, b), end: Math.max(a, b) }
}
