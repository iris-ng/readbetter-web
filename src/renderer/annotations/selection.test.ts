import { describe, it, expect } from 'vitest'
import { offsetOf } from './selection'

function leaf(cs: number, text: string): Text {
  const span = document.createElement('span')
  span.dataset.cs = String(cs)
  const node = document.createTextNode(text)
  span.appendChild(node)
  return node
}

describe('offsetOf', () => {
  it('adds the leaf base offset to the in-node offset', () => {
    const node = leaf(100, 'hello world')
    expect(offsetOf(node, 3)).toBe(103)
  })

  it('returns null when there is no data-cs ancestor', () => {
    const node = document.createTextNode('orphan')
    document.createElement('div').appendChild(node)
    expect(offsetOf(node, 2)).toBeNull()
  })

  it('returns null for a null node', () => {
    expect(offsetOf(null, 0)).toBeNull()
  })
})
