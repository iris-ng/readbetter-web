import { describe, it, expect } from 'vitest'
import {
  emptySidecar,
  serializeSidecar,
  parseSidecar,
  SCHEMA_VERSION,
  addSavedView,
  renameSavedView,
  removeSavedView,
  isValidPinAnchor,
  SavedView,
  PinAnchor
} from './sidecar'

const pinAnchor = (sectionId: string): PinAnchor => ({
  sectionId,
  anchor: { start: 0, end: 5, exact: 'hello', prefix: '', suffix: '' }
})

describe('sidecar serialization', () => {
  it('round-trips an empty sidecar', () => {
    const s = emptySidecar('doc-uuid', 'abc123')
    expect(s).toEqual({
      schemaVersion: SCHEMA_VERSION,
      documentId: 'doc-uuid',
      sourceHash: 'abc123',
      annotations: [],
      readingHeat: null,
      links: [],
      orphans: [],
      savedViews: []
    })
    expect(parseSidecar(serializeSidecar(s))).toEqual(s)
  })

  it('round-trips annotations', () => {
    const s = emptySidecar('d', 'h')
    s.annotations.push({
      id: 'a1',
      anchor: { start: 1, end: 5, exact: 'quic', prefix: 'the ', suffix: 'k fo' },
      color: 'yellow',
      note: 'hi'
    })
    expect(parseSidecar(serializeSidecar(s))).toEqual(s)
  })

  it('round-trips an annotation anchor.page (PDF secondary selector)', () => {
    const sc = {
      ...emptySidecar('doc-1', 'hash-1'),
      annotations: [
        {
          id: 'a1',
          anchor: { start: 7, end: 12, exact: 'Hello', prefix: '', suffix: '', page: { quads: [{ pageIndex: 0, x: 10, y: 20, w: 30, h: 8 }] } },
          color: '#fde68a',
          note: ''
        }
      ]
    }
    const round = parseSidecar(serializeSidecar(sc))
    expect(round.annotations).toHaveLength(1)
    expect(round.annotations[0].anchor.page).toEqual({ quads: [{ pageIndex: 0, x: 10, y: 20, w: 30, h: 8 }] })
  })

  it('fills missing reserved fields with defaults', () => {
    const partial = JSON.stringify({
      schemaVersion: 1,
      documentId: 'd',
      sourceHash: 'h',
      annotations: []
    })
    const parsed = parseSidecar(partial)
    expect(parsed.readingHeat).toBeNull()
    expect(parsed.links).toEqual([])
  })

  it('throws on malformed JSON', () => {
    expect(() => parseSidecar('{not json')).toThrow()
  })

  it('throws when required fields are the wrong type', () => {
    expect(() => parseSidecar(JSON.stringify({ documentId: 5, annotations: [] }))).toThrow()
  })

  it('throws when the JSON root is null', () => {
    expect(() => parseSidecar('null')).toThrow(/JSON object/)
  })

  it('throws when the JSON root is a primitive', () => {
    expect(() => parseSidecar('"just a string"')).toThrow(/JSON object/)
  })

  it('throws when the JSON root is an array', () => {
    expect(() => parseSidecar('[]')).toThrow(/JSON object/)
  })

  it('throws when an annotation is missing its anchor', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      documentId: 'd',
      sourceHash: 'h',
      annotations: [{ id: 'a1', color: 'yellow', note: '' }]
    })
    expect(() => parseSidecar(raw)).toThrow(/malformed annotation/)
  })

  it('throws when an annotation anchor has wrong-typed fields', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      documentId: 'd',
      sourceHash: 'h',
      annotations: [{ id: 'a1', anchor: { start: 'x', end: 5, exact: 'q', prefix: '', suffix: '' }, color: 'y', note: '' }]
    })
    expect(() => parseSidecar(raw)).toThrow(/malformed annotation/)
  })

  it('still parses a well-formed annotation', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      documentId: 'd',
      sourceHash: 'h',
      annotations: [{ id: 'a1', anchor: { start: 0, end: 4, exact: 'quic', prefix: '', suffix: '' }, color: 'yellow', note: 'n' }]
    })
    expect(parseSidecar(raw).annotations).toHaveLength(1)
  })
})

describe('isValidPinAnchor', () => {
  it('accepts a well-formed pin anchor', () => {
    expect(isValidPinAnchor(pinAnchor('s1'))).toBe(true)
  })

  it('rejects a non-string sectionId', () => {
    expect(isValidPinAnchor({ sectionId: 5, anchor: pinAnchor('s1').anchor })).toBe(false)
  })

  it('rejects a missing anchor', () => {
    expect(isValidPinAnchor({ sectionId: 's1' })).toBe(false)
  })

  it('rejects an anchor with wrong-typed fields', () => {
    expect(
      isValidPinAnchor({ sectionId: 's1', anchor: { start: 'x', end: 5, exact: 'q', prefix: '', suffix: '' } })
    ).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(isValidPinAnchor(null)).toBe(false)
    expect(isValidPinAnchor('nope')).toBe(false)
  })
})

