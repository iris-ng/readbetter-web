import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import type { PlatformAdapter } from './platform'
import { emptySidecar, serializeSidecar } from '../core/sidecar/sidecar'
import { createAnchor } from '../core/anchor/anchor'
import { hashContent } from '../core/hash'
import { importMarkdown } from '../core/import/markdown'
import { buildPdfModel } from '../core/import/pdf'
import * as linkPickMod from './annotations/linkPick'
import { canvasTitle, canvasDeleted } from '../core/canvas/canvas'
import { createBus, type CrossWindowBus, type CrossWindowMessage } from './crossWindow/bus'
import { createInMemoryChannelHub } from './crossWindow/testChannel'

vi.mock('./pdf/pdfjs', () => {
  // A fake pdf.js (mirrors the importer's structural GetDocumentFn) yielding one page.
  const getDocument = (_src: unknown) => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
        getTextContent: async () => ({
          items: [{ str: 'PDF text', transform: [1, 0, 0, 1, 10, 780], width: 40, height: 12 }]
        }),
        cleanup: () => {}
      })
    })
  })
  return { getDocument, makeRenderPage: () => () => {} }
})

const THREE = '# One\nAlpha.\n\n## Two\nBeta.\n\n## Three\nGamma.'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  // useTabs mirrors the active tab to the URL via pushState; reset it so a tab opened in one
  // test doesn't seed a phantom tab on the next test's mount.
  window.history.replaceState({}, '', '/')
  // Project gating (Task 6): the workspace renders only when a project is active. The default
  // adapter's listProjects returns one project 'p1'; seed it as active so every existing workspace
  // test still mounts the reader/cockpit rather than the ProjectsView gate. Gating tests clear this.
  try { localStorage.setItem('rb.activeProject', 'p1') } catch { /* ignore */ }
  // Default to a granting lock environment so the per-tab single-open notice never replaces the
  // workspace in tests that don't care about locking. Mocks the queue+query contract used by
  // useEntityLock: query() reports nothing held (probe → not locked), request() grants immediately
  // (cb({}) → acquired → not locked). The granting `request` mirrors a real blocking request that
  // is granted at once because no one else holds the lock.
  ;(navigator as unknown as { locks: unknown }).locks = {
    request: (_name: string, _opts: unknown, cb: (lock: unknown) => Promise<void>) =>
      Promise.resolve(cb({})),
    query: async () => ({ held: [] })
  }
})

function makeAdapter(opts: {
  entries?: { ref: string; name: string; ext: string }[]
  content?: string
  ref?: string
  sidecar?: string | null
  openDocument?: PlatformAdapter['openDocument']
  writeSidecar?: PlatformAdapter['writeSidecar']
  canvases?: Record<string, string>
}): PlatformAdapter {
  const ref = opts.ref ?? 'documents/note.md'
  const name = ref.split('/').pop()!
  // A live, mutable canvas store so writeCanvas is reflected by a subsequent listCanvases
  // (needed to exercise rename / soft-delete / restore end to end).
  const canvases: Record<string, string> = { ...(opts.canvases ?? {}) }
  const entries = opts.entries ?? [{ ref, name, ext: name.split('.').pop() ?? '' }]
  // The project-aware adapter (Task 6): every doc/sidecar/canvas method now leads with a projectId.
  // The mocks ignore it (single-project test harness) but MUST accept it positionally so the
  // `(ref) => …` overrides below stay correct — they read the SECOND positional arg.
  return {
    listProjects: vi
      .fn()
      .mockResolvedValue([{ id: 'p1', name: 'Lib', path: '/lib', docCount: entries.length }]),
    registerProject: vi
      .fn()
      .mockResolvedValue({ id: 'p1', name: 'Lib', path: '/lib', docCount: entries.length }),
    unregisterProject: vi.fn().mockResolvedValue(undefined),
    relocateProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'Lib', path: '/lib', docCount: 0 }),
    pickFolder: vi.fn().mockResolvedValue(null),
    listLibrary: vi.fn().mockResolvedValue(entries),
    openDocument:
      opts.openDocument ?? vi.fn(async (_pid: string, r: string) => ({ ref: r, content: opts.content ?? THREE, hash: '' })),
    openDocumentBytes: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    readSidecar: vi.fn().mockResolvedValue(opts.sidecar ?? null),
    writeSidecar: opts.writeSidecar ?? vi.fn().mockResolvedValue(undefined),
    parsePdf: vi.fn().mockResolvedValue({ pages: [], runs: [], scanned: false }),
    renderPdfPageImage: vi.fn().mockResolvedValue(new Blob([])),
    listCanvases: vi.fn(async () =>
      Object.entries(canvases).map(([cref, md]) => {
        const entry: { ref: string; name: string; title: string; deleted?: boolean } = {
          ref: cref,
          name: cref.split('/').pop()!,
          title: canvasTitle(md) ?? cref
        }
        if (canvasDeleted(md)) entry.deleted = true
        return entry
      })
    ),
    readCanvas: vi.fn(async (_pid: string, r: string) => canvases[r] ?? null),
    writeCanvas: vi.fn(async (_pid: string, r: string, md: string) => {
      canvases[r] = md
    }),
    obsidianExportExists: vi.fn().mockResolvedValue(false),
    writeObsidianExport: vi.fn().mockResolvedValue(undefined)
  }
}

describe('App', () => {
  it('opens a file (from the library list) and renders the Reader', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ content: THREE })} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('lists canvases in the library and opens one into a third pane', async () => {
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "Board A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const adapter = makeAdapter({ content: THREE, canvases: { 'canvases/a.md': canvasMd } })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    // Open the QuickPicker via the header search input, then select the canvas.
    await user.click(await screen.findByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    expect(await screen.findByTestId('canvas-board')).toBeInTheDocument()
  })

  it('renames an open canvas from the pane header', async () => {
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "Board A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const adapter = makeAdapter({ content: THREE, canvases: { 'canvases/a.md': canvasMd } })
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed Board')
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    await user.click(await screen.findByRole('button', { name: /rename canvas/i }))
    expect(await screen.findByText('Renamed Board')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('soft-deletes a canvas to Trash and restores it', async () => {
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "Board A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const adapter = makeAdapter({ content: THREE, canvases: { 'canvases/a.md': canvasMd } })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    // Open it via the Canvases section switch, delete → board closes, lands back in the library.
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    await user.click(await screen.findByRole('button', { name: /delete canvas/i }))
    expect(screen.queryByTestId('canvas-board')).not.toBeInTheDocument()
    // It left the active Canvases set: switch to Canvases and Board A is no longer listed.
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    expect(within(screen.getByTestId('canvas-list')).queryByText('Board A')).toBeNull()
    // It now lives in Trash.
    await user.click(screen.getByRole('tab', { name: /^Trash/ }))
    const trash = await screen.findByTestId('canvas-trash')
    expect(within(trash).getByText('Board A')).toBeInTheDocument()
    // Restore → Trash is now empty, and Board A is back in the active Canvases list.
    await user.click(within(trash).getByRole('button', { name: /restore/i }))
    expect(await screen.findByText(/trash is empty/i)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /^Canvases/ }))
    expect(within(screen.getByTestId('canvas-list')).getByText('Board A')).toBeInTheDocument()
  })

  it('opens a canvas cold from the library list (no document) into a canvas-only view', async () => {
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "Board A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const adapter = makeAdapter({ content: THREE, canvases: { 'canvases/a.md': canvasMd } })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    // From the library (no document open), navigate to the Canvases section and open Board A.
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    expect(await screen.findByTestId('canvas-board')).toBeInTheDocument()
    // (Pane model: a lone canvas pane renders the board directly; the old "Open a document…" hint
    // belonged to the retired canvas-only branch.)
  })

  it('closing the canvas pane hides the board', async () => {
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "Board A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const adapter = makeAdapter({ content: THREE, canvases: { 'canvases/a.md': canvasMd } })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    expect(await screen.findByTestId('canvas-board')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close pane/i }))
    expect(screen.queryByTestId('canvas-board')).not.toBeInTheDocument()
  })

  it('Export to Obsidian builds the bundle and writes it via the adapter', async () => {
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "Board A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const adapter = makeAdapter({ content: THREE, canvases: { 'canvases/a.md': canvasMd } })
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    await userEvent.click(await screen.findByRole('button', { name: /export to obsidian/i }))
    await waitFor(() => expect(adapter.obsidianExportExists).toHaveBeenCalledWith('p1', expect.any(String)))
    await waitFor(() => {
      const files = (adapter.writeObsidianExport as ReturnType<typeof vi.fn>).mock.calls[0][2] as { path: string }[]
      expect(files.some((f) => f.path.endsWith('.canvas'))).toBe(true)
    })
    vi.restoreAllMocks()
  })

  it('clicking an excerpt card flashes its source passage in the Reader', async () => {
    const docText = '# Intro\n\nAlpha paragraph.\n\n# Later\n\nThe TARGET passage sits here.'
    const s = docText.indexOf('TARGET')
    const e = s + 'TARGET'.length
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards:\n' +
      '  - id: "c1"\n    kind: "excerpt"\n    source: "documents/note.md"\n' +
      `    anchor: { start: ${s}, end: ${e}, exact: "TARGET", prefix: "", suffix: "" }\n` +
      '    x: 0\n    y: 0\nconnections: []\n---\n\n<!-- rb:card c1 -->\n> TARGET\n'
    const adapter = makeAdapter({ content: docText, canvases: { 'canvases/a.md': canvasMd } })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    // Open the QuickPicker via the header search input, then select the canvas.
    await user.click(await screen.findByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: 'A' }))
    await user.click(await screen.findByTestId('card-c1'))
    expect(await screen.findByTestId('backlink-flash')).toBeInTheDocument()
  })

  it('clicking a card whose source is a different document opens that document and flashes', async () => {
    const targetDoc = '# Intro\n\nAlpha.\n\n# Later\n\nThe TARGET passage here.'
    const s = targetDoc.indexOf('TARGET')
    const e = s + 'TARGET'.length
    const docs: Record<string, string> = { 'documents/note.md': THREE, 'documents/a.md': targetDoc }
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards:\n' +
      '  - id: "c1"\n    kind: "excerpt"\n    source: "documents/a.md"\n' +
      `    anchor: { start: ${s}, end: ${e}, exact: "TARGET", prefix: "", suffix: "" }\n` +
      '    x: 0\n    y: 0\nconnections: []\n---\n\n<!-- rb:card c1 -->\n> TARGET\n'
    const adapter = makeAdapter({
      entries: [
        { ref: 'documents/note.md', name: 'note.md', ext: 'md' },
        { ref: 'documents/a.md', name: 'a.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      canvases: { 'canvases/a.md': canvasMd }
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i })) // open the OTHER document first
    // Open the QuickPicker via the header search input, then select the canvas.
    await user.click(await screen.findByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: 'A' }))
    await user.click(await screen.findByTestId('card-c1'))
    // The card's source (documents/a.md) was opened on the left and its passage flashed.
    expect(await screen.findByTestId('backlink-flash')).toBeInTheDocument()
  })

  it('opens a PDF: parses via LiteParse, renders pages + selectable text + zoom', async () => {
    const adapter = makeAdapter({ entries: [{ ref: 'documents/p.pdf', name: 'p.pdf', ext: 'pdf' }], ref: 'documents/p.pdf' })
    ;(adapter.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue({
      pages: [{ index: 0, width: 600, height: 800 }],
      runs: [{ pageIndex: 0, text: 'Hello', x: 10, y: 20, w: 30, h: 12, ocr: false }],
      scanned: false
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /p\.pdf/i }))
    expect(await screen.findByTestId('pdf-page-0')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /zoom percentage/i })).toHaveValue(100)
    expect(adapter.writeSidecar).not.toHaveBeenCalled()
    expect(adapter.parsePdf).toHaveBeenCalledWith('p1', 'documents/p.pdf')
  })

  it('renders a persisted highlight when opening an annotated PDF, and writes nothing on open', async () => {
    const adapter = makeAdapter({ entries: [{ ref: 'documents/p.pdf', name: 'p.pdf', ext: 'pdf' }], ref: 'documents/p.pdf' })
    const parseMock = {
      pages: [{ index: 0, width: 600, height: 800 }],
      runs: [{ pageIndex: 0, text: 'Hello', x: 10, y: 20, w: 30, h: 12, ocr: false }],
      scanned: false
    }
    ;(adapter.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue(parseMock)
    // Derive the highlight's char offset from the same builder the app uses, so a change to the
    // page-heading template can't silently break this test.
    const doc = buildPdfModel(parseMock, 'p.pdf')
    const start = doc.text.indexOf('Hello')
    const end = start + 'Hello'.length
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        documentId: 'doc-1',
        sourceHash: 'h',
        annotations: [{ id: 'a1', anchor: { start, end, exact: 'Hello', prefix: '', suffix: '' }, color: '#fde68a', note: '' }],
        readingHeat: null,
        links: [],
        savedViews: []
      })
    )
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /p\.pdf/i }))
    expect(await screen.findByTestId('pdf-page-0')).toBeInTheDocument()
    expect(await screen.findByTestId('pdf-highlight')).toBeInTheDocument()
    expect(adapter.writeSidecar).not.toHaveBeenCalled()
  })

  it('arrow keys still move the shared active section', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ content: THREE })} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('section-1-two')).toHaveAttribute('data-active', 'true')
  })

  it('renders a saved annotation as a highlight on reopen', async () => {
    const side = emptySidecar('doc-1', hashContent(THREE))
    const start = importedTextIndexOf(THREE, 'Beta.')
    side.annotations.push({
      id: 'a1',
      anchor: createAnchor(importedText(THREE), start, start + 'Beta.'.length),
      color: '#fde68a',
      note: ''
    })
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ content: THREE, sidecar: serializeSidecar(side) })} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    const mark = await screen.findByText('Beta.')
    expect(mark.tagName).toBe('MARK')
  })

  it('shows orphaned annotations in the tray when the source changed', async () => {
    const side = emptySidecar('doc-1', 'STALE')
    side.annotations.push({
      id: 'a1',
      anchor: createAnchor('text that is absent now', 0, 4),
      color: '#fde68a',
      note: 'lost note'
    })
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ content: THREE, sidecar: serializeSidecar(side) })} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    expect(
      await screen.findByRole('complementary', { name: /orphaned annotations/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/lost note/)).toBeInTheDocument()
  })

  it('shows an error when import fails (unsupported format)', async () => {
    const user = userEvent.setup()
    render(
      <App
        adapter={makeAdapter({
          ref: 'documents/file.xyz',
          openDocument: vi.fn().mockResolvedValue({ ref: 'documents/file.xyz', content: 'x' })
        })}
      />
    )
    await user.click(await screen.findByRole('button', { name: /file\.xyz/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/unsupported/i)
  })

  it('surfaces an error when the bridge read rejects', async () => {
    const user = userEvent.setup()
    render(
      <App
        adapter={makeAdapter({
          openDocument: vi.fn().mockRejectedValue(new Error('Failed to read file'))
        })}
      />
    )
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to read file/i)
  })

  it('shows an error when the document cannot be opened (null)', async () => {
    const user = userEvent.setup()
    render(
      <App adapter={makeAdapter({ openDocument: vi.fn().mockResolvedValue(null) })} />
    )
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open/i)
  })

  it('resets the active section to the top when a new document is opened', async () => {
    const user = userEvent.setup()
    render(
      <App
        adapter={makeAdapter({
          entries: [
            { ref: 'documents/a.md', name: 'a.md', ext: 'md' },
            { ref: 'documents/b.md', name: 'b.md', ext: 'md' }
          ],
          openDocument: vi
            .fn()
            .mockImplementation(async (_pid: string, ref: string) => ({
              ref,
              content: ref.includes('a.md') ? THREE : '# Solo\nx.'
            }))
        })}
      />
    )
    await user.click(await screen.findByRole('button', { name: /a\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByTestId('section-2-three')).toHaveAttribute('data-active', 'true')
    // Home is now inside the project-switcher menu.
    await user.click(screen.getByRole('button', { name: /switch project/i }))
    await user.click(await screen.findByRole('menuitem', { name: /^Home$/i }))
    await user.click(await screen.findByRole('button', { name: /b\.md/i }))
    expect(await screen.findByTestId('section-0-solo')).toHaveAttribute('data-active', 'true')
  })

  it('opening a doc from the cockpit shows a tab; Home returns to the cockpit; the tab reopens it', async () => {
    const adapter = makeAdapter({
      entries: [
        { ref: 'documents/a.md', name: 'a.md', ext: 'md' },
        { ref: 'documents/b.md', name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({
        ref,
        content: ref.includes('a.md') ? THREE : '# Solo\nx.',
        hash: ''
      }))
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    // Open the first document from the cockpit row → a tab appears in the tab strip.
    await user.click(await screen.findByRole('button', { name: /a\.md/i }))
    const strip = await screen.findByTestId('open-rail')
    await screen.findByTestId('section-0-one') // the document view is showing
    expect(await within(strip).findByRole('button', { name: 'a.md' })).toBeInTheDocument()
    // Home is now inside the project-switcher menu → the cockpit (library-list) is shown again, document view gone.
    await user.click(screen.getByRole('button', { name: /switch project/i }))
    await user.click(await screen.findByRole('menuitem', { name: /^Home$/i }))
    expect(await screen.findByTestId('library-list')).toBeInTheDocument()
    expect(screen.queryByTestId('section-0-one')).toBeNull()
    // Click the tab → the document view returns from cache (no re-import).
    await user.click(within(strip).getByRole('button', { name: 'a.md' }))
    expect(await screen.findByTestId('section-0-one')).toBeInTheDocument()
    expect(adapter.openDocument).toHaveBeenCalledTimes(1) // cache hit on re-focus, not a re-parse
  })

  it('shows the single-open notice instead of the workspace when the active tab is locked elsewhere', async () => {
    // A lock environment that always reports the entity held by another window, and never grants
    // our queued request — modeling useEntityLock's queue+query contract: query() reports the name
    // held (probe → locked-elsewhere stays true), request() blocks forever (we never acquire).
    ;(navigator as unknown as { locks: unknown }).locks = {
      query: async () => ({ held: [{ name: 'rb:doc:documents/note.md' }] }),
      request: () => new Promise<void>(() => {})
    }
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ content: THREE })} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    // The notice replaces the document view; the workspace never renders.
    expect(await screen.findByText(/close it there to edit here/i)).toBeInTheDocument()
    expect(screen.queryByTestId('section-0-one')).toBeNull()
  })

  it('Open beside renders two document panes side by side; ✕ returns to single', async () => {
    const docB = '# Solo\n\nUnique-B-Content here.'
    const docs: Record<string, string> = { 'documents/note.md': THREE, 'documents/b.md': docB }
    const adapter = makeAdapter({
      entries: [
        { ref: 'documents/note.md', name: 'note.md', ext: 'md' },
        { ref: 'documents/b.md', name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' }))
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    // Open doc A (note.md) as the primary pane.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Open the 📚 picker and click "Open beside" on doc B.
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Both panes visible — check by article count.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // ✕ on the RIGHT (second) pane parks it → back to a single pane showing A.
    const closeBtns = screen.getAllByRole('button', { name: /close pane/i })
    await user.click(closeBtns[1])
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(await screen.findByTestId('section-0-one')).toBeInTheDocument()
  })

  it('Open beside: ✕ on LEFT pane promotes the right doc to single pane', async () => {
    const docB = '# Solo\n\nUnique-B-Content here.'
    const docs: Record<string, string> = { 'documents/note.md': THREE, 'documents/b.md': docB }
    const adapter = makeAdapter({
      entries: [
        { ref: 'documents/note.md', name: 'note.md', ext: 'md' },
        { ref: 'documents/b.md', name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' }))
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    // Open doc A (note.md) as the primary pane.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Open beside: doc B (b.md) in the right pane.
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Both panes visible — check by article count.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // ✕ on the LEFT (first) pane parks A: B reflows as the single shown pane.
    const closeBtns = screen.getAllByRole('button', { name: /close pane/i })
    await user.click(closeBtns[0])
    expect(await screen.findByTestId('section-0-solo')).toBeInTheDocument()
    expect(screen.queryByTestId('section-0-one')).toBeNull()
  })

  it('Open beside then open same doc again: no duplicate pane for the same ref (no dual-writer)', async () => {
    // Regression: open A beside B, then open B again "in new tab".
    // Pane model: tabs dedupe by kind+ref and panes are keyed by tabId, so B can never occupy two
    // panes — opening it again just (re)focuses its existing pane. A stays shown beside it.
    const docB = '# Solo\n\nUnique-B-Content here.'
    const docs: Record<string, string> = { 'documents/note.md': THREE, 'documents/b.md': docB }
    const adapter = makeAdapter({
      entries: [
        { ref: 'documents/note.md', name: 'note.md', ext: 'md' },
        { ref: 'documents/b.md', name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' }))
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    // Step 1: open doc A as primary.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Step 2: open doc B beside A (B is now the secondary / right pane).
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Both panes visible — check by article count.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // Step 3: open B again via the picker (normal open button — NOT "open beside").
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open in new tab: b\.md/i }))
    // The key invariant: exactly ONE section-0-solo element (B is never duplicated into a 2nd pane).
    await screen.findByTestId('section-0-solo')
    expect(screen.getAllByTestId('section-0-solo')).toHaveLength(1)
    // A's pane stays shown beside B (re-opening an already-shown doc just focuses it).
    expect(screen.getByTestId('section-0-one')).toBeInTheDocument()
  })
})

// Helpers: reproduce the importer's normalized text so the test computes correct offsets.
function importedText(src: string): string {
  return importMarkdown(src, 'x.md').text
}
function importedTextIndexOf(src: string, needle: string): number {
  return importedText(src).indexOf(needle)
}

// Build a sidecar pre-seeded with two highlights ("Alpha." and "Gamma.") so the App renders two
// <mark>s; pinning is then driven through each highlight's note popover (real text selection is
// impractical in jsdom). The two highlights live in sections One and Three (Two between them).
function sidecarWithTwoHighlights(): string {
  const side = emptySidecar('doc-1', hashContent(THREE))
  const text = importedText(THREE)
  for (const needle of ['Alpha.', 'Gamma.']) {
    const start = text.indexOf(needle)
    side.annotations.push({
      id: needle === 'Alpha.' ? 'h-alpha' : 'h-gamma',
      anchor: createAnchor(text, start, start + needle.length),
      color: '#fde68a',
      note: ''
    })
  }
  return serializeSidecar(side)
}

async function openNote(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /note\.md/i }))
}

// Open the popover on a highlight and click its Pin button. Reaching the second pin flips into
// Compare Mode, which unmounts the popover (read-only) — so only close it if it's still mounted.
async function pinHighlight(user: ReturnType<typeof userEvent.setup>, markText: string): Promise<void> {
  await user.click(screen.getByText(markText))
  await user.click(screen.getByRole('button', { name: /pin passage/i }))
  const close = screen.queryByRole('button', { name: /^close$/i })
  if (close) await user.click(close)
}

describe('App pin / Compare + saved views', () => {
  it('enters Compare Mode when two passages are pinned via the note popover', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ sidecar: sidecarWithTwoHighlights() })} />)
    await openNote(user)
    await screen.findByText('Alpha.')
    await pinHighlight(user, 'Alpha.')
    await pinHighlight(user, 'Gamma.')
    expect(screen.getAllByTestId('pinned-passage')).toHaveLength(2) // exactly the two pinned passages
    expect(screen.getAllByTestId('gap-band').length).toBeGreaterThanOrEqual(1) // compare mode is active
    expect(screen.queryByTestId('section-1-two')).toBeNull()
  })

  it('shows the AnchorTab after a single pin', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ sidecar: sidecarWithTwoHighlights() })} />)
    await openNote(user)
    await screen.findByText('Alpha.')
    await pinHighlight(user, 'Alpha.')
    expect(screen.getByRole('region', { name: /pinned passage/i })).toBeInTheDocument()
  })

  it('saves the current fold and shows it as a chip, persisting pinned anchors to the sidecar', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ sidecar: sidecarWithTwoHighlights(), writeSidecar })} />)
    await openNote(user)
    await screen.findByText('Alpha.')
    await pinHighlight(user, 'Alpha.')
    await pinHighlight(user, 'Gamma.')
    await user.click(screen.getByRole('button', { name: /save current/i }))
    expect(screen.getByRole('button', { name: 'Alpha. ⇄ Gamma.' })).toBeInTheDocument()
    await waitFor(() => expect(writeSidecar).toHaveBeenCalled())
    const written = JSON.parse(writeSidecar.mock.calls.at(-1)![2])
    expect(written.savedViews).toHaveLength(1)
    expect(written.savedViews[0].pinnedAnchors).toHaveLength(2) // exactly the two pinned passages
  })

  it('Escape releases all pins and exits Compare Mode', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ sidecar: sidecarWithTwoHighlights() })} />)
    await openNote(user)
    await screen.findByText('Alpha.')
    await pinHighlight(user, 'Alpha.')
    await pinHighlight(user, 'Gamma.')
    expect(screen.getAllByTestId('gap-band').length).toBeGreaterThanOrEqual(1)
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('gap-band')).toBeNull()
    expect(screen.getByTestId('section-1-two')).toBeInTheDocument()
  })

  it('restores a saved fold when its chip is clicked', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ sidecar: sidecarWithTwoHighlights() })} />)
    await openNote(user)
    await screen.findByText('Alpha.')
    await pinHighlight(user, 'Alpha.')
    await pinHighlight(user, 'Gamma.')
    await user.click(screen.getByRole('button', { name: /save current/i }))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('gap-band')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Alpha. ⇄ Gamma.' }))
    expect(screen.getAllByTestId('gap-band').length).toBeGreaterThanOrEqual(1)
  })

  it('shows a non-blocking note when a restored view resolves fewer than 2 passages', async () => {
    // A saved view whose pinned anchors point at text absent from THREE -> 0 resolve.
    const side = JSON.parse(sidecarWithTwoHighlights())
    side.savedViews = [
      {
        id: 'v-stale',
        name: 'Missing ⇄ Gone',
        pinnedAnchors: [
          { anchor: createAnchor('text that is absent now', 0, 4), sectionId: '0-one' },
          { anchor: createAnchor('text that is absent now', 5, 9), sectionId: '2-three' }
        ]
      }
    ]
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ sidecar: JSON.stringify(side) })} />)
    await openNote(user)
    await user.click(await screen.findByRole('button', { name: 'Missing ⇄ Gone' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/not found/i)
  })

  it('flushes a pending sidecar write on beforeunload', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ sidecar: sidecarWithTwoHighlights(), writeSidecar })} />)
    await openNote(user)
    await screen.findByText('Alpha.')
    // make the document dirty: pin two highlights and save a view
    await pinHighlight(user, 'Alpha.')
    await pinHighlight(user, 'Gamma.')
    await user.click(screen.getByRole('button', { name: /save current/i }))
    writeSidecar.mockClear()
    window.dispatchEvent(new Event('beforeunload'))
    expect(writeSidecar).toHaveBeenCalledTimes(1)
  })
})

