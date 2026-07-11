// Dashboard.jsx — TaxStat360
// F-06: Personal 1040 tab removed. Users complete their personal return in
//       Step 2 (TaxReturn.jsx) via the Calculator flow. Dashboard is now
//       focused on record management only. activeView state eliminated.
// F-07: Delete now requires explicit confirmation via a named modal dialog.
//       Replaces the prior two-click "Sure?" / pendingDeleteIdx pattern.
// F-08: One-time welcome tour (5 steps) — shown on /onboarding/welcome before entity setup.
//       Per-user flag: ts360_onboarding_v1_<email> (see utils/onboardingTour.js).
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
// F-M02:  ownPct() from utils/entityPredicates.js replaces (nf(x) || 100)
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
import FederalDisclosureBanner from './components/FederalDisclosureBanner.jsx'
import { readDisclaimerSeen, writeDisclaimerSeen, readMfaEnabled, writeMfaEnabled, readUserName, readSubscriptionIncomplete, readDirtyFlag, writeDirtyFlag, readActiveRecordName } from './utils/sessionState.js'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, calcCCorpCorporateLayer, calcReasonableCompCore } from './taxCalc.js'
// PHASE 3.2: record cards surface engine-verified levers + engine-true figures.
import { topLeversForRecord } from './utils/topLevers.js'
import { writePersonalContext, writeTaxYear, writeStep1State, clearStep1State, loadUserRecordsFromServer, deleteUserRecord, normalizeF1040, writeActiveRecord, readActiveRecordId, writePresetEntityType, write2FANudge, read2FANudge, readGotoForm, clearGotoForm } from './utils/sessionState.js'
import { parseMoney, nf } from './utils/money.js'
// M2 (audit F-05): ARCHITECTURE §5 calculation guard. NOTE: only named imports here —
// this file already declares a local `safeCalc` fallback object, so calcGuard's
// safeCalc() helper must not be imported into this scope.
import { validateCalcInputs, CalcInputError } from './utils/calcGuard.js'
import { apiGet } from './utils/apiClient.js'
import { signOut } from './utils/SignOut'
import BrandLogo from './BrandLogo'
import {
  SCORP_REASONABLE_COMP_RATIO_THRESHOLD,
  CURRENT_TAX_YEAR,
  FINANCIAL_LABELS,
  federalTaxHeadlineLabel,
} from './constants.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R, ORANGE as O } from './theme.js'
import { fmt, pct, effectiveRate } from './utils/money.js'
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
  const rev    = nf(biz.grossRevenue)
  const cogs   = nf(biz.cogs)
  const gross  = rev - cogs
  const opExp  = nf(biz.operatingExpenses)
  const sal    = nf(biz.officerSalary)
  const dep    = nf(biz.depreciation)
  const adv    = nf(biz.advertising)
  const other  = nf(biz.otherDeductions)
  const totalExp = opExp
  const _pnlNet  = nf(biz.pnl?.netProfit)
  const netBiz   = Number.isFinite(_pnlNet) ? Math.round(_pnlNet) : (gross - totalExp)
  const own      = ownPct(biz.ownershipPct) / 100
  const k1       = Math.round(netBiz * own)

  const fs       = f1040.filingStatus || 'single'
  const year     = parseInt(biz.year) || CURRENT_TAX_YEAR
  const w2       = nf(f1040.w2Income)
  const otherInc = nf(f1040.otherIncome)
  const deps     = nf(f1040.dependents)
  const estPay   = nf(f1040.estimatedPayments)
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

  // M2 (audit F-05): ARCHITECTURE §5 guard — both calcTaxReturn() calls below spread
  // this baseInput, so one validation here covers them. Throws CalcInputError on
  // corrupted session state (e.g. a NaN money field); the Dashboard component catches
  // it and renders a visible error card instead of a silently wrong tracker.
  validateCalcInputs(baseInput, 'Dashboard')

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

  // D-10 (dead-code audit): numeric rule now comes from the engine's
  // calcReasonableCompCore — this card can no longer drift from the return page
  // on WHEN the alert fires. The message wording below is this card's own and
  // differs from the engine's more fully-hedged version (OBS-7, owner decision).
  const reasonableCompAlert = (() => {
    if (!isSC) return { triggered: false, ratio: 100, message: '' }
    const core = calcReasonableCompCore(sal, k1)
    if (!core.applicable) return { triggered: false, ratio: 100, message: '' }
    return {
      triggered: core.triggered,
      ratio: core.ratioPct,
      sal: Math.round(sal),
      distributions: Math.round(Math.max(0, k1)),
      // OBS-7 RESOLVED (Batch 7): adopts the core's hedged wording — one message everywhere.
      message: core.message,
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

const LOGO = () => <BrandLogo size={30} />

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

// D-03 (Batch 7): payment-recovery banner. Onboarding sets the
// subscription-incomplete flag when Stripe setup fails at signup; until now
// NOTHING read it — customers whose payment failed entered the product with no
// prompt to finish. This banner closes that loop. It clears when Upgrade
// succeeds (removeSubscriptionIncomplete there) and is deliberately
// NON-dismissible: an unpaid subscription is not a notice to swipe away.
function SubscriptionIncompleteBanner() {
  if (readSubscriptionIncomplete() !== '1') return null
  return (
    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 13, color: '#78350F', fontWeight: 500 }}>
          <strong>Your subscription setup didn't finish.</strong> Your payment could not be completed at signup — finish setting it up to keep full access to your tax tools.
        </span>
      </div>
      <a href="/upgrade" style={{ flexShrink: 0, padding: '7px 14px', background: '#B45309', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>Complete setup →</a>
    </div>
  )
}

// Batch 7: FederalDisclosureBanner extracted to components/FederalDisclosureBanner.jsx —
// the federal-scope disclosure now renders on BOTH the Dashboard and the Tax Return page.

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

  const [showDisclaimer, setShowDisclaimer] = useState(() => !readDisclaimerSeen())
  const dismissDisclaimer = () => { writeDisclaimerSeen('1'); setShowDisclaimer(false) }

  const [show2FANudge, setShow2FANudge] = useState(() =>
    readMfaEnabled() !== '1' &&
    !read2FANudge()
  )
  const dismiss2FANudge = () => { write2FANudge(true); setShow2FANudge(false) }

  // F2 FIX (Jul 2026): the nudge above initializes from the cached ts360_mfa_enabled
  // flag, which is only written when the user visits Settings. On a fresh login the
  // cache can be stale, so a user WITH 2FA enabled (it is enforced at login) was still
  // shown "2FA is not enabled." Verify against the authoritative server status on mount,
  // repair the cache, and hide the nudge when 2FA is actually on.
  useEffect(() => {
    let cancelled = false
    apiGet('/auth/mfa/status', { credentials: 'include' })
      .then(data => {
        if (cancelled || !data || typeof data.enabled !== 'boolean') return
        writeMfaEnabled(data.enabled ? '1' : '0')
        if (data.enabled) setShow2FANudge(false)
      })
      .catch(() => {
        // Best-effort (ARCHITECTURE §7): a failed status check leaves the cached nudge
        // state untouched. We only ever suppress a false "not enabled" — never assert a
        // false "enabled" — so no user-facing error is warranted for a dismissible nudge.
      })
    return () => { cancelled = true }
  }, [])

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
  // D-09: value never rendered (write-only state); setter kept — its calls drive re-renders.
  const [, setSavedRecordId] = useState(null)
  const [activeRecordId, setActiveRecordId] = useState(() =>
    readActiveRecordId()
  )
  // D-09: write-only state (see D-04 — the connected-app label was never displayed).
  const [, setConnectedApp] = useState(null)
  const [xeroLoading, setXeroLoading] = useState(false)
  const [dismissedCompAlert, setDismissedCompAlert] = useState(false)

  // F-19 UX FIX: responsive nav — collapse labels to icons on narrow viewports
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 719px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const userName = readUserName() || ''

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

    if (readGotoForm()) {
      clearGotoForm()
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
              grossRevenue: String(Math.round(nf(data.grossRevenue))),
              otherDeductions: String(Math.round(nf(data.otherDeductions))),
            }))
          }
          setXeroLoading(false)
          window.history.replaceState({}, '', '/dashboard')
        })
        .catch(() => { setXeroLoading(false); window.history.replaceState({}, '', '/dashboard') })
    }

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasNumbers = nf(biz.grossRevenue) > 0
  // M2 (audit F-05): calcDashboard() now validates its engine inputs and throws
  // CalcInputError on corrupted state. Catch it here into a visible error card —
  // the alternative (the zeroed `safeCalc` fallback below) would render a $0 tracker
  // a user could mistake for a real liability. Any other error re-throws to the
  // app-level ErrorBoundary.
  let calc = null
  let calcError = null
  if (hasNumbers) {
    try {
      calc = calcDashboard(biz, f1040)
    } catch (e) {
      if (e instanceof CalcInputError) calcError = e.message
      else throw e
    }
  }
  const safeCalc = calc || {
    k1: 0, w2: 0, agi: 0, qbi: 0, seTax: 0, seDed: 0,
    taxableInc: 0, incomeTax: 0, ctc: 0, totalTax: 0,
    effRate: '0.0', quarterly: 0, taxOwed: 0, refund: 0,
    isPassthru: false, isSC: false, isCCorp: false, recSal: 0,
    corpTax: 0, divTax: 0, combinedTax: 0,
    niit: { applies: false, amount: 0 },
    reasonableCompAlert: { triggered: false, ratio: 100, message: '' },
  }

  // D-3 (A): loading a record over unsaved working changes is the one action
  // that actually destroys them (session state persists per keystroke, but a
  // load replaces it). One explicit confirm; loading establishes a clean
  // baseline (dirty cleared).
  const confirmOverwriteDirty = (verb) => {
    if (!readDirtyFlag()) return true
    const name = readActiveRecordName()
    return window.confirm(
      `You have unsaved changes${name ? ` to "${name}"` : ''} in the Tax Tracker. ` +
      `${verb} will replace them. Continue?`
    )
  }

  const loadRecord = (rec) => {
    if (!confirmOverwriteDirty('Loading this record')) return
    writeDirtyFlag(false)
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
            const rev = nf(b.grossRevenue)
            const opEx = nf(b.operatingExpenses)
            const sal = nf(b.officerSalary)
            const dep = nf(b.depreciation)
            const adv = nf(b.advertising)
            const oth = nf(b.otherDeductions)
            const netProfit = rev - opEx - sal - dep - adv - oth
            const ownPctVal = parseInt(b.ownershipPct || b.own) || 100
            return [{
              name: b.name || normalizeEntityType(b.entityType) || 'Business',
              type: normalizeEntityType(b.entityType),
              own: ownPctVal,
              pnl: { grossRevenue: rev, totalExpenses: opEx, officerSalary: sal, netProfit },
              netProfit,
              k1: nf(rec.k1Income) || Math.round(netProfit * (ownPctVal / 100)),
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
    if (!confirmOverwriteDirty('Starting a new calculation')) return
    writeDirtyFlag(false)
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
  // UX AUDIT F3 (Jul 2026): the persona quick-starts previously existed ONLY in
  // the empty state, so they vanished after the first save — exactly when an
  // investor wants to model a second structure (e.g. holding a rental in an LLC
  // vs. personally). One list now feeds both the empty state and a persistent
  // quick-start strip below the saved records.
  const PERSONA_PRESETS = [
    { label: 'S-Corp Owner',          icon: '🏢', desc: 'Salary + K-1 income' },
    { label: 'Sole Proprietor',       icon: '💼', desc: 'Schedule C self-employment' },
    { label: 'Real Estate Investor',  icon: '🏠', desc: 'Rental income + depreciation' },
    { label: 'Partnership / LLC',     icon: '🤝', desc: 'K-1 distributive share' },
  ]
  const startNewCalcWithPreset = (label) => {
    if (!confirmOverwriteDirty('Starting a new calculation')) return
    writeDirtyFlag(false)
    clearStep1State()
    setSavedRecordId(null)
    setLoadedRecord(null)
    const type = PRESET_ENTITY_TYPE[label]
    if (type) writePresetEntityType(type)
    nav('/calculate-tax')
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: '#F8FAFC' }}>

      {/* M2 (audit F-05): visible failure state — never render silently-zeroed tax
          figures when the calculation guard has rejected the inputs. */}
      {calcError && (
        <div role="alert" style={{ maxWidth: 1100, margin: '16px auto 0', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, padding: '12px 16px', fontSize: 13, lineHeight: 1.5 }}>
          <strong>Tax Tracker figures are unavailable.</strong> A required calculation input
          is missing or invalid, so estimates are not shown (rather than showing $0).
          Re-enter the business figures below or reload the saved record; if this persists,
          sign out and back in to refresh your session data.
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4, fontFamily: 'monospace' }}>{calcError}</div>
        </div>
      )}

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
          {/* UX AUDIT F17 (Jul 2026): on narrow screens the nav collapsed to bare
              emoji glyphs (🧮 🤖 ⚙) ~32px tall — unlabeled mystery-meat navigation
              for an owner reviewing their tax position on the go. Mobile buttons
              now carry short text labels and ≥44px touch targets; full names stay
              on desktop and in aria-labels/titles either way. */}
          <button onClick={() => nav('/calculate-tax')} aria-label="Tax Tracker" style={{ padding: isMobile ? '13px 12px' : '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }} title="Tax Tracker">{isMobile ? 'Tracker' : 'Tax Tracker'}</button>
          <button onClick={() => nav('/ai-analysis')} aria-label={isPro() ? 'AI Analysis & Reporting' : 'AI Analysis & Reporting (Professional plan required)'} style={{ padding: isMobile ? '13px 12px' : '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: isPro() ? '#fff' : '#f8fafc', fontSize: 13, cursor: isPro() ? 'pointer' : 'default', color: isPro() ? SL : '#cbd5e1', fontWeight: 600 }} title={isPro() ? 'AI Analysis & Reporting' : 'Upgrade to Professional to unlock AI Analysis & Reporting'}>{isMobile ? 'AI' : 'AI Analysis & Reporting'}{!isPro() && ' 🔒'}</button>
          {!isMobile && <button onClick={() => signOut(nav)} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }}>Sign Out</button>}
          <button onClick={() => nav('/settings')} aria-label="Settings" style={{ padding: isMobile ? '13px 12px' : '7px 16px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', color: SL, fontWeight: 600 }} title="Settings">Settings</button>
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

      {/* UX AUDIT F15 (Jul 2026): main landmark so screen-reader users can jump
          past the nav/banners straight to the records. */}
      <main id="main-content" aria-label="Dashboard" style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 20px' }}>
        {/* PHASE 3.3: the page's missing h1 — visually hidden (the Dashboard's
            design has no on-screen title) so assistive tech gets a proper
            document outline; "My Saved Records" below remains a correct h2. */}
        <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
          Tax Planning Dashboard
        </h1>

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
              <div style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.5, background: 'rgba(153,27,27,0.08)', borderRadius: 6, padding: '8px 12px' }}>
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
        <SubscriptionIncompleteBanner />
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
              {PERSONA_PRESETS.map(p => (
                <button key={p.label} onClick={() => startNewCalcWithPreset(p.label)} aria-label={`Start a new ${p.label} calculation — ${p.desc}`} style={{ padding: '10px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, cursor: 'pointer', textAlign: 'left', minWidth: 140 }}>
                  <div style={{ fontSize: 20 }}>{p.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: N, marginTop: 4 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: SL, marginTop: 2 }}>{p.desc}</div>
                </button>
              ))}
            </div>
            <p style={{ color: SL, fontSize: 13, margin: '8px 0 0', textAlign: 'center' }}>
              Or{' '}
              <span onClick={startNewCalc} style={{ color: B, cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}>start with a blank calculation</span>
            </p>
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
              const totalTax       = nf(rec.totalTax)
              // FINDING 8 FIX: a record saved after Step 2 ran carries step2Computed === true
              // even when totalTax is $0 (loss year, zero-income scenario).  Without this flag,
              // totalTax === 0 is ambiguous — the Dashboard was showing "Complete Step 2 for
              // estimate" for records whose tax was legitimately zero.
              // Legacy records that predate this flag fall back to the totalTax > 0 heuristic.
              const step2Computed = rec.step2Computed === true || totalTax > 0
              const isActive       = activeRecordId && String(rec.id) === activeRecordId

              // PHASE 3.2: one engine run per card via the shared selector —
              // levers + current-law figures. topLeversForRecord never throws;
              // a malformed legacy record simply yields ok:false and no levers.
              const { summary: eng, levers } = topLeversForRecord(rec)

              // F24 FIX: derive effective rate from saved fields for the summary strip.
              // rec.totalTax is saved by TaxReturn.jsx buildRecord(). Effective rate is
              // totalTax ÷ approximate total income. We derive income from the saved
              // k1Income + f1040.w2Income since AGI is not directly persisted on the record.
              const k1ForRate   = nf(rec.k1Income)
              const w2ForRate   = nf(rec.f1040?.w2Income) || nf(rec.w2Income)
              const approxIncome = k1ForRate + w2ForRate
              // FINDING 8 FIX (continued): show 0.0% effective rate for a computed-$0
              // record rather than hiding it entirely; only omit when Step 2 hasn't run.
              const effRateNum  = step2Computed && approxIncome > 0
                ? (totalTax / approxIncome * 100).toFixed(1)
                : step2Computed && approxIncome === 0
                  ? '0.0'
                  : null
              // PHASE 3.2 (F24 upgrade): engine-true figures when the record
              // summarizes cleanly — the same cure R-2 applied to AIAnalysis and
              // 3.1 applied to Step 1. The engine recomputes under CURRENT law,
              // so a record saved before a tax fix (e.g. §1211(b)) shows the
              // corrected liability here, matching what Load & Continue shows.
              // The F24 approxIncome rate remains the fallback for records the
              // guard rejects.
              const engOk = eng.ok && step2Computed
              const displayTax    = engOk ? eng.totalTax : totalTax
              const effRateFinal  = engOk && eng.agi > 0
                ? (eng.totalTax / eng.agi * 100).toFixed(1)
                : effRateNum
              const quarterlyFinal = engOk && (eng.quarterlyRecommended || 0) > 0
                ? eng.quarterlyRecommended
                : quarterly

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
                          <span style={{ fontSize: 11, fontWeight: 700, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.03em' }}>
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
                        aria-label={`Delete record "${rec.name || rec.savedAt || 'record'}"`}
                        style={{ padding: '9px 13px', background: '#fff', color: R, border: '1.5px solid #FCA5A5', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                      ><span aria-hidden="true">🗑</span></button>
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
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>TAX YEAR</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: N }}>{taxYear}</div>
                    </div>

                    {/* Est. federal tax liability */}
                    <div style={{ padding: '10px 18px', borderRight: '1px solid #E2E8F0', flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>{federalTaxHeadlineLabel(engOk ? eng.seTax : (rec && rec.seTax))}</div>
                      {step2Computed ? (
                        <div style={{ fontSize: 18, fontWeight: 800, color: displayTax > 0 ? R : '#16A34A' }}>
                          {displayTax > 0 ? fmt(Math.round(displayTax)) : '$0'}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic', lineHeight: 1.4, paddingTop: 2 }}>
                          Complete Step 2 for estimate
                        </div>
                      )}
                    </div>

                    {/* Effective rate */}
                    <div style={{ padding: '10px 18px', borderRight: '1px solid #E2E8F0', minWidth: 120 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>EFFECTIVE RATE</div>
                      {engOk && eng.agi <= 0 ? (
                        /* PHASE 3.3 (UX F15): a loss year is not "—" and not "0.0%" —
                           the honest label, single-sourced wording (see effRateLabel). */
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>n/a (loss year)</div>
                      ) : effRateFinal !== null ? (
                        <div style={{ fontSize: 16, fontWeight: 800, color: N }}>{effRateFinal}%</div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#64748B' }}>—</div>
                      )}
                    </div>

                    {/* Quarterly */}
                    <div style={{ padding: '10px 18px', minWidth: 130 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.5px', marginBottom: 3 }}>QUARTERLY EST.</div>
                      {quarterlyFinal > 0 ? (
                        <div style={{ fontSize: 16, fontWeight: 800, color: N }}>{fmt(Math.round(quarterlyFinal))}<span style={{ fontSize: 11, fontWeight: 500, color: SL }}>/qtr</span></div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#64748B' }}>—</div>
                      )}
                    </div>
                  </div>

                  {/* ── PHASE 3.2: top levers — engine-verified, ranked, capped at 2 ── */}
                  {levers.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      {levers.map(l => (
                        <div key={l.id} style={{
                          fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
                          border: '1px solid',
                          ...(l.tone === 'alert'
                            ? { background: '#FFFBEB', borderColor: '#FCD34D', color: '#92400E' }
                            : l.tone === 'save'
                              ? { background: '#F0FDF4', borderColor: '#BBF7D0', color: '#166534' }
                              : { background: '#F8FAFC', borderColor: '#E2E8F0', color: SL }),
                        }}>
                          {l.tone === 'alert' ? '⚠ ' : l.tone === 'save' ? '💰 ' : 'ℹ '}{l.text}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Metadata row ── */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: SL }}>Entity: <strong style={{ color: N }}>{entityType}</strong></span>
                    <span style={{ fontSize: 12, color: SL }}>Filing: <strong style={{ color: N }}>{filingStatus}</strong></span>
                    {displayRevenue && nf(displayRevenue) > 0 && (
                      <span style={{ fontSize: 12, color: SL }}>Revenue: <strong style={{ color: N }}>{fmt(displayRevenue)}</strong></span>
                    )}
                    {w2Income && nf(w2Income) > 0 && (
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
                    {i === 0 && records[1] && (nf(records[1].totalTax)) > 0 && totalTax > 0 && (() => {
                      const prevTax = nf(records[1].totalTax)
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
            {/* UX AUDIT F3 (Jul 2026): persistent quick-starts — an owner with
                saved records can spin up a new scenario (second property, new
                entity structure) without hunting for the vanished empty-state
                cards. Same presets, same seeding path (startNewCalcWithPreset). */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px dashed #CBD5E1', padding: '16px 20px', marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: SL, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 10 }}>Start a new scenario</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {PERSONA_PRESETS.map(p => (
                  <button key={p.label} onClick={() => startNewCalcWithPreset(p.label)} aria-label={`Start a new ${p.label} calculation — ${p.desc}`} title={p.desc} style={{ padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }} aria-hidden="true">{p.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: N }}>{p.label}</span>
                  </button>
                ))}
                <button onClick={startNewCalc} style={{ padding: '10px 14px', background: 'none', border: 'none', color: B, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                  or start blank
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