describe('saved views in the sidecar', () => {
  it('round-trips saved views with pinned anchors', () => {
    const s = emptySidecar('d', 'h')
    s.savedViews.push({ id: 'v1', name: 'A ⇄ B', pinnedAnchors: [pinAnchor('0-a'), pinAnchor('2-b')] })
    expect(parseSidecar(serializeSidecar(s))).toEqual(s)
  })

  it('defaults savedViews to [] when the field is absent', () => {
    const raw = JSON.stringify({ schemaVersion: 1, documentId: 'd', sourceHash: 'h', annotations: [] })
    expect(parseSidecar(raw).savedViews).toEqual([])
  })

  it('drops malformed saved-view entries without throwing', () => {
    const ok = { id: 'ok', name: 'n', pinnedAnchors: [pinAnchor('x')] }
    const raw = JSON.stringify({
      schemaVersion: 1,
      documentId: 'd',
      sourceHash: 'h',
      annotations: [],
      savedViews: [ok, { id: 5, name: 'bad' }]
    })
    expect(parseSidecar(raw).savedViews).toEqual([ok])
  })

  it('filters out old-format saved views carrying pinnedSectionIds', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      documentId: 'd',
      sourceHash: 'h',
      annotations: [],
      savedViews: [{ id: 'old', name: 'legacy', pinnedSectionIds: ['0-a', '2-b'] }]
    })
    expect(parseSidecar(raw).savedViews).toEqual([])
  })

  it('rejects a saved view whose pinnedAnchors contains an invalid entry', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      documentId: 'd',
      sourceHash: 'h',
      annotations: [],
      savedViews: [{ id: 'v', name: 'n', pinnedAnchors: [{ sectionId: 's', anchor: { start: 'x' } }] }]
    })
    expect(parseSidecar(raw).savedViews).toEqual([])
  })

  it('addSavedView / renameSavedView / removeSavedView are pure', () => {
    const v: SavedView = { id: 'v1', name: 'old', pinnedAnchors: [pinAnchor('a'), pinAnchor('b')] }
    const added = addSavedView([], v)
    expect(added).toEqual([v])
    expect(renameSavedView(added, 'v1', 'new')[0].name).toBe('new')
    expect(removeSavedView(added, 'v1')).toEqual([])
  })
})

describe('sidecar links', () => {
  const anchor = { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }

  it('round-trips word links, dropping malformed ones', () => {
    const sc = {
      ...emptySidecar('doc-1', 'hash'),
      links: [
        { id: 'l1', anchor, otherDocRef: 'documents/b.md' },
        { id: 'l2', anchor, otherDocRef: 'documents/b.md' }
      ]
    }
    const parsed = parseSidecar(serializeSidecar(sc))
    expect(parsed.links).toEqual(sc.links)

    const withJunk = JSON.parse(serializeSidecar(emptySidecar('doc-1', 'hash')))
    withJunk.links = [{ id: 'ok', anchor, otherDocRef: 'd' }, { id: 'bad' }]
    expect(parseSidecar(JSON.stringify(withJunk)).links).toHaveLength(1)
  })

  it('defaults links to [] when the field is absent', () => {
    const raw = JSON.stringify({ schemaVersion: 1, documentId: 'd', sourceHash: 'h', annotations: [], savedViews: [] })
    expect(parseSidecar(raw).links).toEqual([])
  })

  it('ignores legacy crossLinks/connections fields (hard cut, no migration)', () => {
    const raw = JSON.stringify({
      schemaVersion: 1, documentId: 'd', sourceHash: 'h', annotations: [], savedViews: [],
      crossLinks: [{ id: 'x', annotationId: 'a', otherDocRef: 'd', otherAnnotationId: 'b' }],
      connections: [{ id: 'y', anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }, otherDocRef: 'd' }]
    })
    expect(parseSidecar(raw).links).toEqual([])
  })
})

describe('sidecar orphans (schema v3)', () => {
  it('emptySidecar has an empty orphans array and schema version 3', () => {
    const s = emptySidecar('d', 'h')
    expect(s.orphans).toEqual([])
    expect(SCHEMA_VERSION).toBe(3)
  })

  it('round-trips orphaned annotations', () => {
    const s = emptySidecar('d', 'h')
    s.orphans.push({
      id: 'o1',
      color: 'yellow',
      note: 'lost',
      anchor: { start: 0, end: 3, exact: 'abc', prefix: '', suffix: '' }
    })
    expect(parseSidecar(serializeSidecar(s)).orphans).toHaveLength(1)
  })

  it('defaults orphans to [] when absent (older sidecar JSON)', () => {
    const legacy = JSON.stringify({ documentId: 'd', sourceHash: 'h', annotations: [] })
    expect(parseSidecar(legacy).orphans).toEqual([])
  })
})