// ── Task 7: the link gesture (drag a highlight onto a highlight in the OTHER pane) ───────────
describe('App cross-document link gesture', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const DOC_B = '# Solo\n\nUnique-B-Content here.'
  const docs: Record<string, string> = { [A_REF]: THREE, [B_REF]: DOC_B }

  // Each doc gets its OWN single-highlight sidecar with a distinct annotation id, so the two
  // written sidecars are unambiguously attributable (A's anno = h-a, B's anno = h-b).
  function sidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importedText(src)
    const needle = isA ? 'Alpha.' : 'Unique-B-Content'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.annotations.push({
      id: isA ? 'h-a' : 'h-b',
      anchor: createAnchor(text, start, start + needle.length),
      color: '#fde68a',
      note: ''
    })
    return serializeSidecar(side)
  }

  function makeLinkAdapter(writeSidecar: ReturnType<typeof vi.fn>): PlatformAdapter {
    return makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      writeSidecar,
      sidecar: null
    })
  }

  let writeSidecarSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    writeSidecarSpy = vi.fn().mockResolvedValue(undefined)
  })

  // The two-pane harness, seeded so A has highlight h-a and B has highlight h-b. Returns the
  // mark elements for the arm+click gesture.
  async function openTwoPaneLinkHarness(
    user: ReturnType<typeof userEvent.setup>
  ): Promise<{ markA: HTMLElement; markB: HTMLElement }> {
    const adapter = makeLinkAdapter(writeSidecarSpy)
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarForRef(ref))
    )
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Wait for both panes' articles to be present.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    const articles = screen.getAllByRole('article')
    const paneA = articles.find((el) => el.querySelector('[data-annotation-id="h-a"]'))!
    const paneB = articles.find((el) => el.querySelector('[data-annotation-id="h-b"]'))!
    const markA = paneA.querySelector('[data-annotation-id="h-a"]') as HTMLElement
    const markB = paneB.querySelector('[data-annotation-id="h-b"]') as HTMLElement
    expect(markA).toBeTruthy()
    expect(markB).toBeTruthy()
    return { markA, markB }
  }

  // C3: the 'Link to…' arm + click-drop create path was retired. Cross-link creation is now
  // ONLY via Connect mode (B2). The three arm/arm-cancel tests that exercised the
  // armedLink/handleArmLink/handleDropLink plumbing are removed here — their coverage is
  // superseded by the B2 Connect-mode tests in 'App B2: Connect-mode smart create'.

    // ── Task 9: click a dot → Jump the other pane + Unlink ──────────────────────────────────
  // Both docs are pre-seeded with the MIRRORED cross-link (shared id 'L1'), so clicking A's dot
  // can jump pane B to the partner highlight and Unlink can strip the link from BOTH sidecars.
  // Doc B is multi-section here so the Jump's pane-B navigation lands on a DISTINCT active section
  // (aB lives in B's second section "Bee", section index 1 — not the default active section 0).
  const DOC_B_MULTI = '# Aye\n\nFirst-B.\n\n## Bee\n\nUnique-B-Content here.'
  const linkedDocs: Record<string, string> = { [A_REF]: THREE, [B_REF]: DOC_B_MULTI }

  function linkedSidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = linkedDocs[ref]
    const text = importedText(src)
    const needle = isA ? 'Gamma.' : 'Unique-B-Content'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.annotations.push({
      id: isA ? 'aA' : 'aB',
      anchor: createAnchor(text, start, start + needle.length),
      color: '#fde68a',
      note: ''
    })
    const clAnchor = createAnchor(text, start, start + needle.length)
    side.links.push({
      id: 'L1',
      anchor: clAnchor,
      otherDocRef: isA ? B_REF : A_REF
    })
    return serializeSidecar(side)
  }

  function makeLinkedAdapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: linkedDocs[ref] ?? '', hash: '' })),
      writeSidecar: writeSidecarSpy,
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(linkedSidecarForRef(ref))
    )
    return adapter
  }

  async function openLinkedBeside(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Wait for both panes' articles to be present.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  }

  it("clicking the cross-link FROM dot in LinkLayer navigates pane B to the partner section", async () => {
    const user = userEvent.setup()
    render(<App adapter={makeLinkedAdapter()} />)
    await openLinkedBeside(user)

    // Before click: secondary pane B active section is Aye, not Bee.
    expect(screen.getByTestId("section-1-bee").getAttribute("data-active")).toBe("false")

    // Click the FROM dot in LinkLayer.
    const fromDot = await screen.findByTestId("link-dot-L1-from")
    fireEvent.click(fromDot)

    // Pane B navigates to aB section (Bee) - becomes the active section.
    await waitFor(() =>
      expect(screen.getByTestId("section-1-bee").getAttribute("data-active")).toBe("true")
    )
  })

  it("selecting a cross-link arc then pressing Delete removes the link from BOTH sidecars", async () => {
    const user = userEvent.setup()
    render(<App adapter={makeLinkedAdapter()} />)
    await openLinkedBeside(user)

    // The cross-link arc should be rendered in LinkLayer.
    const arc = await screen.findByTestId("link-arc-L1")

    // Enter Connect mode so select/Delete are gated in (C2).
    await user.click(screen.getByRole('button', { name: /draw/i }))

    // Click the arc to select it.
    fireEvent.click(arc)
    expect(arc).toHaveAttribute("data-selected", "true")

    // Press Delete - should remove the cross-link from BOTH sidecars.
    fireEvent.keyDown(window, { key: "Delete" })

    // The debounced write flushes for BOTH refs, each with an EMPTY crossLinks list.
    await waitFor(() => {
      const refsWritten = writeSidecarSpy.mock.calls.map((c) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })
    const lastFor = (ref: string): { links: unknown[] } =>
      JSON.parse(writeSidecarSpy.mock.calls.filter((c) => c[1] === ref).at(-1)![2])
    expect(lastFor(A_REF).links).toHaveLength(0)
    expect(lastFor(B_REF).links).toHaveLength(0)
  })

})

describe('App Connect tool', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const DOC_A = '# One\n\nAlpha word here.\n\n## Two\nMore.'
  const DOC_B = '# Solo\n\nBeta word here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B }

  function makeConnectAdapter(writeSidecar: ReturnType<typeof vi.fn>): PlatformAdapter {
    return makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      writeSidecar,
      sidecar: null
    })
  }

  async function openTwoPaneConnect(
    user: ReturnType<typeof userEvent.setup>,
    writeSidecar: ReturnType<typeof vi.fn>
  ): Promise<{ articleA: HTMLElement; articleB: HTMLElement }> {
    render(<App adapter={makeConnectAdapter(writeSidecar)} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Wait for both panes' articles to be present.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    const articles = screen.getAllByRole('article')
    const articleA = articles[0]
    const articleB = articles[1]
    return { articleA, articleB }
  }

  it('two-click connect: clicking A then B writes mirrored Connection to BOTH sidecars with same shared id', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    const anchorA = createAnchor(importMarkdown(DOC_A, 'note.md').text, 0, 5)
    const anchorB = createAnchor(importMarkdown(DOC_B, 'b.md').text, 0, 4)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA })
      .mockReturnValueOnce({ anchor: anchorB })

    const { articleA, articleB } = await openTwoPaneConnect(user, writeSidecar)

    // Toggle Connect mode on
    await user.click(screen.getByRole('button', { name: /draw/i }))

    // Click in pane A (first pick -- sets pendingConnStart)
    fireEvent.click(articleA)

    // Click in pane B (second pick -- completes the pair)
    fireEvent.click(articleB)

    // Both sidecars should have a Connection with the same shared id
    await waitFor(() => {
      const refsWritten = writeSidecar.mock.calls.map((c: unknown[]) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })

    const lastFor = (ref: string) =>
      JSON.parse(writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === ref).at(-1)![2] as string) as {
        links?: Array<{ id: string; otherDocRef: string }>
      }
    const aSide = lastFor(A_REF)
    const bSide = lastFor(B_REF)

    expect(aSide.links).toHaveLength(1)
    expect(bSide.links).toHaveLength(1)
    expect(aSide.links![0].id).toBe(bSide.links![0].id)
    expect(aSide.links![0].otherDocRef).toBe(B_REF)
    expect(bSide.links![0].otherDocRef).toBe(A_REF)

    vi.restoreAllMocks()
  })

  it('two clicks in the SAME pane write NO connection (second click re-picks start)', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    const anchorA1 = createAnchor(importMarkdown(DOC_A, 'note.md').text, 0, 5)
    const anchorA2 = createAnchor(importMarkdown(DOC_A, 'note.md').text, 6, 10)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA1 })
      .mockReturnValueOnce({ anchor: anchorA2 })

    const { articleA } = await openTwoPaneConnect(user, writeSidecar)

    // Toggle Connect mode on
    await user.click(screen.getByRole('button', { name: /draw/i }))

    // Two clicks in the same pane A -- should re-pick start, no connection created
    fireEvent.click(articleA)
    fireEvent.click(articleA)

    await new Promise((r) => setTimeout(r, 50))
    // No connection written to either doc
    for (const call of writeSidecar.mock.calls as unknown[][]) {
      const parsed = JSON.parse(call[2] as string) as { links?: unknown[] }
      if (parsed.links) {
        expect(parsed.links).toHaveLength(0)
      }
    }

    vi.restoreAllMocks()
  })
})

