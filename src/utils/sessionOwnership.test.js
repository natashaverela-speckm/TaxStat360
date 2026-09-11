// @vitest-environment jsdom
// src/utils/sessionOwnership.test.js
//
// AUDIT H3 (second launch audit, Sep 2026) — SIGN-OUT LEFT TAXPAYER DATA IN THE TAB.
//
// signOut() cleared localStorage only. clearAllSessionState() existed, was imported
// into SignOut.jsx, and had exactly one caller — wipeAccountLocalData(), which runs on
// account DELETION. So sessionStorage survived a normal sign-out intact, carrying
// ts360_f1040 (the whole personal 1040 profile — W-2 income and withholding, capital
// gains, dividends, SALT, ISO bargain element, dependents, estimated payments), the
// Step-1 entity P&L, and ts360_biz_ein.
//
// The leak was not passive: CalculateTaxInner rehydrates from those keys on mount with
// no account scoping, unlike readStep1Draft() which correctly refuses to surface another
// user's draft. User A signs out on a shared machine, user B signs in in the same tab,
// and B's Tax Tracker opens pre-populated with A's financials. If B saves, A's figures
// are written into B's server-side record. A family computer is enough.
//
// Two lines of defence, both pinned here:
//   1. signOut() now calls clearAllSessionState().
//   2. claimSessionForUser() wipes a foreign working set at sign-in — for the paths a
//      sign-out never runs on (a browser-restored tab, a closed laptop) and for any
//      future regression that drops (1) again.

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  claimSessionForUser, readSessionOwner, clearAllSessionState,
} from './sessionState.js'

const TAXPAYER_KEYS = {
  ts360_f1040: JSON.stringify({ w2Income: 180000, capitalGains: 42000, saltPaid: 10000 }),
  ts360_step1_entities: JSON.stringify([{ name: 'A Corp', pnl: { grossRevenue: 900000 } }]),
  ts360_entities_raw: JSON.stringify([{ name: 'A Corp' }]),
  ts360_biz_ein: '12-3456789',
  ts360_biz_name: 'A Corp',
  ts360_k1: '250000',
}
const seedUserA = () => {
  for (const [k, v] of Object.entries(TAXPAYER_KEYS)) sessionStorage.setItem(k, v)
}
const present = () => Object.keys(TAXPAYER_KEYS).filter(k => sessionStorage.getItem(k) !== null)

beforeEach(() => { sessionStorage.clear() })

describe('H3 — a different account cannot inherit the tab working set', () => {
  it("wipes user A's tax data when user B signs in", () => {
    claimSessionForUser('a@example.com')
    seedUserA()
    expect(present()).toHaveLength(6)

    const wiped = claimSessionForUser('b@example.com')

    expect(wiped).toBe(true)
    expect(present()).toEqual([])
    expect(readSessionOwner()).toBe('b@example.com')
  })

  it('specifically clears the personal 1040 profile and the EIN', () => {
    claimSessionForUser('a@example.com')
    seedUserA()
    claimSessionForUser('b@example.com')
    expect(sessionStorage.getItem('ts360_f1040')).toBeNull()
    expect(sessionStorage.getItem('ts360_biz_ein')).toBeNull()
  })

  it('keeps the SAME user\'s work in place across a re-login', () => {
    // Signing back in as yourself must not destroy in-progress entry.
    claimSessionForUser('a@example.com')
    seedUserA()
    const wiped = claimSessionForUser('a@example.com')
    expect(wiped).toBe(false)
    expect(present()).toHaveLength(6)
  })

  it('is case- and whitespace-insensitive on the email', () => {
    claimSessionForUser('a@example.com')
    seedUserA()
    expect(claimSessionForUser('  A@Example.COM ')).toBe(false)
    expect(present()).toHaveLength(6)
  })

  // FRESH-EYES F-2 (11 Sep 2026): this test used to assert the OPPOSITE — that an
  // unstamped tab holding six taxpayer keys survives a sign-in. It pinned the bug.
  // ts360_session_owner was introduced by H3 itself, so "no stamp" described every
  // browser that used the app before H3 shipped; treating those as safe meant the
  // guard skipped exactly the population that had the data.
  it('F-2: an unowned tab that HOLDS taxpayer data is treated as foreign and wiped', () => {
    seedUserA()                                   // no owner stamp — pre-H3 build
    expect(claimSessionForUser('b@example.com')).toBe(true)
    expect(present()).toEqual([])
    expect(readSessionOwner()).toBe('b@example.com')
  })

  it('F-2: a genuinely fresh tab (no taxpayer keys) is claimed without a wipe', () => {
    sessionStorage.setItem('ts360_first_run', '1')  // a non-taxpayer key may exist
    expect(claimSessionForUser('a@example.com')).toBe(false)
    expect(readSessionOwner()).toBe('a@example.com')
    expect(sessionStorage.getItem('ts360_first_run')).toBe('1')
  })

  it('F-2: the guard names every taxpayer key that sessionState writes', () => {
    // If a new taxpayer-data writer is added to sessionState.js, it must be listed
    // in TAXPAYER_SESSION_KEYS or an unstamped tab carrying only that key slips past.
    const src = readFileSync(new URL('./sessionState.js', import.meta.url), 'utf8')
    const listStart = src.indexOf('const TAXPAYER_SESSION_KEYS = [')
    const listBody  = src.slice(listStart, src.indexOf(']', listStart))
    for (const k of ['ts360_f1040', 'ts360_entities', 'ts360_entities_raw',
                     'ts360_step1_entities', 'ts360_k1', 'ts360_biz_ein', 'ts360_biz_name']) {
      expect(listBody).toContain(`'${k}'`)
    }
  })

  it('ignores an empty email rather than clearing the owner', () => {
    claimSessionForUser('a@example.com')
    expect(claimSessionForUser('')).toBe(false)
    expect(claimSessionForUser(null)).toBe(false)
    expect(readSessionOwner()).toBe('a@example.com')
  })

  it('clearAllSessionState removes the owner stamp too', () => {
    claimSessionForUser('a@example.com')
    seedUserA()
    clearAllSessionState()
    expect(readSessionOwner()).toBeNull()
    expect(present()).toEqual([])
  })
})

