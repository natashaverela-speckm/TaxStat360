// @vitest-environment jsdom
// src/utils/step1Draft.test.js
//
// AUDIT #6 — device-local Step-1 draft. Step-1 entries live in sessionStorage, which
// the browser wipes on tab/window close and which is per-tab. The draft mirrors them to
// localStorage so work survives a tab close / browser restart / cross-tab re-login. It is
// scoped to the owning email so a draft can never leak one user's figures to the next
// person on a shared browser, and is cleared on explicit sign-out and successful save.

import { describe, it, expect, beforeEach } from 'vitest'
import { writeStep1Draft, readStep1Draft, clearStep1Draft } from './sessionState.js'

const ents = [{ type: 'sole-prop', own: '100', pnl: { netProfit: '1500' } }]

beforeEach(() => { localStorage.clear() })

describe('Step-1 device-local draft (audit #6)', () => {
  it('round-trips entities + taxYear for the owning email', () => {
    localStorage.setItem('ts360_email', 'a@example.com')
    writeStep1Draft(ents, 2026)
    const d = readStep1Draft()
    expect(d.entities).toEqual(ents)
    expect(d.taxYear).toBe(2026)
  })

  it('does NOT surface another account\'s draft (cross-user guard)', () => {
    localStorage.setItem('ts360_email', 'a@example.com')
    writeStep1Draft(ents, 2026)
    // A different user signs in on the same browser:
    localStorage.setItem('ts360_email', 'b@example.com')
    expect(readStep1Draft()).toBeNull()
    // ...and the original owner still gets theirs back:
    localStorage.setItem('ts360_email', 'a@example.com')
    expect(readStep1Draft().entities).toEqual(ents)
  })

  it('writing an empty entity list removes the draft', () => {
    localStorage.setItem('ts360_email', 'a@example.com')
    writeStep1Draft(ents, 2026)
    writeStep1Draft([], 2026)
    expect(readStep1Draft()).toBeNull()
  })

  it('clearStep1Draft removes it (explicit sign-out / successful save)', () => {
    localStorage.setItem('ts360_email', 'a@example.com')
    writeStep1Draft(ents, 2026)
    clearStep1Draft()
    expect(readStep1Draft()).toBeNull()
  })

  it('survives when ts360_email is unset (falls back to a stable default key)', () => {
    writeStep1Draft(ents, 2025)
    expect(readStep1Draft().entities).toEqual(ents)
  })
})
