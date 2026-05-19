// Dashboard.jsx — TaxStat360
// F-06: Personal 1040 tab removed. Users complete their personal return in
//       Step 2 (TaxReturn.jsx) via the Calculator flow. Dashboard is now
//       focused on record management only. activeView state eliminated.
// F-07: Delete now requires explicit confirmation via a named modal dialog.
//       Replaces the prior two-click "Sure?" / pendingDeleteIdx pattern.
// F-08: One-time onboarding tour (5 steps) on first login per account.
//       Stored in localStorage as ts360_onboarding_v1.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, calcQBI, getStdDed, getMarginalRate, calcFederalTax } from './taxCalc'
import { writePersonalContext, writeTaxYear, writeStep1State, clearStep1State } from './utils/sessionState.js'
import { parseMoney } from './utils/parseMoney.js'
import { signOut } from './utils/signOut'

// ── Inline color constants (match rest of codebase) ──
const N  = '#0D1B3E'
const B  = '#2563EB'
const SL = '#475569'
const G  = '#059669'
const R  = '#DC2626'
const O  = '#D97706'

// ── Domain constants (defined inline to avoid import coupling) ──
const PASSTHROUGH_ENTITY_TYPES = [
  'S Corporation',
  'Partnership / MMLLC — Active',
  'Partnership / MMLLC — Passive',
  'Sole Proprietor / Single-Member LLC',
]
const C_CORP_TAX_RATE = 0.21   // IRC §11 post-TCJA (P.L. 115-97)
// SCORP_REASONABLE_COMP: 40% practitioner guideline per Rev. Rul. 74-44 /
// Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012)
const SCORP_REASONABLE_COMP_RATIO_THRESHOLD = 0.40

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = n => '$' + Math.abs(parseFloat(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const pct  = n => (parseFloat(n) || 0).toFixed(1) + '%'

const normalizeEntityType = (t) => {
  if (!t) return ''
  const s = String(t).trim()
  if (/^s.?corp/i.test(s))            return 'S Corporation'
  if (/^c.?corp/i.test(s))            return 'C Corporation'
  if (/sole|single.?member/i.test(s)) return 'Sole Proprietor / Single-Member LLC'
  if (/partner.*active/i.test(s))     return 'Partnership / MMLLC — Active'
  if (/partner.*passive/i.test(s))    return 'Partnership / MMLLC — Passive'
  if (/partner|mmllc|multi/i.test(s)) return 'Partnership / MMLLC — Active'
  return s
}

function calcDashboard(biz, f1040) {
  const rev    = parseFloat(biz.grossRevenue)      || 0
  const cogs   = parseFloat(biz.cogs)              || 0
  const gross  = rev - cogs
  const opExp  = parseFloat(biz.operatingExpenses) || 0
  const sal    = parseFloat(biz.officerSalary)     || 0
  const dep    = parseFloat(biz.depreciation)      || 0
  const adv    = parseFloat(biz.advertising)       || 0
  const other  = parseFloat(biz.otherDeductions)   || 0
  const totalExp = opExp + sal + dep + adv + other
  const netBiz   = gross - totalExp
  const own      = (parseFloat(biz.ownershipPct) || 100) / 100
  const k1       = Math.round(netBiz * own)

  const fs       = f1040.filingStatus || 'single'
  const year     = parseInt(biz.year) || 2025
  const w2       = parseFloat(f1040.w2Income)          || 0
  const otherInc = parseFloat(f1040.otherIncome)       || 0
  const deps     = parseFloat(f1040.dependents)        || 0
  const estPay   = parseFloat(f1040.estimatedPayments) || 0
  const isCCorp    = biz.entityType === 'C Corporation'
  const isSC       = biz.entityType === 'S Corporation'
  const isPassthru = PASSTHROUGH_ENTITY_TYPES.includes(biz.entityType)

  const baseInput = {
    taxYear: year, status: fs, dependents: deps,
    k1Total: 0, rentalNet: 0, stGain: 0, ltGain: 0,
    intInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0,
    selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0,
    selfEmpRetirement: 0, nolCarryforward: 0, priorYearQBILoss: 0,
    saltAmount: 0, hasISO: false, isoBargainElement: 0,
    isREP: false, unrecap1250: 0, collectiblesGain: 0,
    w2Withheld: 0, estPaid: estPay, ytdFactor: 1,
    useItemized: false, itemizedAmt: 0, priorPassiveLossCarryforward: 0,
  }

  if (isCCorp) {
    const corpTax = Math.round(Math.max(0, netBiz) * C_CORP_TAX_RATE)
    const dividends = parseFloat(biz.ccorpDividends || 0)
    const r = calcTaxReturn({ ...baseInput, entities: [], w2: w2 + sal, divInc: dividends, iraIncome: otherInc })
    return {
      rev, cogs, gross, opExp, sal, dep, adv, other, totalExp, netBiz, k1, own,
      corpTax, divTax: r.prefTax, dividends,
      combinedTax: corpTax + r.fedTax,
      agi: r.agi, qbi: 0, seTax: 0, seDed: 0,
      taxableInc: r.taxableAfterQBI, incomeTax: r.fedTax, ctc: r.childCredit,
      totalTax: r.totalTax, taxOwed: Math.max(0, r.totalTax - estPay),
      refund: Math.max(0, estPay - r.totalTax),
      effRate: r.agi > 0 ? (r.totalTax / r.agi * 100).toFixed(1) : '0.0',
      quarterly: r.quarterlyRecommended,
      recSal: Math.round(Math.max(0, k1) * SCORP_REASONABLE_COMP_RATIO_THRESHOLD),
      w2, otherInc, estPay, isPassthru, isSC, isCCorp: true,
      niit: r.niit ?? { applies: false, amount: 0 },
      reasonableCompAlert: { triggered: false, ratio: 100, message: '' },
    }
  }

  const entities = isPassthru ? [{ type: biz.entityType, k1, own: 100 }] : []
  const r = calcTaxReturn({ ...baseInput, entities, w2, k1Total: k1, divInc: 0, iraIncome: otherInc })

  const reasonableCompAlert = (() => {
    if (!isSC) return { triggered: false, ratio: 100, message: '' }
    const totalComp = sal + Math.max(0, k1)
    if (totalComp < 20000) return { triggered: false, ratio: 100, message: '' }
    const ratio = totalComp > 0 ? sal / totalComp : 1
    const triggered = ratio < SCORP_REASONABLE_COMP_RATIO_THRESHOLD
    // L-02: Store sal and distributions explicitly so the JSX can render
    // the formula Salary ÷ (Salary + Distributions) with real numbers.
    return {
      triggered,
      ratio: Math.round(ratio * 100),
      sal: Math.round(sal),
      distributions: Math.round(Math.max(0, k1)),
      message: `Officer salary is ${Math.round(ratio * 100)}% of total S-Corp compensation. Tax practitioners commonly recommend a salary-to-total-compensation ratio of 35–45%, based on case law including Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012). The IRS applies a facts-and-circumstances test — there is no published safe harbor percentage.`,
    }
  })()

  return {
    rev, cogs, gross, opExp, sal, dep, adv, other, totalExp, netBiz, k1, own,
    agi: r.agi, qbi: r.qbi, seTax: r.seTax, seDed: r.halfSE,
    taxableInc: r.taxableAfterQBI, incomeTax: r.fedTax, ctc: r.childCredit,
    totalTax: r.totalTax, corpTax: 0, divTax: 0, combinedTax: r.totalTax, dividends: 0,
    taxOwed: Math.max(0, r.totalTax - estPay),
    refund:  Math.max(0, estPay - r.totalTax),
    effRate: r.agi > 0 ? (r.totalTax / r.agi * 100).toFixed(1) : '0.0',
    quarterly: r.quarterlyRecommended,
    recSal: isSC ? Math.round(Math.max(0, k1) * SCORP_REASONABLE_COMP_RATIO_THRESHOLD) : 0,
    w2, otherInc, estPay, isPassthru, isSC, isCCorp: false,
    niit: r.niit ?? { applies: false, amount: 0 },
    // L-02 fix: merge sal and distributions into the alert regardless of which source wins.
    // r.reasonableCompAlert from calcTaxReturn has triggered/ratio/message but no sal/distributions,
    // so the JSX formula block would read undefined and display $0 for both.
    reasonableCompAlert: (() => {
      const alertData = r.reasonableCompAlert ?? reasonableCompAlert
      return {
        ...alertData,
        sal: Math.round(sal),
        distributions: Math.round(Math.max(0, k1)),
      }
    })(),
  }
}

function buildRecs(biz, calc) {
  const recs = []
  const { k1, recSal, isSC, isCCorp, quarterly, qbi, effRate, corpTax, netBiz } = calc
  const officerSal = parseFloat(biz.officerSalary) || 0
  const grossRev   = parseFloat(biz.grossRevenue)  || 0
  const dep        = parseFloat(biz.depreciation)  || 0
  const adv        = parseFloat(biz.advertising)   || 0

  if (isCCorp && corpTax > 0)
    recs.push({ type: 'danger', title: 'C-Corp Double Taxation', msg: `Your corporation owes ${fmt(corpTax)} in federal corporate tax (21% on ${fmt(netBiz)} net profit). Profits distributed as dividends are taxed again on your personal return. Consider an S-Corp election to eliminate entity-level tax.` })
  if (isSC && officerSal === 0 && k1 > 20000)
    recs.push({ type: 'danger', title: 'No Officer Compensation', msg: `S-Corp owners must pay themselves a reasonable salary. The IRS considers this a primary audit trigger. Recommended minimum: ${fmt(recSal)}/yr.` })
  if (isSC && officerSal > 0 && officerSal < recSal && k1 > 20000)
    recs.push({ type: 'warning', title: 'Officer Compensation May Be Too Low', msg: `Your officer salary of ${fmt(officerSal)} is below the recommended minimum of ${fmt(recSal)}. Consider increasing to reduce audit risk.` })
  if (quarterly > 500)
    recs.push({ type: 'warning', title: 'Quarterly Estimated Payments Required', msg: `Pay approximately ${fmt(quarterly)} per quarter. Due: Apr 15, Jun 15, Sep 15, Jan 15.` })
  if (qbi > 0)
    recs.push({ type: 'success', title: `QBI Deduction Applied — ${fmt(qbi)} Saved`, msg: `You qualify for the 20% §199A deduction, reducing your taxable income by ${fmt(qbi)}.` })
  if (dep === 0 && grossRev > 50000)
    recs.push({ type: 'info', title: 'Review Depreciation Deductions', msg: 'No depreciation recorded. Equipment, vehicles, and home office may be deductible under Section 179.' })
  if (parseFloat(effRate) > 28)
    recs.push({ type: 'warning', title: `High Effective Tax Rate (${pct(effRate)})`, msg: 'Consider maximizing retirement contributions: SEP-IRA (up to $70,000) or Solo 401(k) for 2025.' })
  if (recs.length === 0)
    recs.push({ type: 'success', title: 'Your Tax Structure Looks Healthy', msg: 'No significant issues detected. Keep monitoring quarterly and update as financials change.' })
  return recs
}

const LOGO = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <svg width="30" height="30" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="8" fill={N}/>
      <rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/>
      <rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/>
      <rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/>
      <rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/>
    </svg>
    <span style={{ fontWeight: 800, fontSize: 18, color: N, borderBottom: '2px solid ' + B, paddingBottom: '1px' }}>
      TaxStat<span style={{ color: B }}>360</span>
    </span>
  </div>
)


// ── F-08: One-time onboarding tour ────────────────────────────────────────────
// Triggered on first Dashboard mount. Completed/skipped state stored in
// localStorage as ts360_onboarding_v1. To re-show: clear that key.
const ONBOARDING_KEY = 'ts360_onboarding_v1'

const ONBOARDING_STEPS = [
  {
    logo: true,
    title: 'Welcome to TaxStat360',
    body: 'Federal tax planning for S-Corp owners, real estate investors, and business operators. Enter your data and see your estimated liability update live.',
  },
  {
    emoji: '🏢',
    badge: 'Step 1 of 2 — Business Entities',
    title: 'Add Your Business Entities',
    body: 'Connect QuickBooks, Xero, Wave, or FreshBooks — or enter revenue and expenses manually. K-1 income flows automatically to your personal return.',
  },
  {
    emoji: '📋',
    badge: 'Step 2 of 2 — Personal Return',
    title: 'Complete Your Personal Return',
    body: 'Enter filing status, W-2 income, rental real estate, and deductions. Your federal tax liability, §199A QBI deduction, and quarterly estimated payments update live.',
  },
  {
    emoji: '🤖',
    title: 'AI Risk & Tax Analysis',
    body: 'Save your calculation to unlock your AI risk scan — officer salary audit flags, penalty risk, QBI limits, and tax-saving strategies tailored to your situation.',
  },
  {
    emoji: '✅',
    title: "You're all set!",
    body: "Your Dashboard stores all your saved records. Load any record to update it, or start a new calculation anytime. Let's build your first one.",
    isFinal: true,
  },
]

function OnboardingTour({ onComplete }) {
  const [step, setStep] = useState(0)
  const s = ONBOARDING_STEPS[step]
  const isLast = step === ONBOARDING_STEPS.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(13,27,62,0.75)',
      zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20,
        padding: '36px 32px',
        maxWidth: 480, width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{
              height: 8, borderRadius: 4,
              width: i === step ? 28 : 8,
              background: i === step ? B : '#E2E8F0',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* Icon */}
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

        {/* Step badge */}
        {s.badge && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{ background: B, color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700 }}>
              {s.badge}
            </span>
          </div>
        )}

        {/* Content */}
        <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 12px', textAlign: 'center' }}>
          {s.title}
        </h2>
        <p style={{ fontSize: 14, color: SL, margin: '0 0 24px', textAlign: 'center', lineHeight: 1.75 }}>
          {s.body}
        </p>

        {/* Step counter */}
        <div style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginBottom: 20, fontWeight: 600 }}>
          {step + 1} of {ONBOARDING_STEPS.length}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={onComplete}
            style={{ background: 'none', border: 'none', fontSize: 13, color: '#94A3B8', cursor: 'pointer', fontWeight: 600, padding: '8px 0' }}
          >
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}
              >
                ← Back
              </button>
            )}
            {isLast ? (
              <button
                onClick={onComplete}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: B, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Start Calculating →
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: N, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


// ── F-07: Delete confirmation modal ───────────────────────────────────────────
// Replaces the prior two-click pendingDeleteIdx pattern. Shows the record name
// so users know exactly what they're deleting before committing.
function DeleteConfirmModal({ rec, onConfirm, onCancel }) {
  const displayName = rec?.name || rec?.savedAt || 'this record'
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          padding: '28px 28px',
          maxWidth: 440, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, color: N, marginBottom: 10 }}>
          Delete Record?
        </div>
        <div style={{ fontSize: 14, color: SL, marginBottom: 24, lineHeight: 1.65 }}>
          Are you sure you want to delete{' '}
          <strong style={{ color: N }}>"{displayName}"</strong>?
          {' '}This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: R, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Delete Record
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Main Dashboard Component ──────────────────────────────────────────────────
export default function Dashboard() {
  const nav = useNavigate()

  const [showDisclaimer, setShowDisclaimer] = useState(() => !localStorage.getItem('ts360_disclaimer_seen'))
  const dismissDisclaimer = () => { localStorage.setItem('ts360_disclaimer_seen', '1'); setShowDisclaimer(false) }

  // F-08: Onboarding shown once per account
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDING_KEY))
  const completeOnboarding = () => { localStorage.setItem(ONBOARDING_KEY, '1'); setShowOnboarding(false) }

  // F-07: Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { rec, idx } | null

  // Business data — populated from most recent saved record on mount
  // Still needed for S-Corp reasonable comp alert (calcDashboard / safeCalc)
  const [biz, setBiz] = useState({
    entityType: 'S Corporation', year: 2025, ownershipPct: '100',
    grossRevenue: '', cogs: '', operatingExpenses: '', officerSalary: '',
    depreciation: '', advertising: '', otherDeductions: '', ccorpDividends: '',
  })
  const [f1040, setF1040] = useState({
    filingStatus: 'single', w2Income: '', otherIncome: '', estimatedPayments: '',
    dependents: '', useStandardDed: true, itemizedDed: '',
  })

  const [records, setRecords] = useState([])
  const [loadedRecord, setLoadedRecord] = useState(null)
  const [savedRecordId, setSavedRecordId] = useState(null)
  // UX-04: Which record is currently loaded into the Calculator
  const [activeRecordId, setActiveRecordId] = useState(() =>
    sessionStorage.getItem('ts360_active_record_id') || null
  )
  const [connectedApp, setConnectedApp] = useState(null)
  const [xeroLoading, setXeroLoading] = useState(false)
  const [dismissedCompAlert, setDismissedCompAlert] = useState(false)

  const userName = localStorage.getItem('userName') || ''

  useEffect(() => {
    // Consolidate records from all per-user keys
    const email = localStorage.getItem('ts360_email') || 'default'
    const key   = 'ts360_records_' + email
    const allFound = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('ts360_records')) {
        try {
          const r = JSON.parse(localStorage.getItem(k) || '[]')
          r.forEach(rec => { if (!allFound.find(x => x.id === rec.id)) allFound.push(rec) })
        } catch (e) {}
      }
    }
    const recs = allFound.sort((a, b) => (b.id || 0) - (a.id || 0))
    if (email !== 'default' && recs.length > 0) {
      localStorage.setItem(key, JSON.stringify(recs))
      localStorage.setItem('ts360_records', JSON.stringify(recs))
    }
    setRecords(recs)

    // Populate biz/f1040 from most recent record (for S-Corp alert)
    if (recs.length > 0) {
      const r0 = recs[0]
      if (r0.biz) setBiz(r0.biz)
      const saved1040 = r0.biz ? (r0.f1040 || {}) : {
        filingStatus: r0.filingStatus || 'single',
        w2Income: r0.w2Income || '',
        estPaid: r0.estPaid || '',
        dependents: r0.dependents || '0',
      }
      setF1040({
        filingStatus: saved1040.filingStatus || 'single',
        w2Income: saved1040.w2Income || '',
        otherIncome: saved1040.otherIncome || '',
        estimatedPayments: saved1040.estPaid || '',
        dependents: saved1040.dependents || '',
        useStandardDed: true,
        itemizedDed: '',
      })
      setSavedRecordId(recs[0].id)
    }

    // Handle goto_form session flag (from accounting software connect flow)
    if (sessionStorage.getItem('ts360_goto_form') === '1') {
      sessionStorage.removeItem('ts360_goto_form')
      nav('/calculate-tax')
    }

    // Xero token in URL
    const params = new URLSearchParams(window.location.search)
    const xeroToken = params.get('xero_token')
    if (xeroToken) {
      setConnectedApp('Xero')
      setXeroLoading(true)
      const apiBase = localStorage.getItem('ts360_api_base') || ''
      fetch(apiBase + '/auth/xero/data?token=' + xeroToken)
        .then(r => r.json())
        .then(data => {
          if (data.grossRevenue) {
            setBiz(p => ({
              ...p,
              grossRevenue: String(Math.round(parseFloat(data.grossRevenue) || 0)),
              otherDeductions: String(Math.round(parseFloat(data.otherDeductions) || 0)),
            }))
          }
          setXeroLoading(false)
          window.history.replaceState({}, '', '/dashboard')
        })
        .catch(() => { setXeroLoading(false); window.history.replaceState({}, '', '/dashboard') })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // S-Corp alert derived from most-recent record's biz data
  const hasNumbers = parseFloat(biz.grossRevenue) > 0
  const calc = hasNumbers ? calcDashboard(biz, f1040) : null
  const safeCalc = calc || {
    k1: 0, w2: 0, agi: 0, qbi: 0, seTax: 0, seDed: 0,
    taxableInc: 0, incomeTax: 0, ctc: 0, totalTax: 0,
    effRate: '0.0', quarterly: 0, taxOwed: 0, refund: 0,
    isPassthru: false, isSC: false, isCCorp: false, recSal: 0,
    corpTax: 0, divTax: 0, combinedTax: 0,
    niit: { applies: false, amount: 0 },
    reasonableCompAlert: { triggered: false, ratio: 100, message: '' },
  }

  const loadRecord = (rec) => {
    setLoadedRecord(rec)
    setSavedRecordId(rec.id)
    if (rec.biz) {
      const pnl = rec.biz.pnl || {}
      setBiz(prev => ({
        ...prev,
        entityType: normalizeEntityType(rec.biz.type || rec.biz.entityType) || prev.entityType,
        ownershipPct: rec.biz.own || rec.biz.ownershipPct || prev.ownershipPct,
        year: rec.taxYear || rec.biz.year || prev.year,
        grossRevenue: pnl.grossRevenue != null ? String(pnl.grossRevenue) : rec.biz.grossRevenue != null ? String(rec.biz.grossRevenue) : '',
        operatingExpenses: pnl.totalExpenses != null ? String(pnl.totalExpenses) : rec.biz.operatingExpenses != null ? String(rec.biz.operatingExpenses) : '',
        officerSalary: pnl.officerSalary != null ? String(pnl.officerSalary) : rec.biz.officerSalary != null ? String(rec.biz.officerSalary) : '',
      }))
    }
    const saved1040 = rec.biz ? (rec.f1040 || {}) : {
      filingStatus: rec.filingStatus || 'single', w2Income: rec.w2Income || '',
      estPaid: rec.estPaid || '', dependents: rec.dependents || '0',
    }
    const f1040Restored = {
      filingStatus: saved1040.filingStatus || 'single',
      w2Income: saved1040.w2Income || '',
      otherIncome: saved1040.otherIncome || '',
      estimatedPayments: saved1040.estPaid || '',
      dependents: saved1040.dependents || '',
      useStandardDed: true, itemizedDed: '',
    }
    setF1040(f1040Restored)

    // Restore session state so Step 1 & Step 2 have correct data
    const sourceEntities = Array.isArray(rec.entities) && rec.entities.length > 0
      ? rec.entities
      : rec.biz ? [rec.biz] : []

    const entitiesToWrite = sourceEntities.filter(e => e && e.pnl).map(e => {
      const pnl = e.pnl || {}
      const ownPct = parseInt(e.own) || 100
      const k1 = Math.round((pnl.netProfit || 0) * (ownPct / 100))
        - (parseMoney(e.box11_12) || 0)
        - (parseMoney(e.box12_13) || 0)
      return {
        name: e.name, type: normalizeEntityType(e.type), own: e.own,
        pnl: { ...pnl },
        netProfit: pnl.netProfit || 0, k1,
        box17K: parseMoney(e.box17K) || 0,
        box11_12: parseMoney(e.box11_12) || 0,
        box12_13: parseMoney(e.box12_13) || 0,
        box17V_wages: parseMoney(e.box17V_wages) || 0,
        box17V_ubia: parseMoney(e.box17V_ubia) || 0,
        box17V_sstb: !!e.box17V_sstb,
      }
    })

    const flatEntitiesToWrite = entitiesToWrite.length > 0
      ? entitiesToWrite
      : rec.biz
        ? (() => {
            const b = rec.biz
            const rev = parseFloat(b.grossRevenue) || 0
            const opEx = parseFloat(b.operatingExpenses) || 0
            const sal = parseFloat(b.officerSalary) || 0
            const dep = parseFloat(b.depreciation) || 0
            const adv = parseFloat(b.advertising) || 0
            const oth = parseFloat(b.otherDeductions) || 0
            const netProfit = rev - opEx - sal - dep - adv - oth
            const ownPct = parseInt(b.ownershipPct || b.own) || 100
            return [{
              name: b.name || normalizeEntityType(b.entityType) || 'Business',
              type: normalizeEntityType(b.entityType),
              own: ownPct,
              pnl: { grossRevenue: rev, totalExpenses: opEx, officerSalary: sal, netProfit },
              netProfit,
              k1: parseFloat(rec.k1Income) || Math.round(netProfit * (ownPct / 100)),
              box17K: 0, box11_12: 0, box12_13: 0,
              box17V_wages: 0, box17V_ubia: 0, box17V_sstb: false,
            }]
          })()
        : []

    const k1TotalRestored = flatEntitiesToWrite.reduce((s, e) => s + (e.k1 || 0), 0)

    writeStep1State({
      entities: flatEntitiesToWrite,
      entitiesRaw: sourceEntities,
      k1Total: k1TotalRestored,
      isCoopPatron: false,
    })
    writePersonalContext({
      filingStatus: f1040Restored.filingStatus,
      w2Income: parseFloat(f1040Restored.w2Income) || 0,
      dependents: parseInt(f1040Restored.dependents) || 0,
      estPaid: parseFloat(f1040Restored.estimatedPayments) || 0,
      useItemized: false,
      itemizedAmt: 0,
      isREP: !!(saved1040.isREP || rec.f1040?.isREP),
      isActiveParticipant: saved1040.isActiveParticipant !== false,
      priorPassiveLossCarryforward: parseFloat(saved1040.priorPassiveLossCarryforward) || 0,
      selfEmpRetirement: parseFloat(saved1040.selfEmpRetirement) || 0,
      nolCarryforward: parseFloat(saved1040.nolCarryforward) || 0,
      priorYearTax: parseFloat(saved1040.priorYearTax) || 0,
      priorYearAGI: parseFloat(saved1040.priorYearAGI) || 0,
      w2Withheld: parseFloat(saved1040.w2Withheld) || 0,
    })
    writeTaxYear(rec.taxYear || rec.biz?.year || 2025)
    // UX-04: Store the active record context so Calculator and Tax Return can
    // display which record the user is currently editing across all views.
    const activeName = rec.name || rec.savedAt || 'Saved Record'
    sessionStorage.setItem('ts360_active_record_name', activeName)
    sessionStorage.setItem('ts360_active_record_id', String(rec.id || ''))
    setActiveRecordId(String(rec.id || ''))
    nav('/calculate-tax')
  }

  // F-07: Show confirmation modal before deleting
  const handleDeleteClick = (rec, idx) => setDeleteConfirm({ rec, idx })

  const confirmDelete = () => {
    if (!deleteConfirm) return
    const { idx } = deleteConfirm
    setDeleteConfirm(null)
    const email = localStorage.getItem('ts360_email') || 'default'
    const key = 'ts360_records_' + email
    const updated = records.filter((_, j) => j !== idx)
    setRecords(updated)
    localStorage.setItem(key, JSON.stringify(updated))
    localStorage.setItem('ts360_records', JSON.stringify(updated))
    if (loadedRecord?.id === records[idx]?.id) setLoadedRecord(null)
  }

  const startNewCalc = () => {
    clearStep1State()
    setSavedRecordId(null)
    setLoadedRecord(null)
    nav('/calculate-tax')
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: '#F8FAFC' }}>

      {/* F-08: Onboarding tour — renders over everything on first login */}
      {showOnboarding && <OnboardingTour onComplete={completeOnboarding} />}

      {/* F-07: Delete confirmation modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          rec={deleteConfirm.rec}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* ── Navigation ── */}
      <nav style={{
        background: '#fff', borderBottom: '1px solid #E2E8F0',
        padding: '0 28px', height: 58,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LOGO />
          <div style={{ background: '#F1F5F9', color: SL, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
            Dashboard
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {userName && (
            <span style={{ fontSize: 13, color: SL }}>Hi, <strong style={{ color: N }}>{userName.split(' ')[0]}</strong></span>
          )}
          <button onClick={() => nav('/calculate-tax')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>Calculator</button>
          <button onClick={() => nav('/ai-analysis')}  style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>AI Analysis</button>
          <button onClick={() => signOut(nav)}         style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>Sign Out</button>
          <button onClick={() => nav('/settings')}     style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>⚙ Settings</button>
        </div>
      </nav>

      {/* Disclaimer banner */}
      {showDisclaimer && (
        <div style={{ background: '#FFFBEB', borderBottom: '2px solid #F59E0B', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
            <strong>⚠ Estimation Tool Only:</strong> TaxStat360 calculates tax estimates for planning purposes only. This is not professional tax advice. Consult a licensed CPA before filing.{' '}
            <a href="/terms" style={{ color: '#92400E', fontWeight: 700, textDecoration: 'underline' }}>View full disclaimer →</a>
          </div>
          <button onClick={dismissDisclaimer} style={{ flexShrink: 0, background: '#F59E0B', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
            Got it ✓
          </button>
        </div>
      )}

      {/* Xero loading banner */}
      {xeroLoading && (
        <div style={{ background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', padding: '12px 28px', fontSize: 13, fontWeight: 600, color: '#1D4ED8', textAlign: 'center' }}>
          Importing your Xero financials… please wait
        </div>
      )}

      {/* ── Main content ── */}
      {/* F-06: No tab bar — Dashboard now shows My Records only.
          The Personal 1040 form has been removed. Users complete their
          personal return in Step 2 via the Calculator (TaxReturn.jsx). */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 20px' }}>

        {/* L-06: Only show S-Corp Alert when revenue data exists but salary = $0.
            When no revenue data is entered at all, show an onboarding prompt instead.
            This prevents the alert from appearing on brand-new empty accounts. */}
        {!hasNumbers && !dismissedCompAlert && records.length > 0 && (
          <div style={{
            background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12,
            padding: '20px 24px', marginBottom: 24,
            display: 'flex', alignItems: 'flex-start', gap: 16,
          }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>📊</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1E40AF', marginBottom: 6 }}>
                Ready to see your tax analysis?
              </div>
              <div style={{ fontSize: 13, color: '#3B82F6', lineHeight: 1.6, marginBottom: 12 }}>
                Your saved records don't have complete revenue data on file. Load a record and complete Step 1 with your business income and expenses to see S-Corp alerts, reasonable compensation analysis, and quarterly estimates here.
              </div>
              <button
                onClick={startNewCalc}
                style={{ padding: '8px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Go to Calculator →
              </button>
            </div>
          </div>
        )}

        {/* S-Corp Reasonable Compensation Alert — only renders when hasNumbers and salary is below threshold */}
        {hasNumbers && safeCalc.reasonableCompAlert?.triggered && !dismissedCompAlert && (
          <div style={{
            background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: 12,
            padding: '16px 20px', marginBottom: 24,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#92400E', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#FCD34D', color: '#92400E', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>S-CORP ALERT</span>
                Reasonable Compensation Below Practitioner Guideline
              </div>

              {/* L-02: Show the formula explicitly so users understand what the percentage means */}
              <div style={{ fontSize: 13, color: '#92400E', marginBottom: 10, fontWeight: 600 }}>
                Formula: Salary ÷ (Salary + Distributions)
              </div>
              <div style={{
                background: 'rgba(146,64,14,0.06)', borderRadius: 8, padding: '10px 14px',
                marginBottom: 10, fontFamily: 'monospace, monospace', fontSize: 14,
              }}>
                <span style={{ color: '#78350F' }}>
                  {fmt(safeCalc.reasonableCompAlert.sal ?? 0)}
                  {' ÷ ('}
                  {fmt(safeCalc.reasonableCompAlert.sal ?? 0)}
                  {' + '}
                  {fmt(safeCalc.reasonableCompAlert.distributions ?? 0)}
                  {') = '}
                </span>
                <strong style={{ color: '#DC2626', fontSize: 15 }}>
                  {safeCalc.reasonableCompAlert.ratio ?? 0}%
                </strong>
                <span style={{ color: '#92400E', fontSize: 12 }}> (threshold: ≥40%)</span>
              </div>

              <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.6, marginBottom: 8 }}>
                {safeCalc.reasonableCompAlert.message}
              </div>
              <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5, background: 'rgba(146,64,14,0.08)', borderRadius: 6, padding: '8px 12px' }}>
                <strong>Recommended action:</strong> Consider increasing your officer W-2 salary to bring it within the 35–45% practitioner-recommended range. Discuss the appropriate amount with your CPA — the correct salary depends on your specific role, hours, industry, and comparable pay.{' '}
                <a href="https://www.irs.gov/businesses/small-businesses-self-employed/s-corporation-compensation-and-medical-insurance-issues" target="_blank" rel="noopener noreferrer" style={{ color: '#92400E', textDecoration: 'underline', fontWeight: 600 }}>IRS guidance on S-Corp compensation →</a>
              </div>
            </div>
            <button
              onClick={() => setDismissedCompAlert(true)}
              style={{ flexShrink: 0, background: 'none', border: '1px solid #D97706', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#92400E', cursor: 'pointer' }}
            >Dismiss</button>
          </div>
        )}

        {/* Records header */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>My Saved Records</h2>
            <p style={{ color: SL, fontSize: 13, margin: '4px 0 0' }}>Click any record to load it into the Tax Calculator.</p>
          </div>
          <button
            onClick={startNewCalc}
            style={{ padding: '10px 20px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            + New Calculation
          </button>
        </div>

        {/* Empty state */}
        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <h3 style={{ color: N, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No saved records yet</h3>
            <p style={{ color: SL, fontSize: 14, marginBottom: 20 }}>Complete a tax calculation and hit "Save This Record" to store it here.</p>
            <button onClick={startNewCalc} style={{ padding: '10px 24px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Start New Calculation →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {records.map((rec, i) => {
              const displayRevenue = rec.biz?.pnl?.grossRevenue ?? rec.biz?.grossRevenue
              const entityType     = rec.biz?.type || rec.biz?.entityType || rec.entityType || '—'
              const taxYear        = rec.biz?.year || rec.taxYear || '—'
              const filingStatus   = (rec.f1040?.filingStatus || rec.filingStatus || '—').toUpperCase()
              const quarterly      = rec.quarterly || rec.biz?.quarterly || 0
              const w2Income       = rec.f1040?.w2Income || rec.w2Income
              const totalTax       = parseFloat(rec.totalTax) || 0

              const isActive = activeRecordId && String(rec.id) === activeRecordId

              return (
                <div key={rec.id || i} style={{
                  background: '#fff',
                  border: isActive ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  borderRadius: 14,
                  padding: '20px 24px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  boxShadow: isActive ? '0 0 0 3px rgba(37,99,235,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: N, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}><path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="#475569" strokeWidth="1.3" fill="none"/><path d="M10 2v3h3" stroke="#475569" strokeWidth="1.3" strokeLinejoin="round"/><line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#475569" strokeWidth="1.3"/><line x1="4.5" y1="10.5" x2="9" y2="10.5" stroke="#475569" strokeWidth="1.3"/></svg>
                      {rec.name || (rec.savedAt && rec.savedAt !== 'Current session (unsaved)' ? new Date(rec.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Saved Record')}
                      {/* UX-04: Active record indicator */}
                      {isActive && (
                        <span style={{ fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.03em' }}>
                          ACTIVE IN CALCULATOR
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: SL }}>Entity: <strong style={{ color: N }}>{entityType}</strong></span>
                      <span style={{ fontSize: 13, color: SL }}>Year: <strong style={{ color: N }}>{taxYear}</strong></span>
                      <span style={{ fontSize: 13, color: SL }}>Revenue: <strong style={{ color: displayRevenue && parseFloat(displayRevenue) > 0 ? N : '#94A3B8' }}>
                        {displayRevenue && parseFloat(displayRevenue) > 0 ? '$' + parseFloat(displayRevenue).toLocaleString() : 'No data'}
                      </strong></span>
                      {w2Income && parseFloat(w2Income) > 0 && (
                        <span style={{ fontSize: 13, color: SL }}>W-2: <strong style={{ color: N }}>${parseFloat(w2Income).toLocaleString()}</strong></span>
                      )}
                      <span style={{ fontSize: 13, color: SL }}>Filing: <strong style={{ color: N }}>{filingStatus}</strong></span>
                      <span style={{ fontSize: 13, color: SL }}>Quarterly: <strong style={{ color: quarterly > 0 ? N : '#94A3B8' }}>
                        {quarterly > 0 ? '$' + Math.round(quarterly).toLocaleString() : 'Complete Step 2 for estimate'}
                      </strong></span>
                    </div>
                  </div>

                  {totalTax > 0 && (() => {
                    // ADD-03: Delta indicator — compare this record's tax to the next
                    // most recent record (index i+1) to show trend. Only shown on the
                    // most recent record (i === 0) so the delta is always "vs last time".
                    const prevRec = i === 0 ? records[1] : null
                    const prevTax = prevRec ? parseFloat(prevRec.totalTax) || 0 : 0
                    const delta = totalTax - prevTax
                    const showDelta = i === 0 && prevTax > 0 && Math.abs(delta) >= 100
                    return (
                      <div style={{
                        flexShrink: 0, marginLeft: 20, marginRight: 8,
                        textAlign: 'center', background: '#FEF2F2',
                        border: '1.5px solid #FECACA', borderRadius: 12,
                        padding: '10px 18px', minWidth: 120,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', letterSpacing: '0.5px', marginBottom: 3 }}>EST. TAX LIABILITY</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: R, lineHeight: 1 }}>
                          ${Math.round(totalTax).toLocaleString()}
                        </div>
                        {quarterly > 0 && (
                          <div style={{ fontSize: 10, color: '#991B1B', marginTop: 3 }}>
                            ${Math.round(quarterly).toLocaleString()}/qtr
                          </div>
                        )}
                        {showDelta && (
                          <div style={{
                            marginTop: 5, fontSize: 11, fontWeight: 700,
                            color: delta > 0 ? '#DC2626' : '#16A34A',
                          }}>
                            {delta > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta)).toLocaleString()} vs prior
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#B91C1C', marginTop: showDelta ? 2 : 5, fontStyle: 'italic' }}>
                          Federal income tax only
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 20, alignItems: 'center' }}>
                    <button
                      onClick={() => loadRecord(rec)}
                      style={{ padding: '10px 20px', background: N, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                    >
                      Load &amp; Continue →
                    </button>

                    {/* F-07: Opens DeleteConfirmModal instead of two-click "Sure?" */}
                    <button
                      onClick={() => handleDeleteClick(rec, i)}
                      title={`Delete "${rec.name || rec.savedAt || 'record'}"`}
                      style={{
                        padding: '10px 14px', background: '#fff', color: R,
                        border: '1.5px solid #FCA5A5', borderRadius: 8,
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
