import { describe, it, expect } from 'vitest'
import { excerptCardFromDrop, type ExcerptDropPayload } from './excerptDrag'

describe('excerptCardFromDrop', () => {
 it('builds excerpt card input from payload and board point', () => {
  const payload: ExcerptDropPayload = {
   source: 'documents/d.md',
   anchor: { start: 5, end: 8, exact: 'abc', prefix: 'pre', suffix: 'suf' },
   snapshot: 'abc',
   color: '#fca5a5'
  }
  expect(excerptCardFromDrop(payload, { x: 40, y: 60 })).toEqual({
   source: 'documents/d.md',
   anchor: payload.anchor,
   snapshot: 'abc',
   color: '#fca5a5',
   previewDataUrl: undefined,
   sourceAnnotationId: undefined,
   x: 40,
   y: 60
  })
 })

 it('forwards sourceAnnotationId when present', () => {
  const card = excerptCardFromDrop(
   {
    source: 'd.md',
    anchor: { start: 0, end: 1, exact: 'a', prefix: '', suffix: '' },
    snapshot: 'a',
    color: '#fee',
    sourceAnnotationId: 'ann-1'
   },
   { x: 5, y: 6 }
  )
  expect(card.sourceAnnotationId).toBe('ann-1')
 })

 it('forwards previewDataUrl when present', () => {
  const card = excerptCardFromDrop(
   {
    source: 'd.md',
    anchor: { start: 0, end: 1, exact: 'a', prefix: '', suffix: '' },
    snapshot: 'a',
    previewDataUrl: 'data:image/png;base64,AAAA'
   },
   { x: 5, y: 6 }
  )
  expect(card.previewDataUrl).toBe('data:image/png;base64,AAAA')
 })
})
