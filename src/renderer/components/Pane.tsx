import type { JSX } from 'react'
import type { Pane as PaneModel } from '../hooks/usePanes'

/** One pane: a header over a body, in a flex column. App injects the concrete header/body. */
export function Pane({ pane, header, body }: { pane: PaneModel; header: JSX.Element; body: JSX.Element }): JSX.Element {
  return (
    <div
      data-testid={`pane-${pane.tabId}`}
      data-pane-kind={pane.kind}
      data-focused={pane.focused ? 'true' : undefined}
      style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      {header}
      {body}
    </div>
  )
}
