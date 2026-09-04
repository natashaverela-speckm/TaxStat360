/**
 * Copy pdf.js worker into public/ as *.js so S3/CloudFront serves
 * Content-Type: text/javascript (*.mjs often SPA-fallbacks to index.html).
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs')
const destDir = join(root, 'public')
const dest = join(destDir, 'pdf.worker.min.js')

mkdirSync(destDir, { recursive: true })
copyFileSync(src, dest)
console.log(`[copy-pdf-worker] ${src} -> ${dest}`)
