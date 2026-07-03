import { render } from '@testing-library/react'
import { it, expect } from 'vitest'
import { ExcerptCard } from './ExcerptCard'
import type { ExcerptCard as ExcerptCardModel } from '../../core/canvas/canvas'

const baseCard: ExcerptCardModel = {
  id: 'c1',
  kind: 'excerpt',
  source: 'docs/a.md',
  anchor: { start: 0, end: 5, exact: 'hello', prefix: '', suffix: '' },
  snapshot: 'hello',
  note: '',
  x: 0,
  y: 0,
  w: 240
}

const noop = () => {}
const noopNote = (_note: string) => {}
const noopPointer = (_e: React.PointerEvent) => {}

it('untinted excerpt uses the steel-blue accent edge', () => {
  const { container } = render(
    <ExcerptCard
      card={baseCard}
      onClick={noop}
      onSetNote={noopNote}
      onPointerDownDrag={noopPointer}
    />
  )
  const quote = container.querySelector('blockquote') as HTMLElement
  const style = quote.getAttribute('style') ?? ''
  expect(style).toContain('var(--accent)')
})

it('annotation tint still wins over the accent default', () => {
  const tintedCard: ExcerptCardModel = { ...baseCard, color: '#ffd54a' }
  const { container } = render(
    <ExcerptCard
      card={tintedCard}
      onClick={noop}
      onSetNote={noopNote}
      onPointerDownDrag={noopPointer}
    />
  )
  const quote = container.querySelector('blockquote') as HTMLElement
  // jsdom normalises hex to rgb — check the computed borderLeftColor instead
  expect(quote.style.borderLeftColor).toBe('rgb(255, 213, 74)')
})

it('prefers liveColor over the cached card.color for the tint', () => {
  // Guards the `tint = liveColor ?? card.color` priority path: a different liveColor must win
  // over the card's cached color as the left-edge tint identity.
  const cachedCard: ExcerptCardModel = { ...baseCard, color: '#ffd54a' }
  const { container } = render(
    <ExcerptCard
      card={cachedCard}
      liveColor="#1122ff"
      onClick={noop}
      onSetNote={noopNote}
      onPointerDownDrag={noopPointer}
    />
  )
  const quote = container.querySelector('blockquote') as HTMLElement
  // jsdom normalises #1122ff → rgb(17, 34, 255). liveColor wins, NOT card.color (#ffd54a).
  expect(quote.style.borderLeftColor).toBe('rgb(17, 34, 255)')
})
