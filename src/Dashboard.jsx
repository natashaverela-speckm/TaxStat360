// Dashboard.jsx — TaxStat360
// F-06: Personal 1040 tab removed. Users complete their personal return in
//       Step 2 (TaxReturn.jsx) via the Calculator flow. Dashboard is now
//       focused on record management only. activeView state eliminated.
// F-07: Delete now requires explicit confirmation via a named modal dialog.
//       Replaces the prior two-click "Sure?" / pendingDeleteIdx pattern.
// F-08: One-time onboarding tour (5 steps) on first login per account.
//       Stored in localStorage as ts360_onboarding_v1.
//
// PASS4B-03: C_CORP_TAX_RATE and SCORP_REASONABLE_COMP_RATIO_THRESHOLD were once
// local consts despite being exported from constants.js; they are now imported from
// the single source of truth. PASSTHROUGH_ENTITY_TYPES was also imported here and used
// for runtime gating — Module 1 removed that import: entity routing now uses the shared
// normalizeEntityType + regex predicates (see the import block below), which fixed the
// false-negative that dropped SE tax for sole proprietors and partnerships.
//
// PASS4B-04: "ACTIVE IN CALCULATOR" renamed to "ACTIVE IN TAX TRACKER"
// to match the app-wide rename done 3 days ago in Settings.jsx / AIAnalysis.jsx.
//
// CC-M01: Inline color constants replaced with imports from theme.js.
// CC-M02: Local fmt() / pct() replaced with imports from utils/formatMoney.js.
// F-M02:  ownPct() from utils/entityPredicates.js replaces (parseFloat(x) || 100)
//         pattern — fixes silent 0%-ownership-treated-as-100% bug.
// UX-N02: Quarterly estimate in record card now includes safe harbor context.
//
// L-03 FIX: "S-CORP ALERT" badge changed to "⚠ AUDIT RISK — S-CORP" for clarity.
// C-04 FIX: Alert card now uses red severity styling (#FEF2F2 / #FECACA / #991B1B)
//           matching the same alert in CalculateTaxInner.jsx Step 1 entity card.
//           Previously amber (#FEF3C7 / #FCD34D / #92400E) — inconsistent severity.
//
// ── AUDIT PASS 2 FIXES ────────────────────────────────────────────────────────
// F24 FIX: Saved record cards displayed only the record name — no summary numbers
//   visible without loading the full record into the Tax Tracker. A user with
//   three saved records ("2026 Q1 Check", "2026 Mid-Year", "2025 Final") could
//   not compare them or see which had the highest liability without loading each
//   one individually.
//   Fix: Each record card now always shows a summary strip containing:
//     • Est. federal tax liability (rec.totalTax)
//     • Effective rate (rec.totalTax ÷ total income, estimated from saved fields)
//     • Tax year (rec.taxYear || rec.biz.year)
//   When totalTax is 0 (record saved without completing Step 2), the strip shows
//   "Complete Step 2 for estimate" so the user knows what to do next rather than
//   seeing blank values. The strip replaces the previous conditional "EST. TAX
//   LIABILITY" badge which only appeared on the most-recent record and required
//   non-zero totalTax. calcDashboard() already computed these values — they just
//   were not rendered on the card. This fix surfaces them without loading.

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, calcQBI, getStdDed, getMarginalRate, calcFederalTax, calcCCorpCorporateLayer } from './taxCalc.js'
import { writePersonalContext, writeTaxYear, writeStep1State, clearStep1State, loadUserRecordsFromServer, deleteUserRecord, normalizeF1040, writeActiveRecord, readActiveRecordId, writePresetEntityType } from './utils/sessionState.js'
import { parseMoney } from './utils/parseMoney.js'
import { apiGet } from './utils/apiClient.js'
import { signOut } from './utils/signOut'
import BrandLogo from './BrandLogo'
import {
  SCORP_REASONABLE_COMP_RATIO_THRESHOLD,
  CURRENT_TAX_YEAR,
  FINANCIAL_LABELS,
} from './constants.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R, ORANGE as O } from './theme.js'
import { fmt, pct, effectiveRate } from './utils/formatMoney.js'
import { ownPct, normalizeEntityType, isCCorpEntity, isSCorpEntity } from './utils/entityPredicates.js'
import { isPro } from './LockedFeature'

// Module-1 fix (F1/F2): the Dashboard previously carried its OWN copy of
// normalizeEntityType and then gated on PASSTHROUGH_ENTITY_TYPES.includes(biz.entityType).
// The local normalizer emitted the engine-canonical form ("Sole Proprietor /
// Single-Member LLC", "Partnership / MMLLC — Active") while PASSTHROUGH_ENTITY_TYPES
// holds the UI-label form ("Sole Proprietor / SMLLC", "Partnership / LLC"), so the
// membership test returned false for sole proprietors and partnerships — passing an
// empty entities[] to calcTaxReturn and silently dropping their self-employment tax.
// We now import the single shared normalizeEntityType and classify with the
// vocabulary-agnostic regex predicates (isCCorpEntity / isSCorpEntity), which match
// either form. "Route to the engine" === "not a C-Corp", so isPassthru = !isCCorp.

