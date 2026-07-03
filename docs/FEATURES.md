# readbetter - Feature Summary

## Reader

Reader is a browser-based reading surface for PDF and Markdown. It keeps your current position visible through section-aware tracking and is designed to work with normal browser tabs and windows.

The important workspace feature is native browser architecture: open more than one thing, detach a tab into a separate window, and use your operating system to arrange reading, writing, and annotation surfaces side by side.

## Supported formats

readbetter currently supports:

- PDF
- Markdown

Other document formats are not part of the current supported product surface.

## Annotations

Select a passage to highlight it and attach an optional note. Annotations are saved outside the source document in open JSON sidecars. Source files are not rewritten.

Anchors use a layered strategy: stable text matching first, format-specific fallback where available, and orphan handling when source text no longer exists after re-import.

## Canvas Studio

Canvas is a spatial synthesis board connected to Reader.

- **Excerpt cards:** create cards from highlighted passages with backlinks to the source.
- **Note cards:** add your own writing.
- **Connections:** draw labeled relationships between cards.
- **Pan and zoom:** arrange cards freely on a board.
- **Portable storage:** canvases are Markdown files with YAML frontmatter, not a proprietary database format.
- **Obsidian Canvas export:** export a JSONCanvas `.canvas` file and Markdown notes for use in Obsidian.

## Browser workspace

Multiple documents and canvases can be open in browser tabs. Tabs can be detached into separate browser windows, which lets the browser and operating system multiply the space available for reading, writing, comparing, and annotation.

## Pin and Compare

Pin and Compare is coming soon. The intended workflow is to pin passages side by side, compress irrelevant intervening content, and compare without treating documents as endless scrolls.

## Local-first projects

readbetter works with folders already on disk. A project is a registered folder, source documents stay untouched, and generated data is stored as portable sidecars or Markdown.

- Register one or more project folders.
- Read PDF and Markdown files recursively from the registered folder.
- Store annotations outside source documents.
- Store canvases as Markdown with YAML frontmatter.
- Remove a project from the registry without deleting files.

## Dark mode

The theme toggle switches light and dark mode, respects the OS default on first load, and persists across sessions.

## Intentionally out of scope right now

- Broad file format support beyond PDF and Markdown.
- Pin and Compare, until it ships.
- Cloud sync.
- AI features by default.
- DOCX support.
- Session mode.
- Canvas auto-layout, drawing, or image tools.
- The removed Spine navigator. Navigation now uses section-aware tracking inside Reader.
