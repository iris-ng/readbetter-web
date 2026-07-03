import type { JSX } from 'react'
import type { PlatformAdapter } from '../platform'
import type { Loaded } from '../App'
import type { ExcerptDropPayload } from '../canvas/excerptDrag'
import type { Link } from '../../core/link/link'
import type { LinkPick } from '../annotations/linkPick'
import type { ResolvedAnnotation } from '../annotations/useAnnotations'
import { DocumentPane } from './DocumentPane'

/** Concrete prop shapes mirror DocumentPane's (its DocumentPaneProps is not exported, and the
 *  overview's PaneCallbacks/RegisterPane indexed-access refs do not exist in the tree — see the
 *  contract resolutions in the plan header). flashRange carries no nonce; connectionJump does. */
export interface DocPaneBodyProps {
  loaded: Loaded
  tabId: string
  platform: PlatformAdapter
  projectId: string
  flashRange: { start: number; end: number } | null
  connectionJump: { start: number; end: number; nonce: number } | null // from connJumpByTab[tabId]
  connectMode: boolean
  onConnectPick: (docRef: string, pick: LinkPick) => void
  onSendExcerpt: (payload: ExcerptDropPayload) => void
  onAnnotationsResolved: (sourcePath: string, annotations: ResolvedAnnotation[]) => void
  onLinksResolved: (sourcePath: string, links: Link[]) => void
  onRestoreNote: (note: string | null) => void
  registerPane: (ref: string, api: { addLink: (l: Link) => void; removeLink: (id: string) => void }) => void
  unregisterPane: (ref: string) => void
  /** Whether this pane's find-in-page SearchBar row is open (App owns per-tab state). */
  searchOpen: boolean
  /** Close this pane's search (also resets the query so reopening starts empty). */
  onCloseSearch: () => void
}

/** A pane's document body: a thin pass-through over DocumentPane, keyed by tabId so the pane
 *  remounts fresh per-doc hooks when reassigned (generalizes today's key={loaded.sourcePath}). */
export function DocPaneBody(props: DocPaneBodyProps): JSX.Element {
  return (
    <DocumentPane
      key={props.tabId}
      loaded={props.loaded}
      platform={props.platform}
      projectId={props.projectId}
      flashRange={props.flashRange}
      connectionJump={props.connectionJump}
      connectMode={props.connectMode}
      onConnectPick={props.onConnectPick}
      onSendExcerpt={props.onSendExcerpt}
      onAnnotationsResolved={props.onAnnotationsResolved}
      onLinksResolved={props.onLinksResolved}
      onRestoreNote={props.onRestoreNote}
      registerPane={props.registerPane}
      unregisterPane={props.unregisterPane}
      searchOpen={props.searchOpen}
      onCloseSearch={props.onCloseSearch}
    />
  )
}
