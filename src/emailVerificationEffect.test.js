// src/emailVerificationEffect.test.js
//
// AUDIT H8 (second launch audit, Sep 2026) — THE VERIFICATION BANNER NEVER RENDERED.
//
// App.jsx's verification effect reads `serverAuth` on its first line but did not list it
// as a dependency:
//
//     useEffect(() => {
//       if (!sessionOk || serverAuth !== 'ok') return
//       ...fetchVerificationStatus(email)...
//     }, [sessionOk])                       // <- serverAuth missing
//
// serverAuth starts at 'pending' and becomes 'ok' only once /auth/me resolves, while
// sessionOk is a stable `true` for a signed-in user. So the effect ran exactly once — on
// mount, while serverAuth was still 'pending' — took the early return, and never ran
// again. fetchVerificationStatus was never called for anyone, verifyState kept its
// initial { email: '', verified: true }, and EmailVerificationBanner bailed at its own
// `if (!email) return null`.
//
// Net effect: after signup the user saw the one-time "check your inbox" copy and then no
// verification prompt anywhere in the app, ever. The banner's "Resend" and "Update it"
// actions were unreachable, so anyone who typo'd their email at signup had no in-app way
// to fix it.
//
// This is a source assertion rather than a render test because the defect lives in a
// dependency array — the thing a render test is least likely to catch, since the
// component renders perfectly happily while doing nothing.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./components/App.jsx', import.meta.url), 'utf8')

describe('H8 — the verification effect re-runs once /auth/me resolves', () => {
  const effect = () => {
    const at = src.indexOf('fetchVerificationStatus(email)')
    expect(at).toBeGreaterThan(-1)
    // From the enclosing useEffect through its dependency array.
    const start = src.lastIndexOf('useEffect(', at)
    const end = src.indexOf('}, [', at)
    return src.slice(start, src.indexOf('\n', end))
  }

  it('lists serverAuth in the dependency array', () => {
    expect(effect()).toMatch(/\}, \[sessionOk, serverAuth\]\)/)
  })

  it('still guards on serverAuth being ok', () => {
    // The guard is correct; it was the deps that were wrong. If someone "fixes" this
    // by deleting the guard instead, the call fires before the session is confirmed.
    expect(effect()).toMatch(/if \(!sessionOk \|\| serverAuth !== 'ok'\) return/)
  })

  it('the sibling plan-refresh effect still lists it too', () => {
    // That one was always correct — it guards on serverAuth AND depends on it — which
    // is what made the missing dep next door read as an oversight rather than intent.
    expect(src).toMatch(/\}, \[location\.pathname, sessionOk, serverAuth\]\)/)
  })

  it('the banner it feeds is still mounted', () => {
    expect(src).toMatch(/<EmailVerificationBanner/)
    expect(src).toMatch(/setVerifyState\(\{ email: s\.email \|\| email, verified: !!s\.verified \}\)/)
  })
})
