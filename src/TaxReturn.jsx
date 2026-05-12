import React from 'react'
import { useNavigate } from 'react-router-dom'
import { TAX_TABLES, AMT_TABLES, SALT_CAPS, getTable, getStdDed, getBrackets, getLTCGThresholds, getAddlMedicareThreshold, calcFederalTax, calcPreferentialTax, calcNIIT, calcAMT, calcQBI, nv, calcTaxReturn } from './taxCalc'
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
  const [itemizedAmt, setItemizedAmt] = React.useState(0)
  const [saltPaid, setSaltPaid] = React.useState(0)
  const [mortgageInt, setMortgageInt] = React.useState(0)
  const [charitableGifts, setCharitableGifts] = React.useState(0)

  const addManualK1 = () => setManualK1s([...manualK1s, {
    id: 'mk1-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    name: '',
    type: 'S Corporation',
    ownership: '100',
    amount: '',
  }])
  const updateManualK1 = (id, field, value) => setManualK1s(manualK1s.map(k => k.id === id ? { ...k, [field]: value } : k))
  const removeManualK1 = (id) => setManualK1s(manualK1s.filter(k => k.id !== id))

  function ytdScale(v) {
    if (!ytdMode || ytdMonth <= 0 || ytdMonth >= 12) return v
    return Math.round(v * 12 / ytdMonth)
  }

  // Persist personal context on every field change
  React.useEffect(() => {
    writePersonalContext({
      filingStatus: status,
      w2Income,
      dependents,
      selfEmpRetirement,
      nolCarryforward,
      manualK1s,
    })
    writeTaxYear(taxYear)
  }, [status, w2Income, dependents, selfEmpRetirement, nolCarryforward, manualK1s, taxYear])

  // ── Tax computation ──────────────────────────────────────────────────────────
  const w2 = nv(w2Income)
  const scaledK1 = ytdScale(k1Total)
  const scaledW2 = ytdScale(w2)

  // Aggregate officer salary across all S-Corp entities
  const totalOfficerSalary = entities.filter(e => /s.?corp|c.?corp/i.test(e?.type || '')).reduce((s, e) => s + (parseFloat(e?.pnl?.officerSalary) || 0), 0)
  const scaledOfficerSal = ytdScale(totalOfficerSalary)
  const totalBox17K = entities.reduce((s, e) => s + (parseFloat(e.box17K) || 0), 0)

  // Build inputs for calcTaxReturn
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
    rentalIncome: ytdScale(nv(rentalIncome)),
    rentalExpenses: ytdScale(nv(rentalExpenses)),
    isREP,
    isActiveParticipant,
    capitalGains: ytdScale(nv(capitalGains)),
    ltCapGains: ytdScale(nv(ltCapGains)),
    unrecap1250: ytdScale(nv(unrecap1250)),
    collectiblesGain: ytdScale(nv(collectiblesGain)),
    interest: ytdScale(nv(interest)),
    dividends: ytdScale(nv(dividends)),
    qualifiedDividends: ytdScale(nv(qualifiedDividends)),
    f4797Inc: ytdScale(nv(form4797) + totalBox17K),
    priorYearQBILoss: nv(priorYearQBILoss),
    hasISO,
    isoBargainElement: ytdScale(nv(isoBargainElement)),
    estPaid: nv(estPaid),
    useItemized,
    itemizedAmt: nv(itemizedAmt),
    saltPaid: nv(saltPaid),
    mortgageInt: nv(mortgageInt),
    charitableGifts: nv(charitableGifts),
    entities,
  }

  const result = calcTaxReturn(inputs)

  const {
    totalTax = 0,
    balance = 0,
    effectiveRate = 0,
    marginalRate = 0,
    ordinaryTaxableIncome = 0,
    agi = 0,
    standardDeduction = 0,
    deductionUsed = 0,
    qbiDeduction = 0,
    qbiDetails = {},
    selfEmploymentTax = 0,
    additionalMedicare = 0,
    niit = 0,
    amtAmount = 0,
    palAdjustedRental = 0,
    palSuspendedRental = 0,
    hasSchEIncome = false,
    ebl = 0,
    quarterly = 0,
  } = result

  const incomeFooterLabel = k1Total >= 0 ? 'K-1 pass-through income' : 'K-1 pass-through loss'

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div onClick={() => nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <svg width="28" height="28" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#0D1B3E" /><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3" /><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55" /><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8" /><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white" /></svg>
            <span style={{ fontWeight: 800, color: '#0D1B3E', fontSize: 17 }}>TaxStat<span style={{ color: '#2563EB' }}>360</span></span>
          </div>
          <div style={{ background: '#2563EB', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>Step 2 of 2 — Personal Return</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/calculate-tax')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>← Back to Business</button>
          <button onClick={() => nav('/dashboard')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>📂 Dashboard</button>
          <button onClick={() => nav('/ai-analysis')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>AI Analysis</button>
          <button onClick={() => { localStorage.clear(); nav('/login') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>Sign Out</button>
          <button onClick={() => nav('/settings')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>⚙ Settings</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, maxWidth: 1100, margin: '0 auto', padding: '28px 24px', alignItems: 'start' }}>
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

            {/* Manual K-1 entries */}
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
          </div>

          {/* Tax year + YTD */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', marginBottom: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px' }}>TAX YEAR</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <select value={taxYear} onChange={e => setTaxYear(parseInt(e.target.value))} style={{ padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, color: N, outline: 'none', fontWeight: 600 }}>
                    {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Additional W-2 Wages (Other Jobs) <InfoTip text="W-2 wages from a job other than your S-corp or C-corp. Do NOT include your officer salary here — that is tracked in Step 1 on each entity card." /></label>
                <MoneyInput value={parseMoney(w2Income) || 0} onChange={v => setW2Income(String(v))} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: SL, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Federal Tax Withheld (W-2) <InfoTip text="Total federal income tax withheld from all W-2 jobs this year (Box 2 on each W-2). Used to calculate your refund or balance due." /></label>
                <MoneyInput value={nv(estPaid)} onChange={setEstPaid} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
            </div>
            <WhatGoesHere items={[
              'Your W-2 Box 1 wages from jobs outside your business entity',
              'Do NOT include your S-corp officer salary here — enter it on the entity card in Step 1',
              'Federal tax withheld from W-2 Box 2 — used to calculate refund or balance due',
            ]} />
          </CollapsibleSection>

          {/* Rental real estate */}
          <CollapsibleSection title="RENTAL REAL ESTATE (SCHEDULE E, PART I)">
            <div style={{ paddingTop: 12 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
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

              {/* FIX (T-06): completed the passive loss phase-out range.
                  Original text only said "phased out above $100K AGI" — missing the
                  $150K complete elimination point (IRC §469(i)(3)). */}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, paddingTop: 12 }}>
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
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Taxable Interest <InfoTip text="Interest earned from bank accounts, bonds, CDs — 1040 Line 2b. Do NOT include interest from tax-exempt municipal bonds." /></label>
                <MoneyInput value={interest} onChange={setInterest} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>1040 Line 2b — do not include interest</div>
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
                {/*
                  FIX (L3-01): Label corrected from "SELF-EMPLOYED HEALTH INSURANCE" to
                  ">2% Shareholder Health Insurance" for S-corp users.
                  For a greater-than-2% S-corp shareholder, premiums must first be included
                  in W-2 Box 1 wages by the corporation, then deducted by the shareholder
                  on Schedule 1 Line 17 (IRC §106(a); Rev. Rul. 91-26).
                  This is NOT self-employed health insurance (which applies to Schedule C
                  filers and partners under IRC §162(l)). Retaining "Self-Employed" in the
                  label for a sole-prop/partnership context is accurate — the field label
                  now dynamically reflects the entity type of the first entity.
                  We use a single generic label that covers both cases accurately:
                  ">2% Shareholder / Self-Employed Health Insurance (Sch 1, Line 17)"
                */}
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>
                  &gt;2% Shareholder / Self-Employed Health Insurance (Sch 1, Line 17)
                  <InfoTip text="For S-corp owners (&gt;2% shareholders): premiums paid by the corporation must be included in your W-2 Box 1 wages first, then deducted here on Schedule 1 Line 17 (IRC §106(a); Rev. Rul. 91-26). Not deductible if you are eligible for employer-sponsored coverage through a spouse. For sole proprietors and partners: enter health insurance premiums under IRC §162(l)." />
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
                <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Prior-Year NOL Carryforward <InfoTip text="Net Operating Loss carryforward from a prior year — Schedule 1 Line 8a — enter as positive, treated as reduction. NOLs from 2018+ are limited to 80% of taxable income (TCJA §172)." /></label>
                <MoneyInput value={nolCarryforward} onChange={setNolCarryforward} placeholder="0" style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Schedule 1 Line 8a — enter as positive, treated as reduction</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                {/*
                  FIX (T-01): Corrected SEP-IRA/Solo 401(k) contribution basis for S-Corp owners.
                  S-Corp shareholders are NOT self-employed (IRC §1402(a)(2)) — contributions must
                  be based on officer W-2 salary, not K-1 income (IRC §402(h); §415(c); IRS Pub. 560).
                */}
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
                  <div style={{ fontSize: 15, fontWeight: 700, color: N, marginLeft: 'auto' }}>{fmt(nv(saltPaid) + nv(mortgageInt) + nv(charitableGifts))}</div>
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Estimated tax payments */}
          <CollapsibleSection title="ESTIMATED TAX PAYMENTS MADE">
            <div style={{ paddingTop: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: SL, marginBottom: 4, fontWeight: 600 }}>Total Estimated Payments Paid This Year <InfoTip text="All quarterly estimated tax payments made to the IRS this year (Form 1040-ES). Sum of all four quarters paid." /></label>
              <MoneyInput value={estPaid} onChange={setEstPaid} placeholder="0" style={{ maxWidth: 240, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, color: N, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Sum of all quarterly payments made so far</div>
            </div>
          </CollapsibleSection>
        </div>

        {/* RIGHT — Live Results */}
        <div style={{ position: 'sticky', top: 72 }}>
          <div style={{ background: N, borderRadius: 18, padding: 28, color: '#fff', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '1px', marginBottom: 8 }}>ESTIMATED FEDERAL TAX LIABILITY</div>
            <FederalScopeBanner />
            <div style={{ fontSize: 48, fontWeight: 900, color: totalTax === 0 ? '#4ADE80' : '#F87171', lineHeight: 1 }}>
              {fmt(totalTax)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>{totalTax === 0 ? 'No federal income tax owed' : 'Estimated federal income tax'}</div>

            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              {effectiveRate > 0 ? (effectiveRate * 100).toFixed(1) + '% effective rate on earned income' : ''}
            </div>

            <div style={{ background: balance > 0 ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{balance > 0 ? 'ESTIMATED BALANCE DUE' : 'ESTIMATED REFUND'}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: balance > 0 ? '#F87171' : '#4ADE80' }}>{fmt(Math.abs(balance))}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{fmt(totalTax)} tax − {fmt(nv(estPaid))} paid</div>
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
            </div>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 16, lineHeight: 1.5 }}>
              ⚠ Accuracy depends on your inputs. Please review all fields. This is an estimate — consult a tax professional for filing.
            </div>
          </div>

          {/* Income waterfall */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', marginBottom: 16, overflow: 'hidden' }}>
            <button onClick={() => {}} style={{ width: '100%', background: 'none', border: 'none', padding: '12px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px' }}>
              INCOME WATERFALL ▼
            </button>
          </div>

          {/* Quarterly */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>QUARTERLY ESTIMATED PAYMENTS</div>
            {[
              { label: 'Q1', due: 'Due Apr 15' },
              { label: 'Q2', due: 'Due Jun 15' },
              { label: 'Q3', due: 'Due Sep 15' },
              { label: 'Q4', due: "Due Jan 15 '26" },
            ].map(q => (
              <div key={q.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, color: N, fontSize: 13 }}>{q.label}</span>
                  <span style={{ fontSize: 11, color: SL, marginLeft: 8 }}>{q.due}</span>
                </div>
                <div style={{ fontWeight: 700, color: quarterly > 0 ? R : G, fontSize: 14 }}>{fmt(quarterly)}</div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: SL, marginTop: 8, lineHeight: 1.5 }}>Based on annual liability ÷ 4. Adjust for income earned to date.</div>
          </div>

          {/* Save & AI */}
          <button
            onClick={() => {
              writePersonalContext({ filingStatus: status, w2Income, dependents, selfEmpRetirement, nolCarryforward, manualK1s })
              const existing = JSON.parse(localStorage.getItem('ts360_records_' + localStorage.getItem('ts360_email')) || '[]')
              const record = { id: Date.now(), savedAt: new Date().toISOString(), entities, biz: { entityType: entities[0]?.type || 'Unknown', year: taxYear, ownershipPct: entities[0]?.own || '100', grossRevenue: String(entities[0]?.pnl?.grossRevenue || 0) }, f1040: { filingStatus: status, w2Income, dependents, selfEmpRetirement, nolCarryforward } }
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
            🔴 View AI Analysis &amp; Risk Report →
          </button>
        </div>
      </div>
    </div>
  )
                }