// ── Task 7: always-on connection rendering (path existence only; coords are smoke-only) ───────
describe('App connection rendering', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const DOC_A = THREE
  const DOC_B = '# Solo\n\nUnique-B-Content here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B }
  const CONN_ID = 'conn-1'

  // Each doc's sidecar carries ONE half of a mirrored Connection sharing CONN_ID. Each endpoint's
  // anchor.exact matches REAL text in its own document so resolveAnchor succeeds (jsdom resolves
  // the anchor → a DOM Range; rects are 0,0 but the path element still renders).
  function sidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importedText(src)
    const needle = isA ? 'Alpha.' : 'Unique-B-Content'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.links.push({
      id: CONN_ID,
      anchor: createAnchor(text, start, start + needle.length),
      otherDocRef: isA ? B_REF : A_REF
    })
    return serializeSidecar(side)
  }

  function makeConnAdapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarForRef(ref))
    )
    return adapter
  }

  it('renders a connection arc when both panes hold a doc with the mirrored connection', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeConnAdapter()} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Both endpoints resolve → a single connection arc renders in LinkLayer.
    expect(await screen.findByTestId(`link-arc-${CONN_ID}`)).toBeInTheDocument()
  })

  it('renders NO connection arc with only one pane open (no partner endpoint)', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeConnAdapter()} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Single pane: no secondary pane → no shared-id partner → no arc.
    expect(screen.queryByTestId(`link-arc-${CONN_ID}`)).toBeNull()
  })

  // ── Task 8: select + delete ──────────────────────────────────────────────────────────────────
  it('clicking a connection arc selects it (data-selected="true")', async () => {
    const user = userEvent.setup()
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const adapter = makeConnAdapter()
    ;(adapter as unknown as { writeSidecar: ReturnType<typeof vi.fn> }).writeSidecar = writeSidecar
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)
    // Enter Connect mode so select is available (C2).
    await user.click(screen.getByRole('button', { name: /draw/i }))
    // Click the arc to select it.
    fireEvent.click(arc)
    expect(arc).toHaveAttribute('data-selected', 'true')
  })

  it('Delete while connection selected removes it from BOTH sidecars', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const adapter = makeConnAdapter()
    ;(adapter as unknown as { writeSidecar: ReturnType<typeof vi.fn> }).writeSidecar = writeSidecar
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)
    // Enter Connect mode so select/Delete are gated in (C2).
    await user.click(screen.getByRole('button', { name: /draw/i }))
    // Select the connection.
    fireEvent.click(arc)
    expect(arc).toHaveAttribute('data-selected', 'true')
    // Dispatch Delete on window.
    fireEvent.keyDown(window, { key: 'Delete' })
    // Both sidecars should be rewritten with connections: [].
    await waitFor(() => {
      const refsWritten = writeSidecar.mock.calls.map((c: unknown[]) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })
    const lastFor = (ref: string) =>
      JSON.parse(writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === ref).at(-1)![2] as string) as {
        links?: unknown[]
      }
    expect(lastFor(A_REF).links).toHaveLength(0)
    expect(lastFor(B_REF).links).toHaveLength(0)
  })

  it('Delete while focus is in a textarea does NOT remove the selected connection', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const adapter = makeConnAdapter()
    ;(adapter as unknown as { writeSidecar: ReturnType<typeof vi.fn> }).writeSidecar = writeSidecar
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)
    // Enter Connect mode so select/Delete are gated in (C2).
    await user.click(screen.getByRole('button', { name: /draw/i }))
    // Select the connection.
    fireEvent.click(arc)
    expect(arc).toHaveAttribute('data-selected', 'true')
    // Open a highlight note popover to get a textarea focused.
    // Directly create and focus a textarea so we can simulate focus-in-edit-field.
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    // Now press Delete — the guard should block it.
    fireEvent.keyDown(window, { key: 'Delete' })
    // The connection should still be selected (not cleared).
    expect(arc).toHaveAttribute('data-selected', 'true')
    // No sidecar writes with links:[] from Delete (only initial load writes may exist).
    await new Promise((r) => setTimeout(r, 50))
    for (const call of writeSidecar.mock.calls as unknown[][]) {
      const parsed = JSON.parse(call[2] as string) as { links?: unknown[] }
      if (parsed.links !== undefined) {
        // Any write for links should NOT have an empty array (connection not deleted).
        expect(parsed.links).toHaveLength(1)
      }
    }
    document.body.removeChild(textarea)
  })
})

// ── Task 2: click a connection line to jump the opposite pane ────────────────────────────────
describe('App connection click-to-jump', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  // Doc A: same THREE (multi-section); the A-endpoint word is "Alpha." in section 0.
  const DOC_A = THREE
  // Doc B: two sections; the B-endpoint word is "Zebra" which lives in the SECOND section (index 1).
  const DOC_B_MULTI = '# First\n\nStart here.\n\n## Second\n\nZebra word lives here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B_MULTI }
  const CONN_ID = 'k1'

  // Each sidecar carries one half of a mirrored Connection. Doc A's endpoint is "Alpha." (section 0),
  // Doc B's endpoint is "Zebra" (section 1 — the LATER section, so a jump changes active index).
  function sidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importedText(src)
    const needle = isA ? 'Alpha.' : 'Zebra'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.links.push({
      id: CONN_ID,
      anchor: createAnchor(text, start, start + needle.length),
      otherDocRef: isA ? B_REF : A_REF
    })
    return serializeSidecar(side)
  }

  function makeJumpAdapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarForRef(ref))
    )
    return adapter
  }

  it('clicking a connection line in normal mode jumps the OPPOSITE pane (navigate works; no select)', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeJumpAdapter()} />)

    // Open A as primary, then Open beside B as secondary.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))

    // The connection arc should now render (both endpoints resolve) in LinkLayer.
    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)

    // Before click: secondary pane's second section (Second, index 1) is not active.
    expect(screen.getByTestId('section-1-second').getAttribute('data-active')).toBe('false')

    // jsdom: SVG getBoundingClientRect returns 0,0 — dFrom === dTo === 0, so nearer resolves to
    // 'from' (the `dFrom <= dTo` branch), farther='to' → onNavigate(id,'to') → jumps SECONDARY pane.
    fireEvent.click(arc)

    // (a) Navigate fires: secondary pane jumps to section containing "Zebra" (Second, index 1).
    await waitFor(() =>
      expect(screen.getByTestId('section-1-second').getAttribute('data-active')).toBe('true')
    )

    // (b) Select does NOT fire in normal mode: arc must NOT have data-selected (C2 gate).
    expect(screen.getByTestId(`link-arc-${CONN_ID}`)).not.toHaveAttribute('data-selected')
  })
})

// ── A2: unified LinkLayer feed (connections + cross-links merged) ────────────────────────────
describe('App A2: unified LinkLayer feed', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  // Doc A: THREE (One/Two/Three); connection endpoint "Alpha." section 0, crosslink endpoint "Gamma." section 2.
  const DOC_A = THREE
  // Doc B: two sections; both endpoints live in section 1 "Bee" ("Unique-B-Content here.").
  const DOC_B_MULTI = '# Aye\n\nFirst-B.\n\n## Bee\n\nUnique-B-Content here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B_MULTI }
  const CONN_ID = 'conn-1'
  const CL_ID = 'CL1'

  // Build a sidecar for one side of the mirrored connection + cross-link pair.
  // Connection: A endpoint "Alpha." (section 0), B endpoint "Unique-B-Content" (section 1 "Bee").
  // Cross-link: A annotation 'aA' on "Gamma." (section 2), B annotation 'aB' on "Unique-B-Content" (section 1 "Bee").
  function linkedSidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importedText(src)
    // Connection endpoint.
    const connNeedle = isA ? 'Alpha.' : 'Unique-B-Content'
    const connStart = text.indexOf(connNeedle)
    // Cross-link annotation endpoint.
    const clNeedle = isA ? 'Gamma.' : 'Unique-B-Content'
    const clStart = text.indexOf(clNeedle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    // Add the connection endpoint as a link.
    side.links.push({
      id: CONN_ID,
      anchor: createAnchor(text, connStart, connStart + connNeedle.length),
      otherDocRef: isA ? B_REF : A_REF
    })
    // Add the annotation for the cross-link endpoint.
    side.annotations.push({
      id: isA ? 'aA' : 'aB',
      anchor: createAnchor(text, clStart, clStart + clNeedle.length),
      color: '#fde68a',
      note: ''
    })
    // Add the cross-link endpoint as a link with annotationId.
    side.links.push({
      id: CL_ID,
      anchor: createAnchor(text, clStart, clStart + clNeedle.length),
      otherDocRef: isA ? B_REF : A_REF
    })
    return serializeSidecar(side)
  }

  function makeA2Adapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(linkedSidecarForRef(ref))
    )
    return adapter
  }

  async function openA2Beside(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Wait for both panes' articles to be present.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  }

  it('renders link-arc for BOTH connection and cross-link when both panes open', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeA2Adapter()} />)
    await openA2Beside(user)

    // Both arcs should exist in LinkLayer.
    expect(await screen.findByTestId(`link-arc-${CONN_ID}`)).toBeInTheDocument()
    expect(await screen.findByTestId(`link-arc-${CL_ID}`)).toBeInTheDocument()
    // ConnectionLayer is no longer rendered — its path testid should be absent.
    expect(screen.queryByTestId(`connection-path-${CONN_ID}`)).toBeNull()
  })

  it('clicking a cross-link dot navigates secondary pane WITHOUT entering Connect mode', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeA2Adapter()} />)
    await openA2Beside(user)

    // Before click: secondary pane's Bee section (index 1) is not active.
    expect(screen.getByTestId('section-1-bee').getAttribute('data-active')).toBe('false')

    // Click the FROM dot — clicking 'from' navigates to the 'to' end (secondary pane).
    // The secondary pane's 'aB' annotation is in "Unique-B-Content" in Bee section.
    fireEvent.click(await screen.findByTestId(`link-dot-${CL_ID}-from`))

    // Secondary pane should navigate to Bee section.
    await waitFor(() =>
      expect(screen.getByTestId('section-1-bee').getAttribute('data-active')).toBe('true')
    )

    // Connect mode toggle button should NOT show "Exit Connect mode" (normal mode preserved).
    expect(screen.queryByRole('button', { name: /exit draw mode/i })).toBeNull()
  })

  it('clicking a connection dot navigates secondary pane', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeA2Adapter()} />)
    await openA2Beside(user)

    // Before click: secondary pane's Bee section (index 1) is not active.
    expect(screen.getByTestId('section-1-bee').getAttribute('data-active')).toBe('false')

    // Click the FROM dot — clicking 'from' navigates to the 'to' end (secondary pane).
    // The secondary pane's connection endpoint is "Unique-B-Content" in Bee section.
    fireEvent.click(await screen.findByTestId(`link-dot-${CONN_ID}-from`))

    // Secondary pane should navigate to Bee section.
    await waitFor(() =>
      expect(screen.getByTestId('section-1-bee').getAttribute('data-active')).toBe('true')
    )
  })

  it('clicking a cross-link arc marks it data-selected="true" (fix: cross-links are selectable)', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeA2Adapter()} />)
    await openA2Beside(user)

    // Both arcs must be rendered before we can click.
    const crossLinkArc = await screen.findByTestId(`link-arc-${CL_ID}`)
    const connArc = await screen.findByTestId(`link-arc-${CONN_ID}`)

    // Enter Connect mode so select is gated in (C2).
    await user.click(screen.getByRole('button', { name: /draw/i }))

    // Click the cross-link arc → it should become selected.
    fireEvent.click(crossLinkArc)
    expect(crossLinkArc).toHaveAttribute('data-selected', 'true')

    // The connection arc should be unselected (no data-selected attribute when not selected).
    expect(connArc).not.toHaveAttribute('data-selected')
  })

  it('clicking a cross-link dot marks the cross-link arc data-selected="true"', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeA2Adapter()} />)
    await openA2Beside(user)

    const crossLinkArc = await screen.findByTestId(`link-arc-${CL_ID}`)

    // Enter Connect mode so select is gated in (C2).
    await user.click(screen.getByRole('button', { name: /draw/i }))

    // Click the FROM dot of the cross-link — onSelect fires with CL_ID.
    fireEvent.click(await screen.findByTestId(`link-dot-${CL_ID}-from`))
    expect(crossLinkArc).toHaveAttribute('data-selected', 'true')
  })

  // ── AM1 Change 1: to-dot navigates the PRIMARY pane (missing direction) ──────────────────────
  // The existing from-dot tests cover from→secondary. These cover the OPPOSITE direction:
  // clicking the TO dot (secondary endpoint dot) must navigate the PRIMARY pane to its endpoint.
  // Primary endpoint for both: "Gamma." which lives in section 2 "Three" (not the default active
  // section 0). So a successful jump flips section-2-three to data-active="true".

  it('clicking a cross-link TO dot navigates the PRIMARY pane to its endpoint (missing direction)', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeA2Adapter()} />)
    await openA2Beside(user)

    // Before click: primary section 2 "Three" is NOT active (section 0 "One" is).
    expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('false')

    // Click the TO dot — clicking 'to' navigates to the 'from' end (primary pane).
    // Primary's cross-link annotation 'aA' is on "Gamma." in section 2 "Three".
    fireEvent.click(await screen.findByTestId(`link-dot-${CL_ID}-to`))

    // Primary pane should navigate to Three section.
    await waitFor(() =>
      expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('true')
    )
  })

  it('clicking a connection TO dot navigates the PRIMARY pane to its endpoint (missing direction)', async () => {
    const user = userEvent.setup()
    // Use a variant of the A2 setup where A's connection endpoint is "Gamma." (section 2)
    // so that navigating to it produces a visible state change.
    const DOC_A_VAR = THREE // "Alpha." section 0, "Gamma." section 2
    const DOC_B_VAR = '# Aye\n\nFirst-B.\n\n## Bee\n\nUnique-B-Content here.'
    const CONN_ID_VAR = 'conn-var'
    const docsVar: Record<string, string> = { [A_REF]: DOC_A_VAR, [B_REF]: DOC_B_VAR }

    function sidecarVarForRef(ref: string): string {
      const isA = ref === A_REF
      const src = docsVar[ref]
      const text = importedText(src)
      // A's connection endpoint: "Gamma." in section 2 (non-default, detectable).
      const needle = isA ? 'Gamma.' : 'Unique-B-Content'
      const start = text.indexOf(needle)
      const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
      side.links.push({
        id: CONN_ID_VAR,
        anchor: createAnchor(text, start, start + needle.length),
        otherDocRef: isA ? B_REF : A_REF
      })
      return serializeSidecar(side)
    }

    const adapterVar = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docsVar[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapterVar.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarVarForRef(ref))
    )
    render(<App adapter={adapterVar} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Wait for both panes' articles to be present.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))

    // Before click: primary section 2 "Three" is NOT active.
    expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('false')

    // Click the TO dot — navigates to the 'from' end (primary pane's "Gamma." in section 2).
    fireEvent.click(await screen.findByTestId(`link-dot-${CONN_ID_VAR}-to`))

    // Primary pane should navigate to Three section.
    await waitFor(() =>
      expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('true')
    )
  })

  // ── AM1 Change 2: arc click aligns BOTH panes ────────────────────────────────────────────────
  // Clicking the arc body (not a dot) should fire onNavigate(id, 'both') so BOTH panes jump
  // to their respective endpoints simultaneously.
  it('clicking a connection arc aligns BOTH panes to their endpoints (arc=both)', async () => {
    const user = userEvent.setup()
    // Connection: A endpoint "Gamma." section 2, B endpoint "Unique-B-Content" section 1 "Bee".
    // After the arc click: primary jumps to "Gamma." (section 2 Three), secondary jumps to "Bee".
    const DOC_A_BOTH = THREE
    const DOC_B_BOTH = '# Aye\n\nFirst-B.\n\n## Bee\n\nUnique-B-Content here.'
    const CONN_BOTH = 'conn-both'
    const docsBoth: Record<string, string> = { [A_REF]: DOC_A_BOTH, [B_REF]: DOC_B_BOTH }

    function sidecarBothForRef(ref: string): string {
      const isA = ref === A_REF
      const src = docsBoth[ref]
      const text = importedText(src)
      const needle = isA ? 'Gamma.' : 'Unique-B-Content'
      const start = text.indexOf(needle)
      const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
      side.links.push({
        id: CONN_BOTH,
        anchor: createAnchor(text, start, start + needle.length),
        otherDocRef: isA ? B_REF : A_REF
      })
      return serializeSidecar(side)
    }

    const adapterBoth = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docsBoth[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapterBoth.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarBothForRef(ref))
    )
    render(<App adapter={adapterBoth} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    // Wait for both panes' articles to be present.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))

    // Before click: primary section 2 "Three" NOT active; secondary section 1 "Bee" NOT active.
    expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('false')
    expect(screen.getByTestId('section-1-bee').getAttribute('data-active')).toBe('false')

    // Click the arc body — should align BOTH panes.
    fireEvent.click(await screen.findByTestId(`link-arc-${CONN_BOTH}`))

    // Both panes should navigate to their endpoints.
    await waitFor(() => {
      expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('true')
      expect(screen.getByTestId('section-1-bee').getAttribute('data-active')).toBe('true')
    })
  })
})

