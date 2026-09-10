/**
 * Regression: PASS5-F2 gated the card DOM behind step === 2, but Stripe still
 * mounted on first paint — cardRef was null, stripeReady never flipped, and
 * signup spun on "Loading secure card input…".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'Onboarding.jsx'),
  'utf8',
)

describe('Onboarding signup Stripe mount (hotfix)', () => {
  it('CHAR: card Element mounts when step === 2 (not only on first paint)', () => {
    expect(src).toMatch(/step\s*!==\s*2/)
    expect(src).toMatch(/cardElRef\.current\.mount\(\s*cardRef\.current\s*\)/)
    expect(src).toMatch(/\[step\s*,\s*stripeLoaded\]/)
  })

  it('CHAR: does not mount card inside the empty-deps Stripe script onload alone', () => {
    // Old bug pattern: create + mount in one [] effect before Step 2 DOM exists.
    expect(src).not.toMatch(
      /setTimeout\(\(\)\s*=>\s*\{\s*if\s*\(\s*cardRef\.current\s*\)\s*\{\s*card\.mount/,
    )
  })
})
