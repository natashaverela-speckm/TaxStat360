// src/utils/sessionState-no-bearer-token.test.js
//
// AUDIT H5 (second launch audit, Sep 2026) — THE BEARER TOKEN IS GONE.
//
// The raw session token was stored in localStorage by both auth paths and attached as
// an Authorization header on every API request, while App.jsx asserted the opposite.
// It was readable by any script executing on the page, had no refresh or rotation, and
// its only lifetime control was the client-side sliding window.
//
// Settled by reading the backend (TaxStat360-api, app/main.py):
//   _session_email      (:544)  verifies the COOKIE first and returns immediately;
//                               the Authorization header is only a fallback.
//   _require_session_user (:682) wraps it; all 18 authenticated routes use it,
//                               including POST /stripe/subscribe (:1886) — the one
//                               call site that could not be exercised from a test
//                               without creating a real subscription.
// No route reads the Authorization header directly; every other Bearer in that file
// is an OUTGOING call to Stripe, QuickBooks, Xero or OpenAI.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..')
const read = (p) => readFileSync(join(SRC, p), 'utf8')
const code = (p) =>
  read(p).replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '')

describe('H5 — nothing stores or sends the raw token', () => {
  it('the accessors are gone from sessionState', () => {
    const s = code('utils/sessionState.js')
    expect(s).not.toMatch(/export function readToken/)
    expect(s).not.toMatch(/export function writeToken/)
  })

  it('apiClient attaches no Authorization header', () => {
    const s = code('utils/apiClient.js')
    expect(s).not.toMatch(/Authorization/)
    expect(s).not.toMatch(/readToken/)
    // The cookie is what authenticates, so this must stay.
    expect(s).toMatch(/credentials === 'same-origin' \? 'include'/)
  })

  it('neither auth path writes it', () => {
    const s = code('components/Onboarding.jsx')
    expect(s).not.toMatch(/writeToken/)
    expect(s).not.toMatch(/access_token/)
  })

  it('the payment path sends no hand-set header', () => {
    // Upgrade.jsx:170 was the blocker: it set the header by hand on
    // POST /stripe/subscribe, and that endpoint cannot be exercised from a test
    // without creating a real subscription.
    const s = code('components/Upgrade.jsx')
    expect(s).not.toMatch(/Authorization/)
    expect(s).not.toMatch(/readToken/)
    expect(s).toMatch(/\/stripe\/subscribe/)
    expect(s).toMatch(/credentials: 'include'/)
  })

  it('no file in src/ attaches a Bearer header to our own API', () => {
    // Structural guard: catches a new call site reintroducing it anywhere.
    const offenders = []
    const walk = (dir) => {
      for (const name of readFileSync ? require('node:fs').readdirSync(dir) : []) {
        const p = join(dir, name)
        if (require('node:fs').statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(js|jsx)$/.test(name) || /\.test\./.test(name)) continue
        const s = readFileSync(p, 'utf8')
          .replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
        // Outgoing third-party calls are fine; a Bearer built from our stored token is not.
        if (/Bearer \$\{\s*(token|readToken\(\))\s*\}/.test(s)) offenders.push(p.slice(SRC.length + 1))
      }
    }
    walk(SRC)
    expect(offenders).toEqual([])
  })
})

describe('H5 — tokens already in browsers are purged', () => {
  it('App.jsx purges on startup', () => {
    expect(read('components/App.jsx')).toMatch(/purgeLegacySessionToken\(\)/)
  })

  it('the purge removes the key and never throws', async () => {
    const { purgeLegacySessionToken } = await import('./sessionState.js')
    const store = { ts360_token: 'eyJhbGciOi.fake.token' }
    const orig = globalThis.localStorage
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    }
    try {
      purgeLegacySessionToken()
      expect(store.ts360_token).toBeUndefined()
      expect(() => purgeLegacySessionToken()).not.toThrow()
      globalThis.localStorage = { removeItem() { throw new Error('denied') } }
      expect(() => purgeLegacySessionToken()).not.toThrow()
    } finally { globalThis.localStorage = orig }
  })

  it('the key stays in the sign-out and session-expiry sweeps', () => {
    // Belt and braces for any browser that does not run the startup purge.
    expect(read('utils/SignOut.jsx')).toMatch(/ts360_token/)
    expect(read('utils/sessionAuth.js')).toMatch(/ts360_token/)
  })
})

describe('H5 — the comment that started this is now true', () => {
  it('App.jsx no longer retracts itself', () => {
    const a = read('components/App.jsx')
    expect(a).toMatch(/NOW TRUE, AND ENFORCED/)
    expect(a).toMatch(/_session_email/)
    expect(a).not.toMatch(/COMMENT CORRECTED/)
  })
})
