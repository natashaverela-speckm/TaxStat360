// src/components/Onboarding.mfa-bypass.test.jsx
//
// AUDIT H6 (second launch audit, Sep 2026) — THE CLIENT-SIDE MFA BYPASS IS GONE.
//
// "Trust this device for 30 days" skipped the 2FA challenge on a decision that never
// reached the server. No device token was minted, stored server-side or transmitted.
// The fingerprint was btoa(userAgent | screen.width | screen.height) — three publicly
// observable values — and the expiry a client-writable integer. One localStorage.setItem
// forged the whole record.
//
// The finding said severity depended on a backend fact: whether /auth/login returns a
// usable session alongside mfa_required: true. That question does not need answering,
// because both answers condemn the code:
//
//   • If the backend DOES return a session pre-challenge, one storage key defeats 2FA
//     for anyone holding the password.
//   • If it correctly withholds one, the bypass still called finishLogin(), which sets
//     ts360_logged_in='1' and navigates into the app whether or not data.access_token
//     was present — a broken client-side session, not a safe one.
//
// Related live finding (H5 probe, 10 Sep 2026): the httpOnly cookie IS a working
// credential on its own — /auth/me, /records, /integrations/status and /auth/mfa/status
// all returned 200 with no Authorization header. So if that cookie is set at
// /auth/login time rather than after the challenge, the first bullet was the live case.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = () =>
  readFileSync(join(__dirname, 'Onboarding.jsx'), 'utf8')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')

describe('H6 — there is no client-side path around the MFA challenge', () => {
  it('the trusted-device helpers no longer exist', () => {
    const s = src()
    for (const sym of ['isTrustedDevice', 'trustThisDevice', 'getDeviceFingerprint', 'TRUST_DAYS', 'rememberDevice']) {
      expect(s, `${sym} should be gone`).not.toMatch(new RegExp(`\\b${sym}\\b`))
    }
  })

  it('mfa_required always presents the challenge', () => {
    // The branch must go straight to setMfaStep(true) with no conditional escape.
    const s = src()
    const i = s.indexOf('if(data.mfa_required){')
    expect(i).toBeGreaterThan(-1)
    // Slice PAST the branch's own opening `if(` so the assertion below is about the
    // branch body, not the line that introduces it.
    const body = s.slice(i + 'if(data.mfa_required){'.length, s.indexOf('setLoading(false)', i))
    expect(body).toMatch(/setMfaStep\(true\)/)
    expect(body).not.toMatch(/finishLogin/)
    expect(body).not.toMatch(/\bif\s*\(/)   // no conditional escape inside the branch
  })

  it('finishLogin is reachable only after the challenge or a non-MFA login', () => {
    const s = src()
    // Two call sites remain: the register path and the post-challenge path. Neither is
    // inside the mfa_required branch (asserted above).
    const calls = (s.match(/await finishLogin\(/g) || []).length
    expect(calls).toBe(2)
  })

  it('the checkbox is removed, not merely disconnected', () => {
    // Leaving a control whose label no longer describes what it does is the H10 defect
    // class. It goes with the behaviour.
    expect(src()).not.toMatch(/Trust this device/i)
    expect(src()).not.toMatch(/skip 2FA/i)
  })
})

describe('H6 — records written by the old build are purged', () => {
  it('App.jsx clears the legacy key on startup', () => {
    const app = readFileSync(join(__dirname, 'App.jsx'), 'utf8')
    expect(app).toMatch(/purgeLegacyDeviceTrust\(\)/)
  })

  it('the purge removes the key and never throws', async () => {
    const { purgeLegacyDeviceTrust } = await import('../utils/sessionState.js')
    const store = {}
    const orig = globalThis.localStorage
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    }
    try {
      store['ts360_trusted_device'] = '{"email":"x","fingerprint":"y","expires":9e15}'
      purgeLegacyDeviceTrust()
      expect(store['ts360_trusted_device']).toBeUndefined()
      // Idempotent, and survives storage that throws (private mode).
      expect(() => purgeLegacyDeviceTrust()).not.toThrow()
      globalThis.localStorage = { removeItem() { throw new Error('denied') } }
      expect(() => purgeLegacyDeviceTrust()).not.toThrow()
    } finally { globalThis.localStorage = orig }
  })
})

describe('H5 — the SEC-04 comment no longer asserts a fix that does not exist', () => {
  const app = () => readFileSync(join(__dirname, 'App.jsx'), 'utf8')

  it('the false claim is never made as a present-tense assertion', () => {
    // The corrected comment quotes the old wording in order to explain it, so a bare
    // absence check would fail for the right reason. Assert the FRAMING instead: every
    // occurrence must sit inside the "used to assert" retraction.
    const a = app()
    const claim = 'localStorage no longer stores the raw token'
    let from = 0, occurrences = 0
    for (;;) {
      const at = a.indexOf(claim, from)
      if (at === -1) break
      occurrences++
      const preceding = a.slice(Math.max(0, at - 200), at)
      expect(preceding, 'the claim appears without its retraction').toMatch(/used to assert/)
      from = at + claim.length
    }
    expect(occurrences, 'expected the retraction to quote the old claim exactly once').toBe(1)
  })

  it('the comment states what is actually true, including why the token remains', () => {
    const a = app()
    expect(a).toMatch(/COMMENT CORRECTED/)
    expect(a).toMatch(/stripe\/subscribe/)
  })

  it('the token is still excluded from the data export (M1)', async () => {
    const { isExportableKey } = await import('../utils/sessionState.js')
    expect(isExportableKey('ts360_token')).toBe(false)
  })
})
