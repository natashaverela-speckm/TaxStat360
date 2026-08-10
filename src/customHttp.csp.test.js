// src/customHttp.csp.test.js
//
// M-7 (fresh-pass audit, Aug 2026) — script-src must not carry 'unsafe-inline'
// or 'unsafe-eval'. The one genuinely inline script (the pixel loader in
// index.html) is allowed via a SHA-256 hash instead of a blanket allowance;
// this test computes that hash itself from the live index.html content and
// asserts it's the exact one listed in customHttp.yml, so a future edit to
// the pixel-loader script that forgets to update the hash fails loudly here
// instead of silently breaking the pixel in production.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import crypto from 'node:crypto'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

function pixelLoaderHash(html) {
  const marker = 'window.__ts360LoadPixel = function'
  const idx = html.indexOf(marker)
  const openTagEnd = html.lastIndexOf('<script>', idx) + '<script>'.length
  const closeTagStart = html.indexOf('</script>', idx)
  const content = html.slice(openTagEnd, closeTagStart)
  return 'sha256-' + crypto.createHash('sha256').update(content, 'utf8').digest('base64')
}

describe('Content-Security-Policy hardening (re-audit, M-7)', () => {
  const yml = read('../customHttp.yml')
  const html = read('../index.html')

  it('script-src does not carry unsafe-inline or unsafe-eval', () => {
    const scriptSrcLine = yml.split('\n').find((l) => l.trim().startsWith('script-src'))
    expect(scriptSrcLine).toBeTruthy()
    expect(scriptSrcLine).not.toMatch(/'unsafe-inline'/)
    expect(scriptSrcLine).not.toMatch(/'unsafe-eval'/)
  })

  it("script-src's pixel-loader hash matches index.html's actual inline script content", () => {
    const expectedHash = pixelLoaderHash(html)
    expect(yml).toContain(`'${expectedHash}'`)
  })
})
