import { describe, it, expect } from 'vitest'
import { mapRun } from './pdfTextLayer'

describe('pdfTextLayer', () => {
  it('maps a run to CSS px by a single scale (top-left, no flip)', () => {
    expect(mapRun({ x: 10, y: 20, w: 30, h: 8 }, 2)).toEqual({
      left: 20,
      top: 40,
      width: 60,
      height: 16,
      fontSize: 16
    })
  })
})
