import React from 'react'
import { useNavigate } from 'react-router-dom'
import { TAX_TABLES, AMT_TABLES, SALT_CAPS, getTable, getStdDed, getBrackets, getLTCGThresholds, getAddlMedicareThreshold, calcFederalTax, calcPreferentialTax, calcNIIT, calcAMT, calcQBI, nv, calcTaxReturn } from './taxCalc'

const N = '#0D1B3E'
const B = '#2563EB'
const G = '#16a34a'
const R = '#dc2626'
const SL = '#475569'

function fmt(n) {
  if (n === null || n === undefined) return '$0'
  const abs = Math.abs(Math.round(n))
  const str = '$' + abs.toLocaleString('en-US')
  return n < 0 ? '(' + str + ')' : str
}

// Money input with live comma formatting (used for all currency fields in TaxReturn)
// Storage: string with commas; nv() parses downstream
function MoneyInput({ value, onChange, placeholder, style }) {
  const display = (() => {
    const s = (value ?? '').toString()
    if (s === '' || s === '-') return s
    const cleaned = s.replace(/[^0-9.-]/g, '')
    if (cleaned === '' || cleaned === '-') return cleaned
    const n = parseFloat(cleaned)
    if (isNaN(n)) return ''
    const trailingDot = s.endsWith('.')
    const decMatch = cleaned.match(/\.([0-9]*)$/)
    const intPart = Math.trunc(Math.abs(n)).toLocaleString('en-US')
    const sign = n < 0 ? '-' : ''
    if (trailingDot) return sign + intPart + '.'
    if (decMatch && decMatch[1]) return sign + intPart + '.' + decMatch[1]
    return sign + intPart
  })()
  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      style={style}
      onChange={e => onChange(e.target.value)}
    />
  )
}


// Tax bracket indicator
function BracketBadge({ rate }) {
  const colors = {
    0: { bg: '#f0fdf4', color: '#15803d', label: '0%' },
    10: { bg: '#f0fdf4', color: '#15803d', label: '10%' },
    12: { bg: '#eff6ff', color: '#1d4ed8', label: '12%' },
    22: { bg: '#fefce8', color: '#854d0e', label: '22%' },
    24: { bg: '#fff7ed', color: '#9a3412', label: '24%' },
    32: { bg: '#fef2f2', color: '#b91c1c', label: '32%' },
    35: { bg: '#fef2f2', color: '#991b1b', label: '35%' },
    37: { bg: '#450a0a', color: '#fca5a5', label: '37%' },
  }
  const c = colors[Math.round(rate * 100)] || { bg: '#f1f5f9', color: N, label: Math.round(rate * 100) + '%' }
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {c.label} bracket
    </span>
  )
}

// ── Info Tooltip ──
function InfoTip({ text }) {
  const [show, setShow] = React.useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 5, verticalAlign: 'middle' }}>
      <span onMouseEnter={()=>setShow(true)} onMouseLeave={()=>setShow(false)} onClick={()=>setShow(v=>!v)}
        style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:16,height:16,borderRadius:'50%',
          background:'#DBEAFE',color:'#2563EB',fontSize:10,fontWeight:800,cursor:'pointer',border:'1px solid #93C5FD' }}>i</span>
      {show&&<span style={{ position:'absolute',bottom:'120%',left:'50%',transform:'translateX(-50%)',
        background:'#1E293B',color:'#fff',fontSize:12,padding:'8px 12px',borderRadius:8,width:240,
        lineHeight:1.5,zIndex:9999,boxShadow:'0 4px 16px rgba(0,0,0,0.2)',pointerEvents:'none',whiteSpace:'normal' }}>
        {text}
        <span style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',
          borderWidth:5,borderStyle:'solid',borderColor:'#1E293B transparent transparent transparent'}}/>
      </span>}
    </span>
  )
}