// ── Lone secondary dot: following a link from the RIGHT pane to an UNOPENED doc must open the
//    partner in the OPPOSITE (primary/left) pane and KEEP the followed doc in place — it must not
//    hijack/replace the right pane the user is reading.
describe('App lone secondary dot opens the partner BESIDE (keeps the followed doc)', () => {
  const A_REF = 'documents/a.md'
  const B_REF = 'documents/b.md'
  const C_REF = 'documents/c.md'
  const DOC_A = '# Aydoc\n\nAlpha-A here.'
  const DOC_B = '# Beedoc\n\nUnique-B-Content here.'
  const DOC_C = '# Ceedoc\n\nUnique-C-Content here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B, [C_REF]: DOC_C }
  const LONE_ID = 'lone-1'

  // B carries ONE link whose partner is the UNOPENED doc C → a lone dot on the secondary pane.
  // C carries the mirror (only relevant once opened). A carries no links.
  function sidecarForRef(ref: string): string {
    const src = docs[ref]
    const text = importedText(src)
    const side = emptySidecar(`doc-${ref}`, hashContent(src))
    if (ref === B_REF) {
      const start = text.indexOf('Unique-B-Content')
      side.links.push({
        id: LONE_ID,
        anchor: createAnchor(text, start, start + 'Unique-B-Content'.length),
        otherDocRef: C_REF
      })
    } else if (ref === C_REF) {
      const start = text.indexOf('Unique-C-Content')
      side.links.push({
        id: LONE_ID,
        anchor: createAnchor(text, start, start + 'Unique-C-Content'.length),
        otherDocRef: B_REF
      })
    }
    return serializeSidecar(side)
  }

  function makeLoneAdapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'a.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' },
        { ref: C_REF, name: 'c.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarForRef(ref))
    )
    return adapter
  }

  async function openABesideB(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole('button', { name: /a\.md/i }))
    await screen.findByTestId('section-0-aydoc')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  }

  it('clicking the lone TO dot opens the partner as PRIMARY and leaves the secondary doc in place', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeLoneAdapter()} />)
    await openABesideB(user)

    // The lone dot for B's link to the unopened C renders on the secondary pane (the 'to' end).
    fireEvent.click(await screen.findByTestId(`link-dot-${LONE_ID}-to`))

    // The partner C opens as the new PRIMARY (left) pane…
    await waitFor(() => expect(screen.getByTestId('section-0-ceedoc')).toBeInTheDocument())
    // …and the secondary (right) pane STILL shows B — it was NOT replaced (the bug being fixed).
    expect(screen.getByTestId('section-0-beedoc')).toBeInTheDocument()
    // The previously-primary doc A was evicted from view (C took its left slot).
    expect(screen.queryByTestId('section-0-aydoc')).toBeNull()
  })
})

// ── Cross-window follow: raise the partner window (fixes "detach dot does nothing") ──────────
// A lone cross-link dot whose partner lives in ANOTHER window must, on click, both raise that
// window to the front (browsers block a background window from focusing itself — the raise has to
// happen inside THIS window's click gesture) and post `navigate` so it scrolls to its endpoint.
describe('App cross-window follow raises the partner window', () => {
  const A_REF = 'documents/a.md'
  const X_REF = 'documents/x.md'
  const DOC_A = '# Aydoc\n\nAlpha-A here.'
  const DOC_X = '# Exdoc\n\nUnique-X here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [X_REF]: DOC_X }
  const L_ID = 'xw-1'

  function sidecarForA(): string {
    const text = importMarkdown(DOC_A, 'a.md').text
    const start = text.indexOf('Alpha-A')
    const side = emptySidecar('doc-a', hashContent(DOC_A))
    side.links.push({ id: L_ID, anchor: createAnchor(text, start, start + 'Alpha-A'.length), otherDocRef: X_REF })
    return serializeSidecar(side)
  }

  function makeXwAdapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'a.md', ext: 'md' },
        { ref: X_REF, name: 'x.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(ref === A_REF ? sidecarForA() : null)
    )
    return adapter
  }

  function makeBusPair(): { busFactory: () => CrossWindowBus; other: CrossWindowBus; posted: CrossWindowMessage[] } {
    const channelFactory = createInMemoryChannelHub()
    const posted: CrossWindowMessage[] = []
    const busFactory = (): CrossWindowBus => {
      const real = createBus(channelFactory)
      return {
        post: (m: CrossWindowMessage) => { posted.push(m); real.post(m) },
        subscribe: (h) => real.subscribe(h),
        close: () => real.close()
      }
    }
    const other = createBus(channelFactory)
    return { busFactory, other, posted }
  }

  it('raises the holder window by id and posts navigate when another window holds the partner', async () => {
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<App adapter={makeXwAdapter()} busFactory={busFactory} />)

    await user.click(await screen.findByRole('button', { name: /a\.md/i }))
    await screen.findByTestId('section-0-aydoc')

    // Another window announces it holds the partner X (as a detached satellite would).
    act(() => {
      other.post({ type: 'presence', windowId: 'win-x', role: 'satellite', entity: { kind: 'doc', ref: X_REF } })
    })

    const dot = await screen.findByTestId(`link-dot-${L_ID}-from`)
    posted.length = 0
    openSpy.mockClear()
    fireEvent.click(dot)

    await waitFor(() => {
      // Raise the holder window (its id came over presence) so it comes to the front…
      expect(openSpy).toHaveBeenCalledWith('', 'win-x')
      // …and tell it to scroll to its own endpoint of the link.
      const nav = posted.find((m) => m.type === 'navigate') as
        | Extract<CrossWindowMessage, { type: 'navigate' }>
        | undefined
      expect(nav).toBeTruthy()
      expect(nav!.targetRef).toBe(X_REF)
      expect(nav!.linkId).toBe(L_ID)
    })
    openSpy.mockRestore()
  })
})

// ── B2: Connect-mode smart create — highlight+highlight=cross-link, else connection ─────────
describe('App B2: Connect-mode smart create', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const DOC_A = '# One\n\nAlpha word here.\n\n## Two\nMore text.'
  const DOC_B = '# Solo\n\nBeta word here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B }

  // Pre-seeded sidecars: A has highlight h-a on "Alpha", B has highlight h-b on "Beta".
  function sidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importMarkdown(src, ref.split('/').pop()!).text
    const needle = isA ? 'Alpha' : 'Beta'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.annotations.push({
      id: isA ? 'h-a' : 'h-b',
      anchor: createAnchor(text, start, start + needle.length),
      color: '#fde68a',
      note: ''
    })
    return serializeSidecar(side)
  }

  function makeB2Adapter(writeSidecar: ReturnType<typeof vi.fn>): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      writeSidecar,
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarForRef(ref))
    )
    return adapter
  }

  async function openTwoPaneB2(
    user: ReturnType<typeof userEvent.setup>,
    writeSidecar: ReturnType<typeof vi.fn>
  ): Promise<{ articleA: HTMLElement; articleB: HTMLElement }> {
    render(<App adapter={makeB2Adapter(writeSidecar)} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    const articles = screen.getAllByRole('article')
    return { articleA: articles[0], articleB: articles[1] }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hl+hl → link mirrored into BOTH sidecars (shared id, both links[])', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { articleA, articleB } = await openTwoPaneB2(user, writeSidecar)

    // Spy: first click = annotation pick in A (h-a), second click = annotation pick in B (h-b).
    const textA = importMarkdown(DOC_A, 'note.md').text
    const textB = importMarkdown(DOC_B, 'b.md').text
    const anchorA = createAnchor(textA, textA.indexOf('Alpha'), textA.indexOf('Alpha') + 'Alpha'.length)
    const anchorB = createAnchor(textB, textB.indexOf('Beta'), textB.indexOf('Beta') + 'Beta'.length)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA })
      .mockReturnValueOnce({ anchor: anchorB })

    // Enable Connect mode.
    await user.click(screen.getByRole('button', { name: /draw/i }))

    // Click in pane A (first pick).
    fireEvent.click(articleA)
    // Click in pane B (second pick — completes the pair).
    fireEvent.click(articleB)

    // Both sidecars should have a link with the same shared id.
    await waitFor(() => {
      const refsWritten = writeSidecar.mock.calls.map((c: unknown[]) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })

    const lastFor = (ref: string) =>
      JSON.parse(
        writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === ref).at(-1)![2] as string
      ) as { links?: Array<{ id: string; anchor: { exact: string }; otherDocRef: string }> }

    const aSide = lastFor(A_REF)
    const bSide = lastFor(B_REF)

    expect(aSide.links).toHaveLength(1)
    expect(bSide.links).toHaveLength(1)
    // Same shared id on both records.
    expect(aSide.links![0].id).toBe(bSide.links![0].id)
    // A's record pins to A's word anchor (Alpha), otherDocRef=B; B's record is the mirror.
    expect(aSide.links![0].anchor.exact).toBe('Alpha')
    expect(aSide.links![0].otherDocRef).toBe(B_REF)
    expect(bSide.links![0].anchor.exact).toBe('Beta')
    expect(bSide.links![0].otherDocRef).toBe(A_REF)
  })

  it('word+word → link mirrored into BOTH sidecars (shared id, both links[])', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { articleA, articleB } = await openTwoPaneB2(user, writeSidecar)

    const textA = importMarkdown(DOC_A, 'note.md').text
    const textB = importMarkdown(DOC_B, 'b.md').text
    const anchorA = createAnchor(textA, 0, 5)
    const anchorB = createAnchor(textB, 0, 4)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA })
      .mockReturnValueOnce({ anchor: anchorB })

    await user.click(screen.getByRole('button', { name: /draw/i }))
    fireEvent.click(articleA)
    fireEvent.click(articleB)

    await waitFor(() => {
      const refsWritten = writeSidecar.mock.calls.map((c: unknown[]) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })

    const lastFor = (ref: string) =>
      JSON.parse(
        writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === ref).at(-1)![2] as string
      ) as { links?: Array<{ id: string; otherDocRef: string }> }

    const aSide = lastFor(A_REF)
    const bSide = lastFor(B_REF)

    expect(aSide.links).toHaveLength(1)
    expect(bSide.links).toHaveLength(1)
    expect(aSide.links![0].id).toBe(bSide.links![0].id)
    expect(aSide.links![0].otherDocRef).toBe(B_REF)
    expect(bSide.links![0].otherDocRef).toBe(A_REF)
  })

  it('mixed (annotation in A, word in B) → link mirrored into BOTH sidecars', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { articleA, articleB } = await openTwoPaneB2(user, writeSidecar)

    const textA = importMarkdown(DOC_A, 'note.md').text
    const textB = importMarkdown(DOC_B, 'b.md').text
    // First pick: annotation in A (h-a) — provides its span anchor for the link.
    const anchorA = createAnchor(textA, textA.indexOf('Alpha'), textA.indexOf('Alpha') + 'Alpha'.length)
    // Second pick: bare word in B.
    const anchorB = createAnchor(textB, 0, 4)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA })
      .mockReturnValueOnce({ anchor: anchorB })

    await user.click(screen.getByRole('button', { name: /draw/i }))
    fireEvent.click(articleA)
    fireEvent.click(articleB)

    await waitFor(() => {
      const refsWritten = writeSidecar.mock.calls.map((c: unknown[]) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })

    const lastFor = (ref: string) =>
      JSON.parse(
        writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === ref).at(-1)![2] as string
      ) as { links?: Array<{ id: string; otherDocRef: string }> }

    const aSide = lastFor(A_REF)
    const bSide = lastFor(B_REF)

    expect(aSide.links).toHaveLength(1)
    expect(bSide.links).toHaveLength(1)
    expect(aSide.links![0].id).toBe(bSide.links![0].id)
    expect(aSide.links![0].otherDocRef).toBe(B_REF)
    expect(bSide.links![0].otherDocRef).toBe(A_REF)
  })

  it('same-pane second pick writes NOTHING (re-picks start, no model written)', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { articleA } = await openTwoPaneB2(user, writeSidecar)

    const textA = importMarkdown(DOC_A, 'note.md').text
    const anchorA1 = createAnchor(textA, 0, 5)
    const anchorA2 = createAnchor(textA, 6, 10)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA1 })
      .mockReturnValueOnce({ anchor: anchorA2 })

    await user.click(screen.getByRole('button', { name: /draw/i }))

    // Both clicks in pane A — should re-pick start, no connection or cross-link created.
    fireEvent.click(articleA)
    fireEvent.click(articleA)

    await new Promise((r) => setTimeout(r, 50))
    // No link written to either doc.
    for (const call of writeSidecar.mock.calls as unknown[][]) {
      const parsed = JSON.parse(call[2] as string) as {
        links?: unknown[]
      }
      if (parsed.links) expect(parsed.links).toHaveLength(0)
    }
  })
})

// ── C1: right-click a dot/arc to Remove (Connect mode only) ──────────────────────────────────
describe('App C1: right-click Remove (Connect mode only)', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const DOC_A = THREE
  const DOC_B = '# Solo\n\nUnique-B-Content here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B }
  const CONN_ID = 'rc-conn-1'

  // Sidecar with a mirrored connection sharing CONN_ID.
  function connSidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importedText(src)
    const needle = isA ? 'Alpha.' : 'Unique-B-Content'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.links.push({
      id: CONN_ID,
      anchor: createAnchor(text, start, start + needle.length),
      otherDocRef: isA ? B_REF : A_REF
    })
    return serializeSidecar(side)
  }

  function makeRcConnAdapter(writeSidecar: ReturnType<typeof vi.fn>): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      writeSidecar,
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(connSidecarForRef(ref))
    )
    return adapter
  }

  async function openTwoPaneRc(
    user: ReturnType<typeof userEvent.setup>,
    writeSidecar: ReturnType<typeof vi.fn>
  ): Promise<void> {
    render(<App adapter={makeRcConnAdapter(writeSidecar)} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  }

  it('right-click a connection dot in Connect mode removes the connection from BOTH sidecars', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    await openTwoPaneRc(user, writeSidecar)

    // Enter Connect mode.
    await user.click(screen.getByRole('button', { name: /draw/i }))

    // The arc must be rendered before right-clicking the dot.
    const fromDot = await screen.findByTestId(`link-dot-${CONN_ID}-from`)

    // Right-click the from-dot → should remove the connection from both sidecars.
    fireEvent.contextMenu(fromDot)

    await waitFor(() => {
      const refsWritten = writeSidecar.mock.calls.map((c: unknown[]) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })
    const lastFor = (ref: string) =>
      JSON.parse(writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === ref).at(-1)![2] as string) as {
        links?: unknown[]
      }
    expect(lastFor(A_REF).links).toHaveLength(0)
    expect(lastFor(B_REF).links).toHaveLength(0)
  })

  it('right-click a connection dot in NORMAL mode does NOT remove the connection', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    await openTwoPaneRc(user, writeSidecar)

    // Do NOT enter Connect mode — stay in normal mode.
    const fromDot = await screen.findByTestId(`link-dot-${CONN_ID}-from`)

    // Right-click the from-dot in normal mode → must NOT remove.
    fireEvent.contextMenu(fromDot)

    await new Promise((r) => setTimeout(r, 50))
    // No write with links:[] should have occurred.
    for (const call of writeSidecar.mock.calls as unknown[][]) {
      const parsed = JSON.parse(call[2] as string) as { links?: unknown[] }
      if (parsed.links !== undefined) {
        expect(parsed.links).toHaveLength(1)
      }
    }
  })

  it('right-click clears selectedLinkId (selection cleared after remove)', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    await openTwoPaneRc(user, writeSidecar)

    // Enter Connect mode.
    await user.click(screen.getByRole('button', { name: /draw/i }))

    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)
    // First select the arc by clicking it.
    fireEvent.click(arc)
    expect(arc).toHaveAttribute('data-selected', 'true')

    // Then right-click the from-dot to remove → selection cleared (arc no longer in DOM or deselected).
    const fromDot = screen.getByTestId(`link-dot-${CONN_ID}-from`)
    fireEvent.contextMenu(fromDot)

    // After removal, the arc should be gone from DOM (connection removed) and/or deselected.
    await waitFor(() => {
      expect(screen.queryByTestId(`link-arc-${CONN_ID}`)).toBeNull()
    })
  })
})

