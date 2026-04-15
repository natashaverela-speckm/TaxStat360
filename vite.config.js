import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// build v2 - multi-entity K1
export default defineConfig({
  plugins: [react()],
  esbuild: { target: 'es2015' },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames: 'assets/chunk-[hash].js',
      }
    }
  }
})
