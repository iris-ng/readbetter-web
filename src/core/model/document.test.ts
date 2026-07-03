import { describe, it, expect } from 'vitest'
import { isDocumentModel, DocumentModel } from './document'

describe('isDocumentModel', () => {
  it('accepts a well-formed model', () => {
    const model: DocumentModel = {
      id: 'doc-1',
      title: 'Sample',
      format: 'markdown',
      text: 'Intro\nHello.',
      sections: [
        { id: '0-intro', level: 1, heading: 'Intro', order: 0, charStart: 0, charEnd: 11, paragraphs: ['Hello.'] }
      ]
    }
    expect(isDocumentModel(model)).toBe(true)
  })

  it('rejects a model missing sections', () => {
    expect(isDocumentModel({ id: 'x', title: 't', format: 'markdown', text: '' })).toBe(false)
  })

  it('rejects a model missing id', () => {
    expect(isDocumentModel({ title: 't', text: '', sections: [] })).toBe(false)
  })
  it('rejects a model missing title', () => {
    expect(isDocumentModel({ id: 'x', text: '', sections: [] })).toBe(false)
  })
  it('rejects a model missing text', () => {
    expect(isDocumentModel({ id: 'x', title: 't', sections: [] })).toBe(false)
  })
  it('rejects null', () => {
    expect(isDocumentModel(null)).toBe(false)
  })
  it('rejects a primitive', () => {
    expect(isDocumentModel('string')).toBe(false)
  })
})
