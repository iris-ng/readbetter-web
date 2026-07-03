import { test, expect } from '@playwright/test'

// W0 acceptance E2E. Run manually once Playwright is installed (see e2e/README.md).
// Precondition: `npm run start:web` is running against a temp library that contains
// documents/sample.md, served at http://127.0.0.1:7777 (READBETTER_PORT to override).
test('open a Markdown doc, annotate, reload, annotation persists', async ({ page }) => {
  await page.goto('http://127.0.0.1:7777')

  // The library list shows the sample document; open it by reference.
  await page.getByRole('button', { name: /sample\.md/i }).click()
  await expect(page.getByText(/First paragraph/)).toBeVisible()

  // TODO(manual smoke wiring): select text in the Reader and create a highlight via the
  // NotePopover flow, then assert the highlight persists across a reload. Text selection +
  // the popover gesture are app-specific; wire them to the same flow the manual smoke uses.
  await page.reload()
  await page.getByRole('button', { name: /sample\.md/i }).click()
  await expect(page.getByText(/First paragraph/)).toBeVisible()
  // After wiring the highlight step above, assert the <mark> re-renders here (persisted to
  // the real sibling sidecar documents/sample.readbetter.json).
})
