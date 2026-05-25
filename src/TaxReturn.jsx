// src/TaxReturn.jsx
// Step 2 of the TaxStat360 two-step flow: Personal Tax Return.
// Reads entity / K-1 data from session state (written by CalculateTaxInner.jsx)
// and adds personal income, deductions, and filing info to produce the
// estimated federal tax liability.
//
// ── Change log ────────────────────────────────────────────────────────────────
// BUG-01 FIX: Duplicate Prior Year Passive Loss Carryforward (priorPAL) field.
//   Two consecutive MoneyInput blocks for priorPAL existed in the Rental Real
//   Estate section — one conditionally rendered when nf(priorPAL) !== 0, and one
//   always rendered when !isREP. When priorPAL had a non-zero value, BOTH rendered
//   simultaneously, creating a duplicated form field. Merged into a single always-
//   visible field (retaining the InfoTip from the conditional block).
//
// L-02 FIX: "S-Corp FICA Savings" renamed to "SE Tax Savings on Distributions".
//
// C-06 FIX: 2026 tax year dropdown option shortened to "2026 (OBBBA)".
//
// UX-05 FIX: Micro-text added beneath each save button to disambiguate navigation.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, calcQBI, getStdDed, getTable, QBI_THRESHOLDS } from './taxCalc'
import {
  readPersonalContext, writePersonalContext,
  readTaxYear, writeTaxYear,
  readStep1State, writeStep1State,
} from './utils/sessionState.js'
import { parseMoney } from './utils/parseMoney.js'
import { signOut } from './utils/signOut'
import { fmt, pct } from './utils/formatMoney.js'
import { ownPct, isSCorpEntity, isPassthroughEntity, SE_SUBJECT_TYPES } from './utils/entityPredicates.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R } from './theme.js'
import { API_BASE_URL } from './constants.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const nf = (v, fb = 0) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : fb }

function InfoTip({ text, wide }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <button
        onClick={() => setShow(s => !s)}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        style={{ width: 15, height: 15, borderRadius: '50%', background: '#E2E8F0', border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, color: SL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
        ?
      </button>
      {show && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: N, color: '#fff', borderRadius: 8, padding: '10px 14px',
          fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap',
          width: wide ? 360 : 290, zIndex: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid ' + N }} />
        </div>
      )}
    </span>
  )
}

function MoneyInput({ value, onChange, placeholder, disabled, id, style: sx }) {
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
      type="text"
      inputMode="decimal"
      value={raw}
      disabled={disabled}
      placeholder={placeholder || '0'}
      onChange={e => { const v = e.target.value.replace(/[^0-9.\-]/g, ''); setRaw(v); onChange(v) }}
      onFocus={() => { setFocused(true); setRaw(String(value || '').replace(/,/g, '')) }}
      onBlur={() => {
        setFocused(false)
        const n = nf(raw)
        if (Number.isFinite(n)) { setRaw(n.toLocaleString('en-US', { maximumFractionDigits: 0 })); onChange(String(n)) }
      }}
      style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: disabled ? '#F8FAFC' : '#fff', color: disabled ? '#94A3B8' : N, ...sx }}
    />
  )
}

