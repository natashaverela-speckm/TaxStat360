import React from 'react'
import { useNavigate } from 'react-router-dom'

const N = '#0D1B3E'
const B = '#2563EB'
const G = '#16a34a'
const R = '#dc2626'
const SL = '#475569'

// ── IRS Tax Tables 2024-2026 ─────────────────────────────────────────────────
// Sources: Rev. Proc. 2023-34 (2024) | Rev. Proc. 2024-40 + OBBBA Rev. Proc. 2025-32 (2025) | Rev. Proc. 2025-32 (2026)
const TAX_TABLES = {
  2024: {
    std:      { single:14600, mfj:29200, mfs:14600, hoh:21900, qss:29200 },
    ssWageBase: 168600,
    brackets: {
      single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
      mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
      mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
      hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
      qss:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
    },
    ltcg: { single:[47025,518900], mfj:[94050,583750], mfs:[47025,291850], hoh:[63000,551350], qss:[94050,583750] },
    niit: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    amt:  { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
  },
  2025: {
    std:      { single:15750, mfj:31500, mfs:15750, hoh:23625, qss:31500 },
    ssWageBase: 176100,
    brackets: {
      single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
      mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
      mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[313200,.35],[Infinity,.37]],
      hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
      qss:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    },
    ltcg: { single:[48350,533400], mfj:[96700,600050], mfs:[48350,300000], hoh:[64750,566700], qss:[96700,600050] },
    niit: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    amt:  { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
  },
  2026: {
    std:      { single:16100, mfj:32200, mfs:16100, hoh:24150, qss:32200 },
    ssWageBase: 184500,
    brackets: {
      single: [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[648750,.35],[Infinity,.37]],
      mfj:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
      mfs:    [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[388825,.35],[Infinity,.37]],
      hoh:    [[17600,.10],[67050,.12],[106900,.22],[203900,.24],[259300,.32],[648700,.35],[Infinity,.37]],
      qss:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
    },
    ltcg: { single:[50400,557050], mfj:[100800,626350], mfs:[50400,313175], hoh:[67650,591800], qss:[100800,626350] },
    niit: { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
    amt:  { single:200000, mfj:250000, mfs:125000, hoh:200000, qss:250000 },
  },
}
function getTable(year) { return TAX_TABLES[year] || TAX_TABLES[2025] }
function getStdDed(year, fs) { const t = getTable(year).std; return t[fs] || t.single }
function getBrackets(year, fs) { const t = getTable(year).brackets; return t[fs] || t.single }
function getLTCGThresholds(year, fs) { const t = getTable(year).ltcg; return t[fs] || t.single }
function getNIITThreshold(year, fs) { const t = getTable(year).niit; return t[fs] || 200000 }
function getAMTThreshold(year, fs) { const t = getTable(year).amt; return t[fs] || 200000 }

// Ordinary income tax (brackets only — does NOT include LTCG/qualified dividends)
function calcFederalTax(ordinaryIncome, year, fs) {
  if (ordinaryIncome <= 0) return 0
  let tax = 0, prev = 0
  for (const [cap, rate] of getBrackets(year, fs)) {
    if (ordinaryIncome <= prev) break
    tax += (Math.min(ordinaryIncome, cap) - prev) * rate
    prev = cap
  }
  return Math.round(tax)
}

// ── IRS Qualified Dividends & Capital Gain Tax Worksheet (QDCGTW) ──────────────
// IRC §1(h) — LTCG and qualified dividends taxed at 0%, 15%, or 20%
// Also handles: Unrecaptured Sec 1250 gain (max 25%) and Collectibles gain (max 28%)
// ordinaryIncome = taxable income EXCLUDING preferential items
// prefItems = { ltcg, qualDiv, unrecap1250, collectibles }
function calcPreferentialTax(ordinaryIncome, prefItems, year, fs) {
  const { ltcg = 0, qualDiv = 0, unrecap1250 = 0, collectibles = 0 } = prefItems
  const [threshold0, threshold15] = getLTCGThresholds(year, fs)
  let tax = 0

  // Step 1: Total preferential income (LTCG + qualified dividends)
  const totalPref = ltcg + qualDiv
  if (totalPref <= 0 && unrecap1250 <= 0 && collectibles <= 0) return 0

  // Step 2: "Stacking" — ordinary income fills brackets first, then pref income stacks on top
  const ordFloor = Math.max(0, ordinaryIncome)

  // ── LTCG + Qualified Dividends (0/15/20% rates) ────────────────────────────
  if (totalPref > 0) {
    // Amount of LTCG in the 0% bucket
    const zeroRoom = Math.max(0, threshold0 - ordFloor)
    const atZero = Math.min(totalPref, zeroRoom)

    // Amount of LTCG in the 15% bucket
    const fifteenTop = threshold15
    const fifteenRoom = Math.max(0, fifteenTop - Math.max(ordFloor, threshold0))
    const remaining15 = totalPref - atZero
    const atFifteen = Math.min(remaining15, fifteenRoom)

    // Remainder at 20%
    const atTwenty = totalPref - atZero - atFifteen

    tax += atFifteen * 0.15
    tax += atTwenty * 0.20
  }

  // ── Unrecaptured Section 1250 Gain (max 25%) — IRC §1(h)(1)(D) ─────────────
  // Taxed at the LESSER of 25% or the taxpayer's ordinary bracket rate
  // For planning purposes: use 25% (conservative, correct for mid/high income)
  if (unrecap1250 > 0) {
    // Stack 1250 gain on top of ordinary income + LTCG already used
    const alreadyUsed = ordFloor + Math.min(totalPref, Math.max(0, threshold15 - ordFloor))
    // Rate is min(25%, marginal ordinary rate above this stack point)
    // Simplified: 25% for incomes above the 22% bracket, 22% for lower — use 25% for planning
    tax += unrecap1250 * 0.25
  }

  // ── Collectibles Gain (max 28%) — IRC §1(h)(4) ─────────────────────────────
  if (collectibles > 0) {
    tax += collectibles * 0.28
  }

  return Math.round(tax)
}

// Net Investment Income Tax — IRC §1411 — 3.8% on lesser of NII or excess AGI over threshold
function calcNIIT(nii, agi, year, fs) {
  const threshold = getNIITThreshold(year, fs)
  if (agi <= threshold || nii <= 0) return 0
  const excessAGI = agi - threshold
  return Math.round(Math.min(nii, excessAGI) * 0.038)
}

function calcQBI(qbiIncome, taxableBeforeQBI, capitalGains) {
  if (qbiIncome <= 0 || taxableBeforeQBI <= 0) return 0
  const qbiComponent = qbiIncome * 0.20
  const netCapGain = Math.max(0, capitalGains)
  const incomeLimitation = Math.max(0, taxableBeforeQBI - netCapGain) * 0.20
  return Math.round(Math.min(qbiComponent, incomeLimitation))
}

function fmt(n) {
  if (n === null || n === undefined) return '$0'
  const abs = Math.abs(Math.round(n))
  const str = '$' + abs.toLocaleString('en-US')
  return n < 0 ? '(' + str + ')' : str
}

function nv(v) {
  return parseFloat((v || '').toString().replace(/[^0-9.-]/g, '')) || 0
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
  const [w2Income, setW2Income] = React.useState(savedF1040.w2Income || '')
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
  const [estPaid, setEstPaid] = React.useState(savedF1040.estimatedPayments || '')
  const [w2Withheld, setW2Withheld] = React.useState(savedF1040.w2Withheld || '')
  const [showDetail, setShowDetail] = React.useState(false)

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
  const priorQBILossCO = Math.abs(nv(priorYearQBILoss)) // QBI loss carryforward — reduces qbiBasis only, NOT AGI

  // Total gross income — k1Total flows from Step 1 (negative = loss, reduces income)
  // Social Security: up to 85% taxable (simplified for planning)
  const ssBenefits = ytdScale(socialSecurity)
  const taxableSS = Math.round(ssBenefits * 0.85)
  const iraIncome = ytdScale(iraDistributions)
  const grossIncome = w2 + k1Total + rentalNet + stGain + ltGain + intInc + divInc + f4797Inc + taxableSS + iraIncome

  // SE tax computed BEFORE adjustments because halfSE is an above-the-line deduction (Schedule 1 Line 15)
  const SE_SUBJECT_TYPES = ['Sole Proprietor / Single-Member LLC', 'Partnership / Multi-Member LLC']
  const seNetIncome = entities.reduce((sum, e) => {
    if (!e || !SE_SUBJECT_TYPES.includes(e.type)) return sum
    return sum + Math.max(0, parseFloat(e.k1) || 0)
  }, 0)

  // SE tax: 12.4% SS (capped at wage base) + 2.9% Medicare (uncapped), on 92.35% of SE earnings
  // SS wage base parameterized via TAX_TABLES per year (2024: $168,600, 2025: $176,100, 2026: $184,500 per SSA)
  const ssWageBase = TAX_TABLES[taxYear]?.ssWageBase || 176100
  const seEarningsSubject = seNetIncome * 0.9235
  const ssPortion = Math.min(seEarningsSubject, ssWageBase) * 0.124
  const medicarePortion = seEarningsSubject * 0.029
  const seTax = Math.round(ssPortion + medicarePortion)
  const halfSE = Math.round(seTax / 2) // deductible half of SE tax (Schedule 1 Line 15, reduces AGI; also reduces QBI basis per Reg §1.199A-3(b)(1)(vi))

  // Above-the-line deductions (Schedule 1, Part II) — halfSE is included here so it reduces AGI
  const selfEmpHealthDed = ytdScale(selfEmpHealthIns)
  const hsaDed = ytdScale(hsaDeduction)
  const studentLoanDed = Math.min(ytdScale(studentLoanInt), 2500) // capped at $2,500
  const adjustments = halfSE + selfEmpHealthDed + hsaDed + studentLoanDed
  const agi = grossIncome - adjustments

  // Deductions
  const stdDed = getStdDed(taxYear, status)
  const itemized = nv(itemizedAmt)
  const deduction = useItemized ? Math.max(stdDed, itemized) : stdDed

  // New: parse additional capital gain types
  const unrec1250 = Math.max(0, nv(unrecap1250))      // Unrecaptured Sec 1250 gain — max 25%
  const collectibles = Math.max(0, nv(collectiblesGain)) // Collectibles — max 28%

  // QBI — only on positive qualified business income; $0 when k1Total is negative (loss year)
  // ── Self-Employment income + SE tax (IRC §1401) ──────────────────────────────
  // SE-subject entity types: Sole Prop, SMLLC (disregarded), Partnership (GP default), LLC (Partnership)
  // NOT SE-subject: S-Corp (handled via officer W-2 payroll), C-Corp (corporate tax)
  // SE tax block moved above (now computed before adjustments). seTax, halfSE, seNetIncome, SE_SUBJECT_TYPES available here.

  // Entity-mix classifiers for display labels
  const SCHED_C_TYPES = ['Sole Proprietor / Single-Member LLC']
  const K1_TYPES = ['Partnership / Multi-Member LLC', 'S Corporation', 'C Corporation']
  const hasSchedC = entities.some(e => SCHED_C_TYPES.includes(e?.type))
  const hasK1 = entities.some(e => K1_TYPES.includes(e?.type))
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

  // QBI basis per Treas. Reg. §1.199A-3(b)(1)(vi): reduce SE-subject income by halfSE AND SE health insurance
  // SE retirement contributions also reduce per the reg, but app does not yet track them as a separate input
  // S-Corp K-1 is NOT SE-subject, so its portion passes through unchanged
  const nonSEk1 = Math.max(0, k1Total - seNetIncome)
  const seK1AfterAdjustments = Math.max(0, seNetIncome - halfSE - selfEmpHealthDed)
  const qbiBasis = nonSEk1 + seK1AfterAdjustments + Math.max(0, rentalNet) - priorQBILossCO
  const taxableBeforeQBI = Math.max(0, agi - deduction)
  // LTCG + qualified dividends excluded from QBI income limitation base per IRC §199A(e)(1)
  const prefIncome = ltGain + qualDiv
  const qbi = calcQBI(qbiBasis, taxableBeforeQBI, prefIncome)

  // ── Split income into ordinary vs preferential for accurate tax calculation ──
  // Ordinary taxable income = everything EXCEPT LTCG, qualified dividends, 1250, collectibles
  // These are already included in grossIncome → taxableBeforeQBI, so we subtract them out
  const totalPrefIncome = Math.max(0, ltGain) + Math.max(0, qualDiv) + unrec1250 + collectibles
  const taxableAfterQBI = Math.max(0, taxableBeforeQBI - qbi)
  // Ordinary income is whatever remains after removing preferential income (floor at 0)
  const ordinaryTaxableIncome = Math.max(0, taxableAfterQBI - totalPrefIncome)
  // Total taxable income (for display)
  const taxableIncome = taxableAfterQBI

  // ── Federal income tax on ORDINARY income only (brackets) ───────────────────
  const ordFedTax = calcFederalTax(ordinaryTaxableIncome, taxYear, status)

  // ── Preferential tax via QDCGTW (IRC §1(h)) ─────────────────────────────────
  // LTCG + qualified dividends at 0/15/20%; Sec 1250 at max 25%; Collectibles at max 28%
  const prefTax = calcPreferentialTax(ordinaryTaxableIncome, {
    ltcg: Math.min(Math.max(0, ltGain), taxableAfterQBI),
    qualDiv: Math.min(Math.max(0, qualDiv), taxableAfterQBI),
    unrecap1250: Math.min(unrec1250, taxableAfterQBI),
    collectibles: Math.min(collectibles, taxableAfterQBI),
  }, taxYear, status)

  const fedTax = ordFedTax + prefTax

  // ── Marginal rate on ordinary income ────────────────────────────────────────
  const brackets = getBrackets(taxYear, status)
  let marginalRate = 0
  if (ordinaryTaxableIncome > 0) {
    let prev = 0
    for (const [cap, rate] of brackets) {
      if (ordinaryTaxableIncome > prev) { marginalRate = rate }
      prev = cap
    }
  } else if (totalPrefIncome > 0) {
    // Show LTCG rate when only preferential income exists
    const [t0, t15] = getLTCGThresholds(taxYear, status)
    marginalRate = totalPrefIncome > t15 ? 0.20 : totalPrefIncome > t0 ? 0.15 : 0
  }

  // ── Additional Medicare Tax (0.9%) — IRC §3101(b)(2) ────────────────────────
  const amtThreshold = getAMTThreshold(taxYear, status)
  const additionalMedicare = Math.round(Math.max(0, w2 + seEarningsSubject - amtThreshold) * 0.009) // Form 8959 unified threshold on combined W-2 + SE

  // ── Net Investment Income Tax (3.8%) — IRC §1411 ────────────────────────────
  // NII = net investment income: dividends, interest, rental income (if passive), LTCG
  // For REP: rental income is NOT passive → excluded from NII
  const rentalNII = isREP ? 0 : Math.max(0, rentalNet)
  const nii = Math.max(0, intInc + divInc + Math.max(0, ltGain) + Math.max(0, qualDiv) + rentalNII)
  const niit = calcNIIT(nii, agi, taxYear, status)

  // ── Child Tax Credit (IRC §24) ───────────────────────────────────────────────
  const numDependents = parseInt(dependents) || 0
  const childCredit = Math.min(numDependents * 2000, fedTax + additionalMedicare + niit)

  // ── Total Tax ────────────────────────────────────────────────────────────────
  const totalTax = Math.max(0, fedTax + seTax + additionalMedicare + niit - childCredit)

  // Effective rate on earned income
  const effectiveRate = grossIncome > 0 ? (totalTax / Math.max(1, w2 + Math.max(0, k1Total))) : 0

  // Payments
  const withheld = nv(w2Withheld)
  const estimated = nv(estPaid)
  const totalPayments = withheld + estimated
  const balance = totalTax - totalPayments

  // Quarterly estimate recommendation (remaining quarters)
  const quarterlyRecommended = balance > 0 ? Math.round(balance / 4) : 0

  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', outline: 'none' }
  const lbl = { fontSize: 11, fontWeight: 700, color: SL, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', color: N }}>
      <style>{`input:focus, select:focus { outline: 2px solid ${B} !important; box-shadow: none !important; }`}</style>

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
          <button onClick={() => nav('/ai-analysis')} style={{ padding: '7px 14px', background: 'none', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: SL, cursor: 'pointer' }}>AI Analysis</button>
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
                <MoneyInput value={w2Income} onChange={setW2Income} placeholder="0" style={inp} />
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
          <CollapsibleSection title="RENTAL REAL ESTATE (SCHEDULE E)">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: N }}>
                <input type="checkbox" checked={isREP} onChange={e => setIsREP(e.target.checked)} style={{ width: 14, height: 14, accentColor: B }} />
                Real Estate Professional
              </label>
            {isREP ? (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
                ✓ REP status: rental losses fully deductible against all income (unlimited)
              </div>
            ) : null}
            {!isREP && (
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                ⚠ Without REP status, passive rental losses are limited to $25,000 (phased out above $100K AGI)
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Total Rental Income <InfoTip text="All rent collected from tenants this year. Reference last year's Schedule E, or add up rental deposits from your bank statements."/></label>
                <MoneyInput value={rentalIncome} onChange={setRentalIncome} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Total Rental Expenses (incl. depreciation) <InfoTip text="All rental property expenses including mortgage interest, taxes, insurance, repairs, and depreciation. Find on Schedule E or your property records."/></label>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>QBI deduction</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#4ADE80' }}>{fmt(qbi)} saved</span>
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
                  ['Rental Net (Sch E)', rentalNet, rentalNet >= 0],
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
                  ['QBI Deduction', qbi > 0 ? -qbi : 0, false],
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
            <button onClick={() => nav('/ai-analysis')} style={{ width: '100%', padding: '13px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              🧠 View AI Analysis & Risk Report →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