// Exported for unit testing (see Dashboard.test.jsx). Kept in this file because it is
// tightly coupled to the Dashboard's biz/f1040 shapes; the export is consumed only by tests.
// eslint-disable-next-line react-refresh/only-export-components
export function calcDashboard(biz, f1040) {
  const rev    = parseFloat(biz.grossRevenue)      || 0
  const cogs   = parseFloat(biz.cogs)              || 0
  const gross  = rev - cogs
  const opExp  = parseFloat(biz.operatingExpenses) || 0
  const sal    = parseFloat(biz.officerSalary)     || 0
  const dep    = parseFloat(biz.depreciation)      || 0
  const adv    = parseFloat(biz.advertising)       || 0
  const other  = parseFloat(biz.otherDeductions)   || 0
  const totalExp = opExp
  const _pnlNet  = parseFloat(biz.pnl?.netProfit)
  const netBiz   = Number.isFinite(_pnlNet) ? Math.round(_pnlNet) : (gross - totalExp)
  const own      = ownPct(biz.ownershipPct) / 100
  const k1       = Math.round(netBiz * own)

  const fs       = f1040.filingStatus || 'single'
  const year     = parseInt(biz.year) || CURRENT_TAX_YEAR
  const w2       = parseFloat(f1040.w2Income)          || 0
  const otherInc = parseFloat(f1040.otherIncome)       || 0
  const deps     = parseFloat(f1040.dependents)        || 0
  const estPay   = parseFloat(f1040.estimatedPayments) || 0
  // Normalize once to the engine-canonical form, then classify with regex predicates
  // that match either the UI-label or engine form. isPassthru means "send this entity
  // through calcTaxReturn" (every supported type except a C-Corp, which has its own
  // entity-level branch below). This fixes the prior false-negative for sole props /
  // partnerships (F1) that suppressed their SE tax.
  const entityType = normalizeEntityType(biz.entityType)
  const isCCorp    = isCCorpEntity(entityType)
  const isSC       = isSCorpEntity(entityType)
  const isPassthru = !isCCorp

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
    // Align with the Tax Tracker via the shared corporate layer: the flat 21% applies to
    // corporate profit AFTER officer compensation and employer-side payroll tax, and the after-tax
    // profit is treated as fully distributed and taxed again as qualified dividends. Officer
    // salary is W-2 wages with no separate employment-tax line (1040-style, like the Tracker).
    // netBiz is profit BEFORE salary when derived from gross−opExp, but AFTER salary when it
    // comes from a synced pnl.netProfit — so reconstruct profit-before-salary either way.
    const cNetBeforeSal = Number.isFinite(_pnlNet) ? Math.round(_pnlNet) + sal : (gross - totalExp)
    const layer     = calcCCorpCorporateLayer({ netProfit: cNetBeforeSal, officerSalary: sal, taxYear: year })
    const corpTax   = layer.corpTax
    const dividends = layer.dividends
    const r = calcTaxReturn({ ...baseInput, entities: [], w2: w2 + sal, divInc: dividends, qualDiv: dividends, iraIncome: otherInc })
    const combinedTotal = r.totalTax + corpTax
    return {
      rev, cogs, gross, opExp, sal, dep, adv, other, totalExp, netBiz, k1, own,
      corpTax, divTax: r.prefTax, dividends,
      combinedTax: combinedTotal,
      agi: r.agi, qbi: 0, seTax: 0, seDed: 0,
      taxableInc: r.taxableAfterQBI, incomeTax: r.fedTax, ctc: r.childCredit,
      totalTax: combinedTotal, taxOwed: Math.max(0, combinedTotal - estPay),
      refund: Math.max(0, estPay - combinedTotal),
      effRate: effectiveRate(combinedTotal, r.agi),
      quarterly: r.quarterlyRecommended,
      recSal: Math.round(Math.max(0, k1) * SCORP_REASONABLE_COMP_RATIO_THRESHOLD),
      w2, otherInc, estPay, isPassthru, isSC, isCCorp: true,
      niit: r.niit ?? { applies: false, amount: 0 },
      reasonableCompAlert: { triggered: false, ratio: 100, message: '' },
    }
  }

  const entities = isPassthru ? [{ type: entityType, k1, own: 100, officerW2: sal }] : []
  const r = calcTaxReturn({ ...baseInput, entities, w2: w2 + sal, k1Total: k1, divInc: 0, iraIncome: otherInc })

  const reasonableCompAlert = (() => {
    if (!isSC) return { triggered: false, ratio: 100, message: '' }
    const totalComp = sal + Math.max(0, k1)
    if (totalComp < 20000) return { triggered: false, ratio: 100, message: '' }
    const ratio = totalComp > 0 ? sal / totalComp : 1
    const triggered = ratio < SCORP_REASONABLE_COMP_RATIO_THRESHOLD
    return {
      triggered,
      ratio: Math.round(ratio * 100),
      sal: Math.round(sal),
      distributions: Math.round(Math.max(0, k1)),
      message: `Officer compensation is ${Math.round(ratio * 100)}% of total S-Corp compensation. Tax practitioners commonly recommend a salary-to-total-compensation ratio of 35–45%, based on case law including Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012). The IRS applies a facts-and-circumstances test — there is no published safe harbor percentage.`,
    }
  })()

  return {
    rev, cogs, gross, opExp, sal, dep, adv, other, totalExp, netBiz, k1, own,
    agi: r.agi, qbi: r.qbi, seTax: r.seTax, seDed: r.halfSE,
    taxableInc: r.taxableAfterQBI, incomeTax: r.fedTax, ctc: r.childCredit,
    totalTax: r.totalTax, corpTax: 0, divTax: 0, combinedTax: r.totalTax, dividends: 0,
    taxOwed: Math.max(0, r.totalTax - estPay),
    refund:  Math.max(0, estPay - r.totalTax),
    effRate: effectiveRate(r.totalTax, r.agi),
    quarterly: r.quarterlyRecommended,
    recSal: isSC ? Math.round(Math.max(0, k1) * SCORP_REASONABLE_COMP_RATIO_THRESHOLD) : 0,
    w2, otherInc, estPay, isPassthru, isSC, isCCorp: false,
    niit: r.niit ?? { applies: false, amount: 0 },
    reasonableCompAlert,
  }
}

