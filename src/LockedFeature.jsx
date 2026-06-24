import { apiGet } from './utils/apiClient.js'
import { NAVY as N, BLUE as B } from './theme.js'
import { useNavigate } from 'react-router-dom'

// âââ Plan Constants & Normalization ââââââââââââââââââââââââââââââââââââââââââ
// Single source of truth for plan IDs. ALL plan-gate code must import from here.
// Never compare against raw localStorage values â always use getUserPlan() which
// normalises legacy names via PLAN_ALIASES transparently.

export const PLAN_IDS = {
  STARTER:      'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE:   'enterprise',
}

// Legacy plan name aliases â maps old DB/Lambda values to canonical PLAN_IDS.
// "basic" is the pre-migration DB value for Starter accounts (C-01).
// Add new aliases here; never scatter alias logic across other components.
const PLAN_ALIASES = {
  'basic':     PLAN_IDS.STARTER,
  'pro':       PLAN_IDS.PROFESSIONAL,
  'expert':    PLAN_IDS.ENTERPRISE,
  'elite':     PLAN_IDS.ENTERPRISE,
  'essential': PLAN_IDS.ENTERPRISE,
}

// normalizePlanId â converts any raw plan string (from localStorage, Lambda,
// or DynamoDB) into a canonical PLAN_IDS value. Import and use this anywhere
// a plan string is read outside of getUserPlan() â e.g. Upgrade.jsx planMap.
export function normalizePlanId(raw) {
  const lower = (raw || '').toLowerCase().trim()
  return PLAN_ALIASES[lower] || (Object.values(PLAN_IDS).includes(lower) ? lower : PLAN_IDS.STARTER)
}

export const PLANS = Object.values(PLAN_IDS)

export function getUserPlan() {
  const raw = (readPlan() || 'starter').toLowerCase()
  return PLAN_ALIASES[raw] || raw
}

// âââ Server-side plan re-validation (SEC-05) âââââââââââââââââââââââââââââââââ
// The browser cannot be trusted to report its own plan: anyone can run
// writePlan('enterprise') in dev tools. The SERVER is the
// source of truth. On every app load we ask GET /auth/me (which reads the
// httpOnly session cookie and looks up the real plan from Stripe) and stamp the
// answer back into localStorage, overwriting any tampering.
//
// FAILS SAFE: if the endpoint is missing (404, before backend ships), errors,
// or times out, we leave the existing plan untouched â this never locks a real
// user out, so it is safe to deploy BEFORE /auth/me exists. It begins enforcing
// automatically the moment the endpoint returns a real plan.
export async function refreshPlanFromServer() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      // Non-ok (401/404/5xx) throws ApiError â caught below â keep current plan, same as
      // the prior explicit `if (!res.ok) return getUserPlan()`. credentials:'include' sends
      // the httpOnly session cookie (the API is a different origin from the app).
      const data = await apiGet('/auth/me', {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
        credentials: 'include',
      })
      if (data && data.plan) {
        localStorage.setItem('ts360_plan', normalizePlanId(data.plan))
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (_e) {
    // network error / timeout / abort / non-ok â fail safe, keep existing plan
  }
  return getUserPlan()
}

export function isPro() {
  const p = getUserPlan()
  return p === 'professional' || p === 'enterprise'
}

export function isEnterprise() {
  return getUserPlan() === 'enterprise'
}

export function canAccess(requiredPlan) {
  const rank = { starter: 0, professional: 1, enterprise: 2 }
  return (rank[getUserPlan()] ?? 0) >= (rank[requiredPlan] ?? 0)
}

// âââ LockedFeature Component ââââââââââââââââââââââââââââââââââââââââââââââââââ
// Wraps any feature section with a blurred overlay + upgrade prompt.
//
// Usage:
//   <LockedFeature requiredPlan="professional" label="Risk Alert Engine">
//     <YourFeatureComponent />
//   </LockedFeature>
//
// Props:
//   requiredPlan  â 'professional' | 'enterprise'  (default: 'professional')
//   label         â Feature name shown in the overlay
//   minHeight     â Minimum height for the locked area (default: 120)
//   children      â The feature to render (shown blurred when locked)
//
// If the user's plan meets the requirement, children render normally.
// If not, a blurred preview with an upgrade CTA is shown instead.

export default function LockedFeature({ requiredPlan = 'professional', label, minHeight = 120, children }) {
  const nav = useNavigate()
  const unlocked = canAccess(requiredPlan)

  if (unlocked) return children

  const planLabel = requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)

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
        <span style={{ fontSize: 22 }}>ð</span>
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
          Upgrade to {planLabel} â
        </button>
      </div>
    </div>
  )
}
