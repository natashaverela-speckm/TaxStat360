// @vitest-environment jsdom
// src/components/Upgrade.stripe-mount.test.jsx
//
// AUDIT M7 (second launch audit, Sep 2026) — "UPGRADE NOW" COULD BE AN ENABLED NO-OP.
//
// The Stripe script was appended with NO load listener; mountCard() then ran on a bare
// setTimeout(200) and returned SILENTLY if window.Stripe or the mount node was not there
// yet, and handleUpgrade() bailed silently for the same reason. On a slow connection —
// or any time a plan was picked within ~250ms of first paint — the card never mounted,
// the button stayed ENABLED, and clicking it did nothing. No error, no spinner, no
// console message, nothing a server log would show. It is the path every entity-cap
// gate funnels into.
//
// These tests drive the real component with a fake Stripe SDK whose arrival is under
// the test's control, so the race is exercised rather than described.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../utils/sessionState.js', () => ({
  readEmail: () => 'user@example.com',
  readPlan: () => 'starter',
  readToken: () => 'tok',
  writePlan: () => {},
  removeSubscriptionIncomplete: () => {},
}))
// Upgrade.jsx imports normalizePlanId/refreshPlanFromServer from './LockedFeature'
// (no extension) — the mock must match that specifier exactly.
vi.mock('./LockedFeature', () => ({
  isPro: () => false,
  normalizePlanId: (p) => p || 'starter',
  refreshPlanFromServer: () => Promise.resolve('starter'),
}))
vi.mock('../utils/SignOut', () => ({ signOut: () => {} }))
vi.mock('../utils/apiClient.js', () => ({
  apiFetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  apiGet: () => Promise.resolve({}),
  apiPost: () => Promise.resolve({}),
  ApiError: class ApiError extends Error {},
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

import Upgrade from './Upgrade.jsx'

// A fake Stripe SDK. `mount` records the node it was given.
function makeStripe() {
  const mounted = []
  const card = { mount: (node) => mounted.push(node), on: () => {}, unmount: () => {} }
  const sdk = () => ({ elements: () => ({ create: () => card }) })
  return { sdk, card, mounted }
}

const renderUpgrade = () =>
  render(<MemoryRouter><Upgrade /></MemoryRouter>)

const upgradeButton = () =>
  screen.queryByRole('button', { name: /Upgrade Now|Loading secure card input/i })

beforeEach(() => {
  delete window.Stripe
  document.querySelectorAll('script[data-ts360-stripe="1"]').forEach((s) => s.remove())
  vi.stubEnv('VITE_STRIPE_PK', 'pk_test_fake')
})
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('M7 — the button cannot be clickable while the card is unmounted', () => {
  it('THE ORIGINAL BUG: picking a plan before Stripe loads leaves a disabled button, not a dead one', async () => {
    // window.Stripe is absent, exactly as on a slow connection.
    renderUpgrade()
    fireEvent.click(await screen.findByRole('button', { name: /Upgrade to Professional/i }))

    // Whatever the user does now, they must never see an enabled control that does
    // nothing. Either the card block is not shown yet, or its button is disabled.
    const btn = upgradeButton()
    if (btn) expect(btn).toBeDisabled()
  })

  it('the script is appended with a load listener, and reused rather than duplicated', async () => {
    renderUpgrade()
    await waitFor(() => {
      expect(document.querySelectorAll('script[data-ts360-stripe="1"]').length).toBe(1)
    })
    // Onboarding.jsx tags its script the same way; a second render must not add another.
    renderUpgrade()
    await waitFor(() => {
      expect(document.querySelectorAll('script[data-ts360-stripe="1"]').length).toBe(1)
    })
  })

  it('once Stripe loads, the element mounts into the real node and the button enables', async () => {
    const { sdk, mounted } = makeStripe()
    renderUpgrade()
    const script = await waitFor(() => {
      const s = document.querySelector('script[data-ts360-stripe="1"]')
      expect(s).toBeTruthy()
      return s
    })
    // The SDK arrives AFTER first paint — the case the old code could not survive.
    window.Stripe = sdk
    script.dispatchEvent(new Event('load'))

    fireEvent.click(await screen.findByRole('button', { name: /Upgrade to Professional/i }))

    await waitFor(() => {
      const btn = upgradeButton()
      expect(btn).toBeTruthy()
      expect(btn).not.toBeDisabled()
    })
    // It mounted into the actual DOM node, not a stale '#card-element' lookup.
    expect(mounted.length).toBe(1)
    expect(mounted[0]).toBeInstanceOf(HTMLElement)
    expect(mounted[0].id).toBe('card-element')
  })
})

describe('M7 — the three failure modes are distinguishable', () => {
  it('a missing publishable key says payment is unavailable', async () => {
    vi.stubEnv('VITE_STRIPE_PK', '')
    renderUpgrade()
    // Must be visible WITHOUT first selecting a plan — the error element used to live
    // inside the card block, which only exists after a plan is chosen.
    expect(await screen.findByText(/Payment form is temporarily unavailable/i)).toBeTruthy()
  })

  it('a script that fails to load says so explicitly', async () => {
    renderUpgrade()
    const script = await waitFor(() => {
      const s = document.querySelector('script[data-ts360-stripe="1"]')
      expect(s).toBeTruthy()
      return s
    })
    script.dispatchEvent(new Event('error'))
    expect(await screen.findByText(/Could not load card input/i)).toBeTruthy()
  })
})

describe('M7 — the source no longer contains the mechanisms that caused it', () => {
  const src = () => {
    // eslint-disable-next-line no-undef
    const { readFileSync } = require('node:fs')
    // eslint-disable-next-line no-undef
    const { join } = require('node:path')
    // eslint-disable-next-line no-undef
    return readFileSync(join(__dirname, 'Upgrade.jsx'), 'utf8')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('no timeout-based mountCard race', () => {
    expect(src()).not.toMatch(/setTimeout\(mountCard/)
    expect(src()).not.toMatch(/const mountCard =/)
  })

  it('handleUpgrade no longer returns silently on an unmounted card', () => {
    const s = src()
    expect(s).not.toMatch(/if \(!selectedPlan \|\| !stripeRef\.current \|\| !cardRef\.current\) return/)
    expect(s).toMatch(/setErr\('Card input is still loading/)
  })

  it('the button gates on readiness state', () => {
    expect(src()).toMatch(/disabled=\{loading \|\| !stripeReady\}/)
  })
})
