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
    brackets: {
      single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
      mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
      mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
      hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
      qss:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
    },
  },
  2025: {
    // OBBBA (Rev. Proc. 2025-32) raised 2025 std deduction: Single/MFS $15,750 | MFJ/QSS $31,500 | HOH $23,625
    std:      { single:15750, mfj:31500, mfs:15750, hoh:23625, qss:31500 },
    brackets: {
      single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
      mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
      mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[313200,.35],[Infinity,.37]],
      hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
      qss:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    },
  },
  2026: {
    // Rev. Proc. 2025-32: Single/MFS $16,100 | MFJ/QSS $32,200 | HOH $24,150
    std:      { single:16100, mfj:32200, mfs:16100, hoh:24150, qss:32200 },
    brackets: {
      single: [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[648750,.35],[Infinity,.37]],
      mfj:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
      mfs:    [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[388825,.35],[Infinity,.37]],
      hoh:    [[17600,.10],[67050,.12],[106900,.22],[203900,.24],[259300,.32],[648700,.35],[Infinity,.37]],
      qss:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
    },
  },
}
function getTable(year) { return TAX_TABLES[year] || TAX_TABLES[2025] }
function getStdDed(year, fs) { const t = getTable(year).std; return t[fs] || t.single }
function getBrackets(year, fs) { const t = getTable(year).brackets; return t[fs] || t.single }

// Standard deductions handled by TAX_TABLES above

// Additional Medicare Tax thresholds
const AMT_THRESHOLD = {
  single: 200000,
  mfj: 250000,
  mfs: 125000,
  hoh: 200000,
  qss: 250000,
}

// getBrackets defined above

