# readbetter — A Long Sample Document

This file exists to exercise the Reader's section navigation. It has many sections that
will not all fit on one screen, so pressing the Down and Up arrow keys visibly scrolls the
active section into view. Click anywhere in the window first so it has keyboard focus, then
press the arrow keys.

The text below is filler about the project's ideas, written only so each section has enough
body to push the next heading off-screen.

## 1. The Core Inversion

A document is not an endless scroll. It is a place with a stable shape. Most readers throw
that shape away the moment you start scrolling, and with it goes your spatial memory of where
things were.

readbetter keeps the shape visible and stable, so that "two-thirds of the way down, in the
dense part" becomes a real location you can return to rather than a vague feeling.

## 2. Two Surfaces, One Substrate

The Spine is where you navigate and orient. The Canvas is where you synthesize and build.
Both are views over the same underlying data: the document, its sections, your annotations,
your reading heat, and the excerpts you pull.

Because they share one substrate, an excerpt is a single object that appears as a card on the
Canvas and as a badge on the Spine at the same time. Build the model once; the surfaces are
thin.

## 3. The Spine

The Spine is a finite structural diagram — a ribbon of section blocks sized by length, shaded
by how much you have read, marked with annotation dots and cross-link arcs. It is an overview
and a navigator, not a reading surface.

Crucially, you never read on the Spine. Reading happens in a normal text reader. Clicking the
Spine jumps the reader. This single decision is what lets the Spine avoid an expensive
tile-based rendering engine.

## 4. The Reader

The Reader is deliberately ordinary: a clean, keyboard-first text surface where actual reading
happens. Sequential, comfortable, distraction-light.

The skeleton you are looking at right now is just this Reader, with the simplest possible
section navigation wired up. Everything else is built around it later.

## 5. The Canvas

Drag a passage out of the Reader and it becomes a card on the Canvas, with a live link back to
its source. Add free-text notes, draw connections, arrange spatially.

The Canvas is where understanding gets built rather than merely captured. Its native storage
format is Markdown with frontmatter — which means the native format is also the export format.
There is no lossy export step and no proprietary lock-in.

## 6. Anchoring

Annotations and excerpts are anchored with a three-layer scheme: a stable text hash first, a
format-specific fallback second (a DOM range for clean documents, page and coordinates for
PDF), and an orphan tray as recovery when a document is re-imported.

Annotations are never silently deleted. If an anchor breaks, it surfaces with its original
context so you can re-attach or dismiss it.

## 7. One Internal Model

Every format — EPUB, HTML, Markdown, and later PDF — normalizes to one internal Document
Model: ordered sections, text runs, and a stable anchor space. Only the importer and renderer
are format-specific.

This is why adding PDF later does not require rebuilding the Spine, the Canvas, annotations, or
export. They are all built once against the model.

## 8. Documents and Canvases

Documents and Canvases are independent top-level entities, joined by excerpts. This gives a
many-to-many relationship: many documents can feed one canvas, and one document can be
referenced across many canvases.

Document-scoped data — annotations, reading heat, the Spine — is shared everywhere the document
appears. Canvas-scoped data — arrangement, connections, notes — stays local to each canvas.

## 9. Local-First and Private

Everything works offline, with no cloud account required. Document content never leaves your
machine. Your research stays yours, in open and portable formats.

This is a positioning bet as much as a technical one: serve the solo researcher and knowledge
worker directly, rather than treating them as a funnel into an enterprise tier.

## 10. Zero AI by Default

Version one makes no AI calls of any kind. Every feature is designed to work fully without a
model. A later bring-your-own-key or local-model layer is strictly optional, and it lives
outside the core.

AI is infrastructure, not identity. The product's value is its design and structure; a model,
if you bring one, only makes that infrastructure smarter.

## 11. Reliability

Full undo and redo from the first version. Explicit save status. Open-format recovery. Never
lose work. These are not glamorous features, but they are the difference between a tool you
trust and one you tolerate.

The competitor that inspired this project is loved on tablets and broken on the desktop;
reliability on the desktop is a large part of the opening it leaves.

## 12. The Build Sequence

Milestone one is the clean-document core: import, Reader, Spine, annotations, and pin/compare.
Milestone two is the Studio: excerpts to Canvas, connections, and Markdown export. Milestone
three is PDF, dropped into the existing model as the one hard, contained module.

You are reading this inside the very first slice of milestone one — the walking skeleton.
Press the arrow keys to move between these sections, and watch the active section scroll into
view as you go.