function buildRecs(biz, calc) {
  const recs = []
  const { k1, recSal, isSC, isCCorp, quarterly, qbi, effRate, corpTax, dividends } = calc
  const officerSal = parseFloat(biz.officerSalary) || 0
  const grossRev   = parseFloat(biz.grossRevenue)  || 0
  const dep        = parseFloat(biz.depreciation)  || 0

  if (isCCorp && corpTax > 0)
    recs.push({ type: 'danger', title: 'C-Corp Double Taxation', msg: `Your corporation owes ${fmt(corpTax)} in federal corporate tax (a flat 21% on profit after your officer compensation and employer payroll tax). The remaining ${fmt(dividends)} in after-tax profit, distributed as qualified dividends, is taxed again on your personal return — the classic double taxation. Consider an S-Corp election to eliminate the entity-level tax.` })
  if (isSC && officerSal === 0 && k1 > 20000)
    recs.push({ type: 'danger', title: 'No Officer Compensation', msg: `S-Corp owners must pay themselves a reasonable salary. The IRS considers this a primary audit trigger. Recommended minimum: ${fmt(recSal)}/yr.` })
  if (isSC && officerSal > 0 && officerSal < recSal && k1 > 20000)
    recs.push({ type: 'warning', title: 'Officer Compensation May Be Too Low', msg: `Your officer compensation of ${fmt(officerSal)} is below the recommended minimum of ${fmt(recSal)}. Consider increasing to reduce audit risk.` })
  if (quarterly > 500)
    recs.push({ type: 'warning', title: 'Quarterly Estimated Payments Required', msg: `Pay approximately ${fmt(quarterly)} per quarter. Due: Apr 15, Jun 15, Sep 15, Jan 15.` })
  if (qbi > 0)
    recs.push({ type: 'success', title: `QBI Deduction Applied — ${fmt(qbi)} Deduction`, msg: `You qualify for the 20% §199A deduction, reducing your taxable income by ${fmt(qbi)}.` })
  if (dep === 0 && grossRev > 50000)
    recs.push({ type: 'info', title: 'Review Depreciation Deductions', msg: 'No depreciation recorded. Equipment, vehicles, and home office may be deductible under Section 179.' })
  if (parseFloat(effRate) > 28)
    recs.push({ type: 'warning', title: `High Effective Tax Rate (${pct(effRate)})`, msg: 'Consider maximizing retirement contributions: SEP-IRA (up to $70,000) or Solo 401(k) for 2025.' })
  if (recs.length === 0)
    recs.push({ type: 'success', title: 'Your Tax Structure Looks Healthy', msg: 'No significant issues detected. Keep monitoring quarterly and update as financials change.' })
  return recs
}

const LOGO = () => <BrandLogo size={30} />

const ONBOARDING_KEY = 'ts360_onboarding_v1'

