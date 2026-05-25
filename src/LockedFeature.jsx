import { useNavigate } from 'react-router-dom'

// ─── Plan Utilities ───────────────────────────────────────────────────────────
// Single source of truth for plan checking across all components.
// Plan is written to localStorage by Onboarding.jsx on login/signup (data.plan)
// and by Upgrade.jsx after a plan change. It reflects the server-verified value
// returned at login — not client-set. For additional security, App.jsx's
// RequireAuth should re-verify plan from /auth/me on session load.

export const PLANS = ['starter', 'professional', 'enterprise']

// Legacy plan name aliases — matches the planMap in Upgrade.jsx
const PLAN_ALIASES = {
  'basic':     'starter',
  'pro':       'professional',
  'expert':    'enterprise',
  'elite':     'enterprise',
  'essential': 'enterprise',
}

export function getUserPlan() {
  const raw = (localStorage.getItem('plan') || 'starter').toLowerCase()
  return PLAN_ALIASES[raw] || raw
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

// ─── LockedFeature Component ──────────────────────────────────────────────────
// Wraps any feature section with a blurred overlay + upgrade prompt.
//
// Usage:
//   <LockedFeature requiredPlan="professional" label="Risk Alert Engine">
//     <YourFeatureComponent />
//   </LockedFeature>
//
// Props:
//   requiredPlan  — 'professional' | 'enterprise'  (default: 'professional')
//   label         — Feature name shown in the overlay
//   minHeight     — Minimum height for the locked area (default: 120)
//   children      — The feature to render (shown blurred when locked)
//
// If the user's plan meets the requirement, children render normally.
// If not, a blurred preview with an upgrade CTA is shown instead.

export default function LockedFeature({ requiredPlan = 'professional', label, minHeight = 120, children }) {
  const nav = useNavigate()
  const unlocked = canAccess(requiredPlan)

  if (unlocked) return children

  const planLabel = requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)
  const N = '#0F1F3D'
  const B = '#2563EB'

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
        <span style={{ fontSize: 22 }}>🔒</span>
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
