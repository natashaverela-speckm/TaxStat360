// src/TaxReturn.jsx
// Step 2 of the TaxStat360 two-step flow: Personal Tax Return.
// Reads entity / K-1 data from session state (written by CalculateTaxInner.jsx)
// and adds personal income, deductions, and filing info to produce the
// estimated federal tax liability.
//
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import FederalDisclosureBanner from './FederalDisclosureBanner.jsx'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, getStdDed, calcCCorpCorporateLayer, SALT_CAPS, getTable } from '../lib/taxCalc.js'
import {
  readPersonalContext, writePersonalContext,
  readTaxYear, writeTaxYear,
  readStep1State, readUserRecords, syncRecordToServer,
  readActiveRecordId, writeActiveRecord, readActiveRecordName,
  readDirtyFlag, writeDirtyFlag,
} from '../utils/sessionState.js'
import { signOut } from '../utils/SignOut'
// M2 (audit F-05): ARCHITECTURE §5 calculation guard — validated before every
// calcTaxReturn() call below; CalcInputError surfaces as a visible banner.
import { validateCalcInputs, CalcInputError } from '../utils/calcGuard'
import { nf, fmt, effRateLabel, formatTimestamp } from '../utils/money.js'
import { isRealEstateEntity, isSCorpEntity, isCCorpEntity, isScheduleCType, getEntityPnlNet, getEntityPnlNetShare } from '../utils/entityPredicates.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R, PURPLE } from '../lib/theme.js'
import { DEFAULT_TAX_YEAR, SUPPORTED_TAX_YEARS, CURRENT_TAX_YEAR, STEP3_LABEL, federalTaxHeadlineLabel, ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ, ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE, CAP_LOSS_ORDINARY_LIMIT, CAP_LOSS_ORDINARY_LIMIT_MFS } from '../lib/constants.js'
import { isPro } from './LockedFeature'
import InfoTip from './InfoTip.jsx'
import SharedMoneyInput from './MoneyInput.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────
// F16 FIX: MoneyInput gains a `nonNegative` prop.
// F12 FIX: MoneyInput gains an `ariaLabel` prop so inputs without a visible
// <label htmlFor> (e.g. the itemized-deduction fields) still expose an accessible
// name to screen readers instead of announcing only their value.
// D-12 CONSOLIDATION (Phase-4 housekeeping, Jul 8 2026): the formatting/caret
// core — the logic that must never fork — is single-sourced in
// src/components/MoneyInput.jsx. This adapter keeps Step 2's exact contract:
// base styling (padding 9/11, zIndex overlay-guard), nonNegative blur clamp,
// the "Enter a number \u2265 0" invalid-blur message via onError, and the
// nf('')===0 empty-blur-normalizes-to-'0' semantics (coerceEmptyBlurToZero).
function MoneyInput({ style: sx, disabled, ...props }) {
  return (
    <SharedMoneyInput
      {...props}
      disabled={disabled}
      coerceEmptyBlurToZero
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

function IncomeField({ id, label, value, onChange, placeholder, tip, onClick, style: sx }) {   // D-09: twoCol prop was never read
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

// ─── F-04 UX FIX: Collapsible OBBBA notice ────────────────────────────────────
// Collapsed by default — one-line summary always visible, detail on demand.
// Replaces the always-expanded amber banner that blocked income inputs.
function OBBBANotice() {
  const [expanded, setExpanded] = useState(false)
  return (
    <div role="note" style={{ marginTop: 6, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, fontSize: 13, color: '#78350F', lineHeight: 1.5 }}>
      <button
        type="button"
        onClick={() => setExpanded(x => !x)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 10px', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#78350F', fontSize: 11, fontFamily: 'inherit' }}
      >
        <span><strong>⚠ 2026 reflects OBBBA (P.L. 119-21)</strong> — official IRS figures · planning estimate, confirm before filing</span>
        <span style={{ flexShrink: 0, marginLeft: 8 }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 10px 8px' }}>
          2026 amounts are the official IRS-published figures — transcribed from Rev. Proc. 2025-32 (brackets, LTCG, §179, EBL, SALT), IRS Notice 2025-67 (retirement limits), and Rev. Proc. 2025-19 (HSA), updated for the One Big Beautiful Bill Act. TaxStat360 remains a planning estimate — confirm key figures with your tax professional before filing.
          <div style={{ marginTop: 4, fontSize: 11, color: '#64748B' }}>
            One Big Beautiful Bill Act (OBBBA), P.L. 119-21 — TCJA permanently extended. Key 2026 changes: SALT cap raised to $40,400 · Standard deduction increased · §199A $400 minimum QBI deduction added · EBL thresholds adjusted.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function TaxReturn() {
  const navigate = useNavigate()

  const { entities, k1Total: sessionK1 } = readStep1State()
  const savedCtx = readPersonalContext()
  const [taxYear, setTaxYear] = useState(() => readTaxYear() || DEFAULT_TAX_YEAR)

  const [filingStatus, setFilingStatus] = useState(savedCtx.filingStatus || 'single')
  const [w2Income,     setW2Income]     = useState(savedCtx.w2Income      || '')
  const [w2Withheld,   setW2Withheld]   = useState(savedCtx.w2Withheld    || '')
  const [estPaid,      setEstPaid]      = useState(savedCtx.estPaid        || '')
  // 2210-lite (Jul 2026): optional per-installment payment timing (§6654(d)(1)(A)).
  const [estQ1, setEstQ1] = useState(savedCtx.estQ1 || '')
  const [estQ2, setEstQ2] = useState(savedCtx.estQ2 || '')
  const [estQ3, setEstQ3] = useState(savedCtx.estQ3 || '')
  const [estQ4, setEstQ4] = useState(savedCtx.estQ4 || '')
  const [dependents,   setDependents]   = useState(savedCtx.dependents     || '0')
  const [ytdMode,      setYtdMode]      = useState(!!(savedCtx.ytdMode))
  const [ytdMonth,     setYtdMonth]     = useState(savedCtx.ytdMonth       || new Date().getMonth() + 1)
  // AUDIT-3 FIX: enabling YTD mode immediately multiplies whatever income/
  // entity figures are already entered by (12 / ytdMonth) with no warning —
  // if those figures were already full-year actuals (the common case when
  // someone is just exploring the toggle), the result is a silently wrong,
  // inflated tax estimate. ytdConfirmPending gates the actual mode-enable
  // behind an explicit confirmation whenever there's existing income data
  // that the multiplier would apply to; toggling OFF is always immediate
  // (no data-interpretation risk in that direction).
  const [ytdConfirmPending, setYtdConfirmPending] = useState(false)

  const [stGain,        setStGain]        = useState(savedCtx.stGain         || '')
  const [ltGain,        setLtGain]        = useState(savedCtx.capitalGains   || savedCtx.ltGain || '')
  const [interest,      setInterest]      = useState(savedCtx.interest       || '')
  const [dividends,     setDividends]     = useState(savedCtx.dividends      || '')
  const [qualDividends, setQualDividends] = useState(savedCtx.qualDividends || savedCtx.qualifiedDividends || '')
  const [unrecap1250,   setUnrecap1250]   = useState(savedCtx.unrecap1250    || '')
  const [collectibles,  setCollectibles]  = useState(savedCtx.collectiblesGain || '')
  // PHASE 2.1: §1212(b) prior-year capital-loss carryforwards (F10/P6-1) — the
  // first fields added through the shared manifest end-to-end.
  const [capLossCarryST, setCapLossCarryST] = useState(savedCtx.capLossCarryforwardST || '')
  const [capLossCarryLT, setCapLossCarryLT] = useState(savedCtx.capLossCarryforwardLT || '')
  const [form4797,      setForm4797]      = useState(savedCtx.form4797       || '')
  // F5 (§1231(c) lookback): prior-5-year nonrecaptured net §1231 losses
  const [nonrecap1231,  setNonrecap1231]  = useState(savedCtx.nonrecap1231   || '')

  // Rentals are entered in Step 1 as Real Estate (Schedule E) entities. REP status is
  // established there (per-entity) and flows through the engine; we seed the Step-2
  // value from the Step-1 entities so the §1.469-9(g) election control is reachable.
  const step1IsREP = (entities || []).some(e => e && isRealEstateEntity(e.type) && e.isREP)
  const [isREP]               = useState(!!savedCtx.isREP || step1IsREP)   // D-09: setter unused
  const [isActiveParticipant] = useState(savedCtx.isActiveParticipant === true)   // D-09: setter unused
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
  // Finding 2 FIX: surface the §469(c)(7)(B) hours the taxpayer entered on the Step-1
  // rental cards so the engine can apply the quantitative test to the FILED return (not
  // just the Step-1 preview). The hours are a taxpayer-level figure entered per card; we
  // take the max across cards (whichever card the user filled in). repAggregationOverride
  // is the explicit "deduct despite a failed hours test" acknowledgment made on the card.
  const repHoursRE = step1REList.reduce((m, e) => {
    const v = parseFloat(e.repHoursRE)
    if (Number.isNaN(v)) return m
    return Number.isNaN(m) ? v : Math.max(m, v)
  }, NaN)
  const repHoursTotal = step1REList.reduce((m, e) => {
    const v = parseFloat(e.repHoursTotal)
    if (Number.isNaN(v)) return m
    return Number.isNaN(m) ? v : Math.max(m, v)
  }, NaN)
  const repAggregationOverride = step1REList.some(e => e.repAggregationOverride === true)
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

  // FINDING 2 FIX: the panel's "Projected full-year income (K-1 + W-2)" previously
  // only annualized the K-1 + the user-entered W-2 field, omitting the officer salary
  // (W-2) embedded in each S-Corp / C-Corp entity.  The engine annualizes the full
  // w2Total = w2Income + officerW2Total.  We now compute the same officerW2Total here
  // so the displayed headline matches the number driving the tax waterfall exactly.
  const officerW2ForYTD = Array.isArray(entities)
    ? entities.reduce((sum, e) => {
        if (!e) return sum
        const isCorp = /s.?corp/i.test(e.type || '') || /c.?corp/i.test(e.type || '')
        return isCorp ? sum + (nf(e.officerW2) || nf(e.pnl?.officerSalary) || 0) : sum
      }, 0)
    : 0
  const projectedAnnualIncome = ytdMode
    ? Math.round(((sessionK1 || 0) + nf(w2Income) + officerW2ForYTD) * ytdFactor)
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
      capLossCarryforwardST: nf(capLossCarryST), capLossCarryforwardLT: nf(capLossCarryLT),  // §1212(b)
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
      // Finding 2: §469(c)(7)(B) quantitative hours test inputs + the explicit override.
      // The engine suspends a REP aggregation loss when entered hours fail the test unless
      // repAggregationOverride is true. NaN (no hours entered) passes through as not-provided,
      // preserving backward-compatible treatment.
      repHoursRE: Number.isNaN(repHoursRE) ? '' : repHoursRE,
      repHoursTotal: Number.isNaN(repHoursTotal) ? '' : repHoursTotal,
      repAggregationOverride,
      unrecap1250: nf(unrecap1250), collectiblesGain: nf(collectibles),
      nonrecapturedNet1231Loss: nf(nonrecap1231),   // F5 (§1231(c) lookback)
      w2Withheld: nf(w2Withheld), estPaid: nf(estPaid), ytdFactor,
      charitableContr: nf(charitableContr),                       // N-9 / N-9b / N-8 wiring
      estQ1: nf(estQ1), estQ2: nf(estQ2), estQ3: nf(estQ3), estQ4: nf(estQ4),  // 2210-lite
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
    estQ1, estQ2, estQ3, estQ4, charitableContr,
    sessionK1, isREP, isActiveParticipant, priorPAL, priorSuspendedLoss,
    rentalAggregationElection, repHoursRE, repHoursTotal, repAggregationOverride,
    stGain, ltGain, interest, dividends, qualDividends, unrecap1250, collectibles, form4797, nonrecap1231, capLossCarryST, capLossCarryLT,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, saltAmount, useItemized, itemizedAmt,
    mortgageInt, charitableContr, medicalAmt,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI, ytdFactor,
    ccorp,
  ])

  // M2 (audit F-05): ARCHITECTURE §5 guard, wired at the primary call site. The prior
  // bare `catch { return null }` silently swallowed EVERY error — including genuine
  // engine bugs — and rendered a blank panel a user could mistake for a $0 liability.
  // Now: invalid inputs surface as a visible calcError banner; anything else re-throws
  // so the app-level ErrorBoundary shows a real failure state instead of nothing.
  const calcOutcome = useMemo(() => {
    try {
      validateCalcInputs(calcInput, 'TaxReturn')
      const r = calcTaxReturn(calcInput)
      if (!r) return { result: r, calcError: null }
      if (ccorp.corpTax > 0 || ccorp.dividends > 0) {
        // The engine has already (a) taxed the dividends (folded into qualDiv above) and
        // (b) computed quarterlyRecommended on the PERSONAL total — both before this point.
        // Adding the corporate tax here keeps the headline total, effective rate, waterfall
        // and saved summary in sync, without inflating the owner's quarterly estimate (the
        // 21% is paid by the corporation on Form 1120, separately from the 1040).
        return {
          result: {
            ...r,
            ccorpCorpTax:   ccorp.corpTax,
            ccorpDividends: ccorp.dividends,
            totalTax: (r.totalTax || 0) + ccorp.corpTax,
            balance:  (r.balance  || 0) + ccorp.corpTax,
          },
          calcError: null,
        }
      }
      return { result: r, calcError: null }
    } catch (e) {
      if (e instanceof CalcInputError) return { result: null, calcError: e.message }
      throw e   // real engine bugs must be visible, never a silent blank result
    }
  }, [calcInput, ccorp])
  const result    = calcOutcome.result
  const calcError = calcOutcome.calcError

  // D-3: any persisted edit marks the session dirty (initial mount excluded —
  // loading a record IS the clean baseline). Cleared by doSave / record load.
  const _dirtyMountRef = useRef(false)
  useEffect(() => {
    if (_dirtyMountRef.current) writeDirtyFlag(true)
    else _dirtyMountRef.current = true
    writePersonalContext({
      filingStatus, w2Income, w2Withheld, estPaid, dependents, ytdMode, ytdMonth,
      stGain, capitalGains: ltGain, ltGain, interest, dividends, qualDividends,
      qualifiedDividends: qualDividends, unrecap1250, collectiblesGain: collectibles, form4797, nonrecap1231,
      capLossCarryforwardST: capLossCarryST, capLossCarryforwardLT: capLossCarryLT,  // §1212(b) — via manifest
      isREP, isActiveParticipant,
      priorPassiveLossCarryforward: priorPAL,
      rentalAggregationElection,   // F6 (§1.469-9(g) election)
      selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
      nolCarryforward, priorYearLosses: priorYearQBILoss,
      useItemized, itemizedAmt: itemizedAmtForEngine, saltAmount,
      mortgageInt, charitableContr, medicalAmt,
      hasISO, isoBargainElement,
      priorYearTax, priorYearAGI,
      priorSuspendedLoss,           // F-01
    })
  }, [
    filingStatus, w2Income, w2Withheld, estPaid, dependents, ytdMode, ytdMonth,
    stGain, ltGain, interest, dividends, qualDividends, unrecap1250, collectibles, form4797, nonrecap1231, capLossCarryST, capLossCarryLT,
    isREP, isActiveParticipant, priorPAL,
    rentalAggregationElection,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, useItemized, itemizedAmt, saltAmount,
    mortgageInt, charitableContr, medicalAmt,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI,
    priorSuspendedLoss,
  ])

  const buildRecord = useCallback(({ forceNew = false, newName = null } = {}) => {
    const existing = readUserRecords()
    // F-FUNC-02: upsert the loaded record in place rather than forking a new id
    // on every Step-2 save (mirrors CalculateTaxInner.handleSaveRecord).
    // D-3 (A) Explicit sync (Jul 8 2026): forceNew branches to a fresh id/name —
    // the "Save as new record" path of the save-choice dialog. The silent
    // in-place overwrite is no longer reachable without the user choosing it.
    const activeId    = forceNew ? null : readActiveRecordId()
    const existingIdx = activeId != null
      ? existing.findIndex(r => String(r.id) === String(activeId))
      : -1
    const priorName   = forceNew ? (newName || null) : (existingIdx >= 0 ? (existing[existingIdx].name || null) : null)
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
      // FINDING 8 FIX: persist a boolean so the Dashboard can distinguish a
      // legitimately-computed $0 tax liability from a record that was saved
      // before Step 2 was completed (where result is null / totalTax is absent).
      // Without this flag, totalTax === 0 is ambiguous: it could mean the user
      // has a zero-income / loss year, or it could mean Step 2 was never run.
      step2Computed: !!result && result.totalTax >= 0,
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
        capLossCarryforwardST: capLossCarryST, capLossCarryforwardLT: capLossCarryLT,  // §1212(b) — via manifest
        isREP, isActiveParticipant,
        priorPassiveLossCarryforward: priorPAL,
        rentalAggregationElection,   // F6 (§1.469-9(g) election)
        selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
        nolCarryforward, priorYearLosses: priorYearQBILoss,
        useItemized, itemizedAmt, saltAmount, hasISO, isoBargainElement,
        priorYearTax, priorYearAGI,
        // SAVE-2 FIX: persist §1366(d) prior-year suspended loss so it round-trips
        // through saved records. Previously only written to sessionStorage (ts360_f1040)
        // and lost on reload from server. savedCtx.priorSuspendedLoss initializes the
        // state, so this just ensures that state reaches the persisted record.
        priorSuspendedLoss: priorSuspendedLoss || 0,
      },
      totalSuspendedLoss: result?.totalSuspendedLoss || 0,
      entityBasisResults: result?.entityBasisResults || [],
      // CC-F1 FIX: persist engine-computed tax components so downstream consumers
      // (CPA Briefing, AI Analysis) read from the record instead of recomputing
      // independently. Recomputing SE tax in the briefing diverges for multi-entity
      // returns because it uses raw k1Income rather than seNetIncome (engine-internal).
      seTax:       result?.seTax       ?? 0,
      niitAmount:  result?.niitAmount  ?? 0,
      amtAmount:   result?.amt         ?? 0,
      halfSE:      result?.halfSE      ?? 0,
    }
    return record
  }, [
    taxYear, entities, sessionK1, filingStatus, dependents,
    w2Income, w2Withheld, estPaid, ytdMode, ytdMonth,
    stGain, ltGain, interest, dividends, qualDividends,
    unrecap1250, collectibles, form4797, nonrecap1231, capLossCarryST, capLossCarryLT,
    isREP, isActiveParticipant, priorPAL,
    rentalAggregationElection,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, useItemized, itemizedAmt, saltAmount,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI, result,
  ])

  // D-3 (A): the actual save, parameterized by the user's explicit choice.
  const doSave = useCallback(async (opts = {}, after = 'stay') => {
    const setStatus = after === 'analyze' ? setAnalyzeStatus : setSaveStatus
    setStatus('saving')
    setSaveError(null)
    try {
      const record = buildRecord(opts)
      await syncRecordToServer(record)
      writeActiveRecord(record.id, record.name || record.savedAt)
      writeDirtyFlag(false)
      if (after === 'analyze') {
        setAnalyzeStatus('idle')
        navigate('/ai-analysis', { state: { record } })
      } else {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (err) {
      console.error('TaxReturn doSave error:', err)
      setStatus('error')
      setSaveError('Save failed — please try again.')
      setTimeout(() => { setStatus('idle'); setSaveError(null) }, 5000)
    }
  }, [buildRecord, navigate])

  // D-3 (A) Explicit sync: with a record loaded, "Save" opens a choice —
  // update the loaded record, or save as a new one — instead of silently
  // overwriting (the F13 finding). With no record loaded, saving proceeds
  // directly as before.
  const [saveChoice, setSaveChoice] = useState(null)   // null | 'stay' | 'analyze'
  const [saveAsName, setSaveAsName] = useState('')

  const handleSave = useCallback(async () => {
    if (saveStatus === 'saving') return
    if (readActiveRecordId()) { setSaveAsName(''); setSaveChoice('stay'); return }
    doSave({}, 'stay')
  }, [saveStatus, doSave])

  const handleSaveAndAnalyze = useCallback(async () => {
    if (analyzeStatus === 'saving') return
    if (readActiveRecordId()) { setSaveAsName(''); setSaveChoice('analyze'); return }
    doSave({}, 'analyze')
  }, [analyzeStatus, doSave])

  // D-3: tab-close/refresh guard while dirty (session state does not survive).
  useEffect(() => {
    const onBeforeUnload = (ev) => {
      if (readDirtyFlag()) { ev.preventDefault(); ev.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

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
  // OBS-1 RESOLVED (Batch 7): display now matches the engine k1Total rule (F-13) —
  // charitable (box12_13) is a Schedule A item and no longer nets out of these
  // displayed K-1 figures. The four sites below changed together.
  const step1RentalNetUI   = step1Rentals.reduce((s, e) =>
    s + getEntityPnlNetShare(e) - nf(e.box11_12), 0)

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
    const dates = NEXT_DUE_DATES[taxYear] || NEXT_DUE_DATES[CURRENT_TAX_YEAR]
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
              { n: 2, label: 'Personal Return', active: true,  done: false },
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
                  ) : s.n === 1 ? (
                    // AUDIT-4 FIX: step 1 ("Entities") previously rendered as a plain
                    // <span> with the same visited/checkmark styling as a clickable
                    // step, but had no onClick — clicking it silently did nothing.
                    // Step 1 is marked done, so it's always safe to navigate back to;
                    // wired to the same /calculate-tax route the existing "← Business"
                    // button already uses elsewhere on this page.
                    <button
                      onClick={() => navigate('/calculate-tax')}
                      title="Back to Business Entities"
                      style={{
                        fontSize: 11, fontWeight: 500, color: G,
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, fontFamily: 'inherit', whiteSpace: 'nowrap',
                        textDecoration: 'underline', textUnderlineOffset: 2,
                      }}
                    >
                      {s.label}
                    </button>
                  ) : (
                    // AUDIT-4 FIX: step 2 ("Personal Return") is the current page —
                    // intentionally non-interactive (clicking "you are here" has
                    // nothing to navigate to). Left as plain text, same as before.
                    <span style={{ fontSize: 11, fontWeight: s.active ? 700 : 500, color: s.active ? N : s.done ? G : '#94A3B8', whiteSpace: 'nowrap' }}>{s.label}</span>
                  )}
                </div>
                {i < 2 && <span style={{ color: '#CBD5E1', fontSize: 12 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 4 : 8 }}>
          {/* UX AUDIT F17 (Jul 2026): emoji-only mobile nav (⊞ 🤖 ⚙) replaced with
              short text labels + ≥44px touch targets, matching Dashboard and
              AI Analysis. Full names stay in titles/aria-labels. */}
          {!isMobile && <button onClick={() => navigate('/calculate-tax')} style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>← Business</button>}
          <button onClick={() => navigate('/dashboard')} aria-label="Dashboard" title="Dashboard" style={{ padding: isMobile ? '13px 10px' : '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>{isMobile ? 'Home' : 'Dashboard'}</button>
          <button onClick={() => navigate('/ai-analysis')} aria-label="AI Analysis & Reporting" style={{ padding: isMobile ? '13px 10px' : '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: isPro() ? SL : '#94A3B8', fontWeight: 600 }} title="AI Analysis & Reporting">{isMobile ? 'AI' : STEP3_LABEL}{!isPro() ? ' 🔒' : ''}</button>
          {!isMobile && <button onClick={() => signOut(navigate)} style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Sign Out</button>}
          <button onClick={() => navigate('/settings')} aria-label="Settings" title="Settings" style={{ padding: isMobile ? '13px 10px' : '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Settings</button>
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
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', opacity: 0.65 }}>{federalTaxHeadlineLabel(result.seTax)}</span>
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
            <span style={{ fontSize: 11, opacity: 0.7 }}>{effRateLabel(result.totalTax, result.agi)}{result.agi > 0 ? ' eff.' : ''}</span>
          </span>
        </div>
      )}

      {/* PHASE 3.3: semantic <main> landmark — skip-link target, zero visual change. */}
      <main id="main-content" style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '20px 14px 80px' : '32px 20px 100px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: isMobile ? 16 : 24, alignItems: 'start' }}>

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
                {taxYear === 2026 && <OBBBANotice />}
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

          {/* Batch 7: federal-scope disclosure — this page shows the liability figure,
              so it carries the same dismissible notice as the Dashboard. */}
          <FederalDisclosureBanner />

          {/* F-13 UX FIX: YTD toggle moved here — immediately after Tax Year/Filing Status,
              before entity K-1 summary. This is the most-used in-year planning feature
              and was previously buried mid-scroll. Compact inline version shown here;
              the full expanded detail card remains below in its original position. */}
          {!ytdMode && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: N }}>📅 Planning for the rest of the year?</span>
                <div style={{ fontSize: 11, color: SL, marginTop: 1 }}>Enter YTD figures and we'll project your full-year liability.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  // AUDIT-3B FIX: the compact "Enable YTD Mode →" button previously
                  // called setYtdMode(true) directly, bypassing the confirmation gate
                  // added to the toggle switch in AUDIT-3. This is the same dangerous
                  // path — silently treating already-entered full-year figures as
                  // partial-year data and doubling everything. Apply the same gate.
                  const hasExistingIncome = nf(w2Income) > 0 ||
                    entityList.some(e => getEntityPnlNet(e) !== 0)
                  if (hasExistingIncome) {
                    setYtdConfirmPending(true)
                  } else {
                    setYtdMode(true)
                  }
                }}
                style={{ padding: '7px 14px', background: '#EFF6FF', color: B, border: '1px solid #BFDBFE', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                Enable YTD Mode →
              </button>
            </div>
          )}

          {/* K-1 income summary (read-only from Step 1) */}
          {entityList.length > 0 && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>From Step 1 — Business Entities</div>
              {k1Entities.map((e, i) => {
                const k1  = getEntityPnlNetShare(e) - nf(e.box11_12)   // OBS-1: engine rule
                // AUDIT-6 FIX: this line previously showed only the raw K-1 amount with
                // no indication that a loss may be limited by §1366(d) stock/debt basis
                // — the same unqualified-figure pattern the rental loop below already
                // solves with its inline `status` label. Mirror that pattern here.
                // Conservative check matching the engine's own default (C-10 FIX,
                // CalculateTaxInner.jsx): no stock/debt basis entered is treated as $0
                // basis, so a loss against unentered basis is presumed fully suspended.
                // This is a same-screen UI cue only — the authoritative suspended
                // amount is computed by the engine and shown in result.totalSuspendedLoss
                // below; this label just keeps the two from looking contradictory.
                const stockEntered = e.stockBasis !== '' && e.stockBasis !== undefined && e.stockBasis !== null
                const enteredBasis = stockEntered ? Math.max(0, nf(e.stockBasis)) + Math.max(0, nf(e.debtBasis)) : 0
                const k1Status = k1 >= 0
                  ? null
                  : !stockEntered ? 'Basis not entered · likely limited'
                  : enteredBasis >= Math.abs(k1) ? null
                  : 'Exceeds basis · partly limited'
                return (
                  <div key={'k1' + i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: i < k1Entities.length - 1 ? '1px solid #BFDBFE' : 'none' }}>
                    <span style={{ color: '#1D4ED8' }}>
                      {e.name || e.type} ({e.own || 100}%)
                      {k1Status && <span style={{ fontSize: 11, color: '#92400E', marginLeft: 6, fontWeight: 600 }}>{k1Status}</span>}
                    </span>
                    <span style={{ fontWeight: 700, color: k1 >= 0 ? '#1D4ED8' : R }}>{fmt(k1)}</span>
                  </div>
                )
              })}
              {k1Entities.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', fontSize: 13, fontWeight: 700, borderTop: '1px solid #BFDBFE', marginTop: 4 }}>
                  <span style={{ color: '#1D4ED8' }}>Total K-1</span>
                  <span style={{ color: '#1D4ED8' }}>{fmt(k1Entities.reduce((s, e) =>
                    s + getEntityPnlNetShare(e) - nf(e.box11_12), 0))}</span>
                </div>
              )}

              {hasStep1Rental && (
                <div style={{ marginTop: k1Entities.length > 0 ? 10 : 0, paddingTop: k1Entities.length > 0 ? 10 : 0, borderTop: k1Entities.length > 0 ? '1px dashed #BFDBFE' : 'none' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Rental real estate (Schedule E)
                    <InfoTip wide text={'Schedule E rentals you own directly. Rental income from a partnership or LLC comes through on a K-1 — add that as a business entity above, not here.\n\nRentals are passive by default. As a real estate professional you make the whole portfolio nonpassive by making the §1.469-9(g) aggregation election on the rental card in Step 1.'} />
                  </div>
                  <div style={{ fontSize: 11, color: PURPLE, marginBottom: 6, opacity: 0.75 }}>Passive activity rules (§469) apply — losses may be limited</div>
                  {step1Rentals.map((e, i) => {
                    const reNet = getEntityPnlNetShare(e) - nf(e.box11_12)   // OBS-1: engine rule
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
                          {reNet < 0 && <span style={{ fontSize: 11, color: nonpassive ? G : '#92400E', marginLeft: 6, fontWeight: 600 }}>{status}</span>}
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
            <div role="alert" style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#5B21B6', lineHeight: 1.55 }}>
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
            <div role="alert" style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#5B21B6', lineHeight: 1.55 }}>
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
            // UX-H2 FIX: badge shows TOTAL W-2 (officer salary from Step 1 + other employer
            // from this field) so an S-Corp owner who correctly enters $0 here still sees
            // their $70K officer salary reflected in the section summary.
            badge={(() => {
              const otherW2 = nf(w2Income)
              const totalW2 = otherW2 + officerW2ForYTD
              if (totalW2 <= 0) return undefined
              return officerW2ForYTD > 0
                ? `Total W-2: ${fmt(totalW2)}`
                : fmt(otherW2)
            })()}
            style={{ position: 'relative', zIndex: 10 }}
          >
            {/* AI-5 FIX: show officer salary flowing from Step 1 so user sees the full W-2
                picture and is never tempted to re-enter their S-Corp salary here.
                officerW2ForYTD is already computed above for YTD display — reuse it. */}
            {entityList.some(e => /s.?corp/i.test(e?.type || '')) && officerW2ForYTD > 0 && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 12, color: '#1E3A5F' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 W-2 Wages — What flows automatically from Step 1</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>S-Corp officer salary (Step 1)</span>
                  <span style={{ fontWeight: 700 }}>${Math.round(officerW2ForYTD).toLocaleString()}</span>
                </div>
                <div style={{ borderTop: '1px solid #BFDBFE', paddingTop: 4, marginTop: 4, fontSize: 11, color: '#374151' }}>
                  This is already included in your tax calculation. Only enter wages below if you have W-2 income from a <em>separate employer</em> (e.g. a day job alongside your S-Corp).
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <IncomeField
                  id="tr-w2-income"
                  label={entityList.some(e => /s.?corp/i.test(e?.type || '')) ? 'W-2 — Other Employer' : 'W-2 Income'}
                  value={w2Income}
                  onChange={setW2Income}
                  placeholder="0"
                  onClick={e => e.stopPropagation()}
                  tip={
                    <InfoTip text={
                      entityList.some(e => /s.?corp/i.test(e?.type || ''))
                        ? 'Enter W-2 wages ONLY from a separate employer — a job, consulting W-2, or second company where you receive a W-2 that is NOT from your S-Corp.\n\nYour S-Corp officer salary already flows automatically from Step 1 and is shown in the blue box above. If you enter your S-Corp salary here as well, it will be counted twice.\n\nMost S-Corp-only owners should enter $0 here.'
                        : 'Enter W-2 wages from employers OTHER than the business entity you entered in Step 1.'
                    } />
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
            {/* AI-5 FIX: withholding notice — retained for non-S-Corp owners; S-Corp owners
                see the blue breakdown box above which covers the same point more completely. */}
            {!entityList.some(e => /s.?corp/i.test(e?.type || '')) && (
              <div style={{ marginTop: 10, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
                💡 Enter the federal income tax withheld (W-2 Box 2) in the field above. FICA taxes (Boxes 4 and 6) are separate — don&apos;t include those here.
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
                    <span style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 600 }}>Income earned through:</span>
                    <select aria-label="Income earned through (month)" value={ytdMonth} onChange={e => setYtdMonth(parseInt(e.target.value))}
                      style={{ padding: '6px 10px', border: '1.5px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: N, outline: 'none' }}>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                        <option key={i+1} value={i+1}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div
                  onClick={() => {
                    if (ytdMode) {
                      // Disabling is always immediate — no risk of misinterpreting data.
                      setYtdMode(false)
                      return
                    }
                    // AUDIT-3 FIX: enabling — if there's already income data on the
                    // page (W-2 wages entered, or any K-1/entity income flowing from
                    // Step 1), that data is most likely already a full-year figure,
                    // not a partial-year actual. Confirm before silently treating it
                    // as YTD-through-{month} and applying the annualization multiplier.
                    const hasExistingIncome = nf(w2Income) > 0 ||
                      entityList.some(e => getEntityPnlNet(e) !== 0)
                    if (hasExistingIncome) {
                      setYtdConfirmPending(true)
                    } else {
                      setYtdMode(true)
                    }
                  }}
                  style={{ width: 44, height: 24, background: ytdMode ? B : '#CBD5E1', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: 3, left: ytdMode ? 23 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            </div>

            {/* AUDIT-3 FIX: confirmation modal — shown only when enabling YTD mode
                with existing income data already present. Explains exactly what
                will happen (figures get treated as partial-year and multiplied)
                before it happens, rather than after. */}
            {ytdConfirmPending && (
              <div role="alertdialog" aria-modal="true" style={{ marginTop: 12, background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#78350F', marginBottom: 6 }}>
                  ⚠ Treat your entered figures as partial-year data?
                </div>
                <div style={{ fontSize: 13, color: '#78350F', marginBottom: 10, lineHeight: 1.5 }}>
                  You already have income entered (W-2 and/or business entity income). Enabling YTD Mode will treat those figures as income earned only through the month you select — not the full year — and multiply them up to project a full-year total. If the figures you entered are already full-year actuals, this will overstate your projected liability.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setYtdMode(true); setYtdConfirmPending(false) }}
                    style={{ padding: '6px 14px', background: '#D97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Yes, my figures are YTD only
                  </button>
                  <button
                    onClick={() => setYtdConfirmPending(false)}
                    style={{ padding: '6px 14px', background: '#fff', color: '#78350F', border: '1px solid #FCD34D', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
                {/* AUDIT F8 FIX: min/max attributes only constrain the spinner arrows — typed
                    values ("10000") passed straight through to state and generated an
                    unbounded CTC that silently zeroed the liability. Clamp typed input to
                    the same 0–20 range (integer); empty string stays allowed for clearing. */}
                <input type="number" min="0" max="20" aria-label="Qualifying dependents" value={dependents} onChange={e => { const v = e.target.value; if (v === '') { setDependents(''); return } const n = Math.max(0, Math.min(20, Math.floor(Number(v) || 0))); setDependents(String(n)) }}
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
                    <InfoTip text="Total federal estimated tax payments made for this tax year (Form 1040-ES, Quarters 1–4). Do NOT include your W-2 withholding — that goes in the field above. Due dates: Apr 15, Jun 15, Sep 15, Jan 15. For per-installment penalty accuracy, use the quarterly boxes below instead — §6654 penalties accrue per installment." />
                  }
                />
                {/* 2210-lite (Jul 2026): optional per-installment timing, §6654(d)(1)(A).
                    When supplied, these OVERRIDE the total above for schedule purposes. */}
                <div style={{ marginTop: 6, fontSize: 11, color: '#64748B' }}>
                  Optional — payment by installment (overrides the total for the penalty schedule):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 4 }}>
                  <MoneyInput ariaLabel="Q1 paid (Apr 15)" value={estQ1} onChange={setEstQ1} placeholder="Q1" nonNegative style={{ fontSize: 12 }} />
                  <MoneyInput ariaLabel="Q2 paid (Jun 15)" value={estQ2} onChange={setEstQ2} placeholder="Q2" nonNegative style={{ fontSize: 12 }} />
                  <MoneyInput ariaLabel="Q3 paid (Sep 15)" value={estQ3} onChange={setEstQ3} placeholder="Q3" nonNegative style={{ fontSize: 12 }} />
                  <MoneyInput ariaLabel="Q4 paid (Jan 15)" value={estQ4} onChange={setEstQ4} placeholder="Q4" nonNegative style={{ fontSize: 12 }} />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* S-Corp basis carryforwards */}
          {/* TERMINOLOGY FIX 5.5: Pass 1 fixed Step 1 to "Stock & Debt Basis (Form 7203)" but Step 2
              still read "S-Corp Stock & Debt Basis" — two different names for the same concept.
              Aligned to match Step 1 label and add the Form 7203 citation. */}
          {Array.isArray(entities) && entities.some(e => isSCorpEntity(e.type)) && (
            <CollapsibleSection title="Stock & Debt Basis (Form 7203)" subtitle="Form 7203 · limits how much loss you can deduct" defaultOpen={false}>
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
          <CollapsibleSection title="Capital Gains & Investment Income" subtitle="Stocks, interest, dividends · Schedule D / B" defaultOpen={nf(ltGain) !== 0 || nf(stGain) !== 0 || nf(interest) > 0 || nf(dividends) > 0 || nf(qualDividends) > 0 || nf(form4797) !== 0 || nf(unrecap1250) > 0 || nf(collectibles) > 0} badge={nf(ltGain) > 0 || nf(stGain) > 0 || nf(interest) > 0 ? 'Schedule D / B' : undefined} accent="#0891B2">
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
                <label htmlFor="tr-caploss-st" style={inputLbl}>
                  Capital Loss Carryforward — Short-Term
                  <InfoTip text="Unused short-term capital loss carried from last year's Schedule D. Nets against this year's gains; up to $3,000 of any remaining net loss ($1,500 married filing separately) offsets other income, and the rest carries forward again (IRC §1211(b), §1212(b))." />
                </label>
                <MoneyInput id="tr-caploss-st" value={capLossCarryST} onChange={setCapLossCarryST} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-caploss-lt" style={inputLbl}>
                  Capital Loss Carryforward — Long-Term
                  <InfoTip text="Unused long-term capital loss carried from last year's Schedule D. Enter as a positive number — it reduces this year's gains before the §1211(b) $3,000 limit applies." />
                </label>
                <MoneyInput id="tr-caploss-lt" value={capLossCarryLT} onChange={setCapLossCarryLT} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-interest" style={inputLbl}>Interest Income (Schedule B)</label>
                <MoneyInput id="tr-interest" value={interest} onChange={setInterest} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                {/* TERMINOLOGY FIX 4.1: Added tooltip to clarify ordinary vs qualified dividends.
                    The two fields appear adjacent in the same accordion; without a tooltip users
                    may confuse ordinary dividends (taxed at ordinary rates) with qualified dividends
                    (taxed at 0/15/20%) or accidentally double-count by entering the same amount in both. */}
                <label htmlFor="tr-dividends" style={inputLbl}>
                  Ordinary Dividends
                  <InfoTip text="Total dividends from Form 1099-DIV, Box 1a. Ordinary dividends are taxed at ordinary income rates — NOT the preferential 0/15/20% rate. Only the qualified dividend portion (Box 1b, entered below) receives preferential treatment. Enter the full Box 1a amount here; enter Box 1b separately in the field below." />
                </label>
                <MoneyInput id="tr-dividends" value={dividends} onChange={setDividends} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-qual-div" style={inputLbl}>
                  {/* UX-H3 FIX: label shortened — K-1 box reference moved to tooltip */}
                  Qualified Dividends
                  <InfoTip text="Qualified dividends are taxed at long-term capital gains rates (0/15/20%). Must be a subset of ordinary dividends — cannot exceed total dividends entered above. From Form 1099-DIV Box 1b." />
                </label>
                <MoneyInput id="tr-qual-div" value={qualDividends} onChange={setQualDividends} placeholder="0" nonNegative />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-form4797" style={inputLbl}>
                  {/* TERMINOLOGY FIX 4.2: Label said "Gains" only; tooltip already explains losses
                      are entered as negative numbers. Label updated to match the tooltip. */}
                  Form 4797 Gains / Losses (§1231)
                  <InfoTip text={'Enter your NET §1231 result for the year (from Form 4797, or the net §1231 gain/loss line of your partnership or S-corp K-1).\n\nA net §1231 GAIN is treated as long-term capital gain — taxed at 0/15/20%, not ordinary rates. Enter it as a positive number.\n\nA net §1231 LOSS is ordinary and reduces your ordinary income. Enter it as a negative number.\n\nDo NOT enter ordinary depreciation recapture here. §1245 recapture is ordinary income, and the depreciation portion of a real-property gain goes in the "Unrecaptured §1250 Gain — portion of the long-term gain above" field below.'} wide />
                </label>
                <MoneyInput id="tr-form4797" value={form4797} onChange={setForm4797} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-nonrecap1231" style={inputLbl}>
                  {/* UX-H3 FIX: label shortened */}
                  Prior §1231 Losses (5 yrs)
                  <InfoTip text={'§1231(c) 5-year lookback. Enter your net §1231 LOSSES from the prior five tax years that have not yet been recaptured (Form 4797, Line 8).\\n\\nA net §1231 GAIN this year is recharacterized as ORDINARY income — not long-term capital gain — to the extent of these prior losses (IRC §1231(c)(1)). Only the gain in excess of the prior losses keeps 0/15/20% capital-gain treatment.\\n\\nLeave blank (0) if you have no nonrecaptured §1231 losses in the prior five years. This field only affects a year with a net §1231 gain.'} wide />
                </label>
                <MoneyInput id="tr-nonrecap1231" value={nonrecap1231} onChange={setNonrecap1231} placeholder="0" nonNegative />
                {(result?.ordinary1231Recapture || 0) > 0 && (
                  <div style={{ marginTop: 4, fontSize: 13, color: '#1E3A8A', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                    §1231(c): {fmt(result.ordinary1231Recapture)} of your §1231 gain is recharacterized as <strong>ordinary income</strong> (taxed at ordinary rates, not 0/15/20%) because of nonrecaptured §1231 losses in the prior five years. IRC §1231(c)(1).
                  </div>
                )}
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-unrec1250" style={inputLbl}>
                  Unrecaptured §1250 Gain — portion of the long-term gain above
                  <InfoTip text="Depreciation recapture on real property sold at a gain. Taxed at max 25% (lesser of 25% or ordinary rate). This is the accumulated depreciation portion of your gain on real property sales." />
                </label>
                <MoneyInput id="tr-unrec1250" value={unrecap1250} onChange={setUnrecap1250} placeholder="0" nonNegative />
                {(parseFloat(String(form4797).replace(/,/g,'')) || 0) > 0 && (parseFloat(String(unrecap1250).replace(/,/g,'')) || 0) === 0 && (
                  <div style={{ marginTop: 4, fontSize: 13, color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                    ⚠ You entered a Form 4797 gain. If this included <strong>depreciable real property</strong>, enter accumulated straight-line depreciation here — that amount is taxed at up to 25%, not 20%. Schedule D Unrecaptured §1250 Worksheet · IRC §1(h)(1)(E).
                  </div>
                )}
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-collectibles" style={inputLbl}>
                  {/* TERMINOLOGY FIX 4.3: Old label listed 3 of 7+ statutory categories ("Art, Coins, Stamps")
                      and omitted gems, precious metals, and rugs. Moved examples to tooltip, cite §1(h)(4)
                      in label for precision. Tooltip now covers the full statutory definition. */}
                  {/* UX-H3 FIX: label shortened — IRC cite moved to tooltip */}
                  Collectibles Gain
                  <InfoTip text="Gain from the sale of collectibles held more than 1 year, taxed at a maximum 28% rate (IRC §1(h)(4)). Includes: coins, art, antiques, gems, precious metals, rugs, and stamps. Enter your net gain from Schedule D (or net gain/loss line if a loss year — losses are entered as negative numbers)." />
                </label>
                <MoneyInput id="tr-collectibles" value={collectibles} onChange={setCollectibles} placeholder="0" nonNegative />
              </div>
            </div>
          </CollapsibleSection>

          {/* Deductions & adjustments */}
          <CollapsibleSection title="Above-the-Line Deductions & Adjustments (Schedule 1)" subtitle="HSA, SE health & retirement, student-loan interest · Above-the-line (Schedule 1)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label htmlFor="tr-health-ins" style={inputLbl}>
                  Self-Employed Health Insurance Premiums
                  <InfoTip text={"Premiums for health, dental, and long-term care insurance for yourself and family. 100% deductible on Form 1040 Schedule 1 Line 17 if the plan is established in the business name.\n\nS-Corp shareholders (>2% ownership): Your premiums must first be included in your W-2 Box 1 wages by the S-Corp (IRC §1372 / Rev. Rul. 91-26). Enter the W-2-grossed-up premium amount here.\n\nSole proprietors and partners: Enter premiums paid directly. Cannot exceed your net self-employment income."} />
                </label>
                <MoneyInput id="tr-health-ins" value={selfEmpHealthIns} onChange={setSelfEmpHealthIns} placeholder="0" nonNegative />
                {/* AUDIT F-7: §162(l)(5)(A) earned-income cap — engine now clamps; surface it. */}
                {result?.sehiClamped && (
                  <div style={{ marginTop: 4, fontSize: 13, color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                    ⚠ Deduction limited to {fmt(result.selfEmpHealthDed)} — §162(l)(5)(A) caps the self-employed health
                    insurance deduction at your earned income from the business (S-Corp W-2 officer wages / net SE
                    earnings). You entered {fmt(result.sehiEntered)}. For S-Corp owners, premiums must also be included
                    in your W-2 Box 1 wages to be deductible at all (Notice 2008-1).
                  </div>
                )}
                {result?.k1CharitableTotal > 0 && (
                  <div style={{ marginTop: 4, fontSize: 13, color: '#1E3A8A', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                    Note: {fmt(result.k1CharitableTotal)} of K-1 charitable contributions from Step 1 no longer reduces
                    your K-1 income (audit fix — Form 8995 instructions, 2021–present). If you itemize, include it in
                    your Schedule A charitable total; it is not added automatically.
                  </div>
                )}
              </div>
              <div style={inpWrap}>
                <label htmlFor="tr-hsa" style={inputLbl}>
                  HSA Deduction (Form 8889)
                  {/* AUDIT: limits were hardcoded to 2025 and shown even when 2026 was selected. */}
                  <InfoTip text={`Health Savings Account contributions — deductible if you have a qualifying High-Deductible Health Plan. ${taxYear} limits: ${fmt(getTable(taxYear)?.hsa?.selfOnly ?? 0)} (self-only) / ${fmt(getTable(taxYear)?.hsa?.family ?? 0)} (family). Grows tax-free; withdrawals for medical expenses are always tax-free.`} />
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
                  {/* TERMINOLOGY FIX 4.4: Old label buried a critical instruction ("use entity panel for
                      multi-entity") inside a parenthetical, and used unexplained "pooled" jargon.
                      Form 8995 citation added. The tooltip already explains the per-entity distinction. */}
                  Prior-Year QBI Loss Carryforward (Form 8995, Line 3)
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
              {/* HOTFIX (Jul 2026): the charitable field previously rendered only inside
                  the itemized block, making the engine's §170(p) NON-itemizer deduction
                  (up to $1,000 / $2,000 MFJ, 2026+) unreachable for the very filers it
                  exists for. Standard-deduction users now get a dedicated field bound to
                  the same state. */}
              {!useItemized && taxYear >= 2026 && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: 0.3 }}>
                    Charitable Contributions — non-itemizer deduction (IRC §170(p))
                  </label>
                  <MoneyInput ariaLabel="Charitable Contributions (non-itemizer, §170(p))" value={charitableContr} onChange={setCharitableContr} placeholder="0" nonNegative />
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    Deductible up to $1,000 ($2,000 MFJ) in addition to the standard deduction, 2026+.
                  </div>
                  {result?.nonItemizerCharitable > 0 && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 5, padding: '5px 8px' }}>
                      ✓ {fmt(result.nonItemizerCharitable)} §170(p) deduction applied.
                    </div>
                  )}
                </div>
              )}
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
                      {result?.charFloorDisallowed > 0 && (
                        <div style={{ marginTop: 4, fontSize: 13, color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                          ⚠ {fmt(result.charFloorDisallowed)} of charitable contributions disallowed — OBBBA 0.5%-of-AGI
                          floor for itemizers (2026+). The disallowed amount may carry forward up to 5 years, subject to
                          the same floor each year.
                        </div>
                      )}
                      {result?.nonItemizerCharitable > 0 && (
                        <div style={{ marginTop: 4, fontSize: 13, color: '#166534', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                          ✓ {fmt(result.nonItemizerCharitable)} non-itemizer charitable deduction applied (IRC §170(p),
                          2026+: up to $1,000 / $2,000 MFJ in addition to the standard deduction).
                        </div>
                      )}
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
                        <InfoTip text={`State and local taxes (state income tax + property taxes). The SALT deduction is capped at $${(SALT_CAPS[2024] || 10000).toLocaleString()} for 2024, $${(SALT_CAPS[2025] || 40000).toLocaleString()} for 2025, and $${(SALT_CAPS[2026] || 40400).toLocaleString()} for 2026 (OBBBA). Enter your total SALT paid — TaxStat360 applies the cap, including the OBBBA §70120 phase-down: above $505,000 MAGI ($252,500 MFS) for 2026, the cap shrinks by 30% of the excess, to a floor of $10,000 ($5,000 MFS).`} />
                      </label>
                      <MoneyInput ariaLabel="SALT Amount (before cap)" value={saltAmount} onChange={setSaltAmount} placeholder="0" nonNegative />
                      {result?.saltDisallowed > 0 && (
                        <div style={{ marginTop: 4, fontSize: 13, color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 5, padding: '5px 8px', lineHeight: 1.5 }}>
                          ⚠ SALT deduction limited to {fmt(result.saltAllowed)} of the {fmt(result.saltEntered)} entered —
                          IRC §164(b)(6)/(b)(7) as amended by OBBBA §70120. For 2026 the cap is $40,400 ($20,200 MFS),
                          reduced by 30% of MAGI above $505,000 ($252,500 MFS) to a floor of $10,000 ($5,000 MFS).
                          Note for pass-through owners: a state PTET election changes your FEDERAL deduction —
                          state tax on business income moves from this capped line to an uncapped entity-level
                          expense on your K-1. This app models federal tax only; ask your CPA whether the
                          election helps you.
                        </div>
                      )}
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
          <CollapsibleSection title="Estimated Tax Penalty Protection" subtitle="Prior-year tax & AGI · minimize underpayment penalties" badge="Optional">
            <p style={{ fontSize: 13, color: SL, margin: '0 0 12px', lineHeight: 1.6 }}>
              Enter prior year figures to calculate your Safe Harbor payment amount — the minimum you must pay to avoid underpayment penalties. At AGI above $150K (single, HOH, or MFJ) or $75K (MFS only), the Safe Harbor threshold is 110% of prior year tax. IRC §6654(d)(1)(C)(i) (the $75K MFS substitution is §6654(d)(1)(C)(ii)). For 2026 (OBBBA / TCJA extended): TCJA extension did not change Safe Harbor rules under §6654, but confirm final Treasury guidance with your CPA before relying on these thresholds for penalty avoidance.
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
                    <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.7 }}>
                      Prior year tax: <strong>{fmt(priorYearTaxNum)}</strong>
                      {' '}→ {isHighIncome ? '110%' : '100%'} Safe Harbor = <strong>{fmt(safeHarborMinimumLocal)}</strong><br />
                      Your payments to date: <strong>{fmt(totalPaymentsLocal)}</strong><br />
                      Surplus: <strong>{fmt(Math.abs(safeHarborGap))}</strong> above the Safe Harbor threshold
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, color: R, fontSize: 13, marginBottom: 6 }}>
                      ⚠ Safe harbor gap: {fmt(safeHarborGap)} remaining — next due date {getNextDueDate()}. Note: §6654 penalties accrue per installment; catching up now stops penalties from accruing going forward but does not erase exposure on installments already missed (Form 2210). If your income is seasonal, the §6654(d)(2) annualized-income method may reduce or eliminate earlier-quarter penalties
                    </div>
                    <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.7 }}>
                      Prior year tax: <strong>{fmt(priorYearTaxNum)}</strong>
                      {' '}→ {isHighIncome ? '110%' : '100%'} safe harbor = <strong>{fmt(safeHarborMinimumLocal)}</strong><br />
                      Your payments to date: <strong>{fmt(totalPaymentsLocal)}</strong><br />
                      Remaining to meet Safe Harbor: <strong>{fmt(safeHarborGap)}</strong>
                    </div>
                    {priorYearAGINum === 0 && (
                      <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 6, fontStyle: 'italic' }}>
                        Enter your prior year AGI above to confirm whether the 110% rule applies (AGI {'>'} $150K for single, HOH, and MFJ filers; $75K for MFS only — IRC §6654(d)(1)(C)(i), MFS amount per (C)(ii)).
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
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', opacity: 0.6, marginBottom: 8 }}>{federalTaxHeadlineLabel(result.seTax)}</div>
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
                Effective rate: {effRateLabel(result.totalTax, result.agi)}
              </div>
            )}
            {/* F-05 UX FIX: Surface "Estimated Balance Due" directly in the hero card.
                Previously only visible by scrolling the Tax Waterfall below. This is the
                number a business owner actually acts on — how much they still owe. */}
            {hasResult && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>
            {/* TERMINOLOGY FIX 2.1: "Estimated Balance Due" is semantically wrong when
                withholding and estimated payments have not been entered — at that point
                the figure equals total tax liability, not balance due (which is liability
                minus payments). Show "Est. Tax Liability" until the user has entered
                withholding or payments; switch to "Estimated Balance Due" once they have. */}
                  {(nf(w2Withheld) > 0 || nf(estPaid) > 0)
                    ? (result.balance >= 0 ? 'Estimated Balance Due' : 'Estimated Refund')
                    : 'Est. Tax Liability'
                  }
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color: result.balance >= 0 ? '#FCA5A5' : '#86EFAC' }}>
                  {result.balance >= 0 ? fmt(result.balance) : fmt(Math.abs(result.balance))}
                </span>
              </div>
            )}
            {/* M2 (audit F-05): when validateCalcInputs rejects the inputs, say so
                visibly — a blank estimate must never be mistaken for a $0 liability. */}
            {!hasResult && calcError && (
              <div role="alert" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 8, padding: '10px 12px' }}>
                <strong>Couldn't calculate your estimate.</strong> A required input is missing
                or invalid, so no tax figure is shown (rather than a wrong one).
                Re-select your tax year and filing status above; if this persists, sign out
                and back in to refresh your session data.
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4, fontFamily: 'monospace' }}>{calcError}</div>
              </div>
            )}
            {!hasResult && !calcError && (
              <div style={{ fontSize: 13, opacity: 0.55, marginTop: 8, lineHeight: 1.5 }}>
                Enter your income above to see your tax estimate.
              </div>
            )}
          </div>

          {/* C-Corp double-taxation note + planning disclaimer */}
          {hasResult && (result.ccorpCorpTax > 0 || ccorp.count > 0) && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 16px', marginBottom: 12, fontSize: 13.5, color: '#1E3A5F', lineHeight: 1.55 }}>
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
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px', paddingBottom: 72, marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: N, fontSize: 14, marginBottom: 12 }}>Tax Waterfall</div>
              {/* UX-H1 FIX: paddingBottom ensures bottom waterfall rows clear the Ask Aria floating button */}

              {[
                { label: 'Business K-1 Income',        value: result.scheduleEK1Income ?? (sessionK1 || 0), sign: 1, hide: (result.scheduleEK1Income ?? sessionK1 ?? 0) === 0 },
                // FIX (A6-1): scheduleCSEIncome is the SE-taxable business bucket — it holds
                // sole-prop Schedule C income AND partnership/active-LLC K-1 income (both are
                // SE income). Label it by the entity types actually present so partnership
                // income is no longer mislabeled "Schedule C Income".
                { label: (() => {
                    const list = Array.isArray(entities) ? entities : []
                    const hasSchedC  = list.some(e => isScheduleCType(e?.type))
                    const hasPartner = list.some(e => /partner|mmllc/i.test(e?.type || ''))
                    if (hasSchedC && hasPartner) return 'Schedule C / Partnership Income'
                    if (hasPartner) return 'Partnership / LLC Income (K-1)'
                    return 'Schedule C Income'
                  })(),                                 value: result.scheduleCSEIncome || 0,              sign: 1, hide: !(result.scheduleCSEIncome > 0) },
                // AI-5 FIX: split W-2 into officer salary (Step 1) + other W-2 (Step 2) so
                // the user can immediately spot a double-entry. Both are included in
                // result.totalW2ForFICA (= w2Total in the engine); we derive officer salary
                // from the entity list and other W-2 as the remainder.
                ...((() => {
                  const officerSalary = (Array.isArray(entities) ? entities : []).reduce((s, e) => {
                    if (!e) return s
                    const isCorp = /s.?corp/i.test(e.type || '') || /c.?corp/i.test(e.type || '')
                    return isCorp ? s + (nf(e.officerW2) || nf(e.pnl?.officerSalary) || 0) : s
                  }, 0)
                  const otherW2 = Math.max(0, (result.totalW2ForFICA || 0) - officerSalary)
                  const showSplit = officerSalary > 0 && result.totalW2ForFICA > 0
                  if (showSplit) {
                    return [
                      { label: 'W-2 Wages — S-Corp officer salary (Step 1)', value: officerSalary, sign: 1, hide: false, note: 'Flows automatically from Step 1 — do not re-enter in Step 2' },
                      { label: 'W-2 Wages — Other employer (Step 2)', value: otherW2, sign: 1, hide: otherW2 === 0 },
                    ]
                  }
                  return [{ label: 'W-2 Wages', value: result.totalW2ForFICA || 0, sign: 1, hide: !(result.totalW2ForFICA > 0) }]
                })()),
                { label: 'Rental Income (allowed)',      value: result.rentalAllowed ?? step1RentalNetUI, sign: 1, hide: (result.rentalNetCombined ?? step1RentalNetUI) === 0 },
                { label: 'Capital Gains (LT)',          value: nf(ltGain),                                sign: 1, hide: nf(ltGain) === 0 },
                { label: 'Capital Gains (ST)',          value: nf(stGain),                                sign: 1, hide: nf(stGain) === 0 },
                // R-1 (Pass-6 review, Jul 2026): §1211(b) reconciliation addback — same pattern
                // as the §461(l) line below (F-FUNC-06): the raw entered loss rows above must
                // visibly reconcile to AGI now that the engine (F10/P6-1) caps the deductible
                // net capital loss. The addback equals result.capLossCarryoverTotal, which is
                // exact while the §1212(b) carryforward INPUTS have no UI (they land with the
                // Phase-2 field manifest). Limit figures imported from constants.js — never a
                // literal (M1 rule).
                { label: 'Capital Loss Limited (§1211(b))', value: result.capLossCarryoverTotal || 0, sign: 1,
                  hide: !(result.capLossCarryoverTotal > 0), accent: R,
                  note: `Net capital losses deduct against other income only up to $${(filingStatus === 'mfs' ? CAP_LOSS_ORDINARY_LIMIT_MFS : CAP_LOSS_ORDINARY_LIMIT).toLocaleString()}/yr — the disallowed ${fmt(result.capLossCarryoverTotal || 0)} carries forward to ${Number(taxYear) + 1}, keeping its short/long-term character (IRC §1211(b), §1212(b))` },
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
                // ── AUDIT F-6 (Jul 2026): THE WATERFALL NOW FOOTS ────────────────────────────
                // These three are ABOVE-THE-LINE (Schedule 1) deductions — they are ALREADY
                // inside AGI. They used to be listed AFTER the AGI row, which made the column
                // look like it subtracted them a second time: a reader adding it up got
                // $820,818 while the app displayed $844,309. The math was always right; the
                // presentation implied a double deduction, and any CPA reading it would
                // conclude the engine was broken.
                //
                // Order is now the order of the actual return:
                //   income → above-the-line deductions → AGI → standard/itemized → taxable
                // Keep it that way. If you add another above-the-line item, it goes HERE,
                // above the AGI row — not below it.
                { label: 'SE Tax Deduction (½)',         value: result.halfSE,                            sign: -1, hide: result.halfSE === 0 },
                { label: 'Retirement Contributions',    value: result.selfEmpRetirementDed,              sign: -1, hide: result.selfEmpRetirementDed === 0 },
                { label: 'Health Insurance Ded.',       value: result.selfEmpHealthDed,                  sign: -1, hide: result.selfEmpHealthDed === 0 },
                { label: '—', value: 0, divider: true },
                { label: 'AGI',                         value: result.agi,                               sign: 1, bold: true },
                // TERMINOLOGY FIX 2.4 / PASS 3 CORRECTION: Original fix used `useItemized` (checkbox
                // state) as the condition, but when the checkbox is checked and no Schedule A amounts
                // are entered, the engine still applies the standard deduction via Math.max(stdDed, 0).
                // The label must reflect what was *actually applied*, not what the checkbox says.
                // result.itemized and result.stdDed are both returned by the engine (line 1093/1171).
                // When itemized > stdDed the engine itemizes; otherwise it uses the standard deduction.
                { label: (useItemized && result.itemized > result.stdDed) ? 'Itemized Deductions (Schedule A)' : 'Standard Deduction', value: result.deduction, sign: -1 },
                { label: '§68 Itemized Limitation (2/37)',  value: result.itemizedLimitReduction,            sign: 1, hide: !result.itemizedLimitReduction, accent: '#94A3B8', note: 'OBBBA §70111 — top-bracket itemizers: deduction benefit capped at 35¢/dollar', isAddback: true },
                { label: 'NOL Applied',                 value: result.nolAllowed,                        sign: -1, hide: result.nolAllowed === 0 },
                { label: '—', value: 0, divider: true },
                { label: 'Taxable Income (before §199A)', value: result.taxableBeforeQBI,                  sign: 1 },
                // AUDIT F-6/B-1 (Jul 2026): this row used to HIDE itself when the deduction was
                // $0 — which is exactly the case a high-income filer with no payroll most needs
                // explained. Silence there reads as "the app forgot my QBI deduction". It now
                // stays visible whenever a §199A limit is what drove the number, and says which.
                { label: 'Business income deduction (§199A QBI)',         value: result.qbi,                               sign: -1,
                  hide: result.qbi === 0 && !result.qbiWageDataMissing,
                  accent: result.qbiWageDataMissing ? R : '#059669',
                  note: result.qbiWageDataMissing
                    ? 'Capped by the §199A(b)(2)(B) W-2 wage / UBIA limit. Your taxable income is above the §199A threshold, and this record reports $0 of W-2 wages and $0 of qualified property (UBIA) — so the cap is $0. If the business does pay W-2 wages or holds qualified property, enter them in Step 1 to recover this deduction.'
                    : undefined },
                { label: '—', value: 0, divider: true },
                { label: 'Taxable Income (final)',      value: result.taxableAfterQBI,                   sign: 1, bold: true },
                { label: '—', value: 0, divider: true },
                { label: 'Federal Income Tax',          value: result.fedTax,                            sign: 1 },
                { label: 'SE Tax',                      value: result.seTax,                             sign: 1, hide: result.seTax === 0 },
                { label: 'Employee FICA (payroll)',      value: result.employeeFICA,                      sign: 1, hide: !result.employeeFICA || result.employeeFICA === 0, accent: '#94A3B8', note: 'Withheld via W-2 payroll — not in Balance Due' },
                // AUDIT N-3 FIX: the 0.9% Additional Medicare Tax (§3101(b)(2)) was included
                // in Total Tax but rendered no line — invisible to the user.
                { label: 'Additional Medicare Tax (0.9%)', value: result.additionalMedicare,                sign: 1, hide: !result.additionalMedicare || result.additionalMedicare === 0, accent: '#94A3B8', note: 'IRC §3101(b)(2) — wages/SE earnings over $200K ($250K MFJ, $125K MFS)' },
                { label: 'NIIT (Form 8960)',             value: result.niit?.amount || result.niitAmount || 0, sign: 1, hide: !(result.niit?.applies), accent: R },
                // AUDIT F-15: annotation rendered below the waterfall when the NII base includes §1368(b)(2) stock gain
                // C-10 FIX: Additional Medicare Tax (0.9% on wages/SE income above $200K single /
                // $250K MFJ — IRC §3101(b)(2), §1411) is ALWAYS shown as a distinct waterfall
                // line for users with W-2 income above $150K, because for many S-Corp owners in
                // a loss year this IS their entire federal tax obligation. Previously hidden when $0,
                // but it is more useful to show the line with $0 so the user knows it was computed.
                { label: 'Addl. Medicare Tax (0.9% — Form 8959)',   value: result.additionalMedicare || 0,
                  sign: 1,
                  hide: (result.additionalMedicare || 0) === 0 && (result.totalW2ForFICA || 0) < ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE * 0.75, // show when within 75% of the threshold
                  accent: (result.additionalMedicare || 0) > 0 ? '#DC2626' : undefined,
                  note: (result.additionalMedicare || 0) > 0
                    ? `0.9% on wages above $${(calcInput.status === 'mfj' ? ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ : ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE).toLocaleString()} threshold (IRC §3101(b)(2))`
                    : undefined
                },
                { label: 'AMT (Form 6251)',              value: result.amt,                               sign: 1, hide: result.amt === 0, accent: R },
                { label: 'Child Tax Credit',            value: result.childCredit,                       sign: -1, hide: result.childCredit === 0, accent: '#059669' },
                { label: '—', value: 0, divider: true },
                { label: 'Corporate Tax (C-Corp, 21%)', value: result.ccorpCorpTax || 0,                 sign: 1, hide: !(result.ccorpCorpTax > 0), accent: R, note: 'Entity-level tax (Form 1120) — paid by the corporation, separate from your 1040 estimates' },
                { label: 'Total Tax',                   value: result.totalTax,                          sign: 1, bold: true },
                { label: 'Withholding & Estimated Tax Payments', value: result.totalPayments,                     sign: -1, hide: result.totalPayments === 0 },
                { label: '—', value: 0, divider: true },
                // AUDIT F11 FIX: sign: -1 on the refund branch made the renderer print
                // "Estimated Refund −$X" (a negative refund) while the summary header showed
                // the same figure as positive. The label already carries the direction —
                // render the magnitude as positive in both branches; accent color (red/green)
                // still distinguishes balance due from refund.
                { label: (nf(w2Withheld) > 0 || nf(estPaid) > 0) ? (result.balance >= 0 ? 'Estimated Balance Due' : 'Estimated Refund') : 'Est. Tax Liability', value: Math.abs(result.balance), sign: 1, bold: true, accent: result.balance >= 0 ? R : G },
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
                      <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2, paddingLeft: 2 }}>{row.note}</div>
                    )}
                  </div>
                )
              })}

              {assumedZeroBasisSuspended > 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 13, color: '#78350F', lineHeight: 1.55 }}>
                  <strong>⚠ Estimate incomplete — suspended S-Corp loss not included.</strong>{' '}
                  {fmt(assumedZeroBasisSuspended)} of S-Corp loss is excluded from this estimate because no
                  Form 7203 stock basis was entered. Your deductible loss is capped at your stock + debt basis
                  (IRC §1366(d)). This figure will change materially once basis is entered.{' '}
                  Open the S-Corp entity in Step 1 → "Stock &amp; Debt Basis (Form 7203)" and enter your
                  beginning basis (Line 1) to release the portion your basis supports.
                </div>
              )}

              {result.ebl > 0 && result.eblThreshold > 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 13, color: '#991B1B', lineHeight: 1.55 }}>
                  <strong>⚠ §461(l) EBL:</strong> {fmt(result.ebl)} of business loss is disallowed this year and added back to income — your deductible business loss is limited to the {fmt(result.eblThreshold)} ({filingStatus.toUpperCase()}) threshold.
                  {' '}The disallowed {fmt(result.ebl)} carries forward as a net operating loss (NOL) to next year (IRC §172(a)(2)).
                </div>
              )}

              {result.ebl > 0 && nf(ltGain) > 0 && nf(form4797) === 0 && (
                <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 13, color: '#78350F', lineHeight: 1.55 }}>
                  <strong>⚠ Is your {fmt(nf(ltGain))} long-term gain from selling business or rental property?</strong> If so it&apos;s a §1231 gain — move it to the &ldquo;Form 4797 Gains (§1231)&rdquo; field above. §1231 gains offset business losses in the excess-business-loss (§461(l)) calculation.
                </div>
              )}

              {result.nolSurplus > 0 && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#1D4ED8' }}>
                  <strong>NOL carryforward:</strong> {fmt(result.nolSurplus)} remaining (80% of taxable income cap applied per IRC §172(a)(2)).
                </div>
              )}

              {result.qbiCarryforward > 0 && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 13, color: '#1D4ED8', lineHeight: 1.55 }}>
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
                <div role="alert" aria-live="polite" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 13, color: '#78350F', lineHeight: 1.55 }}>
                  <strong>⚠ §469 Passive Loss Suspended:</strong> {fmt(result.palSuspendedRental)} of rental loss is passive and suspended this year — it does not reduce your other income. It carries forward on Form 8582.
                  {/* F6: distinguish "unconfirmed" suspension from a confirmed passive result */}
                  {result.rentalIsREP && rentalAggregationElection !== true && step1RentalNetUI < 0 && ' This is suspended because you have not made the §1.469-9(g) aggregation election — check that box on your rental card in Step 1 if you aggregate your hours across all properties and materially participate, to deduct it currently.'}
                  {!result.rentalIsREP && !result.rentalIsActiveParticipant && ' If you materially participate as a real estate professional (§469(c)(7)), set REP status on the rental to deduct it currently.'}
                </div>
              )}

              {/* AUDIT F-15: NIIT conservatively includes §1368(b)(2) excess-distribution
                  stock gain. For a shareholder who MATERIALLY PARTICIPATES in the S-corp,
                  gain on the stock may be excludable from net investment income under
                  §1411(c)(4) (see Prop. Reg. §1.1411-7). Surface the position rather than
                  silently taxing it. */}
              {result.niitIncludesSCorpStockGain && (result.niit?.applies) && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 13, color: '#1E3A8A', lineHeight: 1.55 }}>
                  <strong>NIIT note:</strong> your 3.8% NIIT base includes the capital gain from S-Corp
                  distributions in excess of basis. If you <strong>materially participate</strong> in the
                  S-Corp&apos;s trade or business, some or all of that gain may be excludable from net
                  investment income under IRC §1411(c)(4) — a position this estimate does not take.
                  Ask your CPA whether the exclusion applies before filing.
                </div>
              )}
            </div>
          )}

          {/* SE Tax Savings panel — Finding 4 + Finding 1 follow-up (audit, Jul 2026):
              The savings is the treatment of K-1 BUSINESS INCOME as non-SE (true whether or
              not it is distributed), NOT a benefit of taking distributions. Two DIFFERENT
              structures produce a positive ficaSavings, and they are exempt for DIFFERENT
              legal reasons — the copy must not conflate them:
                • S corporation — the shareholder's K-1 ordinary income is not SE income;
                  FICA is owed on reasonable W-2 officer wages instead (Rev. Rul. 74-44).
                • Limited-partner interest — a limited partner's distributive share is
                  excluded from SE income under IRC §1402(a)(13); there are no "officer
                  wages" and Rev. Rul. 74-44 does not apply.
              The prior copy hardcoded the S-Corp explanation for BOTH, mislabeling a
              partnership as an "S-Corp" and citing an inapplicable rule. A general partner
              or materially-participating LLC member is SE-subject and never reaches this
              panel (ficaSavings === 0). */}
          {hasResult && result.ficaSavings > 0 && (() => {
            const seExemptFromSCorp = Array.isArray(entities)
              && entities.some(e => e && isSCorpEntity(e.type))
            const seExemptFromLimitedPartner = Array.isArray(entities)
              && entities.some(e => e && e.limitedPartner
                && /partner|mmllc|llc/i.test(e.type || '') && !isSCorpEntity(e.type))
            // Heading names the structure actually driving the exemption; never assert
            // "S-Corp" unless an S-corp is present.
            const structureLabel = seExemptFromSCorp && seExemptFromLimitedPartner
              ? 'S-Corp K-1 and limited-partner'
              : seExemptFromLimitedPartner
                ? 'limited-partnership K-1'
                : 'S-Corp K-1'
            return (
            <div style={{ background: '#0D1B3E', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80', letterSpacing: '0.5px', marginBottom: 6 }}>
                SE TAX SAVINGS VS. SOLE PROPRIETORSHIP
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#4ADE80' }}>
                {fmt(result.ficaSavings)}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 1.5 }}>
                Your {fmt(result.k1Distributions || 0)} of {structureLabel} business income isn't subject to
                self-employment tax
                {seExemptFromLimitedPartner && !seExemptFromSCorp ? (
                  <> — a limited partner's distributive share of ordinary business income is excluded from
                  self-employment earnings under IRC §1402(a)(13). </>
                ) : seExemptFromSCorp && seExemptFromLimitedPartner ? (
                  <> — S-Corp shareholders owe FICA only on their W-2 officer wages, and a limited partner's
                  share is excluded under IRC §1402(a)(13). </>
                ) : (
                  <> — S-Corp shareholders owe FICA only on their W-2 officer wages, not on their share of
                  business income (whether or not it is distributed). </>
                )}
                As a sole proprietor, that same income would incur SE tax on 92.35% of earnings
                (IRC §1402(a)(12)): ~{fmt(result.ficaSavings)} in SE tax avoided.
                {seExemptFromSCorp && (
                  <> This relies on paying yourself reasonable W-2 compensation first (Rev. Rul. 74-44).</>
                )}
                {seExemptFromLimitedPartner && !seExemptFromSCorp && (
                  <> This exclusion applies only to a genuine limited-partner interest — a general partner or
                  materially-participating LLC member owes SE tax on this income.</>
                )}
              </div>
            </div>
            )
          })()}

          {/* ── AUDIT B-1 FOLLOW-UP (Jul 2026): ASK, DON'T GUESS ────────────────────────
              The engine used to silently grant the full 20% §199A deduction when no W-2
              wage or UBIA data was entered — a "convenience" that understated tax by
              $60,466 on one audit record. It now correctly applies the $0 cap the statute
              requires. But a $0 cap the user doesn't understand is its own failure, so
              when the cap binds BECAUSE the data is missing, we say so and tell them
              exactly what to enter. Missing data is a question, not a default. */}
          {hasResult && result.qbiWageDataMissing && (result.qbiCaps?.qbi || 0) > (result.qbi || 0) && (
            <div role="alert" aria-live="polite" style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: '#991B1B', lineHeight: 1.55 }}>
              <strong>⚠ Your §199A deduction is capped at {fmt(result.qbi || 0)} — we may be missing two numbers.</strong>
              <div style={{ marginTop: 6 }}>
                Your taxable income is above the §199A threshold, so the deduction is limited to the greater of
                50% of the business&apos;s W-2 wages, or 25% of W-2 wages plus 2.5% of qualified property (UBIA).
                This record reports <strong>$0 of both</strong>, so the cap is <strong>$0</strong>.
              </div>
              <div style={{ marginTop: 6 }}>
                If that&apos;s right — a sole proprietor with no payroll and no depreciable property — then this
                figure is correct and no action is needed. <strong>If the business does pay W-2 wages, or owns
                property still within its depreciation period, enter those amounts in Step 1</strong> (expand
                &ldquo;§199A QBI Deduction&rdquo; on the entity card). Without them you could be overstating your tax by up to{' '}
                {fmt(Math.round(((result.qbiCaps?.qbi || 0) - (result.qbi || 0)) * (result.marginalRate || 0)))}.
              </div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>
                Reg. §1.199A-2. W-2 wages are the wages the business itself paid (Form W-3, Box 1); UBIA is the
                unadjusted cost basis of qualified property still inside its depreciable life.
              </div>
            </div>
          )}

          {/* Underpayment penalty warning */}
          {hasResult && result.balance > 0 && !nf(priorYearTax) && (
            <div role="alert" aria-live="polite" style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12, color: '#92400E' }}>
              <strong>⚠ You may owe an IRS underpayment penalty:</strong> you have a balance due but haven&apos;t entered prior year tax (the penalty rule is IRC §6654). Enter your prior year total tax in{' '}
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
                  {Array.isArray(result.installmentSchedule) && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                        Per-installment schedule (§6654(d)(1)(A); withholding deemed paid evenly, §6654(g)(1))
                        {result.installmentSchedule[0]?.approximate && ' — approximate: enter per-quarter payments above for exact timing'}
                      </div>
                      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ color: '#64748B', textAlign: 'right' }}>
                          <th style={{ textAlign: 'left', padding: '2px 4px' }}>Due</th>
                          <th style={{ padding: '2px 4px' }}>Required (cum.)</th>
                          <th style={{ padding: '2px 4px' }}>Paid (cum.)</th>
                          <th style={{ padding: '2px 4px' }}>Shortfall</th>
                        </tr></thead>
                        <tbody>
                          {result.installmentSchedule.map((q, i) => (
                            <tr key={i} style={{ textAlign: 'right', color: q.shortfall > 0 ? '#9C1F1F' : '#166534' }}>
                              <td style={{ textAlign: 'left', padding: '2px 4px' }}>{['Apr 15', 'Jun 15', 'Sep 15', 'Jan 15'][i]}</td>
                              <td style={{ padding: '2px 4px' }}>{fmt(q.requiredCumulative)}</td>
                              <td style={{ padding: '2px 4px' }}>{fmt(q.paidCumulative)}</td>
                              <td style={{ padding: '2px 4px' }}>{q.shortfall > 0 ? fmt(q.shortfall) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                        Shortfalls accrue interest-rate penalties per installment (§6621: federal short-term rate + 3 points,
                        reset quarterly) until paid. Seasonal income? The §6654(d)(2) annualized-income method (Form 2210
                        Schedule AI) can reduce or eliminate earlier-quarter penalties — ask your CPA.
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ fontSize: 13, color: SL, marginTop: 8, lineHeight: 1.5 }}>
                Due: {ESTIMATE_DUE_DATES[taxYear] || 'Apr 15 · Jun 15 · Sep 15 · Jan 15'}
              </div>
            </div>
          )}

          {/* Federal-only notice */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: SL, textAlign: 'center', lineHeight: 1.5 }}>
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
                <div style={{ fontSize: 11, color: G, textAlign: 'center', marginTop: 4, fontWeight: 600 }}>
                  Record saved to Dashboard
                </div>
              )}
            </div>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </main>

      {/* ── D-3 (A) Explicit sync: the save-choice dialog ── */}
      {saveChoice !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '26px 28px', maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: N, marginBottom: 8 }}>Save your changes</div>
            <p style={{ fontSize: 13, color: SL, lineHeight: 1.5, margin: '0 0 16px' }}>
              You loaded <strong style={{ color: N }}>{readActiveRecordName() || 'a saved record'}</strong>. Update it with these changes, or keep it as-is and save this as a new record?
            </p>
            <button
              onClick={() => { const after = saveChoice; setSaveChoice(null); doSave({}, after) }}
              style={{ width: '100%', padding: '11px', background: N, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 10 }}
            >
              Update “{readActiveRecordName() || 'loaded record'}”
            </button>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={saveAsName}
                onChange={ev => setSaveAsName(ev.target.value)}
                placeholder="New record name (optional)"
                aria-label="New record name"
                style={{ flex: 1, padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
              />
              <button
                onClick={() => { const after = saveChoice; setSaveChoice(null); doSave({ forceNew: true, newName: saveAsName.trim() || null }, after) }}
                style={{ padding: '10px 16px', background: '#fff', color: B, border: `1.5px solid ${B}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Save as new
              </button>
            </div>
            <button onClick={() => setSaveChoice(null)} style={{ width: '100%', padding: '8px', background: 'none', color: SL, border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
