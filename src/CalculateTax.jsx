import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'https://app.taxstat360.com'
const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'
const G = '#16A34A'

const LOGO = () => (
  <div style={{display:'flex',alignItems:'center',gap:10}}>
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="8" fill={N}/>
      <rect x="8" y="18" width="4" height="8" rx="1" fill={B}/>
      <rect x="15" y="13" width="4" height="13" rx="1" fill={B}/>
      <rect x="22" y="8" width="4" height="18" rx="1" fill="#60A5FA"/>
    </svg>
    <span style={{fontWeight:800,fontSize:18,color:N}}>TaxStat<span style={{color:B}}>360</span></span>
  </div>
)

const INTEGRATIONS = [
  {id:'quickbooks', name:'QuickBooks', color:'#2CA01C', bg:'#F0FBF0', abbr:'QB'},
  {id:'xero',       name:'Xero',       color:'#13B5EA', bg:'#EFF9FF', abbr:'XE'},
  {id:'wave',       name:'Wave',       color:'#2C6ECB', bg:'#EFF4FF', abbr:'WV'},
  {id:'freshbooks', name:'FreshBooks', color:'#1a9c3e', bg:'#F0FBF4', abbr:'FB'},
]

const fmt = n => '$' + (parseFloat(n)||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})

function calcTIA(r) {
  const net = parseFloat(r.k1Income) || 0
  const isSCorp = r.entityType === 'S-Corporation'
  const officerSal = parseFloat(r.officerSalary) || 0
  const se = Math.round(Math.max(0, net) * 0.9235 * 0.153)
  const rec = Math.round(Math.max(0, net) * 0.35)
  const est = Math.round(Math.max(0, net) * 0.22 + se)
  const noOfficerComp = isSCorp && officerSal === 0 && net > 20000
  const lowOfficerComp = isSCorp && officerSal > 0 && officerSal < rec && net > 20000
  const recommendations = []
  if (noOfficerComp) recommendations.push({type:'danger', msg:'No officer compensation recorded. S-Corp owners must pay themselves a reasonable salary. This is a major IRS audit trigger — consider setting officer pay to at least ' + fmt(rec) + '/yr.'})
  if (lowOfficerComp) recommendations.push({type:'warning', msg:'Your officer compensation of ' + fmt(officerSal) + ' is below the IRS-recommended minimum of ' + fmt(rec) + ' for your net income level. Consider adjusting to reduce audit risk.'})
  if (net > 80000 && !isSCorp) recommendations.push({type:'info', msg:'At your income level, electing S-Corp status could save you approximately ' + fmt(Math.round(net * 0.9235 * 0.153 * 0.5)) + '/yr in self-employment taxes.'})
  if (net > 0 && est / net > 0.35) recommendations.push({type:'warning', msg:'Your estimated tax burden is ' + Math.round(est/net*100) + '% of net income. Consider maximizing retirement contributions (SEP-IRA, Solo 401k) to reduce taxable income.'})
  if (net > 0 && (parseFloat(r.depreciation)||0) === 0) recommendations.push({type:'info', msg:'You have no depreciation recorded. If you use equipment, a home office, or a vehicle for business, you may be leaving deductions on the table.'})
  return {net, se, rec, est, noOfficerComp, lowOfficerComp, recommendations}
}