// ── BM1: navigate for Connect-mode-CREATED connections (Gate-B repro) ────────────────────────
// Unlike the AM1 seeded tests, these CREATE the connection via the real Connect-mode chain
// (spy linkPickFromPoint → onConnectPick → makeConnectionPair → addConnection), THEN click the
// rendered dots and assert the OPPOSITE pane's active section flips — both directions + mixed.
// Endpoints live in NON-default sections so a flip is observable.
describe('App BM1: navigate a Connect-mode-created connection', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  // A endpoint "Unique-A-Word" in section 1 "Bea"; B endpoint "Unique-B-Word" in section 1 "Dee".
  const DOC_A = '# Aye\n\nFirst-A.\n\n## Bea\n\nUnique-A-Word here.'
  const DOC_B = '# See\n\nFirst-B.\n\n## Dee\n\nUnique-B-Word here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B }
  const textA = importMarkdown(DOC_A, 'note.md').text
  const textB = importMarkdown(DOC_B, 'b.md').text

  // No pre-seeded connection — A starts with one highlight 'h-a' on "Unique-A-Word" (so the mixed
  // case has a real annotation to pick); B has one highlight 'h-b' on "Unique-B-Word".
  function sidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importMarkdown(src, ref.split('/').pop()!).text
    const needle = isA ? 'Unique-A-Word' : 'Unique-B-Word'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.annotations.push({
      id: isA ? 'h-a' : 'h-b',
      anchor: createAnchor(text, start, start + needle.length),
      color: '#fde68a',
      note: ''
    })
    return serializeSidecar(side)
  }

  function makeBM1Adapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      writeSidecar: vi.fn().mockResolvedValue(undefined),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarForRef(ref))
    )
    return adapter
  }

  async function openTwoPane(
    user: ReturnType<typeof userEvent.setup>
  ): Promise<{ articleA: HTMLElement; articleB: HTMLElement }> {
    render(<App adapter={makeBM1Adapter()} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-aye')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    const articles = screen.getAllByRole('article')
    return { articleA: articles[0], articleB: articles[1] }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The connection id is generated by crypto.randomUUID inside makeConnectionPair; the rendered
  // dot testids embed it. Recover it from the link-arc/dot testids after creation.
  async function createdConnId(): Promise<string> {
    const dot = await screen.findByTestId(/^link-dot-.*-from$/)
    const tid = dot.getAttribute('data-testid')!
    return tid.replace(/^link-dot-/, '').replace(/-from$/, '')
  }

  it('word(A)+word(B): from-dot flips SECONDARY pane; to-dot flips PRIMARY pane', async () => {
    const user = userEvent.setup()
    const { articleA, articleB } = await openTwoPane(user)

    const anchorA = createAnchor(textA, textA.indexOf('Unique-A-Word'), textA.indexOf('Unique-A-Word') + 'Unique-A-Word'.length)
    const anchorB = createAnchor(textB, textB.indexOf('Unique-B-Word'), textB.indexOf('Unique-B-Word') + 'Unique-B-Word'.length)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA })
      .mockReturnValueOnce({ anchor: anchorB })

    await user.click(screen.getByRole('button', { name: /draw/i }))
    fireEvent.click(articleA)
    fireEvent.click(articleB)

    const id = await createdConnId()

    // Before: neither endpoint section is active.
    expect(screen.getByTestId('section-1-bea').getAttribute('data-active')).toBe('false')
    expect(screen.getByTestId('section-1-dee').getAttribute('data-active')).toBe('false')

    // from-dot → navigates SECONDARY (pane B) to "Dee".
    fireEvent.click(await screen.findByTestId(`link-dot-${id}-from`))
    await waitFor(() =>
      expect(screen.getByTestId('section-1-dee').getAttribute('data-active')).toBe('true')
    )

    // to-dot → navigates PRIMARY (pane A) to "Bea".
    fireEvent.click(await screen.findByTestId(`link-dot-${id}-to`))
    await waitFor(() =>
      expect(screen.getByTestId('section-1-bea').getAttribute('data-active')).toBe('true')
    )
  })

  it('highlight(A)+word(B) mixed: from-dot flips SECONDARY; to-dot flips PRIMARY', async () => {
    const user = userEvent.setup()
    const { articleA, articleB } = await openTwoPane(user)

    // First pick: annotation in A (h-a) carrying its own span anchor; second pick: bare word in B.
    const anchorA = createAnchor(textA, textA.indexOf('Unique-A-Word'), textA.indexOf('Unique-A-Word') + 'Unique-A-Word'.length)
    const anchorB = createAnchor(textB, textB.indexOf('Unique-B-Word'), textB.indexOf('Unique-B-Word') + 'Unique-B-Word'.length)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: anchorA })
      .mockReturnValueOnce({ anchor: anchorB })

    await user.click(screen.getByRole('button', { name: /draw/i }))
    fireEvent.click(articleA)
    fireEvent.click(articleB)

    const id = await createdConnId()

    expect(screen.getByTestId('section-1-bea').getAttribute('data-active')).toBe('false')
    expect(screen.getByTestId('section-1-dee').getAttribute('data-active')).toBe('false')

    fireEvent.click(await screen.findByTestId(`link-dot-${id}-from`))
    await waitFor(() =>
      expect(screen.getByTestId('section-1-dee').getAttribute('data-active')).toBe('true')
    )

    fireEvent.click(await screen.findByTestId(`link-dot-${id}-to`))
    await waitFor(() =>
      expect(screen.getByTestId('section-1-bea').getAttribute('data-active')).toBe('true')
    )
  })

  // Links pin to the picked word anchor exactly (no highlight/full-span override). The pick
  // points at a word in section 1 ("Unique-A-Word"); navigating to that endpoint must land on
  // section 1, proving the stored endpoint is the picked anchor itself.
  it('the picked word anchor is stored as the link endpoint and drives navigation', async () => {
    const user = userEvent.setup()
    const { articleA, articleB } = await openTwoPane(user)

    const wordA = createAnchor(textA, textA.indexOf('Unique-A-Word'), textA.indexOf('Unique-A-Word') + 'Unique-A-Word'.length)
    const anchorB = createAnchor(textB, textB.indexOf('Unique-B-Word'), textB.indexOf('Unique-B-Word') + 'Unique-B-Word'.length)
    vi.spyOn(linkPickMod, 'linkPickFromPoint')
      .mockReturnValueOnce({ anchor: wordA })
      .mockReturnValueOnce({ anchor: anchorB })

    await user.click(screen.getByRole('button', { name: /draw/i }))
    fireEvent.click(articleA)
    fireEvent.click(articleB)

    const id = await createdConnId()
    expect(screen.getByTestId('section-1-bea').getAttribute('data-active')).toBe('false')

    // to-dot → navigate the PRIMARY pane to its endpoint (wordA, in section 1 "Bea").
    fireEvent.click(await screen.findByTestId(`link-dot-${id}-to`))
    await waitFor(() =>
      expect(screen.getByTestId('section-1-bea').getAttribute('data-active')).toBe('true')
    )
  })
})

// ── C2: gate select/Delete to Connect mode; navigate stays in both modes ─────────────────────
describe('App C2: select/Delete gated to Connect mode', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  // Doc A: ONE/TWO/THREE; A endpoint "Alpha." section 0.
  // Doc B: two sections; B endpoint "Zebra" in section 1 "Second" (non-default, jump is detectable).
  const DOC_A = THREE
  const DOC_B_MULTI = '# First\n\nStart here.\n\n## Second\n\nZebra word lives here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B_MULTI }
  const CONN_ID = 'c2-conn'

  function sidecarForRef(ref: string): string {
    const isA = ref === A_REF
    const src = docs[ref]
    const text = importMarkdown(src, ref.split('/').pop()!).text
    const needle = isA ? 'Alpha.' : 'Zebra'
    const start = text.indexOf(needle)
    const side = emptySidecar(isA ? 'doc-a' : 'doc-b', hashContent(src))
    side.links.push({
      id: CONN_ID,
      anchor: createAnchor(text, start, start + needle.length),
      otherDocRef: isA ? B_REF : A_REF
    })
    return serializeSidecar(side)
  }

  function makeC2Adapter(writeSidecar?: ReturnType<typeof vi.fn>): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      writeSidecar: writeSidecar ?? vi.fn().mockResolvedValue(undefined),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecarForRef(ref))
    )
    return adapter
  }

  async function openTwoPaneC2(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  }

  it('normal mode: dot click navigates opposite pane but does NOT select the link', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeC2Adapter()} />)
    await openTwoPaneC2(user)

    // Before click: secondary section 1 "Second" is not active.
    expect(screen.getByTestId('section-1-second').getAttribute('data-active')).toBe('false')

    // Click the FROM dot — in normal mode; navigate MUST fire (secondary jumps), select must NOT.
    const fromDot = await screen.findByTestId(`link-dot-${CONN_ID}-from`)
    fireEvent.click(fromDot)

    // Navigate fires: secondary pane flips to section containing "Zebra" (Second, index 1).
    await waitFor(() =>
      expect(screen.getByTestId('section-1-second').getAttribute('data-active')).toBe('true')
    )

    // Select does NOT fire: arc must NOT have data-selected.
    const arc = screen.getByTestId(`link-arc-${CONN_ID}`)
    expect(arc).not.toHaveAttribute('data-selected')
  })

  it('normal mode: Delete after dot click removes nothing', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<App adapter={makeC2Adapter(writeSidecar)} />)
    await openTwoPaneC2(user)

    // Click the arc (navigate fires, select does NOT in normal mode).
    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)
    fireEvent.click(arc)
    expect(arc).not.toHaveAttribute('data-selected')

    // Press Delete — nothing should be removed.
    fireEvent.keyDown(window, { key: 'Delete' })
    await new Promise((r) => setTimeout(r, 50))

    // No sidecar write with links:[] should have occurred.
    for (const call of writeSidecar.mock.calls as unknown[][]) {
      const parsed = JSON.parse(call[2] as string) as { links?: unknown[] }
      if (parsed.links !== undefined) {
        expect(parsed.links).toHaveLength(1)
      }
    }
  })

  it('Connect mode: dot click selects the link (data-selected="true")', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeC2Adapter()} />)
    await openTwoPaneC2(user)

    // Enter Connect mode.
    await user.click(screen.getByRole('button', { name: /draw/i }))

    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)
    const fromDot = await screen.findByTestId(`link-dot-${CONN_ID}-from`)

    // Click the dot in Connect mode → select must fire.
    fireEvent.click(fromDot)
    expect(arc).toHaveAttribute('data-selected', 'true')
  })

  it('Connect mode: arc click selects then Delete removes the connection', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<App adapter={makeC2Adapter(writeSidecar)} />)
    await openTwoPaneC2(user)

    // Enter Connect mode.
    await user.click(screen.getByRole('button', { name: /draw/i }))

    const arc = await screen.findByTestId(`link-arc-${CONN_ID}`)
    fireEvent.click(arc)
    expect(arc).toHaveAttribute('data-selected', 'true')

    // Delete removes the connection from BOTH sidecars.
    fireEvent.keyDown(window, { key: 'Delete' })
    await waitFor(() => {
      const refsWritten = writeSidecar.mock.calls.map((c: unknown[]) => c[1])
      expect(refsWritten).toContain(A_REF)
      expect(refsWritten).toContain(B_REF)
    })
    const lastFor = (ref: string) =>
      JSON.parse(writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === ref).at(-1)![2] as string) as {
        links?: unknown[]
      }
    expect(lastFor(A_REF).links).toHaveLength(0)
    expect(lastFor(B_REF).links).toHaveLength(0)
  })
})

describe('App CM2: pane-row stacking-context isolation', () => {
  it.skip(/* 3d: cosmetic */ 'pane-row container has isolation:isolate to scope the overlay z-index', async () => {
    const docB = '# Solo\n\nUnique-B-Content here.'
    const docs: Record<string, string> = { 'documents/note.md': THREE, 'documents/b.md': docB }
    const adapter = makeAdapter({
      entries: [
        { ref: 'documents/note.md', name: 'note.md', ext: 'md' },
        { ref: 'documents/b.md', name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' }))
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    // Open primary pane
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Open beside to enter split mode (pane-row is only rendered in split mode)
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    const paneRow = screen.getByTestId('pane-row')
    expect(paneRow.style.isolation).toBe('isolate')
  })

  it('header is lifted above the pane-row (position:relative + z-index) so its dropdowns paint over the panes, not under', async () => {
    const adapter = makeAdapter({
      entries: [{ ref: 'documents/note.md', name: 'note.md', ext: 'md' }],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: THREE, hash: '' }))
    })
    render(<App adapter={adapter} />)
    // Wait for the in-project Home (the doc list) so the header is mounted, then assert its stacking.
    await screen.findByRole('button', { name: /note\.md/i })
    const header = document.querySelector('header') as HTMLElement
    expect(header).toBeTruthy()
    // Counterpart to the pane-row's isolation:isolate — the header must out-rank that stacking
    // context, otherwise its dropdowns are painted beneath the workspace panes (transparent + unclickable).
    expect(header.style.position).toBe('relative')
    expect(Number(header.style.zIndex)).toBeGreaterThan(0)
  })
})

// ── Task 10: graceful desktop-resize (narrow → single-pane fallback) ─────────────────────────
describe('App narrow-resize: single-pane fallback', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const DOC_B = '# Solo\n\nUnique-B-Content here.'
  const docs: Record<string, string> = { [A_REF]: THREE, [B_REF]: DOC_B }

  function makeNarrowAdapter(): PlatformAdapter {
    return makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' }))
    })
  }

  afterEach(() => {
    // Restore innerWidth so subsequent tests see the jsdom default (1024).
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
  })

  it('falls back to a single pane when the window is narrow', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeNarrowAdapter()} />)
    // Open primary pane.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Open beside to enter split mode — both articles visible.
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // Narrow the window below 720px and dispatch resize.
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 })
      window.dispatchEvent(new Event('resize'))
    })
    // Narrow fallback: only the primary pane (one article) is rendered.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
  })

  it('widens back to split view after narrowing (parked tab persists, re-shown from the strip)', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeNarrowAdapter()} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // Narrow → maxShown 1 → the overflow doc pane is parked (one article).
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 600 })
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    // Widen → maxShown is 2 again, but parked tabs do NOT auto-restore (C2). Re-show B from the strip.
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
      window.dispatchEvent(new Event('resize'))
    })
    // After narrowing, the non-focused pane (A / note.md) was parked; re-show it from the strip.
    const strip = await screen.findByTestId('open-rail')
    await user.click(within(strip).getByRole('button', { name: 'note.md' }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
  })
})

// ── Task 1: pane discovery — PDF panes discoverable via [data-pane-content] ─────────────────────
describe('App pane discovery: data-pane-content marker', () => {
  const MD_REF = 'documents/note.md'
  const PDF_REF = 'documents/p.pdf'
  const PDF_PARSE = {
    pages: [{ index: 0, width: 600, height: 800 }],
    runs: [{ pageIndex: 0, text: 'PDF-word', x: 10, y: 20, w: 40, h: 12, ocr: false }],
    scanned: false
  }

  function makePdfBesideAdapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: MD_REF, name: 'note.md', ext: 'md' },
        { ref: PDF_REF, name: 'p.pdf', ext: 'pdf' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: ref === MD_REF ? THREE : '', hash: '' }))
    })
    ;(adapter.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue(PDF_PARSE)
    return adapter
  }

  it('two [data-pane-content] containers exist when a PDF pane is open beside a markdown pane', async () => {
    const user = userEvent.setup()
    render(<App adapter={makePdfBesideAdapter()} />)
    // Open the markdown doc as the primary pane.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Open the PDF beside it (secondary pane).
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: p\.pdf/i }))
    // Wait for PDF page to render.
    await screen.findByTestId('pdf-page-0')
    // Both pane containers must be discoverable via the shared marker.
    // (Before the fix: querySelectorAll('article') finds the <article> but misses the PDF
    // <div role="article">, so [data-pane-content] count is 0 → this assertion FAILS.)
    await waitFor(() =>
      expect(document.querySelectorAll('[data-pane-content]')).toHaveLength(2)
    )
  })
})

// ── Task 2: Connect-mode wiring into PdfPageView (word picks on PDF) ─────────────────────────
describe('App Task 2: Connect-mode click on PDF pane reaches onConnectPick', () => {
  const MD_REF = 'documents/note.md'
  const PDF_REF = 'documents/p.pdf'
  const PDF_PARSE = {
    pages: [{ index: 0, width: 600, height: 800 }],
    runs: [{ pageIndex: 0, text: 'PDF-word', x: 10, y: 20, w: 40, h: 12, ocr: false }],
    scanned: false
  }

  function makePdfBesideMdAdapter(writeSidecar: ReturnType<typeof vi.fn>): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: MD_REF, name: 'note.md', ext: 'md' },
        { ref: PDF_REF, name: 'p.pdf', ext: 'pdf' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: ref === MD_REF ? THREE : '', hash: '' })),
      writeSidecar
    })
    ;(adapter.parsePdf as ReturnType<typeof vi.fn>).mockResolvedValue(PDF_PARSE)
    return adapter
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Connect-mode click on a PDF pane calls onConnectPick with PDF ref + word pick', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<App adapter={makePdfBesideMdAdapter(writeSidecar)} />)

    // Open the markdown doc as primary, PDF beside it as secondary.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: p\.pdf/i }))
    await screen.findByTestId('pdf-page-0')
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))

    // Spy: linkPickFromPoint returns a word pick (the PDF connect path always resolves word).
    const pdfDoc = buildPdfModel(PDF_PARSE, 'p.pdf')
    const anchor = createAnchor(pdfDoc.text, 0, 4)
    vi.spyOn(linkPickMod, 'linkPickFromPoint').mockReturnValueOnce({ anchor })

    // Enter Connect mode, then click the PDF article (the second article = PDF pane).
    await user.click(screen.getByRole('button', { name: /draw/i }))
    const articles = screen.getAllByRole('article')
    // The PDF pane is the second article (secondary pane).
    fireEvent.click(articles[1])

    // linkPickFromPoint must have been called (wiring went through).
    expect(linkPickMod.linkPickFromPoint).toHaveBeenCalledTimes(1)
  })
})

// ── Task 4: satellite chrome (&detached=1) ────────────────────────────────────────────────────
describe('App satellite chrome', () => {
  it('boots with ?doc=...&detached=1: renders DocumentPane, does NOT render LibraryCockpit or open rail', async () => {
    // Set the URL to a detached doc boot before rendering App.
    window.history.replaceState({}, '', '/?doc=documents%2Fnote.md&detached=1')
    render(<App adapter={makeAdapter({ content: THREE })} />)
    // The DocumentPane (article) must render.
    expect(await screen.findByRole('article')).toBeInTheDocument()
    // The library-list (inside LibraryCockpit) must NOT be present.
    expect(screen.queryByTestId('library-list')).toBeNull()
    // The open-rail must NOT be present.
    expect(screen.queryByTestId('open-rail')).toBeNull()
  })

  it('Detach button present in hub (non-detached) mode for a doc tab, calls window.open + closeTab', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<App adapter={makeAdapter({ content: THREE })} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')
    const detachBtn = screen.getByRole('button', { name: /detach/i })
    expect(detachBtn).toBeInTheDocument()
    await user.click(detachBtn)
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('&detached=1'),
      '_blank'
    )
    // After detach, the tab is closed → we land back on the library (open-rail disappears or has 0 tabs).
    await waitFor(() => expect(screen.queryByTestId('open-rail')).toBeNull())
    openSpy.mockRestore()
  })
})

