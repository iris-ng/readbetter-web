import { createRequire } from 'module'
import { dirname, resolve } from 'path'
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// pdf.js v6 moved its image decoders (JBIG2, JPEG2000, …) to WASM and expects them served
// as sibling files under a directory it's told about via `wasmUrl`. Serve pdfjs-dist/wasm/*
// verbatim at /wasm/ in both dev (middleware) and build (copy into outDir), so scanned PDFs
// that use JBIG2/JPEG2000 render instead of coming up blank. See src/renderer/pdf/pdfjs.ts.
function pdfjsWasm(): Plugin {
  const require = createRequire(import.meta.url)
  const wasmDir = resolve(dirname(require.resolve('pdfjs-dist/package.json')), 'wasm')
  const files = readdirSync(wasmDir).filter((f) => f.endsWith('.wasm'))
  return {
    name: 'pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use('/wasm', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '')
        if (!files.includes(name)) return next()
        res.setHeader('Content-Type', 'application/wasm')
        res.end(readFileSync(resolve(wasmDir, name)))
      })
    },
    writeBundle(options) {
      const outWasm = resolve(options.dir ?? '', 'wasm')
      mkdirSync(outWasm, { recursive: true })
      for (const f of files) writeFileSync(resolve(outWasm, f), readFileSync(resolve(wasmDir, f)))
    }
  }
}

// Standalone browser bundle of the renderer, served by the loopback server.
export default defineConfig({
  root: 'src/renderer',
  base: '/',
  plugins: [react(), pdfjsWasm()],
  build: {
    outDir: resolve(__dirname, 'out-web'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
  }
})
