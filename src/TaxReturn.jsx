// src/TaxReturn.jsx
// Step 2 of the TaxStat360 two-step flow: Personal Tax Return.
// Reads entity / K-1 data from session state (written by CalculateTaxInner.jsx)
// and adds personal income, deductions, and filing info to produce the
// estimated federal tax liability.
//
// ── Change log ────────────────────────────────────────────────────────────────
// BUG-01 FIX: Duplicate Prior Year Passive Loss Carryforward (priorPAL) field.
// L-02 FIX: "S-Corp FICA Savings" renamed to "SE Tax Savings on Distributions".
// C-06 FIX: 2026 tax year dropdown option shortened to "2026 (OBBBA)".
// UX-05 FIX: Micro-text added beneath each save button to disambiguate navigation.
// PASS5 (Code Consistency): CC-P01–CC-P04 as documented in prior pass.
//
// ── AUDIT REPORT FIXES (Sprint 1) ────────────────────────────────────────────
// F-NEW-A FIX: Safe harbor tooltip — $75K threshold is MFS only (§6654(d)(1)(C)(ii)).
// F-NEW-B FIX: OBBBA advisory banner when taxYear===2026 selected.
// F-11 FIX: REP election has §469(c)(7)(B) hours gate before isREP is set.
// F-01 FIX: Prior-year §1366(d) suspended loss carryforward input (Form 7203 Part III).
// F-08 FIX: §1250 prompt when Form 4797 gain entered and §1250 blank.
//
// ── AUDIT PASS 1 FIXES ────────────────────────────────────────────────────────
// F-09 FIX: W-2 Income input click redirected to QuickBooks OAuth flow.
// F-10 FIX: "Save This Record" (Step 2) gave no user feedback.
// F-13 FIX: "Save & Analyze →" saved but did not navigate to Step 3.
//
// ── AUDIT PASS 2 FIXES ────────────────────────────────────────────────────────
// F16 FIX: client-side validation on required numeric income fields (nonNegative).
// F17 FIX: YTD Mode shows period + projected full-year income.
// F18 FIX: Safe Harbor pass/fail status indicator.
//
// ── F6 FIX (§469 rental treatment — §1.469-9(g) aggregation election) ─────────
// Rentals are passive by default. A real estate professional makes the whole rental
// portfolio nonpassive by affirmatively making the §1.469-9(g) aggregation election —
// the "aggregate your participation hours across all properties" rule. This screen
// surfaces a single control for it:
//   • rentalAggregationElection — TRI-STATE (undefined = not yet elected). Shown only
//     when REP is established (REP-gated); it is a deliberate attestation and is never
//     defaulted to true. Checking it treats the portfolio as nonpassive; leaving it
//     unchecked keeps the rentals passive (the §469(a) default) — REP status alone is
//     not enough, matching the engine.
//   The flag is persisted (writePersonalContext + buildRecord.f1040) and fed into
//   calcInput as `rentalAggregationElection === true`. A one-time migration prompt
//   appears for a saved return that had REP set before this election existed, so the
//   user re-confirms rather than silently inheriting nonpassive treatment.
//   (The engine still accepts a per-entity materiallyParticipates flag and a Step-2
//   participation answer for forward compatibility, but the UI deliberately exposes
//   only the aggregation election as the single rental-treatment switch.)

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, calcQBI, getStdDed, getTable, QBI_THRESHOLDS, calcCCorpCorporateLayer } from './taxCalc.js'
import {
  readPersonalContext, writePersonalContext,
  readTaxYear, writeTaxYear,
  readStep1State, writeStep1State, readUserRecords, syncRecordToServer,
  readActiveRecordId, writeActiveRecord,
} from './utils/sessionState.js'
import { signOut } from './utils/signOut'
import { nf } from './utils/parseMoney.js'
import { fmt, pct, effectiveRate, formatTimestamp } from './utils/formatMoney.js'
import { ownPct, isPassthroughEntity, isRealEstateEntity, isSCorpEntity, isCCorpEntity } from './utils/entityPredicates.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R } from './theme.js'
import { API_BASE_URL, CURRENT_TAX_YEAR, SUPPORTED_TAX_YEARS, STEP3_LABEL, FINANCIAL_LABELS } from './constants.js'
import { isPro } from './LockedFeature'

const PURPLE = '#7C3AED'

// ─── Helpers ──────────────────────────────────────────────────────────────────
// nf() (numeric coercion) is imported from utils/parseMoney.js — single shared definition (audit C-2).

// UX audit F7 + F13: tooltips now open on hover AND keyboard focus AND click
// (touch), carry a real accessible name (was literally "?"), and the bubble forces
// sentence-case rendering so it never inherits the uppercase label styling around it.
// Pass an optional `label` (e.g. label="depreciation") for a specific help name.
function InfoTip({ text, wide, label }) {
  const [show, setShow] = useState(false)
  const hideTimer = useRef(null)
  const open = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null } setShow(true) }
  const close = () => { hideTimer.current = setTimeout(() => setShow(false), 120) }
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <button
        type="button"
        aria-label={label ? `Help: ${label}` : 'More information'}
        aria-expanded={show}
        onClick={() => setShow(s => !s)}
        onFocus={open}
        onBlur={close}
        style={{ width: 15, height: 15, borderRadius: '50%', background: '#E2E8F0', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, color: SL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
        ?
      </button>
      {show && (
        <div role="tooltip" style={{
          position: 'absolute', bottom: '140%', left: '50%', transform: 'translateX(-50%)',
          background: N, color: '#fff', borderRadius: 8, padding: '10px 14px',
          fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap',
          textTransform: 'none', fontWeight: 400, letterSpacing: 'normal', textAlign: 'left',
          width: wide ? 360 : 290, maxWidth: '90vw', zIndex: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid ' + N }} />
        </div>
      )}
    </span>
  )
}

// F16 FIX: MoneyInput gains a `nonNegative` prop.
// F12 FIX: MoneyInput gains an `ariaLabel` prop so inputs without a visible
// <label htmlFor> (e.g. the itemized-deduction fields) still expose an accessible
// name to screen readers instead of announcing only their value.
function MoneyInput({ value, onChange, placeholder, disabled, id, ariaLabel, style: sx, onClick, nonNegative, onError }) {
  const [raw, setRaw] = useState('')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      const n = nf(value)
      setRaw(n !== 0 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : (value || ''))
    }
  }, [value, focused])

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      value={raw}
      disabled={disabled}
      placeholder={placeholder || '0'}
      onClick={onClick}
      onChange={e => {
        const input = e.target
        const cursorPos = input.selectionStart
        const prevVal = input.value
        const prevCommas = (prevVal.slice(0, cursorPos).match(/,/g) || []).length

        const allowNeg = !nonNegative
        const stripped = allowNeg
          ? e.target.value.replace(/[^0-9-]/g, '')
          : e.target.value.replace(/[^0-9]/g, '')

        const isNeg = allowNeg && stripped.startsWith('-')
        const digits = stripped.replace(/^-/, '')
        const n = parseInt(digits, 10)
        const fmtd = stripped === '' ? '' : (allowNeg && stripped === '-') ? '-' :
          (isNeg ? '-' : '') + (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : digits)
        setRaw(fmtd); onChange(stripped)

        if (onError) onError('')

        requestAnimationFrame(() => {
          if (input && document.activeElement === input) {
            const newCommas = (fmtd.slice(0, cursorPos).match(/,/g) || []).length
            const pos = Math.max(0, Math.min(cursorPos + (newCommas - prevCommas), fmtd.length))
            input.setSelectionRange(pos, pos)
          }
        })
      }}
      onFocus={() => { setFocused(true) }}
      onBlur={() => {
        setFocused(false)
        const n = nf(raw)
        if (Number.isFinite(n)) {
          const safeN = nonNegative ? Math.max(0, n) : n
          setRaw(safeN.toLocaleString('en-US', { maximumFractionDigits: 0 }))
          onChange(String(safeN))
          if (onError) onError('')
        } else if (raw !== '' && raw !== '-') {
          setRaw('')
          onChange('')
          if (onError) onError('Enter a number ≥ 0')
        }
      }}
      style={{
        width: '100%', padding: '9px 11px',
        border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14,
        fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
        background: disabled ? '#F8FAFC' : '#fff', color: disabled ? '#94A3B8' : N,
        position: 'relative', zIndex: 2, pointerEvents: 'auto',
        ...sx,
      }}
    />
  )
}

function IncomeField({ id, label, value, onChange, placeholder, tip, twoCol, onClick, style: sx }) {
  const [errMsg, setErrMsg] = useState('')
  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }}>
          {label}{tip}
        </label>
      )}
      <MoneyInput
        id={id}
        value={value}
        onChange={v => { onChange(v); if (errMsg) setErrMsg('') }}
        placeholder={placeholder}
        nonNegative
        onError={setErrMsg}
        onClick={onClick}
        style={sx}
      />
      {errMsg && (
        <div role="alert" style={{ fontSize: 11, color: R, fontWeight: 600, marginTop: 3 }}>{errMsg}</div>
      )}
    </div>
  )
}