// ── Fix: detach keeps hub on a remaining doc + picker choice clarity ─────────────────────────
describe('App fix: detach hub behaviour + picker open-mode labels', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const docB = '# Solo\n\nUnique-B-Content here.'
  const docs: Record<string, string> = { [A_REF]: THREE, [B_REF]: docB }

  function makeTwoDocAdapter(): PlatformAdapter {
    return makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' }))
    })
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Fix 2a: detach with a split promotes the beside doc to the hub (no Library bounce)', async () => {
    // RED before fix: tabs.closeTab would fall back to Library when the only tab was detached.
    // GREEN after fix: the beside doc is promoted to fill the hub before the tab is closed.
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    render(<App adapter={makeTwoDocAdapter()} />)
    // Open A as primary doc.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Open B beside A (split mode).
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // Detach the first (left) pane; the hub must reflow onto the remaining pane (not Library).
    const detachBtn = screen.getAllByRole('button', { name: /detach/i })[0]
    await user.click(detachBtn)
    // window.open must have been called with detached=1 in the URL.
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('&detached=1'),
      '_blank'
    )
    // Hub must now show B's content — NOT the Library (no library-list).
    await waitFor(() => expect(screen.queryByTestId('library-list')).toBeNull())
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('Fix 2b: detach with a neighbor tab switches hub to the neighbor (not Library)', async () => {
    // Two doc tabs; no secondaryRef (no split). Detaching the active one must land on the other.
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    render(<App adapter={makeTwoDocAdapter()} />)
    // Open both docs as separate tabs (no beside).
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open in new tab: b\.md/i }))
    // Pane model: opening "in new tab" shows it as a 2nd pane (a free slot exists) → two panes.
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // Detach the first — the hub must land on the remaining pane (not Library).
    await user.click(screen.getAllByRole('button', { name: /detach/i })[0])
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('&detached=1'),
      '_blank'
    )
    // Hub must land on the remaining tab (A / note.md) — not the Library.
    await waitFor(() => expect(screen.queryByTestId('library-list')).toBeNull())
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('Fix 1: picker row shows "Open in new tab" aria-label AND a visible "Beside" button when a doc is loaded', async () => {
    const user = userEvent.setup()
    render(<App adapter={makeTwoDocAdapter()} />)
    // Open A so a doc is loaded (enables the "Beside" affordance).
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')
    // Open the doc picker.
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    // The b.md row must expose BOTH affordances.
    // 1) A button with aria-label "Open in new tab: b.md" (the doc-name button).
    expect(await screen.findByRole('button', { name: /open in new tab: b\.md/i })).toBeInTheDocument()
    // 2) A visible "Beside" button (aria-label "Open beside: b.md").
    expect(screen.getByRole('button', { name: /open beside: b\.md/i })).toBeInTheDocument()
  })
})

// ── Task 5b: satellite window entity name (document.title + slim header) ──────────────────────
describe('App satellite entity name', () => {
  afterEach(() => {
    // Reset document.title between tests to avoid cross-test pollution.
    document.title = ''
  })

  it('satellite: document.title is set to the doc filename after load', async () => {
    window.history.replaceState({}, '', '/?doc=documents%2Fa.md&detached=1')
    const adapter = makeAdapter({ ref: 'documents/a.md', content: THREE })
    render(<App adapter={adapter} />)
    // Wait for the document to load (article renders).
    await screen.findByRole('article')
    // document.title must contain the doc name.
    await waitFor(() => expect(document.title).toMatch(/a\.md/i))
  })

  it('satellite: slim pane header shows the doc title and omits the close control', async () => {
    window.history.replaceState({}, '', '/?doc=documents%2Fa.md&detached=1')
    const adapter = makeAdapter({ ref: 'documents/a.md', content: THREE })
    render(<App adapter={adapter} />)
    await screen.findByRole('article')
    // The (only) pane header shows the title (satellite has no open rail → title only here).
    const header = await screen.findByTestId('pane-header')
    expect(header).toHaveTextContent(/a\.md/i)
    // A satellite pane omits the close (park) control — the OS window chrome closes the window.
    expect(screen.queryByRole('button', { name: /close pane/i })).toBeNull()
  })

  it('hub (non-detached): the pane header carries a close (park) control', async () => {
    // Default URL (no detached param) → hub mode.
    render(<App adapter={makeAdapter({ content: THREE })} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')
    // Hub panes carry a close (park) control; the satellite omitted it.
    expect(screen.getAllByRole('button', { name: /close pane/i }).length).toBeGreaterThan(0)
  })
})

// ── Task 5: cross-window lone dots + follow-link navigation over the bus ─────────────────────
// These are SMOKE tests for the cross-window wiring. Multi-window is impossible to render in a
// single jsdom, so we inject the in-memory bus (via App's `busFactory` test seam — the same seam
// useCrossWindow already exposes) and assert wiring/structure: the lone-dot element exists, an
// incoming `open-entity` opens the entity, and a dot click posts the right bus message. Geometry
// is smoke-only (jsdom rects are 0 → points resolve to {0,0}); we assert ELEMENTS / MESSAGES.
describe('App Task 5: cross-window lone dots + follow-link', () => {
  const A_REF = 'documents/note.md'
  const B_REF = 'documents/b.md'
  const DOC_A = THREE // "Alpha." section 0, "Gamma." section 2
  const DOC_B = '# Solo\n\nUnique-B-Content here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B }
  const CONN_ID = 'xw-conn-1'

  // Doc A's sidecar carries ONE half of a mirrored Connection whose partner lives in B_REF.
  // Only A is opened in THIS window → the partner endpoint (B_REF) is not a pane here, so the
  // in-window pass cannot pair it. Task 5 must still render A's lone dot.
  function sidecarForRefA(): string {
    const text = importedText(DOC_A)
    const start = text.indexOf('Alpha.')
    const side = emptySidecar('doc-a', hashContent(DOC_A))
    side.links.push({
      id: CONN_ID,
      anchor: createAnchor(text, start, start + 'Alpha.'.length),
      otherDocRef: B_REF
    })
    return serializeSidecar(side)
  }

  function makeXwAdapter(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(ref === A_REF ? sidecarForRefA() : serializeSidecar(emptySidecar('doc-b', hashContent(DOC_B))))
    )
    return adapter
  }

  // A bus injected into App over a shared in-memory hub. `other` is a second channel-backed bus
  // standing in for ANOTHER window (used to seed presence / send messages). Posts on App's bus are
  // recorded in `posted` for assertions.
  function makeBusPair(): {
    busFactory: () => CrossWindowBus
    other: CrossWindowBus
    posted: CrossWindowMessage[]
  } {
    const channelFactory = createInMemoryChannelHub()
    const posted: CrossWindowMessage[] = []
    const busFactory = (): CrossWindowBus => {
      const real = createBus(channelFactory)
      return {
        post: (msg: CrossWindowMessage) => { posted.push(msg); real.post(msg) },
        subscribe: (h) => real.subscribe(h),
        close: () => real.close()
      }
    }
    const other = createBus(channelFactory)
    return { busFactory, other, posted }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('(a) renders a LONE dot for a connection whose partner pane is NOT open in this window', async () => {
    const { busFactory } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeXwAdapter()} busFactory={busFactory} />)
    // Open only doc A (single pane). The connection's partner (B_REF) is NOT open here.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Task 5: a lone dot for the local endpoint renders even with no partner pane.
    // (Before Task 5: recomputeLines required a secondary pane → nothing renders → RED.)
    expect(await screen.findByTestId(`link-dot-${CONN_ID}-from`)).toBeInTheDocument()
    // No arc — the partner endpoint is null (lone dot, no arc).
    expect(screen.queryByTestId(`link-arc-${CONN_ID}`)).toBeNull()
  })

  it('(b) receiving an open-entity message opens the entity (tabs.openTab) in the hub', async () => {
    const { busFactory, other } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeXwAdapter()} busFactory={busFactory} />)
    // Hub starts on doc A.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Another window asks the hub to open B_REF, carrying the shared link id (no anchor).
    act(() => {
      other.post({ type: 'open-entity', kind: 'doc', ref: B_REF, linkId: CONN_ID })
    })
    // The hub opens B as a tab → its tab button appears in the strip.
    const strip = await screen.findByTestId('open-rail')
    expect(await within(strip).findByRole('button', { name: 'b.md' })).toBeInTheDocument()
  })

  it('(c) clicking a lone dot whose partner is open ELSEWHERE posts a navigate message', async () => {
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeXwAdapter()} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // Seed presence: another window holds B_REF (the partner).
    act(() => {
      other.post({ type: 'presence', windowId: 'win-other', role: 'satellite', entity: { kind: 'doc', ref: B_REF } })
    })
    // Click the lone dot → the partner is in another window → post a navigate message carrying the
    // shared link id (NOT this window's own endpoint anchor, which is foreign text in the partner).
    fireEvent.click(await screen.findByTestId(`link-dot-${CONN_ID}-from`))
    await waitFor(() =>
      expect(
        posted.some(
          (m) =>
            m.type === 'navigate' &&
            m.targetRef === B_REF &&
            m.linkId === CONN_ID &&
            !('anchor' in m)
        )
      ).toBe(true)
    )
  })

  it('(c2) clicking a lone dot whose partner is CLOSED opens it BESIDE in the hub (no bus post)', async () => {
    const { busFactory, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeXwAdapter()} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    // No presence seeded → the partner is held by no window. As the hub, this window opens the
    // partner BESIDE the current doc and jumps once it loads — posting open-entity to ourselves
    // would never echo back (BroadcastChannel does not deliver to the sender), so it would no-op.
    fireEvent.click(await screen.findByTestId(`link-dot-${CONN_ID}-from`))
    // The partner opens in a SECOND pane beside the current doc (split → two articles).
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    // Opened locally — no open-entity broadcast (that would double-open it in other windows).
    expect(posted.some((m) => m.type === 'open-entity')).toBe(false)
  })

  // (d) RECEIVER: a `navigate{targetRef, linkId}` from another window must land at THIS window's
  // OWN endpoint of the link, resolved from THIS pane's sidecar record by the shared id — NOT from
  // any anchor in the message. This is the defect the fix corrects (the old payload carried the
  // clicking window's foreign anchor → resolved to position 0 in the partner doc).
  it('(d) receiving a navigate message resolves THIS pane\'s own endpoint by link id and jumps', async () => {
    // Doc A's sidecar holds a connection whose LOCAL endpoint is "Gamma." (section 2 "three"),
    // partnered with B_REF. Section 2 is NOT the default active section (section 0 is), so a
    // successful by-id resolution flips section-2-three to active.
    const RX_CONN_ID = 'xw-rx-conn'
    function rxSidecarForA(): string {
      const text = importedText(DOC_A)
      const start = text.indexOf('Gamma.')
      const side = emptySidecar('doc-a', hashContent(DOC_A))
      side.links.push({
        id: RX_CONN_ID,
        anchor: createAnchor(text, start, start + 'Gamma.'.length),
        otherDocRef: B_REF
      })
      return serializeSidecar(side)
    }
    const adapter = makeAdapter({
      entries: [{ ref: A_REF, name: 'note.md', ext: 'md' }],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(ref === A_REF ? rxSidecarForA() : null)
    )

    const { busFactory, other } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={adapter} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')

    // Before: section 2 "three" is not active.
    expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('false')

    // Another window (holding the partner endpoint) clicks its lone dot → posts navigate by id.
    act(() => {
      other.post({ type: 'navigate', targetRef: A_REF, linkId: RX_CONN_ID })
    })

    // The receiver resolves ITS OWN endpoint ("Gamma.") from the id → primary pane jumps to it.
    await waitFor(() =>
      expect(screen.getByTestId('section-2-three').getAttribute('data-active')).toBe('true')
    )
  })
})