const ONBOARDING_STEPS = [
  { logo: true, title: 'Welcome to TaxStat360', body: 'Federal tax planning for S-Corp owners, real estate investors, and business operators. Enter your data and see your estimated liability update live.' },
  { emoji: '🏢', badge: 'Step 1 of 2 — Business Entities', title: 'Add Your Business Entities', body: 'Connect QuickBooks, Xero, Wave, or FreshBooks — or enter revenue and expenses manually. K-1 income flows automatically to your personal return.' },
  { emoji: '📋', badge: 'Step 2 of 2 — Personal Return', title: 'Complete Your Personal Return', body: 'Enter filing status, W-2 income, rental real estate, and deductions. Your federal tax liability, §199A QBI deduction, and quarterly estimated payments update live.' },
  { emoji: '🤖', title: 'AI Risk & Tax Analysis', body: 'Save your calculation to unlock your AI risk scan — officer compensation audit flags, penalty risk, QBI limits, and tax-saving strategies tailored to your situation.' },
  { emoji: '✅', title: "You're all set!", body: "Your Dashboard stores all your saved records. Load any record to update it, or start a new calculation anytime. Let's build your first one.", isFinal: true },
]

function OnboardingTour({ onComplete }) {
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
          <button onClick={onComplete} style={{ background: 'none', border: 'none', fontSize: 13, color: '#64748B', cursor: 'pointer', fontWeight: 600, padding: '8px 0' }}>Skip tour</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>← Back</button>
            )}
            {isLast ? (
              <button onClick={onComplete} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: B, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Start Calculating →</button>
            ) : (
              <button onClick={() => setStep(step + 1)} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: N, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Next →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmModal({ rec, onConfirm, onCancel }) {
  const displayName = rec?.name || rec?.savedAt || 'this record'
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '28px 28px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: N, marginBottom: 10 }}>Delete Record?</div>
        <div style={{ fontSize: 14, color: SL, marginBottom: 24, lineHeight: 1.65 }}>
          Are you sure you want to delete <strong style={{ color: N }}>"{displayName}"</strong>?{' '}This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: R, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete Record</button>
        </div>
      </div>
    </div>
  )
}

function FederalDisclosureBanner() {
  const key = 'ts360_fed_banner_dismissed'
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(key) !== '1' } catch { return true }
  })
  if (!visible) return null
  const dismiss = () => { try { localStorage.setItem(key, '1') } catch {} setVisible(false) }
  return (
    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>🇺🇸</span>
        <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 500 }}>
          <strong>Federal estimates only.</strong> TaxStat360 calculates federal income tax liability. State income tax is not included — add your state's effective rate separately for a complete picture.
        </span>
      </div>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: 18, lineHeight: 1, padding: 0 }} aria-label="Dismiss">×</button>
    </div>
  )
}