// ── Collapsible Section ──
function CollapsibleSection({ title, children, defaultOpen = true, badge = null }) {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', marginBottom: 16, position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', background: 'none', border: 'none', padding: '14px 20px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: open ? '1px solid #F1F5F9' : 'none', borderRadius: 14 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '1px' }}>{title}</div>
          {badge && <span style={{ fontSize: 11, background: '#DBEAFE', color: '#1D4ED8', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{badge}</span>}
        </div>
        <span style={{ fontSize: 11, color: '#94A3B8', transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {open && <div style={{ padding: '4px 20px 20px 20px' }}>{children}</div>}
    </div>
  )
}


// ── Feature #5: Collapsible "What goes here?" field explainers ───────────────
function WhatGoesHere({ items }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontSize: 12, color: '#2563EB', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4
      }}>
        {open ? '▲' : '▼'} What goes here?
      </button>
      {open ? (
        <div style={{ marginTop: 8, background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '10px 14px' }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {items.map((item, i) => (
              <li key={i} style={{ fontSize: 12, color: '#0369A1', lineHeight: 1.7, marginBottom: 2 }}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export default function TaxReturn() {
  const nav = useNavigate()

  // Load K-1 data passed from Step 1
  // Manual K-1s: entered directly on personal return Step 1 (in addition to Dashboard.jsx-managed entities)
  const [manualK1s, setManualK1s] = React.useState((() => { try { return JSON.parse(sessionStorage.getItem('ts360_f1040')||'{}').manualK1s || [] } catch(e) { return [] } })())
  const dashboardK1Total = parseFloat(sessionStorage.getItem('ts360_k1') || '0')
  const manualK1Total = manualK1s.reduce((sum, k) => sum + (parseFloat(k.amount) || 0), 0)
  const k1Total = dashboardK1Total + manualK1Total
  const entitiesRaw = sessionStorage.getItem('ts360_entities')
  const entities = entitiesRaw ? JSON.parse(entitiesRaw) : []

  // Pre-load saved f1040 data if passed from Dashboard
  const savedF1040 = (() => { try { return JSON.parse(sessionStorage.getItem('ts360_f1040')||'{}') } catch(e) { return {} } })()
  const savedTaxYear = parseInt(sessionStorage.getItem('ts360_taxyear')||'0') || 2025

  // Personal inputs — pre-populated from saved record if available
  const [taxYear, setTaxYear] = React.useState(savedTaxYear)
  const [ytdMode, setYtdMode] = React.useState(false)
  const [ytdMonth, setYtdMonth] = React.useState(new Date().getMonth() + 1) // current month
  const [status, setStatus] = React.useState(savedF1040.filingStatus || 'single')
  const [qualifiedDividends, setQualifiedDividends] = React.useState('')
  const [socialSecurity, setSocialSecurity] = React.useState('')
  const [iraDistributions, setIraDistributions] = React.useState('')
  const [selfEmpHealthIns, setSelfEmpHealthIns] = React.useState('')
  const [hsaDeduction, setHsaDeduction] = React.useState('')
  const [studentLoanInt, setStudentLoanInt] = React.useState('')
  // PR-G (Issue #29): Prior-year NOL carryforward (Schedule 1 Line 8a)
  const [nolCarryforward, setNolCarryforward] = React.useState(savedF1040.nolCarryforward || '')
  const [w2Income, setW2Income] = React.useState(savedF1040.w2Income || (savedF1040.officerSalary ? String(savedF1040.officerSalary) : '')); const [w2WasAutoPopulated] = React.useState(!savedF1040.w2Income && !!savedF1040.officerSalary)
  const [dependents, setDependents] = React.useState(savedF1040.dependents || '0')
  const [isREP, setIsREP] = React.useState(false)
  const [rentalIncome, setRentalIncome] = React.useState('')
  const [rentalExpenses, setRentalExpenses] = React.useState('')
  const [capitalGains, setCapitalGains] = React.useState('') // short-term (ordinary rates)
  const [ltCapGains, setLtCapGains] = React.useState('')    // long-term (preferential rates)
  const [unrecap1250, setUnrecap1250] = React.useState('')  // unrecaptured Sec 1250 gain (max 25%)
  const [collectiblesGain, setCollectiblesGain] = React.useState('') // collectibles gain (max 28%)
  const [priorYearQBILoss, setPriorYearQBILoss] = React.useState('')
  const [interest, setInterest] = React.useState('')

  // Manual K-1 helpers
  const addManualK1 = () => setManualK1s([...manualK1s, {
    id: 'mk1-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name: '',
    type: 'S Corporation',
    amount: ''
  }])
  const updateManualK1 = (id, patch) => setManualK1s(manualK1s.map(k => k.id === id ? { ...k, ...patch } : k))
  const removeManualK1 = (id) => setManualK1s(manualK1s.filter(k => k.id !== id))
  const [form4797, setForm4797] = React.useState('')
  const [dividends, setDividends] = React.useState('')
  const [useItemized, setUseItemized] = React.useState(savedF1040.useStandardDed===false)
  const [saved, setSaved] = React.useState(false)
  const [itemizedAmt, setItemizedAmt] = React.useState(savedF1040.itemizedDed || '')
  const [saltAmount, setSaltAmount] = React.useState(savedF1040.saltAmount || '')
  const [hasISO, setHasISO] = React.useState(!!savedF1040.hasISO)
  const [isoBargainElement, setIsoBargainElement] = React.useState(savedF1040.isoBargainElement || '')
  const [estPaid, setEstPaid] = React.useState(savedF1040.estimatedPayments || '')
  const [w2Withheld, setW2Withheld] = React.useState(savedF1040.w2Withheld || '')
  const [showDetail, setShowDetail] = React.useState(false)

  // Live-sync to sessionStorage so AI Analysis sees current calculator state without requiring a Save.
  // Mirrors the f1040Updated payload from the Save handler — same fields, same shape, written reactively.
  // §179 income limit display values (mirrors the cap math in the useEffect below for render-scope use)
  const k1ActiveForDisplay = entities.reduce((s,e)=>s+Math.round((parseFloat(e.netProfit)||0)*(parseInt(e.own)||100)/100), 0)
  const totalSec179ForDisplay = entities.reduce((s,e)=>s+(parseFloat(e.box11_12)||0), 0)
  const activeBizIncomeForDisplay = Math.max(0, k1ActiveForDisplay + (parseFloat(w2Income)||0))
  const sec179AllowedForDisplay = Math.min(totalSec179ForDisplay, activeBizIncomeForDisplay)
  const sec179DisallowedForDisplay = Math.max(0, totalSec179ForDisplay - activeBizIncomeForDisplay)

  React.useEffect(() => {
    try {
      const liveF1040 = {
        filingStatus: status,
        w2Income,
        w2Withheld,
        rentalIncome,
        rentalExpenses,
        capitalGains,
        interest,
        dividends,
        form4797,
        manualK1s,
        isREP,
        useStandardDed: !useItemized,
        itemizedDed: itemizedAmt,
        saltAmount,
        hasISO,
        isoBargainElement,
        estimatedPayments: estPaid,
        dependents,
        priorYearQBILoss,
        qualifiedDividends,
        socialSecurity,
        iraDistributions,
        selfEmpHealthIns,
        hsaDeduction,
        studentLoanInt,
      }
      sessionStorage.setItem('ts360_f1040', JSON.stringify(liveF1040))
      sessionStorage.setItem('ts360_taxyear', String(taxYear))
  const k1ActiveIncome = entities.reduce((s,e)=>s+Math.round((parseFloat(e.netProfit)||0)*(parseInt(e.own)||100)/100), 0)
  const totalSec179 = entities.reduce((s,e)=>s+(parseFloat(e.box11_12)||0), 0)
  const totalBox12_13 = entities.reduce((s,e)=>s+(parseFloat(e.box12_13)||0), 0)
  const activeBusinessIncome = Math.max(0, k1ActiveIncome + (parseFloat(liveF1040.w2Income)||0))
  const sec179Allowed = Math.min(totalSec179, activeBusinessIncome)
  const sec179Disallowed = Math.max(0, totalSec179 - activeBusinessIncome)
  const liveStateForAI = { entities, k1Income: k1ActiveIncome - sec179Allowed - totalBox12_13, taxYear, f1040: liveF1040, sec179Disallowed, sec179Allowed, totalSec179, activeBusinessIncome }
    } catch(e) { /* sessionStorage may be unavailable in private browsing */ }
  }, [status, w2Income, w2Withheld, rentalIncome, rentalExpenses, capitalGains, ltCapGains, unrecap1250, collectiblesGain, interest, dividends, form4797, manualK1s, isREP, useItemized, itemizedAmt, saltAmount, hasISO, isoBargainElement, estPaid, dependents, priorYearQBILoss, qualifiedDividends, socialSecurity, iraDistributions, selfEmpHealthIns, hsaDeduction, studentLoanInt, nolCarryforward, taxYear])

  // Core calculations
  // YTD annualization: scale YTD inputs to full-year projections
  const ytdFactor = ytdMode && ytdMonth > 0 ? 12 / ytdMonth : 1
  const ytdScale = (val) => Math.round(nv(val) * ytdFactor)

  const w2 = ytdScale(w2Income)
  const rentalNet = isREP ? (ytdScale(rentalIncome) - ytdScale(rentalExpenses)) : Math.max(0, ytdScale(rentalIncome) - ytdScale(rentalExpenses))
  const stGain = ytdScale(capitalGains)    // short-term: taxed at ordinary income rates
  const ltGain = ytdScale(ltCapGains)      // long-term: taxed at preferential 0/15/20% rates
  const capGain = stGain + ltGain    // total capital gains for QBI income limitation
  const intInc = ytdScale(interest)
  // FIX: Ordinary dividends (Line 3b) are entered once — qualified dividends are a SUBSET
  // Do NOT add qualifiedDividends separately — it is already included in dividends (Line 3b)
  const divInc = ytdScale(dividends)       // ordinary dividends only (1040 Line 3b)
  // Form 4797 Part II ordinary gain/(loss): net §1231 loss + §1245 recapture (per Form 4797 Line 18b)
  // Net §1231 GAIN goes to LTCG (already captured in ltCapGains); this field is for net loss / ordinary recapture
  const f4797Inc = ytdScale(form4797)
  const qualDiv = ytdScale(qualifiedDividends) // subset of divInc — used only for LTCG rate calc

  // Total gross income — k1Total flows from Step 1 (negative = loss, reduces income)
  // Social Security: up to 85% taxable (simplified for planning)
  const ssBenefits = ytdScale(socialSecurity)
  const taxableSS = Math.round(ssBenefits * 0.85)
  const iraIncome = ytdScale(iraDistributions)
  // Entity-mix classifiers for display labels
  const SCHED_C_TYPES = ['Sole Proprietor / Single-Member LLC']
  const K1_TYPES = ['Partnership / Multi-Member LLC', 'S Corporation', 'C Corporation']
  const hasSchedC = entities.some(e => SCHED_C_TYPES.includes(e?.type))
  const hasK1 = entities.some(e => K1_TYPES.includes(e?.type))

  // PR-E (Issue #36): S-Corp reasonable compensation soft-warning.
  // Mirrors the AIAnalysis Risk Scan check: when an S-Corp entity has positive K-1 income but
  // owner compensation (W-2 wages used as a proxy here) is below 40% of S-Corp profit, surface
  // a soft warning. The IRS scrutinizes this pattern aggressively (IRC §3121(a); Rev. Rul. 74-44; Watson v. Comm'r).
  // Threshold of 40% catches the gray zone — the conservative end of the 30–60% rule-of-thumb range.
  // Tolerant entity-type match — handles 'S Corporation' (canonical) and legacy 'S-Corporation'.
  const hasSCorpEntity = entities.some(e => /s.?corp/i.test(e?.type || ''))
  const sCorpProfit = entities.filter(e => /s.?corp/i.test(e?.type || '')).reduce((sum, e) => sum + Math.max(0, parseFloat(e.netProfit) || 0), 0)
  const rcRiskRatio = sCorpProfit > 0 ? w2 / sCorpProfit : null
  const rcRisk = (hasSCorpEntity && sCorpProfit > 20000 && (w2 === 0 || (rcRiskRatio !== null && rcRiskRatio < 0.4)))
    ? { sCorpProfit, w2Wages: w2, ratio: rcRiskRatio, targetW2: sCorpProfit * 0.40, severity: w2 === 0 ? 'high' : 'medium' }
    : null
  const incomeSectionLabel = hasSchedC && hasK1 ? 'BUSINESS INCOME FROM STEP 1'
    : hasSchedC ? 'SCHEDULE C NET PROFIT FROM STEP 1'
    : hasK1 ? 'K-1 INCOME FROM STEP 1'
    : 'BUSINESS INCOME FROM STEP 1'
  const incomeFooterLabel = hasSchedC && hasK1 ? 'Total business income'
    : hasSchedC ? 'Total Schedule C net profit'
    : hasK1 ? 'Total K-1 to Schedule E'
    : 'Total business income'
  const breakdownRowLabel = hasSchedC && hasK1 ? 'Business / K-1 Income'
    : hasSchedC ? 'Schedule C Net Profit'
    : hasK1 ? 'K-1 S-Corp / Business (Sch E)'
    : 'Business Income'

  // ── Tax calculations: orchestrator (Issue #59 PR-H2) ──────────────────────────
  const r = calcTaxReturn({
    taxYear, status, dependents,
    entities,
    // Pre-YTD-scaled income inputs:
    w2, k1Total, rentalNet, stGain, ltGain, intInc, divInc, qualDiv,
    f4797Inc, taxableSS, iraIncome,
    // Raw strings (orchestrator nv()s + ytdScales as appropriate):
    selfEmpHealthIns, hsaDeduction, studentLoanInt,
    nolCarryforward, priorYearQBILoss,
    useItemized, itemizedAmt, saltAmount,
    hasISO, isoBargainElement,
    isREP,
    unrecap1250, collectiblesGain,
    w2Withheld, estPaid,
    ytdFactor,
  })
  const {
    grossIncome, agi,
    seNetIncome, seEarningsSubject, seTax, halfSE,
    selfEmpHealthDed, hsaDed, studentLoanDed, adjustments,
    stdDed, itemized, deduction,
    unrec1250, collectibles,
    nonSEk1, seK1AfterAdjustments, qbiBasis, taxableBeforeQBI, prefIncome, qbi, qbiLimitApplied, qbiCaps,
    totalPrefIncome, taxableAfterQBI, ordinaryTaxableIncome, taxableIncome,
    ordFedTax, prefTax, fedTax,
    marginalRate,
    addlMedThreshold, additionalMedicare, rentalNII, nii, niit,
    numDependents, childCredit,
    amt,
    totalTax, effectiveRate,
    withheld, estimated, totalPayments, balance, quarterlyRecommended,
    priorQBILossCO,
  } = r

  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', outline: 'none' }
  const lbl = { fontSize: 11, fontWeight: 700, color: SL, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', color: N }}>
      <style>{`input:focus, select:focus { outline: 2px solid ${B} !important; box-shadow: none !important; }`}</style>
      {sec179DisallowedForDisplay > 0 && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FCD34D', padding: '12px 24px', fontSize: 13, color: '#92400E' }}>
          ⚠ <strong>§179 deduction capped at active business income.</strong> Total §179 election: ${totalSec179ForDisplay.toLocaleString()}. Active business income: ${activeBizIncomeForDisplay.toLocaleString()}. Allowed this year: <strong>${sec179AllowedForDisplay.toLocaleString()}</strong>. Carryforward to next year per IRC §179(b)(3): <strong>${sec179DisallowedForDisplay.toLocaleString()}</strong>.
        </div>
      )}

      {/* Nav */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 40px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => nav('/calculate-tax')}>
            <div style={{ width: 32, height: 32, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" fill="white" rx="1"/><rect x="10" y="7" width="4" height="14" fill="white" rx="1"/><rect x="17" y="3" width="4" height="18" fill="white" rx="1"/></svg>
            </div>
            <span style={{ fontSize: 19, fontWeight: 800, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
          </div>
          <span style={{ fontSize: 12, background: B, color: '#fff', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>Step 2 of 2 — Personal Return</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/calculate-tax')} style={{ padding: '7px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: SL, cursor: 'pointer' }}>← Back to Business</button>
          <button onClick={() => nav('/dashboard')} style={{ padding: '7px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: SL, cursor: 'pointer' }}>📂 Dashboard</button>
          <button onClick={() => nav('/ai-analysis', { state: { liveState: liveStateForAI } })} style={{ padding: '7px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: SL, cursor: 'pointer' }}>AI Analysis</button>
          <button onClick={() => { ['token','plan','billing','ts360_session','ts360_email','userName','ts360_connected_app','ts360_quickbooks_token','ts360_quickbooks_connected','ts360_quickbooks_extra','ts360_xero_token','ts360_xero_connected','ts360_xero_refresh','ts360_wave_token','ts360_wave_connected','ts360_freshbooks_token','ts360_freshbooks_connected'].forEach(k=>localStorage.removeItem(k)); nav('/') }} style={{ padding: '7px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: SL, cursor: 'pointer' }}>Sign Out</button>
          <button onClick={() => nav('/settings')} style={{ padding: '7px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: SL, cursor: 'pointer' }}>⚙ Settings</button>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

        {/* LEFT — Inputs */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: N, marginBottom: 4 }}>Personal Tax Return</h1>
          <p style={{ color: SL, fontSize: 14, marginBottom: 24 }}>Enter your personal info to calculate your total federal tax liability.</p>

          {/* K-1 Summary from Step 1 */}
          {(entities.length > 0 || manualK1s.length > 0) && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>{incomeSectionLabel}</div>
              {entities.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < entities.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: N }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: SL }}>{e.type} · {e.own}% ownership</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: e.k1 >= 0 ? G : R }}>{fmt(e.k1)}</div>
                </div>
              ))}
              {/* Manual K-1 rows */}
              {manualK1s.map((mk) => (
                <div key={mk.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F5F9', gap: 12 }}>
                  <input
                    type="text"
                    placeholder="Entity name"
                    value={mk.name}
                    onChange={(e) => updateManualK1(mk.id, { name: e.target.value })}
                    style={{ flex: 1, minWidth: 0, padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13 }}
                  />
                  <select
                    value={mk.type}
                    onChange={(e) => updateManualK1(mk.id, { type: e.target.value })}
                    style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, background: '#fff' }}
                  >
                    <option value="S Corporation">S Corp</option>
                    <option value="Partnership / Multi-Member LLC">Partnership/LLC</option>
                    <option value="C Corporation">C Corp</option>
                  </select>
                  <MoneyInput
                    value={mk.amount}
                    onChange={(v) => updateManualK1(mk.id, { amount: v })}
                    placeholder="0"
                    style={{ width: 140, padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13 }}
                  />
                  <button
                    onClick={() => removeManualK1(mk.id)}
                    style={{ background: 'none', border: 'none', color: SL, fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}
                    aria-label="Remove K-1"
                  >×</button>
                </div>
              ))}
              <button
                onClick={addManualK1}
                style={{ marginTop: 8, padding: '8px 14px', background: 'transparent', border: '1px dashed #CBD5E1', borderRadius: 8, color: B, fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%' }}
              >
                + Add K-1
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '2px solid #E2E8F0' }}>
                <span style={{ fontWeight: 700, color: N }}>{incomeFooterLabel}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: k1Total >= 0 ? G : R }}>{fmt(k1Total)}</span>
              </div>
              {entities.length === 0 && manualK1s.length === 0 && (
                <div style={{ marginTop: 8, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                  ⚠ No business entered. <span style={{ cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }} onClick={() => nav('/calculate-tax')}>Go to Step 1</span> to add your S-Corp or LLC so the K-1 flows through here.
                </div>
              )}
              {k1Total < 0 && (
                <div style={{ marginTop: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
                  ✓ Business loss of {fmt(Math.abs(k1Total))} is reducing your gross income on {hasSchedC && !hasK1 ? 'Schedule C' : 'Schedule E'}
                </div>
              )}
            </div>
          )}

          {/* Tax Year + YTD Mode */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px' }}>TAX YEAR</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: ytdMode ? '#2563EB' : SL }}>
                <input type="checkbox" checked={ytdMode} onChange={e => setYtdMode(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#2563EB' }} />
                YTD Mode (annualize)
                <InfoTip text="Year-to-date mode: enter income and expenses as of today and we'll project your full-year tax liability. Select the month you're tracking through." />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <select value={taxYear} onChange={e => setTaxYear(parseInt(e.target.value))} style={{ flex: 1, padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, background: '#fff' }}>
                {[2026,2025,2024].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {ytdMode ? (
                <select value={ytdMonth} onChange={e => setYtdMonth(parseInt(e.target.value))} style={{ flex: 1, padding: '10px 12px', border: '2px solid #2563EB', borderRadius: 8, fontSize: 14, color: N, background: '#EFF6FF' }}>
                  {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => (
                    <option key={i+1} value={i+1}>Through {m}</option>
                  ))}
                </select>
              ) : null}
              <div style={{ fontSize: 13, color: SL, flexShrink: 0 }}>Std. deduction: <strong style={{ color: N }}>{fmt(getStdDed(taxYear, status))}</strong></div>
            </div>
            {ytdMode ? (
              <div style={{ marginTop: 10, padding: '8px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, color: '#1E40AF' }}>
                📅 YTD through {['January','February','March','April','May','June','July','August','September','October','November','December'][ytdMonth-1]} — all income inputs are being annualized × {(12/ytdMonth).toFixed(2)} to project full-year liability
              </div>
            ) : null}
          </div>

          {/* Filing Status */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>FILING STATUS & DEPENDENTS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Filing Status <InfoTip text="Your IRS filing status. Single = unmarried. MFJ = Married Filing Jointly. MFS = Married Filing Separately. HOH = Head of Household (single with dependents)."/></label>
                <select value={status} onChange={e => setStatus(e.target.value)} style={inp}>
                  <option value="single">Single</option>
                  <option value="mfj">Married Filing Jointly</option>
                  <option value="mfs">Married Filing Separately</option>
                  <option value="hoh">Head of Household</option>
                  <option value="qss">Qualifying Surviving Spouse</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Qualifying Dependents <InfoTip text="Number of children under 17 who qualify for the Child Tax Credit ($2,000 per child). Only count dependents you are claiming this year."/></label>
                <select value={dependents} onChange={e => setDependents(e.target.value)} style={inp}>
                  {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} dependent{n !== 1 ? 's' : ''}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* W-2 & Withholding */}
          <CollapsibleSection title="W-2 INCOME & WITHHOLDING">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>W-2 Wages (all jobs) <InfoTip text="Your total W-2 wages from all employers. Find on W-2 Box 1, or your last paystub under Gross Earnings YTD. Include all jobs."/></label>
                <MoneyInput value={w2Income} onChange={setW2Income} placeholder="0" style={inp} />{w2WasAutoPopulated && <div style={{fontSize:11,fontStyle:'italic',color:'#6B7280',marginTop:4,lineHeight:1.4}}>Pre-filled from your business's officer/owner W-2 wages in Step 1. Add additional W-2 income (from another job) on top of this if applicable.</div>}
                <WhatGoesHere items={[
                  'W-2 Box 1 (Wages, tips, other compensation) from every employer',
                  'If you have multiple jobs, add all W-2 Box 1 amounts together',
                  'Your last paystub → Gross Earnings YTD is a good estimate during the year',
                  'Do NOT include 401(k) contributions — those already reduce Box 1',
                  'Do NOT include your S-Corp officer salary if already entered in Step 1 — it flows via K-1',
                ]} />
              </div>
              <div>
                <label style={lbl}>Federal Tax Withheld (W-2) <InfoTip text="Total federal tax withheld by your employer(s). Find on W-2 Box 2, or your last paystub under Federal Tax YTD."/></label>
                <MoneyInput value={w2Withheld} onChange={setW2Withheld} placeholder="0" style={inp} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Rental Real Estate */}
          <CollapsibleSection title="RENTAL REAL ESTATE (SCHEDULE E, PART I)">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: N }}>
                <input type="checkbox" checked={isREP} onChange={e => setIsREP(e.target.checked)} style={{ width: 14, height: 14, accentColor: B }} />
                Real Estate Professional
              </label>
            {isREP ? (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
                ✓ REP status: rental losses fully deductible against all income (subject to §461(l) excess business loss limit). Higher-income REPs should also consider §163(j) business interest limit and the §469(c)(7)(A) aggregation election if owning multiple rentals. Maintain contemporaneous time logs — IRS challenges to REP status frequently turn on documentation.
              </div>
            ) : null}
            {!isREP && (
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                ⚠ Without REP status, passive rental losses are limited to $25,000 (phased out above $100K AGI). To qualify under §469(c)(7): >750 hours/year in real property trades, >50% of personal services in real property trades, AND material participation in each rental — or aggregate via §469(c)(7)(A) election. For MFJ, only one spouse needs to meet the >750-hour and >50% tests separately (§469(c)(7)(B)).
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Total Rental Income (Sch E Part I, line 3) <InfoTip text="Rental property income ONLY. Do NOT include K-1 income from S-Corps/Partnerships — that flows into Sch E Part II separately via Step 1. Reference last year's Schedule E Part I line 3, or add up rental deposits from your bank statements."/></label>
                <MoneyInput value={rentalIncome} onChange={setRentalIncome} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Total Rental Expenses incl. depreciation (Sch E Part I, line 20) <InfoTip text="Rental property expenses ONLY (not K-1 entity expenses). All rental property costs including mortgage interest, taxes, insurance, repairs, and depreciation. Find on Schedule E or your property records."/></label>
                <MoneyInput value={rentalExpenses} onChange={setRentalExpenses} placeholder="0" style={inp} />
              </div>
            </div>
            <WhatGoesHere items={[
              'Total Rental Income: all rent collected this year — use bank deposits or last year\'s Schedule E Line 3',
              'Total Rental Expenses: mortgage interest + property taxes + insurance + repairs + management fees + depreciation',
              'Depreciation: typically cost of building ÷ 27.5 years annually — find on prior Schedule E or ask your CPA',
              'REP (Real Estate Professional): check if rental is your primary profession (750+ hours/year AND >50% of work time)',
              'Without REP: passive losses above $25,000 are suspended and carry forward until property is sold',
            ]} />
          </CollapsibleSection>

          {/* Other Income */}
          <CollapsibleSection title="OTHER INCOME">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Short-Term Capital Gains / (Losses) <InfoTip text="Assets held 1 year or LESS. Taxed at your ordinary income rate (same as W-2). Find on Schedule D Part I Line 7 or your 1099-B. Enter a negative number for net losses (max $3,000 deductible/year)."/></label>
                <MoneyInput value={capitalGains} onChange={setCapitalGains} placeholder="0" style={inp} />
                <div style={{ fontSize: 10, color: '#92400e', marginTop: 3 }}>Held ≤1 yr — taxed at ordinary rates</div>
              </div>
              <div>
                <label style={lbl}>Long-Term Capital Gains / (Losses) <InfoTip text="Assets held MORE than 1 year. Taxed at preferential 0%, 15%, or 20% rates. Find on Schedule D Part II Line 15 or your 1099-B. For property sales: enter the NET gain AFTER subtracting the Unrecaptured Sec 1250 and Form 4797 ordinary gain amounts."/></label>
                <MoneyInput value={ltCapGains} onChange={setLtCapGains} placeholder="0" style={inp} />
                <div style={{ fontSize: 10, color: '#15803d', marginTop: 3 }}>Held &gt;1 yr — taxed at 0/15/20%</div>
              </div>
              <div>
                <label style={lbl}>Unrecaptured Sec 1250 Gain <InfoTip text="Depreciation recapture on real property sales — taxed at max 25% (IRC §1(h)(1)(D)). Find on Schedule D Worksheet Line 19, or your tax software output. Applies when you sell rental/business property that has been depreciated. Enter as positive number."/></label>
                <MoneyInput value={unrecap1250} onChange={setUnrecap1250} placeholder="0" style={inp} />
                <div style={{ fontSize: 10, color: '#854F0B', marginTop: 3 }}>Depreciation recapture — max 25% rate</div>
              </div>
              <div>
                <label style={lbl}>Taxable Interest <InfoTip text="Interest earned from bank accounts, CDs, or bonds. Find on your 1099-INT from your bank or financial institution."/></label>
                <MoneyInput value={interest} onChange={setInterest} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Ordinary Dividends <InfoTip text="Dividends from stocks and funds — from 1040 Line 3b or 1099-DIV Box 1a. Enter ONLY dividends here. Do NOT add interest income — interest goes in the Taxable Interest field above. These are separate income types."/></label>
                <MoneyInput value={dividends} onChange={setDividends} placeholder="0" style={inp} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>1040 Line 3b — do not include interest</div>
              </div>
              <div>
                <label style={lbl}>Form 4797 Ordinary Gain/(Loss) <InfoTip text="Form 4797 Part II Line 18b — net §1231 loss and/or §1245 ordinary recapture. Enter as a negative number for losses. Net §1231 GAIN is treated as long-term capital gain — enter that in the Long-Term Capital Gains field above instead. Common for real estate investors selling rental property at a loss, equipment dispositions, and §1231 transactions."/></label>
                <MoneyInput value={form4797} onChange={setForm4797} placeholder="0" style={inp} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Schedule 1 Line 4 — flows from Form 4797 Part II</div>
              </div>
            </div>
            <WhatGoesHere items={[
              'Short-Term Capital Gains: profits from assets sold within 1 year — taxed at ordinary income rates (same as W-2 wages)',
              'Long-Term Capital Gains: profits from assets held >1 year — taxed at 0%, 15%, or 20% preferred rates',
              'Find both on 1099-B from your brokerage or Schedule D summary; enter losses as negative numbers',
              'Unrecaptured Sec 1250 Gain: for rental or business property sales only — from Schedule D Tax Worksheet Line 19',
              'Taxable Interest: 1099-INT Box 1 from banks, CDs, bonds; exclude tax-exempt municipal bond interest',
              'Ordinary Dividends: 1099-DIV Box 1a — only stock/fund dividends, never double-count with interest above',
              'Qualified Dividends: 1099-DIV Box 1b — subset of ordinary dividends taxed at the same 0/15/20% preferred rates',
              'Form 4797 Ordinary: net §1231 loss or §1245 recapture from selling business/rental property — enter losses as negative; net §1231 GAIN goes in Long-Term Capital Gains',
            ]} />
            {/* Prior Year Loss Carryforward */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <label style={lbl}>Prior Year QBI Loss Carryforward <InfoTip text="Negative qualified business income from a prior year. Find on last year's Form 8995 Line 16 or Form 8995-A Schedule C. Reduces this year's QBI deduction base only — does NOT reduce AGI. Capital loss carryovers go on Schedule D, not here."/></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <MoneyInput value={priorYearQBILoss} onChange={setPriorYearQBILoss} placeholder="0" style={{ ...inp, maxWidth: 200 }} />
                <div style={{ fontSize: 12, color: SL, lineHeight: 1.4 }}>
                  Enter prior year QBI loss as positive number. Reduces this year's QBI deduction base; does not affect AGI.
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Incentive Stock Options — AMT trap (§56(b)(3) / Form 6251 line 2i) */}
          <CollapsibleSection title="INCENTIVE STOCK OPTIONS (AMT)" defaultOpen={false}>
            <div style={{ fontSize: 12, color: SL, marginBottom: 12, lineHeight: 1.5 }}>
              If you exercised ISOs this year and held the shares past year-end, the bargain element (FMV at exercise minus strike price) is added to your AMT income — even though it's not taxable for regular tax purposes. This is the most common AMT trigger.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: N, marginBottom: hasISO ? 12 : 0 }}>
              <input type="checkbox" checked={hasISO} onChange={e => setHasISO(e.target.checked)} style={{ width: 14, height: 14, accentColor: B }} />
              I exercised ISOs and held shares past year-end
            </label>
            {hasISO ? (
              <div style={{ marginTop: 4 }}>
                <label style={lbl}>ISO Bargain Element <InfoTip text="(FMV at exercise) − (strike price) × shares exercised, for shares NOT sold in the same calendar year. From Form 3921 Box 4 minus Box 3, multiplied by Box 5. Added to AMTI per IRC §56(b)(3) — Form 6251 line 2i. Never capped. If you sold the shares in the same year you exercised (disqualifying disposition), enter $0 here — the gain is already in your W-2 ordinary income."/></label>
                <MoneyInput value={isoBargainElement} onChange={setIsoBargainElement} placeholder="0" style={{ ...inp, maxWidth: 320 }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Form 6251 line 2i — added to AMTI, no cap</div>
                <WhatGoesHere items={[
                  'Form 3921 received from your employer for each ISO exercise',
                  'Bargain element = (Box 4 FMV at exercise) − (Box 3 strike price) × (Box 5 shares)',
                  'Only count shares you STILL HELD at year-end — sales in same year are not added back',
                  'If shares were sold same year (disqualifying disposition), the gain is already on W-2 — enter $0 here',
                  'Multiple exercises: sum the bargain elements across all Form 3921s',
                ]} />
              </div>
            ) : null}
          </CollapsibleSection>

          {/* Additional Income */}
          <CollapsibleSection title="RETIREMENT & SOCIAL SECURITY INCOME">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Social Security Benefits <InfoTip text="Total SS/SSA-1099 Box 5 gross benefits received. We apply the 85% maximum inclusion rate for planning purposes. Find on SSA-1099 form mailed each January."/></label>
                <MoneyInput value={socialSecurity} onChange={setSocialSecurity} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>IRA / Pension Distributions <InfoTip text="Taxable amount from Form 1099-R Box 2a. Includes traditional IRA withdrawals, 401(k) distributions, pension payments. Roth distributions are generally tax-free — do not include."/></label>
                <MoneyInput value={iraDistributions} onChange={setIraDistributions} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Qualified Dividends <InfoTip text="From 1099-DIV Box 1b — a subset of your ordinary dividends taxed at the lower capital gains rate (0%, 15%, or 20%). Must be ≤ Ordinary Dividends entered above."/></label>
                <MoneyInput value={qualifiedDividends} onChange={setQualifiedDividends} placeholder="0" style={inp} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Above-the-Line Deductions */}
          <CollapsibleSection title="ABOVE-THE-LINE DEDUCTIONS (SCHEDULE 1)">
            <div style={{ fontSize: 12, color: SL, marginBottom: 14 }}>These reduce your AGI before the standard/itemized deduction is applied.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Self-Employed Health Insurance <InfoTip text="Premiums you paid for health/dental/vision insurance for yourself and family if self-employed. Found in your records or Schedule K-1 attachments. Cannot exceed your net self-employment income."/></label>
                <MoneyInput value={selfEmpHealthIns} onChange={setSelfEmpHealthIns} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>HSA Deduction <InfoTip text="Contributions you made directly to your Health Savings Account (not through payroll). From Form 8889. 2025 limit: $4,300 self-only, $8,550 family."/></label>
                <MoneyInput value={hsaDeduction} onChange={setHsaDeduction} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Student Loan Interest <InfoTip text="Interest paid on qualified student loans. Capped at $2,500. Phases out between $75,000–$90,000 AGI (single). From Form 1098-E."/></label>
                <MoneyInput value={studentLoanInt} onChange={setStudentLoanInt} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Prior-Year NOL Carryforward <InfoTip text="Net Operating Loss carried forward from a prior year (Schedule 1 Line 8a). Reduces ordinary income before AGI. Post-TCJA NOLs (from tax years after 2017) are limited to 80% of taxable income computed without the NOL deduction; pre-TCJA NOLs follow older 2-year carryback / 20-year carryforward rules with no 80% cap. Enter as positive — it will be subtracted from your income."/></label>
                <MoneyInput value={nolCarryforward} onChange={setNolCarryforward} placeholder="0" style={inp} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Schedule 1 Line 8a — enter as positive, treated as reduction</div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Deductions */}
          <CollapsibleSection title="DEDUCTION METHOD">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: N }}>
                <input type="checkbox" checked={useItemized} onChange={e => setUseItemized(e.target.checked)} style={{ width: 14, height: 14, accentColor: B }} />
                Use itemized deductions
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: useItemized ? '1fr 1fr' : '1fr', gap: 12 }}>
              <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: SL }}>Standard deduction ({status === 'mfj' || status === 'qss' ? 'MFJ' : status === 'hoh' ? 'HOH' : 'Single'})</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: N }}>{fmt(stdDed)}</span>
              </div>
              {useItemized ? (
                <div>
                  <label style={lbl}>Your Itemized Deductions (Schedule A) <InfoTip text="Total itemized deductions instead of the standard deduction. Find on Schedule A: mortgage interest (Form 1098), state taxes, charitable gifts, and medical expenses."/></label>
                  <MoneyInput value={itemizedAmt} onChange={setItemizedAmt} placeholder="0" style={inp} />
                </div>
              ) : null}
            </div>
            {useItemized ? (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                <label style={lbl}>State & Local Taxes Paid (gross, pre-cap) <InfoTip text="Total state income tax + property tax paid this year — BEFORE the SALT cap. Schedule A Lines 5a + 5b. The SALT cap applies automatically (2024: $10K; 2025: $40K; 2026: $40,400; MFS: half). Used for AMT — Form 6251 line 2a adds the capped SALT deduction back to AMTI."/></label>
                <MoneyInput value={saltAmount} onChange={setSaltAmount} placeholder="0" style={{ ...inp, maxWidth: 280 }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Form 6251 line 2a — capped amount added back to AMTI</div>
              </div>
            ) : null}
          </CollapsibleSection>

          {/* Estimated Tax Payments */}
          <CollapsibleSection title="ESTIMATED TAX PAYMENTS MADE">
            <div>
              <label style={lbl}>Total Estimated Payments Paid This Year <InfoTip text="All quarterly payments sent to the IRS this year (Form 1040-ES). Find in your IRS Online Account or bank records for payments on April 15, June 15, Sept 15, and Jan 15."/></label>
              <MoneyInput value={estPaid} onChange={setEstPaid} placeholder="0" style={{ ...inp, maxWidth: 280 }} />
              <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Sum of all quarterly payments made so far</div>
            </div>
          </CollapsibleSection>
        </div>

        {/* RIGHT — Live Results */}
        <div style={{ position: 'sticky', top: 72 }}>

          {/* Total Tax Card */}
          <div style={{ background: N, borderRadius: 18, padding: 28, color: '#fff', marginBottom: 16, boxShadow: '0 12px 40px rgba(13,27,62,0.25)' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', marginBottom: 8 }}>ESTIMATED FEDERAL TAX LIABILITY</div>
            <div style={{ fontSize: 48, fontWeight: 900, color: totalTax === 0 ? '#4ADE80' : '#F87171', lineHeight: 1, marginBottom: 4 }}>
              {fmt(totalTax)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              {effectiveRate > 0 ? (effectiveRate * 100).toFixed(1) + '% effective rate on earned income' : 'No federal income tax owed'}
            </div>

            {/* Balance due / refund */}
            <div style={{ background: balance > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{balance > 0 ? 'BALANCE DUE' : 'ESTIMATED REFUND'}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: balance > 0 ? '#F87171' : '#4ADE80' }}>{fmt(Math.abs(balance))}</div>
              {balance > 0 && quarterlyRecommended > 0 && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                  Recommend {fmt(quarterlyRecommended)}/quarter going forward
                </div>
              )}
            </div>

            {/* Marginal bracket */}
            {taxableIncome > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Marginal bracket</span>
                <BracketBadge rate={marginalRate} />
              </div>
            )}

            {/* QBI */}
            {qbi > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>QBI deduction</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#4ADE80' }}>{fmt(qbi)} saved</span>
                </div>
                {qbiLimitApplied && qbiLimitApplied !== 'none' && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textAlign: 'right', marginTop: 2 }}>
                    {qbiLimitApplied === 'min400' ? '§199A(i) OBBBA minimum applied' : 'Limited by ' + (qbiLimitApplied === 'qbi' ? '20% of QBI' : qbiLimitApplied === 'wage' ? 'wage/UBIA cap' : 'income cap') + (qbiCaps && qbiCaps.qbi > qbi ? ` (−${fmt(Math.round(qbiCaps.qbi - qbi))})` : '')}
                  </div>
                )}
              </div>
            )}

            {/* Income Tax (ordinary + preferential) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Income Tax</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>{fmt(fedTax)}</span>
            </div>

            {/* Self-Employment Tax — visible when user has any SE-subject entity */}
            {seTax > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>SE Tax (15.3%)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>{fmt(seTax)}</span>
              </div>
            )}

            {/* Additional Medicare Tax */}
            {additionalMedicare > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Add'l Medicare Tax (0.9%)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>{fmt(additionalMedicare)}</span>
              </div>
            )}
            {/* NIIT */}
            {niit > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Net Investment Income Tax (3.8%)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>{fmt(niit)}</span>
              </div>
            )}
            {/* AMT — Always shown (even at $0) per Issue #44 design — "yes, we checked" reassurance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>AMT (Form 6251) <span style={{ fontSize: 10, opacity: 0.5 }}>· checked</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: amt > 0 ? '#F87171' : 'rgba(255,255,255,0.4)' }}>{fmt(amt)}</span>
            </div>
            {/* Preferential tax breakdown */}
            {prefTax > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>LTCG / Pref. Rate Tax</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>{fmt(prefTax)}</span>
              </div>
            )}

            {/* Accuracy note */}
            <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', borderRadius: 8, borderLeft: '3px solid rgba(255,255,255,0.2)' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                ⚠ Accuracy depends on your inputs. Please review all fields to ensure the most accurate result. This is an estimate — consult a tax professional for filing.
              </div>
            </div>
          </div>

          {/* PR-E (Issue #36): S-Corp Reasonable Compensation soft-warning */}
          {rcRisk && (
            <div style={{ background: '#FFF7ED', border: '1px solid #FDE68A', borderRadius: 14, padding: '16px 20px', marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 18, lineHeight: '24px' }}>{rcRisk.severity === 'high' ? '🚨' : '⚠️'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 6 }}>
                    Reasonable Compensation Risk — IRS Audit Flag
                  </div>
                  <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6, marginBottom: 8 }}>
                    Your S-Corp shows {fmt(rcRisk.sCorpProfit)} in net income but you reported {fmt(rcRisk.w2Wages)} in W-2 wages
                    {rcRisk.ratio !== null ? ' (' + (rcRisk.ratio * 100).toFixed(1) + '% ratio)' : ''}.
                    {' '}Conservative target: at least {fmt(rcRisk.targetW2)} in W-2 wages (40% of net profit) — a planning rule of thumb, not a guaranteed safe harbor.
                    {' '}The IRS requires S-Corp owner-employees to pay themselves "reasonable compensation"
                    for services rendered before taking distributions (IRC §3121(a); Rev. Rul. 74-44; Watson v. Comm'r). Distributions reclassified
                    as wages by the IRS trigger payroll tax + penalties + interest.
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(146, 64, 14, 0.75)', lineHeight: 1.5, marginBottom: 8, fontStyle: 'italic' }}>
                    Note: This estimate is based on your total W-2 wages — TaxStat360 cannot tell which W-2 came from this S-Corp.
                    If you have a separate W-2 job, your actual S-Corp officer comp may be lower, which increases the audit risk.
                  </div>
                  <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5, marginBottom: 8 }}>
                    <strong>How the IRS / courts evaluate "reasonable"</strong> (Watson factors):
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                      <li>Training and experience of the owner</li>
                      <li>Duties and responsibilities</li>
                      <li>Time and effort devoted to the business</li>
                      <li>Dividends paid to other shareholders</li>
                      <li>Payments to non-shareholder employees</li>
                      <li>Compensation paid in prior years</li>
                      <li>Comparable salaries for similar work in similar businesses</li>
                      <li>The company's financial condition</li>
                    </ul>
                  </div>
                  <div style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5 }}>
                    <strong>What to do:</strong> Industry rule-of-thumb is 30–60% of net profit, depending on the work.
                    Review with your CPA whether your W-2 ratio is defensible — see <a href="https://www.rcreports.com" target="_blank" rel="noopener noreferrer" style={{ color: '#92400E', textDecoration: 'underline' }}>RC Reports</a> for benchmark data, and the <a href="https://www.irs.gov/businesses/small-businesses-self-employed/s-corporation-employees-shareholders-and-corporate-officers" target="_blank" rel="noopener noreferrer" style={{ color: '#92400E', textDecoration: 'underline' }}>IRS guidance on S-Corp officer compensation</a>.
                    Document your reasoning.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Income Waterfall */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 16 }}>
            <button onClick={() => setShowDetail(prev => !prev)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
              INCOME WATERFALL {showDetail ? '▲' : '▼'}
            </button>
            {showDetail ? (
              <div style={{ marginTop: 12 }}>
                {[
                  ['W-2 Wages', w2, true],
                  [breakdownRowLabel, k1Total, k1Total >= 0],
                  ['Rental Net Profit/Loss (Sch E, line 26)', rentalNet, rentalNet >= 0],
                  ['Short-Term Capital Gains', stGain, stGain >= 0],
                  ['Long-Term Capital Gains', ltGain, ltGain >= 0],
                  unrec1250 > 0 ? ['Unrecaptured Sec 1250 Gain', unrec1250, false] : null,
                  collectibles > 0 ? ['Collectibles Gain (28%)', collectibles, false] : null,
                  ['Taxable Interest', intInc, true],
                  ['Ordinary Dividends', divInc, true],
                  f4797Inc !== 0 ? ['Form 4797 Ordinary', f4797Inc, f4797Inc >= 0] : null,
                  ['─────────────────', null, true],
                  ['Gross Income', grossIncome, grossIncome >= 0],
                  ['Deduction (' + (useItemized && itemized > stdDed ? 'Itemized' : 'Standard') + ')', -deduction, false],
                  ['QBI Deduction' + (qbi > 0 && qbiLimitApplied && qbiLimitApplied !== 'none' ? (qbiLimitApplied === 'min400' ? ' (§199A(i) OBBBA minimum)' : ' (limited by ' + (qbiLimitApplied === 'qbi' ? '20% of QBI' : qbiLimitApplied === 'wage' ? 'wage/UBIA' : 'income cap') + (qbiCaps && qbiCaps.qbi > qbi ? `; −${fmt(Math.round(qbiCaps.qbi - qbi))}` : '') + ')') : ''), qbi > 0 ? -qbi : 0, false],
                  ['─────────────────', null, true],
                  ['Taxable Income', taxableIncome, taxableIncome >= 0],
                  ['Federal Tax — Ordinary Income', ordFedTax > 0 ? -ordFedTax : null, false],
                  ['Federal Tax — LTCG / 1250 / Qual Div', prefTax > 0 ? -prefTax : null, false],
                  niit > 0 ? ['Net Investment Income Tax (3.8%)', -niit, false] : null,
                  ['Add\'l Medicare Tax', -additionalMedicare, false],
                  ['Child Tax Credit', childCredit > 0 ? childCredit : 0, true],
                  ['─────────────────', null, true],
                  ['Total Tax', totalTax, false],
                ].filter(Boolean).map(([label, val, pos], i) => {
                  if (val === null) return <div key={i} style={{ borderTop: '1px solid #F1F5F9', margin: '6px 0' }} />
                  if (val === 0 && !['Gross Income','Taxable Income','Total Tax'].includes(label)) return null
                  const isBold = ['Gross Income','Taxable Income','Total Tax'].includes(label)
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F8FAFC' }}>
                      <span style={{ fontSize: 12, color: isBold ? N : SL, fontWeight: isBold ? 700 : 400 }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: isBold ? 700 : 600, color: isBold ? N : (val < 0 ? R : (val > 0 ? G : SL)) }}>
                        {val < 0 ? '(' + '$' + Math.abs(Math.round(val)).toLocaleString() + ')' : val > 0 ? '$' + Math.round(val).toLocaleString() : '$0'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          {/* Quarterly Schedule */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>QUARTERLY ESTIMATED PAYMENTS</div>
            {[
              ['Q1', 'Apr 15', totalTax / 4],
              ['Q2', 'Jun 16', totalTax / 4],
              ['Q3', 'Sep 15', totalTax / 4],
              ['Q4', 'Jan 15 \'26', totalTax / 4],
            ].map(([q, due, amt]) => (
              <div key={q} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: N }}>{q}</span>
                  <span style={{ fontSize: 11, color: SL, marginLeft: 8 }}>Due {due}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: amt > 0 ? R : G }}>{fmt(Math.round(amt))}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#F8FAFC', borderRadius: 8, fontSize: 11, color: SL, lineHeight: 1.5 }}>
              Based on annual liability ÷ 4. Adjust for income earned to date.
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => {
              try {
                const email = localStorage.getItem('ts360_email') || 'default'
                const key = 'ts360_records_' + email
                // Scan ALL ts360_records_* keys to find existing records
                const allFound = []
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i)
                  if (k && k.startsWith('ts360_records')) {
                    try { JSON.parse(localStorage.getItem(k)||'[]').forEach(r => { if (!allFound.find(x=>x.id===r.id)) allFound.push(r) }) } catch(e) {}
                  }
                }
                const existing = allFound.sort((a,b)=>(b.id||0)-(a.id||0))

                // The updated 1040 data to merge into the record
                const f1040Updated = {
                  filingStatus: status,
                  w2Income,
                  w2Withheld,
                  rentalIncome,
                  rentalExpenses,
                  capitalGains,
                  interest,
                  dividends,
                  form4797,
                  manualK1s,
                  isREP,
                  useStandardDed: !useItemized,
                  itemizedDed: itemizedAmt,
                  saltAmount,
                  hasISO,
                  isoBargainElement,
                  estimatedPayments: estPaid,
                  dependents,
                  priorYearQBILoss,
                  qualifiedDividends,
                  socialSecurity,
                  iraDistributions,
                  selfEmpHealthIns,
                  hsaDeduction,
                  studentLoanInt,
                  nolCarryforward,
                }

                // Find the first real Dashboard record (has biz object) and update its f1040
                // Find any Dashboard-format record (has biz object) — prefer ones with data
                const realIdx = existing.findIndex(r => r.biz && (parseFloat(r.biz.grossRevenue) > 0 || parseFloat(r.k1Income) > 0)) >= 0
                  ? existing.findIndex(r => r.biz && (parseFloat(r.biz.grossRevenue) > 0 || parseFloat(r.k1Income) > 0))
                  : existing.findIndex(r => r.biz) // fallback: any record with biz

                let updated
                if (realIdx >= 0) {
                  // Update the existing Dashboard record's f1040 in-place
                  updated = existing.map((r, i) => i === realIdx
                    ? { ...r, f1040: f1040Updated, k1Income: Math.round(k1Total), savedAt: new Date().toLocaleString() }
                    : r
                  )
                } else {
                  // No Dashboard record found — create a standalone record with full metadata
                  const record = {
                    id: Date.now(),
                    savedAt: new Date().toLocaleString(),
                    biz: {
                      entityType: entities.length > 0 ? entities[0].type : 'S Corporation',
                      year: taxYear,
                      grossRevenue: entities.length > 0 ? String(Math.round((entities[0].netProfit || 0) + Math.abs(entities[0].k1 || 0))) : '',
                      operatingExpenses: '',
                      officerSalary: '',
                      ownershipPct: entities.length > 0 ? entities[0].own : '100',
                    },
                    f1040: f1040Updated,
                    k1Income: Math.round(k1Total),
                    quarterly: quarterlyRecommended,
                    totalTax: Math.round(totalTax),
                    agi: Math.round(agi),
                  }
                  updated = [record, ...existing.filter(r => r.biz).slice(0, 9)]
                }

                // Remove any blank/orphan flat records (old format without biz)
                const cleaned = updated.filter(r => r.biz)
                localStorage.setItem(key, JSON.stringify(cleaned))
                localStorage.setItem('ts360_records', JSON.stringify(cleaned))
                setSaved(true)
                setTimeout(() => setSaved(false), 3000)
              } catch(e) { console.error('Save failed:', e) }
            }} style={{ width: '100%', padding: '13px', background: saved ? '#059669' : '#0D1B3E', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'background 0.3s' }}>
              {saved ? '✅ Record Saved!' : '💾 Save This Record'}
            </button>
            <button onClick={() => nav('/ai-analysis', { state: { liveState: liveStateForAI } })} style={{ width: '100%', padding: '13px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              🧠 View AI Analysis & Risk Report →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
