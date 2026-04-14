import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API    = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
const LAMBDA = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth'
const N  = '#0D1B3E'
const B  = '#2563EB'
const SL = '#475569'

const ENTITY_TYPES = ['S-Corporation','Multi-Member LLC','Single-Member LLC','Partnership','Sole Proprietor','C-Corporation']
const FILING_LABELS = {
  single: 'Single',
  mfj:    'Married Filing Jointly',
  mfs:    'Married Filing Separately',
  hoh:    'Head of Household',
  qss:    'Qualifying Surviving Spouse',
}
const BRACKETS = {
  single: [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
  mfj:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
  mfs:    [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[365600,0.35],[Infinity,0.37]],
  hoh:    [[16550,0.10],[63100,0.12],[100500,0.22],[191950,0.24],[243700,0.32],[609350,0.35],[Infinity,0.37]],
  qss:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
}
const STD_DED = { single:14600, mfj:29200, mfs:14600, hoh:21900, qss:29200 }

const INTEGRATIONS = [
  { id:'quickbooks', name:'QuickBooks', color:'#2CA01C', bg:'#F0FBF0', abbr:'QB' },
  { id:'xero',       name:'Xero',       color:'#13B5EA', bg:'#EFF9FF', abbr:'XE' },
  { id:'wave',       name:'Wave',       color:'#2C6ECB', bg:'#EFF4FF', abbr:'WV' },
  { id:'freshbooks', name:'FreshBooks', color:'#1a9c3e', bg:'#F0FBF4', abbr:'FB' },
]

const isPassthrough = (e) => ['S-Corporation','Multi-Member LLC','Single-Member LLC','Partnership','Sole Proprietor'].includes(e)
const isSCorp       = (e) => e === 'S-Corporation'
const fmt           = (n) => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US',{maximumFractionDigits:0})

function calcTax(biz, f1040) {
  const rev  = parseFloat(biz.grossRevenue)||0
  const exp  = parseFloat(biz.businessExpenses)||0
  const sal  = parseFloat(biz.officerSalary)||0
  const dep  = parseFloat(biz.depreciation)||0
  const oth  = parseFloat(biz.otherDeductions)||0
  const own  = (parseFloat(biz.ownershipPct)||100) / 100
  const netBiz = rev - exp - sal - dep - oth
  const k1     = Math.round(netBiz * own)
  const fs         = f1040.filingStatus || 'single'
  const w2Income   = parseFloat(f1040.w2Income)||0
  const otherInc   = parseFloat(f1040.otherIncome)||0
  const deps       = parseFloat(f1040.dependents)||0
  const estPay     = parseFloat(f1040.estimatedPayments)||0
  const itemized   = parseFloat(f1040.itemizedDed)||0
  const seTaxBase   = isPassthrough(biz.entityType) && !isSCorp(biz.entityType) ? k1 : 0
  const seTax       = Math.round(seTaxBase * 0.9235 * 0.153)
  const seDeduction = Math.round(seTax / 2)
  const qbiDed      = isPassthrough(biz.entityType) ? Math.round(Math.max(k1,0) * 0.20) : 0
  const stdDed      = STD_DED[fs] || 14600
  const childCredit = Math.min(deps, 3) * 2000
  const agi    = w2Income + k1 + otherInc - seDeduction
  const dedAmt = Math.max(itemized, stdDed)
  const taxableIncome = Math.max(0, agi - dedAmt - qbiDed)
  const brackets = BRACKETS[fs] || BRACKETS.single
  let tax = 0, prev = 0
  for (const [thresh, rate] of brackets) {
    if (taxableIncome <= thresh) { tax += (taxableIncome - prev) * rate; break }
    tax += (thresh - prev) * rate
    prev = thresh
  }
  tax = Math.round(tax)
  const creditedTax = Math.max(0, tax - childCredit)
  const totalTax    = creditedTax + seTax
  const refundOrDue = estPay - totalTax
  const effRate     = agi > 0 ? ((totalTax / agi) * 100).toFixed(1) : '0.0'
  const quarterly   = Math.max(0, Math.ceil(totalTax / 4))
  return { k1, seTax, seDeduction, qbiDed, agi, taxableIncome, tax, childCredit, creditedTax, totalTax, refundOrDue, effRate, quarterly }
}

const styles = {
  page:      { fontFamily:'Inter,system-ui,sans-serif', minHeight:'100vh', background:'#F8FAFC', color:N },
  nav:       { background:'#fff', borderBottom:'1px solid #E2E8F0', padding:'0 32px', display:'flex', alignItems:'center', justifyContent:'space-between', height:64, position:'sticky', top:0, zIndex:100 },
  logo:      { display:'flex', alignItems:'center', gap:10, textDecoration:'none' },
  logoBox:   { width:36, height:36, background:N, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' },
  logoTxt:   { fontSize:18, fontWeight:700, color:N, letterSpacing:'-0.5px' },
  navLinks:  { display:'flex', gap:4 },
  navLink:   { padding:'6px 16px', borderRadius:6, fontSize:14, fontWeight:500, color:SL, textDecoration:'none', cursor:'pointer', background:'none', border:'none' },
  navActive: { background:B, color:'#fff' },
  signOut:   { padding:'6px 16px', borderRadius:6, fontSize:14, fontWeight:500, color:SL, background:'none', border:'1px solid #CBD5E1', cursor:'pointer' },
  main:      { maxWidth:900, margin:'0 auto', padding:'40px 24px' },
  h1:        { fontSize:28, fontWeight:700, color:N, textAlign:'center', marginBottom:8 },
  subtitle:  { textAlign:'center', color:SL, fontSize:15, marginBottom:36 },
  syncBox:   { background:'#fff', border:'1px solid #E2E8F0', borderRadius:16, padding:'32px 28px', marginBottom:24 },
  syncTitle: { fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:SL, textAlign:'center', marginBottom:20 },
  grid2:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'stretch' },
  intCard:   { display:'flex', alignItems:'center', gap:14, padding:'16px 20px', borderRadius:10, border:'2px solid transparent', transition:'all 0.15s', background:'#F8FAFC', width:'100%', textAlign:'left' },
  intAbbr:   { width:40, height:40, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 },
  intName:   { fontSize:15, fontWeight:600, color:N },
  connBadge: { display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, color:'#16a34a', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:20, padding:'2px 10px' },
  orDivider: { textAlign:'center', color:'#94A3B8', fontSize:14, margin:'20px 0' },
  manualBtn: { width:'100%', padding:'16px', background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, fontSize:15, fontWeight:600, color:N, cursor:'pointer', transition:'border-color 0.15s' },
  formBox:   { background:'#fff', border:'1px solid #E2E8F0', borderRadius:16, padding:'32px 28px', marginBottom:24 },
  formTitle: { fontSize:16, fontWeight:700, color:N, marginBottom:4 },
  formSub:   { fontSize:13, color:SL, marginBottom:24 },
  fieldGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 },
  fieldFull: { marginBottom:16 },
  label:     { display:'block', fontSize:13, fontWeight:500, color:SL, marginBottom:6 },
  input:     { width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid #CBD5E1', fontSize:14, color:N, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  select:    { width:'100%', padding:'10px 14px', borderRadius:8, border:'1px solid #CBD5E1', fontSize:14, color:N, outline:'none', boxSizing:'border-box', background:'#fff', fontFamily:'inherit', cursor:'pointer' },
  calcBtn:   { width:'100%', padding:'14px', background:B, color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:600, cursor:'pointer', marginTop:8 },
  resultsBox:  { background:'#fff', border:'1px solid #E2E8F0', borderRadius:16, padding:'32px 28px', marginBottom:24 },
  resultTitle: { fontSize:18, fontWeight:700, color:N, marginBottom:24 },
  bigLabel:    { fontSize:13, color:SL, marginTop:4 },
  dueAmt:      { fontSize:36, fontWeight:800, color:'#dc2626' },
  refundAmt:   { fontSize:36, fontWeight:800, color:'#16a34a' },
  rowGrid:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 },
  statCard:    { background:'#F8FAFC', borderRadius:10, padding:'16px 20px' },
  statLabel:   { fontSize:12, color:SL, fontWeight:500, marginBottom:4 },
  statVal:     { fontSize:20, fontWeight:700, color:N },
  divider:     { borderTop:'1px solid #E2E8F0', margin:'20px 0' },
  lineRow:     { display:'flex', justifyContent:'space-between', fontSize:14, color:SL, padding:'5px 0' },
  lineVal:     { fontWeight:600, color:N },
  alertGreen:  { background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'16px 20px', marginTop:16 },
  alertRed:    { background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'16px 20px', marginTop:16 },
  alertTitle:  { fontSize:14, fontWeight:700, marginBottom:4 },
  alertBody:   { fontSize:13, color:SL },
  connectBtn:  { padding:'6px 14px', background:B, color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' },
  refreshBtn:  { fontSize:11, color:B, background:'none', border:'1px solid #bfdbfe', borderRadius:10, padding:'2px 8px', cursor:'pointer', marginLeft:4 },
  disconnBtn:  { fontSize:11, color:'#dc2626', background:'none', border:'1px solid #fecaca', borderRadius:10, padding:'2px 8px', cursor:'pointer', marginLeft:4 },
}

export default function CalculateTax() {
  const navigate = useNavigate()
  const [connected, setConnected] = useState({})
  const [showManual, setShowManual] = useState(false)
  const [syncing, setSyncing]     = useState(null)
  const [results, setResults]     = useState(null)
  const [activeNav, setActiveNav] = useState('calculator')
  const [biz, setBiz] = useState({
    entityType:'S-Corporation', grossRevenue:'', businessExpenses:'',
    officerSalary:'', depreciation:'', otherDeductions:'', ownershipPct:'100',
  })
  const [f1040, setF1040] = useState({
    filingStatus:'single', w2Income:'', otherIncome:'',
    dependents:'0', estimatedPayments:'', itemizedDed:'',
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const conn = {}
    INTEGRATIONS.forEach(({ id }) => {
      if (localStorage.getItem('ts360_' + id + '_connected') === 'true') conn[id] = true
    })
    // Check if returning from OAuth with a data token
    const providerMap = { qb_token:'quickbooks', xero_token:'xero', wave_token:'wave', fb_token:'freshbooks' }
    let token = null, provider = null
    for (const [key, pid] of Object.entries(providerMap)) {
      const val = params.get(key)
      if (val) { token = val; provider = pid; break }
    }
    if (token && provider) {
      conn[provider] = true
      localStorage.setItem('ts360_' + provider + '_connected', 'true')
      window.history.replaceState({}, '', '/calculate-tax')
      fetchPnL(provider, token)
    }
    setConnected(conn)
  }, [])

  async function fetchPnL(provider, token) {
    setSyncing(provider)
    try {
      const res = await fetch(LAMBDA + '/' + provider + '/data?token=' + token)
      const data = await res.json()
      if (data && !data.error) {
        setBiz(prev => ({
          ...prev,
          grossRevenue:     String(data.grossRevenue     || data.totalIncome    || ''),
          businessExpenses: String(data.totalExpenses    || data.generalBusinessExpenses || ''),
          officerSalary:    String(data.officerSalary    || ''),
          depreciation:     String(data.depreciation     || ''),
          otherDeductions:  String(data.otherExpenses    || ''),
        }))
        setShowManual(true)
      }
    } catch(e) { console.error('fetchPnL', e) }
    setSyncing(null)
  }

  function handleConnect(id) {
    localStorage.setItem('ts360_connecting', id)
    window.location.href = API + '/integrations/' + id + '/connect'
  }

  function handleDisconnect(id) {
    localStorage.removeItem('ts360_' + id + '_connected')
    setConnected(prev => { const n = {...prev}; delete n[id]; return n })
  }

  function handleCalc() {
    const r = calcTax(biz, f1040)
    setResults(r)
    setTimeout(() => document.getElementById('ts360-results')?.scrollIntoView({ behavior:'smooth' }), 50)
  }

  function handleSignOut() {
    INTEGRATIONS.forEach(({ id }) => localStorage.removeItem('ts360_' + id + '_connected'))
    localStorage.removeItem('token')
    navigate('/login')
  }

  const NavBar = () => (
    <nav style={styles.nav}>
      <a href="/" style={styles.logo}>
        <div style={styles.logoBox}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="10" width="3" height="8" rx="1" fill="#fff"/>
            <rect x="8" y="6"  width="3" height="12" rx="1" fill="#fff"/>
            <rect x="14" y="2" width="3" height="16" rx="1" fill="#fff"/>
          </svg>
        </div>
        <span style={styles.logoTxt}>TaxStat<span style={{color:B}}>360</span></span>
      </a>
      <div style={styles.navLinks}>
        <button style={{...styles.navLink, ...(activeNav==='home'?styles.navActive:{})}} onClick={()=>navigate('/')}>Home</button>
        <button style={{...styles.navLink, ...(activeNav==='calculator'?styles.navActive:{})}} onClick={()=>setActiveNav('calculator')}>Tax Calculator</button>
        <button style={{...styles.navLink}} onClick={()=>navigate('/ai-analysis')}>AI Analysis</button>
      </div>
      <button style={styles.signOut} onClick={handleSignOut}>Sign Out</button>
    </nav>
  )

  const IntegrationSection = () => (
    <div style={styles.syncBox}>
      <div style={styles.syncTitle}>SYNC FROM YOUR ACCOUNTING SOFTWARE</div>
      <div style={styles.grid2}>
        {INTEGRATIONS.map(int => {
          const isConn    = !!connected[int.id]
          const isSyncing = syncing === int.id
          return (
            <div
              key={int.id}
              style={{
                ...styles.intCard,
                background: isConn ? int.bg : '#F8FAFC',
                border: isConn ? '2px solid ' + int.color + '40' : '2px solid #E2E8F0',
                opacity: isSyncing ? 0.7 : 1,
              }}
            >
              <div style={{ ...styles.intAbbr, background: int.color }}>
                {isSyncing ? '...' : int.abbr}
              </div>
              <div style={{ flex:1 }}>
                <div style={styles.intName}>{int.name}</div>
                {isConn
                  ? <span style={styles.connBadge}>Connected</span>
                  : <span style={{ fontSize:12, color:SL }}>{isSyncing ? 'Connecting...' : 'Click to connect'}</span>
                }
              </div>
              {isConn ? (
                <div style={{ display:'flex', gap:4 }}>
                  <button style={styles.refreshBtn} onClick={() => handleConnect(int.id)}>Refresh</button>
                  <button style={styles.disconnBtn} onClick={() => handleDisconnect(int.id)}>Disconnect</button>
                </div>
              ) : (
                <button
                  style={styles.connectBtn}
                  onClick={() => handleConnect(int.id)}
                  disabled={isSyncing}
                >
                  Connect
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ textAlign:'center', fontSize:12, color:'#94A3B8', marginTop:16, marginBottom:0 }}>
        Secure OAuth connection -- your credentials are never stored
      </p>
    </div>
  )

  const ManualForm = () => (
    <>
      <div style={styles.formBox}>
        <div style={styles.formTitle}>Business Financials</div>
        <div style={styles.formSub}>Enter your business income and deductions for the tax year</div>
        <div style={styles.fieldFull}>
          <label style={styles.label}>Entity Type</label>
          <select style={styles.select} value={biz.entityType} onChange={e=>setBiz({...biz,entityType:e.target.value})}>
            {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={styles.fieldGrid}>
          <div>
            <label style={styles.label}>Gross Revenue</label>
            <input style={styles.input} type="number" placeholder="0" value={biz.grossRevenue} onChange={e=>setBiz({...biz,grossRevenue:e.target.value})}/>
          </div>
          <div>
            <label style={styles.label}>Business Expenses</label>
            <input style={styles.input} type="number" placeholder="0" value={biz.businessExpenses} onChange={e=>setBiz({...biz,businessExpenses:e.target.value})}/>
          </div>
        </div>
        <div style={styles.fieldGrid}>
          <div>
            <label style={styles.label}>Officer / Owner Salary {isSCorp(biz.entityType) && '(W-2)'}</label>
            <input style={styles.input} type="number" placeholder="0" value={biz.officerSalary} onChange={e=>setBiz({...biz,officerSalary:e.target.value})}/>
          </div>
          <div>
            <label style={styles.label}>Depreciation (Sec 179 / MACRS)</label>
            <input style={styles.input} type="number" placeholder="0" value={biz.depreciation} onChange={e=>setBiz({...biz,depreciation:e.target.value})}/>
          </div>
        </div>
        <div style={styles.fieldGrid}>
          <div>
            <label style={styles.label}>Other Deductions</label>
            <input style={styles.input} type="number" placeholder="0" value={biz.otherDeductions} onChange={e=>setBiz({...biz,otherDeductions:e.target.value})}/>
          </div>
          <div>
            <label style={styles.label}>Your Ownership %</label>
            <input style={styles.input} type="number" placeholder="100" min="1" max="100" value={biz.ownershipPct} onChange={e=>setBiz({...biz,ownershipPct:e.target.value})}/>
          </div>
        </div>
      </div>
      <div style={styles.formBox}>
        <div style={styles.formTitle}>Personal Tax Info (Form 1040)</div>
        <div style={styles.formSub}>We use this to calculate your exact personal tax bill, including your K-1 share</div>
        <div style={styles.fieldGrid}>
          <div>
            <label style={styles.label}>Filing Status</label>
            <select style={styles.select} value={f1040.filingStatus} onChange={e=>setF1040({...f1040,filingStatus:e.target.value})}>
              {Object.entries(FILING_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>W-2 / Other Wages</label>
            <input style={styles.input} type="number" placeholder="0" value={f1040.w2Income} onChange={e=>setF1040({...f1040,w2Income:e.target.value})}/>
          </div>
        </div>
        <div style={styles.fieldGrid}>
          <div>
            <label style={styles.label}>Other Income (interest, dividends...)</label>
            <input style={styles.input} type="number" placeholder="0" value={f1040.otherIncome} onChange={e=>setF1040({...f1040,otherIncome:e.target.value})}/>
          </div>
          <div>
            <label style={styles.label}>Qualifying Dependents</label>
            <input style={styles.input} type="number" placeholder="0" min="0" value={f1040.dependents} onChange={e=>setF1040({...f1040,dependents:e.target.value})}/>
          </div>
        </div>
        <div style={styles.fieldGrid}>
          <div>
            <label style={styles.label}>Estimated Payments Made (YTD)</label>
            <input style={styles.input} type="number" placeholder="0" value={f1040.estimatedPayments} onChange={e=>setF1040({...f1040,estimatedPayments:e.target.value})}/>
          </div>
          <div>
            <label style={styles.label}>Itemized Deductions (if greater than standard)</label>
            <input style={styles.input} type="number" placeholder="0" value={f1040.itemizedDed} onChange={e=>setF1040({...f1040,itemizedDed:e.target.value})}/>
          </div>
        </div>
        <button style={styles.calcBtn} onClick={handleCalc}>Calculate My Tax Bill</button>
      </div>
    </>
  )

  const ResultsPanel = ({ r }) => {
    const due = r.refundOrDue < 0
    return (
      <div id="ts360-results" style={styles.resultsBox}>
        <div style={styles.resultTitle}>Your 2024 Tax Summary</div>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={due ? styles.dueAmt : styles.refundAmt}>{fmt(Math.abs(r.refundOrDue))}</div>
          <div style={styles.bigLabel}>{due ? 'Estimated Tax Due' : 'Estimated Refund / Overpayment'}</div>
        </div>
        <div style={styles.rowGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>K-1 Share of Business Profit</div>
            <div style={styles.statVal}>{fmt(r.k1)}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Adjusted Gross Income</div>
            <div style={styles.statVal}>{fmt(r.agi)}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Federal Income Tax</div>
            <div style={styles.statVal}>{fmt(r.creditedTax)}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Self-Employment Tax</div>
            <div style={styles.statVal}>{fmt(r.seTax)}</div>
          </div>
        </div>
        <div style={styles.divider}/>
        <div style={{ marginBottom:16 }}>
          {[
            ['Taxable Income',              fmt(r.taxableIncome)],
            ['QBI Deduction (20%)',         fmt(r.qbiDed)],
            ['SE Deduction (1/2 SE Tax)',   fmt(r.seDeduction)],
            ['Child / Dependent Credit',    fmt(r.childCredit)],
            ['Total Tax Liability',         fmt(r.totalTax)],
            ['Effective Tax Rate',          r.effRate + '%'],
          ].map(([label, val]) => (
            <div key={label} style={styles.lineRow}>
              <span>{label}</span>
              <span style={styles.lineVal}>{val}</span>
            </div>
          ))}
        </div>
        <div style={styles.divider}/>
        <div style={due ? styles.alertRed : styles.alertGreen}>
          <div style={{ ...styles.alertTitle, color: due ? '#dc2626' : '#16a34a' }}>
            Quarterly Estimated Payment: {fmt(r.quarterly)} / quarter
          </div>
          <div style={styles.alertBody}>
            Pay by April 15 - June 15 - September 15 - January 15 to avoid underpayment penalties.
          </div>
        </div>
        {r.qbiDed > 0 && (
          <div style={{ ...styles.alertGreen, marginTop:12 }}>
            <div style={{ ...styles.alertTitle, color:'#16a34a' }}>
              QBI Deduction Saves You {fmt(r.qbiDed * 0.24)} in taxes
            </div>
            <div style={styles.alertBody}>
              Your pass-through entity qualifies for the 20% Section 199A deduction -- one of the most valuable small business tax breaks available.
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <NavBar />
      <div style={styles.main}>
        <h1 style={styles.h1}>Know Your Actual Tax Bill</h1>
        <p style={styles.subtitle}>
          Enter your business numbers, we calculate your share of profit (your K-1), then show you exactly what you owe on your personal tax return -- in real time.
        </p>
        <IntegrationSection />
        {!showManual && (
          <>
            <div style={styles.orDivider}>-- or --</div>
            <button style={styles.manualBtn} onClick={() => setShowManual(true)}>
              Enter My Numbers Manually
            </button>
          </>
        )}
        {showManual && <ManualForm />}
        {results && <ResultsPanel r={results} />}
      </div>
    </div>
  )
}

