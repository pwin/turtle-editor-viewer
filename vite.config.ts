import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/turtle-editor-viewer-new/',
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
        manualChunks: {
          vendor: ['react', 'react-dom'],
          rdf: ['rdf-ext', 'n3'],
          // Editor and viz are large, keep them separate
          editor: ['monaco-editor', '@monaco-editor/react'],
          viz: ['@viz-js/viz'],
          // Split out other large dependencies if needed
          utils: ['lodash', 'file-saver'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase limit to suppress warnings for large chunks like monaco
  },
  optimizeDeps: {
    include: ['monaco-editor', '@monaco-editor/react', 'rdf-ext', 'n3', '@viz-js/viz', '@comunica/query-sparql'],
  },
})