describe('H3 — the wiring stays wired', () => {
  const stripComments = (code) =>
    code.replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
  const src = (rel) => stripComments(readFileSync(new URL(rel, import.meta.url), 'utf8'))

  it('signOut() clears sessionStorage, not just localStorage', () => {
    const s = src('./SignOut.jsx')
    const fn = s.slice(s.indexOf('export function signOut'), s.indexOf('export function wipeAccountLocalData'))
    expect(fn).toMatch(/clearAllSessionState\(\)/)
    expect(fn).toMatch(/AUTH_KEYS\.forEach/)
  })

  it('F-1: signOut() ends the SERVER session — the httpOnly cookie is the credential', () => {
    // After H5 removed the bearer token the cookie is the only credential, and
    // JavaScript cannot delete an httpOnly cookie. Only POST /auth/logout can.
    const s = src('./SignOut.jsx')
    const fn = s.slice(s.indexOf('export function signOut'), s.indexOf('export function wipeAccountLocalData'))
    expect(fn).toMatch(/endServerSession\(\)/)
    expect(s).toMatch(/apiFetch\(\s*['"]\/auth\/logout['"]\s*,\s*\{[^}]*method:\s*['"]POST['"]/)
    // The server call must be issued BEFORE the local wipe, while the cookie is still attached.
    expect(fn.indexOf('endServerSession()')).toBeLessThan(fn.indexOf('AUTH_KEYS.forEach'))
  })

  it('both entry points claim the session for the account', () => {
    // Sign-in AND signup: a brand-new account must not inherit a stranger's data either.
    const o = src('../components/Onboarding.jsx')
    const finishLogin = o.slice(o.indexOf('async function finishLogin'), o.indexOf('async function submit', o.indexOf('async function finishLogin')))
    expect(finishLogin).toMatch(/claimSessionForUser\(actualEmail\)/)
    expect(o).toMatch(/claimSessionForUser\(email\)/)
  })

  it('the claim runs BEFORE the new account email is written', () => {
    // Order matters: claimSessionForUser compares against the stamped owner, and
    // writeEmail is what the rest of the app keys off. Claim first, then adopt.
    const o = src('../components/Onboarding.jsx')
    const fn = o.slice(o.indexOf('async function finishLogin'), o.indexOf('async function submit', o.indexOf('async function finishLogin')))
    expect(fn.indexOf('claimSessionForUser')).toBeLessThan(fn.indexOf('writeEmail'))
  })
})