function calcFederalTax(taxableIncome, year, fs) {
  if (taxableIncome <= 0) return 0
  let tax = 0, prev = 0
  for (const [cap, rate] of getBrackets(year, fs)) {
    if (taxableIncome <= prev) break
    tax += (Math.min(taxableIncome, cap) - prev) * rate
    prev = cap
  }
  return Math.round(tax)
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


export default function TaxReturn() {
  const nav = useNavigate()

  // Load K-1 data passed from Step 1
  const k1Total = parseFloat(sessionStorage.getItem('ts360_k1') || '0')
  const entitiesRaw = sessionStorage.getItem('ts360_entities')
  const entities = entitiesRaw ? JSON.parse(entitiesRaw) : []

  // Personal inputs
  const [taxYear, setTaxYear] = React.useState(2025)
  const [status, setStatus] = React.useState('single')
  const [qualifiedDividends, setQualifiedDividends] = React.useState('')
  const [socialSecurity, setSocialSecurity] = React.useState('')
  const [iraDistributions, setIraDistributions] = React.useState('')
  const [selfEmpHealthIns, setSelfEmpHealthIns] = React.useState('')
  const [hsaDeduction, setHsaDeduction] = React.useState('')
  const [studentLoanInt, setStudentLoanInt] = React.useState('')
  const [w2Income, setW2Income] = React.useState('')
  const [dependents, setDependents] = React.useState('0')
  const [isREP, setIsREP] = React.useState(false)
  const [rentalIncome, setRentalIncome] = React.useState('')
  const [rentalExpenses, setRentalExpenses] = React.useState('')
  const [capitalGains, setCapitalGains] = React.useState('')
  const [priorYearLosses, setPriorYearLosses] = React.useState('')
  const [interest, setInterest] = React.useState('')
  const [dividends, setDividends] = React.useState('')
  const [useItemized, setUseItemized] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [itemizedAmt, setItemizedAmt] = React.useState('')
  const [estPaid, setEstPaid] = React.useState('')
  const [w2Withheld, setW2Withheld] = React.useState('')
  const [showDetail, setShowDetail] = React.useState(false)

  // Core calculations
  const w2 = nv(w2Income)
  const rentalNet = isREP ? (nv(rentalIncome) - nv(rentalExpenses)) : Math.max(0, nv(rentalIncome) - nv(rentalExpenses))
  const capGain = nv(capitalGains)
  const intInc = nv(interest)
  const divInc = nv(dividends)
  const priorLosses = Math.abs(nv(priorYearLosses)) // always treated as reduction

  // Total gross income
  // Social Security: up to 85% taxable (simplified for planning)
  const ssBenefits = nv(socialSecurity)
  const taxableSS = Math.round(ssBenefits * 0.85)
  const iraIncome = nv(iraDistributions)
  const grossIncome = w2 + k1Total + rentalNet + capGain + intInc + divInc + taxableSS + iraIncome

  // Above-the-line deductions (Schedule 1, Part II)
  const selfEmpHealthDed = nv(selfEmpHealthIns)
  const hsaDed = nv(hsaDeduction)
  const studentLoanDed = Math.min(nv(studentLoanInt), 2500) // capped at $2,500
  const adjustments = priorLosses + selfEmpHealthDed + hsaDed + studentLoanDed
  const agi = grossIncome - adjustments

  // Deductions
  const stdDed = getStdDed(taxYear, status)
  const itemized = nv(itemizedAmt)
  const deduction = useItemized ? Math.max(stdDed, itemized) : stdDed

  // QBI — only on positive qualified business income
  const qbiBasis = Math.max(0, k1Total) + Math.max(0, rentalNet)
  const taxableBeforeQBI = Math.max(0, agi - deduction)
  const qbi = calcQBI(qbiBasis, taxableBeforeQBI, capGain)

  // Taxable income
  const taxableIncome = Math.max(0, taxableBeforeQBI - qbi)

  // Federal income tax
  const fedTax = calcFederalTax(taxableIncome, taxYear, status)

  // Marginal rate
  const brackets = getBrackets(taxYear, status)
  let marginalRate = 0
  if (taxableIncome > 0) {
    let prev = 0
    for (const [cap, rate] of brackets) {
      if (taxableIncome > prev) { marginalRate = rate }
      prev = cap
    }
  }

  // Additional Medicare Tax (0.9% on wages/SE over threshold)
  const amtThreshold = AMT_THRESHOLD[status] || 200000
  const additionalMedicare = Math.round(Math.max(0, w2 - amtThreshold) * 0.009)

  // Child tax credit
  const numDependents = parseInt(dependents) || 0
  const childCredit = Math.min(numDependents * 2000, fedTax + additionalMedicare)

  // Total tax
  const totalTax = Math.max(0, fedTax + additionalMedicare - childCredit)

  // Effective rate
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
          {entities.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>K-1 INCOME FROM STEP 1</div>
              {entities.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < entities.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: N }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: SL }}>{e.type} · {e.own}% ownership</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: e.k1 >= 0 ? G : R }}>{fmt(e.k1)}</div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '2px solid #E2E8F0' }}>
                <span style={{ fontWeight: 700, color: N }}>Total K-1 to Schedule E</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: k1Total >= 0 ? G : R }}>{fmt(k1Total)}</span>
              </div>
            </div>
          )}

          {/* Tax Year */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #E2E8F0', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>TAX YEAR</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <select value={taxYear} onChange={e => setTaxYear(parseInt(e.target.value))} style={{ flex: 1, padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, background: '#fff' }}>
                {[2026,2025,2024].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div style={{ fontSize: 13, color: SL }}>Std. deduction: <strong style={{ color: N }}>{fmt(getStdDed(taxYear, status))}</strong></div>
            </div>
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
                <input value={w2Income} onChange={e => setW2Income(e.target.value)} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Federal Tax Withheld (W-2) <InfoTip text="Total federal tax withheld by your employer(s). Find on W-2 Box 2, or your last paystub under Federal Tax YTD."/></label>
                <input value={w2Withheld} onChange={e => setW2Withheld(e.target.value)} placeholder="0" style={inp} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Rental Real Estate */}
          <CollapsibleSection title="RENTAL REAL ESTATE (SCHEDULE E)">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: N }}>
                <input type="checkbox" checked={isREP} onChange={e => setIsREP(e.target.checked)} style={{ width: 14, height: 14, accentColor: B }} />
                Real Estate Professional
              </label>
            {isREP && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#1e40af', fontWeight: 600 }}>
                ✓ REP status: rental losses fully deductible against all income (unlimited)
              </div>
            )}
            {!isREP && (
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                ⚠ Without REP status, passive rental losses are limited to $25,000 (phased out above $100K AGI)
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Total Rental Income <InfoTip text="All rent collected from tenants this year. Reference last year's Schedule E, or add up rental deposits from your bank statements."/></label>
                <input value={rentalIncome} onChange={e => setRentalIncome(e.target.value)} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Total Rental Expenses (incl. depreciation) <InfoTip text="All rental property expenses including mortgage interest, taxes, insurance, repairs, and depreciation. Find on Schedule E or your property records."/></label>
                <input value={rentalExpenses} onChange={e => setRentalExpenses(e.target.value)} placeholder="0" style={inp} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Other Income */}
          <CollapsibleSection title="OTHER INCOME">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Capital Gains / (Losses) <InfoTip text="Gains or losses from selling stocks, crypto, or real estate. Find on your 1099-B from your broker. Enter negative numbers for losses."/></label>
                <input value={capitalGains} onChange={e => setCapitalGains(e.target.value)} placeholder="0" style={inp} />
                <div style={{ fontSize: 10, color: SL, marginTop: 3 }}>Enter negative for losses</div>
              </div>
              <div>
                <label style={lbl}>Taxable Interest <InfoTip text="Interest earned from bank accounts, CDs, or bonds. Find on your 1099-INT from your bank or financial institution."/></label>
                <input value={interest} onChange={e => setInterest(e.target.value)} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>Ordinary Dividends <InfoTip text="Dividends received from stocks or mutual funds. Find on your 1099-DIV Box 1a from your brokerage account."/></label>
                <input value={dividends} onChange={e => setDividends(e.target.value)} placeholder="0" style={inp} />
              </div>
            </div>
            {/* Prior Year Loss Carryforward */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <label style={lbl}>Prior Year Loss Carryforward <InfoTip text="Losses from prior years that carry forward. Find on last year's Form 8995 Line 16 (QBI losses) or Schedule D (capital loss carryovers)."/></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input value={priorYearLosses} onChange={e => setPriorYearLosses(e.target.value)} placeholder="0" style={{ ...inp, maxWidth: 200 }} />
                <div style={{ fontSize: 12, color: SL, lineHeight: 1.4 }}>
                  Enter losses carried forward from prior year (positive number). Reduces your AGI.
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Additional Income */}
          <CollapsibleSection title="RETIREMENT & SOCIAL SECURITY INCOME">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Social Security Benefits <InfoTip text="Total SS/SSA-1099 Box 5 gross benefits received. We apply the 85% maximum inclusion rate for planning purposes. Find on SSA-1099 form mailed each January."/></label>
                <input style={inp} type="text" placeholder="0" value={socialSecurity} onChange={e => setSocialSecurity(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>IRA / Pension Distributions <InfoTip text="Taxable amount from Form 1099-R Box 2a. Includes traditional IRA withdrawals, 401(k) distributions, pension payments. Roth distributions are generally tax-free — do not include."/></label>
                <input style={inp} type="text" placeholder="0" value={iraDistributions} onChange={e => setIraDistributions(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Qualified Dividends <InfoTip text="From 1099-DIV Box 1b — a subset of your ordinary dividends taxed at the lower capital gains rate (0%, 15%, or 20%). Must be ≤ Ordinary Dividends entered above."/></label>
                <input style={inp} type="text" placeholder="0" value={qualifiedDividends} onChange={e => setQualifiedDividends(e.target.value)} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Above-the-Line Deductions */}
          <CollapsibleSection title="ABOVE-THE-LINE DEDUCTIONS (SCHEDULE 1)">
            <div style={{ fontSize: 12, color: SL, marginBottom: 14 }}>These reduce your AGI before the standard/itemized deduction is applied.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={lbl}>Self-Employed Health Insurance <InfoTip text="Premiums you paid for health/dental/vision insurance for yourself and family if self-employed. Found in your records or Schedule K-1 attachments. Cannot exceed your net self-employment income."/></label>
                <input style={inp} type="text" placeholder="0" value={selfEmpHealthIns} onChange={e => setSelfEmpHealthIns(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>HSA Deduction <InfoTip text="Contributions you made directly to your Health Savings Account (not through payroll). From Form 8889. 2025 limit: $4,300 self-only, $8,550 family."/></label>
                <input style={inp} type="text" placeholder="0" value={hsaDeduction} onChange={e => setHsaDeduction(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Student Loan Interest <InfoTip text="Interest paid on qualified student loans. Capped at $2,500. Phases out between $75,000–$90,000 AGI (single). From Form 1098-E."/></label>
                <input style={inp} type="text" placeholder="0" value={studentLoanInt} onChange={e => setStudentLoanInt(e.target.value)} />
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
              {useItemized && (
                <div>
                  <label style={lbl}>Your Itemized Deductions (Schedule A) <InfoTip text="Total itemized deductions instead of the standard deduction. Find on Schedule A: mortgage interest (Form 1098), state taxes, charitable gifts, and medical expenses."/></label>
                  <input value={itemizedAmt} onChange={e => setItemizedAmt(e.target.value)} placeholder="0" style={inp} />
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Estimated Tax Payments */}
          <CollapsibleSection title="ESTIMATED TAX PAYMENTS MADE">
            <div>
              <label style={lbl}>Total Estimated Payments Paid This Year <InfoTip text="All quarterly payments sent to the IRS this year (Form 1040-ES). Find in your IRS Online Account or bank records for payments on April 15, June 15, Sept 15, and Jan 15."/></label>
              <input value={estPaid} onChange={e => setEstPaid(e.target.value)} placeholder="0" style={{ ...inp, maxWidth: 280 }} />
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

            {/* AMT */}
            {additionalMedicare > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Add'l Medicare Tax (0.9%)</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>{fmt(additionalMedicare)}</span>
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
            <button onClick={() => setShowDetail(!showDetail)} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}>
              INCOME WATERFALL {showDetail ? '▲' : '▼'}
            </button>
            {showDetail && (
              <div style={{ marginTop: 12 }}>
                {[
                  ['W-2 Wages', w2, true],
                  ['K-1 Business Income', k1Total, k1Total >= 0],
                  ['Rental Net', rentalNet, rentalNet >= 0],
                  ['Capital Gains', capGain, capGain >= 0],
                  ['Interest & Dividends', intInc + divInc, true],
                  ['─────────────────', null, true],
                  ['Gross Income', grossIncome, grossIncome >= 0],
                  ['Deduction (' + (useItemized && itemized > stdDed ? 'Itemized' : 'Standard') + ')', -deduction, false],
                  ['QBI Deduction', qbi > 0 ? -qbi : 0, false],
                  ['─────────────────', null, true],
                  ['Taxable Income', taxableIncome, taxableIncome >= 0],
                  ['Federal Income Tax', -fedTax, false],
                  ['Add\'l Medicare Tax', -additionalMedicare, false],
                  ['Child Tax Credit', childCredit > 0 ? childCredit : 0, true],
                  ['─────────────────', null, true],
                  ['Total Tax', -totalTax, false],
                ].map(([label, val, pos], i) => {
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
            )}
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
                const record = {
                  id: Date.now(),
                  savedAt: new Date().toLocaleString(),
                  type: 'personal-return',
                  // All 1040 inputs — fully restoreable
                  filingStatus: status,
                  w2Income,
                  w2Withheld,
                  rentalIncome,
                  rentalExpenses,
                  capitalGains,
                  interest,
                  dividends,
                  isREP,
                  useItemized,
                  itemizedAmt,
                  estPaid,
                  dependents,
                  priorYearLosses,
                  k1Total: Math.round(k1Total),
                  totalTax: Math.round(totalTax),
                  balance: Math.round(balance),
                  refund: balance < 0 ? Math.round(Math.abs(balance)) : 0,
                  quarterly: quarterlyRecommended,
                }
                const email = localStorage.getItem('ts360_email') || 'default'
                const key = 'ts360_records_' + email
                const existing = JSON.parse(localStorage.getItem(key) || '[]')
                localStorage.setItem(key, JSON.stringify([record, ...existing.slice(0, 19)]))
                // Also keep legacy key for dashboard compatibility
                localStorage.setItem('ts360_records', JSON.stringify([record, ...existing.slice(0, 19)]))
                window._savedConfirm = true
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
