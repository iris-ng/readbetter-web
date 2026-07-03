import type { Section } from './document'

export interface StructureSummary {
  sectionCount: number
  /** Normalized section lengths bucketed into ≤ maxBars bars (sum ≈ 1). Empty for no sections. */
  proportions: number[]
}

export function summarizeStructure(sections: Section[], maxBars = 16): StructureSummary {
  const n = sections.length
  if (n === 0) return { sectionCount: 0, proportions: [] }
  const lengths = sections.map((s) => Math.max(1, s.charEnd - s.charStart))
  const total = lengths.reduce((a, b) => a + b, 0) || 1
  const bars = Math.min(maxBars, n)
  const buckets = new Array<number>(bars).fill(0)
  for (let i = 0; i < n; i++) buckets[Math.floor((i * bars) / n)] += lengths[i]
  return { sectionCount: n, proportions: buckets.map((v) => v / total) }
}