function CollapsibleSection({ title, subtitle, badge, children, defaultOpen = false, accent, style: outerStyle }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 12, ...outerStyle }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '13px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: open ? (accent || '#EFF6FF') : '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* F5 FIX (UX audit): plain-language title leads; form/code reference is
              demoted to a small subtitle so the section is scannable by non-experts. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: N }}>{title}</span>
            {subtitle && <span style={{ fontSize: 11, color: SL, fontWeight: 500 }}>{subtitle}</span>}
          </div>
          {badge && <span style={{ fontSize: 11, fontWeight: 700, background: accent ? accent + '33' : '#EFF6FF', color: accent || B, borderRadius: 10, padding: '2px 9px', border: '1px solid ' + (accent || B) + '44' }}>{badge}</span>}
        </div>
        <span style={{ color: SL, fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={{ padding: '16px 18px', borderTop: '1px solid #F1F5F9' }}>{children}</div>}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function TaxReturn() {
  const navigate = useNavigate()

  const { entities, k1Total: sessionK1 } = readStep1State()
  const savedCtx = readPersonalContext()
  const [taxYear, setTaxYear] = useState(() => readTaxYear() || CURRENT_TAX_YEAR)

  const [filingStatus, setFilingStatus] = useState(savedCtx.filingStatus || 'single')
  const [w2Income,     setW2Income]     = useState(savedCtx.w2Income      || '')
  const [w2Withheld,   setW2Withheld]   = useState(savedCtx.w2Withheld    || '')
  const [estPaid,      setEstPaid]      = useState(savedCtx.estPaid        || '')
  const [dependents,   setDependents]   = useState(savedCtx.dependents     || '0')
  const [ytdMode,      setYtdMode]      = useState(!!(savedCtx.ytdMode))
  const [ytdMonth,     setYtdMonth]     = useState(savedCtx.ytdMonth       || new Date().getMonth() + 1)

  const [stGain,        setStGain]        = useState(savedCtx.stGain         || '')
  const [ltGain,        setLtGain]        = useState(savedCtx.capitalGains   || savedCtx.ltGain || '')
  const [interest,      setInterest]      = useState(savedCtx.interest       || '')
  const [dividends,     setDividends]     = useState(savedCtx.dividends      || '')
  const [qualDividends, setQualDividends] = useState(savedCtx.qualDividends || savedCtx.qualifiedDividends || '')
  const [unrecap1250,   setUnrecap1250]   = useState(savedCtx.unrecap1250    || '')
  const [collectibles,  setCollectibles]  = useState(savedCtx.collectiblesGain || '')
  const [form4797,      setForm4797]      = useState(savedCtx.form4797       || '')
  // F5 (§1231(c) lookback): prior-5-year nonrecaptured net §1231 losses
  const [nonrecap1231,  setNonrecap1231]  = useState(savedCtx.nonrecap1231   || '')

  // Rentals are entered in Step 1 as Real Estate (Schedule E) entities. REP status is
  // established there (per-entity) and flows through the engine; we seed the Step-2
  // value from the Step-1 entities so the §1.469-9(g) election control is reachable.
  const step1IsREP = (entities || []).some(e => e && isRealEstateEntity(e.type) && e.isREP)
  const [isREP,               setIsREP]               = useState(!!savedCtx.isREP || step1IsREP)
  const [isActiveParticipant, setIsActiveParticipant] = useState(savedCtx.isActiveParticipant === true)
  // F-01: §1366(d) suspended loss carryforward
  const [priorSuspendedLoss, setPriorSuspendedLoss] = useState(savedCtx.priorSuspendedLoss || '')

  // F6: rental §469 inputs now live entirely on the Step-1 Real Estate cards. Derive the
  // portfolio-level values the engine needs from those entities:
  //   • rentalAggregationElection — the §1.469-9(g) election is made on the rental card;
  //     "any elected" treats the aggregated portfolio as nonpassive (a single taxpayer-
  //     level election — checking it on a card is the affirmative attestation).
  //   • priorPAL — prior-year suspended passive loss (Form 8582) summed across the cards.
  const step1REList = (entities || []).filter(e => e && isRealEstateEntity(e.type))
  const rentalAggregationElection = step1REList.some(e => e.rentalAggregationElection === true)
  const cardPriorPAL = step1REList.reduce((s, e) => s + (nf(e.priorPAL) || 0), 0)
  // Migration: returns saved BEFORE rental consolidation stored a single portfolio prior-PAL
  // in personal context (savedCtx.priorPassiveLossCarryforward); it now lives on the Step-1
  // rental cards. If the cards carry none but a saved personal value exists, fall back to it
  // so the carryforward is NOT lost from the calc — and (critically) so the save-path write
  // of priorPassiveLossCarryforward doesn't clobber the orphan to 0. Once the user enters it
  // on a card, cardPriorPAL takes over and the fallback stops (no double counting). We flag it
  // because we can't know which property it belonged to — the user must re-attribute it.
  const orphanedPriorPAL = cardPriorPAL === 0 ? Math.max(0, nf(savedCtx.priorPassiveLossCarryforward) || 0) : 0
  const priorPAL = cardPriorPAL > 0 ? cardPriorPAL : orphanedPriorPAL
  // F6 migration: a saved return that had REP set before the election existed gets a
  // one-time prompt so the user re-confirms (passive is the safe default).
  const [showRepMigration, setShowRepMigration] = useState(
    !!savedCtx.isREP &&
    savedCtx.rentalAggregationElection === undefined
  )
  const [showPriorPALMigration, setShowPriorPALMigration] = useState(orphanedPriorPAL > 0)

  const [useItemized,       setUseItemized]      = useState(!!(savedCtx.useItemized))
  const [itemizedAmt,       setItemizedAmt]      = useState(savedCtx.itemizedAmt         || '')
  const [mortgageInt,       setMortgageInt]      = useState(savedCtx.mortgageInt          || '')
  const [charitableContr,   setCharitableContr]  = useState(savedCtx.charitableContr     || '')
  const [medicalAmt,        setMedicalAmt]       = useState(savedCtx.medicalAmt           || '')
  const [saltAmount,        setSaltAmount]       = useState(savedCtx.saltAmount           || '')
  const [selfEmpHealthIns,  setSelfEmpHealthIns] = useState(savedCtx.selfEmpHealthIns    || '')
  const [hsaDeduction,      setHsaDeduction]     = useState(savedCtx.hsaDeduction        || '')
  const [studentLoanInt,    setStudentLoanInt]   = useState(savedCtx.studentLoanInt      || '')
  const [selfEmpRetirement, setSelfEmpRetirement]= useState(savedCtx.selfEmpRetirement   || '')
  const [nolCarryforward,   setNolCarryforward]  = useState(savedCtx.nolCarryforward     || '')
  const [priorYearQBILoss,  setPriorYearQBILoss] = useState(savedCtx.priorYearLosses     || '')
  const [hasISO,            setHasISO]           = useState(!!(savedCtx.hasISO))
  const [isoBargainElement, setIsoBargainElement]= useState(savedCtx.isoBargainElement   || '')
  const [priorYearTax,      setPriorYearTax]     = useState(savedCtx.priorYearTax        || '')
  const [priorYearAGI,      setPriorYearAGI]     = useState(savedCtx.priorYearAGI        || '')

  const [saveStatus,    setSaveStatus]    = useState('idle')
  const [saveError,     setSaveError]     = useState(null)
  const [analyzeStatus, setAnalyzeStatus] = useState('idle')

  const ytdFactor = ytdMode ? (12 / ytdMonth) : 1

  const projectedAnnualIncome = ytdMode
    ? Math.round(((sessionK1 || 0) + nf(w2Income)) * ytdFactor)
    : 0

  const nonMedicalSubTotal  = nf(mortgageInt) + nf(charitableContr) + nf(saltAmount)
  const anyItemizedSubField = nonMedicalSubTotal > 0 || nf(medicalAmt) > 0
  const itemizedAmtForEngine = useItemized
    ? (anyItemizedSubField ? nonMedicalSubTotal : nf(itemizedAmt))
    : 0
  const medicalForEngine = useItemized && anyItemizedSubField ? nf(medicalAmt) : 0

  // ── C-Corp corporate layer ───────────────────────────────────────────────────────
  // A C-Corp does not pass through: its profit is taxed at the entity (21%) and reaches
  // the owner as dividends. Step 1 already (a) excludes the C-Corp from the pass-through
  // k1Total and (b) routes its officer salary into officerW2Total below (→ W-2 wages).
  // Here we compute the entity-level tax and the resulting dividend, per C-Corp entity:
  //   • dividends fold into the personal return as qualified dividends (taxed AGAIN), and
  //   • corpTax is added on top of the personal total (it is paid by the corporation,
  //     separately from the owner's 1040 — so it is NOT part of the quarterly estimate).
  // Planning model: single owner-employee, full annual distribution. See calcCCorpReturn.
  const ccorp = useMemo(() => {
    const list = Array.isArray(entities) ? entities : []
    return list.reduce((acc, e) => {
      if (!e || !isCCorpEntity(e.type)) return acc
      const salary = nf(e.officerW2) || nf(e.pnl?.officerSalary) || 0
      // Persisted netProfit is AFTER officer salary; the corporate layer needs profit
      // BEFORE salary (it deducts salary + employer FICA itself).
      const netBeforeSalary = nf(e.pnl?.netProfit) + salary
      const layer = calcCCorpCorporateLayer({ netProfit: netBeforeSalary, officerSalary: salary, taxYear })
      acc.corpTax   += layer.corpTax
      acc.dividends += layer.dividends
      acc.count     += 1
      return acc
    }, { corpTax: 0, dividends: 0, count: 0 })
  }, [entities, taxYear])

  const calcInput = useMemo(() => {
    const entityList = Array.isArray(entities) ? entities : []
    const box17KTotal = entityList.reduce((s, e) => s + (e ? nf(e.box17K) : 0), 0)
    const form4797Total = nf(form4797) + box17KTotal
    const officerW2Total = entityList.reduce((s, e) => {
      if (!e) return s
      const isCorp = isSCorpEntity(e.type) || isCCorpEntity(e.type)
      return isCorp ? s + (nf(e.officerW2) || nf(e.pnl?.officerSalary) || 0) : s
    }, 0)
    const w2Total = nf(w2Income) + officerW2Total
    return {
      taxYear, status: filingStatus, dependents: nf(dependents),
      entities: entityList, w2: w2Total, k1Total: sessionK1 || 0,
      // rentalNet (the old Step-2 lump) is gone — rentals flow from Step-1 Real Estate
      // entities via the engine's step1RentalNet. The engine defaults rentalNet to 0.
      stGain: nf(stGain), ltGain: nf(ltGain), intInc: nf(interest),
      divInc: nf(dividends) + ccorp.dividends, qualDiv: nf(qualDividends) + ccorp.dividends, f4797Inc: form4797Total,
      taxableSS: 0, iraIncome: 0,
      selfEmpHealthIns: nf(selfEmpHealthIns), hsaDeduction: nf(hsaDeduction),
      studentLoanInt: nf(studentLoanInt), selfEmpRetirement: nf(selfEmpRetirement),
      nolCarryforward: nf(nolCarryforward), priorYearQBILoss: nf(priorYearQBILoss),
      saltAmount: nf(saltAmount), hasISO, isoBargainElement: nf(isoBargainElement),
      isREP, isActiveParticipant,
      // F6: the §1.469-9(g) aggregation election, derived from the Step-1 rental cards.
      // The engine treats `true` as the affirmative election that makes a REP's portfolio
      // nonpassive, and anything else (unelected) as passive.
      rentalAggregationElection,
      unrecap1250: nf(unrecap1250), collectiblesGain: nf(collectibles),
      nonrecapturedNet1231Loss: nf(nonrecap1231),   // F5 (§1231(c) lookback)
      w2Withheld: nf(w2Withheld), estPaid: nf(estPaid), ytdFactor,
      priorYearTax: nf(priorYearTax), priorYearAGI: nf(priorYearAGI),
      priorPassiveLossCarryforward: priorPAL,
      priorSuspendedLoss: nf(priorSuspendedLoss),
      // C-10 FIX: opt into the conservative §1366(d) default. An S-Corp/partnership loss
      // with no stock/debt basis entered is treated as $0 basis (full loss suspended and
      // carried forward) rather than deducting in full against other income.
      assumeZeroBasisOnLoss: true,
      useItemized, itemizedAmt: itemizedAmtForEngine, medicalExpenses: medicalForEngine,
    }
  }, [
    taxYear, filingStatus, dependents, entities, w2Income, w2Withheld, estPaid,
    sessionK1, isREP, isActiveParticipant, priorPAL, priorSuspendedLoss,
    rentalAggregationElection,
    stGain, ltGain, interest, dividends, qualDividends, unrecap1250, collectibles, form4797, nonrecap1231,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, saltAmount, useItemized, itemizedAmt,
    mortgageInt, charitableContr, medicalAmt,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI, ytdFactor,
    ccorp,
  ])

  const result = useMemo(() => {
    try {
      const r = calcTaxReturn(calcInput)
      if (!r) return r
      if (ccorp.corpTax > 0 || ccorp.dividends > 0) {
        // The engine has already (a) taxed the dividends (folded into qualDiv above) and
        // (b) computed quarterlyRecommended on the PERSONAL total — both before this point.
        // Adding the corporate tax here keeps the headline total, effective rate, waterfall
        // and saved summary in sync, without inflating the owner's quarterly estimate (the
        // 21% is paid by the corporation on Form 1120, separately from the 1040).
        return {
          ...r,
          ccorpCorpTax:   ccorp.corpTax,
          ccorpDividends: ccorp.dividends,
          totalTax: (r.totalTax || 0) + ccorp.corpTax,
          balance:  (r.balance  || 0) + ccorp.corpTax,
        }
      }
      return r
    } catch { return null }
  }, [calcInput, ccorp])

  useEffect(() => {
    writePersonalContext({
      filingStatus, w2Income, w2Withheld, estPaid, dependents, ytdMode, ytdMonth,
      stGain, capitalGains: ltGain, ltGain, interest, dividends, qualDividends,
      qualifiedDividends: qualDividends, unrecap1250, collectiblesGain: collectibles, form4797, nonrecap1231,
      isREP, isActiveParticipant,
      priorPassiveLossCarryforward: priorPAL,
      rentalAggregationElection,   // F6 (§1.469-9(g) election)
      selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
      nolCarryforward, priorYearLosses: priorYearQBILoss,
      useItemized, itemizedAmt, saltAmount,
      mortgageInt, charitableContr, medicalAmt,
      hasISO, isoBargainElement,
      priorYearTax, priorYearAGI,
      priorSuspendedLoss,           // F-01
    })
  }, [
    filingStatus, w2Income, w2Withheld, estPaid, dependents, ytdMode, ytdMonth,
    stGain, ltGain, interest, dividends, qualDividends, unrecap1250, collectibles, form4797, nonrecap1231,
    isREP, isActiveParticipant, priorPAL,
    rentalAggregationElection,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, useItemized, itemizedAmt, saltAmount,
    mortgageInt, charitableContr, medicalAmt,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI,
    priorSuspendedLoss,
  ])

  const buildRecord = useCallback(() => {
    const existing = readUserRecords()
    // F-FUNC-02: upsert the loaded record in place rather than forking a new id
    // on every Step-2 save (mirrors CalculateTaxInner.handleSaveRecord).
    const activeId    = readActiveRecordId()
    const existingIdx = activeId != null
      ? existing.findIndex(r => String(r.id) === String(activeId))
      : -1
    const priorName   = existingIdx >= 0 ? (existing[existingIdx].name || null) : null
    const recordId    = existingIdx >= 0 ? existing[existingIdx].id : Date.now()
    const record = {
      id: recordId,
      name: priorName,
      savedAt: formatTimestamp(new Date()),
      taxYear,
      entities: Array.isArray(entities) ? entities : [],
      k1Income: sessionK1 || 0,
      filingStatus, dependents, w2Income, w2Withheld, estPaid,
      quarterly: result?.quarterlyRecommended || 0,
      totalTax:  result?.totalTax || 0,
      biz: {
        entityType:        entities?.[0]?.type || 'S Corporation',
        year:              taxYear,
        ownershipPct:      entities?.[0]?.own || '100',
        grossRevenue:      String(nf(entities?.[0]?.pnl?.grossRevenue) || 0),
        operatingExpenses: String(nf(entities?.[0]?.pnl?.totalExpenses) || 0),
        officerSalary:     String(nf(entities?.[0]?.pnl?.officerSalary) || 0),
        depreciation:      String(nf(entities?.[0]?.pnl?.depreciation) || 0),
        pnl:               entities?.[0]?.pnl || {},
      },
      f1040: {
        filingStatus, w2Income, w2Withheld, estPaid, dependents, ytdMode, ytdMonth,
        stGain, capitalGains: ltGain, ltGain,
        interest, dividends, qualDividends, qualifiedDividends: qualDividends,
        unrecap1250, collectiblesGain: collectibles, form4797, nonrecap1231,
        isREP, isActiveParticipant,
        priorPassiveLossCarryforward: priorPAL,
        rentalAggregationElection,   // F6 (§1.469-9(g) election)
        selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
        nolCarryforward, priorYearLosses: priorYearQBILoss,
        useItemized, itemizedAmt, saltAmount, hasISO, isoBargainElement,
        priorYearTax, priorYearAGI,
      },
      totalSuspendedLoss: result?.totalSuspendedLoss || 0,
      entityBasisResults: result?.entityBasisResults || [],
    }
    return record
  }, [
    taxYear, entities, sessionK1, filingStatus, dependents,
    w2Income, w2Withheld, estPaid, ytdMode, ytdMonth,
    stGain, ltGain, interest, dividends, qualDividends,
    unrecap1250, collectibles, form4797, nonrecap1231,
    isREP, isActiveParticipant, priorPAL,
    rentalAggregationElection,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, useItemized, itemizedAmt, saltAmount,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI, result,
  ])

  const handleSave = useCallback(async () => {
    if (saveStatus === 'saving') return
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const record = buildRecord()
      await syncRecordToServer(record)
      writeActiveRecord(record.id, record.name || record.savedAt)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      console.error('TaxReturn handleSave error:', err)
      setSaveStatus('error')
      setSaveError('Save failed — please try again.')
      setTimeout(() => { setSaveStatus('idle'); setSaveError(null) }, 5000)
    }
  }, [saveStatus, buildRecord])

  const handleSaveAndAnalyze = useCallback(async () => {
    if (analyzeStatus === 'saving') return
    setAnalyzeStatus('saving')
    setSaveError(null)
    try {
      const record = buildRecord()
      await syncRecordToServer(record)
      writeActiveRecord(record.id, record.name || record.savedAt)
      setAnalyzeStatus('idle')
      navigate('/ai-analysis', { state: { record } })
    } catch (err) {
      console.error('TaxReturn handleSaveAndAnalyze error:', err)
      setAnalyzeStatus('error')
      setSaveError('Save failed — could not navigate to analysis. Please try again.')
      setTimeout(() => { setAnalyzeStatus('idle'); setSaveError(null) }, 5000)
    }
  }, [analyzeStatus, buildRecord, navigate])

  const stdDed      = getStdDed(taxYear, filingStatus)
  const hasResult   = !!result && result.totalTax >= 0
  const entityList  = Array.isArray(entities) ? entities : []

  // F11 FIX (UX audit): recalculation is instant but was silent — the headline
  // number just swapped values with no cue, so users (especially with the panel now
  // pinned) could miss that their edit changed the result. When the estimated tax
  // changes, briefly flash the number and show an up/down delta chip so cause-and-
  // effect is unmistakable. The ref seeds on first result without flashing.
  const [taxFlash, setTaxFlash] = useState(0) // 0 none, 1 up (more tax), -1 down
  const [taxDelta, setTaxDelta] = useState(0)
  const prevTotalTaxRef = useRef(null)
  useEffect(() => {
    if (!hasResult) return
    const cur = result.totalTax
    const prev = prevTotalTaxRef.current
    prevTotalTaxRef.current = cur
    if (prev === null || prev === cur) return
    setTaxDelta(cur - prev)
    setTaxFlash(cur > prev ? 1 : -1)
    const t = setTimeout(() => setTaxFlash(0), 1100)
    return () => clearTimeout(t)
  }, [result?.totalTax, hasResult])

  const displayItemizedTotal = nonMedicalSubTotal + (result?.deductibleMedical ?? 0)
  const medicalWasFloored    = nf(medicalAmt) > 0 && (result?.deductibleMedical ?? 0) < nf(medicalAmt)

  const step1Rentals       = entityList.filter(e => e && isRealEstateEntity(e.type))
  const hasStep1Rental     = step1Rentals.length > 0
  const k1Entities         = entityList.filter(e => e && !isRealEstateEntity(e.type))
  // Combined net of all Step-1 rentals (for display/notes only; the engine recomputes).
  const step1RentalNetUI   = step1Rentals.reduce((s, e) => {
    const pnl = e.pnl || {}
    const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
    return s + Math.round(net * (ownPct(e.own) / 100)) - nf(e.box11_12) - nf(e.box12_13)
  }, 0)

  // C-10 FIX: the engine now applies the §1366(d) limit conservatively
  // (assumeZeroBasisOnLoss), suspending an S-Corp/partnership loss when no basis has
  // been entered. Drive the "enter your basis" prompt off the engine result so it
  // reflects the amount actually suspended and works regardless of entity shape (the
  // prior version read e.pnl.netProfit, which the flat Step-1 entity shape lacks, so the
  // prompt never fired). basisAssumedZero marks losses suspended *only* because no Form
  // 7203 basis was entered — entering basis can release some or all of them.
  const assumedZeroBasisSuspended = (result?.entityBasisResults || []).reduce(
    (s, r) => s + (r && r.basisAssumedZero ? Math.abs(r.suspended || 0) : 0), 0
  )

  // Safe Harbor status — sourced from the engine (single source of truth for the
  // 90%-current-year vs. 100%/110%-prior-year rule). See calcTaxReturn in taxCalc.js.
  const priorYearTaxNum = nf(priorYearTax)
  const priorYearAGINum = nf(priorYearAGI)
  const isHighIncome = (result?.priorYearMultiplier ?? 1) > 1
  const safeHarborMinimumLocal = result?.safeHarborMinimum ?? 0
  const totalPaymentsLocal = nf(w2Withheld) + nf(estPaid)
  const safeHarborGap = priorYearTaxNum > 0
    ? safeHarborMinimumLocal - totalPaymentsLocal
    : null
  const safeHarborMet = safeHarborGap !== null && safeHarborGap <= 0

  const NEXT_DUE_DATES = {
    2024: ['Apr 15, 2024', 'Jun 17, 2024', 'Sep 16, 2024', 'Jan 15, 2025'],
    2025: ['Apr 15, 2025', 'Jun 16, 2025', 'Sep 15, 2025', 'Jan 15, 2026'],
    2026: ['Apr 15, 2026', 'Jun 15, 2026', 'Sep 15, 2026', 'Jan 15, 2027'],
  }
  const getNextDueDate = () => {
    const dates = NEXT_DUE_DATES[taxYear] || NEXT_DUE_DATES[2025]
    const today = new Date()
    for (const d of dates) {
      if (new Date(d) > today) return d
    }
    return dates[dates.length - 1]
  }

  const YEARS = SUPPORTED_TAX_YEARS
  const ESTIMATE_DUE_DATES = {
    2024: 'Apr 15, 2024 · Jun 17, 2024 · Sep 16, 2024 · Jan 15, 2025',
    2025: 'Apr 15, 2025 · Jun 16, 2025 · Sep 15, 2025 · Jan 15, 2026',
    2026: 'Apr 15, 2026 · Jun 15, 2026 · Sep 15, 2026 · Jan 15, 2027',
  }
  const FS_OPTIONS = [
    { value: 'single', label: 'Single' },
    { value: 'mfj',    label: 'Married Filing Jointly' },
    { value: 'mfs',    label: 'Married Filing Separately' },
    { value: 'hoh',    label: 'Head of Household' },
    { value: 'qss',    label: 'Qualifying Surviving Spouse' },
  ]

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 719px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const inputLbl = { fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }
  const inpWrap  = { marginBottom: 14 }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, overflowX: 'auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="30" height="30" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill={N}/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {[
              { n: 1, label: 'Entities', active: false, done: true  },
              { n: 2, label: 'Return',   active: true,  done: false },
              { n: 3, label: STEP3_LABEL, active: false, done: false },
            ].map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.done ? G : s.active ? B : '#E2E8F0', color: s.done || s.active ? '#fff' : '#94A3B8', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.done ? '✓' : s.n}
                  </div>
                  {s.n === 3 ? (
                    <button
                      onClick={handleSaveAndAnalyze}
                      disabled={analyzeStatus === 'saving'}
                      title="Save and go to AI Analysis & Reporting"
                      style={{
                        fontSize: 11, fontWeight: 700, color: analyzeStatus === 'saving' ? '#94A3B8' : B,
                        background: 'none', border: 'none', cursor: analyzeStatus === 'saving' ? 'default' : 'pointer',
                        padding: 0, fontFamily: 'inherit', whiteSpace: 'nowrap',
                        textDecoration: 'underline', textUnderlineOffset: 2,
                      }}
                    >
                      {analyzeStatus === 'saving' ? 'Saving…' : 'AI Analysis'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: s.active ? 700 : 500, color: s.active ? N : s.done ? G : '#94A3B8', whiteSpace: 'nowrap' }}>{s.label}</span>
                  )}
                </div>
                {i < 2 && <span style={{ color: '#CBD5E1', fontSize: 12 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/calculate-tax')} style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>← Back to Business</button>
          <button onClick={() => navigate('/dashboard')}     style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Dashboard</button>
          <button onClick={() => navigate('/ai-analysis')}  style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: isPro() ? SL : '#94A3B8', fontWeight: 600 }}>{STEP3_LABEL}{!isPro() ? ' 🔒' : ''}</button>
          <button onClick={() => signOut(navigate)}         style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Sign Out</button>
          <button onClick={() => navigate('/settings')}     style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Settings</button>
        </div>
      </nav>

      {/* F16 FIX (UX audit): on mobile the full liability panel stacks BELOW the entire
          form (single-column reflow), so the live tax number was off-screen while the
          user typed income at the top. This compact summary sticks just under the nav on
          mobile so the estimated liability + effective rate stay visible during input.
          Desktop keeps the full sticky panel in the right column (Finding 3, already in
          place at the liability card below). */}
      {isMobile && hasResult && (
        <div style={{
          position: 'sticky', top: 58, zIndex: 90,
          background: N, color: '#fff',
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 2px 10px rgba(13,27,62,0.25)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', opacity: 0.65 }}>{FINANCIAL_LABELS.estTotalFederalTax}</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            {taxFlash !== 0 && taxDelta !== 0 && (
              <span style={{ fontSize: 12, fontWeight: 800, color: taxFlash === 1 ? '#FCA5A5' : '#86EFAC' }}>
                {taxFlash === 1 ? '▲' : '▼'} {fmt(Math.abs(taxDelta))}
              </span>
            )}
            <span style={{
              fontSize: 19, fontWeight: 900, lineHeight: 1,
              transition: 'text-shadow 0.25s ease',
              textShadow: taxFlash === 1 ? '0 0 14px rgba(252,165,165,0.95)' : taxFlash === -1 ? '0 0 14px rgba(134,239,172,0.95)' : 'none',
            }}>{fmt(result.totalTax)}</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{pct(effectiveRate(result.totalTax, result.agi))} eff.</span>
          </span>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '20px 14px 80px' : '32px 20px 100px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: isMobile ? 16 : 24, alignItems: 'start' }}>

        {/* ── LEFT: Input form ────────────────────────────────────────────── */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 6px' }}>Personal Tax Return</h1>
          <p style={{ color: SL, fontSize: 13, margin: '0 0 20px' }}>
            Income from your Step 1 entities flows automatically. Add personal income, deductions, and withholding to see your complete estimated federal tax liability.
          </p>

          {/* Year + Filing Status */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={inputLbl}>Tax Year</label>
                <select aria-label="Tax year" value={taxYear} onChange={e => { const y = parseInt(e.target.value); setTaxYear(y); writeTaxYear(y) }}
                  style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, fontFamily: 'inherit', outline: 'none' }}>
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y === 2026 ? '2026 (OBBBA — TCJA Extended)' : String(y)}</option>
                  ))}
                </select>
                {taxYear === 2026 && (
                  <div role="note" style={{ marginTop: 6, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#78350F', lineHeight: 1.5 }}>
                    <strong>⚠ OBBBA provisions apply (P.L. 119-21).</strong> Some thresholds may differ from final Treasury regulations, which are still pending. Use 2026 for forward planning only — confirm key figures before filing.
                  </div>
                )}
                {taxYear === 2026 && (
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>
                    One Big Beautiful Budget Act (OBBBA), P.L. 119-21 — TCJA permanently extended. Key 2026 changes: SALT cap raised to $40,400 · Standard deduction increased · §199A $400 minimum QBI deduction added · EBL thresholds adjusted.
                  </div>
                )}
              </div>
              <div>
                <label style={inputLbl}>Filing Status</label>
                <select aria-label="Filing status" value={filingStatus} onChange={e => setFilingStatus(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, fontFamily: 'inherit', outline: 'none' }}>
                  {FS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* K-1 income summary (read-only from Step 1) */}
          {entityList.length > 0 && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', letterSpacing: '0.5px', marginBottom: 8 }}>FROM STEP 1 — BUSINESS ENTITIES</div>
              {k1Entities.map((e, i) => {
                const pnl = e.pnl || {}
                const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
                const own = ownPct(e.own) / 100
                const k1  = Math.round(net * own) - (nf(e.box11_12)) - (nf(e.box12_13))
                return (
                  <div key={'k1' + i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: i < k1Entities.length - 1 ? '1px solid #BFDBFE' : 'none' }}>
                    <span style={{ color: '#1D4ED8' }}>{e.name || e.type} ({e.own || 100}%)</span>
                    <span style={{ fontWeight: 700, color: k1 >= 0 ? '#1D4ED8' : R }}>{fmt(k1)}</span>
                  </div>
                )
              })}
              {k1Entities.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', fontSize: 13, fontWeight: 700, borderTop: '1px solid #BFDBFE', marginTop: 4 }}>
                  <span style={{ color: '#1D4ED8' }}>Total K-1</span>
                  <span style={{ color: '#1D4ED8' }}>{fmt(k1Entities.reduce((s, e) => {
                    const pnl = e.pnl || {}
                    const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
                    return s + Math.round(net * (ownPct(e.own) / 100)) - nf(e.box11_12) - nf(e.box12_13)
                  }, 0))}</span>
                </div>
              )}

              {hasStep1Rental && (
                <div style={{ marginTop: k1Entities.length > 0 ? 10 : 0, paddingTop: k1Entities.length > 0 ? 10 : 0, borderTop: k1Entities.length > 0 ? '1px dashed #BFDBFE' : 'none' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: PURPLE, letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    RENTAL REAL ESTATE (SCHEDULE E) — §469
                    <InfoTip wide text={'Schedule E rentals you own directly. Rental income from a partnership or LLC comes through on a K-1 — add that as a business entity above, not here.\n\nRentals are passive by default. As a real estate professional you make the whole portfolio nonpassive by making the §1.469-9(g) aggregation election on the rental card in Step 1.'} />
                  </div>
                  {step1Rentals.map((e, i) => {
                    const pnl = e.pnl || {}
                    const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
                    const own = ownPct(e.own) / 100
                    const reNet = Math.round(net * own) - nf(e.box11_12) - nf(e.box12_13)
                    // Nonpassive only when a REP has made the §1.469-9(g) aggregation
                    // election; otherwise passive (the §469(a) default).
                    const isRepHere  = e.isREP || isREP
                    const nonpassive = rentalAggregationElection === true && isRepHere
                    const status = reNet >= 0
                      ? 'income'
                      : nonpassive ? 'Nonpassive (elected)'
                      : isRepHere ? 'Passive · election not made'
                      : e.isActiveParticipant ? 'Passive · §469(i)'
                      : 'Passive · suspended'
                    return (
                      <div key={'re' + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 13 }}>
                        <span style={{ color: '#6D28D9' }}>
                          {e.name || 'Rental'} ({e.own || 100}%)
                          {reNet < 0 && <span style={{ fontSize: 10, color: nonpassive ? G : '#92400E', marginLeft: 6, fontWeight: 600 }}>{status}</span>}
                        </span>
                        <span style={{ fontWeight: 700, color: reNet >= 0 ? '#6D28D9' : R }}>{fmt(reNet)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* F6: one-time migration prompt for a saved REP return predating the
              participation questions. */}
          {showRepMigration && (
            <div role="alert" style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: '#5B21B6', lineHeight: 1.55 }}>
              <strong>One quick confirmation needed.</strong> This saved return has Real Estate Professional
              status, but the per-property material-participation questions are new. Until you confirm
              participation on each rental (or make the §1.469-9(g) aggregation election below), those
              rentals are treated as passive — the safe default. Your previously-deductible losses may show
              as suspended until you answer.
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setShowRepMigration(false)} style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Got it — I&apos;ll review below</button>
              </div>
            </div>
          )}

          {/* Migration: orphaned portfolio prior-PAL from a pre-consolidation save. The value
              is preserved in the calc via the fallback above; this prompts re-attribution to a
              specific rental card so it isn't stranded in personal context. */}
          {showPriorPALMigration && (
            <div role="alert" style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: '#5B21B6', lineHeight: 1.55 }}>
              <strong>Prior passive-loss carryforward moved.</strong> Your saved return has a
              prior-year passive-loss carryforward (Form 8582) of {fmt(orphanedPriorPAL)} that
              used to be entered here. It now belongs on the specific rental property it came from,
              on the rental card in Step&nbsp;1. We&apos;re still applying it for now, but please
              re-enter it on the right property so it stays attributed correctly.
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setShowPriorPALMigration(false)} style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Got it</button>
              </div>
            </div>
          )}

          {/* W-2 Income & Withholding */}
          <CollapsibleSection
            title="W-2 Income & Withholding"
            defaultOpen
            badge={nf(w2Income) > 0 ? fmt(nf(w2Income)) : undefined}
            style={{ position: 'relative', zIndex: 10 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <IncomeField
                  id="tr-w2-income"
                  label="W-2 Income (Other Employers)"
                  value={w2Income}
                  onChange={setW2Income}
                  placeholder="0"
                  onClick={e => e.stopPropagation()}
                  tip={
                    <InfoTip text="Enter W-2 wages from employers OTHER than the business entity you entered in Step 1. Your S-Corp officer salary already flows from Step 1 — do not re-enter it here. If you also work a W-2 job at a separate company, enter those wages here." />
                  }
                />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-w2-withheld" style={inputLbl}>
                  Federal Tax Withheld (W-2 Box 2)
                  <InfoTip text="Federal income tax withheld from your W-2 Box 2. This reduces your balance due. Also include withholding from pension / annuity income (Form 1099-R Box 4) if applicable." />
                </label>
                <MoneyInput
                  id="tr-w2-withheld"
                  value={w2Withheld}
                  onChange={setW2Withheld}
                  placeholder="0"
                  nonNegative
                  onClick={e => e.stopPropagation()}
                />
              </div>
            </div>
            {entityList.some(e => /s.?corp/i.test(e?.type || '')) && (
              <div style={{ marginTop: 10, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
                💡 <strong>S-Corp owner:</strong> If you paid yourself a W-2 salary in Step 1, enter the federal income tax withheld here (W-2 Box 2). FICA taxes (Boxes 4 and 6) are separate — don&apos;t include those here.
              </div>
            )}
          </CollapsibleSection>

          {/* YTD mode */}
          <div style={{ background: ytdMode ? '#EFF6FF' : '#fff', border: `1px solid ${ytdMode ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 12, padding: '14px 18px', marginBottom: 12, transition: 'background 0.2s, border-color 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: N }}>
                  📅 Planning Mid-Year?
                  <InfoTip text={'Year-to-date mode: enter income and expenses as of today and we\'ll annualize to project your full-year liability.\n\nEnter the income you have earned so far this year (Jan 1 – the month you select). TaxStat360 will extrapolate to a full 12-month figure automatically.\n\nDisable to enter full-year figures directly.'} />
                </span>
                {!ytdMode && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Enable YTD Mode to annualize your income for a full-year projection</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {ytdMode && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span style={{ fontSize: 10, color: '#1D4ED8', fontWeight: 600 }}>Income earned through:</span>
                    <select aria-label="Income earned through (month)" value={ytdMonth} onChange={e => setYtdMonth(parseInt(e.target.value))}
                      style={{ padding: '6px 10px', border: '1.5px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: N, outline: 'none' }}>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div onClick={() => setYtdMode(m => !m)} style={{ width: 44, height: 24, background: ytdMode ? B : '#CBD5E1', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 3, left: ytdMode ? 23 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            </div>

            {ytdMode && (
              <div style={{ marginTop: 12, background: '#fff', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 12, color: '#1D4ED8', fontWeight: 600, marginBottom: 6 }}>
                  📅 YTD through {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ytdMonth-1]}
                </div>
                <div style={{ fontSize: 12, color: SL, marginBottom: 4 }}>
                  Your figures will be multiplied by <strong style={{ color: N }}>{ytdFactor.toFixed(2)}×</strong> to project a full 12-month year
                  ({ytdMonth} month{ytdMonth !== 1 ? 's' : ''} → 12 months).
                </div>
                {projectedAnnualIncome > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid #BFDBFE' }}>
                    <span style={{ fontSize: 12, color: SL }}>
                      Projected full-year income (K-1 + W-2)
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: N }}>
                      {fmt(projectedAnnualIncome)}
                    </span>
                  </div>
                )}
                {projectedAnnualIncome === 0 && (
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
                    Enter W-2 income above or add an entity in Step 1 to see the projected full-year total.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dependents + estimated payments */}
          <CollapsibleSection title="Dependents, Federal Withholding & Estimated Payments" defaultOpen>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Qualifying Dependents
                  <InfoTip text="Dependents qualifying for the Child Tax Credit (under 17 as of 12/31 of tax year). Each generates up to $2,000–$2,200 CTC (2025–2026). The credit phases out above $400K (MFJ) or $200K (all others)." />
                </label>
                <input type="number" min="0" max="20" aria-label="Qualifying dependents" value={dependents} onChange={e => setDependents(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: N, boxSizing: 'border-box' }} />
              </div>
              <div style={inpWrap}>
                <IncomeField
                  id="tr-est-paid"
                  label="Estimated Tax Payments Made"
                  value={estPaid}
                  onChange={setEstPaid}
                  placeholder="0"
                  tip={
                    <InfoTip text="Total federal estimated tax payments made for this tax year (Form 1040-ES, Quarters 1–4). Do NOT include your W-2 withholding — that goes in the field above. Due dates: Apr 15, Jun 15, Sep 15, Jan 15." />
                  }
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* S-Corp basis carryforwards */}
          {Array.isArray(entities) && entities.some(e => isSCorpEntity(e.type)) && (
            <CollapsibleSection title="S-Corp Stock & Debt Basis" subtitle="Form 7203 · limits how much loss you can deduct" defaultOpen={false}>
              <div style={{ padding: '8px 0' }}>
                <div style={inpWrap}>
                  <label htmlFor="tr-prior-suspended-loss" style={inputLbl}>
                    Prior-Year S-Corp Suspended Loss Carryforward (Form 7203 Part III)
                    <InfoTip text={'If S-Corp losses were suspended in a prior year due to insufficient stock + debt basis (§1366(d)), enter the total carried forward here.\n\nReported on Form 7203, Part III, column (e).\n\nLeave blank if first year or no prior suspended loss exists.\n\nIRC §1366(d)(1)–(2) · Treas. Reg. §1.1366-2 · Form 7203 Part III col. (e)'} wide />
                  </label>
                  <MoneyInput id="tr-prior-suspended-loss" value={priorSuspendedLoss} onChange={setPriorSuspendedLoss} placeholder="0" nonNegative />
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Capital gains & investment */}
          {/* F-FUNC-01: auto-expand when the section holds any non-zero investment-income
              value so a loaded record never hides material figures behind a collapsed
              header (the audit's "data is hidden from view" concern). Pairs with the
              full-f1040 hydration in Dashboard.loadRecord. */}
          <CollapsibleSection title="Capital Gains & Investment Income" subtitle="Stocks, interest, dividends · Schedule D / B" defaultOpen={nf(ltGain) > 0 || nf(stGain) > 0 || nf(interest) > 0 || nf(dividends) > 0 || nf(qualDividends) > 0 || nf(form4797) > 0 || nf(unrecap1250) > 0 || nf(collectibles) > 0} badge={nf(ltGain) > 0 || nf(stGain) > 0 || nf(interest) > 0 ? 'Schedule D' : undefined} accent="#0891B2">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label htmlFor="tr-st-gain" style={inputLbl}>Short-Term Capital Gains (or losses)</label>
                <MoneyInput id="tr-st-gain" value={stGain} onChange={setStGain} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-lt-gain" style={inputLbl}>
                  Long-Term Capital Gains (or losses)
                  <InfoTip text="Net long-term capital gains on assets held more than 1 year. Taxed at 0%, 15%, or 20% depending on taxable income — not at ordinary rates." />
                </label>
                <MoneyInput id="tr-lt-gain" value={ltGain} onChange={setLtGain} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-interest" style={inputLbl}>Interest Income (Schedule B)</label>
                <MoneyInput id="tr-interest" value={interest} onChange={setInterest} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-dividends" style={inputLbl}>Ordinary Dividends</label>
                <MoneyInput id="tr-dividends" value={dividends} onChange={setDividends} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-qual-div" style={inputLbl}>
                  Qualified Dividends (Form 1099-DIV Box 1b)
                  <InfoTip text="Qualified dividends are taxed at long-term capital gains rates (0/15/20%). Must be a subset of ordinary dividends — cannot exceed total dividends entered above." />
                </label>
                <MoneyInput id="tr-qual-div" value={qualDividends} onChange={setQualDividends} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-form4797" style={inputLbl}>
                  Form 4797 Gains (§1231)
                  <InfoTip text={'Enter your NET §1231 result for the year (from Form 4797, or the net §1231 gain/loss line of your partnership or S-corp K-1).\n\nA net §1231 GAIN is treated as long-term capital gain — taxed at 0/15/20%, not ordinary rates. Enter it as a positive number.\n\nA net §1231 LOSS is ordinary and reduces your ordinary income. Enter it as a negative number.\n\nDo NOT enter ordinary depreciation recapture here. §1245 recapture is ordinary income, and the depreciation portion of a real-property gain goes in the "Unrecaptured §1250 Gain" field below.'} wide />
                </label>
                <MoneyInput id="tr-form4797" value={form4797} onChange={setForm4797} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-nonrecap1231" style={inputLbl}>
                  Nonrecaptured Net §1231 Losses (prior 5 yrs)
                  <InfoTip text={'§1231(c) 5-year lookback. Enter your net §1231 LOSSES from the prior five tax years that have not yet been recaptured (Form 4797, Line 8).\\n\\nA net §1231 GAIN this year is recharacterized as ORDINARY income — not long-term capital gain — to the extent of these prior losses (IRC §1231(c)(1)). Only the gain in excess of the prior losses keeps 0/15/20% capital-gain treatment.\\n\\nLeave blank (0) if you have no nonrecaptured §1231 losses in the prior five years. This field only affects a year with a net §1231 gain.'} wide />
                </label>
                <MoneyInput id="tr-nonrecap1231" value={nonrecap1231} onChange={setNonrecap1231} placeholder="0" nonNegative />
                {(result?.ordinary1231Recapture || 0) > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#1E3A8A', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                    §1231(c): {fmt(result.ordinary1231Recapture)} of your §1231 gain is recharacterized as <strong>ordinary income</strong> (taxed at ordinary rates, not 0/15/20%) because of nonrecaptured §1231 losses in the prior five years. IRC §1231(c)(1).
                  </div>
                )}
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-unrec1250" style={inputLbl}>
                  Unrecaptured §1250 Gain
                  <InfoTip text="Depreciation recapture on real property sold at a gain. Taxed at max 25% (lesser of 25% or ordinary rate). This is the accumulated depreciation portion of your gain on real property sales." />
                </label>
                <MoneyInput id="tr-unrec1250" value={unrecap1250} onChange={setUnrecap1250} placeholder="0" nonNegative />
                {(parseFloat(String(form4797).replace(/,/g,'')) || 0) > 0 && (parseFloat(String(unrecap1250).replace(/,/g,'')) || 0) === 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                    ⚠ You entered a Form 4797 gain. If this included <strong>depreciable real property</strong>, enter accumulated straight-line depreciation here — that amount is taxed at up to 25%, not 20%. Schedule D Unrecaptured §1250 Worksheet · IRC §1(h)(1)(E).
                  </div>
                )}
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-collectibles" style={inputLbl}>
                  Collectibles Gain (Art, Coins, Stamps)
                  <InfoTip text="Gain from the sale of collectibles held more than 1 year — including coins, art, antiques, gems, and stamps (IRC §1(h)(4)). Taxed at a maximum 28% rate. Enter your net gain from Schedule D." />
                </label>
                <MoneyInput id="tr-collectibles" value={collectibles} onChange={setCollectibles} placeholder="0" nonNegative />
              </div>
            </div>
          </CollapsibleSection>

          {/* Deductions & adjustments */}
          <CollapsibleSection title="Above-the-Line Deductions" subtitle="HSA, SE health & retirement, student-loan interest · Schedule 1">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label htmlFor="tr-health-ins" style={inputLbl}>
                  Self-Employed Health Insurance Premiums
                  <InfoTip text={"Premiums for health, dental, and long-term care insurance for yourself and family. 100% deductible on Form 1040 Schedule 1 Line 17 if the plan is established in the business name.\n\nS-Corp shareholders (>2% ownership): Your premiums must first be included in your W-2 Box 1 wages by the S-Corp (IRC §1372 / Rev. Rul. 91-26). Enter the W-2-grossed-up premium amount here.\n\nSole proprietors and partners: Enter premiums paid directly. Cannot exceed your net self-employment income."} />
                </label>
                <MoneyInput id="tr-health-ins" value={selfEmpHealthIns} onChange={setSelfEmpHealthIns} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-hsa" style={inputLbl}>
                  HSA Deduction (Form 8889)
                  <InfoTip text="Health Savings Account contributions — deductible if you have a qualifying High-Deductible Health Plan. 2025 limits: $4,300 (self-only) / $8,550 (family). Grows tax-free; withdrawals for medical expenses are always tax-free." />
                </label>
                <MoneyInput id="tr-hsa" value={hsaDeduction} onChange={setHsaDeduction} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-student-loan" style={inputLbl}>
                  Student Loan Interest
                  <InfoTip text="Up to $2,500 deductible above-the-line. Phases out at $75,000–$90,000 (single) / $155,000–$185,000 (MFJ) for 2025. Cannot be claimed MFS." />
                </label>
                <MoneyInput id="tr-student-loan" value={studentLoanInt} onChange={setStudentLoanInt} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-retirement" style={inputLbl}>
                  Self-Employed Retirement Plan Contributions (Schedule 1, Line 16)
                  <InfoTip text={'Enter employer contributions made to a SEP-IRA or Solo 401(k) for this tax year.\n\nFor S-Corp owners: contributions must be based on your officer W-2 salary — NOT K-1 distributions (IRC §402(h); §415(c); IRS Pub. 560).\n• SEP-IRA: up to 25% of W-2 salary, max $70,000 (2025)\n• Solo 401(k) employer: up to 25% of W-2 salary\n\nFor sole proprietors: enter approx. 20% of net self-employment income, max $70,000.'} wide />
                </label>
                <MoneyInput id="tr-retirement" value={selfEmpRetirement} onChange={setSelfEmpRetirement} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-nol" style={inputLbl}>
                  NOL Carryforward (IRC §172)
                  <InfoTip text="Post-2017 NOL carryforwards are limited to 80% of taxable income per IRC §172(a)(2) (TCJA; retained by OBBBA). Enter your total available NOL carryforward — TaxStat360 applies the 80% cap automatically." />
                </label>
                <MoneyInput id="tr-nol" value={nolCarryforward} onChange={setNolCarryforward} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-qbi-loss" style={inputLbl}>
                  Prior Year QBI Loss Carryforward (pooled — use entity panel for multi-entity)
                  <InfoTip text="If your business generated a net QBI loss last year, that loss reduces your §199A QBI deduction in the CURRENT year (IRC §199A(c)(2)).\n\nFor a single entity: enter the absolute value of last year's QBI loss here.\n\nFor multiple entities: enter the per-entity carryforward in each entity's §199A panel in Step 1 (Form 8995 line 3). Per-entity tracking is required by Treas. Reg. §1.199A-1(d)(2)(iii). When per-entity values are entered, this pooled field is ignored." />
                </label>
                <MoneyInput id="tr-qbi-loss" value={priorYearQBILoss} onChange={setPriorYearQBILoss} placeholder="0" nonNegative />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input type="checkbox" id="itemized" checked={useItemized} onChange={e => setUseItemized(e.target.checked)} />
                <label htmlFor="itemized" style={{ fontSize: 13, color: N, cursor: 'pointer' }}>
                  Use itemized deductions (Schedule A)
                  <InfoTip text={`Standard deduction for ${taxYear}: ${fmt(stdDed)} (${FS_OPTIONS.find(f => f.value === filingStatus)?.label || filingStatus}). Only itemize if your deductible expenses exceed this amount.`} />
                </label>
              </div>
              {useItemized && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 600, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 7, padding: '7px 10px' }}>
                    Enter your Schedule A line items below — TaxStat360 totals them automatically. Or skip sub-fields and enter your total directly.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={inpWrap}>
                      <label style={inputLbl}>
                        Mortgage Interest (Schedule A Line 8)
                        <InfoTip text="Home mortgage interest paid on your primary and/or second home (Form 1098). Deductible on acquisition debt up to $750K ($1M if pre-Dec 2017 loan)." />
                      </label>
                      <MoneyInput ariaLabel="Mortgage Interest (Schedule A Line 8)" value={mortgageInt} onChange={setMortgageInt} placeholder="0" nonNegative />
                    </div>
                    <div style={inpWrap}>
                      <label style={inputLbl}>
                        Charitable Contributions (Schedule A Line 11-12)
                        <InfoTip text="Cash contributions to qualified 501(c)(3) organizations (Line 11) and non-cash contributions (Line 12). Cash contributions generally limited to 60% of AGI." />
                      </label>
                      <MoneyInput ariaLabel="Charitable Contributions (Schedule A Line 11-12)" value={charitableContr} onChange={setCharitableContr} placeholder="0" nonNegative />
                    </div>
                    <div style={inpWrap}>
                      <label style={inputLbl}>
                        Medical Expenses (Schedule A Line 4)
                        <InfoTip text="Unreimbursed medical and dental expenses exceeding 7.5% of your AGI. Only the amount ABOVE the 7.5% AGI floor is deductible (IRC §213(a)). Enter your total medical expenses paid — TaxStat360 applies the 7.5% AGI floor automatically." />
                      </label>
                      <MoneyInput ariaLabel="Medical Expenses (Schedule A Line 4)" value={medicalAmt} onChange={setMedicalAmt} placeholder="0" nonNegative />
                    </div>
                    <div style={inpWrap}>
                      <label style={inputLbl}>
                        SALT Amount (before cap)
                        <InfoTip text={`State and local taxes (state income tax + property taxes). The SALT deduction is capped at $${(10000).toLocaleString()} for 2024, $40,000 for 2025, and $40,400 for 2026 (OBBBA). Enter your total SALT paid — TaxStat360 applies the cap.`} />
                      </label>
                      <MoneyInput ariaLabel="SALT Amount (before cap)" value={saltAmount} onChange={setSaltAmount} placeholder="0" nonNegative />
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: SL }}>Sub-field total{medicalWasFloored ? ' (medical after 7.5% AGI floor)' : ''}:</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: displayItemizedTotal > stdDed ? G : N }}>{fmt(displayItemizedTotal)}{displayItemizedTotal > stdDed ? ' ✓ exceeds std. ded.' : displayItemizedTotal > 0 ? ` (std. ded. ${fmt(stdDed)} is higher)` : ''}</span>
                    </div>
                    <div style={inpWrap}>
                      <label style={inputLbl}>Or enter total directly (overrides sub-fields if sub-fields are $0)</label>
                      <MoneyInput ariaLabel="Itemized deductions total (overrides sub-fields)" value={itemizedAmt} onChange={setItemizedAmt} placeholder={String(stdDed)} nonNegative />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input type="checkbox" id="iso" checked={hasISO} onChange={e => setHasISO(e.target.checked)} />
                <label htmlFor="iso" style={{ fontSize: 13, color: N, cursor: 'pointer' }}>
                  Exercised ISO stock options this year
                  <InfoTip text="Incentive Stock Option exercise bargain element — the spread between FMV and exercise price at exercise date. This is an AMT preference item (Form 6251, Line 2a). It does NOT appear in ordinary income if you hold the stock, but IS added to your AMT tax base." />
                </label>
              </div>
              {hasISO && (
                <div style={inpWrap}>
                  <label style={inputLbl}>ISO Bargain Element (FMV − Exercise Price × Shares)</label>
                  <MoneyInput ariaLabel="ISO Bargain Element (FMV minus exercise price, times shares)" value={isoBargainElement} onChange={setIsoBargainElement} placeholder="0" nonNegative />
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Safe harbor inputs */}
          <div data-section="safe-harbor">
          <CollapsibleSection title="Avoid Underpayment Penalties" subtitle="Prior-year tax & AGI · safe-harbor test" badge="Optional">
            <p style={{ fontSize: 12, color: SL, margin: '0 0 12px', lineHeight: 1.6 }}>
              Enter prior year figures to calculate your safe harbor payment amount — the minimum you must pay to avoid underpayment penalties. At AGI above $150K (single, HOH, or MFJ) or $75K (MFS only), the safe harbor is 110% of prior year tax. IRC §6654(d)(1)(C)(ii). For 2026 (OBBBA / TCJA extended): TCJA extension did not change safe harbor rules under §6654, but confirm final Treasury guidance with your CPA before relying on these thresholds for penalty avoidance.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label htmlFor="tr-prior-tax" style={inputLbl}>Prior Year Total Tax (Form 1040 Line 24)</label>
                <MoneyInput id="tr-prior-tax" value={priorYearTax} onChange={setPriorYearTax} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-prior-agi" style={inputLbl}>Prior Year AGI (Form 1040 Line 11)</label>
                <MoneyInput id="tr-prior-agi" value={priorYearAGI} onChange={setPriorYearAGI} placeholder="0" nonNegative />
              </div>
            </div>

            {priorYearTaxNum > 0 && (
              <div style={{ marginTop: 4 }}>
                {safeHarborMet ? (
                  <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, color: '#166534', fontSize: 13, marginBottom: 6 }}>
                      ✅ Safe harbor met — no underpayment penalty risk
                    </div>
                    <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
                      Prior year tax: <strong>{fmt(priorYearTaxNum)}</strong>
                      {' '}→ {isHighIncome ? '110%' : '100%'} safe harbor = <strong>{fmt(safeHarborMinimumLocal)}</strong><br />
                      Your payments to date: <strong>{fmt(totalPaymentsLocal)}</strong><br />
                      Surplus: <strong>{fmt(Math.abs(safeHarborGap))}</strong> above the safe harbor threshold
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, color: R, fontSize: 13, marginBottom: 6 }}>
                      ⚠ Safe harbor gap: {fmt(safeHarborGap)} remaining — pay by {getNextDueDate()}
                    </div>
                    <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.7 }}>
                      Prior year tax: <strong>{fmt(priorYearTaxNum)}</strong>
                      {' '}→ {isHighIncome ? '110%' : '100%'} safe harbor = <strong>{fmt(safeHarborMinimumLocal)}</strong><br />
                      Your payments to date: <strong>{fmt(totalPaymentsLocal)}</strong><br />
                      Remaining to meet safe harbor: <strong>{fmt(safeHarborGap)}</strong>
                    </div>
                    {priorYearAGINum === 0 && (
                      <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 6, fontStyle: 'italic' }}>
                        Enter your prior year AGI above to confirm whether the 110% rule applies (AGI {'>'} $150K for single, HOH, and MFJ filers; $75K for MFS only — IRC §6654(d)(1)(C)(ii)).
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
          </div>

        </div>

        {/* ── RIGHT: Results panel ─────────────────────────────────────────── */}
        {/* F3 FIX (UX audit): this column was position:sticky, but it is taller than
            the viewport (card + waterfall + quarterly + notes + save buttons), so the
            headline liability still scrolled off the top while editing lower inputs.
            The column is now normal-flow and ONLY the compact liability card is pinned
            (below), so the number + effective rate stay in view during input. */}
        <div style={{ position: 'relative' }}>

          {/* Main liability card — pinned on desktop so the headline number stays visible
              while the form scrolls (F3). On mobile the sticky summary bar under the nav
              handles this (F16), so the card sits in normal flow. */}
          <div style={{ background: N, borderRadius: 16, padding: '24px', marginBottom: 12, color: '#fff', position: isMobile ? 'static' : 'sticky', top: 70, zIndex: 5 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', opacity: 0.6, marginBottom: 8 }}>{FINANCIAL_LABELS.estTotalFederalTax}</div>
            <div style={{
              fontSize: 42, fontWeight: 900, lineHeight: 1, marginBottom: 4,
              display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
              transition: 'text-shadow 0.25s ease',
              textShadow: taxFlash === 1 ? '0 0 18px rgba(252,165,165,0.9)' : taxFlash === -1 ? '0 0 18px rgba(134,239,172,0.9)' : 'none',
            }}>
              <span>{hasResult ? fmt(result.totalTax) : '—'}</span>
              {taxFlash !== 0 && taxDelta !== 0 && (
                <span aria-live="polite" style={{ fontSize: 15, fontWeight: 800, color: taxFlash === 1 ? '#FCA5A5' : '#86EFAC' }}>
                  {taxFlash === 1 ? '▲' : '▼'} {fmt(Math.abs(taxDelta))}
                </span>
              )}
            </div>
            {ytdMode && hasResult && (
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                Annualized from YTD (× {ytdFactor.toFixed(2)})
              </div>
            )}
            {hasResult && (
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                Effective rate: {pct(effectiveRate(result.totalTax, result.agi))}
              </div>
            )}
          </div>

          {/* C-Corp double-taxation note + planning disclaimer */}
          {hasResult && (result.ccorpCorpTax > 0 || ccorp.count > 0) && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 16px', marginBottom: 12, fontSize: 12.5, color: '#1E3A5F', lineHeight: 1.55 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#1D4ED8' }}>🏢 C-Corporation — double taxation applies</div>
              <div>
                Your C-Corp&apos;s profit (after officer salary and employer payroll tax) is taxed at the corporate level at a flat 21%
                {result.ccorpCorpTax > 0 ? <> (<strong>{fmt(result.ccorpCorpTax)}</strong>)</> : null}, and the remaining after-tax profit
                {result.ccorpDividends > 0 ? <> (<strong>{fmt(result.ccorpDividends)}</strong>)</> : null} is treated as fully distributed and taxed
                <strong> again</strong> as qualified dividends on your personal return. Officer salary is already included in W-2 wages above.
                C-Corp distributions are not qualified business income, so no §199A (QBI) deduction applies to them.
              </div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #BFDBFE', fontSize: 11.5, color: '#475569' }}>
                Planning estimate only. Assumes a single owner-employee and full annual distribution of after-tax profit (no retained-earnings
                strategy), a flat 21% with no graduated/AMT/accumulated-earnings or personal-holding-company layers, and federal tax only.
                Not a substitute for a prepared Form 1120 — have a tax professional validate before relying on these figures.
              </div>
            </div>
          )}

          {/* Empty state */}
          {hasResult && result.agi === 0 && (
            <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#78350F', textAlign: 'center' }}>
              💡 Enter your income above to see your tax estimate. All figures are $0 because no income has been entered yet.
            </div>
          )}

          {/* Waterfall */}
          {hasResult && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px', marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: N, fontSize: 14, marginBottom: 12 }}>Tax Waterfall</div>

              {[
                { label: 'Business K-1 Income',        value: result.scheduleEK1Income ?? (sessionK1 || 0), sign: 1, hide: (result.scheduleEK1Income ?? sessionK1 ?? 0) === 0 },
                { label: 'Schedule C Income',           value: result.scheduleCSEIncome || 0,              sign: 1, hide: !(result.scheduleCSEIncome > 0) },
                { label: 'W-2 Wages',                   value: result.totalW2ForFICA || 0,                sign: 1, hide: !(result.totalW2ForFICA > 0) },
                { label: 'Rental Income (allowed)',      value: result.rentalAllowed ?? step1RentalNetUI, sign: 1, hide: (result.rentalNetCombined ?? step1RentalNetUI) === 0 },
                { label: 'Capital Gains (LT)',          value: nf(ltGain),                                sign: 1, hide: nf(ltGain) === 0 },
                { label: 'Capital Gains (ST)',          value: nf(stGain),                                sign: 1, hide: nf(stGain) === 0 },
                { label: '§1231 Gain (Form 4797)',      value: nf(form4797),                              sign: 1, hide: nf(form4797) === 0,
                  note: nf(form4797) > 0 ? 'Net §1231 gain — taxed at long-term capital-gains rates' : 'Net §1231 loss — ordinary, reduces ordinary income' },
                { label: 'Interest & Dividends',        value: nf(interest) + nf(dividends),             sign: 1, hide: nf(interest) + nf(dividends) === 0 },
                { label: 'Dividends (C-Corp distribution)', value: result.ccorpDividends || 0,            sign: 1, hide: !(result.ccorpDividends > 0), accent: '#2563EB', note: 'After-tax C-Corp profit, distributed and taxed again at qualified-dividend rates' },
                // F-FUNC-06: show the §461(l) excess-business-loss addback as an explicit inline
                // line so the income components above visibly reconcile to AGI. When a business
                // loss exceeds the §461(l) threshold, the disallowed amount is added back to
                // income this year (and carries forward as an NOL); previously it only appeared
                // in a callout below, so the listed rows did not appear to sum to AGI.
                { label: '§461(l) Excess Business Loss Disallowed', value: result.ebl || 0,          sign: 1, hide: !(result.ebl > 0), accent: R, note: 'Disallowed business loss added back this year — carries forward as an NOL (IRC §461(l), §172)' },
                { label: '—', value: 0, divider: true },
                { label: 'AGI',                         value: result.agi,                               sign: 1, bold: true },
                { label: 'Standard Deduction',          value: result.deduction,                         sign: -1 },
                { label: 'SE Tax Deduction (½)',         value: result.halfSE,                            sign: -1, hide: result.halfSE === 0 },
                { label: 'Retirement Contributions',    value: result.selfEmpRetirementDed,              sign: -1, hide: result.selfEmpRetirementDed === 0 },
                { label: 'Health Insurance Ded.',       value: result.selfEmpHealthDed,                  sign: -1, hide: result.selfEmpHealthDed === 0 },
                { label: 'NOL Applied',                 value: result.nolAllowed,                        sign: -1, hide: result.nolAllowed === 0 },
                { label: '—', value: 0, divider: true },
                { label: 'Taxable Income (before QBI)', value: result.taxableBeforeQBI,                  sign: 1 },
                { label: '§199A QBI Deduction',         value: result.qbi,                               sign: -1, hide: result.qbi === 0, accent: '#059669' },
                { label: '—', value: 0, divider: true },
                { label: 'Taxable Income (final)',      value: result.taxableAfterQBI,                   sign: 1, bold: true },
                { label: '—', value: 0, divider: true },
                { label: 'Federal Income Tax',          value: result.fedTax,                            sign: 1 },
                { label: 'SE Tax',                      value: result.seTax,                             sign: 1, hide: result.seTax === 0 },
                { label: 'Employee FICA (payroll)',      value: result.employeeFICA,                      sign: 1, hide: !result.employeeFICA || result.employeeFICA === 0, accent: '#94A3B8', note: 'Withheld via W-2 payroll — not in Balance Due' },
                { label: 'NIIT (Form 8960)',             value: result.niit?.amount || result.niitAmount || 0, sign: 1, hide: !(result.niit?.applies), accent: R },
                { label: 'Addl. Medicare Tax (0.9%)',   value: result.additionalMedicare,                sign: 1, hide: result.additionalMedicare === 0 },
                { label: 'AMT (Form 6251)',              value: result.amt,                               sign: 1, hide: result.amt === 0, accent: R },
                { label: 'Child Tax Credit',            value: result.childCredit,                       sign: -1, hide: result.childCredit === 0, accent: '#059669' },
                { label: '—', value: 0, divider: true },
                { label: 'Corporate Tax (C-Corp, 21%)', value: result.ccorpCorpTax || 0,                 sign: 1, hide: !(result.ccorpCorpTax > 0), accent: R, note: 'Entity-level tax (Form 1120) — paid by the corporation, separate from your 1040 estimates' },
                { label: 'Total Tax',                   value: result.totalTax,                          sign: 1, bold: true },
                { label: 'Withholding & Est. Pmts',     value: result.totalPayments,                     sign: -1, hide: result.totalPayments === 0 },
                { label: '—', value: 0, divider: true },
                { label: result.balance >= 0 ? 'Estimated Balance Due' : 'Estimated Refund', value: Math.abs(result.balance), sign: result.balance >= 0 ? 1 : -1, bold: true, accent: result.balance >= 0 ? R : G },
              ].filter(r => !r.hide).map((row, i) => {
                if (row.divider) return <div key={i} style={{ borderTop: '1px solid #F1F5F9', margin: '6px 0' }} />
                const isSubtraction = row.sign < 0
                const showMinus = isSubtraction ? row.value !== 0 : row.value < 0
                const magnitude = Math.abs(row.value)
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                      <span style={{ color: row.accent || SL, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                      <span style={{ fontWeight: row.bold ? 700 : 500, color: row.accent || N }}>
                        {showMinus ? '−' : ''}{fmt(magnitude)}
                      </span>
                    </div>
                    {row.note && (
                      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 2, paddingLeft: 2 }}>{row.note}</div>
                    )}
                  </div>
                )
              })}

              {assumedZeroBasisSuspended > 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#78350F', lineHeight: 1.55 }}>
                  <strong>⚠ Enter your S-Corp stock basis (§1366(d)).</strong> Because no beginning basis was entered, this estimate has conservatively suspended {fmt(assumedZeroBasisSuspended)} of S-Corp loss — your deductible loss is capped at your combined stock + debt basis. Open the entity in Step 1 and enter your beginning basis (Form 7203, Line 1) to release the portion of this loss your basis supports.
                </div>
              )}

              {result.ebl > 0 && result.eblThreshold > 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#991B1B', lineHeight: 1.55 }}>
                  <strong>⚠ §461(l) EBL:</strong> {fmt(result.ebl)} of business loss is disallowed this year and added back to income — your deductible business loss is limited to the {fmt(result.eblThreshold)} ({filingStatus.toUpperCase()}) threshold.
                  {' '}The disallowed {fmt(result.ebl)} carries forward as a net operating loss (NOL) to next year (IRC §172(a)(2)).
                </div>
              )}

              {result.ebl > 0 && nf(ltGain) > 0 && nf(form4797) === 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#78350F', lineHeight: 1.55 }}>
                  <strong>⚠ Is your {fmt(nf(ltGain))} long-term gain from selling business or rental property?</strong> If so it&apos;s a §1231 gain — move it to the &ldquo;Form 4797 Gains (§1231)&rdquo; field above. §1231 gains offset business losses in the excess-business-loss (§461(l)) calculation.
                </div>
              )}

              {result.nolSurplus > 0 && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#1D4ED8' }}>
                  <strong>NOL carryforward:</strong> {fmt(result.nolSurplus)} remaining (80% of taxable income cap applied per IRC §172(a)(2)).
                </div>
              )}

              {result.qbiCarryforward > 0 && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#1D4ED8', lineHeight: 1.55 }}>
                  <strong>§199A QBI loss carryforward:</strong> {fmt(result.qbiCarryforward)} carries to next year and reduces your future QBI deduction base (IRC §199A(c)(2)).
                </div>
              )}

              {result.qbiAggregationApplied && result.qbiAggregationDisclosure && (
                <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#78350F' }}>
                  <strong>⚠ QBI Aggregation Assumed:</strong> {result.qbiAggregationDisclosure}
                </div>
              )}

              {result.totalSuspendedLoss > 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#991B1B' }}>
                  <strong>⚠ §1366(d) Basis Limit:</strong> {fmt(result.totalSuspendedLoss)} in S-Corp losses suspended — not deductible this year. Carry forward to restore basis.
                  {result.priorSuspendedLossApplied > 0 && <span style={{color:'#166534'}}> ✓ {fmt(result.priorSuspendedLossApplied)} of prior-year suspended loss released this year. Remaining carryforward: {fmt(result.priorSuspendedLossRemaining)}.</span>}
                </div>
              )}

              {result.palSuspendedRental > 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#78350F', lineHeight: 1.55 }}>
                  <strong>⚠ §469 Passive Loss Suspended:</strong> {fmt(result.palSuspendedRental)} of rental loss is passive and suspended this year — it does not reduce your other income. It carries forward on Form 8582.
                  {/* F6: distinguish "unconfirmed" suspension from a confirmed passive result */}
                  {result.rentalIsREP && rentalAggregationElection !== true && step1RentalNetUI < 0 && ' This is suspended because you have not made the §1.469-9(g) aggregation election — check that box on your rental card in Step 1 if you aggregate your hours across all properties and materially participate, to deduct it currently.'}
                  {!result.rentalIsREP && !result.rentalIsActiveParticipant && ' If you materially participate as a real estate professional (§469(c)(7)), set REP status on the rental to deduct it currently.'}
                </div>
              )}
            </div>
          )}

          {/* SE Tax Savings panel */}
          {hasResult && result.ficaSavings > 0 && (
            <div style={{ background: '#0D1B3E', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', letterSpacing: '0.5px', marginBottom: 6 }}>
                SE TAX SAVINGS ON DISTRIBUTIONS
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#4ADE80' }}>
                {fmt(result.ficaSavings)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 1.5 }}>
                Your {fmt(result.k1Distributions || 0)} in K-1 distributions avoid self-employment tax.
                As a sole proprietor, this income would incur SE tax on 92.35% of earnings
                (IRC §1402(a)(12)): ~{fmt(result.ficaSavings)} in avoided SE tax.
              </div>
            </div>
          )}

          {/* Underpayment penalty warning */}
          {hasResult && result.balance > 0 && !nf(priorYearTax) && (
            <div role="alert" aria-live="polite" style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: '#92400E' }}>
              <strong>⚠ Underpayment Penalty Risk (IRC §6654):</strong> You have a balance due but haven&apos;t entered prior year tax. Enter your prior year total tax in{' '}
              <button
                onClick={() => {
                  const el = document.querySelector('[data-section="safe-harbor"]')
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                style={{ background: 'none', border: 'none', color: '#B45309', fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Safe Harbor Inputs below
              </button>{' '}
              to calculate the minimum quarterly payment needed to avoid penalties.
            </div>
          )}

          {/* Quarterly estimates */}
          {hasResult && result.quarterlyRecommended > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: N, fontSize: 14, marginBottom: 10 }}>Quarterly Estimates</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: SL }}>Recommended per quarter</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: N }}>{fmt(result.quarterlyRecommended)}</span>
              </div>
              {result.safeHarborPriorYear != null && (
                <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#1D4ED8' }}>
                  <strong>Safe harbor:</strong> Pay {fmt(result.safeHarborQuarterly)}/qtr (min of 90% current-year or {isHighIncome ? '110%' : '100%'} prior-year tax = {fmt(result.safeHarborMinimum)}) to avoid IRC §6654 penalties.
                </div>
              )}
              <div style={{ fontSize: 11, color: SL, marginTop: 8, lineHeight: 1.5 }}>
                Due: {ESTIMATE_DUE_DATES[taxYear] || 'Apr 15 · Jun 15 · Sep 15 · Jan 15'}
              </div>
            </div>
          )}

          {/* Federal-only notice */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 11, color: SL, textAlign: 'center', lineHeight: 1.5 }}>
            🇺🇸 <strong>Federal income tax only.</strong> State income tax is not included. Add your state&apos;s effective rate separately for a complete liability picture.
          </div>

          {/* Save buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {saveError && (
              <div role="alert" style={{ fontSize: 12, color: R, fontWeight: 600, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px', textAlign: 'center' }}>
                {saveError}
              </div>
            )}
            <div>
              <button
                onClick={handleSaveAndAnalyze}
                disabled={analyzeStatus === 'saving' || saveStatus === 'saving'}
                style={{
                  width: '100%', padding: '13px',
                  background: analyzeStatus === 'saving' ? '#64748B' : N,
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontWeight: 700, fontSize: 14,
                  cursor: analyzeStatus === 'saving' ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {analyzeStatus === 'saving'
                  ? <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Saving…</>
                  : 'Continue to AI Analysis →'
                }
              </button>
              <div style={{ fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                Saves and goes to AI Analysis & Reporting (Step 3)
              </div>
            </div>
            <div>
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving' || analyzeStatus === 'saving'}
                style={{
                  width: '100%', padding: '11px',
                  background: saveStatus === 'saved' ? '#F0FDF4' : saveStatus === 'error' ? '#FEF2F2' : '#fff',
                  color: saveStatus === 'saved' ? G : saveStatus === 'error' ? R : B,
                  border: `1.5px solid ${saveStatus === 'saved' ? G : saveStatus === 'error' ? R : B}`,
                  borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: saveStatus === 'saving' || analyzeStatus === 'saving' ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {saveStatus === 'saving'
                  ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: B, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Saving…</>
                  : saveStatus === 'saved' ? '✓ Saved!'
                  : saveStatus === 'error' ? '⚠ Save Failed — Retry'
                  : 'Save This Record'
                }
              </button>
              {saveStatus === 'idle' && (
                <div style={{ fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                  Saves this record — stays on Step 2
                </div>
              )}
              {saveStatus === 'saved' && (
                <div style={{ fontSize: 10, color: G, textAlign: 'center', marginTop: 4, fontWeight: 600 }}>
                  Record saved to Dashboard
                </div>
              )}
            </div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    </div>
  )
}