// ── Task 6: global Draw + cross-window pick handshake creates links ──────────────────────────
// After detach, the two Draw picks land in two DIFFERENT windows. Each doc's sidecar must be
// written by the window that OWNS that doc's pane (only it has the pane registered). These tests
// inject the in-memory bus (App `busFactory` seam) and a SINGLE local pane (doc A); the partner
// (doc X / B_REF) lives in another window represented by the `other` bus. We assert:
//   (a) receiving draw-mode:true arms local Connect mode;
//   (b) remote source pending-pick + local annotation pick → local cross-link end written + a
//       link-create posted for the remote (owning) window;
//   (c) remote word pending-pick + local pick → connection (mixed) via the same path;
//   (d) receiving link-create{forDocRef:<local doc>} writes that record via the local registry.
describe('App Task 6: global Draw + cross-window create', () => {
  const A_REF = 'documents/note.md'   // open in THIS window
  const X_REF = 'documents/x.md'      // the partner, held by ANOTHER window (never opened here)
  const DOC_A = '# One\n\nAlpha word here.\n\n## Two\nMore text.'
  const DOC_X = '# Solo\n\nBeta word here.'
  const docs: Record<string, string> = { [A_REF]: DOC_A, [X_REF]: DOC_X }

  // Doc A's sidecar has highlight h-a on "Alpha".
  function sidecarForRefA(): string {
    const text = importMarkdown(DOC_A, 'note.md').text
    const start = text.indexOf('Alpha')
    const side = emptySidecar('doc-a', hashContent(DOC_A))
    side.annotations.push({
      id: 'h-a',
      anchor: createAnchor(text, start, start + 'Alpha'.length),
      color: '#fde68a',
      note: ''
    })
    return serializeSidecar(side)
  }

  function makeT6Adapter(writeSidecar?: ReturnType<typeof vi.fn>): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'note.md', ext: 'md' },
        { ref: X_REF, name: 'x.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs[ref] ?? '', hash: '' })),
      ...(writeSidecar ? { writeSidecar } : {}),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(ref === A_REF ? sidecarForRefA() : null)
    )
    return adapter
  }

  function makeBusPair(): {
    busFactory: () => CrossWindowBus
    other: CrossWindowBus
    posted: CrossWindowMessage[]
  } {
    const channelFactory = createInMemoryChannelHub()
    const posted: CrossWindowMessage[] = []
    const busFactory = (): CrossWindowBus => {
      const real = createBus(channelFactory)
      return {
        post: (msg: CrossWindowMessage) => { posted.push(msg); real.post(msg) },
        subscribe: (h) => real.subscribe(h),
        close: () => real.close()
      }
    }
    const other = createBus(channelFactory)
    return { busFactory, other, posted }
  }

  // Open ONLY doc A in this window (single pane).
  async function openA(user: ReturnType<typeof userEvent.setup>, busFactory: () => CrossWindowBus): Promise<HTMLElement> {
    render(<App adapter={makeT6Adapter()} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    return screen.getByRole('article')
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('(a) receiving draw-mode:true arms local Connect mode (a local article click resolves a pick)', async () => {
    const { busFactory, other } = makeBusPair()
    const user = userEvent.setup()
    const article = await openA(user, busFactory)

    const spy = vi.spyOn(linkPickMod, 'linkPickFromPoint').mockReturnValue(null)

    // Before draw-mode: a click on the article does NOT go through the connect path.
    fireEvent.click(article)
    expect(spy).not.toHaveBeenCalled()

    // Another window toggles Draw → posts draw-mode:true → this window arms.
    act(() => { other.post({ type: 'draw-mode', active: true }) })

    // Now a click on the article DOES go through the connect path (connectMode is on).
    await waitFor(() => {
      fireEvent.click(article)
      expect(spy).toHaveBeenCalled()
    })
  })

  it('(b) remote annotation pending-pick + local annotation pick → local link end written + link-create posted', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT6Adapter(writeSidecar)} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    const article = screen.getByRole('article')

    // Arm Draw across windows.
    act(() => { other.post({ type: 'draw-mode', active: true }) })

    // Remote source: an annotation pick for the partner doc X (its own full-span anchor travels).
    const textX = importMarkdown(DOC_X, 'x.md').text
    const anchorX = createAnchor(textX, textX.indexOf('Beta'), textX.indexOf('Beta') + 'Beta'.length)
    act(() => {
      other.post({ type: 'pending-pick', windowId: 'win-other', docRef: X_REF, pick: { anchor: anchorX } })
    })

    // Local annotation pick in doc A (h-a) → completes the cross-window pair.
    const textA = importMarkdown(DOC_A, 'note.md').text
    const anchorA = createAnchor(textA, textA.indexOf('Alpha'), textA.indexOf('Alpha') + 'Alpha'.length)
    vi.spyOn(linkPickMod, 'linkPickFromPoint').mockReturnValueOnce({ anchor: anchorA })
    fireEvent.click(article)

    // The LOCAL end (doc A's sidecar) is written with a link whose end.annotationId=h-a, otherDocRef=X.
    await waitFor(() => {
      const aCalls = writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === A_REF)
      expect(aCalls.length).toBeGreaterThan(0)
      const aSide = JSON.parse(aCalls.at(-1)![2] as string) as { links?: Array<{ id: string; anchor: { exact: string }; otherDocRef: string }> }
      expect(aSide.links).toHaveLength(1)
      expect(aSide.links![0].anchor.exact).toBe('Alpha')
      expect(aSide.links![0].otherDocRef).toBe(X_REF)
    })
    // The partner's end is NOT written here (no X pane registered).
    expect(writeSidecar.mock.calls.some((c: unknown[]) => c[1] === X_REF)).toBe(false)
    // A link-create for the owning window is posted, carrying X's record.
    const lc = posted.find((m) => m.type === 'link-create') as Extract<CrossWindowMessage, { type: 'link-create' }> | undefined
    expect(lc).toBeTruthy()
    expect(lc!.forDocRef).toBe(X_REF)
    expect((lc!.record as { anchor: { exact: string }; otherDocRef: string }).anchor.exact).toBe('Beta')
    expect((lc!.record as { otherDocRef: string }).otherDocRef).toBe(A_REF)
  })

  it('(c) remote word pending-pick + local annotation pick → link (mixed) + link-create posted', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT6Adapter(writeSidecar)} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    const article = screen.getByRole('article')

    act(() => { other.post({ type: 'draw-mode', active: true }) })

    // Remote source: a bare WORD pick for partner doc X.
    const textX = importMarkdown(DOC_X, 'x.md').text
    const anchorX = createAnchor(textX, 0, 4)
    act(() => {
      other.post({ type: 'pending-pick', windowId: 'win-other', docRef: X_REF, pick: { anchor: anchorX } })
    })

    // Local annotation pick → mixed → link with annotationId on A side.
    const textA = importMarkdown(DOC_A, 'note.md').text
    const anchorA = createAnchor(textA, textA.indexOf('Alpha'), textA.indexOf('Alpha') + 'Alpha'.length)
    vi.spyOn(linkPickMod, 'linkPickFromPoint').mockReturnValueOnce({ anchor: anchorA })
    fireEvent.click(article)

    await waitFor(() => {
      const aCalls = writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === A_REF)
      expect(aCalls.length).toBeGreaterThan(0)
      const aSide = JSON.parse(aCalls.at(-1)![2] as string) as { links?: Array<{ id: string; otherDocRef: string }> }
      expect(aSide.links).toHaveLength(1)
      expect(aSide.links![0].otherDocRef).toBe(X_REF)
    })
    expect(writeSidecar.mock.calls.some((c: unknown[]) => c[1] === X_REF)).toBe(false)
    const lc = posted.find((m) => m.type === 'link-create') as Extract<CrossWindowMessage, { type: 'link-create' }> | undefined
    expect(lc).toBeTruthy()
    expect(lc!.forDocRef).toBe(X_REF)
    expect((lc!.record as { otherDocRef: string }).otherDocRef).toBe(A_REF)
  })

  it('(d) receiving link-create for a LOCAL doc writes that record via the local registry', async () => {
    const writeSidecar = vi.fn().mockResolvedValue(undefined)
    const { busFactory, other } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT6Adapter(writeSidecar)} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')

    // Another window completed a create and asks THIS window (which owns A_REF) to persist its end:
    // a link with end.annotationId=h-a (in A), otherDocRef=X.
    const anchor = createAnchor(importMarkdown(DOC_A, 'note.md').text, 0, 5)
    act(() => {
      other.post({
        type: 'link-create',
        forDocRef: A_REF,
        record: { id: 'shared-1', anchor, otherDocRef: X_REF }
      })
    })

    await waitFor(() => {
      const aCalls = writeSidecar.mock.calls.filter((c: unknown[]) => c[1] === A_REF)
      expect(aCalls.length).toBeGreaterThan(0)
      const aSide = JSON.parse(aCalls.at(-1)![2] as string) as { links?: Array<{ id: string }> }
      expect(aSide.links).toHaveLength(1)
      expect(aSide.links![0].id).toBe('shared-1')
    })
  })

  it('(e) clicking Draw posts draw-mode EXACTLY ONCE per toggle (no double-fire from StrictMode)', async () => {
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    await openA(user, busFactory)

    // Make the Draw button visible: announce that another window holds X_REF (a different doc).
    act(() => {
      other.post({ type: 'presence', windowId: 'win-other', role: 'satellite', entity: { kind: 'doc', ref: X_REF } })
    })

    const drawButton = await screen.findByRole('button', { name: /draw/i })

    // Toggle ON: expect exactly one draw-mode:true message on the bus.
    const beforeOn = posted.length
    await user.click(drawButton)
    await waitFor(() => {
      const drawMsgs = posted.slice(beforeOn).filter((m) => m.type === 'draw-mode')
      expect(drawMsgs).toHaveLength(1)
      expect((drawMsgs[0] as { type: 'draw-mode'; active: boolean }).active).toBe(true)
    })

    // Toggle OFF: expect exactly one draw-mode:false message.
    const beforeOff = posted.length
    const exitBtn = screen.getByRole('button', { name: /exit draw/i })
    await user.click(exitBtn)
    await waitFor(() => {
      const drawMsgs = posted.slice(beforeOff).filter((m) => m.type === 'draw-mode')
      expect(drawMsgs).toHaveLength(1)
      expect((drawMsgs[0] as { type: 'draw-mode'; active: boolean }).active).toBe(false)
    })
  })

  it('(f) presence from a late-joining window triggers re-broadcast of draw-mode:true when Draw is armed', async () => {
    // Scenario: Draw was toggled ON in this window BEFORE the other window existed.
    // When the other window posts presence later, THIS window must re-broadcast draw-mode:true
    // so the newcomer auto-arms. (The fix under test.)
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    await openA(user, busFactory)

    // Announce the partner so the Draw button becomes visible.
    act(() => {
      other.post({ type: 'presence', windowId: 'win-other', role: 'satellite', entity: { kind: 'doc', ref: X_REF } })
    })

    // Toggle Draw ON in THIS window.
    const drawButton = await screen.findByRole('button', { name: /draw/i })
    await user.click(drawButton)
    // Consume the initial draw-mode:true broadcast from the toggle itself.
    await waitFor(() => {
      expect(posted.some((m) => m.type === 'draw-mode' && (m as { type: 'draw-mode'; active: boolean }).active)).toBe(true)
    })

    // Snapshot how many messages have been posted so far.
    const beforePresence = posted.length

    // A NEW window joins AFTER Draw was armed — posts presence.
    act(() => {
      other.post({ type: 'presence', windowId: 'win-late', role: 'satellite', entity: { kind: 'doc', ref: X_REF } })
    })

    // THIS window must re-broadcast draw-mode:true for the newcomer.
    await waitFor(() => {
      const rebroadcast = posted.slice(beforePresence).filter(
        (m) => m.type === 'draw-mode' && (m as { type: 'draw-mode'; active: boolean }).active
      )
      expect(rebroadcast).toHaveLength(1)
    })
  })

  it('(g) presence from a late-joining window does NOT re-broadcast draw-mode when Draw is off (no storm)', async () => {
    // Guard: idle windows must not generate draw-mode traffic when presence arrives.
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    await openA(user, busFactory)

    // Announce partner so Draw button is visible; note Draw is NOT toggled on.
    act(() => {
      other.post({ type: 'presence', windowId: 'win-other', role: 'satellite', entity: { kind: 'doc', ref: X_REF } })
    })
    // Draw button exists but we do NOT click it.
    await screen.findByRole('button', { name: /draw/i })

    const beforePresence = posted.length

    // A late window joins.
    act(() => {
      other.post({ type: 'presence', windowId: 'win-late', role: 'satellite', entity: { kind: 'doc', ref: X_REF } })
    })

    // No draw-mode message should have been posted.
    await waitFor(() => {
      // Give the React event loop a tick to flush any spurious posts.
      expect(posted.slice(beforePresence).filter((m) => m.type === 'draw-mode')).toHaveLength(0)
    })
  })
})

// ── Task 7: active-canvas tracking + cross-window send-to-canvas ──────────────────────────────
// Three scenarios exercised here:
//   (a) DOC window (no local canvas): receives active-canvas → send-to-canvas routes cross-window
//       (posts excerpt, NOT the "open a canvas" note).
//   (b) CANVAS window: receives an excerpt message → card is added to the local canvas.
//   (c) No canvas anywhere: send-to-canvas shows the "open a canvas" note (existing behaviour).
//
// All use the in-memory bus seam so no real BroadcastChannel is created.
describe('App Task 7: active-canvas tracking + cross-window send-to-canvas', () => {
  const DOC_REF = 'documents/note.md'
  const DOC_CONTENT = '# One\n\nAlpha paragraph.\n\n## Two\n\nBeta text.'
  const CANVAS_REF = 'canvases/c.md'
  const CANVAS_MD =
    '---\nschemaVersion: 1\nid: "c"\ntitle: "Canvas C"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
  const ANNO_ID = 'h-alpha'

  // Build a sidecar with one annotation on "Alpha" in DOC_CONTENT.
  function makeDocSidecar(): string {
    const text = importMarkdown(DOC_CONTENT, 'note.md').text
    const start = text.indexOf('Alpha')
    const side = emptySidecar('doc-id', hashContent(DOC_CONTENT))
    side.annotations.push({
      id: ANNO_ID,
      anchor: createAnchor(text, start, start + 'Alpha'.length),
      color: '#fde68a',
      note: ''
    })
    return serializeSidecar(side)
  }

  function makeT7Adapter(extraCanvases?: Record<string, string>): PlatformAdapter {
    return makeAdapter({
      entries: [{ ref: DOC_REF, name: 'note.md', ext: 'md' }],
      content: DOC_CONTENT,
      ref: DOC_REF,
      sidecar: makeDocSidecar(),
      canvases: extraCanvases ?? {}
    })
  }

  // Shared bus-pair factory (same shape as Tasks 5 and 6).
  function makeBusPair(): {
    busFactory: () => CrossWindowBus
    other: CrossWindowBus
    posted: CrossWindowMessage[]
  } {
    const channelFactory = createInMemoryChannelHub()
    const posted: CrossWindowMessage[] = []
    const busFactory = (): CrossWindowBus => {
      const real = createBus(channelFactory)
      return {
        post: (msg: CrossWindowMessage) => { posted.push(msg); real.post(msg) },
        subscribe: (h) => real.subscribe(h),
        close: () => real.close()
      }
    }
    const other = createBus(channelFactory)
    return { busFactory, other, posted }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // (a) DOC window + remote active-canvas → excerpt is posted cross-window, NOT the note.
  it('(a) doc window with remote active-canvas routes excerpt over the bus (not the "open a canvas" note)', async () => {
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT7Adapter()} busFactory={busFactory} />)
    // Open the document (no canvas in this window).
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')

    // Seed the active-canvas from "another window" (the satellite canvas window).
    act(() => {
      other.post({ type: 'active-canvas', ref: CANVAS_REF })
    })

    // Double-click the annotation mark to trigger handleSendExcerpt.
    const mark = document.querySelector(`[data-annotation-id="${ANNO_ID}"]`) as HTMLElement
    expect(mark).toBeTruthy()
    fireEvent.doubleClick(mark)

    // Expect the bus received an excerpt message (not the "open a canvas" status note).
    await waitFor(() =>
      expect(posted.some((m) => m.type === 'excerpt')).toBe(true)
    )
    expect(screen.queryByRole('status')).toBeNull()
  })

  // (b) Canvas window receives an excerpt message → card is added to the local canvas.
  it('(b) canvas window receiving an excerpt message adds a card to the local canvas', async () => {
    const { busFactory, other } = makeBusPair()
    const adapter = makeT7Adapter({ [CANVAS_REF]: CANVAS_MD })
    const user = userEvent.setup()
    render(<App adapter={adapter} busFactory={busFactory} />)
    // Open the canvas via the Canvases section switch (canvas-only window — no document needed).
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Canvas C' }))
    await screen.findByTestId('canvas-board')

    // Deliver an excerpt from "another window" (a doc satellite).
    const text = importMarkdown(DOC_CONTENT, 'note.md').text
    const start = text.indexOf('Alpha')
    const excerptPayload = {
      source: DOC_REF,
      anchor: createAnchor(text, start, start + 'Alpha'.length),
      snapshot: 'Alpha',
      color: '#fde68a',
      sourceAnnotationId: ANNO_ID
    }
    act(() => {
      other.post({ type: 'excerpt', payload: excerptPayload })
    })

    // The card should now appear in the canvas board.
    await waitFor(() =>
      expect(document.querySelector('[data-testid^="card-"]')).toBeTruthy()
    )
  })

  // (c) No canvas anywhere → "open a canvas" note shown (existing behaviour preserved).
  it('(c) no canvas anywhere shows the "open a canvas" note', async () => {
    const { busFactory } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT7Adapter()} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')

    // No active-canvas seeded from any window → handleSendExcerpt should fall through to note.
    const mark = document.querySelector(`[data-annotation-id="${ANNO_ID}"]`) as HTMLElement
    expect(mark).toBeTruthy()
    fireEvent.doubleClick(mark)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/open a canvas/i)
    )
  })
})

// ── Task 8: cross-window card-color sync + card→source navigation ─────────────────────────────
// A detached canvas window has NO doc pane, so it cannot resolve a card's live color from
// paneAnnotations, and a card click cannot scroll a source that lives in another window. These
// tests inject the in-memory bus seam (same pattern as Tasks 5-7) and assert the bus signals.
describe('App Task 8: card-color sync + card→source navigation', () => {
  const DOC_REF = 'documents/note.md'
  const DOC_CONTENT = '# One\n\nAlpha paragraph.\n\n## Two\n\nGamma text.'
  const CANVAS_REF = 'canvases/c.md'
  const ANNO_ID = 'h-alpha'

  // A doc sidecar with one annotation on "Alpha" (default palette color #fde68a).
  function makeDocSidecar(): string {
    const text = importMarkdown(DOC_CONTENT, 'note.md').text
    const start = text.indexOf('Alpha')
    const side = emptySidecar('doc-id', hashContent(DOC_CONTENT))
    side.annotations.push({
      id: ANNO_ID,
      anchor: createAnchor(text, start, start + 'Alpha'.length),
      color: '#fde68a',
      note: ''
    })
    return serializeSidecar(side)
  }

  // A canvas markdown holding ONE excerpt card lifted from DOC_REF's "Gamma" passage, carrying
  // its sourceAnnotationId. (Gamma, not Alpha, so a successful card→source jump flips section 1.)
  function makeCanvasMd(): string {
    const text = importMarkdown(DOC_CONTENT, 'note.md').text
    const gStart = text.indexOf('Gamma')
    const anchor = createAnchor(text, gStart, gStart + 'Gamma'.length)
    const a = JSON.stringify(anchor.exact)
    const p = JSON.stringify(anchor.prefix)
    const s = JSON.stringify(anchor.suffix)
    return (
      '---\nschemaVersion: 1\nid: "c"\ntitle: "Canvas C"\nviewport: { x: 0, y: 0, zoom: 1 }\n' +
      'cards:\n' +
      '  - id: card-1\n' +
      '    kind: excerpt\n' +
      `    source: ${JSON.stringify(DOC_REF)}\n` +
      `    anchor: { start: ${anchor.start}, end: ${anchor.end}, exact: ${a}, prefix: ${p}, suffix: ${s} }\n` +
      '    color: "#fde68a"\n' +
      `    sourceAnnotationId: ${JSON.stringify(ANNO_ID)}\n` +
      '    x: 40\n    y: 40\n' +
      'connections: []\n---\n\n' +
      '<!-- rb:card card-1 -->\n\n> Gamma\n'
    )
  }

  function makeT8Adapter(opts?: { canvases?: Record<string, string> }): PlatformAdapter {
    return makeAdapter({
      entries: [{ ref: DOC_REF, name: 'note.md', ext: 'md' }],
      content: DOC_CONTENT,
      ref: DOC_REF,
      sidecar: makeDocSidecar(),
      canvases: opts?.canvases ?? {}
    })
  }

  function makeBusPair(): {
    busFactory: () => CrossWindowBus
    other: CrossWindowBus
    posted: CrossWindowMessage[]
  } {
    const channelFactory = createInMemoryChannelHub()
    const posted: CrossWindowMessage[] = []
    const busFactory = (): CrossWindowBus => {
      const real = createBus(channelFactory)
      return {
        post: (msg: CrossWindowMessage) => { posted.push(msg); real.post(msg) },
        subscribe: (h) => real.subscribe(h),
        close: () => real.close()
      }
    }
    const other = createBus(channelFactory)
    return { busFactory, other, posted }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // (a) DOC window: recoloring an annotation posts a card-color signal over the bus.
  it('(a) changing an annotation color in a doc window posts a card-color message', async () => {
    const { busFactory, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT8Adapter()} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')

    // Open the annotation popover (single click on the mark) and pick a DIFFERENT palette color.
    const mark = document.querySelector(`[data-annotation-id="${ANNO_ID}"]`) as HTMLElement
    expect(mark).toBeTruthy()
    fireEvent.click(mark)
    const swatch = await screen.findByLabelText('color #bbf7d0')
    fireEvent.click(swatch)

    await waitFor(() =>
      expect(
        posted.some(
          (m) => m.type === 'card-color' && m.annotationId === ANNO_ID && m.color === '#bbf7d0'
        )
      ).toBe(true)
    )
  })

  // (b) CANVAS window: receiving a card-color override makes the matching card render that color
  // even with NO doc pane present (paneAnnotations empty → the override map must win).
  it('(b) a canvas window applies a received card-color to the matching card', async () => {
    const { busFactory, other } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT8Adapter({ canvases: { [CANVAS_REF]: makeCanvasMd() } })} busFactory={busFactory} />)
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Canvas C' }))
    await screen.findByTestId('canvas-board')

    const blockquote = () =>
      (screen.getByTestId('card-card-1').querySelector('blockquote') as HTMLElement)
    // Before sync: card renders its stored color on the left edge.
    expect(blockquote()).toHaveStyle({ borderLeftColor: '#fde68a' })

    // Another (doc) window recolors the source annotation → broadcasts card-color.
    act(() => {
      other.post({ type: 'card-color', annotationId: ANNO_ID, color: '#bfdbfe' })
    })

    await waitFor(() =>
      expect(blockquote()).toHaveStyle({ borderLeftColor: '#bfdbfe' })
    )
  })

  // (c) CANVAS window: clicking a card whose source is open in ANOTHER window posts navigate{anchor}.
  it('(c) clicking a card whose source is open elsewhere posts navigate with the anchor', async () => {
    const { busFactory, other, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT8Adapter({ canvases: { [CANVAS_REF]: makeCanvasMd() } })} busFactory={busFactory} />)
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Canvas C' }))
    await screen.findByTestId('canvas-board')

    // Seed presence: another window holds the source doc.
    act(() => {
      other.post({ type: 'presence', windowId: 'win-doc', role: 'satellite', entity: { kind: 'doc', ref: DOC_REF } })
    })

    fireEvent.click(screen.getByTestId('card-card-1'))
    await waitFor(() =>
      expect(
        posted.some(
          (m) =>
            m.type === 'navigate' &&
            m.targetRef === DOC_REF &&
            !!m.anchor &&
            m.anchor.exact === 'Gamma' &&
            !('linkId' in m && m.linkId)
        )
      ).toBe(true)
    )
  })

  // (d) CANVAS window: clicking a card whose source is open NOWHERE posts open-entity{anchor}.
  it('(d) clicking a card whose source is closed posts open-entity with the anchor', async () => {
    const { busFactory, posted } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT8Adapter({ canvases: { [CANVAS_REF]: makeCanvasMd() } })} busFactory={busFactory} />)
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Canvas C' }))
    await screen.findByTestId('canvas-board')

    // No presence for the source doc → nobody holds it → ask the hub to open it (carrying anchor).
    fireEvent.click(screen.getByTestId('card-card-1'))
    await waitFor(() =>
      expect(
        posted.some(
          (m) =>
            m.type === 'open-entity' &&
            m.kind === 'doc' &&
            m.ref === DOC_REF &&
            !!m.anchor &&
            m.anchor.exact === 'Gamma'
        )
      ).toBe(true)
    )
  })

  // (e) RECEIVER (doc window): a navigate{targetRef, anchor} resolves the anchor in THIS pane's own
  // text and jumps to it — section 1 ("Two"/"Gamma") becomes active. (anchor resolves directly:
  // the excerpt was lifted from THIS doc, unlike the link case where only the link id travels.)
  it('(e) receiving navigate with an anchor resolves it in this pane and jumps', async () => {
    const { busFactory, other } = makeBusPair()
    const user = userEvent.setup()
    render(<App adapter={makeT8Adapter()} busFactory={busFactory} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')

    // Section 1 ("Two") is not active before the jump.
    const text = importMarkdown(DOC_CONTENT, 'note.md').text
    const gStart = text.indexOf('Gamma')
    const anchor = createAnchor(text, gStart, gStart + 'Gamma'.length)
    expect(screen.getByTestId('section-1-two').getAttribute('data-active')).toBe('false')

    act(() => {
      other.post({ type: 'navigate', targetRef: DOC_REF, anchor })
    })

    await waitFor(() =>
      expect(screen.getByTestId('section-1-two').getAttribute('data-active')).toBe('true')
    )
  })
})