async function withRetry(fn, retries = 2, delay = 1000) {
  try { return await fn(); }
  catch (err) {
    if (retries === 0) throw err;
    await new Promise(r => setTimeout(r, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

class IntegrationErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#991B1B' }}>
          ⚠ This section failed to load. Reload the page to retry.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Dashboard() {
  const nav = useNavigate()

  const [showDisclaimer, setShowDisclaimer] = useState(() => !localStorage.getItem('ts360_disclaimer_seen'))
  const dismissDisclaimer = () => { localStorage.setItem('ts360_disclaimer_seen', '1'); setShowDisclaimer(false) }

  const [show2FANudge, setShow2FANudge] = useState(() =>
    localStorage.getItem('ts360_mfa_enabled') !== '1' &&
    !sessionStorage.getItem('ts360_2fa_nudge_dismissed')
  )
  const dismiss2FANudge = () => { sessionStorage.setItem('ts360_2fa_nudge_dismissed', '1'); setShow2FANudge(false) }

  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem(ONBOARDING_KEY))
  const completeOnboarding = () => { localStorage.setItem(ONBOARDING_KEY, '1'); setShowOnboarding(false) }

  const [deleteConfirm, setDeleteConfirm] = useState(null)

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
  const [activeRecordId, setActiveRecordId] = useState(() =>
    readActiveRecordId()
  )
  const [connectedApp, setConnectedApp] = useState(null)
  const [xeroLoading, setXeroLoading] = useState(false)
  const [dismissedCompAlert, setDismissedCompAlert] = useState(false)

  const userName = localStorage.getItem('ts360_userName') || ''

  useEffect(() => {
    let cancelled = false
    // M2: load from server (one-time local migration + localStorage cache fallback).
    loadUserRecordsFromServer().then(recs => {
      if (cancelled) return
      setRecords(recs)

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
    })

    if (sessionStorage.getItem('ts360_goto_form') === '1') {
      sessionStorage.removeItem('ts360_goto_form')
      nav('/calculate-tax')
    }

    const params = new URLSearchParams(window.location.search)
    const xeroToken = params.get('xero_token')
    if (xeroToken) {
      setConnectedApp('Xero')
      setXeroLoading(true)
      // Routes through apiClient → API_BASE_URL, consistent with every other auth call.
      // (Previously used a ts360_api_base localStorage override that was never set, so it
      // defaulted to same-origin — the wrong host under the split app/API origins.)
      apiGet('/auth/xero/data?token=' + encodeURIComponent(xeroToken))
        .then(data => {
          if (data && data.grossRevenue) {
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

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

    const sourceEntities = Array.isArray(rec.entities) && rec.entities.length > 0
      ? rec.entities
      : rec.biz ? [rec.biz] : []

    const entitiesToWrite = sourceEntities.filter(e => e && e.pnl).map(e => {
      const pnl = e.pnl || {}
      const ownPctVal = parseInt(e.own) || 100
      const k1 = Math.round((pnl.netProfit || 0) * (ownPctVal / 100))
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
            const ownPctVal = parseInt(b.ownershipPct || b.own) || 100
            return [{
              name: b.name || normalizeEntityType(b.entityType) || 'Business',
              type: normalizeEntityType(b.entityType),
              own: ownPctVal,
              pnl: { grossRevenue: rev, totalExpenses: opEx, officerSalary: sal, netProfit },
              netProfit,
              k1: parseFloat(rec.k1Income) || Math.round(netProfit * (ownPctVal / 100)),
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
    // C-04 FIX: clear CalculateTaxInner's Step-1 working copy so this freshly loaded record
    // is what Step 1 hydrates from (via readStep1StateRaw on mount). Without this, a stale
    // working copy from a previously loaded/edited record would shadow the new selection.
    sessionStorage.removeItem('ts360_step1_entities')
    // F-FUNC-01: hydrate the FULL saved f1040 through the canonical normalizeF1040
    // helper rather than a hand-rolled partial restore. The previous partial path
    // silently dropped investment-income fields (capitalGains / interest / dividends /
    // qualifiedDividends) from the editable Step-2 form while those values survived in
    // the saved record and on the AI Schedule Map — so a loaded return showed (and was
    // taxed on) income the form never displayed, and the collapsed Capital Gains
    // section hid it. normalizeF1040 restores exactly the fields the record holds,
    // coerced to numbers, with nothing merged in and nothing dropped — so the form,
    // the tax math, and the AI Map all agree on one set of figures.
    writePersonalContext(normalizeF1040(saved1040))
    writeTaxYear(rec.taxYear || rec.biz?.year || CURRENT_TAX_YEAR)
    const activeName = rec.name || rec.savedAt || 'Saved Record'
    writeActiveRecord(rec.id, activeName)   // F-FUNC-02: canonical loaded-record pointer
    setActiveRecordId(String(rec.id || ''))
    nav('/calculate-tax')
  }

  const handleDeleteClick = (rec, idx) => setDeleteConfirm({ rec, idx })

  const confirmDelete = () => {
    if (!deleteConfirm) return
    const { idx } = deleteConfirm
    setDeleteConfirm(null)
    const removedId = records[idx]?.id
    const wasLoaded = loadedRecord?.id === records[idx]?.id
    const updated = records.filter((_, j) => j !== idx)
    setRecords(updated)
    deleteUserRecord(removedId).then(next => setRecords(next))
    if (wasLoaded) setLoadedRecord(null)
  }

  const startNewCalc = () => {
    clearStep1State()
    setSavedRecordId(null)
    setLoadedRecord(null)
    nav('/calculate-tax')
  }

  // F-FUNC-05: a preset card means "set me up with an entity of this type." Start a
  // clean calculation, then stash the matching entity-type string so the Tax Tracker
  // seeds it via its existing entity-creation path (clearStep1State first, so the
  // hint it writes survives — clearStep1State clears any prior hint). The type
  // strings here MUST match the Tax Tracker entity picker's option values.
  const PRESET_ENTITY_TYPE = {
    'S-Corp Owner':        'S Corporation',
    'Sole Proprietor':     'Sole Proprietor / SMLLC',
    'Real Estate Investor':'Real Estate (Schedule E)',
    'Partnership / LLC':   'Partnership / LLC',
  }
  const startNewCalcWithPreset = (label) => {
    clearStep1State()
    setSavedRecordId(null)
    setLoadedRecord(null)
    const type = PRESET_ENTITY_TYPE[label]
    if (type) writePresetEntityType(type)
    nav('/calculate-tax')
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: '#F8FAFC' }}>

      {showOnboarding && <OnboardingTour onComplete={completeOnboarding} />}

      {deleteConfirm && (
        <DeleteConfirmModal
          rec={deleteConfirm.rec}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* ── Navigation ── */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 28px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, overflowX: 'auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LOGO />
          <div style={{ background: '#F1F5F9', color: SL, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>Dashboard</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {userName && (
            <span style={{ fontSize: 13, color: SL }}>Hi, <strong style={{ color: N }}>{userName.split(' ')[0]}</strong></span>
          )}
          <button onClick={() => nav('/calculate-tax')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>Tax Tracker</button>
          <button onClick={() => nav('/ai-analysis')}  style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: isPro() ? '#fff' : '#f8fafc', fontSize: 13, cursor: isPro() ? 'pointer' : 'default', color: isPro() ? SL : '#cbd5e1', fontWeight: 600 }} title={isPro() ? '' : 'Upgrade to Professional to unlock AI Analysis & Reporting'}>AI Analysis & Reporting {!isPro() && '🔒'}</button>
          <button onClick={() => signOut(nav)}         style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>Sign Out</button>
          <button onClick={() => nav('/settings')}     style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>Settings</button>
        </div>
      </nav>

      {showDisclaimer && (
        <div style={{ background: '#FFFBEB', borderBottom: '2px solid #F59E0B', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
            <strong>⚠ Estimation Tool Only:</strong> TaxStat360 calculates tax estimates for planning purposes only. This is not professional tax advice. Consult a licensed CPA before filing.{' '}
            <a href="/terms" style={{ color: '#92400E', fontWeight: 700, textDecoration: 'underline' }}>View full disclaimer →</a>
          </div>
          <button onClick={dismissDisclaimer} style={{ flexShrink: 0, background: '#F59E0B', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Got it ✓</button>
        </div>
      )}

      {show2FANudge && (
        <div style={{ background: '#EFF6FF', borderBottom: '2px solid #93C5FD', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.5 }}>
            <strong>🔐 Secure your account:</strong> Two-factor authentication (2FA) is not enabled. IRS Publication 4557 strongly recommends 2FA for tax software.{' '}
            <button onClick={() => nav('/settings')} style={{ background: 'none', border: 'none', padding: 0, color: '#1E40AF', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Enable 2FA in Settings →</button>
          </div>
          <button onClick={dismiss2FANudge} style={{ flexShrink: 0, background: 'none', border: '1px solid #93C5FD', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#1E40AF', cursor: 'pointer' }}>Remind me later</button>
        </div>
      )}

      {xeroLoading && (
        <div style={{ background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', padding: '12px 28px', fontSize: 13, fontWeight: 600, color: '#1D4ED8', textAlign: 'center' }}>
          Importing your Xero financials… please wait
        </div>
      )}

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 20px' }}>

        {!hasNumbers && !dismissedCompAlert && records.length > 0 && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>📊</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1E40AF', marginBottom: 6 }}>Ready to see your tax analysis?</div>
              <div style={{ fontSize: 13, color: '#3B82F6', lineHeight: 1.6, marginBottom: 12 }}>
                Your saved records don't have complete revenue data on file. Load a record and complete Step 1 with your business income and expenses to see S-Corp alerts, reasonable compensation analysis, and quarterly estimates here.
              </div>
              <button onClick={startNewCalc} style={{ padding: '8px 18px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Open Tax Tracker →</button>
            </div>
          </div>
        )}

        {hasNumbers && safeCalc.reasonableCompAlert?.triggered && !dismissedCompAlert && (
          <div style={{
            background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 12,
            padding: '16px 20px', marginBottom: 24,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#991B1B', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>⚠ AUDIT RISK — S-CORP</span>
                Reasonable Compensation Below Practitioner Guideline
              </div>

              <div style={{ fontSize: 13, color: '#991B1B', marginBottom: 10, fontWeight: 600 }}>
                Formula: Salary ÷ (Salary + Distributions)
              </div>
              <div style={{
                background: 'rgba(153,27,27,0.06)', borderRadius: 8, padding: '10px 14px',
                marginBottom: 10, fontFamily: 'monospace, monospace', fontSize: 14,
              }}>
                <span style={{ color: '#7F1D1D' }}>
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
                <span style={{ color: '#991B1B', fontSize: 12 }}> (threshold: ≥40%)</span>
              </div>

              <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6, marginBottom: 8 }}>
                {safeCalc.reasonableCompAlert.message}
              </div>
              <div style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.5, background: 'rgba(153,27,27,0.08)', borderRadius: 6, padding: '8px 12px' }}>
                <strong>Recommended action:</strong> Consider increasing your officer W-2 compensation to bring it within the 35–45% practitioner-recommended range. Discuss the appropriate amount with your CPA — the correct salary depends on your specific role, hours, industry, and comparable pay.{' '}
                <a href="https://www.irs.gov/businesses/small-businesses-self-employed/s-corporation-compensation-and-medical-insurance-issues" target="_blank" rel="noopener noreferrer" style={{ color: '#991B1B', textDecoration: 'underline', fontWeight: 600 }}>IRS guidance on S-Corp compensation →</a>
              </div>
            </div>
            <button
              onClick={() => setDismissedCompAlert(true)}
              style={{ flexShrink: 0, background: 'none', border: '1px solid #FECACA', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: '#991B1B', cursor: 'pointer' }}
            >Dismiss</button>
          </div>
        )}

        {/* Records header */}
        <FederalDisclosureBanner />
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>My Saved Records</h2>
            <p style={{ color: SL, fontSize: 13, margin: '4px 0 0' }}>Click any record to load it into the Tax Tracker.</p>
          </div>
          <button onClick={startNewCalc} style={{ padding: '10px 20px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ New Calculation</button>
        </div>

        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <h3 style={{ color: N, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No saved records yet</h3>
            <p style={{ color: SL, fontSize: 14, marginBottom: 20 }}>Complete a tax calculation and hit "Save This Record" to store it here.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              {[
                { label: 'S-Corp Owner',          icon: '🏢', desc: 'Salary + K-1 income' },
                { label: 'Sole Proprietor',        icon: '💼', desc: 'Schedule C self-employment' },
                { label: 'Real Estate Investor',   icon: '🏠', desc: 'Rental income + depreciation' },
                { label: 'Partnership / LLC',      icon: '🤝', desc: 'K-1 distributive share' },
              ].map(p => (
                <button key={p.label} onClick={() => startNewCalcWithPreset(p.label)} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, cursor: 'pointer', textAlign: 'left', minWidth: 140 }}>
                  <div style={{ fontSize: 20 }}>{p.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: N, marginTop: 4 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: SL, marginTop: 2 }}>{p.desc}</div>
                </button>
              ))}
            </div>
            <button onClick={startNewCalc} style={{ padding: '10px 24px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Start New Calculation →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {records.map((rec, i) => {
              const displayRevenue = rec.biz?.pnl?.grossRevenue ?? rec.biz?.grossRevenue
              const entityType     = rec.biz?.type || rec.biz?.entityType || rec.entityType || '—'
              const taxYear        = rec.taxYear || rec.biz?.year || '—'
              const filingStatus   = (rec.f1040?.filingStatus || rec.filingStatus || '—').toUpperCase()
              const quarterly      = rec.quarterly || rec.biz?.quarterly || 0
              const w2Income       = rec.f1040?.w2Income || rec.w2Income
              const totalTax       = parseFloat(rec.totalTax) || 0
              // FINDING 8 FIX: a record saved after Step 2 ran carries step2Computed === true
              // even when totalTax is $0 (loss year, zero-income scenario).  Without this flag,
              // totalTax === 0 is ambiguous — the Dashboard was showing "Complete Step 2 for
              // estimate" for records whose tax was legitimately zero.
              // Legacy records that predate this flag fall back to the totalTax > 0 heuristic.
              const step2Computed = rec.step2Computed === true || totalTax > 0
              const isActive       = activeRecordId && String(rec.id) === activeRecordId

              // F24 FIX: derive effective rate from saved fields for the summary strip.
              // rec.totalTax is saved by TaxReturn.jsx buildRecord(). Effective rate is
              // totalTax ÷ approximate total income. We derive income from the saved
              // k1Income + f1040.w2Income since AGI is not directly persisted on the record.
              const k1ForRate   = parseFloat(rec.k1Income) || 0
              const w2ForRate   = parseFloat(rec.f1040?.w2Income) || parseFloat(rec.w2Income) || 0
              const approxIncome = k1ForRate + w2ForRate
              // FINDING 8 FIX (continued): show 0.0% effective rate for a computed-$0
              // record rather than hiding it entirely; only omit when Step 2 hasn't run.
              const effRateNum  = step2Computed && approxIncome > 0
                ? (totalTax / approxIncome * 100).toFixed(1)
                : step2Computed && approxIncome === 0
                  ? '0.0'
                  : null
              const savedAt = rec.savedAt && rec.savedAt !== 'Current session (unsaved)'
                ? rec.savedAt
                : null

              return (
                <div key={rec.id || i} style={{
                  background: '#fff',
                  border: isActive ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  borderRadius: 14,
                  padding: '18px 24px',
                  boxShadow: isActive ? '0 0 0 3px rgba(37,99,235,0.1)' : '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  {/* ── Card header row ── */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: N, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}><path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="#475569" strokeWidth="1.3" fill="none"/><path d="M10 2v3h3" stroke="#475569" strokeWidth="1.3" strokeLinejoin="round"/><line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#475569" strokeWidth="1.3"/><line x1="4.5" y1="10.5" x2="9" y2="10.5" stroke="#475569" strokeWidth="1.3"/></svg>
                        {rec.name || (savedAt ? new Date(savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Saved Record')}
                        {isActive && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.03em' }}>
                            ACTIVE IN TAX TRACKER
                          </span>
                        )}
                      </div>
                      {savedAt && (
                        <div style={{ fontSize: 11, color: '#64748B' }}>Saved {savedAt}</div>
                      )}
                    </div>

                    {/* Action buttons — top-right */}
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                      <button onClick={() => loadRecord(rec)} style={{ padding: '9px 18px', background: N, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        Load &amp; Continue →
                      </button>
                      <button
                        onClick={() => handleDeleteClick(rec, i)}
                        title={`Delete "${rec.name || rec.savedAt || 'record'}"`}
                        style={{ padding: '9px 13px', background: '#fff', color: R, border: '1.5px solid #FCA5A5', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                      >🗑</button>
                    </div>
                  </div>

                  {/* ── F24 FIX: Summary strip — always visible, no loading required ── */}
                  {/* Shows est. tax liability, effective rate, and tax year derived from
                      saved record fields. When totalTax is 0 (Step 2 not completed),
                      shows a prompt instead of blank numbers. */}
                  <div style={{
                    display: 'flex', gap: 0, flexWrap: 'wrap',
                    background: '#F8FAFC', borderRadius: 10,
                    border: '1px solid #E2E8F0', overflow: 'hidden',
                    marginBottom: 10,
                  }}>
                    {/* Tax year */}
                    <div style={{ padding: '10px 18px', borderRight: '1px solid #E2E8F0', minWidth: 80 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>TAX YEAR</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: N }}>{taxYear}</div>
                    </div>

                    {/* Est. federal tax liability */}
                    <div style={{ padding: '10px 18px', borderRight: '1px solid #E2E8F0', flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>{FINANCIAL_LABELS.estTotalFederalTax}</div>
                      {step2Computed ? (
                        <div style={{ fontSize: 18, fontWeight: 800, color: totalTax > 0 ? R : '#16A34A' }}>
                          {totalTax > 0 ? fmt(Math.round(totalTax)) : '$0'}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', lineHeight: 1.4, paddingTop: 2 }}>
                          Complete Step 2 for estimate
                        </div>
                      )}
                    </div>

                    {/* Effective rate */}
                    <div style={{ padding: '10px 18px', borderRight: '1px solid #E2E8F0', minWidth: 120 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>EFFECTIVE RATE</div>
                      {effRateNum !== null ? (
                        <div style={{ fontSize: 16, fontWeight: 800, color: N }}>{effRateNum}%</div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#64748B' }}>—</div>
                      )}
                    </div>

                    {/* Quarterly */}
                    <div style={{ padding: '10px 18px', minWidth: 130 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>QUARTERLY EST.</div>
                      {quarterly > 0 ? (
                        <div style={{ fontSize: 16, fontWeight: 800, color: N }}>{fmt(Math.round(quarterly))}<span style={{ fontSize: 11, fontWeight: 500, color: SL }}>/qtr</span></div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#64748B' }}>—</div>
                      )}
                    </div>
                  </div>

                  {/* ── Metadata row ── */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: SL }}>Entity: <strong style={{ color: N }}>{entityType}</strong></span>
                    <span style={{ fontSize: 12, color: SL }}>Filing: <strong style={{ color: N }}>{filingStatus}</strong></span>
                    {displayRevenue && parseFloat(displayRevenue) > 0 && (
                      <span style={{ fontSize: 12, color: SL }}>Revenue: <strong style={{ color: N }}>{fmt(displayRevenue)}</strong></span>
                    )}
                    {w2Income && parseFloat(w2Income) > 0 && (
                      <span style={{ fontSize: 12, color: SL }}>W-2: <strong style={{ color: N }}>{fmt(w2Income)}</strong></span>
                    )}
                    {quarterly > 0 && (
                      <span style={{ fontSize: 11, color: '#64748B' }}>
                        · <span
                          onClick={e => { e.stopPropagation(); loadRecord(rec) }}
                          style={{ color: '#64748B', textDecoration: 'underline', cursor: 'pointer' }}
                          title="Open Step 2 to compare safe harbor thresholds"
                        >safe harbor in Step 2</span>
                      </span>
                    )}
                    {/* Delta vs previous record */}
                    {i === 0 && records[1] && (parseFloat(records[1].totalTax) || 0) > 0 && totalTax > 0 && (() => {
                      const prevTax = parseFloat(records[1].totalTax) || 0
                      const delta = totalTax - prevTax
                      if (Math.abs(delta) < 100) return null
                      return (
                        <span style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? '#DC2626' : '#16A34A' }}>
                          {delta > 0 ? '▲' : '▼'} {fmt(Math.abs(Math.round(delta)))} vs prior record
                        </span>
                      )
                    })()}
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
