import { resolve } from 'path'
import { defineConfig } from 'vite'

// Bundle the Node server (and the core modules it imports) into one file.
// Externalize the native LiteParse dep — both levers are required: `ssr.external` is
// Vite's SSR-pipeline gate; `rollupOptions.external` is Rollup's bundler gate. The dep is
// loaded at runtime via dynamic import() from node_modules; never bundle the .node binary.
export default defineConfig({
  ssr: { external: ['@llamaindex/liteparse'] },
  build: {
    outDir: resolve(__dirname, 'out-server'),
    emptyOutDir: true,
    ssr: true,
    target: 'node18',
    rollupOptions: {
      input: resolve(__dirname, 'src/server/start.ts'),
      external: ['@llamaindex/liteparse'],
      output: { entryFileNames: 'start.mjs' }
    }
  }
})