// ── Task 6: project gating (no active project → ProjectsView; selecting reveals docs) ───────────
describe('App project gating', () => {
  beforeEach(() => {
    // These tests want the NO-active-project state, so undo the shared beforeEach seed.
    try { localStorage.removeItem('rb.activeProject') } catch { /* ignore */ }
  })

  it('shows ProjectsView when no project is active', async () => {
    render(<App adapter={makeAdapter({ content: THREE })} />)
    // The add-folder tile is shown (landing); the workspace (library-list) is NOT.
    expect(await screen.findByRole('button', { name: /add folder/i })).toBeInTheDocument()
    // The project card's open button carries the name + doc count ("Lib … document").
    expect(await screen.findByRole('button', { name: /Lib.*document/i })).toBeInTheDocument()
    expect(screen.queryByTestId('library-list')).toBeNull()
  })

  it('opening a project reveals its documents and calls listLibrary with the project id', async () => {
    const user = userEvent.setup()
    const adapter = makeAdapter({
      content: THREE,
      entries: [{ ref: 'documents/a.md', name: 'a.md', ext: 'md' }]
    })
    render(<App adapter={adapter} />)
    // Click the project card → enter its workspace.
    await user.click(await screen.findByRole('button', { name: /Lib.*document/i }))
    // Its document tree now lists a.md, and listLibrary was scoped to the project id 'p1'.
    expect(await screen.findByRole('button', { name: /a\.md/i })).toBeInTheDocument()
    expect(adapter.listLibrary).toHaveBeenCalledWith('p1')
  })

  it('”All projects” returns to the gate from a project workspace', async () => {
    // Seed an active project so we boot straight into the workspace, then exit it.
    try { localStorage.setItem('rb.activeProject', 'p1') } catch { /* ignore */ }
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ content: THREE })} />)
    expect(await screen.findByTestId('library-list')).toBeInTheDocument()
    // Open the project-switcher menu and click “All projects…”
    await user.click(screen.getByRole('button', { name: /switch project/i }))
    await user.click(await screen.findByRole('menuitem', { name: /all projects/i }))
    expect(await screen.findByRole('button', { name: /add folder/i })).toBeInTheDocument()
    expect(screen.queryByTestId('library-list')).toBeNull()
  })
})

// ── Task 7: detach hand-off fix (wait for restored project before loading) ─────────────────────
describe('App detach project-load race', () => {
  it('does not load a document until the active project is restored', async () => {
    // URL carries a doc ref as if this is a detached satellite window.
    window.history.replaceState({}, '', '/?doc=note.md&detached=1')
    // localStorage already has the active project (set by shared beforeEach above).

    // A controllable promise for listProjects so we can control WHEN projectId resolves.
    let resolveListProjects!: (value: { id: string; name: string; path: string; docCount: number }[]) => void
    const listProjectsPromise = new Promise<{ id: string; name: string; path: string; docCount: number }[]>(
      (resolve) => { resolveListProjects = resolve }
    )

    const openDocument = vi.fn(async (pid: string, r: string) =>
      pid === 'p1' ? { ref: r, content: '# Hello\n\nWorld' } : null
    ) as unknown as PlatformAdapter['openDocument']

    const adapter = makeAdapter({ content: '# Hello\n\nWorld' })
    // Override listProjects with the deferred version so projectId stays null until we resolve.
    ;(adapter.listProjects as ReturnType<typeof vi.fn>).mockReturnValue(listProjectsPromise)
    adapter.openDocument = openDocument

    render(<App adapter={adapter} />)

    // While listProjects is pending, projectId is null — openDocument must NOT be called at all.
    // Flush pending microtasks/timers but don't yet resolve listProjects.
    await new Promise((r) => setTimeout(r, 0))
    expect(openDocument).not.toHaveBeenCalledWith('', 'note.md')
    expect(openDocument).not.toHaveBeenCalledWith(undefined, 'note.md')

    // Now resolve listProjects → useProjects restores 'p1' from localStorage → projectId flips.
    resolveListProjects([{ id: 'p1', name: 'Lib', path: '/lib', docCount: 1 }])

    // After the project arrives, the doc-load effect re-fires and loads with the correct projectId.
    await waitFor(() => expect(openDocument).toHaveBeenCalledWith('p1', 'note.md'))
    // And was never called with an empty string.
    expect(openDocument).not.toHaveBeenCalledWith('', 'note.md')
    expect(openDocument).not.toHaveBeenCalledWith(undefined, 'note.md')
  })

  it('renders the restore note as a .rb-pill--warn span when a card anchor cannot be resolved', async () => {
    // Build a canvas card whose anchor is way out of range so resolveAnchor returns null
    // and the app calls setRestoreNote('That passage was not found in its source.').
    const docText = '# Intro\n\nAlpha paragraph.'
    const canvasMd =
      '---\nschemaVersion: 1\nid: "b"\ntitle: "B"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards:\n' +
      '  - id: "c1"\n    kind: "excerpt"\n    source: "documents/note.md"\n' +
      '    anchor: { start: 99999, end: 100000, exact: "MISSING", prefix: "", suffix: "" }\n' +
      '    x: 0\n    y: 0\nconnections: []\n---\n\n<!-- rb:card c1 -->\n> MISSING\n'
    const adapter = makeAdapter({ content: docText, canvases: { 'canvases/b.md': canvasMd } })
    const user = userEvent.setup()
    const { container } = render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    // Open the QuickPicker via the header search input, then select the canvas.
    await user.click(await screen.findByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: 'B' }))
    await user.click(await screen.findByTestId('card-c1'))
    // The restore note should now be a .rb-pill--warn span with role="status"
    await waitFor(() => expect(container.querySelector('.rb-pill--warn')).not.toBeNull())
    expect(container.querySelector('.rb-pill--warn')!.getAttribute('role')).toBe('status')
  })

  it('renders the load error as a .rb-pill--danger span when openDocument rejects', async () => {
    // Trigger the header error span by rejecting openDocument (mirrors the existing "bridge read rejects" test).
    const user = userEvent.setup()
    const { container } = render(
      <App
        adapter={makeAdapter({
          openDocument: vi.fn().mockRejectedValue(new Error('Failed to read file'))
        })}
      />
    )
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    // The error span should now be a .rb-pill--danger span with role="alert"
    await waitFor(() => expect(container.querySelector('.rb-pill--danger')).not.toBeNull())
    expect(container.querySelector('.rb-pill--danger')!.getAttribute('role')).toBe('alert')
  })
})

// ── Plan 3a-2 NEW: multi-pane link resolution, tab-close cleanup, pin persistence ───────────────
describe('App 3a-2: pane-model critical paths', () => {
  const A_REF = 'documents/a.md'
  const B_REF = 'documents/b.md'
  const C_REF = 'documents/c.md'
  const DOC_A = '# Aydoc\n\nAlpha-A here.'
  const DOC_B = '# Beedoc\n\nBeta-B here.'
  const DOC_C = '# Ceedoc\n\nGamma-C here.'
  const docs3: Record<string, string> = { [A_REF]: DOC_A, [B_REF]: DOC_B, [C_REF]: DOC_C }

  // Each doc carries the half-connections it participates in: A{AB,AC}, B{AB,BC}, C{AC,BC}.
  function sidecar3For(ref: string): string {
    const src = docs3[ref]
    const text = importedText(src)
    const needle = ref === A_REF ? 'Alpha-A' : ref === B_REF ? 'Beta-B' : 'Gamma-C'
    const start = text.indexOf(needle)
    const side = emptySidecar(`doc-${ref}`, hashContent(src))
    const mk = (id: string, other: string): void => {
      side.links.push({ id, anchor: createAnchor(text, start, start + needle.length), otherDocRef: other })
    }
    if (ref === A_REF) { mk('AB', B_REF); mk('AC', C_REF) }
    else if (ref === B_REF) { mk('AB', A_REF); mk('BC', C_REF) }
    else { mk('AC', A_REF); mk('BC', B_REF) }
    return serializeSidecar(side)
  }

  function makeAdapter3(): PlatformAdapter {
    const adapter = makeAdapter({
      entries: [
        { ref: A_REF, name: 'a.md', ext: 'md' },
        { ref: B_REF, name: 'b.md', ext: 'md' },
        { ref: C_REF, name: 'c.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: docs3[ref] ?? '', hash: '' })),
      sidecar: null
    })
    ;(adapter.readSidecar as ReturnType<typeof vi.fn>).mockImplementation((_pid: string, ref: string) =>
      Promise.resolve(sidecar3For(ref))
    )
    return adapter
  }

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
  })

  it('3 panes: every pairwise connection resolves a single arc (no double-emit)', async () => {
    // maxShown=3 requires innerWidth>=1100 (jsdom defaults to 1024 → maxShown=2).
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
      window.dispatchEvent(new Event('resize'))
    })
    const user = userEvent.setup()
    render(<App adapter={makeAdapter3()} />)
    await user.click(await screen.findByRole('button', { name: /a\.md/i }))
    await screen.findByTestId('section-0-aydoc')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: c\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))
    // All three pairwise arcs resolve, each exactly once (no double-emit across the i<j passes).
    expect(await screen.findByTestId('link-arc-AB')).toBeInTheDocument()
    expect(await screen.findByTestId('link-arc-AC')).toBeInTheDocument()
    expect(await screen.findByTestId('link-arc-BC')).toBeInTheDocument()
    expect(screen.getAllByTestId('link-arc-AB')).toHaveLength(1)
    expect(screen.getAllByTestId('link-arc-AC')).toHaveLength(1)
    expect(screen.getAllByTestId('link-arc-BC')).toHaveLength(1)
  })

  it('closing a tab clears its cached model (reopen re-parses)', async () => {
    const openDocument = vi.fn(async (_pid: string, ref: string) => ({ ref, content: THREE, hash: '' }))
    const adapter = makeAdapter({ openDocument: openDocument as unknown as PlatformAdapter['openDocument'] })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    expect(openDocument).toHaveBeenCalledTimes(1)
    // Close the tab via the strip ✕ → closeTabFully drops the cached docModelByTab entry.
    const strip = await screen.findByTestId('open-rail')
    await user.click(within(strip).getByRole('button', { name: 'Close note.md' }))
    // Back to the cockpit; reopen → the model was dropped → openDocument is called a SECOND time.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    expect(openDocument).toHaveBeenCalledTimes(2)
  })

  it('clicking the BC arc (two non-leftmost panes) jumps BOTH b and c panes', async () => {
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 })
      window.dispatchEvent(new Event('resize'))
    })
    const user = userEvent.setup()
    render(<App adapter={makeAdapter3()} />)
    await user.click(await screen.findByRole('button', { name: /a\.md/i }))
    await screen.findByTestId('section-0-aydoc')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: c\.md/i }))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3))

    // Click the BC arc body. Both the b-pane and c-pane must scroll to their endpoint, marked by
    // the connection-jump flash. The flashed range carries data-conn-flash on the target span.
    const arc = await screen.findByTestId('link-arc-BC')
    await user.click(arc)
    await waitFor(() => expect(document.querySelectorAll('[data-conn-flash="true"]')).toHaveLength(2))
  })

  it('a pinned canvas survives reload and re-occupies the rightmost pane', async () => {
    const canvasMd =
      '---\nschemaVersion: 1\nid: "a"\ntitle: "Board A"\nviewport: { x: 0, y: 0, zoom: 1 }\ncards: []\nconnections: []\n---\n\n'
    const adapter = makeAdapter({ content: THREE, canvases: { 'canvases/a.md': canvasMd } })
    const user = userEvent.setup()
    const { unmount } = render(<App adapter={adapter} />)
    // Open a doc, then open the canvas beside it, then pin the canvas.
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    await screen.findByTestId('canvas-board')
    await user.click(screen.getByRole('button', { name: 'Pin canvas' }))
    // Reload: unmount and remount with rb-pinned-canvas persisted in localStorage. Reset the URL so
    // the remount boots to the cockpit (not the last session's URL-seeded tab).
    unmount()
    window.history.replaceState({}, '', '/')
    render(<App adapter={adapter} />)
    // Open the canvas FIRST (its pinned state persisted), then the doc — the pinned canvas must still
    // float to the rightmost slot even though it was opened before the doc.
    await user.click(await screen.findByRole('tab', { name: /^Canvases/ }))
    await user.click(await screen.findByRole('button', { name: 'Board A' }))
    await screen.findByTestId('canvas-board')
    // Its pin control reads as already-pinned (persistence survived the reload).
    expect(screen.getByRole('button', { name: 'Unpin canvas' })).toBeInTheDocument()
    // Now open the doc via the picker (added to a 2nd pane).
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open in new tab: note\.md/i }))
    // Two panes now (doc + canvas); the canvas pane is the rightmost (last in DOM order).
    await waitFor(() => expect(document.querySelectorAll('[data-pane-kind]')).toHaveLength(2))
    const paneEls = Array.from(document.querySelectorAll('[data-pane-kind]'))
    expect(paneEls[paneEls.length - 1].getAttribute('data-pane-kind')).toBe('canvas')
  })
})

// ── Independent pane scroll: the flex-column chain must carry minHeight:0 ────────────────────────
// jsdom can't compute layout (no scrollHeight), so this guards the structural property that makes
// each pane's <article overflowY:auto> its OWN scroll context: every flex-COLUMN ancestor between
// the 100vh root and the article needs minHeight:0, else min-height:auto forces the column child to
// grow to full content height — the overflow climbs to the window and all panes scroll together.
describe('App pane scroll: flex-column chain carries minHeight:0', () => {
  it('each open pane container (and its per-pane wrapper) sets minHeight:0', async () => {
    const adapter = makeAdapter({
      entries: [
        { ref: 'documents/a.md', name: 'a.md', ext: 'md' },
        { ref: 'documents/b.md', name: 'b.md', ext: 'md' }
      ],
      openDocument: vi.fn(async (_pid: string, ref: string) => ({ ref, content: THREE, hash: '' }))
    })
    const user = userEvent.setup()
    render(<App adapter={adapter} />)
    await user.click(await screen.findByRole('button', { name: /a\.md/i }))
    await screen.findByTestId('section-0-one')
    await user.click(screen.getByRole('textbox', { name: /search documents and canvases/i }))
    await user.click(await screen.findByRole('button', { name: /open beside: b\.md/i }))
    await waitFor(() => expect(document.querySelectorAll('[data-pane-kind]')).toHaveLength(2))

    for (const pane of Array.from(document.querySelectorAll('[data-pane-kind]'))) {
      // The Pane root is a flex column whose body (DocumentPane) must be allowed to shrink.
      expect(['0', '0px']).toContain((pane as HTMLElement).style.minHeight)
      // Its parent is the per-pane wrapper from PaneRow — same requirement for chain consistency.
      expect(['0', '0px']).toContain((pane.parentElement as HTMLElement).style.minHeight)
    }
  })
})

// ── Task 8: per-tab search open state + header magnifier + Cmd/Ctrl+F routing ────────────────────
describe('App Task 8: per-pane search state + magnifier + Cmd/Ctrl+F', () => {
  // Opens the standard single-doc library entry into a pane (mirrors the top-level "opens a file"
  // test's bootstrap) so each search test starts with one doc pane shown.
  async function openADocument(): Promise<void> {
    const user = userEvent.setup()
    render(<App adapter={makeAdapter({ content: THREE })} />)
    await user.click(await screen.findByRole('button', { name: /note\.md/i }))
    await screen.findByRole('article')
  }

  it('opens per-pane search via the header magnifier', async () => {
    await openADocument()
    expect(screen.queryByTestId('search-bar')).toBeNull()
    fireEvent.click(screen.getByLabelText('Search this document'))
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Close search')) // Esc path also fine
    expect(screen.queryByTestId('search-bar')).toBeNull()
  })

  it('opens search on the focused pane via Cmd/Ctrl+F', async () => {
    await openADocument()
    fireEvent.keyDown(window, { key: 'f', metaKey: true })
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
  })
})
