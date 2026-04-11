import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'https://app.taxstat360.com'
const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'

// ─── IRS 2024/2025 TAX BRACKETS ───────────────────────────────────────────
const BRACKETS = {
  single: [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
  mfj:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
  mfs:    [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[365600,0.35],[Infinity,0.37]],
  hoh:    [[16550,0.10],[63100,0.12],[100500,0.22],[191950,0.24],[243700,0.32],[609350,0.35],[Infinity,0.37]],
  qss:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
}
const STANDARD_DED = { single:14600, mfj:29200, mfs:14600, hoh:21900, qss:29200 }
const FILING_LABELS = { single:'Single', mfj:'Married Filing Jointly', mfs:'Married Filing Separately', hoh:'Head of Household', qss:'Qualifying Surviving Spouse' }

function calcIncomeTax(taxableIncome, status) {
  const brackets = BRACKETS[status]
  let tax = 0, prev = 0
  for (const [ceiling, rate] of brackets) {
    if (taxableIncome <= prev) break
    const chunk = Math.min(taxableIncome, ceiling) - prev
    tax += chunk * rate
    prev = ceiling
  }
  return Math.round(tax)
}

function calcSETax(netSelfEmploy) {
  const seBase = Math.max(0, netSelfEmploy) * 0.9235
  return Math.round(seBase * 0.153)
}

function calcQBI(k1Income, entityType) {
  // 20% QBI deduction for passthrough entities (subject to limitations)
  if (!['S-Corporation','Multi-Member LLC','Partnership','Sole Proprietor'].includes(entityType)) return 0
  return Math.round(Math.max(0, k1Income) * 0.20)
}

function calcFullTax(form1040, k1Income, entityType) {
  const {
    filingStatus = 'single',
    w2Income = 0,
    otherIncome = 0,
    useStandardDed = true,
    itemizedDed = 0,
    childTaxCredit = 0,
    dependents = 0,
    estimatedPayments = 0,
    selfEmployed = false,
  } = form1040

  const k1 = parseFloat(k1Income) || 0
  const w2 = parseFloat(w2Income) || 0
  const other = parseFloat(otherIncome) || 0
  const estPay = parseFloat(estimatedPayments) || 0
  const ctc = parseFloat(childTaxCredit) || 0 // user-entered or auto ($2000/child)

  // SE tax (half is deductible)
  const seTax = selfEmployed ? calcSETax(k1) : 0
  const seDeduction = Math.round(seTax / 2)

  // QBI deduction
  const qbi = calcQBI(k1, entityType)

  // AGI
  const agi = Math.max(0, k1 + w2 + other - seDeduction)

  // Standard or itemized
  const stdDed = STANDARD_DED[filingStatus] || 14600
  const deduction = useStandardDed ? stdDed : Math.max(stdDed, parseFloat(itemizedDed) || 0)

  // QBI reduces taxable income further
  const taxableIncome = Math.max(0, agi - deduction - qbi)

  // Income tax from brackets
  const incomeTax = calcIncomeTax(taxableIncome, filingStatus)

  // Child tax credit (up to $2000/child, phases out above $200k single/$400k mfj)
  const phaseoutThreshold = filingStatus === 'mfj' ? 400000 : 200000
  const ctcPhaseout = Math.max(0, Math.floor((agi - phaseoutThreshold) / 1000) * 50)
  const dependentCount = parseFloat(dependents) || 0
  const autoCtc = Math.max(0, dependentCount * 2000 - ctcPhaseout)
  const totalCtc = ctc > 0 ? parseFloat(ctc) : autoCtc

  // Total tax before payments
  const totalTaxBeforeCredits = incomeTax + seTax
  const totalTaxAfterCredits = Math.max(0, totalTaxBeforeCredits - totalCtc)
  const taxOwed = Math.max(0, totalTaxAfterCredits - estPay)
  const refund = Math.max(0, estPay - totalTaxAfterCredits)

  // Effective rate
  const effectiveRate = agi > 0 ? ((totalTaxAfterCredits / agi) * 100).toFixed(1) : '0.0'

  // Quarterly payments needed
  const remainingTax = Math.max(0, totalTaxAfterCredits - estPay)
  const quarterlyNeeded = Math.round(remainingTax / 4)

  return {
    agi, deduction, qbi, seDeduction, seTax, taxableIncome,
    incomeTax, totalCtc, totalTaxBeforeCredits, totalTaxAfterCredits,
    taxOwed, refund, effectiveRate, quarterlyNeeded, stdDed,
    k1, w2, other, estPay
  }
}

const fmt = n => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
const pct = n => (parseFloat(n)||0).toFixed(1) + '%'

const LOGO = () => (
  <div style={{display:'flex',alignItems:'center',gap:10}}>
    <svg width="32" height="32" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="8" fill={N}/>
      <rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/>
      <rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/>
      <rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/>
      <rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/>
    </svg>
    <span style={{fontWeight:800,fontSize:18,color:N,borderBottom:'2px solid '+B,paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></span>
  </div>
)

const INTEGRATIONS = [
  {id:'quickbooks', name:'QuickBooks', color:'#2CA01C', bg:'#F0FBF0', abbr:'QB', desc:'Sync P&L, Balance Sheet'},
  {id:'xero',       name:'Xero',       color:'#13B5EA', bg:'#EFF9FF', abbr:'XE', desc:'Sync Reports & Journals'},
  {id:'wave',       name:'Wave',       color:'#2C6ECB', bg:'#EFF4FF', abbr:'WV', desc:'Sync Income & Expenses'},
  {id:'freshbooks', name:'FreshBooks', color:'#1a9c3e', bg:'#F0FBF4', abbr:'FB', desc:'Sync Invoices & Reports'},
]

function NavBar({active}) {
  const nav = useNavigate()
  return (
    <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 32px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
      <div onClick={()=>nav('/dashboard')} style={{cursor:'pointer'}}><LOGO/></div>
      <div style={{display:'flex',gap:4}}>
        {[['Dashboard','/dashboard'],['Calculate Tax','/calculate-tax'],['AI Analysis','/ai-analysis']].map(([l,p])=>(
          <button key={p} onClick={()=>nav(p)} style={{padding:'7px 16px',background:p===('/'+active.toLowerCase().replace(' ','-'))?B:'transparent',color:p===('/'+active.toLowerCase().replace(' ','-'))?'#fff':SL,border:'none',borderRadius:7,fontWeight:600,fontSize:13,cursor:'pointer'}}>
            {l}
          </button>
        ))}
      </div>
      <button onClick={()=>{localStorage.clear();}} style={{padding:'6px 14px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:12,cursor:'pointer',color:SL}}>Sign Out</button>
    </nav>
  )
}

function InfoBox({type, children}) {
  const styles = {
    info:    {bg:'#EFF6FF', border:'#BFDBFE', color:'#1E40AF', icon:'ℹ️'},
    warning: {bg:'#FFFBEB', border:'#FDE68A', color:'#92400E', icon:'⚠️'},
    danger:  {bg:'#FEF2F2', border:'#FECACA', color:'#991B1B', icon:'🚨'},
    success: {bg:'#F0FDF4', border:'#86EFAC', color:'#166534', icon:'✅'},
  }
  const s = styles[type] || styles.info
  return (
    <div style={{display:'flex',gap:10,padding:'12px 14px',background:s.bg,border:'1px solid '+s.border,borderRadius:10,marginBottom:10}}>
      <span style={{fontSize:15,flexShrink:0}}>{s.icon}</span>
      <span style={{fontSize:13,color:s.color,lineHeight:1.55}}>{children}</span>
    </div>
  )
}

export default function CalculateTax() {
  const nav = useNavigate()
  const [view, setView] = useState('connect') // connect | entry | analysis | whatif
  const [records, setRecords] = useState([])
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [connectedApp, setConnectedApp] = useState(null)
  const [whatifMode, setWhatifMode] = useState(false)
  const [whatifSaved, setWhatifSaved] = useState(null)

  const [biz, setBiz] = useState({
    year: new Date().getFullYear(),
    entityType: 'S-Corporation',
    grossRevenue: '',
    businessExpenses: '',
    officerSalary: '',
    depreciation: '',
    otherDeductions: '',
    ownershipPct: 100,
  })

  const [f1040, setF1040] = useState({
    filingStatus: 'single',
    w2Income: '',
    otherIncome: '',
    useStandardDed: true,
    itemizedDed: '',
    dependents: '',
    childTaxCredit: '',
    estimatedPayments: '',
    selfEmployed: false,
  })

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('ts360_records') || '[]')
    const app = localStorage.getItem('ts360_connected_app')
    setRecords(saved)
    if (app) setConnectedApp(app)
    if (saved.length > 0) {
      setSelectedRecord(saved[0])
      setView('analysis')
    }
  }, [])

  // Live K-1 calculation
  const calcK1 = (b = biz) => {
    const rev = parseFloat(b.grossRevenue) || 0
    const exp = parseFloat(b.businessExpenses) || 0
    const sal = parseFloat(b.officerSalary) || 0
    const dep = parseFloat(b.depreciation) || 0
    const other = parseFloat(b.otherDeductions) || 0
    const net = rev - exp - sal - dep - other
    return Math.round(net * ((parseFloat(b.ownershipPct) || 100) / 100))
  }

  const k1 = calcK1()
  const tax = selectedRecord ? calcFullTax(f1040, selectedRecord.k1Income, selectedRecord.entityType) : null
  const liveTax = view === 'entry' ? calcFullTax(f1040, k1, biz.entityType) : null

  const handleConnect = (integ) => {
    window.open(API + '/integrations/' + integ.id + '/connect', '_blank')
    localStorage.setItem('ts360_connected_app', integ.name)
    setConnectedApp(integ.name)
    setView('entry')
  }

  const handleSave = () => {
    const record = {
      id: Date.now(),
      year: biz.year,
      entityType: biz.entityType,
      grossRevenue: parseFloat(biz.grossRevenue) || 0,
      businessExpenses: parseFloat(biz.businessExpenses) || 0,
      officerSalary: parseFloat(biz.officerSalary) || 0,
      depreciation: parseFloat(biz.depreciation) || 0,
      otherDeductions: parseFloat(biz.otherDeductions) || 0,
      ownershipPct: parseFloat(biz.ownershipPct) || 100,
      k1Income: k1,
      f1040: {...f1040},
      connectedApp,
      savedAt: new Date().toLocaleString(),
    }
    const updated = [record, ...records]
    setRecords(updated)
    setSelectedRecord(record)
    localStorage.setItem('ts360_records', JSON.stringify(updated))
    setView('analysis')
  }

  const handleDelete = (id) => {
    const updated = records.filter(r => r.id !== id)
    setRecords(updated)
    localStorage.setItem('ts360_records', JSON.stringify(updated))
    if (selectedRecord?.id === id) {
      setSelectedRecord(updated[0] || null)
      setView(updated.length > 0 ? 'analysis' : 'connect')
    }
  }

  const F1040Field = ({label, k, type='number', hint, wide}) => (
    <div style={{gridColumn: wide ? '1 / -1' : 'auto', marginBottom:14}}>
      <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
      {hint && <div style={{fontSize:11,color:'#94A3B8',marginBottom:4}}>{hint}</div>}
      <input
        type={type} value={f1040[k] || ''}
        onChange={e => setF1040(p => ({...p, [k]: type==='number' ? e.target.value : e.target.value}))}
        style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box',outline:'none'}}
      />
    </div>
  )

  // ─── VIEW: CONNECT ────────────────────────────────────────────────────────
  if (view === 'connect') return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <NavBar active="Calculate Tax"/>
      <div style={{maxWidth:620,margin:'48px auto',padding:'0 20px'}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <h1 style={{fontSize:26,fontWeight:800,color:N,margin:'0 0 10px'}}>Plan Your Taxes — In Real Time</h1>
          <p style={{color:SL,fontSize:14,lineHeight:1.6,margin:0}}>Connect your accounting software or enter your numbers manually.<br/>We'll calculate your K-1 income and show your actual Form 1040 tax liability.</p>
        </div>

        <div style={{background:'#fff',borderRadius:16,padding:28,boxShadow:'0 2px 12px rgba(0,0,0,0.06)',marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:16}}>CONNECT YOUR ACCOUNTING SOFTWARE</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:8}}>
            {INTEGRATIONS.map(i => (
              <button key={i.id} onClick={() => handleConnect(i)} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:i.bg,border:'1.5px solid '+i.color+'44',borderRadius:12,cursor:'pointer',textAlign:'left',transition:'box-shadow 0.15s'}}
                onMouseOver={e=>e.currentTarget.style.boxShadow='0 4px 12px '+i.color+'33'}
                onMouseOut={e=>e.currentTarget.style.boxShadow='none'}
              >
                <div style={{width:40,height:40,borderRadius:10,background:i.color,color:'#fff',fontWeight:800,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i.abbr}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:N}}>{i.name}</div>
                  <div style={{fontSize:11,color:SL,marginTop:2}}>{i.desc}</div>
                </div>
              </button>
            ))}
          </div>
          <p style={{fontSize:11,color:'#94A3B8',margin:'10px 0 0',textAlign:'center'}}>Connecting opens a secure OAuth authorization window. Your data is never stored on our servers.</p>
        </div>

        <div style={{textAlign:'center',color:SL,fontSize:13,marginBottom:16}}>— or —</div>

        <button onClick={() => setView('entry')} style={{width:'100%',padding:'14px',background:'#fff',border:'2px solid #E2E8F0',borderRadius:12,fontWeight:700,fontSize:15,color:N,cursor:'pointer'}}>
          Enter Numbers Manually
        </button>

        {records.length > 0 && (
          <button onClick={() => setView('analysis')} style={{width:'100%',padding:'12px',background:'transparent',border:'none',color:B,fontWeight:600,fontSize:13,cursor:'pointer',marginTop:8}}>
            View my saved records →
          </button>
        )}
      </div>
    </div>
  )

  // ─── VIEW: ENTRY ─────────────────────────────────────────────────────────
  if (view === 'entry') return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <NavBar active="Calculate Tax"/>
      <div style={{maxWidth:760,margin:'32px auto',padding:'0 20px'}}>

        {connectedApp && (
          <div style={{background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:'10px 16px',marginBottom:20,fontSize:13,color:'#166534',display:'flex',gap:8}}>
            <strong>Connected: {connectedApp}</strong> — Review your imported numbers below and confirm they are correct.
          </div>
        )}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

          {/* LEFT: Business Numbers */}
          <div style={{background:'#fff',borderRadius:14,padding:24,boxShadow:'0 1px 8px rgba(0,0,0,0.06)'}}>
            <h2 style={{fontSize:16,fontWeight:800,color:N,margin:'0 0 4px'}}>Business Financials</h2>
            <p style={{color:SL,fontSize:12,margin:'0 0 20px'}}>Your business income and deductions</p>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>Tax Year</label>
                <select value={biz.year} onChange={e=>setBiz(p=>({...p,year:parseInt(e.target.value)}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff'}}>
                  {[2025,2024,2023,2022].map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>Entity Type</label>
                <select value={biz.entityType} onChange={e=>setBiz(p=>({...p,entityType:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff'}}>
                  {['S-Corporation','Multi-Member LLC','Partnership','Sole Proprietor','C-Corporation'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {[
              ['Gross Revenue', 'grossRevenue', 'Total revenue before deductions'],
              ['Business Expenses', 'businessExpenses', 'Operating costs, payroll (excl. officer salary)'],
              ['Depreciation', 'depreciation', 'Sec 179, bonus depreciation, MACRS'],
              ['Other Deductions', 'otherDeductions', 'Home office, vehicle, other allowable deductions'],
            ].map(([label, key, hint]) => (
              <div key={key} style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
                <div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>{hint}</div>
                <input type="number" value={biz[key]} placeholder="0" onChange={e=>setBiz(p=>({...p,[key]:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box'}}/>
              </div>
            ))}

            {biz.entityType === 'S-Corporation' && (
              <div style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:'#DC2626',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em'}}>Officer Salary (Required)</label>
                <div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>IRS requires reasonable compensation for S-Corp officer-shareholders</div>
                <input type="number" value={biz.officerSalary} placeholder="0" onChange={e=>setBiz(p=>({...p,officerSalary:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #FCA5A5',borderRadius:8,fontSize:14,color:N,background:'#FEF2F2',boxSizing:'border-box'}}/>
              </div>
            )}

            <div style={{marginBottom:20}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>Your Ownership %</label>
              <input type="number" min="1" max="100" value={biz.ownershipPct} onChange={e=>setBiz(p=>({...p,ownershipPct:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box'}}/>
            </div>

            {/* Live K-1 preview */}
            <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:12,padding:16}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1E40AF',marginBottom:6}}>YOUR K-1 INCOME (SCHEDULE E)</div>
              <div style={{fontSize:28,fontWeight:800,color:'#1D4ED8'}}>{fmt(k1)}</div>
              <div style={{fontSize:12,color:'#3B82F6',marginTop:4,lineHeight:1.5}}>
                This is your share of business income that flows to your personal Form 1040 — it is <strong>not</strong> your tax liability. Your actual taxes depend on your full personal income picture below.
              </div>
            </div>
          </div>

          {/* RIGHT: Form 1040 */}
          <div style={{background:'#fff',borderRadius:14,padding:24,boxShadow:'0 1px 8px rgba(0,0,0,0.06)'}}>
            <h2 style={{fontSize:16,fontWeight:800,color:N,margin:'0 0 4px'}}>Form 1040 — Personal Tax Picture</h2>
            <p style={{color:SL,fontSize:12,margin:'0 0 20px'}}>Add your personal situation to see your actual tax liability</p>

            <div style={{marginBottom:14}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>Filing Status</label>
              <select value={f1040.filingStatus} onChange={e=>setF1040(p=>({...p,filingStatus:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff'}}>
                {Object.entries(FILING_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {[
              ['W-2 / Wages', 'w2Income', 'Salary or wages from employment (not officer salary above)'],
              ['Other Income', 'otherIncome', 'Interest, dividends, rental income, capital gains'],
              ['Estimated Tax Payments Made', 'estimatedPayments', 'Quarterly payments already submitted to IRS this year'],
            ].map(([label,key,hint]) => (
              <div key={key} style={{marginBottom:14}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
                <div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>{hint}</div>
                <input type="number" value={f1040[key]||''} placeholder="0" onChange={e=>setF1040(p=>({...p,[key]:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box'}}/>
              </div>
            ))}

            <div style={{marginBottom:14}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>Number of Dependents</label>
              <div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Qualifying children for Child Tax Credit ($2,000/child)</div>
              <input type="number" min="0" value={f1040.dependents||''} placeholder="0" onChange={e=>setF1040(p=>({...p,dependents:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box'}}/>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:SL,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Deduction Method</label>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setF1040(p=>({...p,useStandardDed:true}))} style={{flex:1,padding:'9px',background:f1040.useStandardDed?B:'#fff',color:f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
                  Standard ({fmt(STANDARD_DED[f1040.filingStatus])})
                </button>
                <button onClick={()=>setF1040(p=>({...p,useStandardDed:false}))} style={{flex:1,padding:'9px',background:!f1040.useStandardDed?B:'#fff',color:!f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(!f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
                  Itemized
                </button>
              </div>
              {!f1040.useStandardDed && (
                <input type="number" placeholder="Total itemized deductions" value={f1040.itemizedDed||''} onChange={e=>setF1040(p=>({...p,itemizedDed:e.target.value}))} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box',marginTop:8}}/>
              )}
            </div>

            {/* Live tax preview */}
            {liveTax && k1 !== 0 && (
              <div style={{background:'#1E3A5F',borderRadius:12,padding:16,color:'#fff'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#93C5FD',marginBottom:12,letterSpacing:'0.06em'}}>LIVE TAX ESTIMATE — FORM 1040</div>
                {[
                  ['K-1 Income (Schedule E)', fmt(liveTax.k1), '#60A5FA'],
                  ['+ W-2 / Other Income', fmt(liveTax.w2 + liveTax.other), '#60A5FA'],
                  ['- SE Tax Deduction', fmt(liveTax.seDeduction), '#FCA5A5'],
                  ['= Adjusted Gross Income', fmt(liveTax.agi), '#fff'],
                  ['- Deduction', fmt(liveTax.deduction), '#FCA5A5'],
                  ['- QBI Deduction (20%)', fmt(liveTax.qbi), '#FCA5A5'],
                  ['= Taxable Income', fmt(liveTax.taxableIncome), '#fff'],
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:'1px solid #ffffff15'}}>
                    <span style={{color:'#CBD5E1'}}>{l}</span>
                    <span style={{fontWeight:600,color:c}}>{v}</span>
                  </div>
                ))}
                <div style={{borderTop:'1px solid #ffffff30',marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:13,color:'#fff',fontWeight:700}}>Est. Tax Owed</span>
                  <span style={{fontSize:22,fontWeight:800,color:liveTax.refund>0?'#34D399':'#F87171'}}>{liveTax.refund > 0 ? fmt(liveTax.refund)+' refund' : fmt(liveTax.taxOwed)+' owed'}</span>
                </div>
                <div style={{fontSize:11,color:'#93C5FD',marginTop:4}}>Effective rate: {pct(liveTax.effectiveRate)} | Quarterly est. payment: {fmt(liveTax.quarterlyNeeded)}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{display:'flex',gap:12,marginTop:20}}>
          <button onClick={()=>setView('connect')} style={{padding:'12px 24px',background:'#F1F5F9',border:'none',borderRadius:10,fontWeight:600,fontSize:14,color:SL,cursor:'pointer'}}>Back</button>
          <button onClick={handleSave} disabled={!biz.grossRevenue} style={{flex:1,padding:'13px',background:biz.grossRevenue?B:'#CBD5E1',border:'none',borderRadius:10,fontWeight:700,fontSize:15,color:'#fff',cursor:biz.grossRevenue?'pointer':'not-allowed'}}>
            Save Record & Generate Full Analysis
          </button>
        </div>
      </div>
    </div>
  )

  // ─── VIEW: ANALYSIS ───────────────────────────────────────────────────────
  const r = selectedRecord
  const t = r ? calcFullTax(r.f1040 || {}, r.k1Income, r.entityType) : null
  const recOfficerSal = r ? Math.round(Math.max(0, r.k1Income) * 0.35) : 0

  // Smart recommendations
  const recs = []
  if (r && t) {
    const officerSal = parseFloat(r.officerSalary) || 0
    const isSCorp = r.entityType === 'S-Corporation'

    if (isSCorp && officerSal === 0 && r.k1Income > 20000)
      recs.push({type:'danger', title:'Missing Officer Compensation', msg:'S-Corp owners must pay themselves a reasonable salary before taking distributions. The IRS considers this a primary audit trigger. Based on your net income, we recommend at least '+fmt(recOfficerSal)+'/yr. Without this, you risk reclassification of distributions as wages plus penalties.'})

    if (isSCorp && officerSal > 0 && officerSal < recOfficerSal && r.k1Income > 20000)
      recs.push({type:'warning', title:'Officer Compensation May Be Too Low', msg:'Your officer salary of '+fmt(officerSal)+' represents '+Math.round(officerSal/r.k1Income*100)+'% of your net income. The IRS benchmark is approximately 35-40% for most industries. Consider increasing to '+fmt(recOfficerSal)+' to reduce audit exposure.'})

    if (t.quarterlyNeeded > 500)
      recs.push({type:'warning', title:'Quarterly Estimated Payments Required', msg:'You have an estimated tax liability of '+fmt(t.totalTaxAfterCredits)+' remaining. To avoid underpayment penalties, make quarterly payments of approximately '+fmt(t.quarterlyNeeded)+'. Due dates: Apr 15, Jun 15, Sep 15, Jan 15.'})

    if (t.qbi > 0)
      recs.push({type:'success', title:'QBI Deduction Applied (20%)', msg:'As a passthrough entity, you qualify for the Section 199A QBI deduction of '+fmt(t.qbi)+'. This reduces your taxable income and is one of the most valuable deductions available to S-Corp and LLC owners.'})

    if ((parseFloat(r.depreciation)||0) === 0 && r.grossRevenue > 50000)
      recs.push({type:'info', title:'No Depreciation Recorded', msg:'You may be missing deductions. If you use equipment, vehicles, or a home office for business, you can deduct depreciation under Section 179 or bonus depreciation. Consider speaking with your CPA about assets you own.'})

    if (r.k1Income > 200000 && r.entityType !== 'S-Corporation')
      recs.push({type:'info', title:'S-Corp Election May Save Taxes', msg:'At your income level, electing S-Corp status could reduce self-employment taxes significantly. An S-Corp allows you to split income between salary and distributions — only the salary portion is subject to SE tax (15.3%).'})

    if (t.effectiveRate > 30)
      recs.push({type:'warning', title:'High Effective Tax Rate ('+pct(t.effectiveRate)+')', msg:'Your effective rate suggests you may benefit from additional tax planning strategies: maximizing retirement contributions (SEP-IRA up to $66,000, Solo 401k up to $69,000), health insurance deductions, or HSA contributions.'})

    if (recs.length === 0)
      recs.push({type:'success', title:'Tax Structure Looks Healthy', msg:'No significant issues detected. Continue monitoring quarterly and update your numbers as your financials change throughout the year.'})
  }

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <NavBar active="Calculate Tax"/>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 20px'}}>

        {/* Top bar */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,color:N,margin:0}}>Tax Intelligence Analysis</h1>
            <p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Real-time K-1 → Form 1040 tax liability</p>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>{setWhatifMode(!whatifMode); if(!whatifMode) setWhatifSaved({biz:{...biz},f1040:{...f1040}})}} style={{padding:'9px 18px',background:whatifMode?'#7C3AED':'#fff',color:whatifMode?'#fff':N,border:'1px solid '+(whatifMode?'#7C3AED':'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
              {whatifMode ? '⚡ What-If Mode ON' : '⚡ What-If Simulator'}
            </button>
            <button onClick={()=>{setBiz({year:new Date().getFullYear(),entityType:'S-Corporation',grossRevenue:'',businessExpenses:'',officerSalary:'',depreciation:'',otherDeductions:'',ownershipPct:100}); setView('entry')}} style={{padding:'9px 18px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>
              + New Calculation
            </button>
          </div>
        </div>

        {whatifMode && (
          <div style={{background:'#F5F3FF',border:'2px solid #C4B5FD',borderRadius:12,padding:'12px 18px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{color:'#6D28D9',fontWeight:700,fontSize:14}}>⚡ What-If Mode — Changes are NOT saved. Test different scenarios freely.</span>
            <button onClick={()=>{setWhatifMode(false); if(whatifSaved){setBiz(whatifSaved.biz); setF1040(whatifSaved.f1040)}}} style={{padding:'6px 14px',background:'#7C3AED',color:'#fff',border:'none',borderRadius:7,fontWeight:600,fontSize:12,cursor:'pointer'}}>Exit & Restore</button>
          </div>
        )}

        {/* Record selector */}
        {records.length > 1 && (
          <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
            {records.map(rec => (
              <button key={rec.id} onClick={()=>setSelectedRecord(rec)} style={{padding:'6px 14px',background:selectedRecord?.id===rec.id?N:'#fff',color:selectedRecord?.id===rec.id?'#fff':SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>
                {rec.year} — {rec.entityType}
              </button>
            ))}
          </div>
        )}

        {r && t && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>

            {/* LEFT: Business + K-1 */}
            <div>
              <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)',marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <div>
                    <div style={{fontWeight:800,color:N,fontSize:16}}>{r.year} — {r.entityType}</div>
                    <div style={{fontSize:11,color:SL,marginTop:2}}>Saved {r.savedAt}</div>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    {r.connectedApp && <span style={{fontSize:11,background:'#F0FDF4',color:'#166534',fontWeight:700,padding:'3px 10px',borderRadius:20,border:'1px solid #86EFAC'}}>{r.connectedApp}</span>}
                    <button onClick={()=>handleDelete(r.id)} style={{padding:'5px 12px',background:'#FEF2F2',color:'#DC2626',border:'none',borderRadius:7,fontWeight:600,fontSize:12,cursor:'pointer'}}>Delete</button>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                  {[
                    ['Gross Revenue', r.grossRevenue],
                    ['Business Expenses', r.businessExpenses],
                    ['Officer Salary', r.officerSalary],
                    ['Depreciation', r.depreciation],
                  ].map(([label,val]) => (
                    <div key={label} style={{background:'#F8FAFC',borderRadius:8,padding:'10px 12px'}}>
                      <div style={{fontSize:10,color:SL,fontWeight:600,marginBottom:3}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:16,color:N}}>{fmt(val)}</div>
                    </div>
                  ))}
                </div>

                {/* K-1 Bridge */}
                <div style={{background:'linear-gradient(135deg,#1E3A5F,#2563EB)',borderRadius:12,padding:18,color:'#fff'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#93C5FD',marginBottom:8,letterSpacing:'0.08em'}}>K-1 INCOME — FLOWS TO FORM 1040</div>
                  <div style={{fontSize:34,fontWeight:800,marginBottom:4}}>{fmt(r.k1Income)}</div>
                  <div style={{fontSize:12,color:'#BFDBFE',lineHeight:1.5}}>
                    This is your {r.ownershipPct}% ownership share of business income. It is reported on Schedule E and flows to your Form 1040 Line 5. Your actual tax liability depends on your complete personal picture →
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
                <div style={{fontSize:12,fontWeight:700,color:N,marginBottom:14,letterSpacing:'0.06em'}}>RECOMMENDATIONS & ALERTS</div>
                {recs.map((rec,i) => (
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:13,color:N,marginBottom:4}}>{rec.title}</div>
                    <InfoBox type={rec.type}>{rec.msg}</InfoBox>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: Form 1040 */}
            <div>
              <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)',marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:N,marginBottom:16,letterSpacing:'0.06em'}}>FORM 1040 — ACTUAL TAX LIABILITY</div>
                <div style={{fontSize:11,color:SL,marginBottom:16}}>Filing as: <strong>{FILING_LABELS[r.f1040?.filingStatus || 'single']}</strong></div>

                {/* Income waterfall */}
                {[
                  {label:'K-1 Income (Sch. E, Line 17)', val:t.k1, color:'#1D4ED8', border:'#BFDBFE', bg:'#EFF6FF'},
                  {label:'+ W-2 & Other Income', val:t.w2 + t.other, color:N, border:'#E2E8F0', bg:'#F8FAFC'},
                  {label:'- SE Tax Deduction (Line 15)', val:-t.seDeduction, color:'#DC2626', border:'#FECACA', bg:'#FEF2F2'},
                ].map(({label,val,color,border,bg}) => (
                  <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:bg,border:'1px solid '+border,borderRadius:8,marginBottom:6,fontSize:13}}>
                    <span style={{color:SL}}>{label}</span>
                    <span style={{fontWeight:700,color}}>{val < 0 ? '-'+fmt(-val) : fmt(val)}</span>
                  </div>
                ))}

                <div style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'#F1F5F9',border:'1px solid #CBD5E1',borderRadius:8,marginBottom:16,fontSize:13}}>
                  <span style={{fontWeight:700,color:N}}>Adjusted Gross Income (AGI)</span>
                  <span style={{fontWeight:800,fontSize:15,color:N}}>{fmt(t.agi)}</span>
                </div>

                {[
                  {label: (t.qbi > 0 ? '- Standard / Itemized Deduction' : '- Deduction'), val: -t.deduction, color:'#DC2626'},
                  ...(t.qbi > 0 ? [{label:'- QBI Deduction (Sec. 199A, 20%)', val:-t.qbi, color:'#059669'}] : []),
                ].map(({label,val,color}) => (
                  <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'8px 14px',fontSize:13,borderBottom:'1px solid #F1F5F9'}}>
                    <span style={{color:SL}}>{label}</span>
                    <span style={{fontWeight:700,color}}>{val < 0 ? '-'+fmt(-val) : fmt(val)}</span>
                  </div>
                ))}

                <div style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'#F1F5F9',border:'1px solid #CBD5E1',borderRadius:8,margin:'12px 0',fontSize:13}}>
                  <span style={{fontWeight:700,color:N}}>Taxable Income</span>
                  <span style={{fontWeight:800,fontSize:15,color:N}}>{fmt(t.taxableIncome)}</span>
                </div>

                {[
                  {label:'Income Tax (from brackets)', val:t.incomeTax},
                  {label:'+ Self-Employment Tax (15.3%)', val:t.seTax},
                  ...(t.totalCtc > 0 ? [{label:'- Child Tax Credit', val:-t.totalCtc}] : []),
                  ...(t.estPay > 0 ? [{label:'- Estimated Payments Made', val:-t.estPay}] : []),
                ].map(({label,val}) => (
                  <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'8px 14px',fontSize:13,borderBottom:'1px solid #F1F5F9'}}>
                    <span style={{color:SL}}>{label}</span>
                    <span style={{fontWeight:700,color: val < 0 ? '#059669' : N}}>{val < 0 ? '-'+fmt(-val) : fmt(val)}</span>
                  </div>
                ))}

                {/* Final liability */}
                <div style={{background: t.refund > 0 ? '#F0FDF4' : '#FEF2F2', border:'2px solid '+(t.refund>0?'#86EFAC':'#FCA5A5'), borderRadius:12, padding:18, marginTop:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:t.refund>0?'#166534':'#991B1B',marginBottom:8,letterSpacing:'0.06em'}}>
                    {t.refund > 0 ? 'ESTIMATED REFUND' : 'ESTIMATED TAX DUE'}
                  </div>
                  <div style={{fontSize:36,fontWeight:800,color:t.refund>0?'#15803D':'#DC2626'}}>
                    {t.refund > 0 ? fmt(t.refund) : fmt(t.taxOwed)}
                  </div>
                  <div style={{fontSize:12,color:t.refund>0?'#166534':'#991B1B',marginTop:6}}>
                    Effective rate: {pct(t.effectiveRate)} | Quarterly payment needed: {fmt(t.quarterlyNeeded)}
                  </div>
                </div>
              </div>

              {/* Quarterly planner */}
              {t.quarterlyNeeded > 0 && (
                <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
                  <div style={{fontSize:12,fontWeight:700,color:N,marginBottom:14,letterSpacing:'0.06em'}}>QUARTERLY ESTIMATED TAX PLANNER</div>
                  {[
                    ['Q1', 'April 15'],
                    ['Q2', 'June 15'],
                    ['Q3', 'September 15'],
                    ['Q4', 'January 15'],
                  ].map(([q, due]) => (
                    <div key={q} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #F1F5F9'}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:N}}>{q} Payment</div>
                        <div style={{fontSize:11,color:SL}}>Due: {due}</div>
                      </div>
                      <div style={{fontWeight:800,fontSize:16,color:B}}>{fmt(t.quarterlyNeeded)}</div>
                    </div>
                  ))}
                  <div style={{marginTop:12,fontSize:12,color:SL,lineHeight:1.5}}>
                    Pay online at IRS.gov/payments using Direct Pay or EFTPS. Underpayment penalty applies if less than 90% of current year tax or 100% of prior year tax is paid.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
