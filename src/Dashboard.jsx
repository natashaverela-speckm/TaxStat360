import { useState, useEffect } from 'react' // build v2
import { useNavigate } from 'react-router-dom'


// ââ Info Tooltip Component ââ
function InfoTip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 5, verticalAlign: 'middle' }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%', background: '#DBEAFE',
          color: '#2563EB', fontSize: 10, fontWeight: 800, cursor: 'pointer',
          lineHeight: 1, flexShrink: 0, border: '1px solid #93C5FD'
        }}
      >i</span>
      {show && (
        <span style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: '#1E293B', color: '#fff', fontSize: 12, fontWeight: 400, textTransform: 'none', letterSpacing: 'normal',
          padding: '8px 12px', borderRadius: 8, width: 240, lineHeight: 1.5,
          zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          pointerEvents: 'none', whiteSpace: 'normal'
        }}>
          {text}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            borderWidth: 5, borderStyle: 'solid',
            borderColor: '#1E293B transparent transparent transparent'
          }}/>
        </span>
      )}
    </span>
  )
}


const API = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
const N = '#0D1B3E', B = '#2563EB', SL = '#475569', G = '#16A34A'

// âââ IRS Tax Tables by Year âââââââââââââââââââââââââââââââââââââââââââââââââ
// Standard Deductions (IRC Â§63)
const STD_BY_YEAR = {
  2024: { single:14600, mfj:29200, mfs:14600, hoh:21900, qss:29200 },
  2025: { single:15750, mfj:31500, mfs:15750, hoh:23625, qss:31500 },
  2026: { single:16100, mfj:32200, mfs:16100, hoh:24150, qss:32200 },
}

// Tax Brackets (IRC Â§1) â [upperBound, rate]
const BRACKETS_BY_YEAR = {
  2024: {
    single: [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[609350,.35],[Infinity,.37]],
    mfj:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
    mfs:    [[11600,.10],[47150,.12],[100525,.22],[191950,.24],[243725,.32],[365600,.35],[Infinity,.37]],
    hoh:    [[16550,.10],[63100,.12],[100500,.22],[191950,.24],[243700,.32],[609350,.35],[Infinity,.37]],
    qss:    [[23200,.10],[94300,.12],[201050,.22],[383900,.24],[487450,.32],[731200,.35],[Infinity,.37]],
  },
  2025: {
    single: [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]],
    mfj:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
    mfs:    [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[313200,.35],[Infinity,.37]],
    hoh:    [[17000,.10],[64850,.12],[103350,.22],[197300,.24],[250500,.32],[626350,.35],[Infinity,.37]],
    qss:    [[23850,.10],[96950,.12],[206700,.22],[394600,.24],[501050,.32],[751600,.35],[Infinity,.37]],
  },
  2026: {
    single: [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[648750,.35],[Infinity,.37]],
    mfj:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
    mfs:    [[12400,.10],[50000,.12],[106900,.22],[203900,.24],[259350,.32],[388825,.35],[Infinity,.37]],
    hoh:    [[17600,.10],[67050,.12],[106900,.22],[203900,.24],[259300,.32],[648700,.35],[Infinity,.37]],
    qss:    [[24800,.10],[100000,.12],[213800,.22],[407800,.24],[518700,.32],[777650,.35],[Infinity,.37]],
  },
}

// Helper: get std deduction for a given year + filing status
function getStdDed(year, fs) {
  const y = clampYear(year)
  const tbl = STD_BY_YEAR[y] || STD_BY_YEAR[2025]
  return tbl[fs] || tbl.single
}

// Helper: get brackets for a given year + filing status

function clampYear(year) {
  const cy = new Date().getFullYear()
  return Math.min(cy, Math.max(cy - 3, parseInt(year) || cy))
}
function getBrackets(year, fs) {
  const y = clampYear(year)
  const tbl = BRACKETS_BY_YEAR[y] || BRACKETS_BY_YEAR[2025]
  return tbl[fs] || tbl.single
}

// Helper: calculate bracket tax
function calcBracketTax(income, year, fs) {
  let tax = 0, prev = 0
  for (const [cap, rate] of getBrackets(year, fs)) {
    if (income <= prev) break
    tax += (Math.min(income, cap) - prev) * rate
    prev = cap
  }
  return Math.round(tax)
}

// Child Tax Credit (IRC Â§24) by year
const CHILD_TAX_CREDIT_BY_YEAR = {
  2024: { credit: 2000, refundable: 1700, phaseoutSingle: 200000, phaseoutMFJ: 400000 },
  2025: { credit: 2000, refundable: 1800, phaseoutSingle: 200000, phaseoutMFJ: 400000 },
  2026: { credit: 2000, refundable: 1800, phaseoutSingle: 200000, phaseoutMFJ: 400000 },
}

// SE Tax rates (IRC Â§1401) â consistent across years
const SE_RATE = 0.153
const SE_DEDUCTION_RATE = 0.5 // IRC Â§164(f)

// QBI Deduction (IRC Â§199A) â 20% of qualified business income (sunset 2026)
const QBI_RATE = 0.20
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
  const isCCorp=biz.entityType==='C-Corporation'

  // ââ C-Corp: entity-level only â no personal 1040 involvement âââââââââââââ
  if(isCCorp){
    const corpTax=Math.round(Math.max(0,netBiz)*0.21)
    const dividends=parseFloat(biz.ccorpDividends||0)
    const divTax=Math.round(Math.max(0,dividends)*0.15)
    const quarterly=Math.round(corpTax/4)
    const recSal=Math.round(Math.max(0,k1)*0.35)
    return {rev,cogs,gross,opExp,sal,dep,adv,other,totalExp,netBiz,k1,own,
      corpTax,divTax,dividends,combinedTax:corpTax,
      agi:0,ded:0,qbi:0,seTax:0,seDed:0,taxableInc:0,incomeTax:0,ctc:0,
      totalTax:0,taxOwed:0,refund:0,effRate:'0.0',quarterly,recSal,stdDed:0,
      w2,otherInc:0,estPay:0,isPassthru:false,isSC:false,isCCorp:true}
  }

  // ââ Passthrough entities: K-1 flows to personal 1040 âââââââââââââââââââââ
  const seTaxBase=isPassthru&&!isSC?Math.max(0,k1)*0.9235:0
  const seTax=Math.round(seTaxBase*0.153),seDed=Math.round(seTax/2)
  const qbi=isPassthru?Math.round(Math.max(0,k1)*0.20):0
  const agi=Math.max(0,k1+w2+otherInc-seDed)
  const stdDed=getStdDed(parseInt(biz.year)||2025,fs),ded=useStd?stdDed:Math.max(stdDed,itemized)
  const taxableInc=Math.max(0,agi-ded-qbi),incomeTax=calcBracketTax(taxableInc,parseInt(biz.year)||2025,fs)
  const phaseout=fs==='mfj'?400000:200000,ctcReduce=Math.max(0,Math.floor((agi-phaseout)/1000)*50)
  const ctc=Math.max(0,deps*2000-ctcReduce)
  const totalTax=Math.max(0,incomeTax+seTax-ctc)
  const taxOwed=Math.max(0,totalTax-estPay),refund=Math.max(0,estPay-totalTax)
  const effRate=agi>0?(totalTax/agi*100).toFixed(1):'0.0'
  const quarterly=Math.round(Math.max(0,totalTax-estPay)/4)
  const recSal=isSC?Math.round(Math.max(0,k1)*0.35):0
  return {rev,cogs,gross,opExp,sal,dep,adv,other,totalExp,netBiz,k1,own,agi,ded,qbi,seTax,seDed,taxableInc,incomeTax,ctc,totalTax,corpTax:0,divTax:0,combinedTax:totalTax,dividends:0,taxOwed,refund,effRate,quarterly,recSal,stdDed,w2,otherInc,estPay,isPassthru,isSC,isCCorp:false}
}

