import { useState, useEffect } from 'react' // build
import { useNavigate } from 'react-router-dom'

const API = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
const N = '#0D1B3E', B = '#2563EB', SL = '#475569', G = '#16A34A'

const BRACKETS = {
  single:[[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
  mfj:   [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
  mfs:   [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
  hoh:   [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
  qss:   [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
}
const STD={single:15750,mfj:31500,mfs:15750,hoh:23625,qss:31500}
const FILING={single:'Single',mfj:'Married Filing Jointly',mfs:'Married Filing Separately',hoh:'Head of Household',qss:'Qualifying Surviving Spouse'}
const ENTITY_TYPES=['S-Corporation','Multi-Member LLC','Single-Member LLC','Partnership','Sole Proprietor','C-Corporation']
const PASSTHROUGH=['S-Corporation','Multi-Member LLC','Single-Member LLC','Partnership','Sole Proprietor']
const INTEGRATIONS=[
  {id:'quickbooks',name:'QuickBooks',color:'#2CA01C',bg:'#F0FBF0',abbr:'QB'},
  {id:'xero',      name:'Xero',      color:'#13B5EA',bg:'#EFF9FF',abbr:'XE'},
  {id:'wave',      name:'Wave',      color:'#2C6ECB',bg:'#EFF4FF',abbr:'WV'},
  {id:'freshbooks',name:'FreshBooks',color:'#1a9c3e',bg:'#F0FBF4',abbr:'FB'},
]

const fmt = n => '$'+Math.abs(parseFloat(n)||0).toLocaleString('en-US',{maximumFractionDigits:0})
const pct = n => (parseFloat(n)||0).toFixed(1)+'%'

function calcBracketTax(inc,fs){let tax=0,prev=0;for(const [c,r] of BRACKETS[fs]||BRACKETS.single){if(inc<=prev)break;tax+=(Math.min(inc,c)-prev)*r;prev=c}return Math.round(tax)}

function calcAll(biz,f1040){
  const rev=parseFloat(biz.grossRevenue)||0,cogs=parseFloat(biz.cogs)||0,gross=rev-cogs
  const opExp=parseFloat(biz.operatingExpenses)||0,sal=parseFloat(biz.officerSalary)||0
  const dep=parseFloat(biz.depreciation)||0,adv=parseFloat(biz.advertising)||0,other=parseFloat(biz.otherDeductions)||0
  const totalExp=opExp+sal+dep+adv+other,netBiz=gross-totalExp
  const own=(parseFloat(biz.ownershipPct)||100)/100,k1=Math.round(netBiz*own)
  const fs=f1040.filingStatus||'single',w2=parseFloat(f1040.w2Income)||0,otherInc=parseFloat(f1040.otherIncome)||0
  const deps=parseFloat(f1040.dependents)||0,estPay=parseFloat(f1040.estimatedPayments)||0
  const useStd=f1040.useStandardDed!==false,itemized=parseFloat(f1040.itemizedDed)||0
  const isPassthru=PASSTHROUGH.includes(biz.entityType),isSC=biz.entityType==='S-Corporation'
  const seTaxBase=isPassthru&&!isSC?Math.max(0,k1)*0.9235:0,seTax=Math.round(seTaxBase*0.153),seDed=Math.round(seTax/2)
  const qbi=isPassthru?Math.round(Math.max(0,k1)*0.20):0
  const agi=Math.max(0,k1+w2+otherInc-seDed),stdDed=STD[fs]||14600,ded=useStd?stdDed:Math.max(stdDed,itemized)
  const taxableInc=Math.max(0,agi-ded-qbi),incomeTax=calcBracketTax(taxableInc,fs)
  const phaseout=fs==='mfj'?400000:200000,ctcReduce=Math.max(0,Math.floor((agi-phaseout)/1000)*50)
  const ctc=Math.max(0,deps*2000-ctcReduce),totalTax=Math.max(0,incomeTax+seTax-ctc)
  const taxOwed=Math.max(0,totalTax-estPay),refund=Math.max(0,estPay-totalTax)
  const effRate=agi>0?(totalTax/agi*100).toFixed(1):'0.0',quarterly=Math.round(Math.max(0,totalTax-estPay)/4)
  const recSal=Math.round(Math.max(0,k1)*0.35)
  return {rev,cogs,gross,opExp,sal,dep,adv,other,totalExp,netBiz,k1,own,agi,ded,qbi,seTax,seDed,taxableInc,incomeTax,ctc,totalTax,taxOwed,refund,effRate,quarterly,recSal,stdDed,w2,otherInc,estPay,isPassthru,isSC}
}

function buildRecs(biz,calc){
  const recs=[],{k1,recSal,isSC,quarterly,qbi,effRate}=calc
  const officerSal=parseFloat(biz.officerSalary)||0,grossRev=parseFloat(biz.grossRevenue)||0
  const dep=parseFloat(biz.depreciation)||0,adv=parseFloat(biz.advertising)||0
  if(isSC&&officerSal===0&&k1>20000) recs.push({type:'danger',title:'No Officer Compensation',msg:'S-Corp owners must pay themselves a reasonable salary. The IRS considers this a primary audit trigger. Recommended minimum: '+fmt(recSal)+'/yr.'})
  if(isSC&&officerSal>0&&officerSal<recSal&&k1>20000) recs.push({type:'warning',title:'Officer Compensation May Be Too Low',msg:'Your officer salary of '+fmt(officerSal)+' is below the IRS-recommended minimum of '+fmt(recSal)+'. Consider increasing to reduce audit risk.'})
  if(quarterly>500) recs.push({type:'warning',title:'Quarterly Estimated Payments Required',msg:'Pay approximately '+fmt(quarterly)+' per quarter. Due: Apr 15, Jun 15, Sep 15, Jan 15.'})
  if(qbi>0) recs.push({type:'success',title:'QBI Deduction Applied - '+fmt(qbi)+' Saved',msg:'You qualify for the 20% Section 199A deduction, reducing your taxable income by '+fmt(qbi)+'.'})
  if(dep===0&&grossRev>50000) recs.push({type:'info',title:'Review Depreciation Deductions',msg:'No depreciation recorded. Equipment, vehicles, and home office may be deductible under Section 179.'})
  if(adv/grossRev<0.02&&grossRev>100000) recs.push({type:'info',title:'Consider Increasing Advertising Deductions',msg:'Your advertising expenses are low. Legitimate marketing and promotional costs are fully deductible.'})
  if(parseFloat(effRate)>28) recs.push({type:'warning',title:'High Effective Tax Rate ('+pct(effRate)+')',msg:'Consider maximizing retirement contributions: SEP-IRA (up to $66,000) or Solo 401k (up to $69,000).'})
  if(recs.length===0) recs.push({type:'success',title:'Your Tax Structure Looks Healthy',msg:'No significant issues detected. Keep monitoring quarterly and update as financials change.'})
  return recs
}

const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:10}}><svg width="30" height="30" viewBox="0 0 34 34" fill="none"><rect width="34" height="34" rx="8" fill={N}/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><span style={{fontWeight:800,fontSize:18,color:N,borderBottom:'2px solid '+B,paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></span></div>)
const Divider=()=><div style={{height:1,background:'#E2E8F0',margin:'32px 0'}}/>
const RiskBadge=({level})=>{const s={low:{bg:'#F0FDF4',color:'#166534',label:'Low Risk'},moderate:{bg:'#FFFBEB',color:'#92400E',label:'Moderate Risk'},high:{bg:'#FEF2F2',color:'#991B1B',label:'High Risk'}}[level]||{bg:'#F8FAFC',color:SL,label:'N/A'};return <span style={{background:s.bg,color:s.color,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>{s.label}</span>}

export default function Dashboard(){
  const nav=useNavigate()
  const userName=localStorage.getItem('userName')||''
  const [biz,setBiz]=useState({entityType:'S-Corporation',year:2025,ownershipPct:'100',grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:''})
  const [f1040,setF1040]=useState({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''})
  const [connectedApp,setConnectedApp]=useState(null)
  const [saved,setSaved]=useState(false)
  const [showFin,setShowFin]=useState(true)
  const [show1040,setShow1040]=useState(false)
  const [loadedRecord,setLoadedRecord]=useState(null)
  const [records,setRecords]=useState([])
  const bSet=(k,v)=>{setBiz(p=>({...p,[k]:v}));setSaved(false)}
  const fSet=(k,v)=>setF1040(p=>({...p,[k]:v}))

  const [xeroLoading,setXeroLoading]=useState(false)
  useEffect(()=>{
    const app=localStorage.getItem('ts360_connected_app')
    const email = localStorage.getItem('ts360_email') || 'default'
    const key = 'ts360_records_' + email
    const recs=JSON.parse(localStorage.getItem(key)||localStorage.getItem('ts360_records')||'[]')
    if(app)setConnectedApp(app)
    setRecords(recs)
    if(recs.length>0&&recs[0].biz){setBiz(recs[0].biz);setF1040(recs[0].f1040||f1040);setSaved(true)}
    const params=new URLSearchParams(window.location.search)
    const xeroToken=params.get('xero_token')
    if(xeroToken){
      localStorage.setItem('ts360_connected_app','Xero')
      setConnectedApp('Xero')
      setXeroLoading(true)
      fetch('https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/xero/data?token='+xeroToken)
        .then(r=>r.json())
        .then(data=>{
          if(data.grossRevenue){
            setBiz(p=>({...p,
              grossRevenue:String(Math.round(parseFloat(data.grossRevenue)||0)),
              otherDeductions:String(Math.round(parseFloat(data.otherDeductions)||0)),
            }))
            setShowFin(true)
          }
          setXeroLoading(false)
          window.history.replaceState({},'','/dashboard')
        })
        .catch(()=>{setXeroLoading(false);window.history.replaceState({},'','/dashboard')})
    }
  },[])

  const hasNumbers=parseFloat(biz.grossRevenue)>0
  const calc=hasNumbers?calcAll(biz,f1040):null
  const recs=calc?buildRecs(biz,calc):[]
  const isPassthru=PASSTHROUGH.includes(biz.entityType)

  const handleSave=()=>{
    const record={id:Date.now(),savedAt:new Date().toLocaleString(),biz:{...biz},f1040:{...f1040},connectedApp,k1Income:calc?.k1||0}
    const updated=[record,...records.filter((_,i)=>i<9)]
    setRecords(updated);localStorage.setItem('ts360_records',JSON.stringify(updated));setSaved(true)
  }

  const loadRecord = (rec) => {
    setLoadedRecord(rec)
    // Restore all 1040 fields from the record
    setF1040({
      filingStatus: rec.filingStatus || 'single',
      w2Income: rec.w2Income || '',
      otherIncome: rec.interest || '',
      estimatedPayments: rec.estPaid || '',
      dependents: rec.dependents || '',
      useStandardDed: !rec.useItemized,
      itemizedDed: rec.itemizedAmt || ''
    })
    // Show the 1040 section automatically
    setShow1040(true)
    // Scroll to the 1040 section
    setTimeout(() => {
      const el = document.getElementById('dash-1040')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }


  const handleConnect=(integ)=>{
    localStorage.setItem('ts360_connected_app',integ.name)
    setConnectedApp(integ.name)
    window.location.href=API+'/auth/'+integ.id+'/connect'
  }

  const inp={width:'100%',padding:'10px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}
  const lbl={display:'block',fontSize:12,fontWeight:700,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em'}
  const NumInput=({k,redBorder=false})=>(<input type="number" value={biz[k]} placeholder="0" onChange={e=>bSet(k,e.target.value)} style={{...inp,borderColor:redBorder?'#FCA5A5':'#E2E8F0',background:redBorder?'#FEF2F2':'#fff'}}/>)
  const AnalysisBadge=({label,value,risk,note})=>(<div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div><div style={{fontSize:12,fontWeight:700,color:SL,marginBottom:2}}>{label}</div><div style={{fontSize:18,fontWeight:800,color:N}}>{value}</div>{note&&<div style={{fontSize:11,color:SL,marginTop:2}}>{note}</div>}</div><RiskBadge level={risk}/></div>)

  return(
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <LOGO/>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          {userName&&<span style={{fontSize:13,color:SL}}>Hi, <strong style={{color:N}}>{userName.split(' ')[0]}</strong></span>}
          <button onClick={()=>{localStorage.removeItem('token');localStorage.removeItem('plan');localStorage.removeItem('billing');nav('/')}} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>Sign Out</button>
        </div>
      </nav>

      {xeroLoading&&<div style={{background:'#EFF6FF',borderBottom:'1px solid #BFDBFE',padding:'12px 28px',fontSize:13,fontWeight:600,color:'#1D4ED8',textAlign:'center'}}>Importing your Xero financials... please wait</div>}
      <div style={{maxWidth:1080,margin:'0 auto',padding:'32px 20px'}}>

        {/* CONNECT */}
        <div style={{marginBottom:16}}><h2 style={{fontSize:17,fontWeight:800,color:N,margin:0}}>Step 1 - Connect Your Accounting Software</h2><p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Connect to automatically import your financials, or enter numbers manually below.</p></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
          {INTEGRATIONS.map(i=>(
            <button key={i.id} onClick={()=>handleConnect(i)} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:connectedApp===i.name?i.color:i.bg,border:'1.5px solid '+(connectedApp===i.name?i.color:i.color+'44'),borderRadius:12,cursor:'pointer'}} onMouseOver={e=>e.currentTarget.style.borderColor=i.color} onMouseOut={e=>e.currentTarget.style.borderColor=connectedApp===i.name?i.color:i.color+'44'}>
              <div style={{width:36,height:36,borderRadius:8,background:connectedApp===i.name?'rgba(255,255,255,0.25)':i.color,color:'#fff',fontWeight:800,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i.abbr}</div>
              <div style={{fontWeight:700,fontSize:13,color:connectedApp===i.name?'#fff':N}}>{i.name}{connectedApp===i.name?' (Connected)':''}</div>
            </button>
          ))}
        </div>
        {connectedApp&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:'10px 16px',marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:600,color:'#166534'}}>{connectedApp} connected</span>
            <button onClick={()=>{setConnectedApp(null);localStorage.removeItem('ts360_connected_app');setBiz({entityType:biz.entityType,year:biz.year,ownershipPct:biz.ownershipPct,grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:''});setSaved(false)}} style={{padding:'5px 14px',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FCA5A5',borderRadius:7,fontWeight:600,fontSize:12,cursor:'pointer'}}>Disconnect</button>
          </div>
        )}
        <div style={{textAlign:'center',marginBottom:8,color:SL,fontSize:13}}>- or -</div>
        <div style={{textAlign:'center',marginBottom:8}}><button onClick={()=>setShowFin(true)} style={{background:'none',border:'none',color:B,fontWeight:700,fontSize:14,cursor:'pointer',textDecoration:'underline'}}>Enter numbers manually</button></div>

        <Divider/>

        {/* FINANCIALS */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div><h2 style={{fontSize:17,fontWeight:800,color:N,margin:0}}>Step 2 - Business Income & Expenses</h2><p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>{connectedApp?'Imported from '+connectedApp+' - review and confirm below.':'Enter your business financials for the tax year.'}</p></div>
          <div style={{display:'flex',gap:10,flexShrink:0}}>
            {connectedApp&&<button style={{padding:'7px 14px',background:'#EFF6FF',color:B,border:'1px solid #BFDBFE',borderRadius:8,fontWeight:600,fontSize:12,cursor:'pointer'}}>Refresh</button>}
            <button onClick={()=>setShowFin(v=>!v)} style={{padding:'7px 14px',background:'#F1F5F9',color:SL,border:'none',borderRadius:8,fontWeight:600,fontSize:12,cursor:'pointer'}}>{showFin?'Collapse':'Expand'} Details</button>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
          <div><label style={lbl}>Tax Year</label><select value={biz.year} onChange={e=>bSet('year',parseInt(e.target.value))} style={inp}>{[2026,2025,2024].map(y=><option key={y}>{y}</option>)}</select></div>
          <div><label style={lbl}>Business Entity Type</label><select value={biz.entityType} onChange={e=>bSet('entityType',e.target.value)} style={inp}>{ENTITY_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>Your Ownership %</label><input type="number" min="1" max="100" value={biz.ownershipPct} onChange={e=>bSet('ownershipPct',e.target.value)} style={inp}/></div>
        </div>

        {showFin&&(
          <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:22,marginBottom:20}}>
            <div style={{marginBottom:18}}>
              <div style={{fontSize:12,fontWeight:700,color:B,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Revenue</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div><label style={lbl}>Gross Revenue / Sales</label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Total revenue before any deductions</div><NumInput k="grossRevenue"/></div>
                <div><label style={lbl}>Cost of Goods Sold (COGS)</label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Direct costs of producing goods or services</div><NumInput k="cogs"/></div>
              </div>
              {hasNumbers&&<div style={{background:'#F8FAFC',borderRadius:8,padding:'10px 14px',marginTop:10,display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:SL}}>Gross Profit</span><span style={{fontWeight:800,color:N,fontSize:15}}>{fmt(calc.gross)}</span></div>}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'#DC2626',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Expenses & Deductions</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div><label style={lbl}>Operating Expenses</label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Rent, utilities, contractors, payroll</div><NumInput k="operatingExpenses"/></div>
                <div><label style={lbl}>Advertising & Marketing</label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Fully deductible business promotion</div><NumInput k="advertising"/></div>
                <div><label style={lbl}>Depreciation</label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Section 179, bonus depreciation, MACRS</div><NumInput k="depreciation"/></div>
                {biz.entityType==='S-Corporation'&&<div><label style={{...lbl,color:'#DC2626'}}>Officer Salary (Required for S-Corp)</label><div style={{fontSize:11,color:'#DC2626',marginBottom:5}}>IRS requires reasonable compensation before distributions</div><NumInput k="officerSalary" redBorder={!parseFloat(biz.officerSalary)&&hasNumbers}/></div>}
                <div><label style={lbl}>Other Deductions</label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Professional fees, insurance, home office</div><NumInput k="otherDeductions"/></div>
              </div>
              {hasNumbers&&<div style={{background:'#F8FAFC',borderRadius:8,padding:'10px 14px',marginTop:14}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13,color:SL}}>Total Deductions</span><span style={{fontWeight:700,color:'#DC2626',fontSize:14}}>({fmt(calc.totalExp)})</span></div><div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:SL,fontWeight:700}}>Net Business Income</span><span style={{fontWeight:800,color:N,fontSize:16}}>{fmt(calc.netBiz)}</span></div></div>}
            </div>
          </div>
        )}

        {/* K-1 + ANALYSIS */}
        {hasNumbers&&calc&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
            <div style={{background:'linear-gradient(135deg,#1E3A5F,#1D4ED8)',borderRadius:14,padding:24,color:'#fff'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#93C5FD',marginBottom:8,letterSpacing:'0.08em'}}>YOUR K-1 INCOME - {biz.ownershipPct}% OWNERSHIP SHARE</div>
              <div style={{fontSize:40,fontWeight:800,marginBottom:8}}>{fmt(calc.k1)}</div>
              <div style={{fontSize:12,color:'#BFDBFE',lineHeight:1.6,marginBottom:16}}>This is your share of business profit flowing to Schedule E on your Form 1040. This is NOT your tax bill - your actual liability depends on your complete personal tax picture below.</div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={handleSave} style={{flex:1,padding:'10px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:8,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>{saved?'Record Saved':'Save Record'}</button>
                {connectedApp&&<button style={{padding:'10px 14px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:8,color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer'}}>Refresh</button>}
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:12}}>INSTANT ANALYSIS</div>
              <AnalysisBadge label="Officer Compensation" value={calc.isSC?(parseFloat(biz.officerSalary)?fmt(biz.officerSalary):'Not Set'):'N/A for this entity'} risk={calc.isSC?(parseFloat(biz.officerSalary)>=calc.recSal?'low':parseFloat(biz.officerSalary)>0?'moderate':'high'):'low'} note={calc.isSC?'IRS recommended: '+fmt(calc.recSal)+'/yr':null}/>
              <AnalysisBadge label="QBI Deduction (20%)" value={calc.isPassthru?fmt(calc.qbi):'Not applicable'} risk={calc.isPassthru?'low':'low'} note={calc.isPassthru?'Reduces your taxable income automatically':null}/>
              <AnalysisBadge label="Depreciation" value={parseFloat(biz.depreciation)?fmt(biz.depreciation):'None recorded'} risk={parseFloat(biz.depreciation)?'low':'moderate'} note="Section 179 / Bonus depreciation available"/>
              <AnalysisBadge label="Advertising Deductions" value={parseFloat(biz.advertising)?fmt(biz.advertising):'None recorded'} risk={parseFloat(biz.advertising)?'low':'moderate'} note="Fully deductible business expense"/>
            </div>
          </div>
        )}

        <Divider/>

        {/* 1040 */}
        <div style={{background:isPassthru?'#FFFBEB':'#F8FAFC',border:'1px solid '+(isPassthru?'#FDE68A':'#E2E8F0'),borderRadius:12,padding:'16px 20px',marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:isPassthru?'#92400E':N,marginBottom:4}}>{isPassthru?'Important: Passthrough entities do not pay tax at the business level.':'Tax Liability Calculator'}</div>
          <div style={{fontSize:13,color:isPassthru?'#92400E':SL,lineHeight:1.6}}>{isPassthru?'Your business profit passes through to your personal Form 1040 - that is where you actually pay taxes. Complete your personal tax information below to see your actual tax liability based on your K-1 income.':'Enter your personal tax information to calculate your total Form 1040 liability.'}</div>
        </div>

        {/* ── Saved Records — Load Button ── */}
        {records.length > 0 && (
          <div style={{marginBottom:20}}>
            <p style={{fontSize:13,fontWeight:700,color:N,marginBottom:10,textTransform:'uppercase',letterSpacing:0.5}}>📂 Saved Records</p>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {records.slice(0,5).map((rec,i) => (
                <button key={rec.id||i} onClick={()=>loadRecord(rec)} style={{
                  display:'flex',justifyContent:'space-between',alignItems:'center',
                  padding:'12px 16px',background:loadedRecord?.id===rec.id?'#EFF6FF':'#F8FAFC',
                  border:'1.5px solid '+(loadedRecord?.id===rec.id?B:'#E2E8F0'),
                  borderRadius:10,cursor:'pointer',textAlign:'left',width:'100%'
                }}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:N}}>
                      {rec.savedAt || 'Saved Record'}
                    </div>
                    <div style={{fontSize:12,color:SL,marginTop:2}}>
                      {rec.filingStatus ? rec.filingStatus.charAt(0).toUpperCase()+rec.filingStatus.slice(1) : 'Single'} • 
                      K-1: ${rec.k1Total?.toLocaleString() || '0'} • 
                      Tax: ${rec.totalTax?.toLocaleString() || '0'}
                    </div>
                  </div>
                  <div style={{fontSize:12,fontWeight:600,color:loadedRecord?.id===rec.id?B:SL,flexShrink:0,marginLeft:12}}>
                    {loadedRecord?.id===rec.id ? '✅ Loaded' : 'Load →'}
                  </div>
                </button>
              ))}
            </div>
            {loadedRecord && (
              <div style={{marginTop:10,padding:'10px 14px',background:'#EFF6FF',borderRadius:8,fontSize:13,color:'#1E40AF',fontWeight:600}}>
                ✅ Record loaded — 1040 inputs restored below. Review and save changes.
              </div>
            )}
          </div>
        )}


        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div><h2 style={{fontSize:17,fontWeight:800,color:N,margin:0}}>Step 3 - Personal Tax Information (Form 1040)</h2><p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Add your personal situation. The K-1 above is already included.</p></div>
          <button onClick={()=>setShow1040(v=>!v)} style={{padding:'9px 18px',background:show1040?B:'#F1F5F9',color:show1040?'#fff':SL,border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',flexShrink:0}}>{show1040?'Collapse 1040':'Enter 1040 Info'}</button>
        </div>

        <div id='dash-1040'/>{show1040&&(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
            <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:22}}>
              <div style={{fontSize:12,fontWeight:700,color:SL,marginBottom:16,textTransform:'uppercase',letterSpacing:'0.06em'}}>Your Personal Tax Info</div>
              <div style={{marginBottom:14}}><label style={lbl}>Filing Status</label><select value={f1040.filingStatus} onChange={e=>fSet('filingStatus',e.target.value)} style={inp}>{Object.entries(FILING).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              {[['W-2 Wages / Salary','w2Income','Salary from employment separate from your business'],['Other Income','otherIncome','Interest, dividends, rental income, capital gains'],['Estimated Tax Payments Made','estimatedPayments','Quarterly payments already submitted to IRS this year'],['Number of Qualifying Children','dependents','Children under 17 qualifying for Child Tax Credit ($2,000/child)']].map(([label,key,hint])=>(
                <div key={key} style={{marginBottom:14}}><label style={lbl}>{label}</label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>{hint}</div><input type="number" value={f1040[key]||''} placeholder="0" onChange={e=>fSet(key,e.target.value)} style={inp}/></div>
              ))}
              <div style={{marginBottom:14}}>
                <label style={lbl}>Deduction Method</label>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>fSet('useStandardDed',true)} style={{flex:1,padding:'9px',background:f1040.useStandardDed?B:'#fff',color:f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Standard ({fmt(STD[f1040.filingStatus]||14600)})</button>
                  <button onClick={()=>fSet('useStandardDed',false)} style={{flex:1,padding:'9px',background:!f1040.useStandardDed?B:'#fff',color:!f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(!f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Itemized</button>
                </div>
                {!f1040.useStandardDed&&<input type="number" placeholder="Total itemized deductions" value={f1040.itemizedDed||''} onChange={e=>fSet('itemizedDed',e.target.value)} style={{...inp,marginTop:8}}/>}
              </div>
            </div>
            <div>
              <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:22,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:SL,marginBottom:14,textTransform:'uppercase',letterSpacing:'0.06em'}}>Form 1040 - Tax Calculation</div>
                {[{l:'K-1 Income (Schedule E, Line 17)',v:calc.k1,c:'#1D4ED8'},{l:'+ W-2 & Other Income',v:calc.w2+calc.otherInc,c:N},...(calc.seDed>0?[{l:'- SE Tax Deduction',v:-calc.seDed,c:'#DC2626'}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',fontSize:13,fontWeight:700}}><span style={{color:N}}>Adjusted Gross Income (AGI)</span><span style={{color:N,fontSize:15}}>{fmt(calc.agi)}</span></div>
                {[{l:'- '+(f1040.useStandardDed?'Standard':'Itemized')+' Deduction',v:-calc.ded,c:'#DC2626'},...(calc.qbi>0?[{l:'- QBI Deduction (Sec. 199A, 20%)',v:-calc.qbi,c:G}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',fontSize:13,fontWeight:700,borderBottom:'2px solid #E2E8F0',marginBottom:8}}><span style={{color:N}}>Taxable Income</span><span style={{color:N,fontSize:15}}>{fmt(calc.taxableInc)}</span></div>
                {[{l:'Income Tax (IRS brackets)',v:calc.incomeTax,c:N},...(calc.seTax>0?[{l:'+ Self-Employment Tax (15.3%)',v:calc.seTax,c:N}]:[]),...(calc.ctc>0?[{l:'- Child Tax Credit',v:-calc.ctc,c:G}]:[]),...(calc.estPay>0?[{l:'- Estimated Payments Made',v:-calc.estPay,c:G}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:v<0?G:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{background:calc.refund>0?'#F0FDF4':'#FEF2F2',border:'2px solid '+(calc.refund>0?'#86EFAC':'#FCA5A5'),borderRadius:12,padding:16,marginTop:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:calc.refund>0?'#166534':'#991B1B',marginBottom:4,letterSpacing:'0.06em'}}>{calc.refund>0?'ESTIMATED REFUND':'ESTIMATED TAX DUE'}</div>
                  <div style={{fontSize:36,fontWeight:800,color:calc.refund>0?G:'#DC2626'}}>{calc.refund>0?fmt(calc.refund):fmt(calc.taxOwed)}</div>
                  <div style={{fontSize:12,color:calc.refund>0?'#166534':'#991B1B',marginTop:4}}>Effective rate: {pct(calc.effRate)} | Quarterly payment: {fmt(calc.quarterly)}</div>
                </div>
              </div>
              {calc.quarterly>0&&(
                <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:SL,marginBottom:12,letterSpacing:'0.06em'}}>QUARTERLY PAYMENT SCHEDULE</div>
                  {[['Q1','April 15'],['Q2','June 15'],['Q3','September 15'],['Q4','January 15']].map(([q,due])=>(
                    <div key={q} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #F8FAFC',fontSize:13}}><div><span style={{fontWeight:700,color:N}}>{q}</span><span style={{color:SL,marginLeft:8}}>Due: {due}</span></div><span style={{fontWeight:800,color:B}}>{fmt(calc.quarterly)}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RECOMMENDATIONS */}
        {show1040&&hasNumbers&&recs.length>0&&(<>
          <Divider/>
          <div style={{marginBottom:16}}><h2 style={{fontSize:17,fontWeight:800,color:N,margin:0}}>Tax Strategy Recommendations</h2><p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Based on your financials and personal tax picture - specific actions you can take now.</p></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {recs.map((r,i)=>{
              const s={danger:{bg:'#FEF2F2',border:'#FCA5A5',tc:'#991B1B'},warning:{bg:'#FFFBEB',border:'#FDE68A',tc:'#92400E'},success:{bg:'#F0FDF4',border:'#86EFAC',tc:'#166534'},info:{bg:'#EFF6FF',border:'#BFDBFE',tc:'#1E40AF'}}[r.type]||{bg:'#F8FAFC',border:'#E2E8F0',tc:SL}
              return(<div key={i} style={{background:s.bg,border:'1px solid '+s.border,borderRadius:12,padding:'14px 16px'}}><div style={{fontWeight:700,fontSize:13,color:s.tc,marginBottom:3}}>{r.title}</div><div style={{fontSize:13,color:s.tc,lineHeight:1.5}}>{r.msg}</div></div>)
            })}
          </div>
        </>)}

        <div style={{height:48}}/>
      </div>
    </div>
  )
}
