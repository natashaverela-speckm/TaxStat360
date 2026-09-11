// src/assertLiveHeaders.test.js
//
// AUDIT H13 (second launch audit, Sep 2026) — tests for the live-response header check.
//
// The September incident passed every test in this repo, because every test read the
// YAML file and none read the response. scripts/assertLiveHeaders.mjs closes that gap;
// these tests prove it actually catches the failures it exists for, rather than merely
// passing against a healthy site.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkHeaders, HEADER_RULES, DEFAULT_URL } from '../scripts/assertLiveHeaders.mjs'

// A known-good header set, matching what production serves today.
const GOOD = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'sha256-abc' https://js.stripe.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https://www.facebook.com; connect-src 'self' https://app.taxstat360.com; " +
    "frame-src https://js.stripe.com; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; " +
    "base-uri 'self'; form-action 'self'; upgrade-insecure-requests;",
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

const lookup = (headers) => (name) => (name in headers ? headers[name] : null)
const check = (overrides = {}) => {
  const h = { ...GOOD, ...overrides }
  for (const k of Object.keys(overrides)) if (overrides[k] === undefined) delete h[k]
  return checkHeaders(lookup(h))
}

describe('H13 — a healthy response passes', () => {
  it('the known-good set produces no failures', () => {
    expect(check()).toEqual([])
  })

  it('every rule is exercised by the good set', () => {
    // Guard against a rule silently never being evaluated.
    expect(HEADER_RULES.length).toBe(6)
    expect(HEADER_RULES.every((r) => r.name in GOOD)).toBe(true)
  })
})

describe('H13 — it catches the September failure', () => {
  it('CSP absent entirely', () => {
    const f = check({ 'Content-Security-Policy': undefined })
    expect(f).toHaveLength(1)
    expect(f[0].name).toBe('Content-Security-Policy')
    expect(f[0].problem).toMatch(/absent/)
  })

  it('CSP present but carrying a newline — the exact YAML-folding bug', () => {
    // This is the value CloudFront received in September: real newlines inside the
    // header value, which an HTTP header cannot carry, so it was dropped.
    const f = check({ 'Content-Security-Policy': GOOD['Content-Security-Policy'].replace('; connect-src', ';\n          connect-src') })
    expect(f).toHaveLength(1)
    expect(f[0].problem).toMatch(/newline/)
  })

  it('CSP truncated to something implausibly short', () => {
    const f = check({ 'Content-Security-Policy': "default-src 'self';" })
    expect(f.some((x) => /missing directive|short/.test(x.problem))).toBe(true)
  })
})

describe('H13 — it catches the second header source coming back', () => {
  it('X-Frame-Options: SAMEORIGIN', () => {
    // amplify.yml used to set SAMEORIGIN while customHttp.yml set DENY. If the live
    // response ever says SAMEORIGIN again, a second header source is in play.
    const f = check({ 'X-Frame-Options': 'SAMEORIGIN' })
    expect(f).toHaveLength(1)
    expect(f[0].problem).toMatch(/expected DENY/)
  })

  it('a deploy path that applies no headers at all fails loudly', () => {
    // The GitHub Actions path syncs dist/ to S3 and invalidates CloudFront directly;
    // customHttp.yml is an Amplify Hosting file and does nothing there. Result:
    const f = checkHeaders(() => null)
    expect(f).toHaveLength(HEADER_RULES.length)
  })
})

describe('H13 — it catches regressions in the hardening already done', () => {
  it('img-src back to permitting any https host (M8)', () => {
    const f = check({ 'Content-Security-Policy': GOOD['Content-Security-Policy'].replace("img-src 'self' data: blob: https://www.facebook.com", "img-src 'self' data: https: blob:") })
    expect(f.some((x) => /any https host/.test(x.problem))).toBe(true)
  })

  it("script-src back to 'unsafe-inline' (M-7)", () => {
    const f = check({ 'Content-Security-Policy': GOOD['Content-Security-Policy'].replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") })
    expect(f.some((x) => /unsafe-inline/.test(x.problem))).toBe(true)
  })

  it('HSTS max-age weakened below a year', () => {
    const f = check({ 'Strict-Transport-Security': 'max-age=600' })
    expect(f).toHaveLength(1)
    expect(f[0].problem).toMatch(/too low/)
  })

  it('frame-ancestors dropped', () => {
    const f = check({ 'Content-Security-Policy': GOOD['Content-Security-Policy'].replace("frame-ancestors 'none'; ", '') })
    expect(f.some((x) => /frame-ancestors/.test(x.problem))).toBe(true)
  })
})

describe('H13 — there is exactly ONE header source in the repo', () => {
  const root = join(__dirname, '..')

  it('amplify.yml defines no customHeaders block', () => {
    // Two files defining headers for the same pattern is how a security header set
    // silently becomes whichever one the platform happens to prefer.
    const amplify = readFileSync(join(root, 'amplify.yml'), 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
    expect(amplify).not.toMatch(/customHeaders:/)
    expect(amplify).not.toMatch(/X-Frame-Options/)
    expect(amplify).not.toMatch(/SAMEORIGIN/)
  })

  it('customHttp.yml carries the cache rules that used to live in amplify.yml', () => {
    const http = readFileSync(join(root, 'customHttp.yml'), 'utf8')
    expect(http).toMatch(/pattern: '\/index\.html'/)
    expect(http).toMatch(/pattern: '\/assets\/\*\*'/)
    expect(http).toMatch(/max-age=31536000, immutable/)
  })

  it('the S3 deploy path runs the live check after deploying', () => {
    const wf = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8')
    expect(wf).toMatch(/assertLiveHeaders\.mjs/)
  })

  it('the default target is the production site', () => {
    expect(DEFAULT_URL).toBe('https://www.taxstat360.com/')
  })
})
