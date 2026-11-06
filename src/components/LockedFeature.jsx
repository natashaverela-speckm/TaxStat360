import { apiGet, ApiError } from '../utils/apiClient.js'
import { readPlan, writePlan } from '../utils/sessionState.js'
import { clearInvalidSession } from '../utils/sessionAuth.js'
import { NAVY as N, BLUE as B } from '../lib/theme.js'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'

// ─── Plan Constants & Normalization ──────────────────────────────────────────
// Single source of truth for plan IDs. ALL plan-gate code must import from here.
// Never compare against raw localStorage values — always use getUserPlan() which
// normalises legacy names via PLAN_ALIASES transparently.

// SINGLE PLAN (Nov 2026): "pro" is the plan; "starter" is no subscription.
export const PLAN_IDS = {
  STARTER: 'starter',
  PRO:     'pro',
}

// Plan name aliases — maps old DB/API values to canonical PLAN_IDS. Every retired
// paid tier resolves to the one paid plan; "basic" was the pre-migration Starter value.
// Add new aliases here; never scatter alias logic across other components.
const PLAN_ALIASES = {
  'basic':        PLAN_IDS.STARTER,
  'professional': PLAN_IDS.PRO,
  'enterprise':   PLAN_IDS.PRO,
  'expert':       PLAN_IDS.PRO,
  'elite':        PLAN_IDS.PRO,
  'essential':    PLAN_IDS.PRO,
}

// normalizePlanId — converts any raw plan string (from localStorage, Lambda,
// or DynamoDB) into a canonical PLAN_IDS value. Import and use this anywhere
// a plan string is read outside of getUserPlan() — e.g. Upgrade.jsx planMap.
export function normalizePlanId(raw) {
  const lower = (raw || '').toLowerCase().trim()
  return PLAN_ALIASES[lower] || (Object.values(PLAN_IDS).includes(lower) ? lower : PLAN_IDS.STARTER)
}

export const PLANS = Object.values(PLAN_IDS)

export function getUserPlan() {
  const raw = (readPlan() || 'starter').toLowerCase()
  return PLAN_ALIASES[raw] || raw
}

// ─── Server-side plan re-validation (SEC-05) ─────────────────────────────────
// The browser cannot be trusted to report its own plan: anyone can run
// writePlan('enterprise') in dev tools. The SERVER is the
// source of truth. On every app load we ask GET /auth/me (which reads the
// httpOnly session cookie and looks up the real plan from Stripe) and stamp the
// answer back into localStorage, overwriting any tampering.
//
// FAILS SAFE on network errors, but NOT on 401: a 401 means the cached plan is
// unverified and must not be shown as entitlement.
export async function refreshPlanFromServer() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      const data = await apiGet('/auth/me', {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      })
      if (data && data.plan) {
        writePlan(normalizePlanId(data.plan))
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      clearInvalidSession()
      return PLAN_IDS.STARTER
    }
    // network error / timeout / abort / other non-ok → keep existing plan
  }
  return getUserPlan()
}

/** True when the account is on the (one) paid plan. */
export function isPro() {
  return getUserPlan() === PLAN_IDS.PRO
}

/** Kept for call sites written against the old tiers: every paid account has every feature. */
export function isEnterprise() {
  return isPro()
}

export function canAccess(requiredPlan) {
  const rank = { starter: 0, pro: 1 }
  return (rank[getUserPlan()] ?? 0) >= (rank[normalizePlanId(requiredPlan)] ?? 0)
}

// ─── LockedFeature Component ──────────────────────────────────────────────────
// Wraps any feature section with a blurred overlay + upgrade prompt.
//
// Usage:
//   <LockedFeature requiredPlan="professional" label="Risk Alert Engine">
//     <YourFeatureComponent />
//   </LockedFeature>
//
// Props:
//   requiredPlan  — 'pro' (legacy 'professional' / 'enterprise' resolve to it)
//   label         — Feature name shown in the overlay
//   minHeight     — Minimum height for the locked area (default: 120)
//   children      — The feature to render (shown blurred when locked)
//
// If the user's plan meets the requirement, children render normally.
// If not, a blurred preview with an upgrade CTA is shown instead.

export default function LockedFeature({ requiredPlan = 'pro', label, minHeight = 120, children }) {
  const nav = useNavigate()
  const unlocked = canAccess(requiredPlan)

  if (unlocked) return children

  const planLabel = 'Toolkit Pro'

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', minHeight }}>
      {/* Blurred ghost of the feature */}
      <div style={{
        filter: 'blur(5px)', pointerEvents: 'none', userSelect: 'none',
        opacity: 0.35, minHeight,
      }}>
        {children}
      </div>

      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(248,250,252,0.88)',
        borderRadius: 10,
        border: '1.5px dashed #cbd5e1',
        padding: 24, textAlign: 'center',
        gap: 6,
      }}>
        <Icon name="lock" size={26} color={N} />
        <p style={{ fontWeight: 700, fontSize: 15, color: N, margin: 0 }}>
          {label || `${planLabel} Feature`}
        </p>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          Available on the <strong>{planLabel}</strong> plan
        </p>
        <button
          onClick={() => nav('/upgrade')}
          style={{
            marginTop: 10,
            background: B, color: '#fff', border: 'none',
            borderRadius: 7, padding: '9px 22px',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Upgrade to {planLabel} →
        </button>
      </div>
    </div>
  )
}
