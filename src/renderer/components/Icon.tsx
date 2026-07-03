import type { JSX } from 'react'

export type IconName =
  | 'home' | 'layers' | 'link' | 'pin' | 'edit' | 'trash' | 'close'
  | 'sun' | 'moon' | 'monitor' | 'library' | 'detach'
  | 'document' | 'diamond' | 'search' | 'chevron-up' | 'chevron-down'

// 20x20 viewBox, 1.5 stroke, rounded caps. Paths only — the <svg> supplies stroke/fill.
const PATHS: Record<IconName, JSX.Element> = {
  home: <><path d="M3 9l7-6 7 6" /><path d="M5 8v8h10V8" /></>,
  layers: <><path d="M10 3l7 4-7 4-7-4 7-4z" /><path d="M3 11l7 4 7-4" /></>,
  link: <><path d="M8 12a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1" /><path d="M12 8a3 3 0 0 0-4 0l-2 2a3 3 0 0 0 4 4l1-1" /></>,
  pin: <><path d="M7 3h6l-1 5 2 3H6l2-3-1-5z" /><path d="M10 11v5" /></>,
  edit: <><path d="M4 13.5V16h2.5L14 8.5 11.5 6 4 13.5z" /><path d="M11.5 6 14 8.5" /></>,
  trash: <><path d="M4 6h12" /><path d="M7 6V4h6v2" /><path d="M6 6l1 10h6l1-10" /></>,
  close: <><path d="M5 5l10 10M15 5L5 15" /></>,
  sun: <><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M15.5 4.5l-1.4 1.4M5.9 14.1l-1.4 1.4" /></>,
  moon: <><path d="M16 11.5A6 6 0 1 1 8.5 4a4.6 4.6 0 0 0 7.5 7.5z" /></>,
  monitor: <><rect x="3" y="4" width="14" height="9" rx="1" /><path d="M7 17h6M10 13v4" /></>,
  library: <><path d="M10 5C8.5 4 6 3.5 4 4v11c2-.5 4.5 0 6 1 1.5-1 4-1.5 6-1V4c-2-.5-4.5 0-6 1z" /><path d="M10 5v11" /></>,
  detach: <><path d="M11 5h4v4" /><path d="M15 5l-6 6" /><rect x="3" y="9" width="8" height="8" rx="1" /></>,
  document: <><path d="M5 3h7l3 3v11H5z" /><path d="M12 3v3h3" /></>,
  diamond: <><path d="M10 3.5l6.5 6.5-6.5 6.5L3.5 10z" /></>,
  search: <><circle cx="9" cy="9" r="5" /><path d="M12.6 12.6L17 17" /></>,
  'chevron-up': <><path d="M6 13l4-4 4 4" /></>,
  'chevron-down': <><path d="M6 7l4 4 4-4" /></>,
}

export function Icon({ name, size = 17 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto', display: 'inline-block', verticalAlign: 'middle' }}
    >
      {PATHS[name]}
    </svg>
  )
}
