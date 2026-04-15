import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// v3 - force new bundle filename
export default defineConfig({
  plugins: [react()],
  esbuild: { target: 'es2015' },
  define: { __BUILD__: '"v3"' },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  }
})
