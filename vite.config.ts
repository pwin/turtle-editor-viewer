import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      stream: 'readable-stream',
      util: resolve(__dirname, 'src/util-polyfill.ts'),
    },
  },
  define: {
    global: 'window',
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Only list packages that src/ actually imports. Naming a package here
        // makes Rollup treat it as a chunk entry, which pulls it into the build
        // even when nothing imports it.
        manualChunks: {
          vendor: ['react', 'react-dom'],
          rdf: ['n3'],
          // monaco-editor itself is loaded from the CDN at runtime by
          // @monaco-editor/react, so only the wrapper belongs in the bundle.
          editor: ['@monaco-editor/react'],
          sparql: ['@comunica/query-sparql'],
          utils: ['file-saver'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase limit to suppress warnings for large chunks like monaco
  },
  optimizeDeps: {
    include: ['@monaco-editor/react', 'n3', '@comunica/query-sparql'],
  },
})
