/** Pure endpoint selection for link navigation. A link joins two docs; a ref shows in at most one
 *  pane (dual-writer guard), so `holders` has length 0, 1, or 2 (ascending pane index).
 *  - 2 holders: a fully-local arc. `from` = lower index, `to` = higher index (mirrors the arc
 *    rendering convention in App.recomputeLines PASS 1).
 *  - 1 holder: a lone dot. Its role is decided by pane index exactly as the rendering does
 *    (index 0 = the "from" end; any later index = the "to" end). Navigating toward the ABSENT
 *    partner end follows to open it; navigating toward the local end jumps locally.
 *  Open slot: beside the holder on the right (`holderIdx+1`), or — when that exceeds the pane cap —
 *  to the holder's left (`holderIdx`), so the holder stays visible. */
export interface LinkNavHolder { idx: number; tabId: string }
export interface LinkNavPlan { jump: number[]; follow?: { holderIdx: number; at: number } }

export function planLinkNav(
  holders: LinkNavHolder[],
  toEnd: 'from' | 'to' | 'both',
  maxShown: number
): LinkNavPlan {
  if (holders.length === 0) return { jump: [] }

  if (holders.length >= 2) {
    const [a, b] = holders
    if (toEnd === 'both') return { jump: [a.idx, b.idx] }
    if (toEnd === 'from') return { jump: [a.idx] }
    return { jump: [b.idx] }
  }

  const h = holders[0]
  const at = h.idx + 1 < maxShown ? h.idx + 1 : h.idx
  const follow = { holderIdx: h.idx, at }
  const localEnd = h.idx === 0 ? 'from' : 'to' // which end the lone dot represents
  if (toEnd === 'both') return { jump: [h.idx], follow }
  if (toEnd === localEnd) return { jump: [h.idx] }
  return { jump: [], follow }
}