function buildRecs(biz,calc){
  const recs=[],{k1,recSal,isSC,isCCorp,quarterly,qbi,effRate,corpTax,netBiz,combinedTax}=calc
  const officerSal=parseFloat(biz.officerSalary)||0,grossRev=parseFloat(biz.grossRevenue)||0
  const dep=parseFloat(biz.depreciation)||0,adv=parseFloat(biz.advertising)||0
  // C-Corp specific recommendations
  if(isCCorp&&corpTax>0) recs.push({type:'danger',title:'C-Corp Double Taxation',msg:'Your corporation owes '+fmt(corpTax)+' in federal corporate tax (21% flat rate on '+fmt(netBiz)+' net profit). Profits distributed as dividends are taxed again on your personal return. Consider an S-Corp election to eliminate entity-level tax.'})
  if(isCCorp&&officerSal===0&&netBiz>20000) recs.push({type:'warning',title:'No Officer Salary Recorded',msg:'C-Corp officers should pay themselves a reasonable W-2 salary. This is deductible to the corporation, reducing your corporate tax.'})
  if(isCCorp&&netBiz>0) recs.push({type:'success',title:'C-Corp Tax Planning Tip',msg:'Consider retaining profits in the corporation rather than distributing as dividends to avoid double taxation. A tax advisor can help model the optimal salary vs. retained earnings strategy.'})
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
  const [showDisclaimer,setShowDisclaimer]=useState(()=>!localStorage.getItem('ts360_disclaimer_seen'))
  const [refreshing,setRefreshing]=useState(false)
  const dismissDisclaimer=()=>{localStorage.setItem('ts360_disclaimer_seen','1');setShowDisclaimer(false)}
  const userName=localStorage.getItem('userName')||''
  const [biz,setBiz]=useState({entityType:'S-Corporation',year:2025,ownershipPct:'100',grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:'',ccorpDividends:''})
  const [f1040,setF1040]=useState({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''})
  const [connectedApp,setConnectedApp]=useState(null)
  const [saved,setSaved]=useState(false)
  const [savedRecordId,setSavedRecordId]=useState(null)
  const [showFin,setShowFin]=useState(true)
  const [show1040,setShow1040]=useState(false)
  const [loadedRecord,setLoadedRecord]=useState(null)
  const [activeView,setActiveView]=useState('records')
  const [records,setRecords]=useState([])
  const bSet=(k,v)=>{setSaved(false);setBiz(p=>({...p,[k]:v}))}
  const fSet=(k,v)=>{setSaved(false);setF1040(p=>({...p,[k]:v}))}

  const [xeroLoading,setXeroLoading]=useState(false)
  useEffect(()=>{
    // ts360_connected_app is not trusted â always verify via live token fetch below
    const email = localStorage.getItem('ts360_email') || 'default'
    const key = 'ts360_records_' + email
    // Scan ALL ts360_records_* keys to find records regardless of email state
    const allFound = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('ts360_records')) {
        try {
          const r = JSON.parse(localStorage.getItem(k) || '[]')
          r.forEach(rec => { if (!allFound.find(x => x.id === rec.id)) allFound.push(rec) })
        } catch(e) {}
      }
    }
    const recs = allFound.sort((a,b) => (b.id||0) - (a.id||0))
    // Ensure all found records are stored under the current email key
    if (email !== 'default' && recs.length > 0) {
      localStorage.setItem(key, JSON.stringify(recs))
      localStorage.setItem('ts360_records', JSON.stringify(recs))
    }
    // Clear connected badge â re-verified below via live fetch
    localStorage.removeItem('ts360_connected_app')
    setConnectedApp(null)
    // Remove any blank records (no revenue AND no W-2) that may have been saved previously
    // Keep any record that has real data â biz-based OR flat personal-return format
    const cleanRecs = recs.filter(r => {
      if (r.biz) return parseFloat(r.biz?.grossRevenue) > 0 || parseFloat(r.f1040?.w2Income) > 0 || parseFloat(r.k1Income) > 0
      // flat personal-return records from TaxReturn page â keep if has any income
      return parseFloat(r.w2Income) > 0 || parseFloat(r.rentalIncome) > 0 || Math.abs(parseFloat(r.k1Total)) > 0
    })
    if (cleanRecs.length !== recs.length) {
      // Persist the cleaned list immediately
      localStorage.setItem(key, JSON.stringify(cleanRecs))
      localStorage.setItem('ts360_records', JSON.stringify(cleanRecs))
    }
    setRecords(cleanRecs)
    if(cleanRecs.length>0){
      const r0=cleanRecs[0]
      if(r0.biz) setBiz(r0.biz)
      // Support both record formats
      const saved1040=r0.biz ? (r0.f1040||{}) : {
        filingStatus:r0.filingStatus||'single',
        w2Income:r0.w2Income||'',
        estimatedPayments:r0.estPaid||'',
        dependents:r0.dependents||'0',
        useStandardDed:!r0.useItemized,
        itemizedDed:r0.itemizedAmt||'',
      }
      setF1040({
        filingStatus:saved1040.filingStatus||'single',
        w2Income:saved1040.w2Income||'',
        otherIncome:saved1040.otherIncome||'',
        estimatedPayments:saved1040.estimatedPayments||'',
        dependents:saved1040.dependents||'',
        useStandardDed:saved1040.useStandardDed!==undefined?saved1040.useStandardDed:true,
        itemizedDed:saved1040.itemizedDed||''
      })
      setSaved(true)
      // Bind to the first record with actual data (not a blank duplicate)
      setSavedRecordId(cleanRecs[0].id)
      setShowFin(true)
      // Only auto-navigate to form if explicitly requested (e.g. "Update Data" button)
      if(sessionStorage.getItem('ts360_goto_form')==='1'){
        sessionStorage.removeItem('ts360_goto_form')
        setActiveView('business')
      }
    }
    const params=new URLSearchParams(window.location.search)
    const xeroToken=params.get('xero_token')
    if(xeroToken){
      // verified below
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

    // ââ Auto-verify integration on login âââââââââââââââââââââââââââââââââââââ
    // Always fetch data on mount â only show badge if fetch succeeds with real data
    // If fetch fails or returns no data â clear badge and tokens automatically
    if(!xeroToken){
      const integMap={quickbooks:'QuickBooks',wave:'Wave',freshbooks:'FreshBooks'}
      let foundInteg=false
      for(const [pid,label] of Object.entries(integMap)){
        const tok=localStorage.getItem('ts360_'+pid+'_token')
        const connected=localStorage.getItem('ts360_'+pid+'_connected')
        if(tok&&connected==='true'){
          foundInteg=true
          const extra=localStorage.getItem('ts360_'+pid+'_extra')
          let url='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/'+pid+'/data?token='+encodeURIComponent(tok)
          if(pid==='quickbooks'&&extra) url+='&realm='+encodeURIComponent(extra)
          if(pid==='freshbooks'&&extra) url+='&account='+encodeURIComponent(extra)
          fetch(url)
            .then(r=>r.json())
            .then(data=>{
              if(data&&!data.error&&(data.grossRevenue||data.totalRevenue)){
                // â Success â populate fields and show badge
                const rev=String(Math.round(parseFloat(data.grossRevenue||data.totalRevenue)||0))
                const exp=String(Math.round(parseFloat(data.totalExpenses||data.otherDeductions)||0))
                setBiz(p=>({...p,grossRevenue:rev,operatingExpenses:exp}))
                setShowFin(true)
                setConnectedApp(label)
                localStorage.setItem('ts360_connected_app',label)
              } else {
                // â No data or error â wipe everything, force reconnect
                ;['token','connected','extra'].forEach(k=>localStorage.removeItem('ts360_'+pid+'_'+k))
                localStorage.removeItem('ts360_connected_app')
                setConnectedApp(null)
              }
            })
            .catch(()=>{
              // â Network/server error â clear badge
              localStorage.removeItem('ts360_connected_app')
              setConnectedApp(null)
            })
          break
        }
      }
      // No integration tokens found at all â ensure badge is cleared
      if(!foundInteg){
        localStorage.removeItem('ts360_connected_app')
        setConnectedApp(null)
      }
    }
  },[])

  const refreshData=()=>{
    const integMap={quickbooks:'qb',wave:'wave',freshbooks:'fb'}
    for(const [pid] of Object.entries(integMap)){
      const tok=localStorage.getItem('ts360_'+pid+'_token')
      const connected=localStorage.getItem('ts360_'+pid+'_connected')
      if(tok&&connected==='true'){
        const extra=localStorage.getItem('ts360_'+pid+'_extra')
        let url='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/'+pid+'/data?token='+encodeURIComponent(tok)
        if(pid==='quickbooks'&&extra) url+='&realm='+encodeURIComponent(extra)
        if(pid==='freshbooks'&&extra) url+='&account='+encodeURIComponent(extra)
        setRefreshing(true)
        fetch(url).then(r=>r.json()).then(data=>{
          if(data&&!data.error&&(data.grossRevenue||data.totalRevenue)){
            const rev=String(Math.round(parseFloat(data.grossRevenue||data.totalRevenue)||0))
            const exp=String(Math.round(parseFloat(data.totalExpenses||data.otherDeductions)||0))
            setBiz(p=>({...p,grossRevenue:rev,operatingExpenses:exp}))
            setShowFin(true)
          }
          setRefreshing(false)
        }).catch(()=>setRefreshing(false))
        // Xero needs token refresh first
        const xeroRefresh=localStorage.getItem('ts360_xero_refresh')
        if(!tok&&xeroRefresh){
          setRefreshing(true)
          fetch('https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/xero/refresh?refresh='+encodeURIComponent(xeroRefresh))
            .then(r=>r.json()).then(d=>{
              if(d.access_token){
                localStorage.setItem('ts360_xero_token',d.access_token)
                return fetch('https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/xero/data?token='+encodeURIComponent(d.access_token))
              }
            }).then(r=>r?.json()).then(data=>{
              if(data?.grossRevenue){setBiz(p=>({...p,grossRevenue:String(Math.round(data.grossRevenue)),operatingExpenses:String(Math.round(data.totalExpenses||0))}))}
              setRefreshing(false)
            }).catch(()=>setRefreshing(false))
        }
        break
      }
    }
  }
  const hasNumbers=parseFloat(biz.grossRevenue)>0
  const calc=hasNumbers?calcAll(biz,f1040):null
  const recs=calc?buildRecs(biz,calc):[]
  const safeCalc=calc||{k1:0,w2:0,otherInc:0,seDed:0,agi:0,ded:0,qbi:0,taxableInc:0,incomeTax:0,selfEmpTax:0,childCredit:0,totalTax:0,effectiveRate:0,quarterly:0,balance:0,refund:0,isSC:false,isPassthru:false,recSal:0,k1Net:0}
  const isPassthru=PASSTHROUGH.includes(biz.entityType)

  const handleSave=()=>{
    if(!parseFloat(biz.grossRevenue) && !parseFloat(biz.operatingExpenses) && !parseFloat(f1040.w2Income)){
      alert('Please enter at least your gross revenue or W-2 income before saving a record.')
      return
    }
    const email=localStorage.getItem('ts360_email')||'default'
    const key='ts360_records_'+email
    // Always read fresh from localStorage to avoid stale state
    const freshRecs=JSON.parse(localStorage.getItem(key)||localStorage.getItem('ts360_records')||'[]')
    // Use savedRecordId if set; otherwise find the most recent record with real data
    let existingId=savedRecordId
    if(!existingId){
      const firstReal=freshRecs.find(r=>parseFloat(r.biz?.grossRevenue)>0||parseFloat(r.f1040?.w2Income)>0)
      if(firstReal) existingId=firstReal.id
    }
    const record={
      id:existingId||Date.now(),
      savedAt:new Date().toLocaleString(),
      biz:{...biz},f1040:{...f1040},connectedApp,k1Income:calc?.k1||0
    }
    const updated=existingId
      ? freshRecs.map(r=>r.id===existingId?record:r)
      : [record,...freshRecs.filter((_,i)=>i<9)]
    setSavedRecordId(record.id)
    setRecords(updated)
    localStorage.setItem(key,JSON.stringify(updated))
    localStorage.setItem('ts360_records',JSON.stringify(updated))
    setSaved(true)
  }

  const loadRecord = (rec) => {
    setLoadedRecord(rec)
    setSavedRecordId(rec.id)

    // ââ Restore business state in Dashboard (for inline view) ââââââââââââââ
    if(rec.biz) setBiz(prev => ({...prev, ...rec.biz}))

    // ââ Build the f1040 object from either new or old record format âââââââââ
    const saved1040 = rec.biz ? (rec.f1040||{}) : {
      filingStatus: rec.filingStatus || 'single',
      w2Income: rec.w2Income || '',
      estimatedPayments: rec.estPaid || '',
      dependents: rec.dependents || '0',
      useStandardDed: !rec.useItemized,
      itemizedDed: rec.itemizedAmt || '',
    }
    const f1040Restored = {
      filingStatus: saved1040.filingStatus || rec.filingStatus || 'single',
      w2Income: saved1040.w2Income || rec.w2Income || '',
      otherIncome: saved1040.otherIncome || rec.otherIncome || '',
      estimatedPayments: saved1040.estimatedPayments || rec.estPaid || '',
      dependents: saved1040.dependents || rec.dependents || '',
      useStandardDed: saved1040.useStandardDed !== undefined ? saved1040.useStandardDed : true,
      itemizedDed: saved1040.itemizedDed || rec.itemizedAmt || '',
    }
    setF1040(f1040Restored)
    setSaved(false)

    // ââ Pass record data into the Step 1â2 flow via sessionStorage ââââââââââ
    // so the full TaxReturn page loads with all saved values pre-filled
    const bizData = rec.biz || {}
    const k1Income = rec.k1Income || rec.k1 || 0
    sessionStorage.setItem('ts360_k1', String(k1Income))
    sessionStorage.setItem('ts360_entities', JSON.stringify([{
      name: bizData.entityType || rec.entityType || 'Business',
      type: bizData.entityType || rec.entityType || 'S-Corporation',
      own: bizData.ownershipPct || '100',
      netProfit: parseFloat(bizData.grossRevenue||0) - parseFloat(bizData.operatingExpenses||0),
      k1: k1Income,
    }]))
    sessionStorage.setItem('ts360_f1040', JSON.stringify(f1040Restored))
    sessionStorage.setItem('ts360_taxyear', String(bizData.year || rec.taxYear || 2025))

    // Navigate to Personal Tax Return (Step 2) with all data loaded
    nav('/tax-return')
  }


  const handleConnect=(integ)=>{
    // ts360_connected_app not stored â verified on next load
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
          <button onClick={()=>{{['token','plan','billing','ts360_session','ts360_email','userName','ts360_connected_app','ts360_quickbooks_token','ts360_quickbooks_connected','ts360_quickbooks_extra','ts360_xero_token','ts360_xero_connected','ts360_xero_refresh','ts360_wave_token','ts360_wave_connected','ts360_freshbooks_token','ts360_freshbooks_connected'].forEach(k=>localStorage.removeItem(k));nav('/')}}} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>Sign Out</button>
          <button onClick={()=>nav('/settings')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>â Settings</button>
        </div>
      </nav>
      {showDisclaimer&&(
        <div style={{background:'#FFFBEB',borderBottom:'2px solid #F59E0B',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
          <div style={{fontSize:13,color:'#92400E',lineHeight:1.5}}>
            <strong>â  Estimation Tool Only:</strong> TaxStat360 calculates tax estimates for planning purposes only. This is not professional tax advice. Consult a licensed CPA before filing. <a href="/terms" style={{color:'#92400E',fontWeight:700,textDecoration:'underline'}}>View full disclaimer â</a>
          </div>
          <button onClick={dismissDisclaimer} style={{flexShrink:0,background:'#F59E0B',border:'none',borderRadius:6,padding:'6px 14px',fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer'}}>Got it â</button>
        </div>
      )}
      {/* ââ View Toggle Tabs ââ */}
      <div style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',display:'flex',gap:0}}>
        {[['records','ð My Records'],['business','Business'],...(biz.entityType==='C-Corporation'?[]:[['f1040','Personal 1040']])].map(([v,label])=>(
          <button key={v} onClick={()=>{
            if(v==='f1040'){
              // Navigate to full Tax Return page with k1 data
              sessionStorage.setItem('ts360_k1', String(calc?.k1||0))
              sessionStorage.setItem('ts360_entities', JSON.stringify(
                [{name:biz.entityType,type:biz.entityType,own:biz.ownershipPct,netProfit:calc?.netBiz||0,k1:calc?.k1||0}]
              ))
              sessionStorage.setItem('ts360_f1040', JSON.stringify(f1040))
              sessionStorage.setItem('ts360_taxyear', String(biz.year||2025))
              nav('/tax-return')
            } else {
              setActiveView(v)
            }
          }} style={{
            padding:'12px 20px',background:'none',border:'none',cursor:'pointer',borderBottom:`2px solid ${activeView===v?B:'transparent'}`,
            fontWeight:700,fontSize:13,color:activeView===v?B:SL,cursor:'pointer',transition:'all 0.15s'
          }}>{label}</button>
        ))}
      </div>

      {xeroLoading&&<div style={{background:'#EFF6FF',borderBottom:'1px solid #BFDBFE',padding:'12px 28px',fontSize:13,fontWeight:600,color:'#1D4ED8',textAlign:'center'}}>Importing your Xero financials... please wait</div>}

      {/* ââââ RECORDS VIEW ââââ */}
      {activeView==='records'&&(
        <div style={{maxWidth:1080,margin:'0 auto',padding:'32px 20px'}}>
          <div style={{marginBottom:24,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:800,color:N,margin:0}}>My Saved Records</h2>
              <p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Click any record to load it into the Tax Calculator.</p>
            </div>
            <button onClick={()=>{
              setBiz({entityType:'S-Corporation',year:2025,ownershipPct:'100',grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:'',ccorpDividends:''})
              setF1040({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''})
              setSavedRecordId(null)
              setSaved(false)
              setLoadedRecord(null)
              setActiveView('business')
            }} style={{padding:'10px 20px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>+ New Calculation</button>
          </div>
          {records.length===0?(
            <div style={{textAlign:'center',padding:'60px 20px',background:'#fff',borderRadius:16,border:'1px solid #E2E8F0'}}>
              <div style={{fontSize:48,marginBottom:16}}>ð</div>
              <h3 style={{color:N,fontWeight:700,fontSize:18,marginBottom:8}}>No saved records yet</h3>
              <p style={{color:SL,fontSize:14,marginBottom:20}}>Complete a tax calculation and hit "Save This Record" to store it here.</p>
              <button onClick={()=>{
              setBiz({entityType:'S-Corporation',year:2025,ownershipPct:'100',grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:'',ccorpDividends:''})
              setF1040({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''})
              setSavedRecordId(null)
              setSaved(false)
              setLoadedRecord(null)
              setActiveView('business')
            }} style={{padding:'10px 24px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:14,cursor:'pointer'}}>Start New Calculation â</button>
            </div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {records.map((rec,i)=>(
                <div key={rec.id||i} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:15,color:N,marginBottom:6}}>
                      ð {rec.savedAt||'Saved Record'}
                    </div>
                    <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                      <span style={{fontSize:13,color:SL}}>Entity: <strong style={{color:N}}>{rec.biz?.entityType||rec.entityType||'â'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Year: <strong style={{color:N}}>{rec.biz?.year||rec.taxYear||'â'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Revenue: <strong style={{color:rec.biz?.grossRevenue&&parseFloat(rec.biz.grossRevenue)>0?N:'#94A3B8'}}>{rec.biz?.grossRevenue&&parseFloat(rec.biz.grossRevenue)>0?'$'+parseFloat(rec.biz.grossRevenue).toLocaleString():'No data'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>W-2: <strong style={{color:N}}>{rec.f1040?.w2Income&&parseFloat(rec.f1040.w2Income)>0?'$'+parseFloat(rec.f1040.w2Income).toLocaleString():'â'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Filing: <strong style={{color:N}}>{(rec.f1040?.filingStatus||rec.filingStatus||'â').toUpperCase()}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Quarterly: <strong style={{color:N}}>${(rec.quarterly||rec.biz?.quarterly||0).toLocaleString()}</strong></span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,flexShrink:0,marginLeft:20}}>
                    <button onClick={()=>loadRecord(rec)} style={{
                      padding:'10px 20px',background:'#0D1B3E',color:'#fff',border:'none',
                      borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'
                    }}>Load & Continue â</button>
                    <button onClick={()=>{
                      if(!window.confirm('Delete this record?')) return
                      const email=localStorage.getItem('ts360_email')||'default'
                      const key='ts360_records_'+email
                      const updated=records.filter((_,j)=>j!==i)
                      setRecords(updated)
                      localStorage.setItem(key,JSON.stringify(updated))
                      localStorage.setItem('ts360_records',JSON.stringify(updated))
                      if(loadedRecord?.id===rec.id) setLoadedRecord(null)
                    }} style={{
                      padding:'10px 14px',background:'#fff',color:'#DC2626',
                      border:'1.5px solid #FCA5A5',borderRadius:8,fontWeight:700,
                      fontSize:13,cursor:'pointer'
                    }}>ð</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ââââ CALCULATOR VIEW ââââ */}
      {activeView==='business'&&(
      <div style={{maxWidth:1080,margin:'0 auto',padding:'32px 20px'}}>

        {/* Business view header */}
        <div style={{marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <h2 style={{fontSize:22,fontWeight:800,color:N,margin:0}}>Business Income & Expenses</h2>
            <p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Enter your business financials for the tax year.</p>
          </div>
          <button onClick={()=>setActiveView('records')} style={{padding:'8px 16px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:8,fontSize:13,fontWeight:600,color:SL,cursor:'pointer'}}>â My Records</button>
        </div>

      {/* CONNECT */}
        <div style={{marginBottom:12,padding:'14px 18px',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:12}}>
          <div style={{fontWeight:700,color:N,fontSize:15,marginBottom:4}}>Connect Your Accounting Software</div>
          <p style={{color:SL,fontSize:13,margin:'0 0 12px'}}>Connect QuickBooks, Wave, FreshBooks, or Xero to automatically import your income and expenses. No manual entry needed.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:12}}>
          {INTEGRATIONS.map(i=>(
            <button key={i.id} onClick={()=>handleConnect(i)} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:connectedApp===i.name?i.color:i.bg,border:'1.5px solid '+(connectedApp===i.name?i.color:i.color+'44'),borderRadius:12,cursor:'pointer'}} onMouseOver={e=>e.currentTarget.style.borderColor=i.color} onMouseOut={e=>e.currentTarget.style.borderColor=connectedApp===i.name?i.color:i.color+'44'}>
              <div style={{width:36,height:36,borderRadius:8,background:connectedApp===i.name?'rgba(255,255,255,0.25)':i.color,color:'#fff',fontWeight:800,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i.abbr}</div>
              <div style={{fontWeight:700,fontSize:13,color:connectedApp===i.name?'#fff':N}}>{i.name}{connectedApp===i.name?' (Connected)':''}</div>
            </button>
          ))}
        </div>
        {connectedApp&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:10,padding:'10px 16px',marginTop:10}}>
            <span style={{fontSize:13,fontWeight:600,color:'#166534'}}>â {connectedApp} connected â data imported below</span>
            <button onClick={()=>{setConnectedApp(null);localStorage.removeItem('ts360_connected_app');setBiz({entityType:biz.entityType,year:biz.year,ownershipPct:biz.ownershipPct,grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:''});setSaved(false)}} style={{padding:'5px 14px',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FCA5A5',borderRadius:7,fontWeight:600,fontSize:12,cursor:'pointer'}}>Disconnect</button>
          </div>
        )}
        </div>{/* end connect card */}

        <div style={{display:'flex',alignItems:'center',gap:12,margin:'16px 0 8px',color:SL,fontSize:13}}>
          <div style={{flex:1,height:1,background:'#E2E8F0'}}/>
          <span style={{fontWeight:600}}>Enter manually</span>
          <div style={{flex:1,height:1,background:'#E2E8F0'}}/>
        </div>

        {/* FINANCIALS */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div><p style={{color:SL,fontSize:13,margin:0}}>{connectedApp?'Review imported data from '+connectedApp+' and confirm below.':'Enter your business income and expenses for the tax year.'}</p></div>
          <div style={{display:'flex',gap:10,flexShrink:0}}>
            {connectedApp&&<button onClick={refreshData} style={{padding:'7px 14px',background:'#EFF6FF',color:B,border:'1px solid #BFDBFE',borderRadius:8,fontWeight:600,fontSize:12,cursor:'pointer'}}>{refreshing?'Refreshing...':'â» Refresh Data'}</button>}

          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
          <div><label style={lbl}>Tax Year</label><select value={biz.year} onChange={e=>bSet('year',parseInt(e.target.value))} style={inp}>{[2026,2025,2024].map(y=><option key={y} value={y}>{y}</option>)}</select></div>
          <div><label style={lbl}>Business Entity Type</label><select value={biz.entityType} onChange={e=>{bSet('entityType',e.target.value);if(e.target.value==='C-Corporation'&&activeView==='f1040')setActiveView('business')}} style={inp}>{ENTITY_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label style={lbl}>Your Ownership % <InfoTip text="The percentage of the business you own. For a single-member LLC or sole owner S-Corp this is 100%. Find in your operating agreement or corporate docs if you have partners."/></label><input type="number" min="1" max="100" value={biz.ownershipPct} onChange={e=>bSet('ownershipPct',e.target.value)} style={inp}/></div>
        </div>

        <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:22,marginBottom:20}}>
            <div style={{marginBottom:18}}>
              <div style={{fontSize:12,fontWeight:700,color:B,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Revenue</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div><label style={lbl}>Gross Revenue / Sales <InfoTip text="Find this on your Profit and Loss (PandL) statement, top line. In QuickBooks it's under Reports -> PandL. For cash-basis businesses, use total cash received from customers this year."/></label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Total revenue before any deductions</div><NumInput k="grossRevenue"/></div>
                <div><label style={lbl}>Cost of Goods Sold (COGS) <InfoTip text="Find this on your PandL statement directly below revenue. Includes materials, inventory, and direct production costs. Not all businesses have COGS."/></label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Direct costs of producing goods or services</div><NumInput k="cogs"/></div>
              </div>
              {hasNumbers&&<div style={{background:'#F8FAFC',borderRadius:8,padding:'10px 14px',marginTop:10,display:'flex',justifyContent:'space-between'}}><span style={{fontSize:13,color:SL}}>Gross Profit</span><span style={{fontWeight:800,color:N,fontSize:15}}>{fmt(calc.gross)}</span></div>}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'#DC2626',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Expenses & Deductions</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div><label style={lbl}>Operating Expenses <InfoTip text="All normal business expenses: rent, utilities, payroll, software, insurance. Find on your PandL under 'Total Expenses.' Exclude COGS, depreciation, and officer salary if listed separately."/></label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Rent, utilities, contractors, payroll</div><NumInput k="operatingExpenses"/></div>
                <div><label style={lbl}>Advertising & Marketing <InfoTip text="Total spent on ads, social media, marketing tools, and promotions this year. Find in your bookkeeping under the Advertising or Marketing expense category."/></label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Fully deductible business promotion</div><NumInput k="advertising"/></div>
                <div><label style={lbl}>Depreciation <InfoTip text="Find on your Depreciation Schedule (Form 4562) or ask your bookkeeper. This is the annual write-down on equipment, vehicles, and property â not a cash expense."/></label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Section 179, bonus depreciation, MACRS</div><NumInput k="depreciation"/></div>
                {biz.entityType==='S-Corporation'&&<div><label style={{...lbl,color:'#DC2626'}}>Officer Salary (Required for S-Corp) <InfoTip text="Your W-2 salary paid to yourself as S-Corp officer. Find on your W-2 Box 1, or payroll records. The IRS requires a 'reasonable compensation' before taking distributions."/></label><div style={{fontSize:11,color:'#DC2626',marginBottom:5}}>IRS requires reasonable compensation before distributions</div><NumInput k="officerSalary" redBorder={!parseFloat(biz.officerSalary)&&hasNumbers}/></div>}
                <div><label style={lbl}>Other Deductions <InfoTip text="Any deductible business expenses not captured above: professional fees, education, business travel, subscriptions, home office, etc. Find in your PandL under miscellaneous or other expenses."/></label><div style={{fontSize:11,color:'#94A3B8',marginBottom:5}}>Professional fees, insurance, home office</div><NumInput k="otherDeductions"/></div>
              </div>
              {biz.entityType==='C-Corporation'&&(
                <div style={{marginTop:16,padding:'14px 16px',background:'#EFF6FF',borderRadius:10,border:'1px solid #BFDBFE'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#1D4ED8',marginBottom:8,letterSpacing:'0.06em'}}>C-CORPORATION â ENTITY LEVEL TAX</div>
                  <div style={{fontSize:12,color:'#1E40AF',marginBottom:14,lineHeight:1.6}}>
                    C-Corps pay a flat <strong>21% federal corporate tax</strong> on net profit (IRC Â§11). Your personal return only includes your W-2 salary and any dividends distributed to you. If you receive dividends from the corporation, enter them below.
                  </div>
                  <div><label style={lbl}>Dividends Distributed to You <InfoTip text="If the corporation pays you dividends from retained earnings, enter the total here. Qualified dividends are taxed at 0%, 15%, or 20% on your personal return (not at ordinary income rates). This is separate from your W-2 salary. Enter $0 if no dividends were paid out to you this year."/></label>
                  <NumInput k="ccorpDividends"/></div>
                </div>
              )}
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
                {biz.entityType!=='C-Corporation'&&<button onClick={()=>{
                  // Pass K-1 and entity data to Tax Return page via sessionStorage
                  sessionStorage.setItem('ts360_k1', String(safeCalc.k1||0))
                  sessionStorage.setItem('ts360_entities', JSON.stringify(
                    [{name:biz.entityType,type:biz.entityType,own:biz.ownershipPct,netProfit:safeCalc.netBiz||0,k1:safeCalc.k1||0}]
                  ))
                  sessionStorage.setItem('ts360_f1040', JSON.stringify(f1040))
                  sessionStorage.setItem('ts360_taxyear', String(biz.year||2025))
                  nav('/tax-return')
                }} style={{flex:1,padding:'10px',background:'#2563EB',border:'none',borderRadius:8,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>Continue to Personal Tax Return â</button>}

                {connectedApp&&<button style={{padding:'10px 14px',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:8,color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer'}}>Refresh</button>}
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.08em',marginBottom:12}}>INSTANT ANALYSIS</div>
              <AnalysisBadge label="Officer Compensation" value={calc.isSC?(parseFloat(biz.officerSalary)?fmt(biz.officerSalary):'Not Set'):calc.isCCorp?(parseFloat(biz.officerSalary)?fmt(biz.officerSalary)+' (deductible)':'Not Set'):'N/A for this entity'} risk={calc.isSC?(parseFloat(biz.officerSalary)>=calc.recSal?'low':parseFloat(biz.officerSalary)>0?'moderate':'high'):calc.isCCorp?(parseFloat(biz.officerSalary)>0?'low':'moderate'):'low'} note={calc.isSC?'IRS recommended: '+fmt(calc.recSal)+'/yr':null}/>
              <AnalysisBadge label="QBI Deduction (20%)" value={calc.isPassthru?fmt(calc.qbi):'Not applicable'} risk={calc.isPassthru?'low':'low'} note={calc.isPassthru?'Reduces your taxable income automatically':null}/>
              <AnalysisBadge label="Depreciation" value={parseFloat(biz.depreciation)?fmt(biz.depreciation):'None recorded'} risk={parseFloat(biz.depreciation)?'low':'moderate'} note="Section 179 / Bonus depreciation available"/>
              <AnalysisBadge label="Advertising Deductions" value={parseFloat(biz.advertising)?fmt(biz.advertising):'None recorded'} risk={parseFloat(biz.advertising)?'low':'moderate'} note="Fully deductible business expense"/>
            </div>
          </div>
        )}

        <Divider/>

        {/* CTA â Continue to Personal Tax Return */}
        <div style={{background:isPassthru?'#FFFBEB':'#EFF6FF',border:'1px solid '+(isPassthru?'#FDE68A':'#BFDBFE'),borderRadius:12,padding:'20px 24px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:14,fontWeight:700,color:isPassthru?'#92400E':'#1E40AF',marginBottom:4}}>
              {isPassthru?'Step 2 â Enter Your Personal Tax Return':'Calculate Your Complete Tax Liability'}
            </div>
            <div style={{fontSize:13,color:isPassthru?'#A16207':SL,lineHeight:1.5}}>
              {isPassthru?'Your K-1 passes through to your personal Form 1040. Continue to Step 2 to see your complete federal tax liability â W-2, rental income, capital gains, and more.':'Enter your personal tax information to calculate your total Form 1040 liability.'}
            </div>
          </div>
          <button onClick={()=>{
            sessionStorage.setItem('ts360_k1', String(safeCalc.k1||0))
            sessionStorage.setItem('ts360_entities', JSON.stringify(
              [{name:biz.entityType,type:biz.entityType,own:biz.ownershipPct,netProfit:safeCalc.netBiz||0,k1:safeCalc.k1||0}]
            ))
            sessionStorage.setItem('ts360_f1040', JSON.stringify(f1040))
            sessionStorage.setItem('ts360_taxyear', String(biz.year||2025))
            nav('/tax-return')
          }} style={{flexShrink:0,padding:'12px 28px',background:isPassthru?'#D97706':'#2563EB',border:'none',borderRadius:10,color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',whiteSpace:'nowrap'}}>
            Continue to Personal Tax Return â
          </button>
        </div>

      </div>
      )}

      {/* ââââ 1040 / PERSONAL VIEW ââââ */}
      {activeView==='f1040'&&biz.entityType!=='C-Corporation'&&(
      <div style={{maxWidth:1080,margin:'0 auto',padding:'32px 20px'}}>
        {/* Back to Business button */}
        <div style={{marginBottom:20,display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setActiveView('business')} style={{padding:'8px 16px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:8,fontSize:13,fontWeight:600,color:SL,cursor:'pointer'}}>â Back to Business</button>
          <div style={{fontSize:13,color:SL}}>Complete your personal tax information to see your full Form 1040 liability.</div>
        </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
            <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:22}}>
              <div style={{fontSize:12,fontWeight:700,color:SL,marginBottom:16,textTransform:'uppercase',letterSpacing:'0.06em'}}>Your Personal Tax Info</div>
              <div style={{marginBottom:14}}><label style={lbl}>Filing Status <InfoTip text="Your IRS filing status. Single = unmarried. MFJ = Married Filing Jointly (combined with spouse). MFS = Married Filing Separately. HOH = Head of Household (single with dependents)."/></label><select value={f1040.filingStatus} onChange={e=>fSet('filingStatus',e.target.value)} style={inp}>{Object.entries(FILING).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
              {[
                ['W-2 Wages / Salary','w2Income','Find on your W-2 Box 1 (Wages, tips, other compensation) or your last paystub Gross Earnings YTD.'],
                ['Other Income','otherIncome','Any additional income: freelance, 1099, alimony, gambling, etc. Find on your 1099 forms or bank statements.'],
                ['Estimated Tax Payments Made','estimatedPayments','Total quarterly payments sent to the IRS this year. Find on IRS.gov My Account, or your bank records for payments to the IRS.'],
                ['Number of Qualifying Children','dependents','Children under 17 who qualify for the Child Tax Credit ($2,000/child). Count only dependents you are claiming this year.']
              ].map(([label,key,hint])=>(
                <div key={key} style={{marginBottom:14}}><label style={lbl}>{label} <InfoTip text={hint}/></label><input type="number" value={f1040[key]||''} placeholder="0" onChange={e=>fSet(key,e.target.value)} style={inp}/></div>
              ))}
              <div style={{marginBottom:14}}>
                <label style={lbl}>Deduction Method</label>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>fSet('useStandardDed',true)} style={{flex:1,padding:'9px',background:f1040.useStandardDed?B:'#fff',color:f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Standard ({fmt(getStdDed(parseInt(biz.year)||2025,f1040.filingStatus))})</button>
                  <button onClick={()=>fSet('useStandardDed',false)} style={{flex:1,padding:'9px',background:!f1040.useStandardDed?B:'#fff',color:!f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(!f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Itemized</button>
                </div>
                {!f1040.useStandardDed&&<input type="number" placeholder="Total itemized deductions" value={f1040.itemizedDed||''} onChange={e=>fSet('itemizedDed',e.target.value)} style={{...inp,marginTop:8}}/>}
              </div>
            </div>
            <div>
              <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:22,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:SL,marginBottom:14,textTransform:'uppercase',letterSpacing:'0.06em'}}>Form 1040 - Tax Calculation</div>
                {[{l:'K-1 Income (Schedule E, Line 17)',v:safeCalc.k1,c:'#1D4ED8'},{l:'+ W-2 & Other Income',v:safeCalc.w2+safeCalc.otherInc,c:N},...(safeCalc.seDed>0?[{l:'- SE Tax Deduction',v:-safeCalc.seDed,c:'#DC2626'}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',fontSize:13,fontWeight:700}}><span style={{color:N}}>Adjusted Gross Income (AGI)</span><span style={{color:N,fontSize:15}}>{fmt(safeCalc.agi)}</span></div>
                {[{l:'- '+(f1040.useStandardDed?'Standard':'Itemized')+' Deduction',v:-safeCalc.ded,c:'#DC2626'},...(safeCalc.qbi>0?[{l:'- QBI Deduction (Sec. 199A, 20%)',v:-safeCalc.qbi,c:G}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',fontSize:13,fontWeight:700,borderBottom:'2px solid #E2E8F0',marginBottom:8}}><span style={{color:N}}>Taxable Income</span><span style={{color:N,fontSize:15}}>{fmt(safeCalc.taxableInc)}</span></div>
                {[{l:'Income Tax (IRS brackets)',v:safeCalc.incomeTax,c:N},...(safeCalc.seTax>0?[{l:'+ Self-Employment Tax (15.3%)',v:safeCalc.seTax,c:N}]:[]),...(safeCalc.ctc>0?[{l:'- Child Tax Credit',v:-safeCalc.ctc,c:G}]:[]),...(safeCalc.estPay>0?[{l:'- Estimated Payments Made',v:-safeCalc.estPay,c:G}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:v<0?G:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{background:safeCalc.refund>0?'#F0FDF4':'#FEF2F2',border:'2px solid '+(safeCalc.refund>0?'#86EFAC':'#FCA5A5'),borderRadius:12,padding:16,marginTop:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:safeCalc.refund>0?'#166534':'#991B1B',marginBottom:4,letterSpacing:'0.06em'}}>{safeCalc.refund>0?'ESTIMATED REFUND':'ESTIMATED TAX DUE'}</div>
                  <div style={{fontSize:36,fontWeight:800,color:safeCalc.refund>0?G:'#DC2626'}}>{safeCalc.refund>0?fmt(safeCalc.refund):fmt(safeCalc.taxOwed)}</div>
                  <div style={{fontSize:12,color:safeCalc.refund>0?'#166534':'#991B1B',marginTop:4}}>Effective rate: {pct(safeCalc.effRate)} | Quarterly payment: {fmt(safeCalc.quarterly)}</div>
                  {safeCalc.isCCorp&&(
                    <div style={{marginTop:12,padding:'10px 12px',background:'rgba(0,0,0,0.06)',borderRadius:8,borderLeft:'3px solid #3B82F6'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#1E40AF',marginBottom:6,letterSpacing:'0.05em'}}>C-CORP BREAKDOWN</div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color:'#1E40AF'}}>Corporate Tax (21% IRC Â§11)</span><span style={{fontWeight:700,color:'#DC2626'}}>{fmt(safeCalc.corpTax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color:'#1E40AF'}}>Personal Income Tax</span><span style={{fontWeight:700,color:'#DC2626'}}>{fmt(safeCalc.incomeTax)}</span></div>
                      {safeCalc.dividends>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color:'#1E40AF'}}>Dividend Tax (~15%)</span><span style={{fontWeight:700,color:'#DC2626'}}>{fmt(safeCalc.divTax)}</span></div>}
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,paddingTop:6,borderTop:'1px solid rgba(30,64,175,0.2)',marginTop:4}}><span style={{color:'#1E40AF',fontWeight:700}}>Total Tax Burden</span><span style={{fontWeight:800,color:'#DC2626'}}>{fmt(safeCalc.combinedTax)}</span></div>
                    </div>
                  )}
                  <div style={{marginTop:10,padding:'8px 10px',background:'rgba(0,0,0,0.06)',borderRadius:6,borderLeft:'3px solid rgba(0,0,0,0.15)'}}>
                    <div style={{fontSize:11,color:safeCalc.refund>0?'#166534':'#7F1D1D',lineHeight:1.5}}>â  Accuracy depends on your inputs. Please review all fields for the most accurate result. This is an estimate â consult a tax professional for filing.</div>
                  </div>
                </div>
              </div>
              {safeCalc.quarterly>0&&(
                <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:20}}>
                  <div style={{fontSize:11,fontWeight:700,color:SL,marginBottom:12,letterSpacing:'0.06em'}}>QUARTERLY PAYMENT SCHEDULE</div>
                  {[['Q1','April 15'],['Q2','June 15'],['Q3','September 15'],['Q4','January 15']].map(([q,due])=>(
                    <div key={q} style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid #F8FAFC',fontSize:13}}><div><span style={{fontWeight:700,color:N}}>{q}</span><span style={{color:SL,marginLeft:8}}>Due: {due}</span></div><span style={{fontWeight:800,color:B}}>{fmt(safeCalc.quarterly)}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>

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

        {/* Save Record CTA */}
        <div style={{marginTop:24,padding:'20px 24px',background:'#0D1B3E',borderRadius:14,textAlign:'center'}}>
          <div style={{color:'#fff',fontWeight:700,fontSize:16,marginBottom:6}}>Ready to save your tax snapshot?</div>
          <div style={{color:'#93b4d4',fontSize:13,marginBottom:16}}>Your record will include all business and personal inputs.</div>
          <button onClick={handleSave} style={{padding:'12px 40px',background:saved?'#059669':'#2563EB',color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',transition:'background 0.3s'}}>
            {saved ? 'â Record Saved!' : 'ð¾ Save This Record'}
          </button>
          {saved && <div style={{color:'#6EE7B7',fontSize:13,marginTop:10}}>Saved! View it in ð My Records.</div>}
        </div>

        <div style={{height:48}}/>
      </div>
      )}
    </div>
  )
}
