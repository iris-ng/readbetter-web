import { it, expect } from 'vitest'
import { buildDocTree } from './docTree'

it('nests files under their folders, folders first then alpha', () => {
  const tree = buildDocTree([
    { ref: 'b.md', name: 'b.md', ext: 'md' },
    { ref: 'kant/critique.epub', name: 'critique.epub', ext: 'epub' },
    { ref: 'kant/notes/x.md', name: 'x.md', ext: 'md' }
  ] as any)
  expect(tree[0].name).toBe('kant')            // folder before file
  expect(tree[0].children[0].name).toBe('notes') // subfolder first
  expect(tree[1]).toMatchObject({ name: 'b.md', ref: 'b.md' })
})
