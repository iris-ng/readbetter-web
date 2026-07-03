/** Sentinel highlight ids for search matches (mirrors backlinkFlash.ts). A range carrying one of
 *  these ids is rendered as a search hit, never as an interactive annotation. */
export const SEARCH_MATCH_ID = '__search_match__'
export const SEARCH_ACTIVE_ID = '__search_active__'

export type SearchMatch = { start: number; end: number }

/** All non-overlapping, case-insensitive occurrences of `query` in `text`, ordered by start
 *  offset. Offsets index into DocumentModel.text (the shared anchor space). */
export function findMatches(text: string, query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  const hay = text.toLowerCase()
  const out: SearchMatch[] = []
  let from = 0
  for (;;) {
    const i = hay.indexOf(needle, from)
    if (i === -1) break
    out.push({ start: i, end: i + needle.length })
    from = i + needle.length // non-overlapping
  }
  return out
}
