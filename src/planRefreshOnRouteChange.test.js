// src/planRefreshOnRouteChange.test.js
//
// L-8 (fresh-pass audit, Aug 2026) — the client-side plan value must be
// re-synced from the server on every in-app route change, not just on the
// handful of touchpoints that existed before (RequireAuth mount, Onboarding
// completion, LockedFeature). App.jsx isn't unit-tested in isolation
// elsewhere in this repo (no router/harness for it), so this pins the fix at
// the source level: a dedicated effect in RequireAuth keyed on
// location.pathname that calls /auth/me and writes the plan, kept separate
// from the auth-gate's own serverAuth state so navigation never blanks the
// page while it refreshes.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('plan-tier gate refreshes on every route change (re-audit, L-8)', () => {
  const app = read('./components/App.jsx')

  it('RequireAuth has a background /auth/me refresh keyed on location.pathname', () => {
    const effectBlock = app.match(
      /\/\/ L-8 FIX[\s\S]*?useEffect\(\(\) => \{[\s\S]*?\}, \[location\.pathname, sessionOk, serverAuth\]\)/
    )
    expect(effectBlock).toBeTruthy()
  })

  it('the route-change refresh does not touch serverAuth (would blank the page on navigation)', () => {
    const match = app.match(
      /\/\/ L-8 FIX[\s\S]*?useEffect\(\(\) => \{[\s\S]*?\}, \[location\.pathname, sessionOk, serverAuth\]\)/
    )
    expect(match).toBeTruthy()
    expect(match[0]).not.toMatch(/setServerAuth/)
  })
})
