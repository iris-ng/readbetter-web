export interface PlacementCard { x: number; y: number; w?: number; h?: number }
export interface PlacementViewport { x: number; y: number; zoom: number }
export interface PlaceArgs {
  cards: PlacementCard[]
  viewport: PlacementViewport
  paneWidth: number
  viewportHeight: number
  cardW?: number
  cardH?: number
  pad?: number
}

/** Pick a board-space point for a new card: prefer open space nearest the center of the
 *  currently-visible area (so cards spread out near where the user is looking), falling back
 *  to a small cascade from the center only when the visible area is saturated. */
export function placeNewCard(args: PlaceArgs): { x: number; y: number } {
  const { cards, viewport: vp, paneWidth, viewportHeight } = args
  const NEW_W = args.cardW ?? 240
  const NEW_H = args.cardH ?? 150
  const PAD = args.pad ?? 16
  const z = vp.zoom

  // Visible board-space rectangle (un-project the viewport transform).
  const left = -vp.x / z
  const top = -vp.y / z
  const right = (-vp.x + paneWidth) / z
  const bottom = (-vp.y + viewportHeight) / z

  const boxOf = (c: PlacementCard) => ({ x: c.x, y: c.y, w: c.w ?? NEW_W, h: c.h ?? NEW_H })
  const overlaps = (px: number, py: number): boolean =>
    cards.some((c) => {
      const b = boxOf(c)
      return px < b.x + b.w + PAD && px + NEW_W + PAD > b.x && py < b.y + b.h + PAD && py + NEW_H + PAD > b.y
    })

  // Center of the visible area, offset so the card is centered on it.
  const cx = (left + right) / 2 - NEW_W / 2
  const cy = (top + bottom) / 2 - NEW_H / 2

  // All grid candidates across the visible area.
  const candidates: { x: number; y: number }[] = []
  for (let py = top + PAD; py + NEW_H <= bottom; py += NEW_H + PAD) {
    for (let px = left + PAD; px + NEW_W <= right; px += NEW_W + PAD) {
      candidates.push({ x: px, y: py })
    }
  }
  // Nearest-to-center first.
  candidates.sort(
    (a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2)
  )
  for (const c of candidates) {
    if (!overlaps(c.x, c.y)) return { x: Math.round(c.x), y: Math.round(c.y) }
  }

  // Saturated → small cascade from center so it still lands in view.
  const cascade = (cards.length % 8) * 28
  return { x: Math.round(cx + cascade), y: Math.round(cy + cascade) }
}
