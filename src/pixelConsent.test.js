// @vitest-environment jsdom
// src/pixelConsent.test.js
//
// AUDIT (re-audit finding) — the Meta Pixel must be consent-gated. It previously fired
// PageView on every load, sharing data with Meta for advertising while the Privacy Policy
// stated data is "never shared with third parties for advertising." These guards pin the
// remediation at the source level (index.html + the CookieBanner Accept handler).

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('Meta Pixel is consent-gated (re-audit)', () => {
  const html = read('../index.html')

  it('index.html does NOT fire fbq unconditionally at page load', () => {
    // The only fbq('init')/fbq('track') calls must live inside the deferred loader,
    // never at top level. Proxy: there is exactly one gated loader and the top-level
    // code checks consent before invoking it.
    expect(html).toMatch(/window\.__ts360LoadPixel\s*=\s*function/)
    expect(html).toMatch(/ts360_cookie_consent'\)\s*===\s*'accepted'/)
  })

  it('index.html no longer ships the unconditional noscript pixel', () => {
    expect(html).not.toMatch(/noscript.*facebook\.com\/tr/s)
  })

  it('the cookie banner loads the pixel only on Accept', () => {
    const app = read('../src/components/App.jsx')
    expect(app).toMatch(/choice === 'accepted'[\s\S]*__ts360LoadPixel/)
  })

  it('Privacy Policy discloses the Meta Pixel and scopes the advertising promise', () => {
    const pol = read('../src/components/Privacy.jsx')
    expect(pol).toMatch(/Cookies, Analytics/)
    expect(pol).toMatch(/Meta \(Facebook\) advertising pixel/)
    // The blanket "your data ... never shared for advertising" line is now scoped
    // to financial/account data (the pixel shares only website-usage data).
    expect(pol).toMatch(/financial and account data[\s\S]*never shared with third parties for advertising/)
  })
})