function CollapsibleSection({ title, badge, children, defaultOpen = false, accent }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '13px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: open ? (accent || '#EFF6FF') : '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: N }}>{title}</span>
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
  const [taxYear, setTaxYear] = useState(() => readTaxYear() || 2025)

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

  const [rentalIncome,        setRentalIncome]        = useState(savedCtx.rentalIncome   || '')
  const [rentalExpenses,      setRentalExpenses]      = useState(savedCtx.rentalExpenses || '')
  const [isREP,               setIsREP]               = useState(!!(savedCtx.isREP))
  const [isActiveParticipant, setIsActiveParticipant] = useState(savedCtx.isActiveParticipant === true)
  const [priorPAL,            setPriorPAL]            = useState(savedCtx.priorPassiveLossCarryforward || '')

  const [useItemized,       setUseItemized]      = useState(!!(savedCtx.useItemized))
  const [itemizedAmt,       setItemizedAmt]      = useState(savedCtx.itemizedAmt         || '')
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

  const [saveStatus, setSaveStatus] = useState('idle')

  const ytdFactor = ytdMode ? (12 / ytdMonth) : 1

  const calcInput = useMemo(() => {
    const entityList = Array.isArray(entities) ? entities : []
    const form4797Total = nf(form4797) + entityList.reduce((s, e) => s + (nf(e.box17K)), 0)
    return {
      taxYear, status: filingStatus, dependents: nf(dependents),
      entities: entityList, w2: nf(w2Income), k1Total: sessionK1 || 0,
      rentalNet: nf(rentalIncome) - nf(rentalExpenses),
      stGain: nf(stGain), ltGain: nf(ltGain), intInc: nf(interest),
      divInc: nf(dividends), qualDiv: nf(qualDividends), f4797Inc: form4797Total,
      taxableSS: 0, iraIncome: 0,
      selfEmpHealthIns: nf(selfEmpHealthIns), hsaDeduction: nf(hsaDeduction),
      studentLoanInt: nf(studentLoanInt), selfEmpRetirement: nf(selfEmpRetirement),
      nolCarryforward: nf(nolCarryforward), priorYearQBILoss: nf(priorYearQBILoss),
      saltAmount: nf(saltAmount), hasISO, isoBargainElement: nf(isoBargainElement),
      isREP, isActiveParticipant,
      unrecap1250: nf(unrecap1250), collectiblesGain: nf(collectibles),
      w2Withheld: nf(w2Withheld), estPaid: nf(estPaid), ytdFactor,
      priorYearTax: nf(priorYearTax), priorYearAGI: nf(priorYearAGI),
      priorPassiveLossCarryforward: nf(priorPAL),
      useItemized, itemizedAmt: nf(itemizedAmt),
    }
  }, [
    taxYear, filingStatus, dependents, entities, w2Income, w2Withheld, estPaid,
    sessionK1, rentalIncome, rentalExpenses, isREP, isActiveParticipant, priorPAL,
    stGain, ltGain, interest, dividends, qualDividends, unrecap1250, collectibles, form4797,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, saltAmount, useItemized, itemizedAmt,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI, ytdFactor,
  ])

  const result = useMemo(() => {
    try { return calcTaxReturn(calcInput) }
    catch { return null }
  }, [calcInput])

  useEffect(() => {
    writePersonalContext({
      filingStatus, w2Income, w2Withheld, estPaid, dependents, ytdMode, ytdMonth,
      stGain, capitalGains: ltGain, ltGain, interest, dividends, qualDividends,
      qualifiedDividends: qualDividends, unrecap1250, collectiblesGain: collectibles, form4797,
      rentalIncome, rentalExpenses, isREP, isActiveParticipant,
      priorPassiveLossCarryforward: priorPAL,
      selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
      nolCarryforward, priorYearLosses: priorYearQBILoss,
      useItemized, itemizedAmt, saltAmount, hasISO, isoBargainElement,
      priorYearTax, priorYearAGI,
    })
  }, [
    filingStatus, w2Income, w2Withheld, estPaid, dependents, ytdMode, ytdMonth,
    stGain, ltGain, interest, dividends, qualDividends, unrecap1250, collectibles, form4797,
    rentalIncome, rentalExpenses, isREP, isActiveParticipant, priorPAL,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, useItemized, itemizedAmt, saltAmount,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI,
  ])

  const handleSave = useCallback(({ thenNavigate } = {}) => {
    if (saveStatus === 'saving') return
    setSaveStatus('saving')

    const email    = localStorage.getItem('ts360_email') || 'default'
    const key      = 'ts360_records_' + email
    const existing = JSON.parse(localStorage.getItem(key) || '[]')

    const record = {
      id: Date.now(),
      savedAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
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
        unrecap1250, collectiblesGain: collectibles, form4797,
        rentalIncome, rentalExpenses, isREP, isActiveParticipant,
        priorPassiveLossCarryforward: priorPAL,
        selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
        nolCarryforward, priorYearLosses: priorYearQBILoss,
        useItemized, itemizedAmt, saltAmount, hasISO, isoBargainElement,
        priorYearTax, priorYearAGI,
      },
      totalSuspendedLoss: result?.totalSuspendedLoss || 0,
      entityBasisResults: result?.entityBasisResults || [],
    }

    const updated = [record, ...existing].slice(0, 50)
    localStorage.setItem(key, JSON.stringify(updated))
    localStorage.setItem('ts360_records', JSON.stringify(updated))

    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 3000)

    if (thenNavigate) {
      sessionStorage.setItem('ts360_active_record_id', String(record.id))
      navigate(thenNavigate, { state: { record } })
    }
  }, [
    saveStatus, taxYear, entities, sessionK1, filingStatus, dependents,
    w2Income, w2Withheld, estPaid, ytdMode, ytdMonth,
    stGain, ltGain, interest, dividends, qualDividends,
    unrecap1250, collectibles, form4797,
    rentalIncome, rentalExpenses, isREP, isActiveParticipant, priorPAL,
    selfEmpHealthIns, hsaDeduction, studentLoanInt, selfEmpRetirement,
    nolCarryforward, priorYearQBILoss, useItemized, itemizedAmt, saltAmount,
    hasISO, isoBargainElement, priorYearTax, priorYearAGI, result, navigate,
  ])

  const stdDed      = getStdDed(taxYear, filingStatus)
  const hasResult   = !!result && result.totalTax >= 0
  const entityList  = Array.isArray(entities) ? entities : []

  const YEARS = [2024, 2025, 2026]
  const FS_OPTIONS = [
    { value: 'single', label: 'Single' },
    { value: 'mfj',    label: 'Married Filing Jointly' },
    { value: 'mfs',    label: 'Married Filing Separately' },
    { value: 'hoh',    label: 'Head of Household' },
    { value: 'qss',    label: 'Qualifying Surviving Spouse' },
  ]

  const inputLbl = { fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 5 }
  const inpWrap  = { marginBottom: 14 }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="30" height="30" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill={N}/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {[
              { n: 1, label: 'Entities', active: false, done: true },
              { n: 2, label: 'Return',   active: true,  done: false },
              { n: 3, label: 'AI',       active: false, done: false },
            ].map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.done ? G : s.active ? B : '#E2E8F0', color: s.done || s.active ? '#fff' : '#94A3B8', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.done ? '✓' : s.n}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: s.active ? 700 : 500, color: s.active ? N : s.done ? G : '#94A3B8', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
                {i < 2 && <span style={{ color: '#CBD5E1', fontSize: 12 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/calculate-tax')} style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>← Back to Business</button>
          <button onClick={() => navigate('/dashboard')}     style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Dashboard</button>
          <button onClick={() => navigate('/ai-analysis')}  style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>AI Analysis</button>
          <button onClick={() => signOut(navigate)}         style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Sign Out</button>
          <button onClick={() => navigate('/settings')}     style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Settings</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px 100px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Input form ────────────────────────────────────────────── */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 6px' }}>Personal Tax Return</h1>
          <p style={{ color: SL, fontSize: 13, margin: '0 0 20px' }}>
            K-1 income from Step 1 flows automatically. Add personal income, deductions, and withholding to see your complete estimated federal tax liability.
          </p>

          {/* Year + Filing Status */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={inputLbl}>Tax Year</label>
                <select value={taxYear} onChange={e => { const y = parseInt(e.target.value); setTaxYear(y); writeTaxYear(y) }}
                  style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, fontFamily: 'inherit', outline: 'none' }}>
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y === 2026 ? '2026 (OBBBA)' : String(y)}</option>
                  ))}
                </select>
                {taxYear === 2026 && (
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, lineHeight: 1.5 }}>
                    Per Rev. Proc. 2025-32 (One Big Beautiful Budget Act, P.L. 119-21).
                    §461(l) EBL thresholds estimated — verify when IRS publishes final guidance.
                  </div>
                )}
              </div>
              <div>
                <label style={inputLbl}>Filing Status</label>
                <select value={filingStatus} onChange={e => setFilingStatus(e.target.value)}
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
              {entityList.map((e, i) => {
                const pnl = e.pnl || {}
                const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
                const own = ownPct(e.own) / 100
                const k1  = Math.round(net * own) - (nf(e.box11_12)) - (nf(e.box12_13))
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, borderBottom: i < entityList.length - 1 ? '1px solid #BFDBFE' : 'none' }}>
                    <span style={{ color: '#1D4ED8' }}>{e.name || e.type} ({e.own || 100}%)</span>
                    <span style={{ fontWeight: 700, color: k1 >= 0 ? '#1D4ED8' : R }}>{fmt(k1)}</span>
                  </div>
                )
              })}
              {entityList.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', fontSize: 13, fontWeight: 700, borderTop: '1px solid #BFDBFE', marginTop: 4 }}>
                  <span style={{ color: '#1D4ED8' }}>Total K-1</span>
                  <span style={{ color: '#1D4ED8' }}>{fmt(sessionK1 || 0)}</span>
                </div>
              )}
            </div>
          )}

          {/* W-2 income */}
          <CollapsibleSection title="W-2 Income & Withholding" defaultOpen badge={nf(w2Income) > 0 ? fmt(nf(w2Income)) : undefined}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  W-2 Income (Additional)
                  <InfoTip text="Enter any W-2 wages NOT from your business entity. If you're a W-2 employee at another company in addition to owning a business, enter those wages here. Officer salary from your S-Corp flows automatically from Step 1." />
                </label>
                <MoneyInput value={w2Income} onChange={setW2Income} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Federal Tax Withheld (W-2 Box 2)
                  <InfoTip text="Federal income tax withheld from your W-2 Box 2. This reduces your balance due. Also include withholding from pension / annuity income (Form 1099-R Box 4) if applicable." />
                </label>
                <MoneyInput value={w2Withheld} onChange={setW2Withheld} placeholder="0" />
              </div>
            </div>
            {/* UX-08: Remind S-Corp owners to enter their W-2 withholding */}
            {entityList.some(e => /s.?corp/i.test(e?.type || '')) && (
              <div style={{ marginTop: 10, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
                💡 <strong>S-Corp owner:</strong> If you paid yourself a W-2 salary in Step 1, enter the federal income tax withheld here (W-2 Box 2). FICA taxes (Boxes 4 and 6) are separate — don't include those here.
              </div>
            )}
          </CollapsibleSection>

          {/* UX-05: YTD mode — renamed to surface mid-year use case */}
          <div style={{ background: ytdMode ? '#EFF6FF' : '#fff', border: `1px solid ${ytdMode ? '#BFDBFE' : '#E2E8F0'}`, borderRadius: 12, padding: '14px 18px', marginBottom: 12, transition: 'background 0.2s, border-color 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: N }}>
                  📅 Planning Mid-Year?
                  <InfoTip text={'Year-to-date mode: enter income and expenses as of today and we\'ll annualize to project your full-year liability.\n\nUseful mid-year for planning — e.g. in September, enter what you\'ve earned through September.\n\nDisable to enter full-year figures directly.'} />
                </span>
                {!ytdMode && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Enable YTD Mode to annualize your income for a full-year projection</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {ytdMode && (
                  <select value={ytdMonth} onChange={e => setYtdMonth(parseInt(e.target.value))}
                    style={{ padding: '6px 10px', border: '1.5px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: N, outline: 'none' }}>
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                      <option key={i+1} value={i+1}>{m}</option>
                    ))}
                  </select>
                )}
                <div onClick={() => setYtdMode(m => !m)} style={{ width: 44, height: 24, background: ytdMode ? B : '#CBD5E1', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 3, left: ytdMode ? 23 : 3, width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            </div>
            {ytdMode && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#1D4ED8', fontWeight: 600 }}>
                📅 YTD through {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ytdMonth-1]} — figures will be annualized (× {ytdFactor.toFixed(2)})
              </div>
            )}
          </div>

          {/* Dependents + estimated payments */}
          <CollapsibleSection title="Dependents & Estimated Payments" defaultOpen>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Qualifying Dependents
                  <InfoTip text="Dependents qualifying for the Child Tax Credit (under 17 as of 12/31 of tax year). Each generates up to $2,000–$2,200 CTC (2025–2026). The credit phases out above $400K (MFJ) or $200K (all others)." />
                </label>
                <input type="number" min="0" max="20" value={dependents} onChange={e => setDependents(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: N, boxSizing: 'border-box' }} />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Estimated Tax Payments Made
                  <InfoTip text="Total federal estimated tax payments made for this tax year (Form 1040-ES, Quarters 1–4). Do NOT include your W-2 withholding — that goes in the field above. Due dates: Apr 15, Jun 15, Sep 15, Jan 15." />
                </label>
                <MoneyInput value={estPaid} onChange={setEstPaid} placeholder="0" />
              </div>
            </div>
          </CollapsibleSection>

          {/* Rental real estate */}
          <CollapsibleSection title="Rental Real Estate" badge={nf(rentalIncome) > 0 ? 'Schedule E' : undefined} accent="#7C3AED">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label style={inputLbl}>Rental Income</label>
                <MoneyInput value={rentalIncome} onChange={setRentalIncome} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>Rental Expenses (incl. depreciation)</label>
                <MoneyInput value={rentalExpenses} onChange={setRentalExpenses} placeholder="0" />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
              <input type="checkbox" id="rep" checked={isREP} onChange={e => setIsREP(e.target.checked)} style={{ marginTop: 2 }} />
              <label htmlFor="rep" style={{ fontSize: 13, color: N, cursor: 'pointer', lineHeight: 1.5 }}>
                Real Estate Professional (REP) — IRC §469(c)(7)
                <InfoTip text={'REP status allows unlimited rental loss deductions against all income.\n\nTo qualify, BOTH of the following must be true:\n① More than 750 hours in real property trades/businesses (material participation)\n② More than 50% of ALL your personal service time is in real estate\n\n⚠ If you have a significant W-2 job, qualifying is very difficult. The IRS scrutinizes this heavily. Contemporaneous time logs are required.'} wide />
              </label>
            </div>
            {!isREP && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input type="checkbox" id="active" checked={isActiveParticipant} onChange={e => setIsActiveParticipant(e.target.checked)} />
                <label htmlFor="active" style={{ fontSize: 13, color: N, cursor: 'pointer' }}>
                  Active Participant (§469(i) $25K allowance)
                  <InfoTip text="If you actively participated in managing the rental (made management decisions, approved tenants, set rental terms, etc.) you may deduct up to $25,000 in rental losses against non-passive income.\n\nPhase-out: The $25K allowance phases out at 50¢ per dollar of AGI above $100,000 and reaches $0 at $150,000 AGI (IRC §469(i)(3)).\n\nMFS filers: $0 allowance regardless of AGI (IRC §469(i)(4)) — do not check this box if filing Married Filing Separately.\n\nAbove $150K AGI, losses may still be usable against other passive income or carried forward to future years." />
                </label>
              </div>
            )}
            {/* BUG-01 FIX: Single priorPAL field replaces the prior two-field duplicate.
                The original code had two consecutive MoneyInput blocks for priorPAL:
                  1. Conditional: rendered only when nf(priorPAL) !== 0
                  2. Always: rendered whenever !isREP
                When priorPAL had a value, both rendered simultaneously — duplicate field.
                Merged into one always-visible field with the InfoTip from the conditional. */}
            {!isREP && (
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Prior Year Passive Loss Carryforward (Form 8582)
                  <InfoTip text="Suspended passive losses from prior years (Form 8582, Line 3). These are released when the rental activity generates passive income. Enter the total carryforward, NOT the current-year loss." />
                </label>
                <MoneyInput value={priorPAL} onChange={setPriorPAL} placeholder="0" />
              </div>
            )}
          </CollapsibleSection>

          {/* Capital gains & investment */}
          <CollapsibleSection title="Capital Gains & Investment Income" badge={nf(ltGain) > 0 || nf(stGain) > 0 || nf(interest) > 0 ? 'Schedule D' : undefined} accent="#0891B2">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label style={inputLbl}>Short-Term Capital Gains (or losses)</label>
                <MoneyInput value={stGain} onChange={setStGain} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Long-Term Capital Gains (or losses)
                  <InfoTip text="Net long-term capital gains on assets held more than 1 year. Taxed at 0%, 15%, or 20% depending on taxable income — not at ordinary rates." />
                </label>
                <MoneyInput value={ltGain} onChange={setLtGain} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>Interest Income (Schedule B)</label>
                <MoneyInput value={interest} onChange={setInterest} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>Ordinary Dividends</label>
                <MoneyInput value={dividends} onChange={setDividends} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Qualified Dividends (Form 1099-DIV Box 1b)
                  <InfoTip text="Qualified dividends are taxed at long-term capital gains rates (0/15/20%). Must be a subset of ordinary dividends — cannot exceed total dividends entered above." />
                </label>
                <MoneyInput value={qualDividends} onChange={setQualDividends} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Form 4797 Gains (§1231)
                  <InfoTip text="Ordinary gains from the sale of business property (Form 4797). This includes §1231 gains from depreciable real property and equipment used in a trade or business." />
                </label>
                <MoneyInput value={form4797} onChange={setForm4797} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Unrecaptured §1250 Gain
                  <InfoTip text="Depreciation recapture on real property sold at a gain. Taxed at max 25% (lesser of 25% or ordinary rate). This is the accumulated depreciation portion of your gain on real property sales." />
                </label>
                <MoneyInput value={unrecap1250} onChange={setUnrecap1250} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Collectibles Gain (§1(h)(4))
                  <InfoTip text="Gain from the sale of collectibles (coins, art, antiques, gems, stamps) held more than 1 year. Taxed at max 28%." />
                </label>
                <MoneyInput value={collectibles} onChange={setCollectibles} placeholder="0" />
              </div>
            </div>
          </CollapsibleSection>

          {/* Deductions & adjustments */}
          <CollapsibleSection title="Deductions & Above-Line Adjustments">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Self-Employed Health Insurance Premiums
                  <InfoTip text="Premiums for health, dental, and long-term care insurance for yourself and family. 100% deductible for self-employed individuals and S-Corp shareholder-employees if the plan is established in the name of the business. Cannot exceed your net self-employment income." />
                </label>
                <MoneyInput value={selfEmpHealthIns} onChange={setSelfEmpHealthIns} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  HSA Deduction (Form 8889)
                  <InfoTip text="Health Savings Account contributions — deductible if you have a qualifying High-Deductible Health Plan. 2025 limits: $4,300 (self-only) / $8,550 (family). Grows tax-free; withdrawals for medical expenses are always tax-free." />
                </label>
                <MoneyInput value={hsaDeduction} onChange={setHsaDeduction} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Student Loan Interest
                  <InfoTip text="Up to $2,500 deductible above-the-line. Phases out at $75,000–$90,000 (single) / $155,000–$185,000 (MFJ) for 2025. Cannot be claimed MFS." />
                </label>
                <MoneyInput value={studentLoanInt} onChange={setStudentLoanInt} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Self-Employed Retirement Plans
                  <InfoTip text={'Enter employer contributions made to a SEP-IRA or Solo 401(k) for this tax year.\n\nFor S-Corp owners: contributions must be based on your officer W-2 salary — NOT K-1 distributions (IRC §402(h); §415(c); IRS Pub. 560).\n• SEP-IRA: up to 25% of W-2 salary, max $70,000 (2025)\n• Solo 401(k) employer: up to 25% of W-2 salary (can stack with employee deferral)\n• Deadline for S-Corp: September 15 (Form 1120-S due date, NOT October 15)\n\nFor sole proprietors: enter approx. 20% of net self-employment income, max $70,000.\n• Deadline: October 15 (Form 1040 due date with extension)'} wide />
                </label>
                <MoneyInput value={selfEmpRetirement} onChange={setSelfEmpRetirement} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  NOL Carryforward (IRC §172)
                  <InfoTip text="Post-2017 NOL carryforwards are limited to 80% of taxable income per IRC §172(a)(2) (TCJA; retained by OBBBA). Enter your total available NOL carryforward — TaxStat360 applies the 80% cap automatically.\n\nExample: $200K NOL with $100K taxable income → $80K deductible this year (80% cap); $120K carries forward indefinitely.\n\nThe remaining carryforward is shown below the Tax Waterfall when applicable." />
                </label>
                <MoneyInput value={nolCarryforward} onChange={setNolCarryforward} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>
                  Prior Year QBI Loss Carryforward
                  <InfoTip text="If your business generated a net loss last year, that loss reduces your §199A QBI deduction base in the CURRENT year per IRC §199A(c)(2). Enter the absolute value of last year's QBI loss (as a positive number)." />
                </label>
                <MoneyInput value={priorYearQBILoss} onChange={setPriorYearQBILoss} placeholder="0" />
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={inpWrap}>
                    <label style={inputLbl}>Total Itemized Deductions (Schedule A)</label>
                    <MoneyInput value={itemizedAmt} onChange={setItemizedAmt} placeholder={String(stdDed)} />
                  </div>
                  <div style={inpWrap}>
                    <label style={inputLbl}>
                      SALT Amount (before cap)
                      <InfoTip text={`State and local taxes (state income tax + property taxes). The SALT deduction is capped at $${(10000).toLocaleString()} for 2024, $40,000 for 2025, and $40,400 for 2026 (OBBBA). Enter your total SALT paid — TaxStat360 applies the cap for AMT purposes.`} />
                    </label>
                    <MoneyInput value={saltAmount} onChange={setSaltAmount} placeholder="0" />
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
                  <MoneyInput value={isoBargainElement} onChange={setIsoBargainElement} placeholder="0" />
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Safe harbor inputs */}
          <CollapsibleSection title="Safe Harbor Inputs (Prior Year)" badge="Optional">
            <p style={{ fontSize: 12, color: SL, margin: '0 0 12px', lineHeight: 1.6 }}>
              Enter prior year figures to calculate your safe harbor payment amount — the minimum you must pay to avoid underpayment penalties. At AGI above $150K (MFJ) / $75K (others), the safe harbor is 110% of prior year tax.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={inpWrap}>
                <label style={inputLbl}>Prior Year Total Tax (Form 1040 Line 24)</label>
                <MoneyInput value={priorYearTax} onChange={setPriorYearTax} placeholder="0" />
              </div>
              <div style={inpWrap}>
                <label style={inputLbl}>Prior Year AGI (Form 1040 Line 11)</label>
                <MoneyInput value={priorYearAGI} onChange={setPriorYearAGI} placeholder="0" />
              </div>
            </div>
          </CollapsibleSection>

        </div>

        {/* ── RIGHT: Results panel ─────────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 70 }}>

          {/* Main liability card */}
          <div style={{ background: N, borderRadius: 16, padding: '24px', marginBottom: 12, color: '#fff' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', opacity: 0.6, marginBottom: 8 }}>EST. FEDERAL TAX LIABILITY</div>
            <div style={{ fontSize: 42, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>
              {hasResult ? fmt(result.totalTax) : '—'}
            </div>
            {ytdMode && hasResult && (
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                Annualized from YTD (× {ytdFactor.toFixed(2)})
              </div>
            )}
            {hasResult && (
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                Effective rate: {pct(result.effRate ?? (result.agi > 0 ? (result.totalTax / result.agi * 100).toFixed(1) : '0.0'))}
              </div>
            )}
          </div>

          {/* Waterfall */}
          {hasResult && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '18px', marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: N, fontSize: 14, marginBottom: 12 }}>Tax Waterfall</div>

              {[
                { label: 'Business K-1 Income',        value: result.scheduleEK1Income || sessionK1 || 0, sign: 1 },
                { label: 'Schedule C Income',           value: result.scheduleCSEIncome || 0,              sign: 1, hide: !(result.scheduleCSEIncome > 0) },
                { label: 'W-2 Wages',                   value: nf(w2Income),                              sign: 1, hide: nf(w2Income) === 0 },
                { label: 'Rental Income (net)',          value: nf(rentalIncome) - nf(rentalExpenses),     sign: 1, hide: nf(rentalIncome) === 0 },
                { label: 'Capital Gains (LT)',          value: nf(ltGain),                                sign: 1, hide: nf(ltGain) === 0 },
                { label: 'Capital Gains (ST)',          value: nf(stGain),                                sign: 1, hide: nf(stGain) === 0 },
                { label: 'Interest & Dividends',        value: nf(interest) + nf(dividends),             sign: 1, hide: nf(interest) + nf(dividends) === 0 },
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
                { label: 'Total Tax',                   value: result.totalTax,                          sign: 1, bold: true },
                { label: 'Withholding & Est. Pmts',     value: result.totalPayments,                     sign: -1, hide: result.totalPayments === 0 },
                { label: '—', value: 0, divider: true },
                { label: result.balance >= 0 ? 'Balance Due' : 'Estimated Refund', value: Math.abs(result.balance), sign: result.balance >= 0 ? 1 : -1, bold: true, accent: result.balance >= 0 ? R : G },
              ].filter(r => !r.hide).map((row, i) => {
                if (row.divider) return <div key={i} style={{ borderTop: '1px solid #F1F5F9', margin: '6px 0' }} />
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                      <span style={{ color: row.accent || SL, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                      <span style={{ fontWeight: row.bold ? 700 : 500, color: row.accent || N }}>
                        {row.sign < 0 ? '−' : ''}{fmt(Math.abs(row.value))}
                      </span>
                    </div>
                    {row.note && (
                      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2, paddingLeft: 2 }}>{row.note}</div>
                    )}
                  </div>
                )
              })}

              {result.ebl > 0 && result.eblThreshold > 0 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#991B1B' }}>
                  <strong>⚠ §461(l) EBL:</strong> {fmt(result.ebl)} added back to income (threshold: {fmt(result.eblThreshold)}).
                  Excess business losses are limited to {fmt(result.eblThreshold)} ({filingStatus.toUpperCase()}).
                </div>
              )}

              {result.nolSurplus > 0 && (
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#1D4ED8' }}>
                  <strong>NOL carryforward:</strong> {fmt(result.nolSurplus)} remaining (80% of taxable income cap applied per IRC §172(a)(2)).
                </div>
              )}

              {result.qbiAggregationApplied && result.qbiAggregationDisclosure && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#78350F' }}>
                  <strong>⚠ QBI Aggregation Assumed:</strong> {result.qbiAggregationDisclosure}
                </div>
              )}

              {result.totalSuspendedLoss > 0 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12, color: '#991B1B' }}>
                  <strong>⚠ §1366(d) Basis Limit:</strong> {fmt(result.totalSuspendedLoss)} in S-Corp losses suspended — not deductible this year. Carry forward to restore basis.
                </div>
              )}
            </div>
          )}

          {/* SE Tax Savings panel */}
          {hasResult && result.ficaSavings > 0 && (
            <div style={{ background: '#0f1f3d', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
              {/* L-02 FIX: Renamed from "S-Corp FICA Savings" to "SE Tax Savings on Distributions". */}
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
                  <strong>Safe harbor:</strong> Pay {fmt(result.safeHarborQuarterly)}/qtr (min of 90% current-year or {nf(priorYearAGI) > (filingStatus === 'mfs' ? 75000 : 150000) ? '110%' : '100%'} prior-year tax = {fmt(result.safeHarborMinimum)}) to avoid IRC §6654 penalties.
                </div>
              )}
              <div style={{ fontSize: 11, color: SL, marginTop: 8, lineHeight: 1.5 }}>
                Due: Apr 15 · Jun 15 · Sep 15 · Jan 15
              </div>
            </div>
          )}

          {/* Federal-only notice */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 11, color: SL, textAlign: 'center', lineHeight: 1.5 }}>
            🇺🇸 <strong>Federal income tax only.</strong> State income tax is not included. Add your state&apos;s effective rate separately for a complete liability picture.
          </div>

          {/* Save buttons — UX-06: secondary/primary hierarchy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Primary CTA — solid navy */}
            <div>
              <button
                onClick={() => handleSave({ thenNavigate: '/ai-analysis' })}
                disabled={saveStatus === 'saving'}
                style={{ width: '100%', padding: '13px', background: N, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saveStatus === 'saving' ? 'default' : 'pointer' }}
              >
                Save &amp; Analyze →
              </button>
              <div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>
                Saves and goes to AI Tax Analysis
              </div>
            </div>
            {/* Secondary CTA — outlined */}
            <div>
              <button
                onClick={() => handleSave()}
                disabled={saveStatus === 'saving'}
                style={{ width: '100%', padding: '11px', background: saveStatus === 'saved' ? '#F0FDF4' : '#fff', color: saveStatus === 'saved' ? G : B, border: `1.5px solid ${saveStatus === 'saved' ? G : B}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: saveStatus === 'saving' ? 'default' : 'pointer' }}
              >
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved!' : '💾 Save This Record'}
              </button>
              {saveStatus !== 'saved' && (
                <div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>
                  Saves your work — stay on this page
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
            Estimates for planning only — not professional tax advice. Consult a licensed CPA before filing.
          </div>
        </div>
      </div>
    </div>
  )
}
