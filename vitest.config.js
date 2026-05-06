import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Default environment: node — keeps taxCalc.test.js (pure unit tests) fast
    // and free of DOM overhead. Individual test files that need a browser-like
    // environment (e.g. src/TaxReturn.test.jsx) opt in via:
    //   // @vitest-environment jsdom
    // at the top of the file.
    globals: true,
    environment: 'node',
    setupFiles: ['./test-setup.js'],
  },
})
