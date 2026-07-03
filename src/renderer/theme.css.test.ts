// src/renderer/theme.css.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(__dirname, 'theme.css'), 'utf-8')

describe('theme.css token foundation', () => {
  it('uses warm-bronze accent in light mode and steel-blue in dark mode', () => {
    expect(css).toContain('--accent: #b07a35')   // light — warm bronze (reverted)
    expect(css).toContain('--accent: #8AA0C4')   // dark — steel-blue (unchanged)
    expect(css).not.toContain('--accent: #5F76A0') // old steel-blue light is gone
    expect(css).not.toContain('#d6a563')          // old brass dark never returns
  })
  it('defines the type, space, and radius scales', () => {
    expect(css).toContain('--text-base: 14px')
    expect(css).toContain('--space-4: 16px')
    expect(css).toContain('--radius-md: 8px')
    expect(css).toContain('--radius-pill: 999px')
  })
  it('defines the shared .rb-card and .rb-pill primitives', () => {
    expect(css).toContain('.rb-card')
    expect(css).toContain('.rb-pill')
    expect(css).toContain('.rb-pill--warn')
    expect(css).toContain('.rb-pill--danger')
  })
})
