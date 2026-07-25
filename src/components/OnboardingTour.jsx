import { useState } from 'react'
import { NAVY as N, BLUE as B, SLATE as SL } from '../lib/theme.js'

export const ONBOARDING_STEPS = [
  { logo: true, title: 'Welcome to TaxStat360', body: 'Federal tax planning for S-Corp owners, real estate investors, and business operators. Enter your data and see your estimated liability update live.' },
  { emoji: '🏢', badge: 'Step 1 of 2 — Business Entities', title: 'Add Your Business Entities', body: 'Connect QuickBooks, Xero, Wave, or FreshBooks — or enter revenue and expenses manually. K-1 income flows automatically to your personal return.' },
  { emoji: '📋', badge: 'Step 2 of 2 — Personal Return', title: 'Complete Your Personal Return', body: 'Enter filing status, W-2 income, rental real estate, and deductions. Your federal tax liability, §199A QBI deduction, and quarterly estimated payments update live.' },
  { emoji: '🤖', title: 'AI Risk & Tax Analysis', body: 'Save your calculation to unlock your AI risk scan — officer compensation audit flags, penalty risk, QBI limits, and tax-saving strategies tailored to your situation.' },
  { emoji: '✅', title: "You're all set!", body: "Your Dashboard stores all your saved records. Load any record to update it, or start a new calculation anytime. Let's build your first one.", isFinal: true },
]

export default function OnboardingTour({ onComplete }) {
  const [step, setStep] = useState(0)
  const s = ONBOARDING_STEPS[step]
  const isLast = step === ONBOARDING_STEPS.length - 1

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '36px 32px', maxWidth: 480, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{ height: 8, borderRadius: 4, width: i === step ? 28 : 8, background: i === step ? B : '#E2E8F0', transition: 'all 0.3s' }} />
          ))}
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          {s.logo ? (
            <svg width="60" height="60" viewBox="0 0 34 34" style={{ display: 'block', margin: '0 auto' }}>
              <rect width="34" height="34" rx="8" fill={N}/>
              <rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/>
              <rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/>
              <rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/>
              <rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/>
            </svg>
          ) : (
            <span style={{ fontSize: 52, lineHeight: 1 }}>{s.emoji}</span>
          )}
        </div>
        {s.badge && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{ background: B, color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700 }}>{s.badge}</span>
          </div>
        )}
        <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 12px', textAlign: 'center' }}>{s.title}</h2>
        <p style={{ fontSize: 14, color: SL, margin: '0 0 24px', textAlign: 'center', lineHeight: 1.75 }}>{s.body}</p>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#64748B', marginBottom: 20, fontWeight: 600 }}>{step + 1} of {ONBOARDING_STEPS.length}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={onComplete} style={{ background: 'none', border: 'none', fontSize: 13, color: '#64748B', cursor: 'pointer', fontWeight: 600, padding: '8px 0' }}>Skip tour</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>← Back</button>
            )}
            {isLast ? (
              <button type="button" onClick={onComplete} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: B, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Start Calculating →</button>
            ) : (
              <button type="button" onClick={() => setStep(step + 1)} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: N, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Next →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
