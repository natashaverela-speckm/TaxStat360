import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// v4 - force new bundle filename
export default defineConfig({
  plugins: [react()],
  esbuild: { target: 'es2015' },
  define: { __BUILD__: '"v4"' },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  },
  test: {
    // Use jsdom to simulate a browser environment for React component tests.
    // taxCalc.test.js (pure unit tests) runs in this environment too — jsdom
    // is a superset of node for our purposes so existing tests are unaffected.
    globals: true,
    environment: 'jsdom',
    setupFiles: './test-setup.js',
  }
})
