import type { JSX } from 'react'
import { CanvasStudio, type CanvasStudioProps } from './CanvasStudio'

/** A pane's canvas body: a thin pass-through over CanvasStudio. The canvas header actions
 *  (pin/Obsidian/rename/delete/close/detach) are carried by PaneHeader, composed by App (3a-2) —
 *  see the contract resolution in the plan header. Concrete prop list = CanvasStudioProps. */
export type CanvasPaneBodyProps = CanvasStudioProps

export function CanvasPaneBody(props: CanvasPaneBodyProps): JSX.Element {
  return <CanvasStudio {...props} />
}
