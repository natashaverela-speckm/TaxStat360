// src/components/CalculateTaxInner.removeEntity.test.jsx
//
// AUDIT H7 (second launch audit, Sep 2026) — REMOVING THE LAST ENTITY DID NOTHING.
//
// removeEntity was a bare setEntities(...filter...) with no storage write, relying on a
// persist effect further down that is guarded on `entities.length > 0`. Removing the LAST
// entity was the one case that guard never caught.
//
// The guard itself is correct and has to stay: `entities` starts as [] and hydrates from
// storage in a mount effect, so an unguarded persist would fire with [] on first render
// and wipe stored entities BEFORE hydration — a much worse bug. The fix therefore belongs
// in removeEntity, at the point where the removal is actually known.
//
// What the user saw: confirm a modal reading "This will remove the entity and all its
// data from Step 1. This cannot be undone", the card disappears, the screen says "Add an
// entity to continue" — and Step 2 still taxes the K-1, AI Analysis still analyses it,
// and returning to the Tax Tracker brings it back. The device-local draft held it too, so
// it survived a browser restart.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = () =>
  readFileSync(join(__dirname, 'CalculateTaxInner.jsx'), 'utf8')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')

const removeEntityFn = () => {
  const s = src()
  const start = s.indexOf('const removeEntity = useCallback')
  expect(start).toBeGreaterThan(-1)
  return s.slice(start, s.indexOf('const handleIntegrationDisconnect', start))
}

describe('H7 — removal is persisted at the point of removal', () => {
  it('writes the canonical Step-1 state with the post-removal array', () => {
    const fn = removeEntityFn()
    expect(fn).toMatch(/const next = entities\.filter\(\(_, i\) => i !== idx\)/)
    expect(fn).toMatch(/persistCanonicalStep1\(next\)/)
  })

  it('mirrors the removal into the device-local draft', () => {
    // Without this the entity returns after a browser restart even though session
    // storage is correct — the draft is a separate localStorage copy.
    expect(removeEntityFn()).toMatch(/writeStep1Draft\(next, taxYear\)/)
  })

  it('does not call persistStep1(), which closes over the stale array', () => {
    // persistStep1 captures the PREVIOUS `entities` value — the very array we are
    // removing from — so reusing it here would re-persist the entity being deleted.
    expect(removeEntityFn()).not.toMatch(/persistStep1\(\)/)
  })

  it('declares the dependencies it now closes over', () => {
    expect(removeEntityFn()).toMatch(/\}, \[entities, taxYear, persistCanonicalStep1\]\)/)
  })
})

describe('H7 — the guard that made this necessary is still in place', () => {
  it('the persist effect still refuses to run on an empty array', () => {
    // Load-bearing: entities starts [] and hydrates in a mount effect. If someone
    // "simplifies" this guard away to fix H7 the other direction, first render wipes
    // the user's stored entities before hydration.
    expect(src()).toMatch(/if \(Array\.isArray\(entities\) && entities\.length > 0\) persistStep1\(\)/)
  })

  it('hydration still reads from storage on mount', () => {
    expect(src()).toMatch(/const existingStep1 = readStep1Entities\(\)/)
  })
})
