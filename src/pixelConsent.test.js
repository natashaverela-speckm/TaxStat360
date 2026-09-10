// @vitest-environment jsdom
// src/pixelConsent.test.js
//
// AUDIT (re-audit finding) — the Meta Pixel must be consent-gated. It previously fired
// PageView on every load, sharing data with Meta for advertising while the Privacy Policy
// stated data is "never shared with third parties for advertising." These guards pin the
// remediation at the source level (index.html + the CookieBanner Accept handler).
//
// AUDIT B6 (Sep 2026) — consent alone was not enough. The loader had NO path check, so
// once a visitor accepted cookies the pixel followed them onto /signup (which collects
// FULL NAME + EMAIL, and Meta's Automatic Advanced Matching scrapes form fields with no
// developer code), onto /terms and /privacy, and into the signed-in app — making the
// Privacy Policy's "it never runs inside the signed-in application" a false statement.
// The second describe() block below pins the route allowlist.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { isPixelAllowedPath, PIXEL_ALLOWED_PATHS } from './lib/complianceCopy.js'

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
    const app = read('./components/App.jsx')
    expect(app).toMatch(/choice === 'accepted'[\s\S]*__ts360LoadPixel/)
  })

  it('Privacy Policy discloses the Meta Pixel and scopes the advertising promise', () => {
    const pol = read('./components/Privacy.jsx')
    expect(pol).toMatch(/Cookies, Analytics/)
    expect(pol).toMatch(/Meta \(Facebook\) advertising pixel/)
    // The blanket "your data ... never shared for advertising" line is now scoped
    // to financial/account data (the pixel shares only website-usage data).
    expect(pol).toMatch(/financial and account data[\s\S]*never shared with third parties for advertising/)
  })
})

describe('AUDIT B6 — Meta Pixel is route-gated to public marketing pages', () => {
  const html = read('../index.html')

  it('index.html defines the route allowlist and checks it inside the loader', () => {
    expect(html).toMatch(/window\.__ts360PixelAllowed\s*=\s*function/)
    // The path check must run BEFORE the loaded flag is set, or a disallowed first
    // paint would permanently mark the pixel "loaded" and skip it everywhere after.
    const loader = html.slice(html.indexOf('window.__ts360LoadPixel'))
    const guardAt = loader.indexOf('__ts360PixelAllowed(window.location.pathname)')
    const flagAt = loader.indexOf('__ts360PixelLoaded = true')
    expect(guardAt).toBeGreaterThan(-1)
    expect(flagAt).toBeGreaterThan(-1)
    expect(guardAt).toBeLessThan(flagAt)
  })

  it('index.html disables Meta autoConfig (Automatic Advanced Matching) before init', () => {
    const setAt = html.indexOf("fbq('set', 'autoConfig', false")
    const initAt = html.indexOf("fbq('init'")
    expect(setAt).toBeGreaterThan(-1)
    expect(initAt).toBeGreaterThan(-1)
    expect(setAt).toBeLessThan(initAt)
  })

  it('App.jsx gates both the Accept handler and client-side navigation on the path', () => {
    const app = read('./components/App.jsx')
    expect(app).toMatch(/isPixelAllowedPath/)
    // The SPA route gate — without it, accepting on /signup then navigating to the
    // marketing site (or the reverse) is unguarded.
    expect(app).toMatch(/function PixelRouteGate/)
    expect(app).toMatch(/<PixelRouteGate\s*\/>/)
  })

  it('BLOCKS the routes that made the Privacy Policy false', () => {
    for (const p of [
      '/signup', '/register', '/login', '/signin', '/verify-email',
      '/terms', '/privacy', '/privacy-policy', '/terms-of-service',
      '/dashboard', '/calculate-tax', '/calculator', '/personal-estimate',
      '/tax-return', '/ai-analysis', '/settings', '/admin', '/upgrade',
      '/onboarding/welcome', '/carryforward-wizard', '/reset-password',
      '/forgot-password', '/integrations/quickbooks/callback',
    ]) {
      expect(isPixelAllowedPath(p), `${p} must NOT load the pixel`).toBe(false)
    }
  })

  it('ALLOWS only the public marketing pages', () => {
    for (const p of ['/', '/about', '/pricing', '/features', '/faq', '/how-it-works', '/contact', '/resources']) {
      expect(isPixelAllowedPath(p), `${p} should load the pixel`).toBe(true)
    }
    // Article pages are public marketing too.
    expect(isPixelAllowedPath('/resources/s-corp-salary-split')).toBe(true)
  })

  it('is an allowlist — an unknown/new route is excluded by default', () => {
    expect(isPixelAllowedPath('/some-new-route')).toBe(false)
    expect(isPixelAllowedPath('/dashboard/anything')).toBe(false)
    expect(isPixelAllowedPath('')).toBe(false)
    expect(isPixelAllowedPath(null)).toBe(false)
    expect(isPixelAllowedPath(undefined)).toBe(false)
  })

  it('normalizes trailing slashes so /about/ is not a bypass or a miss', () => {
    expect(isPixelAllowedPath('/about/')).toBe(true)
    expect(isPixelAllowedPath('/signup/')).toBe(false)
    expect(isPixelAllowedPath('/')).toBe(true)
  })

  it('the JS allowlist and the index.html copy stay in sync', () => {
    // index.html runs before the bundle, so the list is deliberately duplicated.
    // This is the pin that stops the two drifting.
    for (const p of PIXEL_ALLOWED_PATHS) {
      expect(html, `index.html allowlist is missing ${p}`).toContain(`'${p}'`)
    }
  })
})
