import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'https://app.taxstat360.com'
const LAMBDA = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth'
const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'

const ENTITY_TYPES = ['S-Corporation','Multi-Member LLC','Single-Member LLC','Partnership','Sole Proprietor','C-Corporation']
const FILING_LABELS = { single:'Single', mfj:'Married Filing Jointly', mfs:'Married Filing Separately', hoh:'Head of Household', qss:'Qualifying Surviving Spouse' }
const BRACKETS = {
  single:[[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
  mfj:[[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
  mfs:[[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[365600,0.35],[Infinity,0.37]],
  hoh:[[16550,0.10],[63100,0.12],[100500,0.22],[191950,0.24],[243700,0.32],[609350,0.35],[Infinity,0.37]],
  qss:[[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
}
const STD_DED = { single:14600, mfj:29200, mfs:14600, hoh:21900, qss:29200 }
const INTEGRATIONS = [
  {id:'quickbooks', name:'QuickBooks', color:'#2CA01C', bg:'#F0FBF0', abbr:'QB'},
  {id:'xero',       name:'Xero',       color:'#13B5EA', bg:'#EFF9FF', abbr:'XE'},
  {id:'wave',       name:'Wave',       color:'#2C6ECB', bg:'#EFF4FF', abbr:'WV'},
  {id:'freshbooks', name:'FreshBooks', color:'#1a9c3e', bg:'#F0FBF4', abbr:'FB'},
]

const isPassthrough = (e) => ['S-Corporation','Multi-Member LLC','Single-Member LLC','Partnership','Sole Proprietor'].includes(e)
const isSCorp = (e) => e === 'S-Corporation'
const fmt = (n) => '$' + Math.abs(parseFloat(n)||0).toLocaleString('en-US',{maximumFractionDigits:0})

function calcTax(biz, f1040) {
  const rev=parseFloat(biz.grossRevenue)||0, exp=parseFloat(biz.businessExpenses)||0
  const sal=parseFloat(biz.officerSalary)||0, dep=parseFloat(biz.depreciation)||0
  const oth=parseFloat(biz.otherDeductions)||0, own=(parseFloat(biz.ownershipPct)||100)/100
  const netBiz=rev-exp-sal-dep-oth, k1=Math.round(netBiz*own)
  const fs=f1040.filingStatus||'single', w2=parseFloat(f1040.w2Income)||0
  const otherInc=parseFloat(f1040.otherIncome)||0, deps=parseFloat(f1040.dependents)||0
  const estPay=parseFloat(f1040.estimatedPayments)||0, itemized=parseFloat(f1040.itemizedDed)||0
  const seTaxBase=isPassthrough(biz.entityType)&&!isSCorp(biz.entityType)?Math.max(0,k1)*0.9235:0
  const seTax=Math.round(seTaxBase*0.153), seDeduction=Math.round(seTax/2)
  const qbi=isPassthrough(biz.entityType)?Math.round(Math.max(0,k1)*0.20):0
  const agi=Math.max(0,k1+w2+otherInc-seDeduction)
  const stdDed=STD_DED[fs]||14600
  const deduction=f1040.useStandardDed!==false?stdDed:Math.max(stdDed,itemized)
  const taxableInc=Math.max(0,agi-deduction-qbi)
  let incomeTax=0, prev=0
  for (const [ceil,rate] of (BRACKETS[fs]||BRACKETS.single)) {
    if (taxableInc<=prev) break; incomeTax+=(Math.min(taxableInc,ceil)-prev)*rate; prev=ceil;
  }
  incomeTax=Math.round(incomeTax)
  const phaseout=fs==='mfj'?400000:200000
  const ctcReduce=Math.max(0,Math.floor((agi-phaseout)/1000)*50)
  const ctc=Math.max(0,deps*2000-ctcReduce)
  const totalBeforeCredits=incomeTax+seTax, totalAfterCredits=Math.max(0,totalBeforeCredits-ctc)
  const taxOwed=Math.max(0,totalAfterCredits-estPay), refund=Math.max(0,estPay-totalAfterCredits)
  const effectiveRate=agi>0?(totalAfterCredits/agi*100).toFixed(1):'0.0'
  const quarterly=Math.round(Math.max(0,totalAfterCredits-estPay)/4)
  const recOfficerSal=Math.round(Math.max(0,k1)*0.35)
  return {k1,netBiz,agi,deduction,qbi,seTax,seDeduction,taxableInc,incomeTax,ctc,totalBeforeCredits,totalAfterCredits,taxOwed,refund,effectiveRate,quarterly,recOfficerSal,stdDed,w2,otherInc,estPay}
}

function buildRecs(biz, t) {
  const recs=[], officerSal=parseFloat(biz.officerSalary)||0
  if (isSCorp(biz.entityType)&&officerSal===0&&t.k1>20000) recs.push({type:'danger',title:'No Officer Compensation Recorded',msg:'S-Corp owners must pay themselves a reasonable salary before taking distributions. The IRS treats this as a top audit trigger. Based on your net income, we recommend at least '+fmt(t.recOfficerSal)+'/yr.'})
  if (isSCorp(biz.entityType)&&officerSal>0&&officerSal<t.recOfficerSal&&t.k1>20000) recs.push({type:'warning',title:'Officer Compensation May Be Too Low',msg:'Your officer salary of '+fmt(officerSal)+' is below the IRS-recommended minimum of '+fmt(t.recOfficerSal)+' for your net income level. Consider increasing to reduce audit risk.'})
  if (t.quarterly>500) recs.push({type:'warning',title:'Quarterly Estimated Payments Required',msg:'To avoid underpayment penalties, make quarterly payments of approximately '+fmt(t.quarterly)+'. Due: Apr 15, Jun 15, Sep 15, Jan 15.'})
  if (t.qbi>0) recs.push({type:'success',title:'QBI Deduction Applied — You Saved '+fmt(t.qbi),msg:'As a passthrough entity owner, you qualify for the 20% Section 199A QBI deduction. This reduced your taxable income by '+fmt(t.qbi)+'.'})
  if ((parseFloat(biz.depreciation)||0)===0&&(parseFloat(biz.grossRevenue)||0)>50000) recs.push({type:'info',title:'No Depreciation Recorded',msg:'If you use equipment, a vehicle, or a home office for business, you may be missing significant deductions. Ask your CPA about Section 179 or bonus depreciation.'})
  if (t.k1>160000&&!isSCorp(biz.entityType)&&isPassthrough(biz.entityType)) recs.push({type:'info',title:'S-Corp Election Could Save You Money',msg:'At your income level, electing S-Corp status could save you thousands in self-employment taxes by splitting your income between salary and distributions.'})
  if (parseFloat(t.effectiveRate)>28) recs.push({type:'warning',title:'High Effective Tax Rate ('+t.effectiveRate+'%)',msg:'Consider maximizing retirement contributions: SEP-IRA (up to $66,000), Solo 401k (up to $69,000), or HSA contributions to reduce taxable income.'})
  if (recs.length===0) recs.push({type:'success',title:'Your Tax Structure Looks Healthy',msg:'No significant issues detected. Keep monitoring quarterly and update your numbers as your financials change.'})
  return recs
}

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

function NavBar() {
  const nav = useNavigate()
  return (
    <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
      <div onClick={()=>nav('/dashboard')} style={{cursor:'pointer'}}><LOGO/></div>
      <div style={{display:'flex',gap:4}}>
        {[['Dashboard','/dashboard'],['Tax Calculator','/calculate-tax'],['AI Analysis','/ai-analysis']].map(([l,p])=>(
          <button key={p} onClick={()=>nav(p)} style={{padding:'7px 14px',background:window.location.pathname.startsWith(p.replace('/calculate-tax','/calculat'))?B:'transparent',color:window.location.pathname.startsWith(p.replace('/calculate-tax','/calculat'))?'#fff':SL,border:'none',borderRadius:7,fontWeight:600,fontSize:13,cursor:'pointer'}}>
            {l}
          </button>
        ))}
      </div>
      <button onClick={()=>{localStorage.clear();window.location.href='/'}} style={{padding:'6px 14px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:12,cursor:'pointer',color:SL}}>Sign Out</button>
    </nav>
  )
}

function StepBar({step, total=4}) {
  const labels = ['Your Business','Your Share','Personal Info','Tax Analysis']
  return (
    <div style={{maxWidth:640,margin:'0 auto',padding:'20px 20px 0'}}>
      <div style={{display:'flex',alignItems:'center',gap:0}}>
        {labels.map((l,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',flex:i<total-1?1:'auto'}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <div style={{width:28,height:28,borderRadius:'50%',background:i<step?B:i===step-1?B:'#E2E8F0',color:i<step||i===step-1?'#fff':'#94A3B8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>
                {i<step-1?'✓':(i+1)}
              </div>
              <div style={{fontSize:10,fontWeight:600,color:i===step-1?B:i<step-1?'#059669':SL,whiteSpace:'nowrap'}}>{l}</div>
            </div>
            {i<total-1 && <div style={{flex:1,height:2,background:i<step-1?B:'#E2E8F0',margin:'0 6px',marginBottom:16}}/>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Card({children, style={}}) {
  return <div style={{background:'#fff',borderRadius:14,padding:28,boxShadow:'0 1px 8px rgba(0,0,0,0.06)',maxWidth:640,margin:'20px auto',...style}}>{children}</div>
}

function Field({label, hint, children}) {
  return (
    <div style={{marginBottom:20}}>
      <label style={{display:'block',fontSize:13,fontWeight:700,color:N,marginBottom:3}}>{label}</label>
      {hint && <div style={{fontSize:12,color:'#94A3B8',marginBottom:7,lineHeight:1.4}}>{hint}</div>}
      {children}
    </div>
  )
}

function NumberInput({value, onChange, placeholder='0'}) {
  return (
    <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{width:'100%',padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:15,color:N,background:'#fff',boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}/>
  )
}

function InfoBox({type, title, msg}) {
  const s={danger:{bg:'#FEF2F2',border:'#FCA5A5',tc:'#991B1B',ic:'🚨'},warning:{bg:'#FFFBEB',border:'#FDE68A',tc:'#92400E',ic:'⚠️'},success:{bg:'#F0FDF4',border:'#86EFAC',tc:'#166534',ic:'✅'},info:{bg:'#EFF6FF',border:'#BFDBFE',tc:'#1E40AF',ic:'ℹ️'}}[type]||{bg:'#F8FAFC',border:'#E2E8F0',tc:SL,ic:'ℹ️'}
  return (
    <div style={{background:s.bg,border:'1px solid '+s.border,borderRadius:10,padding:'12px 14px',marginBottom:10,display:'flex',gap:10}}>
      <span style={{flexShrink:0,fontSize:15}}>{s.ic}</span>
      <div>
        {title && <div style={{fontWeight:700,fontSize:13,color:s.tc,marginBottom:2}}>{title}</div>}
        <div style={{fontSize:13,color:s.tc,lineHeight:1.5}}>{msg}</div>
      </div>
    </div>
  )
}

export default function CalculateTax() {
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [records, setRecords] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [connectedApp, setConnectedApp] = useState(null)
  const [connecting, setConnecting] = useState(null) // which app is connecting
  const [biz, setBiz] = useState({
    year:2025, entityType:'S-Corporation', grossRevenue:'', businessExpenses:'',
    officerSalary:'', depreciation:'', otherDeductions:'', ownershipPct:'100'
  })
  const [f1040, setF1040] = useState({
    filingStatus:'single', w2Income:'', otherIncome:'', estimatedPayments:'',
    dependents:'', useStandardDed:true, itemizedDed:''
  })

  useEffect(()=>{
    const saved = JSON.parse(localStorage.getItem('ts360_records')||'[]')
    const app = localStorage.getItem('ts360_connected_app')
    setRecords(saved)
    if (app) setConnectedApp(app)
    if (saved.length > 0) { setSelectedId(saved[0].id); setStep(4) }
  },[])

  // ── Handle return from OAuth redirect ─────────────────────────────────
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const pendingApp = localStorage.getItem('ts360_pending_app')
    const pendingName = localStorage.getItem('ts360_pending_name')

    // Map app id to token param name
    const tokenMap = { quickbooks: 'qb_token', xero: 'xero_token', wave: 'wave_token', freshbooks: 'fb_token' }
    const tokenParam = pendingApp ? tokenMap[pendingApp] : null
    const token = tokenParam ? urlParams.get(tokenParam) : null
    const errorParam = urlParams.get('error')

    if (pendingApp && (token || errorParam)) {
      localStorage.removeItem('ts360_pending_app')
      localStorage.removeItem('ts360_pending_name')
      // Clean URL
      window.history.replaceState({}, '', '/calculate-tax')

      if (token) {
        // Fetch financial data from Lambda
        fetch(`${LAMBDA}/${pendingApp}/data?token=${token}`)
          .then(r => r.json())
          .then(data => {
            if (data.grossRevenue && parseFloat(data.grossRevenue) > 0) {
              setBiz(p => ({ ...p, grossRevenue: data.grossRevenue }))
            }
            if (data.otherDeductions && parseFloat(data.otherDeductions) > 0) {
              setBiz(p => ({ ...p, otherDeductions: data.otherDeductions }))
            }
          })
          .catch(e => console.error('Data fetch error:', e))

        localStorage.setItem('ts360_connected_app', pendingName)
        setConnectedApp(pendingName)
      }
      setStep(2)
    }
  }, [])

  const bSet = (k,v) => setBiz(p=>({...p,[k]:v}))
  const fSet = (k,v) => setF1040(p=>({...p,[k]:v}))

  const k1Preview = () => {
    const rev=parseFloat(biz.grossRevenue)||0, exp=parseFloat(biz.businessExpenses)||0
    const sal=parseFloat(biz.officerSalary)||0, dep=parseFloat(biz.depreciation)||0
    const oth=parseFloat(biz.otherDeductions)||0, own=(parseFloat(biz.ownershipPct)||100)/100
    return Math.round((rev-exp-sal-dep-oth)*own)
  }

  // ── CONNECT HANDLER — direct navigation ─────────────────────────────────
  const handleConnect = (integration) => {
    // Store which app is connecting so we can fetch data on return
    localStorage.setItem('ts360_pending_app', integration.id)
    localStorage.setItem('ts360_pending_name', integration.name)
    // Navigate directly — Lambda handles OAuth and redirects back with token in URL
    window.location.href = `${LAMBDA}/${integration.id}/connect`
  }

  const handleSave = () => {
    const t = calcTax(biz, f1040)
    const record = { id:Date.now(), savedAt:new Date().toLocaleString(), biz:{...biz}, f1040:{...f1040}, connectedApp, k1Income:t.k1 }
    const updated = [record, ...records]
    setRecords(updated)
    setSelectedId(record.id)
    localStorage.setItem('ts360_records', JSON.stringify(updated))
    setStep(4)
  }

  const handleDelete = (id) => {
    const updated = records.filter(r=>r.id!==id)
    setRecords(updated)
    localStorage.setItem('ts360_records', JSON.stringify(updated))
    if (updated.length===0) { setStep(1); setSelectedId(null) }
    else setSelectedId(updated[0].id)
  }

  const selectedRecord = records.find(r=>r.id===selectedId)
  const tax = selectedRecord ? calcTax(selectedRecord.biz, selectedRecord.f1040) : null
  const recs = tax ? buildRecs(selectedRecord.biz, tax) : []
  const btnPrimary = {background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',padding:'13px',width:'100%'}
  const btnSecondary = {background:'#F1F5F9',color:SL,border:'none',borderRadius:10,fontWeight:600,fontSize:14,cursor:'pointer',padding:'11px 24px'}

  // ─── STEP 1: CONNECT OR START ───────────────────────────────────────────
  if (step===1) return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <NavBar/>
      <div style={{maxWidth:640,margin:'40px auto',padding:'0 20px'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <h1 style={{fontSize:24,fontWeight:800,color:N,margin:'0 0 10px'}}>Know Your Actual Tax Bill</h1>
          <p style={{color:SL,fontSize:14,lineHeight:1.7,margin:0}}>
            Enter your business numbers, we calculate your share of profit (your K-1), then show you exactly what you owe on your personal tax return — in real time.
          </p>
        </div>
        <div style={{background:'#fff',borderRadius:14,padding:24,boxShadow:'0 1px 8px rgba(0,0,0,0.06)',marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.1em',marginBottom:16}}>SYNC FROM YOUR ACCOUNTING SOFTWARE</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {INTEGRATIONS.map(i=>(
              <button key={i.id}
                onClick={()=>handleConnect(i)}
                disabled={!!connecting}
                style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',background:connecting===i.id?i.color+'22':i.bg,border:'1.5px solid '+i.color+'33',borderRadius:12,cursor:connecting?'wait':'pointer',textAlign:'left',opacity:connecting&&connecting!==i.id?0.6:1}}
                onMouseOver={e=>!connecting&&(e.currentTarget.style.borderColor=i.color)}
                onMouseOut={e=>e.currentTarget.style.borderColor=i.color+'33'}
              >
                <div style={{width:38,height:38,borderRadius:9,background:i.color,color:'#fff',fontWeight:800,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {connecting===i.id ? '⏳' : i.abbr}
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:N}}>{i.name}</div>
                  {connecting===i.id && <div style={{fontSize:11,color:SL}}>Connecting...</div>}
                </div>
              </button>
            ))}
          </div>
          <p style={{fontSize:11,color:'#94A3B8',margin:'12px 0 0',textAlign:'center'}}>Secure OAuth connection — your credentials are never stored</p>
        </div>
        <div style={{textAlign:'center',color:'#94A3B8',fontSize:13,margin:'0 0 12px'}}>— or —</div>
        <button onClick={()=>setStep(2)} style={{...btnPrimary,background:'#fff',color:N,border:'2px solid #E2E8F0'}}>
          Enter My Numbers Manually
        </button>
        {records.length>0 && (
          <button onClick={()=>{setSelectedId(records[0].id);setStep(4)}} style={{width:'100%',padding:'10px',background:'transparent',border:'none',color:B,fontWeight:600,fontSize:13,cursor:'pointer',marginTop:8}}>
            View my saved analysis →
          </button>
        )}
      </div>
    </div>
  )

  // ─── STEP 2: BUSINESS FINANCIALS ────────────────────────────────────────
  if (step===2) return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <NavBar/>
      <StepBar step={2}/>
      {connectedApp && (
        <div style={{maxWidth:640,margin:'12px auto 0',padding:'0 20px'}}>
          <div style={{background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:'9px 14px',fontSize:13,color:'#166534'}}>
            <strong>✅ Connected: {connectedApp}</strong> — {parseFloat(biz.grossRevenue)>0 ? 'Your financial data has been imported below.' : 'Review and fill in your numbers below.'}
          </div>
        </div>
      )}
      <Card>
        <h2 style={{fontSize:18,fontWeight:800,color:N,margin:'0 0 4px'}}>Your Business Financials</h2>
        <p style={{color:SL,fontSize:13,margin:'0 0 22px'}}>Enter what your business earned and spent this year.</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
          <Field label="Tax Year">
            <select value={biz.year} onChange={e=>bSet('year',parseInt(e.target.value))} style={{width:'100%',padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:15,color:N,background:'#fff'}}>
              {[2025,2024,2023,2022].map(y=><option key={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Business Entity Type">
            <select value={biz.entityType} onChange={e=>bSet('entityType',e.target.value)} style={{width:'100%',padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:15,color:N,background:'#fff'}}>
              {ENTITY_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Total Business Revenue" hint="All money your business received before any deductions">
          <NumberInput value={biz.grossRevenue} onChange={v=>bSet('grossRevenue',v)}/>
        </Field>
        <Field label="Business Expenses" hint="Operating costs — rent, utilities, contractors, payroll (not including your own salary if S-Corp)">
          <NumberInput value={biz.businessExpenses} onChange={v=>bSet('businessExpenses',v)}/>
        </Field>
        {isSCorp(biz.entityType) && (
          <Field label="Your Officer Salary" hint="Required for S-Corps — the IRS mandates you pay yourself a reasonable wage before taking distributions.">
            <div style={{border:'1.5px solid #FCA5A5',borderRadius:9,overflow:'hidden',background:'#FEF2F2'}}>
              <input type="number" value={biz.officerSalary} onChange={e=>bSet('officerSalary',e.target.value)} placeholder="0"
                style={{width:'100%',padding:'11px 14px',border:'none',fontSize:15,color:N,background:'transparent',boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}/>
            </div>
            {parseFloat(biz.grossRevenue)>0&&!parseFloat(biz.officerSalary)&&(
              <div style={{fontSize:11,color:'#DC2626',marginTop:4}}>Leaving this at $0 is a major IRS audit risk</div>
            )}
          </Field>
        )}
        <Field label="Depreciation" hint="The value of equipment, vehicles, or property you can deduct this year (Section 179, bonus depreciation)">
          <NumberInput value={biz.depreciation} onChange={v=>bSet('depreciation',v)}/>
        </Field>
        <Field label="Other Deductions" hint="Home office, business vehicle mileage, professional fees, insurance, or other allowable deductions">
          <NumberInput value={biz.otherDeductions} onChange={v=>bSet('otherDeductions',v)}/>
        </Field>
        <div style={{display:'flex',gap:12,marginTop:8}}>
          <button onClick={()=>setStep(1)} style={btnSecondary}>Back</button>
          <button onClick={()=>setStep(3)} disabled={!biz.grossRevenue} style={{...btnPrimary,opacity:biz.grossRevenue?1:0.5,cursor:biz.grossRevenue?'pointer':'not-allowed',flex:1}}>
            Continue — See My Share of Profit →
          </button>
        </div>
      </Card>
    </div>
  )

  // ─── STEP 3: OWNERSHIP + PERSONAL 1040 ──────────────────────────────────
  if (step===3) {
    const k1=k1Preview(), liveT=calcTax(biz,f1040)
    return (
      <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
        <NavBar/><StepBar step={3}/>
        <Card>
          <h2 style={{fontSize:18,fontWeight:800,color:N,margin:'0 0 4px'}}>Your Share of Profit + Personal Tax Info</h2>
          <p style={{color:SL,fontSize:13,margin:'0 0 22px'}}>We calculate your taxable business income, then add your personal situation to find your actual tax bill.</p>
          <Field label="Your Ownership Percentage" hint="What percentage of this business do you own? (100% if sole owner)">
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <input type="number" min="1" max="100" value={biz.ownershipPct} onChange={e=>bSet('ownershipPct',e.target.value)}
                style={{flex:1,padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:15,color:N,background:'#fff',boxSizing:'border-box',outline:'none'}}/>
              <span style={{color:SL,fontWeight:700}}>%</span>
            </div>
          </Field>
          <div style={{background:'linear-gradient(135deg,#1E3A5F,#1D4ED8)',borderRadius:12,padding:20,marginBottom:24,color:'#fff'}}>
            <div style={{fontSize:11,color:'#93C5FD',fontWeight:700,marginBottom:8,letterSpacing:'0.08em'}}>YOUR SHARE OF BUSINESS PROFIT (K-1 INCOME)</div>
            <div style={{fontSize:32,fontWeight:800,marginBottom:8}}>{fmt(k1)}</div>
            <div style={{fontSize:12,color:'#BFDBFE',lineHeight:1.6}}>This is your {biz.ownershipPct}% share of your business profit. It flows to your personal tax return (Schedule E, Line 17).</div>
          </div>
          <div style={{height:1,background:'#F1F5F9',margin:'0 0 20px'}}/>
          <h3 style={{fontSize:15,fontWeight:700,color:N,margin:'0 0 4px'}}>Your Personal Tax Situation</h3>
          <p style={{color:SL,fontSize:12,margin:'0 0 20px'}}>This mirrors your Form 1040.</p>
          <Field label="Filing Status">
            <select value={f1040.filingStatus} onChange={e=>fSet('filingStatus',e.target.value)} style={{width:'100%',padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:9,fontSize:15,color:N,background:'#fff'}}>
              {Object.entries(FILING_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="W-2 Wages / Salary Income" hint="Any salary from employment (separate from your business)">
            <NumberInput value={f1040.w2Income} onChange={v=>fSet('w2Income',v)}/>
          </Field>
          <Field label="Other Personal Income" hint="Interest, dividends, rental income, capital gains, or any other taxable income">
            <NumberInput value={f1040.otherIncome} onChange={v=>fSet('otherIncome',v)}/>
          </Field>
          <Field label="Number of Qualifying Children" hint="Children under 17 who qualify for the Child Tax Credit ($2,000 per child)">
            <NumberInput value={f1040.dependents} onChange={v=>fSet('dependents',v)}/>
          </Field>
          <Field label="Deduction Method">
            <div style={{display:'flex',gap:8,marginBottom:f1040.useStandardDed?0:12}}>
              <button onClick={()=>fSet('useStandardDed',true)} style={{flex:1,padding:'10px',background:f1040.useStandardDed?B:'#fff',color:f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(f1040.useStandardDed?B:'#E2E8F0'),borderRadius:9,fontWeight:600,fontSize:13,cursor:'pointer'}}>
                Standard ({fmt(STD_DED[f1040.filingStatus])})
              </button>
              <button onClick={()=>fSet('useStandardDed',false)} style={{flex:1,padding:'10px',background:!f1040.useStandardDed?B:'#fff',color:!f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(!f1040.useStandardDed?B:'#E2E8F0'),borderRadius:9,fontWeight:600,fontSize:13,cursor:'pointer'}}>
                Itemized
              </button>
            </div>
            {!f1040.useStandardDed&&<NumberInput value={f1040.itemizedDed} onChange={v=>fSet('itemizedDed',v)} placeholder="Total itemized deductions"/>}
          </Field>
          <Field label="Estimated Tax Payments Made This Year" hint="Quarterly payments already sent to the IRS">
            <NumberInput value={f1040.estimatedPayments} onChange={v=>fSet('estimatedPayments',v)}/>
          </Field>
          {k1!==0&&(
            <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:12,padding:16,marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:SL,marginBottom:10,letterSpacing:'0.06em'}}>LIVE ESTIMATE</div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:SL,marginBottom:4}}><span>Adjusted Gross Income</span><span style={{fontWeight:700,color:N}}>{fmt(liveT.agi)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:SL,marginBottom:4}}><span>Taxable Income</span><span style={{fontWeight:700,color:N}}>{fmt(liveT.taxableInc)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:700,borderTop:'1px solid #E2E8F0',paddingTop:8,marginTop:4}}>
                <span style={{color:N}}>{liveT.refund>0?'Estimated Refund':'Estimated Tax Owed'}</span>
                <span style={{color:liveT.refund>0?'#16A34A':'#DC2626',fontSize:18}}>{liveT.refund>0?fmt(liveT.refund):fmt(liveT.taxOwed)}</span>
              </div>
            </div>
          )}
          <div style={{display:'flex',gap:12,marginTop:12}}>
            <button onClick={()=>setStep(2)} style={btnSecondary}>Back</button>
            <button onClick={handleSave} style={{...btnPrimary,flex:1}}>Save & View Full Tax Analysis →</button>
          </div>
        </Card>
      </div>
    )
  }

  // ─── STEP 4: FULL ANALYSIS ───────────────────────────────────────────────
  const r=selectedRecord
  if (!r||!tax) return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <NavBar/>
      <div style={{textAlign:'center',padding:'60px 20px'}}>
        <h2 style={{color:N}}>No records yet</h2>
        <button onClick={()=>setStep(1)} style={{...btnPrimary,width:'auto',padding:'12px 28px'}}>Start New Calculation</button>
      </div>
    </div>
  )

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <NavBar/>
      <div style={{maxWidth:1060,margin:'0 auto',padding:'24px 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:10}}>
          <div>
            <h1 style={{fontSize:21,fontWeight:800,color:N,margin:0}}>Tax Analysis — {r.biz.year}</h1>
            <p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>{r.biz.entityType} · Saved {r.savedAt}{r.connectedApp?' · via '+r.connectedApp:''}</p>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {records.length>1&&records.map(rec=>(
              <button key={rec.id} onClick={()=>setSelectedId(rec.id)} style={{padding:'6px 12px',background:selectedId===rec.id?N:'#fff',color:selectedId===rec.id?'#fff':SL,border:'1px solid #E2E8F0',borderRadius:7,fontWeight:600,fontSize:12,cursor:'pointer'}}>
                {rec.biz.year} — {rec.biz.entityType.split('-')[0]}
              </button>
            ))}
            <button onClick={()=>{setBiz({year:2025,entityType:'S-Corporation',grossRevenue:'',businessExpenses:'',officerSalary:'',depreciation:'',otherDeductions:'',ownershipPct:'100'});setF1040({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''});setStep(1)}} style={{padding:'7px 14px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>
              + New Calculation
            </button>
            <button onClick={()=>handleDelete(r.id)} style={{padding:'7px 14px',background:'#FEF2F2',color:'#DC2626',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Delete</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
          <div>
            <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)',marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:14}}>BUSINESS FINANCIALS</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {[['Revenue',r.biz.grossRevenue],['Expenses',r.biz.businessExpenses],['Officer Salary',r.biz.officerSalary],['Depreciation',r.biz.depreciation]].map(([l,v])=>(
                  <div key={l} style={{background:'#F8FAFC',borderRadius:9,padding:'10px 12px'}}>
                    <div style={{fontSize:10,color:SL,fontWeight:600,marginBottom:3}}>{l}</div>
                    <div style={{fontWeight:700,fontSize:16,color:N}}>{fmt(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{background:'linear-gradient(135deg,#1E3A5F,#1D4ED8)',borderRadius:12,padding:18,marginTop:14,color:'#fff'}}>
                <div style={{fontSize:10,color:'#93C5FD',fontWeight:700,marginBottom:6,letterSpacing:'0.08em'}}>K-1 INCOME — YOUR SHARE OF BUSINESS PROFIT</div>
                <div style={{fontSize:30,fontWeight:800,marginBottom:6}}>{fmt(tax.k1)}</div>
                <div style={{fontSize:12,color:'#BFDBFE',lineHeight:1.6}}>Your {r.biz.ownershipPct}% ownership share flows to Schedule E on your Form 1040.</div>
              </div>
            </div>
            <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:14}}>RECOMMENDATIONS</div>
              {recs.map((rec,i)=><InfoBox key={i} type={rec.type} title={rec.title} msg={rec.msg}/>)}
            </div>
          </div>
          <div>
            <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)',marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:4}}>FORM 1040 — YOUR ACTUAL TAX LIABILITY</div>
              <div style={{fontSize:12,color:SL,marginBottom:16}}>Filing as: <strong>{FILING_LABELS[r.f1040.filingStatus]||'Single'}</strong></div>
              {[
                {l:'K-1 Income (Schedule E)',v:tax.k1,c:'#1D4ED8',bg:'#EFF6FF',border:'#BFDBFE'},
                {l:'+ W-2 & Other Income',v:tax.w2+tax.otherInc,c:N,bg:'#F8FAFC',border:'#E2E8F0'},
                ...(tax.seDeduction>0?[{l:'- SE Tax Deduction',v:-tax.seDeduction,c:'#DC2626',bg:'#FEF2F2',border:'#FECACA'}]:[]),
              ].map(({l,v,c,bg,border})=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'9px 12px',background:bg,border:'1px solid '+border,borderRadius:8,marginBottom:6,fontSize:13}}>
                  <span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',background:'#F1F5F9',borderRadius:8,marginBottom:14,fontSize:13}}>
                <span style={{fontWeight:700,color:N}}>Adjusted Gross Income (AGI)</span>
                <span style={{fontWeight:800,fontSize:15,color:N}}>{fmt(tax.agi)}</span>
              </div>
              {[
                {l:'- '+(r.f1040.useStandardDed!==false?'Standard':'Itemized')+' Deduction',v:-tax.deduction,c:'#DC2626'},
                ...(tax.qbi>0?[{l:'- QBI Deduction (20% — Sec. 199A)',v:-tax.qbi,c:'#059669'}]:[]),
              ].map(({l,v,c})=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 12px',fontSize:13,borderBottom:'1px solid #F1F5F9'}}>
                  <span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',background:'#F1F5F9',borderRadius:8,margin:'10px 0 14px',fontSize:13}}>
                <span style={{fontWeight:700,color:N}}>Taxable Income</span>
                <span style={{fontWeight:800,fontSize:15,color:N}}>{fmt(tax.taxableInc)}</span>
              </div>
              {[
                {l:'Income Tax (from IRS brackets)',v:tax.incomeTax,c:N},
                ...(tax.seTax>0?[{l:'+ Self-Employment Tax (15.3%)',v:tax.seTax,c:N}]:[]),
                ...(tax.ctc>0?[{l:'- Child Tax Credit',v:-tax.ctc,c:'#059669'}]:[]),
                ...(tax.estPay>0?[{l:'- Estimated Payments Made',v:-tax.estPay,c:'#059669'}]:[]),
              ].map(({l,v,c})=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 12px',fontSize:13,borderBottom:'1px solid #F1F5F9'}}>
                  <span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:v<0?'#059669':c}}>{v<0?'-'+fmt(-v):fmt(v)}</span>
                </div>
              ))}
              <div style={{background:tax.refund>0?'#F0FDF4':'#FEF2F2',border:'2px solid '+(tax.refund>0?'#86EFAC':'#FCA5A5'),borderRadius:12,padding:18,marginTop:16}}>
                <div style={{fontSize:11,fontWeight:700,color:tax.refund>0?'#166534':'#991B1B',marginBottom:6,letterSpacing:'0.06em'}}>
                  {tax.refund>0?'ESTIMATED REFUND':'ESTIMATED TAX DUE'}
                </div>
                <div style={{fontSize:34,fontWeight:800,color:tax.refund>0?'#16A34A':'#DC2626'}}>
                  {tax.refund>0?fmt(tax.refund):fmt(tax.taxOwed)}
                </div>
                <div style={{fontSize:12,color:tax.refund>0?'#166534':'#991B1B',marginTop:6}}>
                  Effective rate: {tax.effectiveRate}% · Quarterly payment needed: {fmt(tax.quarterly)}
                </div>
              </div>
            </div>
            {tax.quarterly>0&&(
              <div style={{background:'#fff',borderRadius:14,padding:22,boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
                <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:14}}>QUARTERLY ESTIMATED TAX SCHEDULE</div>
                {[['Q1','April 15'],['Q2','June 15'],['Q3','September 15'],['Q4','January 15']].map(([q,due])=>(
                  <div key={q} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #F8FAFC'}}>
                    <div><div style={{fontWeight:700,fontSize:13,color:N}}>{q} Payment</div><div style={{fontSize:11,color:SL}}>Due: {due}</div></div>
                    <div style={{fontWeight:800,fontSize:16,color:B}}>{fmt(tax.quarterly)}</div>
                  </div>
                ))}
                <p style={{fontSize:11,color:'#94A3B8',margin:'12px 0 0',lineHeight:1.5}}>Pay at IRS.gov/payments — Direct Pay or EFTPS.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