export default function CalculateTax() {
  const nav = useNavigate()
  const [step, setStep] = useState('connect')
  const [records, setRecords] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [connectedApp, setConnectedApp] = useState(null)
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    entityType: 'S-Corporation',
    grossRevenue: '',
    businessExpenses: '',
    officerSalary: '',
    depreciation: '',
    ownershipPct: 100,
  })
  const token = localStorage.getItem('access_token')

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('tax_records') || '[]')
    const connected = localStorage.getItem('connected_app')
    if (saved.length > 0) {
      setRecords(saved)
      setStep('records')
    }
    if (connected) setConnectedApp(connected)
  }, [])

  const handleConnect = (integration) => {
    window.open(API + '/integrations/' + integration.id + '/connect', '_blank')
    localStorage.setItem('connected_app', integration.name)
    setConnectedApp(integration.name)
    setStep('manual')
  }

  const handleManual = () => setStep('manual')

  const calcK1 = () => {
    const rev = parseFloat(form.grossRevenue) || 0
    const exp = parseFloat(form.businessExpenses) || 0
    const sal = parseFloat(form.officerSalary) || 0
    const dep = parseFloat(form.depreciation) || 0
    return ((rev - exp - sal - dep) * (parseFloat(form.ownershipPct) / 100)).toFixed(2)
  }

  const handleSave = () => {
    const k1 = parseFloat(calcK1())
    const record = {
      id: Date.now(),
      year: form.year,
      entityType: form.entityType,
      grossRevenue: parseFloat(form.grossRevenue) || 0,
      businessExpenses: parseFloat(form.businessExpenses) || 0,
      officerSalary: parseFloat(form.officerSalary) || 0,
      depreciation: parseFloat(form.depreciation) || 0,
      k1Income: k1,
      ownershipPct: form.ownershipPct,
      totalDeductions: (parseFloat(form.businessExpenses)||0) + (parseFloat(form.officerSalary)||0) + (parseFloat(form.depreciation)||0),
      createdAt: new Date().toLocaleString(),
    }
    const updated = [record, ...records]
    setRecords(updated)
    localStorage.setItem('tax_records', JSON.stringify(updated))
    setStep('records')
    setShowForm(false)
    setForm({year: new Date().getFullYear(), entityType:'S-Corporation', grossRevenue:'', businessExpenses:'', officerSalary:'', depreciation:'', ownershipPct:100})
  }

  const handleDelete = (id) => {
    const updated = records.filter(r => r.id !== id)
    setRecords(updated)
    localStorage.setItem('tax_records', JSON.stringify(updated))
    if (updated.length === 0) setStep('connect')
  }

  const inp = (label, key, placeholder, hint) => (
    <div style={{marginBottom:16}}>
      <label style={{display:'block',fontSize:12,fontWeight:700,color:SL,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
      {hint && <div style={{fontSize:11,color:'#94A3B8',marginBottom:6}}>{hint}</div>}
      <input
        type="number"
        placeholder={placeholder || '0'}
        value={form[key]}
        onChange={e => setForm(f => ({...f,[key]:e.target.value}))}
        style={{width:'100%',padding:'10px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:15,fontWeight:500,color:N,background:'#fff',outline:'none',boxSizing:'border-box'}}
      />
    </div>
  )

  const nav_bar = (
    <nav style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 32px',height:60,background:'#fff',borderBottom:'1px solid #E2E8F0',position:'sticky',top:0,zIndex:100}}>
      <LOGO/>
      <div style={{display:'flex',gap:24}}>
        {['Dashboard','Calculate Tax','AI Analysis'].map(l => (
          <button key={l} onClick={()=>nav('/'+l.toLowerCase().replace(' ','-'))} style={{background:'none',border:'none',fontWeight:l==='Calculate Tax'?700:500,color:l==='Calculate Tax'?B:SL,fontSize:14,cursor:'pointer',padding:'6px 4px',borderBottom:l==='Calculate Tax'?'2px solid '+B:'2px solid transparent'}}>
            {l}
          </button>
        ))}
      </div>
    </nav>
  )

  // STEP 1: CONNECT
  if (step === 'connect') return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {nav_bar}
      <div style={{maxWidth:600,margin:'60px auto',padding:'0 24px'}}>
        <div style={{textAlign:'center',marginBottom:40}}>
          <h1 style={{fontSize:28,fontWeight:800,color:N,margin:'0 0 10px'}}>Get your best possible tax outcome</h1>
          <p style={{color:SL,fontSize:15,margin:0}}>Connect your accounting software or enter your numbers manually.</p>
        </div>
        <div style={{background:'#fff',borderRadius:16,padding:32,boxShadow:'0 1px 8px rgba(0,0,0,0.07)',marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:SL,marginBottom:20,textTransform:'uppercase',letterSpacing:'0.08em'}}>Connect Accounting Software</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {INTEGRATIONS.map(i => (
              <button key={i.id} onClick={() => handleConnect(i)} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 18px',background:i.bg,border:'1.5px solid '+i.color+'33',borderRadius:12,cursor:'pointer',transition:'all 0.15s'}}>
                <div style={{width:38,height:38,borderRadius:8,background:i.color,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:13,flexShrink:0}}>{i.abbr}</div>
                <div style={{textAlign:'left'}}>
                  <div style={{fontWeight:700,fontSize:14,color:N}}>{i.name}</div>
                  <div style={{fontSize:11,color:i.color,fontWeight:600}}>Connect</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div style={{textAlign:'center',marginBottom:20}}>
          <span style={{color:SL,fontSize:13}}>— or —</span>
        </div>
        <button onClick={handleManual} style={{width:'100%',padding:'14px',background:'#fff',border:'2px solid #E2E8F0',borderRadius:12,fontWeight:700,fontSize:15,color:N,cursor:'pointer'}}>
          Enter Numbers Manually
        </button>
      </div>
    </div>
  )

  // STEP 2: MANUAL ENTRY FORM
  if (step === 'manual') return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {nav_bar}
      <div style={{maxWidth:600,margin:'40px auto',padding:'0 24px'}}>
        {connectedApp && (
          <div style={{background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:'10px 16px',marginBottom:20,fontSize:13,color:'#166534',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontWeight:700}}>Connected:</span> {connectedApp} — Review and confirm your numbers below.
          </div>
        )}
        <div style={{background:'#fff',borderRadius:16,padding:32,boxShadow:'0 1px 8px rgba(0,0,0,0.07)'}}>
          <h2 style={{fontSize:20,fontWeight:800,color:N,margin:'0 0 4px'}}>Enter Your Financial Data</h2>
          <p style={{color:SL,fontSize:13,margin:'0 0 28px'}}>K-1 income is auto-calculated from your inputs.</p>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div>
              <label style={{display:'block',fontSize:12,fontWeight:700,color:SL,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Tax Year</label>
              <select value={form.year} onChange={e=>setForm(f=>({...f,year:parseInt(e.target.value)}))} style={{width:'100%',padding:'10px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:15,color:N,background:'#fff'}}>
                {[2026,2025,2024,2023].map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={{display:'block',fontSize:12,fontWeight:700,color:SL,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Entity Type</label>
              <select value={form.entityType} onChange={e=>setForm(f=>({...f,entityType:e.target.value}))} style={{width:'100%',padding:'10px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:15,color:N,background:'#fff'}}>
                {['S-Corporation','LLC','Partnership','Sole Proprietor'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {inp('Gross Revenue', 'grossRevenue', 'e.g. 250000', 'Total revenue before any deductions')}
          {inp('Business Expenses', 'businessExpenses', 'e.g. 80000', 'Operating expenses excluding officer salary and depreciation')}
          {form.entityType === 'S-Corporation' && inp('Officer Salary', 'officerSalary', 'e.g. 60000', 'Reasonable compensation paid to you as an officer — required for S-Corps')}
          {inp('Depreciation', 'depreciation', 'e.g. 10000', 'Section 179 or standard depreciation on business assets')}

          <div style={{marginBottom:20}}>
            <label style={{display:'block',fontSize:12,fontWeight:700,color:SL,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>Ownership %</label>
            <input type="number" min="1" max="100" value={form.ownershipPct} onChange={e=>setForm(f=>({...f,ownershipPct:parseFloat(e.target.value)||100}))} style={{width:'100%',padding:'10px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:15,color:N,background:'#fff',boxSizing:'border-box'}}/>
          </div>

          {(parseFloat(form.grossRevenue)||0) > 0 && (
            <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10,padding:16,marginBottom:24}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1E40AF',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>Estimated K-1 Income</div>
              <div style={{fontSize:26,fontWeight:800,color:'#1D4ED8'}}>{fmt(calcK1())}</div>
              <div style={{fontSize:11,color:'#3B82F6',marginTop:2}}>{form.ownershipPct}% ownership share</div>
            </div>
          )}

          <div style={{display:'flex',gap:12}}>
            <button onClick={()=>setStep('connect')} style={{flex:1,padding:'12px',background:'#F1F5F9',border:'none',borderRadius:10,fontWeight:600,fontSize:15,color:SL,cursor:'pointer'}}>Back</button>
            <button onClick={handleSave} disabled={!(parseFloat(form.grossRevenue)||0)} style={{flex:2,padding:'12px',background:(parseFloat(form.grossRevenue)||0)?B:'#CBD5E1',border:'none',borderRadius:10,fontWeight:700,fontSize:15,color:'#fff',cursor:(parseFloat(form.grossRevenue)||0)?'pointer':'not-allowed'}}>
              Generate Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // STEP 3: RECORDS WITH TIA
  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {nav_bar}
      <div style={{maxWidth:900,margin:'0 auto',padding:'32px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,color:N,margin:0}}>Tax Intelligence Analysis</h1>
            <p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Your numbers, analysis, and recommendations</p>
          </div>
          <button onClick={()=>setStep('connect')} style={{padding:'10px 20px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer'}}>
            + New Calculation
          </button>
        </div>

        {records.map(r => {
          const tia = calcTIA(r)
          return (
            <div key={r.id} style={{background:'#fff',borderRadius:16,padding:28,marginBottom:24,boxShadow:'0 1px 6px rgba(0,0,0,0.06)'}}>
              {/* Header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
                <div>
                  <div style={{fontWeight:800,color:N,fontSize:17}}>Tax Record {r.year} &mdash; {r.entityType}</div>
                  <div style={{color:SL,fontSize:12,marginTop:2}}>Last updated {r.createdAt}</div>
                </div>
                <div style={{display:'flex',gap:10}}>
                  <button onClick={()=>nav('/ai-analysis',{state:{record:r}})} style={{padding:'8px 16px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>AI Analysis</button>
                  <button onClick={()=>handleDelete(r.id)} style={{padding:'8px 16px',background:'#FEE2E2',color:'#DC2626',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Delete</button>
                </div>
              </div>

              {/* Financial Summary Grid */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:28}}>
                {[
                  ['Gross Revenue', r.grossRevenue],
                  ['Total Expenses', r.totalDeductions],
                  ['Depreciation', r.depreciation],
                  ['K-1 Income (Sch. E)', r.k1Income],
                ].map(([label, val]) => (
                  <div key={label} style={{background:'#F8FAFC',borderRadius:10,padding:'14px 16px'}}>
                    <div style={{fontSize:11,color:SL,fontWeight:600,marginBottom:4}}>{label}</div>
                    <div style={{color:parseFloat(val)<0?'#DC2626':N,fontWeight:800,fontSize:18}}>
                      {parseFloat(val)<0 ? '-' + fmt(Math.abs(parseFloat(val))) : fmt(val)}
                    </div>
                  </div>
                ))}
              </div>

              {/* TAX INTELLIGENCE ANALYSIS */}
              <div style={{borderTop:'2px solid #1E3A5F',paddingTop:22}}>
                <div style={{fontSize:12,fontWeight:800,color:'#1E3A5F',marginBottom:16,letterSpacing:'0.08em'}}>TAX INTELLIGENCE ANALYSIS</div>

                {/* Key Numbers */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
                  <div style={{background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:14}}>
                    <div style={{fontSize:10,color:'#166534',fontWeight:700,marginBottom:4}}>K-1 TO OWNER</div>
                    <div style={{fontSize:22,fontWeight:800,color:'#15803D'}}>{fmt(Math.max(0,tia.net))}</div>
                    <div style={{fontSize:10,color:'#166534',marginTop:2}}>{r.ownershipPct}% ownership</div>
                  </div>
                  <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10,padding:14}}>
                    <div style={{fontSize:10,color:'#1E40AF',fontWeight:700,marginBottom:4}}>EST. SE TAX</div>
                    <div style={{fontSize:22,fontWeight:800,color:'#1D4ED8'}}>{fmt(tia.se)}</div>
                    <div style={{fontSize:10,color:'#1E40AF',marginTop:2}}>15.3% self-employment</div>
                  </div>
                  <div style={{background:'#FEF9C3',border:'1px solid #FDE047',borderRadius:10,padding:14}}>
                    <div style={{fontSize:10,color:'#854D0E',fontWeight:700,marginBottom:4}}>EST. 1040 LIABILITY</div>
                    <div style={{fontSize:22,fontWeight:800,color:'#92400E'}}>{fmt(tia.est)}</div>
                    <div style={{fontSize:10,color:'#854D0E',marginTop:2}}>22% bracket + SE tax</div>
                  </div>
                </div>

                {/* Recommended Officer Salary */}
                {tia.rec > 0 && r.entityType === 'S-Corporation' && (
                  <div style={{background:'#F5F3FF',border:'1px solid #C4B5FD',borderRadius:10,padding:14,marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:10,color:'#5B21B6',fontWeight:700,marginBottom:2}}>RECOMMENDED OFFICER SALARY</div>
                      <div style={{fontSize:11,color:'#7C3AED'}}>~35% of net income — IRS-defensible compensation</div>
                    </div>
                    <div style={{fontSize:22,fontWeight:800,color:'#6D28D9'}}>{fmt(tia.rec)}/yr</div>
                  </div>
                )}

                {/* Form 1040 Breakdown */}
                <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:16,marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#1E3A5F',marginBottom:12}}>FORM 1040 ESTIMATE BREAKDOWN</div>
                  {[
                    ['K-1 income to owner', fmt(Math.max(0,tia.net)), N],
                    ['+ Self-employment tax (15.3%)', fmt(tia.se), '#64748B'],
                    ['+ Income tax (22% bracket)', fmt(Math.round(Math.max(0,tia.net)*0.22)), '#64748B'],
                  ].map(([label,val,color]) => (
                    <div key={label} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'5px 0',borderBottom:'1px solid #F1F5F9'}}>
                      <span style={{color:SL}}>{label}</span>
                      <span style={{fontWeight:700,color}}>{val}</span>
                    </div>
                  ))}
                  <div style={{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:4}}>
                    <span style={{fontSize:14,fontWeight:700,color:'#1E3A5F'}}>Est. Total Tax Liability</span>
                    <span style={{fontSize:22,fontWeight:800,color:'#DC2626'}}>{fmt(tia.est)}</span>
                  </div>
                </div>

                {/* Recommendations */}
                {tia.recommendations.length > 0 && (
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:'#1E3A5F',marginBottom:10}}>RECOMMENDATIONS</div>
                    {tia.recommendations.map((rec,i) => (
                      <div key={i} style={{
                        display:'flex',gap:12,padding:'12px 14px',borderRadius:10,marginBottom:10,
                        background: rec.type==='danger'?'#FEF2F2': rec.type==='warning'?'#FFFBEB':'#EFF6FF',
                        border: '1px solid ' + (rec.type==='danger'?'#FCA5A5': rec.type==='warning'?'#FDE68A':'#BFDBFE'),
                      }}>
                        <span style={{fontSize:16,flexShrink:0}}>{rec.type==='danger'?'⚠️': rec.type==='warning'?'💡':'ℹ️'}</span>
                        <span style={{fontSize:13,color: rec.type==='danger'?'#991B1B': rec.type==='warning'?'#92400E':'#1E40AF',lineHeight:1.5}}>{rec.msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                {tia.recommendations.length === 0 && tia.net > 0 && (
                  <div style={{display:'flex',gap:12,padding:'12px 14px',borderRadius:10,background:'#F0FDF4',border:'1px solid #86EFAC'}}>
                    <span style={{fontSize:16}}>✅</span>
                    <span style={{fontSize:13,color:'#166534',lineHeight:1.5}}>Your tax structure looks healthy. Continue monitoring quarterly to stay optimized.</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
