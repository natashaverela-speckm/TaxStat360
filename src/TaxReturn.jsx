import React from 'react'
import { useNavigate } from 'react-router-dom'
import { TAX_TABLES, AMT_TABLES, SALT_CAPS, getTable, getStdDed, getBrackets, getLTCGThresholds, getAddlMedicareThreshold, calcFederalTax, calcPreferentialTax, calcNIIT, calcAMT, calcQBI, QBI_THRESHOLDS, nv, calcTaxReturn } from './taxCalc'
import MoneyInput from './components/MoneyInput.jsx'
import FederalScopeBanner from './components/FederalScopeBanner.jsx'
import DismissibleNotice from './components/DismissibleNotice'
import { parseMoney } from './utils/parseMoney.js'
import { readPersonalContext, writePersonalContext, writeTaxYear, readStep1State, readStep1StateRaw, readTaxYear } from './utils/sessionState.js'

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

function BracketBadge({ rate }) {
  const colors = {
    0:  { bg: '#f0fdf4', color: '#15803d', label: '0%'  },
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

  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  )
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const [manualK1s, setManualK1s] = React.useState(readPersonalContext().manualK1s || [])
  const { entities, k1Total: dashboardK1Total } = readStep1State()
  const manualK1Total = manualK1s.reduce((sum, k) => sum + (parseMoney(k.amount) || 0), 0)
  const k1Total = dashboardK1Total + manualK1Total

  const savedF1040 = readPersonalContext()
  const savedTaxYear = readTaxYear()

  const [taxYear, setTaxYear] = React.useState(savedTaxYear)
  const [ytdMode, setYtdMode] = React.useState(false)
  const [ytdMonth, setYtdMonth] = React.useState(new Date().getMonth() + 1)
  const [status, setStatus] = React.useState(savedF1040.filingStatus || 'single')
  const [qualifiedDividends, setQualifiedDividends] = React.useState(0)
  const [socialSecurity, setSocialSecurity] = React.useState(0)
  const [iraDistributions, setIraDistributions] = React.useState(0)
  const [selfEmpHealthIns, setSelfEmpHealthIns] = React.useState(0)
  const [hsaDeduction, setHsaDeduction] = React.useState(0)
  const [studentLoanInt, setStudentLoanInt] = React.useState(0)
  const [selfEmpRetirement, setSelfEmpRetirement] = React.useState(savedF1040.selfEmpRetirement || 0)
  const [nolCarryforward, setNolCarryforward] = React.useState(savedF1040.nolCarryforward || 0)
  const [w2Income, setW2Income] = React.useState(savedF1040.w2Income || '')
  const [w2Withheld, setW2Withheld] = React.useState(savedF1040.w2Withheld || 0)
  const [dependents, setDependents] = React.useState(savedF1040.dependents || '0')
  const [isREP, setIsREP] = React.useState(false)
  const [isActiveParticipant, setIsActiveParticipant] = React.useState(true)
  const [rentalIncome, setRentalIncome] = React.useState(0)
  const [rentalExpenses, setRentalExpenses] = React.useState(0)
  const [capitalGains, setCapitalGains] = React.useState(0)
  const [ltCapGains, setLtCapGains] = React.useState(0)
  const [unrecap1250, setUnrecap1250] = React.useState(0)
  const [collectiblesGain, setCollectiblesGain] = React.useState(0)
  const [priorYearQBILoss, setPriorYearQBILoss] = React.useState(0)
  const [interest, setInterest] = React.useState(0)
  const [dividends, setDividends] = React.useState(0)
  const [form4797, setForm4797] = React.useState(0)
  const [hasISO, setHasISO] = React.useState(false)
  const [isoBargainElement, setIsoBargainElement] = React.useState(0)
  const [estPaid, setEstPaid] = React.useState(0)
  const [useItemized, setUseItemized] = React.useState(false)
  const [saltPaid, setSaltPaid] = React.useState(0)
  const [mortgageInt, setMortgageInt] = React.useState(0)
  const [charitableGifts, setCharitableGifts] = React.useState(0)
  // F5-04: prior year safe harbor inputs — §6654(d)(1)(B) and §6654(d)(1)(D)
  const [priorYearTax, setPriorYearTax] = React.useState(savedF1040.priorYearTax || 0)
  const [priorYearAGI, setPriorYearAGI] = React.useState(savedF1040.priorYearAGI || 0)
  // F3-05: Income waterfall defaults to expanded so users see income breakdown immediately
  const [showWaterfall, setShowWaterfall] = React.useState(true)

  const addManualK1 = () => setManualK1s([...manualK1s, {
    id: 'mk1-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name: '', type: 'S Corporation', ownership: '100', amount: '',
  }])
  const updateManualK1 = (id, field, value) => setManualK1s(manualK1s.map(k => k.id === id ? { ...k, [field]: value } : k))
  const removeManualK1 = (id) => setManualK1s(manualK1s.filter(k => k.id !== id))

  function ytdScale(v) {
    if (!ytdMode || ytdMonth <= 0 || ytdMonth >= 12) return v
    return Math.round(v * 12 / ytdMonth)
  }

  React.useEffect(() => {
    writePersonalContext({
      filingStatus: status,
      w2Income,
      w2Withheld,
      dependents,
      selfEmpRetirement,
      nolCarryforward,
      manualK1s,
      priorYearTax,
      priorYearAGI,
    })
    writeTaxYear(taxYear)
  }, [status, w2Income, w2Withheld, dependents, selfEmpRetirement, nolCarryforward, manualK1s, taxYear, priorYearTax, priorYearAGI])

  // ── Tax computation ──────────────────────────────────────────────────────────
  const w2 = nv(w2Income)
  const scaledK1 = ytdScale(k1Total)
  const scaledW2 = ytdScale(w2)

  // F2-01: Officer salary auto-included from each S/C-Corp entity entered in Step 1.
  // This amount is NOT the "Additional W-2 Wages (Other Jobs)" field — it is separate.
  // It is shown in the W-2 section so users can verify it was picked up correctly.
  const totalOfficerSalary = entities.filter(e => /s.?corp|c.?corp/i.test(e?.type || '')).reduce((s, e) => s + (parseFloat(e?.pnl?.officerSalary) || 0), 0)
  const scaledOfficerSal = ytdScale(totalOfficerSalary)
  const totalBox17K = entities.reduce((s, e) => s + (parseFloat(e.box17K) || 0), 0)

  // ── SALT cap for itemized deduction ──────────────────────────────────────────
  const saltCapForYear = SALT_CAPS[taxYear] || 40000
  const saltDeductionCap = status === 'mfs' ? saltCapForYear / 2 : saltCapForYear
  const saltForItemized = Math.min(nv(saltPaid), saltDeductionCap)
  const computedItemizedAmt = saltForItemized + nv(mortgageInt) + nv(charitableGifts)

  // ── F4-03 FIX: Normalize entity shape for calcTaxReturn / calcQBI ─────────────
  // readStep1State() stores K-1 income and officer salary nested under e.pnl:
  //   e.pnl.netProfit     → K-1 ordinary business income
  //   e.pnl.officerSalary → officer W-2 salary
  //
  // taxCalc.js nonSEk1 reducer expects the flat property e.k1 (falls back to e.netProfit).
  // calcQBI F5-03 W-2 wage proxy expects the flat property e.officerW2.
  // Without this mapping both resolve to undefined → 0, collapsing qbiBasis to 0
  // and causing calcQBI to early-exit with deduction: 0 and wage: null, which:
  //   • Omits the §199A deduction from the displayed tax (overstates by ~$13K)
  //   • Triggers the false-positive "no W-2 wages found" hard warning
  //   • Inflates quarterly estimates ($17,259 vs correct ~$13,806)
  //
  // Display code below (K-1 summary rows, officer W-2 carry-through banner) reads
  // e.pnl directly and is intentionally left unchanged — only the calc input is mapped.
  // If Step 1 ever writes e.k1 / e.officerW2 directly, the undefined-guards below
  // prevent double-mapping (e.k1 !== undefined check, parseFloat chain).
  const entitiesForCalc = entities.map(e => {
    const own = (parseInt(e.own) || 100) / 100
    return {
      ...e,
      // Surface pnl.netProfit × ownership as e.k1 for nonSEk1 reducer in calcTaxReturn.
      // Preserve any e.k1 that Step 1 may have written directly (forward-compat guard).
      k1: e.k1 !== undefined
        ? e.k1
        : Math.round((parseFloat(e.pnl?.netProfit) || 0) * own),
      // Surface pnl.officerSalary as e.officerW2 for calcQBI §199A(b)(2) W-2 wage proxy.
      // Prefer Box 17V wages when already present; fall back to officer salary from pnl.
      officerW2: parseFloat(e.officerW2) || parseFloat(e?.pnl?.officerSalary) || 0,
    }
  })

  // ── Build inputs for calcTaxReturn ───────────────────────────────────────────
  const inputs = {
    taxYear,
    status,
    k1Total: scaledK1,
    w2: scaledW2 + scaledOfficerSal,
    dependents: parseInt(dependents) || 0,
    selfEmpHealthIns: ytdScale(nv(selfEmpHealthIns)),
    hsaDeduction: ytdScale(nv(hsaDeduction)),
    studentLoanInt: ytdScale(nv(studentLoanInt)),
    selfEmpRetirement: ytdScale(nv(selfEmpRetirement)),
    nolCarryforward: nv(nolCarryforward),
    rentalNet: ytdScale(nv(rentalIncome)) - ytdScale(nv(rentalExpenses)),
    isREP,
    isActiveParticipant,
    stGain: ytdScale(nv(capitalGains)),
    ltGain: ytdScale(nv(ltCapGains)),
    unrecap1250: ytdScale(nv(unrecap1250)),
    collectiblesGain: ytdScale(nv(collectiblesGain)),
    intInc: ytdScale(nv(interest)),
    divInc: ytdScale(nv(dividends)),
    qualDiv: ytdScale(nv(qualifiedDividends)),
    taxableSS: ytdScale(nv(socialSecurity)),
    iraIncome: ytdScale(nv(iraDistributions)),
    f4797Inc: ytdScale(nv(form4797) + totalBox17K),
    priorYearQBILoss: nv(priorYearQBILoss),
    hasISO,
    isoBargainElement: ytdScale(nv(isoBargainElement)),
    w2Withheld: nv(w2Withheld),
    estPaid: nv(estPaid),
    useItemized,
    itemizedAmt: useItemized ? computedItemizedAmt : 0,
    saltAmount: nv(saltPaid),
    // F5-04: prior year safe harbor inputs
    priorYearTax: nv(priorYearTax),
    priorYearAGI: nv(priorYearAGI),
    // F4-03: use normalized entities so calcQBI receives e.k1 and e.officerW2
    entities: entitiesForCalc,
  }

  const result = calcTaxReturn(inputs)

  const {
    totalTax = 0,
    balance = 0,
    totalPayments = 0,
    effectiveRate = 0,
    marginalRate = 0,
    ordinaryTaxableIncome = 0,
    agi = 0,
    stdDed: standardDeduction = 0,
    seTax: selfEmploymentTax = 0,
    additionalMedicare = 0,
    niit = 0,
    amt: amtAmount = 0,
    palSuspendedRental = 0,
    ebl = 0,
    quarterlyRecommended: quarterly = 0,
    qbiLimitApplied = 'none',   // 'qbi' | 'wage' | 'income' | 'min400' | 'none' — drives soft QBI warning
    // F5-04: safe harbor outputs from calcTaxReturn
    safeHarborCurrentYear = 0,
    safeHarborPriorYear = null,
    safeHarborMinimum = 0,
    safeHarborBalance = 0,
    safeHarborQuarterly = 0,
  } = result

  const appliedDeduction = useItemized ? computedItemizedAmt : standardDeduction
  const qbiDeduction = Math.max(0, agi - appliedDeduction - ordinaryTaxableIncome)

  const hasSchEIncome = entities.length > 0
  const incomeFooterLabel = k1Total >= 0 ? 'K-1 pass-through income' : 'K-1 pass-through loss'

  // ── Quarterly due dates ──────────────────────────────────────────────────────
  const today = new Date()
  const QUARTER_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const quarterDefs = [
    { label: 'Q1', due: new Date(taxYear,     3, 15) },
    { label: 'Q2', due: new Date(taxYear,     5, 15) },
    { label: 'Q3', due: new Date(taxYear,     8, 15) },
    { label: 'Q4', due: new Date(taxYear + 1, 0, 15) },
  ]

  // F5-04: threshold for the 110% prior year multiplier (MFS = $75K, all others = $150K)
  const priorYearHighThreshold = status === 'mfs' ? 75000 : 150000
  const priorYearMultiplierLabel = nv(priorYearAGI) > priorYearHighThreshold ? '110%' : '100%'

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div onClick={() => nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <svg width="28" height="28" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#0D1B3E" /><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3" /><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55" /><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8" /><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white" /></svg>
            <span style={{ fontWeight: 800, color: '#0D1B3E', fontSize: 17 }}>TaxStat<span style={{ color: '#2563EB' }}>360</span></span>
          </div>
          <div style={{ background: '#2563EB', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>Step 2 of 2 — Personal Return</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => nav('/calculate-tax')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>← Back to Business</button>
          <button onClick={() => nav('/dashboard')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>📂 Dashboard</button>
          <button onClick={() => nav('/ai-analysis')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>AI Analysis</button>
          <button onClick={() => { localStorage.clear(); nav('/login') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>Sign Out</button>
          <button onClick={() => nav('/settings')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>⚙ Settings</button>
        </div>
      </div>

      {/* Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 380px',
        gap: 24,
        maxWidth: 1100,
        margin: '0 auto',
        padding: isMobile ? '20px 16px' : '28px 24px',
        alignItems: 'start',
      }}>
        {/* LEFT — form */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 6px' }}>Personal Tax Return</h1>
          <p style={{ fontSize: 13, color: SL, margin: '0 0 20px' }}>Enter your personal info to calculate your total federal tax liability.</p>

          <DismissibleNotice storageKey="ts360_notice_tr_v2">
            TaxStat360 calculates <strong>federal tax estimates</strong> based on the information you enter. Results are for <strong>planning purposes only</strong> and do not constitute professional tax advice. Your actual liability may differ based on your complete financial situation. Consult a licensed CPA or tax professional before filing.
          </DismissibleNotice>

          {/* K-1 income summary from Step 1 */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', marginBottom: 16, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>K-1 INCOME FROM STEP 1</div>
            {entities.map((ent, i) => {
              const own = (parseInt(ent.own) || 100) / 100
              const net = ent.pnl ? Math.round(ent.pnl.netProfit * own) : 0
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < entities.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: N }}>{ent.name || 'Business ' + (i + 1)}</div>
                    <div style={{ fontSize: 11, color: SL }}>{ent.type} · {ent.own || 100}% ownership</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: net >= 0 ? G : R }}>{fmt(net)}</div>
                </div>
              )
            })}

            {manualK1s.map(k => (
              <div key={k.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <input value={k.name} onChange={e => updateManualK1(k.id, 'name', e.target.value)} placeholder="Entity name" style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: N, outline: 'none' }} />
                <select value={k.type} onChange={e => updateManualK1(k.id, 'type', e.target.value)} style={{ padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: N, outline: 'none' }}>
                  <option>S Corporation</option>
                  <option>Partnership / MMLLC — Active</option>
                  <option>Partnership / MMLLC — Passive</option>
                  <option>Sole Proprietor / Single-Member LLC</option>
                </select>
                <MoneyInput value={parseMoney(k.amount) || 0} onChange={v => updateManualK1(k.id, 'amount', String(v))} placeholder="0" style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: N, outline: 'none', width: 120 }} />
                <button onClick={() => removeManualK1(k.id)} style={{ background: 'none', border: 'none', color: R, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
              </div>
            ))}
            <button onClick={addManualK1} style={{ marginTop: 10, background: 'none', border: '1px dashed #CBD5E1', borderRadius: 8, padding: '6px 14px', fontSize: 12, color: SL, cursor: 'pointer', fontWeight: 600 }}>+ Add K-1</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: N }}>Total K-1 to Schedule E</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: k1Total >= 0 ? G : R }}>{fmt(k1Total)}</div>
            </div>
            {entities.length === 0 && manualK1s.length === 0 && (
              <div style={{ marginTop: 8, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                ⚠ No business entered. <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => nav('/calculate-tax')}>Go to Step 1</span> to add your business entities.
              </div>
            )}
            {k1Total < 0 && (
              <div style={{ marginTop: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1e40af' }}>
                ✓ Business loss of {fmt(Math.abs(k1Total))} is reducing your gross income on {hasSchEIncome ? 'Schedule E' : 'Schedule E (subject to passive activity and at-risk rules)'}
              </div>
            )}
            {/* F2-02: QBI warning — fires only when wage is genuinely missing (wage: null).
                After F4-03 fix, wage will be non-null whenever officer salary or Box 17V
                wages are present — so this hard warning is correctly suppressed in that case.
                The softer informational notice below handles the wage-limited (non-null) case. */}
            {k1Total > 0 && result.qbiCaps?.wage === null &&
             entities.some(e => /s.?corp|partnership|mmllc/i.test(e?.type || '')) && (
              <div style={{ marginTop: 8, background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#991b1b', fontWeight: 500 }}>
                ⚠ <strong>§199A QBI deduction may be significantly reduced:</strong> Your income may be above the W-2 wage limit threshold ({fmt(QBI_THRESHOLDS[taxYear]?.single || 197300)} single / {fmt(QBI_THRESHOLDS[taxYear]?.mfj || 394600)} MFJ for {taxYear}). No W-2 wages or officer salary were found for your entities. Enter your officer W-2 salary in Step 1 on each entity card, or enter Box 17V wages in ▼ Details → Advanced K-1 items, for an accurate §199A calculation.
              </div>
            )}
            {k1Total > 0 && result.qbiCaps?.wage !== null && qbiLimitApplied === 'wage' &&
             entities.some(e => /s.?corp|partnership|mmllc/i.test(e?.type || '')) && (
              <div style={{ marginTop: 8, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                ℹ §199A W-2 wage limit applied. For maximum accuracy, confirm the Box 17V wages on your K-1 match the officer salary used here, and enter UBIA of qualified property in ▼ Details → Advanced K-1 items.
              </div>
            )}
          </div>

          {/* Tax year + YTD */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', marginBottom: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px' }}>TAX YEAR</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <select value={taxYear} onChange={e => setTaxYear(parseInt(e.target.value))} style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: N, outline: 'none', fontWeight: 600 }}>
                    {[2026, 2025, 2024].map(y => (
                      <option key={y} value={y}>
                        {y === 2026 ? '2026 — Rev. Proc. 2025-32 (OBBBA)' : String(y)}
                      </option>
                    ))}
                  </select>
                  {ytdMode ? (
                    <select value={ytdMonth} onChange={e => setYtdMonth(parseInt(e.target.value))} style={{ padding: '6px 8px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: N, outline: 'none' }}>
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>(
                        <option key={i+1} value={i+1}>Through {m}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: SL }}>
                  <input type="checkbox" checked={ytdMode} onChange={e => setYtdMode(e.target.checked)} />
                  YTD Mode (annualize)
                  <InfoTip text="Year-to-date mode: enter income and expenses as of today and we'll project your full-year liability. Useful mid-year for planning. Disable to enter full-year figures directly." />
                </label>
              </div>
            </div>
            {ytdMode && (
              <div style={{ marginTop: 10, padding: '8px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 12, color: '#1E40AF' }}>
                📅 YTD through {['January','February','March','April','May','June','July','August','September','October','November','December'][ytdMonth-1]} — figures will be annualized (× {(12/ytdMonth).toFixed(1)})
              </div>
            )}
            <div style={{ fontSize: 13, color: SL, marginTop: 10, flexShrink: 0 }}>Std. deduction: <strong style={{ color: N }}>{fmt(standardDeduction)}</strong></div>
            {taxYear === 2026 && (
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, lineHeight: 1.4 }}>
                2026 figures are per Rev. Proc. 2025-32 (OBBBA, P.L. 119-21). The §461(l) excess business loss thresholds are estimated — verify when IRS publishes final guidance.
              </div>
            )}
          </div>

          {/* Filing status & dependents */}
          <CollapsibleSection title="FILING STATUS &amp; DEPENDENTS">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filing Status <InfoTip text="Your IRS filing status. Single = unmarried. MFJ = married filing jointly. MFS = married filing separately. HOH = head of household (unmarried with qualifying dependent). QSS = qualifying surviving spouse (2 years after spouse's death)." /></label>
                <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, outline: 'none' }}>
                  <option value="single">Single</option>
                  <option value="mfj">Married Filing Jointly</option>
                  <option value="mfs">Married Filing Separately</option>
                  <option value="hoh">Head of Household</option>
                  <option value="qss">Qualifying Surviving Spouse</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Qualifying Dependents
                  <InfoTip text="Qualifying children under 17 receive the Child Tax Credit ($2,000/child for 2025). Other qualifying dependents (non-child) receive a $500 Other Dependent Credit. Enter the total number of all qualifying dependents here." />
                </label>
                <select value={dependents} onChange={e => setDependents(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, outline: 'none' }}>
                  {[0,1,2,3,4,5,6,7,8].map(n => <option key={n} value={String(n)}>{n} dependent{n !== 1 ? 's' : ''}</option>)}
                </select>
              </div>
            </div>
          </CollapsibleSection>

          {/* W-2 income & withholding */}
          <CollapsibleSection title="W-2 INCOME &amp; WITHHOLDING">
            {totalOfficerSalary > 0 && (
              <div style={{ marginTop: 12, marginBottom: 4, padding: '10px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF', letterSpacing: '0.5px', marginBottom: 6 }}>OFFICER W-2 — CARRIED FROM STEP 1 (DO NOT RE-ENTER)</div>
                {entities.filter(e => /s.?corp|c.?corp/i.test(e?.type || '') && (parseFloat(e?.pnl?.officerSalary) || 0) > 0).map((ent, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#1E40AF', marginBottom: 2 }}>
                    <span>{ent.name || 'Business ' + (i + 1)} ({ent.type})</span>
                    <span style={{ fontWeight: 700 }}>{fmt(parseFloat(ent.pnl?.officerSalary) || 0)}</span>
                  </div>
                ))}
                {ytdMode && <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 4 }}>Annualized to {fmt(scaledOfficerSal)} in YTD mode</div>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional W-2 Wages (Other Jobs) <InfoTip text="W-2 wages from a job other than your S-corp or C-corp. Do NOT include your officer salary here — that is tracked in Step 1 on each entity card and shown above." /></label>
                <MoneyInput value={parseMoney(w2Income) || 0} onChange={v => setW2Income(String(v))} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Federal Tax Withheld (W-2) <InfoTip text="Total federal income tax withheld from all W-2 jobs this year (Box 2 on each W-2). Used to calculate your refund or balance due." /></label>
                <MoneyInput value={w2Withheld} onChange={setW2Withheld} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
            </div>
            <WhatGoesHere items={[
              'Your W-2 Box 1 wages from jobs outside your business entity',
              'Do NOT include your S-corp officer salary here — enter it on the entity card in Step 1 (it is automatically carried through, shown above)',
              'Federal tax withheld from W-2 Box 2 — used to calculate refund or balance due',
            ]} />
          </CollapsibleSection>

          {/* Rental real estate */}
          <CollapsibleSection title="RENTAL REAL ESTATE (SCHEDULE E, PART I)">
            <div style={{ paddingTop: 12 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: SL, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isREP} onChange={e => setIsREP(e.target.checked)} />
                  Real Estate Professional
                  <InfoTip text="IRC §469(c)(7): To qualify as a Real Estate Professional, you must spend more than 750 hours per year in real property trades or businesses in which you materially participate, AND more than 50% of your total personal services must be in those real property trades. If you qualify, rental losses are NOT passive and can offset all income. You must also materially participate in each rental activity (or make the §469(c)(7)(A) aggregate election on a timely filed return)." />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: SL, cursor: 'pointer' }}>
                  <input type="checkbox" checked={isActiveParticipant} onChange={e => setIsActiveParticipant(e.target.checked)} />
                  Active Participant
                  <InfoTip text="IRC §469(i)(6): Active participation is a lower standard than material participation — you must make management decisions (setting rents, approving tenants, approving expenses). You do NOT need to participate in day-to-day management. Active participants may deduct up to $25,000 in rental losses against non-passive income (phased out $100K–$150K AGI). Passive investors (syndications, limited partners) cannot claim this allowance." />
                </label>
              </div>
              {!isREP && isActiveParticipant && (
                <div style={{ marginTop: 8, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                  ⚠ Without REP status, passive rental losses are limited to $25,000 (phased out between $100K–$150K AGI, eliminated above $150K — IRC §469(i)(3)). To qualify under §469(c)(7): &gt;750 hours/year in real property trades, &gt;50% of personal services in real property trades, AND material participation in each rental — or aggregate via §469(c)(7)(A) election.
                </div>
              )}
              {isREP && (
                <div style={{ marginTop: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#1e40af' }}>
                  ✓ REP status: rental losses fully deductible against all income (subject to §461(l) excess business loss limit and at-risk rules).
                </div>
              )}
              {!isREP && !isActiveParticipant && (
                <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b' }}>
                  ✗ Passive investor: rental losses are fully suspended under §469. Suspended losses carry forward and release when you sell the property.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Total Rental Income (Sch E Part I, line 3) <InfoTip text="Rental income as reported on Schedule E Part I, Line 3 — all rent collected this year." /></label>
                  <MoneyInput value={rentalIncome} onChange={setRentalIncome} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Total Rental Expenses incl. Depreciation (Sch E Part I, line 20) <InfoTip text="All rental expenses including depreciation — mortgage interest + property taxes + insurance + repairs + management fees + depreciation. Enter the total from Schedule E Part I, Line 20." /></label>
                  <MoneyInput value={rentalExpenses} onChange={setRentalExpenses} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
              <WhatGoesHere items={[
                'Total Rental Income: all rent collected this year — use bank deposits or last year\'s Schedule E as a reference',
                'Total Rental Expenses: mortgage interest + property taxes + insurance + repairs + management fees + depreciation',
                'Depreciation: typically cost of building ÷ 27.5 years annually',
                'REP (Real Estate Professional): check if rental is your primary profession (750+ hours/year in real property trades, 50%+ of personal services)',
                'Without REP: passive losses above $25,000 are suspended and carry forward until property is sold',
              ]} />
            </div>
          </CollapsibleSection>

          {/* Other income */}
          <CollapsibleSection title="OTHER INCOME">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, paddingTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Short-Term Capital Gains / (Losses) <InfoTip text="Assets held 1 year or less — taxed at ordinary rates. Enter net of gains and losses. Schedule D Line 7." /></label>
                <MoneyInput value={capitalGains} onChange={setCapitalGains} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: '#92400e', marginTop: 3 }}>Held ≤1 yr — taxed at ordinary rates</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Long-Term Capital Gains / (Losses) <InfoTip text="Assets held MORE than 1 year — taxed at 0%, 15%, or 20% preferential rates (IRC §1(h)). Enter net LTCG from Schedule D Line 15. Do NOT include §1250 recapture here — enter that separately below." /></label>
                <MoneyInput value={ltCapGains} onChange={setLtCapGains} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: '#15803d', marginTop: 3 }}>Held &gt;1 yr — taxed at 0/15/20%</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Unrecaptured Sec 1250 Gain <InfoTip text="Depreciation recapture on real property sold at a gain — taxed at max 25% rate (IRC §1(h)(1)(D)). Reported on the Unrecaptured Section 1250 Gain Worksheet in the Schedule D instructions. Enter as a positive number." /></label>
                <MoneyInput value={unrecap1250} onChange={setUnrecap1250} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: '#A855F7', marginTop: 3 }}>Depreciation recapture — max 25% rate</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Collectibles Gain <InfoTip text="Gain from sale of coins, art, antiques, gems, stamps, or other collectibles held more than 1 year — taxed at max 28% rate (IRC §1(h)(4)). Enter as a positive number. Short-term collectibles gains are taxed at ordinary rates — enter those in the Short-Term field." /></label>
                <MoneyInput value={collectiblesGain} onChange={setCollectiblesGain} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 3 }}>Coins, art, antiques — max 28% rate</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Taxable Interest <InfoTip text="Interest earned from bank accounts, bonds, CDs — 1040 Line 2b. Do NOT include tax-exempt municipal bond interest (that goes on Line 2a and is not entered here)." /></label>
                <MoneyInput value={interest} onChange={setInterest} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>1040 Line 2b — taxable interest only; tax-exempt interest (Line 2a) is not entered here</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Ordinary Dividends <InfoTip text="From 1099-DIV Box 1a — a subset will qualify for preferential LTCG rates (enter qualified portion separately below)." /></label>
                <MoneyInput value={dividends} onChange={setDividends} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Form 4797 Ordinary Gain/(Loss) <InfoTip text="Form 4797 Part II — net ordinary gain or loss from sale of business property. Schedule 1 Line 4 — flows from Form 4797 Part II + K-1 Box 17K aggregated from Step 1." /></label>
                <MoneyInput value={form4797} onChange={setForm4797} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Schedule 1 Line 4 — flows from Form 4797 Part II + K-1 Box 17K aggregated from Step 1</div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Prior Year QBI Loss Carryforward <InfoTip text="Negative qualified business income loss carryforward from prior year — reduces this year's QBI deduction base per IRC §199A(c)(2). Enter as a positive number." /></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <MoneyInput value={priorYearQBILoss} onChange={setPriorYearQBILoss} placeholder="0" style={{ width: 200, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 12, color: SL, lineHeight: 1.4 }}>Enter prior year QBI loss as positive number. Reduces this year's QBI deduction base; does not affect AGI.</div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Incentive Stock Options */}
          <CollapsibleSection title="INCENTIVE STOCK OPTIONS (AMT)" defaultOpen={false}>
            <div style={{ fontSize: 12, color: SL, marginBottom: 12, lineHeight: 1.5, paddingTop: 8 }}>
              If you exercised ISOs this year and held the shares past year-end, the bargain element is an AMT preference item (Form 6251 Line 2i) — it increases your AMTI but does not create regular taxable income.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: SL }}>
              <input type="checkbox" checked={hasISO} onChange={e => setHasISO(e.target.checked)} style={{ width: 16, height: 16 }} />
              I exercised ISOs and held shares past year-end
            </label>
            {hasISO && (
              <div style={{ marginTop: 4 }}>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>ISO Bargain Element <InfoTip text="(FMV at exercise) − (strike price) × shares exercised. Added to AMTI on Form 6251 Line 2i." /></label>
                <MoneyInput value={isoBargainElement} onChange={setIsoBargainElement} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Form 6251 line 2i — added to AMT income</div>
              </div>
            )}
          </CollapsibleSection>

          {/* Retirement & Social Security */}
          <CollapsibleSection title="RETIREMENT &amp; SOCIAL SECURITY INCOME">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Social Security Benefits <InfoTip text="Total SS/SSA-1099 Box 5 gross benefits. Up to 85% is taxable depending on combined income (IRC §86)." /></label>
                <MoneyInput value={socialSecurity} onChange={setSocialSecurity} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>IRA / Pension Distributions <InfoTip text="Taxable amount from Form 1099-R Box 2a — traditional IRA, 401(k), or pension distributions. Do not include Roth IRA qualified distributions." /></label>
                <MoneyInput value={iraDistributions} onChange={setIraDistributions} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Qualified Dividends <InfoTip text="From 1099-DIV Box 1b — a subset of ordinary dividends taxed at LTCG rates (0/15/20%). Must be less than or equal to ordinary dividends above." /></label>
                <MoneyInput value={qualifiedDividends} onChange={setQualifiedDividends} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Above-the-line deductions */}
          <CollapsibleSection title="ABOVE-THE-LINE DEDUCTIONS (SCHEDULE 1)">
            <div style={{ fontSize: 12, color: SL, marginBottom: 12, paddingTop: 8 }}>These reduce your AGI before the standard/itemized deduction is applied.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>
                  &gt;2% Shareholder / Self-Employed Health Insurance (Sch 1, Line 17)
                  <InfoTip text="For S-corp owners (>2% shareholders): premiums must first be included in your W-2 Box 1 wages by the S-Corp, then deducted here on Schedule 1 Line 17 (IRC §162(l); Notice 2008-1). This two-step process is mandatory — failing to include premiums in W-2 wages disqualifies the deduction. Not deductible if eligible for employer-sponsored coverage through a spouse. For sole proprietors and partners: enter premiums under IRC §162(l)." />
                </label>
                <MoneyInput value={selfEmpHealthIns} onChange={setSelfEmpHealthIns} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>HSA Deduction <InfoTip text="Health Savings Account contributions — Schedule 1 Line 13. 2025 limits: $4,300 (self-only HDHP), $8,550 (family HDHP). Must have a qualifying High-Deductible Health Plan." /></label>
                <MoneyInput value={hsaDeduction} onChange={setHsaDeduction} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Student Loan Interest <InfoTip text="Interest paid on qualified student loans — Schedule 1 Line 21. Maximum $2,500 deduction, phased out at higher income levels." /></label>
                <MoneyInput value={studentLoanInt} onChange={setStudentLoanInt} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Prior-Year NOL Carryforward <InfoTip text="Net Operating Loss carryforward from a prior year — Schedule 1 Line 8a — enter as positive, treated as a reduction. IRC §172(a)(2) (TCJA, extended by OBBBA): post-2017 NOL carryforwards are limited to 80% of taxable income before the NOL deduction. This limit is applied automatically. Pre-2018 NOLs are unlimited — if yours is pre-2018, your actual deduction may be slightly larger than shown." /></label>
                <MoneyInput value={nolCarryforward} onChange={setNolCarryforward} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Schedule 1 Line 8a — enter as positive, treated as reduction</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Self-Employed Retirement Plans <InfoTip text="For S-Corp owners: contributions must be based on your officer W-2 salary — NOT K-1 distributions (IRC §402(h); §415(c); IRS Pub. 560). Enter employer contributions on Schedule 1 Line 16. SEP-IRA: up to 25% of W-2 salary (max $70,000 for 2025). Solo 401(k): employee deferrals up to $23,500 + employer match up to 25% of W-2 salary. For sole proprietors: based on net self-employment earnings × 0.9235." /></label>
                <MoneyInput value={selfEmpRetirement} onChange={setSelfEmpRetirement} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Schedule 1 line 16. SEP-IRA, SIMPLE-IRA, Solo 401(k) employer contributions for sole proprietors AND &gt;2% S Corp shareholders.</div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Deduction method */}
          <CollapsibleSection title="DEDUCTION METHOD">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: SL }}>
                <input type="checkbox" checked={useItemized} onChange={e => setUseItemized(e.target.checked)} style={{ width: 16, height: 16 }} />
                Use itemized deductions
              </label>
            </div>
            {!useItemized && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 13, color: SL }}>Standard deduction ({status === 'mfj' || status === 'qss' ? 'MFJ' : status === 'hoh' ? 'HOH' : status === 'mfs' ? 'MFS' : 'Single'})</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: N }}>{fmt(standardDeduction)}</div>
              </div>
            )}
            {useItemized && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>State &amp; Local Taxes Paid (SALT) <InfoTip text="State income tax paid + local property taxes. SALT deduction capped at $10,000 (2024) / $40,000 (2025 OBBBA) for single and MFJ filers. MFS = half of cap." /></label>
                  <MoneyInput value={saltPaid} onChange={setSaltPaid} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Mortgage Interest <InfoTip text="Deductible mortgage interest on up to $750,000 of acquisition debt (TCJA limit, §163(h))." /></label>
                  <MoneyInput value={mortgageInt} onChange={setMortgageInt} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Charitable Contributions <InfoTip text="Cash and non-cash charitable gifts to qualifying organizations — Schedule A Line 16. Cash gifts generally limited to 60% of AGI." /></label>
                  <MoneyInput value={charitableGifts} onChange={setCharitableGifts} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: '#F8FAFC', borderRadius: 10, padding: '12px 16px', gap: 8 }}>
                  <div style={{ fontSize: 12, color: SL }}>Total itemized</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: N, marginLeft: 'auto' }}>{fmt(computedItemizedAmt)}</div>
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Estimated tax payments */}
          <CollapsibleSection title="ESTIMATED TAX PAYMENTS MADE">
            <div style={{ paddingTop: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Total Estimated Payments Paid This Year <InfoTip text="All quarterly estimated tax payments made to the IRS this year (Form 1040-ES). Sum of all four quarters paid. Do not include W-2 withholding here — enter that in the W-2 section above." /></label>
              <MoneyInput value={estPaid} onChange={setEstPaid} placeholder="0" style={{ maxWidth: 240, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Sum of all quarterly payments made so far</div>
            </div>
            {/* F5-04: prior year safe harbor inputs */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 6 }}>PRIOR YEAR SAFE HARBOR (OPTIONAL)</div>
              <div style={{ fontSize: 12, color: SL, marginBottom: 10, lineHeight: 1.5 }}>
                Enter your prior year figures to see whether paying 100%/110% of last year's tax is less than 90% of this year's. Paying the lesser amount still avoids the §6654 underpayment penalty — and for growing businesses it's often the lower payment.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Prior Year Total Tax (Form 1040, Line 24) <InfoTip text="Your total federal tax from last year's return. Used for the §6654(d)(1)(B)(ii) prior year safe harbor. If your prior year AGI exceeded $150,000 ($75,000 MFS), the safe harbor requires 110% of this amount instead of 100% — §6654(d)(1)(D)." /></label>
                  <MoneyInput value={priorYearTax} onChange={setPriorYearTax} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Prior Year AGI (Form 1040, Line 11) <InfoTip text="Prior year adjusted gross income. Used to determine whether the 100% or 110% safe harbor multiplier applies. Over $150,000 single/MFJ (or $75,000 MFS) → 110% of prior year tax required." /></label>
                  <MoneyInput value={priorYearAGI} onChange={setPriorYearAGI} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* RIGHT — Live Results */}
        <div style={{ position: isMobile ? 'static' : 'sticky', top: 72 }}>
          <div style={{ background: N, borderRadius: 18, padding: 28, color: '#fff', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', marginBottom: 8 }}>ESTIMATED FEDERAL TAX LIABILITY</div>
            <FederalScopeBanner />
            <div style={{ fontSize: 48, fontWeight: 900, color: totalTax === 0 ? '#4ADE80' : '#F87171', lineHeight: 1 }}>
              {fmt(totalTax)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              {totalTax === 0 ? 'No federal income tax owed' : 'Estimated federal income tax'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4, marginBottom: 16, lineHeight: 1.4 }}>
              Federal only — state income tax not included. Your total tax burden will be higher.{' '}
              <a href="https://www.taxfoundation.org/data/all/state/state-income-tax-rates/" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline', fontSize: 10 }}>State rates →</a>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              {effectiveRate > 0 ? (effectiveRate * 100).toFixed(1) + '% effective rate on total income' : ''}
            </div>

            <div style={{ background: balance > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{balance > 0 ? 'ESTIMATED TAX OWED' : 'ESTIMATED REFUND'}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: balance > 0 ? '#F87171' : '#4ADE80' }}>{fmt(Math.abs(balance))}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{fmt(totalTax)} tax − {fmt(totalPayments)} paid</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>Income Tax</span>
                <span style={{ fontWeight: 700, color: '#F87171' }}>{fmt(result.ordFedTax + (result.prefTax || 0))}</span>
              </div>
              {selfEmploymentTax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Self-Employment Tax</span>
                  <span style={{ fontWeight: 700, color: '#F87171' }}>{fmt(selfEmploymentTax)}</span>
                </div>
              )}
              {additionalMedicare > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>Addl Medicare (0.9%)</span>
                  <span style={{ fontWeight: 700, color: '#F87171' }}>{fmt(additionalMedicare)}</span>
                </div>
              )}
              {niit > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>NIIT (3.8%)</span>
                  <span style={{ fontWeight: 700, color: '#F87171' }}>{fmt(niit)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>AMT estimate (Form 6251)</span>
                <span style={{ fontWeight: 700, color: amtAmount > 0 ? '#F87171' : 'rgba(255,255,255,0.4)' }}>{fmt(amtAmount)}</span>
              </div>
              {amtAmount > 0 && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, lineHeight: 1.4 }}>
                  Estimate only — excludes some Form 6251 preference items (e.g. certain ISO exercises, ACE adjustment). Verify with a CPA.
                </div>
              )}
              {qbiDeduction > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>QBI Deduction (§199A)</span>
                  <span style={{ fontWeight: 700, color: '#4ADE80' }}>({fmt(qbiDeduction)})</span>
                </div>
              )}
            </div>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 16, lineHeight: 1.5 }}>
              ⚠ Accuracy depends on your inputs. Please review all fields. This is an estimate — consult a tax professional for filing.
            </div>
          </div>

          {/* Income Waterfall */}
          {(() => {
            const totalW2 = scaledW2 + scaledOfficerSal
            const totalOther = inputs.rentalNet + inputs.stGain + inputs.ltGain +
              inputs.intInc + inputs.divInc + inputs.taxableSS +
              inputs.iraIncome + inputs.f4797Inc
            const totalGross = scaledK1 + totalW2 + totalOther
            const aboveLine = Math.max(0, totalGross - agi)
            const dedAmt = useItemized ? computedItemizedAmt : standardDeduction
            const qbiDed = Math.max(0, agi - dedAmt - ordinaryTaxableIncome)
            const wfRow = (label, amt, isTotal = false, isNeg = false) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: isTotal ? '2px solid #E2E8F0' : '1px solid #F8FAFC' }}>
                <span style={{ fontSize: 12, color: isTotal ? N : SL, fontWeight: isTotal ? 700 : 400 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: isTotal ? 800 : 600, color: isNeg ? R : (isTotal ? N : SL) }}>
                  {isNeg ? '(' + fmt(Math.abs(amt)) + ')' : fmt(amt)}
                </span>
              </div>
            )
            return (
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', marginBottom: 16, overflow: 'hidden' }}>
                <button onClick={() => setShowWaterfall(v => !v)} style={{ width: '100%', background: 'none', border: 'none', padding: '12px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px' }}>
                  INCOME WATERFALL
                  <span>{showWaterfall ? '▲' : '▼'}</span>
                </button>
                {showWaterfall && (
                  <div style={{ padding: '4px 18px 16px', borderTop: '1px solid #F1F5F9' }}>
                    {scaledK1 !== 0 && wfRow('K-1 Ordinary Business Income', scaledK1)}
                    {totalW2 > 0 && wfRow('W-2 Wages', totalW2)}
                    {totalOther !== 0 && wfRow('Other Income', totalOther)}
                    {wfRow('= Gross Income', totalGross, true)}
                    {aboveLine > 0 && wfRow('Above-the-line deductions', aboveLine, false, true)}
                    {wfRow('= AGI', agi, true)}
                    {wfRow(useItemized ? 'Itemized deduction' : 'Standard deduction', dedAmt, false, true)}
                    {qbiDed > 0 && wfRow('QBI deduction (§199A)', qbiDed, false, true)}
                    {wfRow('= Taxable Income', ordinaryTaxableIncome, true)}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Quarterly estimated payments */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>QUARTERLY ESTIMATED PAYMENTS</div>
            {quarterDefs.map((q, i) => {
              const isPast = q.due < today
              const mo = QUARTER_MONTHS[q.due.getMonth()]
              const dy = q.due.getDate()
              const yearSuffix = i === 3 ? " '" + String(taxYear + 1).slice(2) : ''
              const dueLabel = (isPast ? 'Past' : 'Due') + ' ' + mo + ' ' + dy + yearSuffix
              const labelColor = isPast ? '#94A3B8' : N
              const subColor   = isPast ? '#94A3B8' : SL
              const amtColor   = isPast ? '#94A3B8' : quarterly > 0 ? R : G
              return (
                <div key={q.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, color: labelColor, fontSize: 13 }}>{q.label}</span>
                    <span style={{ fontSize: 11, color: subColor, marginLeft: 8 }}>{dueLabel}</span>
                  </div>
                  <div style={{ fontWeight: 700, color: amtColor, fontSize: 14 }}>{fmt(quarterly)}</div>
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: SL, marginTop: 8, lineHeight: 1.5 }}>Based on annual liability ÷ 4. Adjust for income earned to date.</div>

            {/* F5-04: prior year safe harbor display */}
            {safeHarborPriorYear !== null && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 8 }}>§6654 SAFE HARBOR OPTIONS</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                  <span style={{ color: SL }}>90% of current year (§6654(d)(1)(B)(i))</span>
                  <span style={{ fontWeight: 600, color: N }}>{fmt(safeHarborCurrentYear)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12 }}>
                  <span style={{ color: SL }}>{priorYearMultiplierLabel} of prior year (§6654(d)(1)(B)(ii))</span>
                  <span style={{ fontWeight: 600, color: N }}>{fmt(safeHarborPriorYear)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#EFF6FF', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: B }}>Safe harbor minimum ÷ 4</div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      Pay this each quarter to avoid §6654 penalty
                      {safeHarborBalance > 0 && ` · ${fmt(safeHarborBalance)} total remaining`}
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: B }}>{fmt(safeHarborQuarterly)}</div>
                </div>
              </div>
            )}

            {/* F2-07: annualized income installment method note */}
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
              💡 <strong>Uneven income?</strong> The annualized income installment method (§6654(d)(2)) may allow lower payments in early quarters when income is earned unevenly. This requires calculating each quarter's actual income — consult a CPA or IRS Form 2210.
            </div>
          </div>

          {/* Save & AI */}
          <button
            onClick={() => {
              writePersonalContext({ filingStatus: status, w2Income, w2Withheld, dependents, selfEmpRetirement, nolCarryforward, manualK1s, priorYearTax, priorYearAGI })
              const existing = JSON.parse(localStorage.getItem('ts360_records_' + localStorage.getItem('ts360_email')) || '[]')
              const record = { id: Date.now(), savedAt: new Date().toISOString(), entities, biz: { entityType: entities[0]?.type || 'Unknown', year: taxYear, ownershipPct: entities[0]?.own || '100', grossRevenue: String(entities[0]?.pnl?.grossRevenue || 0) }, f1040: { filingStatus: status, w2Income, w2Withheld, dependents, selfEmpRetirement, nolCarryforward, priorYearTax, priorYearAGI } }
              existing.unshift(record)
              localStorage.setItem('ts360_records_' + localStorage.getItem('ts360_email'), JSON.stringify(existing.slice(0, 20)))
              alert('✅ Record saved!')
            }}
            style={{ width: '100%', padding: '14px', background: '#0D1B3E', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 10 }}
          >
            💾 Save This Record
          </button>
          <button
            onClick={() => nav('/ai-analysis')}
            style={{ width: '100%', padding: '14px', background: B, border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            View AI Analysis &amp; Risk Report →
          </button>
        </div>
      </div>
    </div>
  )
}
