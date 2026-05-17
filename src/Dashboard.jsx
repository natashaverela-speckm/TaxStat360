import { useState, useEffect } from 'react' // build v2
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn } from './taxCalc'
import { API_BASE_URL, PASSTHROUGH_ENTITY_TYPES, ENTITY_TYPES, INTEGRATIONS, C_CORP_TAX_RATE, SCORP_REASONABLE_COMP_RATIO_THRESHOLD } from './constants'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G } from './theme'
import { writePersonalContext, readPersonalContext, writeTaxYear, writeStep1State, clearStep1State } from './utils/sessionState.js'
import { parseMoney } from './utils/parseMoney.js'
import { signOut } from './utils/signOut'


// ── Info Tooltip Component ──
function InfoTip({ text })  {
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


// FIX (Issue #56 — entity type normalization): Legacy saved records may contain
// 'S-Corporation' (with hyphen) or other non-canonical variants. The calculator's
// <select> uses strict equality against ENTITY_TYPES which contains 'S Corporation'
// (with space). A mismatch silently falls back to the first dropdown option
// (Sole Proprietor / Single-Member LLC), causing the wrong entity type to appear
// when loading a saved record. This normalizes all legacy variants to canonical form
// before writing to session state so the calculator always receives a valid value.
const normalizeEntityType = (t) => {
  if (!t) return 'S Corporation'
  const s = String(t).trim()
  if (/^s.?corp/i.test(s))            return 'S Corporation'
  if (/^c.?corp/i.test(s))            return 'C Corporation'
  if (/sole|single.?member/i.test(s)) return 'Sole Proprietor / Single-Member LLC'
  if (/partner.*active/i.test(s))     return 'Partnership / MMLLC — Active'
  if (/partner.*passive/i.test(s))    return 'Partnership / MMLLC — Passive'
  if (/partner|mmllc|multi/i.test(s)) return 'Partnership / MMLLC — Passive'
  return s  // return as-is if no legacy match found
}


const FILING={single:'Single',mfj:'Married Filing Jointly',mfs:'Married Filing Separately',hoh:'Head of Household',qss:'Qualifying Surviving Spouse'}

const fmt = n => '$'+Math.abs(parseFloat(n)||0).toLocaleString('en-US',{maximumFractionDigits:0})
const pct = n => (parseFloat(n)||0).toFixed(1)+'%'

// C_CORP_TAX_RATE 21% — IRC §11 post-TCJA (P.L. 115-97).
function calcDashboard(biz, f1040) {
  const rev    = parseFloat(biz.grossRevenue)     || 0
  const cogs   = parseFloat(biz.cogs)             || 0
  const gross  = rev - cogs
  const opExp  = parseFloat(biz.operatingExpenses)|| 0
  const sal    = parseFloat(biz.officerSalary)    || 0
  const dep    = parseFloat(biz.depreciation)     || 0
  const adv    = parseFloat(biz.advertising)      || 0
  const other  = parseFloat(biz.otherDeductions)  || 0
  const totalExp = opExp + sal + dep + adv + other
  const netBiz   = gross - totalExp
  const own      = (parseFloat(biz.ownershipPct) || 100) / 100
  const k1       = Math.round(netBiz * own)

  const fs       = f1040.filingStatus || 'single'
  const year     = parseInt(biz.year) || 2025
  const w2       = parseFloat(f1040.w2Income)          || 0
  const otherInc = parseFloat(f1040.otherIncome)       || 0
  const deps     = parseFloat(f1040.dependents)        || 0
  const estPay   = parseFloat(f1040.estimatedPayments) || 0
  // IMPORTANT — the f1040 state object is keyed as useStandardDed throughout this file:
  //   useState init (line ~239):  { ..., useStandardDed: true, ... }
  //   Standard button:            fSet('useStandardDed', true)
  //   Itemized button:            fSet('useStandardDed', false)
  //   Conditional input display:  !f1040.useStandardDed
  // An earlier commit accidentally changed this read to useStandardDen (non-existent key),
  // making useStd always true (undefined !== false → true → standard deduction locked on).
  // This line correctly reads useStandardDed — the actual key. Ref: code-review finding CR-01.
  const useStd   = f1040.useStandardDed !== false
  const itemized = parseFloat(f1040.itemizedDed)       || 0

  const isCCorp    = biz.entityType === 'C Corporation'
  const isSC       = biz.entityType === 'S Corporation'
  const isPassthru = PASSTHROUGH_ENTITY_TYPES.includes(biz.entityType)

  const baseInput = {
    taxYear: year, status: fs, dependents: deps,
    k1Total: 0, rentalNet: 0, stGain: 0, ltGain: 0,
    intInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0,
    selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0,
    selfEmpRetirement: 0, nolCarryforward: 0, priorYearQBILoss: 0,
    saltAmount: 0, hasISO: false, isoBargainElement: 0,
    isREP: false, unrecap1250: 0, collectiblesGain: 0,
    w2Withheld: 0, estPaid: estPay, ytdFactor: 1,
    useItemized: !useStd, itemizedAmt: itemized,
  }

  if (isCCorp) {
    const corpTax   = Math.round(Math.max(0, netBiz) * C_CORP_TAX_RATE)
    const dividends = parseFloat(biz.ccorpDividends || 0)
    const r = calcTaxReturn({
      ...baseInput,
      entities: [], w2: w2 + sal,
      divInc: dividends, iraIncome: otherInc,
    })
    return {
      rev, cogs, gross, opExp, sal, dep, adv, other, totalExp, netBiz, k1, own,
      corpTax, divTax: r.prefTax, dividends,
      combinedTax: corpTax + r.fedTax,
      agi: r.agi, ded: r.deduction, qbi: 0,
      seTax: 0, seDed: 0,
      taxableInc: r.taxableAfterQBI, incomeTax: r.fedTax, ctc: r.childCredit,
      totalTax: r.totalTax, taxOwed: Math.max(0, r.totalTax - estPay),
      refund: Math.max(0, estPay - r.totalTax),
      effRate: r.agi > 0 ? (r.totalTax / r.agi * 100).toFixed(1) : '0.0',
      quarterly: r.quarterlyRecommended,
      recSal: Math.round(Math.max(0, k1) * 0.35),
      stdDed: r.stdDed, w2, otherInc, estPay, isPassthru, isSC, isCCorp: true,
      // TAX-04-dash: NIIT pass-through — read from calcTaxReturn if available,
      // default to not-applicable until taxCalc.js is updated (fix/tax-engine-accuracy).
      niit: r.niit ?? { applies: false, amount: 0, explanation: '' },
      // TAX-01-dash: Reasonable comp not applicable for C-Corp officers.
      reasonableCompAlert: { triggered: false, ratio: 100, message: '' },
    }
  }

  const entities = isPassthru
    ? [{ type: biz.entityType, k1, own: 100 }]
    : []

  const r = calcTaxReturn({
    ...baseInput,
    entities, w2, k1Total: k1, divInc: 0, iraIncome: otherInc,
  })

  // TAX-01-dash: S-Corp reasonable compensation ratio check.
  // Calculates salary as a percentage of total S-Corp compensation (W-2 + K-1 distributions).
  // Triggers a persistent alert when the ratio falls below the IRS scrutiny threshold.
  // This is a client-side guard; taxCalc.js may also surface this once updated.
  // CR-01 guard: negative salary (e.g., payroll correction entry) is clamped to 0 so it
  // cannot produce a negative ratio that incorrectly fires the alert.
  const reasonableCompAlert = (() => {
    if (!isSC || sal < 0) return { triggered: false, ratio: 100, message: '' }
    const totalComp = sal + Math.max(0, k1)
    if (totalComp < 20000) return { triggered: false, ratio: 100, message: '' }
    const ratio = totalComp > 0 ? sal / totalComp : 1
    const triggered = ratio < SCORP_REASONABLE_COMP_RATIO_THRESHOLD
    return {
      triggered,
      ratio: Math.round(ratio * 100),
      message: `Officer salary (${fmt(sal)}) is ${Math.round(ratio * 100)}% of total S-Corp compensation (salary + K-1). The IRS scrutinizes ratios below 40%. Ref: Rev. Rul. 74-44; Watson v. Commissioner, 668 F.3d 1008.`,
    }
  })()

  return {
    rev, cogs, gross, opExp, sal, dep, adv, other, totalExp, netBiz, k1, own,
    agi: r.agi, ded: r.deduction, qbi: r.qbi, seTax: r.seTax, seDed: r.halfSE,
    taxableInc: r.taxableAfterQBI, incomeTax: r.fedTax, ctc: r.childCredit,
    totalTax: r.totalTax, corpTax: 0, divTax: 0, combinedTax: r.totalTax, dividends: 0,
    taxOwed: Math.max(0, r.totalTax - estPay),
    refund:  Math.max(0, estPay - r.totalTax),
    effRate: r.agi > 0 ? (r.totalTax / r.agi * 100).toFixed(1) : '0.0',
    quarterly: r.quarterlyRecommended,
    recSal: isSC ? Math.round(Math.max(0, k1) * 0.35) : 0,
    stdDed: r.stdDed, w2, otherInc, estPay, isPassthru, isSC, isCCorp: false,
    // TAX-04-dash: NIIT — read from calcTaxReturn result. Defaults to not-applicable
    // until fix/tax-engine-accuracy PR adds §1411 to taxCalc.js.
    niit: r.niit ?? { applies: false, amount: 0, explanation: '' },
    // TAX-01-dash: Computed above; also accepts override from taxCalc.js if available.
    reasonableCompAlert: r.reasonableCompAlert ?? reasonableCompAlert,
  }
}

function buildRecs(biz,calc){
  const recs=[],{k1,recSal,isSC,isCCorp,quarterly,qbi,effRate,corpTax,netBiz,combinedTax}=calc
  const officerSal=parseFloat(biz.officerSalary)||0,grossRev=parseFloat(biz.grossRevenue)||0
  const dep=parseFloat(biz.depreciation)||0,adv=parseFloat(biz.advertising)||0
  if(isCCorp&&corpTax>0) recs.push({type:'danger',title:'C-Corp Double Taxation',msg:'Your corporation owes '+fmt(corpTax)+' in federal corporate tax (21% flat rate on '+fmt(netBiz)+' net profit). Profits distributed as dividends are taxed again on your personal return. Consider an S-Corp election to eliminate entity-level tax.'})
  if(isCCorp&&officerSal===0&&netBiz>20000) recs.push({type:'warning',title:'No Officer Salary Recorded',msg:'C-Corp officers should pay themselves a reasonable W-2 salary. This is deductible to the corporation, reducing your corporate tax.'})
  if(isCCorp&&netBiz>0) recs.push({type:'success',title:'C-Corp Tax Planning Tip',msg:'Consider retaining profits in the corporation rather than distributing as dividends to avoid double taxation. A tax advisor can help model the optimal salary vs. retained earnings strategy.'})
  if(isSC&&officerSal===0&&k1>20000) recs.push({type:'danger',title:'No Officer Compensation',msg:'S-Corp owners must pay themselves a reasonable salary. The IRS considers this a primary audit trigger. Recommended minimum: '+fmt(recSal)+'/yr.'})
  if(isSC&&officerSal>0&&officerSal<recSal&&k1>20000) recs.push({type:'warning',title:'Officer Compensation May Be Too Low',msg:'Your officer salary of '+fmt(officerSal)+' is below the IRS-recommended minimum of '+fmt(recSal)+'. Consider increasing to reduce audit risk.'})
  if(quarterly>500) recs.push({type:'warning',title:'Quarterly Estimated Payments Required',msg:'Pay approximately '+fmt(quarterly)+' per quarter. Due: Apr 15, Jun 15, Sep 15, Jan 15.'})
  if(qbi>0) recs.push({type:'success',title:'QBI Deduction Applied - '+fmt(qbi)+' Saved',msg:'You qualify for the 20% Section 199A deduction, reducing your taxable income by '+fmt(qbi)+'.'})
  if(dep===0&&grossRev>50000) recs.push({type:'info',title:'Review Depreciation Deductions',msg:'No depreciation recorded. Equipment, vehicles, and home office may be deductible under Section 179.'})
  if(adv/grossRev<0.02&&grossRev>100000) recs.push({type:'info',title:'Consider Increasing Advertising Deductions',msg:'Your advertising expenses are low. Legitimate marketing and promotional costs are fully deductible.'})
  if(parseFloat(effRate)>28) recs.push({type:'warning',title:'High Effective Tax Rate ('+pct(effRate)+')',msg:'Consider maximizing retirement contributions: SEP-IRA (up to $70,000) or Solo 401(k) (up to $70,000) for 2025.'})
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
  // NEW-01 fix: saveError replaces alert() for the empty-data validation guard.
  const [saveError,setSaveError]=useState('')
  const dismissDisclaimer=()=>{localStorage.setItem('ts360_disclaimer_seen','1');setShowDisclaimer(false)}
  const userName=localStorage.getItem('userName')||''
  const [biz,setBiz]=useState({entityType:'S Corporation',year:2025,ownershipPct:'100',grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:'',ccorpDividends:''})
  const [f1040,setF1040]=useState({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''})
  const [connectedApp,setConnectedApp]=useState(null)
  const [saved,setSaved]=useState(false)
  const [savedRecordId,setSavedRecordId]=useState(null)
  const [showFin,setShowFin]=useState(true)
  const [show1040,setShow1040]=useState(false)
  const [loadedRecord,setLoadedRecord]=useState(null)
  const navigate = useNavigate()
  const [activeView,setActiveView]=useState('records')
  const [records,setRecords]=useState([])
  // FIX (F-08): warn the user when they click "Personal 1040" without Step 1 data.
  const [showStep1Warning,setShowStep1Warning]=useState(false)
  // NEW-01 fix: delete confirmation state — replaces window.confirm().
  const [pendingDeleteIdx,setPendingDeleteIdx]=useState(null)
  // TAX-01-dash: tracks whether the user has dismissed the reasonable comp alert
  // this session. Alert reappears on next login if the issue is not resolved.
  const [dismissedCompAlert,setDismissedCompAlert]=useState(false)

  const bSet=(k,v)=>{setSaved(false);setBiz(p=>({...p,[k]:v}))}
  const fSet=(k,v)=>{setSaved(false);setF1040(p=>({...p,[k]:v}))}

  const [xeroLoading,setXeroLoading]=useState(false)
  useEffect(()=>{
    const email = localStorage.getItem('ts360_email') || 'default'
    const key = 'ts360_records_' + email
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
    if (email !== 'default' && recs.length > 0) {
      localStorage.setItem(key, JSON.stringify(recs))
      localStorage.setItem('ts360_records', JSON.stringify(recs))
    }
    localStorage.removeItem('ts360_connected_app')
    setConnectedApp(null)
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    const cleanRecs = recs.filter(r => {
      const hasData = r.biz
        ? parseFloat(r.biz?.pnl?.grossRevenue || r.biz?.grossRevenue) > 0
          || parseFloat(r.f1040?.w2Income) > 0
          || parseFloat(r.f1040?.rentalIncome) > 0
          || parseFloat(r.k1Income) > 0
        : parseFloat(r.w2Income) > 0 || parseFloat(r.rentalIncome) > 0 || Math.abs(parseFloat(r.k1Total)) > 0
      if (hasData) return true
      const ageMs = Date.now() - (r.id || 0)
      return ageMs < THIRTY_DAYS_MS
    })
    if (cleanRecs.length !== recs.length) {
      const filteredOut = recs.filter(r => !cleanRecs.find(c => c.id === r.id))
      console.warn('[Dashboard] auto-filtered', recs.length - cleanRecs.length, 'blank record(s). IDs:', filteredOut.map(r => r.id))
      localStorage.setItem(key, JSON.stringify(cleanRecs))
      localStorage.setItem('ts360_records', JSON.stringify(cleanRecs))
    }
    setRecords(cleanRecs)
    if(cleanRecs.length>0){
      const r0=cleanRecs[0]
      if(r0.biz) setBiz(r0.biz)
      const saved1040=r0.biz ? (r0.f1040||{}) : {
        filingStatus:r0.filingStatus||'single',
        w2Income:r0.w2Income||'',
        estPaid:r0.estPaid||'',
        dependents:r0.dependents||'0',
        useItemized:!!r0.useItemized,
        itemizedAmt:r0.itemizedAmt||'',
      }
      setF1040({
        filingStatus:saved1040.filingStatus||'single',
        w2Income:saved1040.w2Income||'',
        otherIncome:saved1040.otherIncome||'',
        estimatedPayments:saved1040.estPaid||'',
        dependents:saved1040.dependents||'',
        useStandardDed:saved1040.useItemized!==undefined?!saved1040.useItemized:true,
        itemizedDed:saved1040.itemizedAmt||''
      })
      setSaved(true)
      setSavedRecordId(cleanRecs[0].id)
      setShowFin(true)
      if(sessionStorage.getItem('ts360_goto_form')==='1'){
        sessionStorage.removeItem('ts360_goto_form')
        navigate('/calculate-tax')
      }
    }
    const params=new URLSearchParams(window.location.search)
    const xeroToken=params.get('xero_token')
    if(xeroToken){
      setConnectedApp('Xero')
      setXeroLoading(true)
      fetch(API_BASE_URL+'/auth/xero/data?token='+xeroToken)
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
    if(!xeroToken){
      const integMap={quickbooks:'QuickBooks',wave:'Wave',freshbooks:'FreshBooks'}
      let foundInteg=false
      for(const [pid,label] of Object.entries(integMap)){
        const tok=localStorage.getItem('ts360_'+pid+'_token')
        const connected=localStorage.getItem('ts360_'+pid+'_connected')
        if(tok&&connected==='true'){
          foundInteg=true
          const extra=localStorage.getItem('ts360_'+pid+'_extra')
          let url=API_BASE_URL+'/auth/'+pid+'/data?token='+encodeURIComponent(tok)
          if(pid==='quickbooks'&&extra) url+='&realm='+encodeURIComponent(extra)
          if(pid==='freshbooks'&&extra) url+='&account='+encodeURIComponent(extra)
          fetch(url)
            .then(r=>r.json())
            .then(data=>{
              if(data&&!data.error&&(data.grossRevenue||data.totalRevenue)){
                const rev=String(Math.round(parseFloat(data.grossRevenue||data.totalRevenue)||0))
                const exp=String(Math.round(parseFloat(data.totalExpenses||data.otherDeductions)||0))
                setBiz(p=>({...p,grossRevenue:rev,operatingExpenses:exp}))
                setShowFin(true)
                setConnectedApp(label)
                localStorage.setItem('ts360_connected_app',label)
              } else {
                ;['token','connected','extra'].forEach(k=>localStorage.removeItem('ts360_'+pid+'_'+k))
                localStorage.removeItem('ts360_connected_app')
                setConnectedApp(null)
              }
            })
            .catch(()=>{
              localStorage.removeItem('ts360_connected_app')
              setConnectedApp(null)
            })
          break
        }
      }
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
        let url=API_BASE_URL+'/auth/'+pid+'/data?token='+encodeURIComponent(tok)
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
        const xeroRefresh=localStorage.getItem('ts360_xero_refresh')
        if(!tok&&xeroRefresh){
          setRefreshing(true)
          fetch(API_BASE_URL+'/auth/xero/refresh?refresh='+encodeURIComponent(xeroRefresh))
            .then(r=>r.json()).then(d=>{
              if(d.access_token){
                localStorage.setItem('ts360_xero_token',d.access_token)
                return fetch(API_BASE_URL+'/auth/xero/data?token='+encodeURIComponent(d.access_token))
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
  const calc=hasNumbers?calcDashboard(biz,f1040):null
  const recs=calc?buildRecs(biz,calc):[]

  // TAX-01-dash / TAX-04-dash / TAX-06-dash: extend safe defaults to include
  // new fields so all display components can reference them without null checks.
  const safeCalc=calc||{
    k1:0,w2:0,otherInc:0,seDed:0,agi:0,ded:0,qbi:0,taxableInc:0,incomeTax:0,
    selfEmpTax:0,childCredit:0,totalTax:0,effectiveRate:0,quarterly:0,balance:0,
    refund:0,isSC:false,isPassthru:false,isCCorp:false,recSal:0,k1Net:0,seTax:0,ctc:0,
    taxOwed:0,effRate:'0.0',stdDed:0,corpTax:0,divTax:0,combinedTax:0,dividends:0,
    niit: { applies: false, amount: 0, explanation: '' },
    reasonableCompAlert: { triggered: false, ratio: 100, message: '' },
  }
  const isPassthru=PASSTHROUGH_ENTITY_TYPES.includes(biz.entityType)

  const handleSave=()=>{
    if(!parseFloat(biz.grossRevenue) && !parseFloat(biz.operatingExpenses) && !parseFloat(f1040.w2Income)){
      setSaveError('Please enter at least your gross revenue or W-2 income before saving a record.')
      setTimeout(() => setSaveError(''), 4000)
      return
    }
    setSaveError('')
    const email=localStorage.getItem('ts360_email')||'default'
    const key='ts360_records_'+email
    const freshRecs=JSON.parse(localStorage.getItem(key)||localStorage.getItem('ts360_records')||'[]')
    let existingId=savedRecordId
    if(!existingId){
      const firstReal=freshRecs.find(r=>
        parseFloat(r.biz?.pnl?.grossRevenue || r.biz?.grossRevenue) > 0
        || parseFloat(r.f1040?.w2Income) > 0
      )
      if(firstReal) existingId=firstReal.id
    }
    const record={
      id:existingId||Date.now(),
      savedAt:new Date().toLocaleString(),
      biz:{...biz},
      f1040:{...f1040},
      connectedApp,
      k1Income:calc?.k1||0,
      quarterly:calc?.quarterly||0,
      totalTax:Math.round(calc?.totalTax||0),
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
    if(rec.biz) {
      const savedPnl = rec.biz.pnl || {}
      setBiz(prev => ({
        ...prev,
        entityType: normalizeEntityType(rec.biz.type || rec.biz.entityType) || prev.entityType,
        ownershipPct: rec.biz.own || rec.biz.ownershipPct || prev.ownershipPct,
        year: rec.taxYear || rec.biz.year || prev.year,
        grossRevenue: savedPnl.grossRevenue != null
          ? String(savedPnl.grossRevenue)
          : rec.biz.grossRevenue != null ? String(rec.biz.grossRevenue) : '',
        operatingExpenses: savedPnl.totalExpenses != null
          ? String(savedPnl.totalExpenses)
          : rec.biz.operatingExpenses != null ? String(rec.biz.operatingExpenses) : '',
        officerSalary: savedPnl.officerSalary != null
          ? String(savedPnl.officerSalary)
          : rec.biz.officerSalary != null ? String(rec.biz.officerSalary) : '',
      }))
    }
    const saved1040 = rec.biz ? (rec.f1040||{}) : {
      filingStatus: rec.filingStatus || 'single',
      w2Income: rec.w2Income || '',
      estPaid: rec.estPaid || '',
      dependents: rec.dependents || '0',
      useItemized: !!rec.useItemized,
      itemizedAmt: rec.itemizedAmt || '',
    }
    const f1040Restored = {
      filingStatus: saved1040.filingStatus || rec.filingStatus || 'single',
      w2Income: saved1040.w2Income || rec.w2Income || '',
      otherIncome: saved1040.otherIncome || rec.otherIncome || '',
      estimatedPayments: saved1040.estPaid || rec.estPaid || '',
      dependents: saved1040.dependents || rec.dependents || '',
      useStandardDed: saved1040.useItemized !== undefined ? !saved1040.useItemized : true,
      itemizedDed: saved1040.itemizedAmt || rec.itemizedAmt || '',
    }
    setF1040(f1040Restored)
    setSaved(false)
    const sourceEntities = Array.isArray(rec.entities) && rec.entities.length > 0
      ? rec.entities
      : (rec.biz ? [rec.biz] : [])
    const restoredEntities = sourceEntities.filter(e => e && e.pnl).map(e => {
      const pnl = e.pnl || {}
      const ownPct = parseInt(e.own) || 100
      const k1 = Math.round((pnl.netProfit || 0) * (ownPct / 100))
        - parseMoney(e.box11_12)
        - parseMoney(e.box12_13)
      return {
        name: e.name,
        type: normalizeEntityType(e.type),
        own: e.own,
        netProfit: pnl.netProfit || 0,
        k1,
        box17K: parseMoney(e.box17K),
        box11_12: parseMoney(e.box11_12),
        box12_13: parseMoney(e.box12_13),
        box17V_wages: parseMoney(e.box17V_wages),
        box17V_ubia: parseMoney(e.box17V_ubia),
        box17V_sstb: !!e.box17V_sstb,
      }
    })
    const entitiesToWrite = restoredEntities.length > 0
      ? restoredEntities
      : rec.biz
        ? (() => {
            const flatBiz = rec.biz
            const rev  = parseFloat(flatBiz.grossRevenue)      || 0
            const cogs = parseFloat(flatBiz.cogs)              || 0
            const opEx = parseFloat(flatBiz.operatingExpenses) || 0
            const sal  = parseFloat(flatBiz.officerSalary)     || 0
            const dep  = parseFloat(flatBiz.depreciation)      || 0
            const adv  = parseFloat(flatBiz.advertising)       || 0
            const oth  = parseFloat(flatBiz.otherDeductions)   || 0
            const netProfit = rev - cogs - opEx - sal - dep - adv - oth
            return [{
              name:     normalizeEntityType(flatBiz.entityType || flatBiz.type) || 'Business',
              type:     normalizeEntityType(flatBiz.entityType || flatBiz.type),
              own:      parseInt(flatBiz.ownershipPct || flatBiz.own) || 100,
              netProfit,
              k1:       parseFloat(rec.k1Income) || Math.round(netProfit * ((parseInt(flatBiz.ownershipPct) || 100) / 100)),
              box17K:   0, box11_12: 0, box12_13: 0,
              box17V_wages: 0, box17V_ubia: 0, box17V_sstb: false,
            }]
          })()
        : []

    const k1TotalRestored = entitiesToWrite.reduce((s, e) => s + (e.k1 || 0), 0)
    const sourceEntitiesNormalized = sourceEntities.map(e =>
      e && e.type ? { ...e, type: normalizeEntityType(e.type) } : e
    )
    writeStep1State({
      entities: entitiesToWrite,
      entitiesRaw: sourceEntitiesNormalized,
      k1Total: k1TotalRestored,
      isCoopPatron: false,
    })
    writePersonalContext({
      filingStatus: f1040Restored.filingStatus,
      w2Income: parseFloat(f1040Restored.w2Income) || 0,
      dependents: parseInt(f1040Restored.dependents) || 0,
      estPaid: parseFloat(f1040Restored.estimatedPayments) || 0,
      useItemized: !f1040Restored.useStandardDed,
      itemizedAmt: parseFloat(f1040Restored.itemizedDed) || 0,
    })
    writeTaxYear(rec.taxYear || rec.biz?.year || 2025)
    nav('/calculate-tax')
  }

  const deleteRecord = (idx) => {
    if (pendingDeleteIdx !== idx) {
      setPendingDeleteIdx(idx)
      setTimeout(() => setPendingDeleteIdx(null), 4000)
      return
    }
    setPendingDeleteIdx(null)
    const email=localStorage.getItem('ts360_email')||'default'
    const key='ts360_records_'+email
    const updated=records.filter((_,j)=>j!==idx)
    setRecords(updated)
    localStorage.setItem(key,JSON.stringify(updated))
    localStorage.setItem('ts360_records',JSON.stringify(updated))
    if(loadedRecord?.id===records[idx]?.id) setLoadedRecord(null)
  }

  const handleConnect=(integ)=>{
    setConnectedApp(integ.name)
    window.location.href=API_BASE_URL+'/auth/'+integ.id+'/connect'
  }

  const inp={width:'100%',padding:'10px 12px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,background:'#fff',boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}
  const lbl={display:'block',fontSize:12,fontWeight:700,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.04em'}
  const NumInput=({k,redBorder=false})=>(<input type="number" defaultValue={biz[k]} placeholder="0" onBlur={e=>{const v=Math.max(0,parseFloat(e.target.value)||0);bSet(k,v);e.target.value=v===0?'0':v;}} onFocus={e=>e.target.select()} style={{...inp,borderColor:redBorder?'#FCA5A5':'#E2E8F0',background:redBorder?'#FEF2F2':'#fff'}}/>)
  const AnalysisBadge=({label,value,risk,note})=>(<div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><div><div style={{fontSize:12,fontWeight:700,color:SL,marginBottom:2}}>{label}</div><div style={{fontSize:18,fontWeight:800,color:N}}>{value}</div>{note&&<div style={{fontSize:11,color:SL,marginTop:2}}>{note}</div>}</div><RiskBadge level={risk}/></div>)

  return(
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {/* ── Nav ── */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <LOGO/>
          <div style={{background:'#F1F5F9',color:'#475569',borderRadius:20,padding:'4px 14px',fontSize:12,fontWeight:700}}>Dashboard</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {userName&&<span style={{fontSize:13,color:SL}}>Hi, <strong style={{color:N}}>{userName.split(' ')[0]}</strong></span>}
          <button onClick={()=>nav('/calculate-tax')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>Calculator</button>
          <button onClick={()=>nav('/ai-analysis')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>AI Analysis</button>
          <button onClick={()=>signOut(nav)} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>Sign Out</button>
          <button onClick={()=>nav('/settings')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>⚙ Settings</button>
        </div>
      </nav>

      {showDisclaimer&&(
        <div style={{background:'#FFFBEB',borderBottom:'2px solid #F59E0B',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
          <div style={{fontSize:13,color:'#92400E',lineHeight:1.5}}>
            <strong>⚠ Estimation Tool Only:</strong> TaxStat360 calculates tax estimates for planning purposes only. This is not professional tax advice. Consult a licensed CPA before filing. <a href="/terms" style={{color:'#92400E',fontWeight:700,textDecoration:'underline'}}>View full disclaimer →</a>
          </div>
          <button onClick={dismissDisclaimer} style={{flexShrink:0,background:'#F59E0B',border:'none',borderRadius:6,padding:'6px 14px',fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer'}}>Got it ✓</button>
        </div>
      )}

      {/* ── View Toggle Tabs ── */}
      <div style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',display:'flex',gap:0}}>
        {[['records','📂 My Records'],...(biz.entityType==='C Corporation'?[]:[['f1040','Personal 1040']])].map(([v,label])=>(
          <button key={v} onClick={()=>{
            if(v==='f1040'){
              if(!calc){
                setShowStep1Warning(true)
                return
              }
              setShowStep1Warning(false)
              writeStep1State({
                entities: [{name:biz.entityType,type:biz.entityType,own:biz.ownershipPct,netProfit:calc?.netBiz||0,k1:calc?.k1||0}],
                k1Total: calc?.k1 || 0,
                isCoopPatron: false,
              })
              writePersonalContext({
                ...readPersonalContext(),
                filingStatus: f1040.filingStatus || 'single',
                w2Income: parseFloat(f1040.w2Income) || 0,
                dependents: parseInt(f1040.dependents) || 0,
                estPaid: parseFloat(f1040.estimatedPayments) || 0,
                useItemized: !f1040.useStandardDed,
                itemizedAmt: parseFloat(f1040.itemizedDed) || 0,
              })
              writeTaxYear(biz.year||2025)
              setActiveView('f1040')
            } else {
              setActiveView(v)
              setShowStep1Warning(false)
            }
          }} style={{
            padding:'12px 20px',background:'none',border:'none',cursor:'pointer',borderBottom:`2px solid ${activeView===v?B:'transparent'}`,
            fontWeight:700,fontSize:13,color:activeView===v?B:SL,transition:'all 0.15s'
          }}>{label}</button>
        ))}
      </div>

      {showStep1Warning&&(
        <div style={{background:'#EFF6FF',borderBottom:'1px solid #BFDBFE',padding:'12px 28px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
          <div style={{fontSize:13,color:'#1E40AF',lineHeight:1.5}}>
            💡 <strong>Complete Step 1 first.</strong> Enter your business revenue in the Tax Calculator before accessing your personal return — your K-1 income needs to flow through first.
          </div>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button onClick={()=>{clearStep1State();setShowStep1Warning(false);nav('/calculate-tax')}} style={{padding:'6px 16px',background:'#2563EB',color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>Go to Step 1 →</button>
            <button onClick={()=>setShowStep1Warning(false)} style={{padding:'6px 12px',background:'#fff',border:'1px solid #BFDBFE',borderRadius:8,fontWeight:600,fontSize:12,cursor:'pointer',color:'#1E40AF'}}>✕</button>
          </div>
        </div>
      )}

      {xeroLoading&&<div style={{background:'#EFF6FF',borderBottom:'1px solid #BFDBFE',padding:'12px 28px',fontSize:13,fontWeight:600,color:'#1D4ED8',textAlign:'center'}}>Importing your Xero financials... please wait</div>}

      {/* ════ RECORDS VIEW ════ */}
      {activeView==='records'&&(
        <div style={{maxWidth:1080,margin:'0 auto',padding:'32px 20px'}}>

          {/* ── TAX-01-dash: S-Corp Reasonable Compensation Alert ──────────────
              Surfaces when officer salary is < 40% of total S-Corp compensation
              (salary + K-1 distributions). Persistent across sessions until dismissed.
              Ref: Rev. Rul. 74-44; Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012).
              ─────────────────────────────────────────────────────────────────── */}
          {calc?.reasonableCompAlert?.triggered && !dismissedCompAlert && (
            <div style={{
              background:'#FEF3C7',border:'1.5px solid #FCD34D',borderRadius:12,
              padding:'16px 20px',marginBottom:24,
              display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16
            }}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:'#92400E',marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
                  <span style={{background:'#FCD34D',color:'#92400E',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:800,letterSpacing:'0.04em'}}>S-CORP ALERT</span>
                  Reasonable Compensation Below IRS Threshold
                </div>
                <div style={{fontSize:13,color:'#78350F',lineHeight:1.6,marginBottom:8}}>
                  {calc.reasonableCompAlert.message}
                </div>
                <div style={{fontSize:12,color:'#92400E',lineHeight:1.5,background:'rgba(146,64,14,0.08)',borderRadius:6,padding:'8px 12px'}}>
                  <strong>Recommended action:</strong> Increase your officer W-2 salary so it represents at least 40% of total S-Corp compensation (salary + distributions) before your next payroll run. This reduces audit exposure. Discuss the appropriate amount with your CPA.
                </div>
              </div>
              <button
                onClick={() => setDismissedCompAlert(true)}
                style={{flexShrink:0,background:'none',border:'1px solid #D97706',borderRadius:6,padding:'5px 12px',fontSize:12,fontWeight:600,color:'#92400E',cursor:'pointer'}}
              >Dismiss</button>
            </div>
          )}

          <div style={{marginBottom:24,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <h2 style={{fontSize:22,fontWeight:800,color:N,margin:0}}>My Saved Records</h2>
              <p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>Click any record to load it into the Tax Calculator.</p>
            </div>
            <button onClick={()=>{
              setBiz({entityType:'S Corporation',year:2025,ownershipPct:'100',grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:'',ccorpDividends:''})
              setF1040({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''})
              setSavedRecordId(null)
              setSaved(false)
              setLoadedRecord(null)
              clearStep1State()
              navigate('/calculate-tax')
            }} style={{padding:'10px 20px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>+ New Calculation</button>
          </div>

          {records.length===0?(
            <div style={{textAlign:'center',padding:'60px 20px',background:'#fff',borderRadius:16,border:'1px solid #E2E8F0'}}>
              <div style={{fontSize:48,marginBottom:16}}>📂</div>
              <h3 style={{color:N,fontWeight:700,fontSize:18,marginBottom:8}}>No saved records yet</h3>
              <p style={{color:SL,fontSize:14,marginBottom:20}}>Complete a tax calculation and hit "Save This Record" to store it here.</p>
              <button onClick={()=>{
              setBiz({entityType:'S Corporation',year:2025,ownershipPct:'100',grossRevenue:'',cogs:'',operatingExpenses:'',officerSalary:'',depreciation:'',advertising:'',otherDeductions:'',ccorpDividends:''})
              setF1040({filingStatus:'single',w2Income:'',otherIncome:'',estimatedPayments:'',dependents:'',useStandardDed:true,itemizedDed:''})
              setSavedRecordId(null)
              setSaved(false)
              setLoadedRecord(null)
              clearStep1State()
              navigate('/calculate-tax')
            }} style={{padding:'10px 24px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:14,cursor:'pointer'}}>Start New Calculation →</button>
            </div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {records.map((rec,i)=>{
                const displayRevenue = rec.biz?.pnl?.grossRevenue ?? rec.biz?.grossRevenue
                const isPendingDelete = pendingDeleteIdx === i
                return (
                <div key={rec.id||i} style={{background:'#fff',border:'1px solid '+(isPendingDelete?'#FCA5A5':'#E2E8F0'),borderRadius:14,padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:15,color:N,marginBottom:6}}>
                      📄 {rec.savedAt||'Saved Record'}
                    </div>
                    <div style={{display:'flex',gap:20,flexWrap:'wrap'}}>
                      <span style={{fontSize:13,color:SL}}>Entity: <strong style={{color:N}}>{rec.biz?.type||rec.biz?.entityType||rec.entityType||'—'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Year: <strong style={{color:N}}>{rec.biz?.year||rec.taxYear||'—'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Revenue: <strong style={{color:displayRevenue&&parseFloat(displayRevenue)>0?N:'#94A3B8'}}>{displayRevenue&&parseFloat(displayRevenue)>0?'$'+parseFloat(displayRevenue).toLocaleString():'No data'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>W-2: <strong style={{color:N}}>{rec.f1040?.w2Income&&parseFloat(rec.f1040.w2Income)>0?'$'+parseFloat(rec.f1040.w2Income).toLocaleString():'—'}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Filing: <strong style={{color:N}}>{(rec.f1040?.filingStatus||rec.filingStatus||'—').toUpperCase()}</strong></span>
                      <span style={{fontSize:13,color:SL}}>Quarterly: <strong style={{color:N}}>${(rec.quarterly||rec.biz?.quarterly||0).toLocaleString()}</strong></span>
                    </div>
                  </div>
                  {parseFloat(rec.totalTax)>0&&(
                    <div style={{flexShrink:0,marginLeft:24,marginRight:8,textAlign:'center',background:'#FEF2F2',border:'1.5px solid #FECACA',borderRadius:12,padding:'10px 18px',minWidth:120}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#991B1B',letterSpacing:'0.5px',marginBottom:3}}>EST. TAX LIABILITY</div>
                      <div style={{fontSize:22,fontWeight:800,color:'#DC2626',lineHeight:1}}>${Math.round(parseFloat(rec.totalTax)).toLocaleString()}</div>
                      {parseFloat(rec.quarterly)>0&&<div style={{fontSize:10,color:'#991B1B',marginTop:3}}>${Math.round(parseFloat(rec.quarterly)).toLocaleString()}/qtr</div>}
                      {/* TAX-06-dash: Federal scope label on every saved record liability badge.
                          fontSize 11 minimum per WCAG 1.4.4 (CR-02). Wording matches 1040 panel. */}
                      <div style={{fontSize:11,color:'#B91C1C',marginTop:5,fontStyle:'italic',letterSpacing:'0.02em'}}>Federal income tax only</div>
                    </div>
                  )}
                  <div style={{display:'flex',gap:8,flexShrink:0,marginLeft:20,alignItems:'center'}}>
                    <button onClick={()=>loadRecord(rec)} style={{
                      padding:'10px 20px',background:'#0D1B3E',color:'#fff',border:'none',
                      borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'
                    }}>Load &amp; Continue →</button>
                    <button
                      onClick={() => deleteRecord(i)}
                      style={{
                        padding:'10px 14px',
                        background: isPendingDelete ? '#FEF2F2' : '#fff',
                        color: isPendingDelete ? '#DC2626' : '#DC2626',
                        border: isPendingDelete ? '1.5px solid #DC2626' : '1.5px solid #FCA5A5',
                        borderRadius:8,fontWeight:700,fontSize:isPendingDelete?11:13,cursor:'pointer',
                        minWidth: isPendingDelete ? 80 : 40,
                        transition: 'all 0.15s',
                      }}
                    >
                      {isPendingDelete ? 'Sure?' : '🗑'}
                    </button>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════ 1040 / PERSONAL VIEW ════ */}
      {activeView==='f1040'&&biz.entityType!=='C Corporation'&&(
      <div style={{maxWidth:1080,margin:'0 auto',padding:'32px 20px'}}>
        <div style={{marginBottom:20,display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>navigate('/calculate-tax')} style={{padding:'8px 16px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:8,fontSize:13,fontWeight:600,color:SL,cursor:'pointer'}}>← Back to Business</button>
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
                <div key={key} style={{marginBottom:14}}><label style={lbl}>{label} <InfoTip text={hint}/></label><input type="number" defaultValue={f1040[key]||''} placeholder="0" onChange={e=>fSet(key,e.target.value)} style={inp}/></div>
              ))}
              <div style={{marginBottom:14}}>
                <label style={lbl}>Deduction Method</label>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>fSet('useStandardDed',true)} style={{flex:1,padding:'9px',background:f1040.useStandardDed?B:'#fff',color:f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Standard ({fmt(safeCalc.stdDed)})</button>
                  <button onClick={()=>fSet('useStandardDed',false)} style={{flex:1,padding:'9px',background:!f1040.useStandardDed?B:'#fff',color:!f1040.useStandardDed?'#fff':SL,border:'1.5px solid '+(!f1040.useStandardDed?B:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Itemized</button>
                </div>
                {!f1040.useStandardDed&&<input type="number" placeholder="Total itemized deductions" defaultValue={f1040.itemizedDed||''} onChange={e=>fSet('itemizedDed',e.target.value)} style={{...inp,marginTop:8}}/>}
              </div>
            </div>
            <div>
              <div style={{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:22,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:SL,marginBottom:14,textTransform:'uppercase',letterSpacing:'0.06em'}}>Form 1040 - Tax Calculation</div>
                {[{l:'K-1 Income (Schedule E, Line 17)',v:safeCalc.k1,c:'#1D4ED8'},{l:'+ W-2 & Other Income',v:safeCalc.w2+safeCalc.otherInc,c:N},...(safeCalc.seDed>0?[{l:'- SE Tax Deduction (§164(f))',v:-safeCalc.seDed,c:'#DC2626'}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',fontSize:13,fontWeight:700}}><span style={{color:N}}>Adjusted Gross Income (AGI)</span><span style={{color:N,fontSize:15}}>{fmt(safeCalc.agi)}</span></div>
                {[{l:'- '+(f1040.useStandardDed?'Standard':'Itemized')+' Deduction',v:-safeCalc.ded,c:'#DC2626'},...(safeCalc.qbi>0?[{l:'- QBI Deduction (Sec. 199A, 20%)',v:-safeCalc.qbi,c:G}]:[])].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',fontSize:13,fontWeight:700,borderBottom:'2px solid #E2E8F0',marginBottom:8}}><span style={{color:N}}>Taxable Income</span><span style={{color:N,fontSize:15}}>{fmt(safeCalc.taxableInc)}</span></div>

                {/* TAX-04-dash: Tax liability line items including NIIT when applicable.
                    NIIT (§1411) applies at 3.8% on net investment income above threshold.
                    The niit field is populated by taxCalc.js once fix/tax-engine-accuracy
                    is merged; until then it defaults to { applies: false, amount: 0 }. */}
                {[
                  {l:'Income Tax (IRS brackets)',v:safeCalc.incomeTax,c:N},
                  ...(safeCalc.seTax>0?[{l:'+ Self-Employment Tax (15.3%)',v:safeCalc.seTax,c:N}]:[]),
                  ...(safeCalc.niit?.applies?[{l:'+ Net Investment Income Tax (NIIT 3.8% §1411)',v:safeCalc.niit.amount,c:N}]:[]),
                  ...(safeCalc.ctc>0?[{l:'- Child Tax Credit',v:-safeCalc.ctc,c:G}]:[]),
                  ...(safeCalc.estPay>0?[{l:'- Estimated Payments Made',v:-safeCalc.estPay,c:G}]:[])
                ].map(({l,v,c})=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}><span style={{color:SL}}>{l}</span><span style={{fontWeight:700,color:v<0?G:c}}>{v<0?'-'+fmt(-v):fmt(v)}</span></div>
                ))}

                <div style={{background:safeCalc.refund>0?'#F0FDF4':'#FEF2F2',border:'2px solid '+(safeCalc.refund>0?'#86EFAC':'#FCA5A5'),borderRadius:12,padding:16,marginTop:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:safeCalc.refund>0?'#166534':'#991B1B',marginBottom:4,letterSpacing:'0.06em'}}>{safeCalc.refund>0?'ESTIMATED REFUND':'ESTIMATED TAX DUE'}</div>
                  <div style={{fontSize:36,fontWeight:800,color:safeCalc.refund>0?G:'#DC2626'}}>{safeCalc.refund>0?fmt(safeCalc.refund):fmt(safeCalc.taxOwed)}</div>
                  <div style={{fontSize:12,color:safeCalc.refund>0?'#166534':'#991B1B',marginTop:4}}>Effective rate: {pct(safeCalc.effRate)} | Quarterly payment: {fmt(safeCalc.quarterly)}</div>
                  {safeCalc.isCCorp&&(
                    <div style={{marginTop:12,padding:'10px 12px',background:'rgba(0,0,0,0.06)',borderRadius:8,borderLeft:'3px solid #3B82F6'}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#1E40AF',marginBottom:6,letterSpacing:'0.05em'}}>C-CORP BREAKDOWN</div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color:'#1E40AF'}}>Corporate Tax (21% IRC §11)</span><span style={{fontWeight:700,color:'#DC2626'}}>{fmt(safeCalc.corpTax)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color:'#1E40AF'}}>Personal Income Tax</span><span style={{fontWeight:700,color:'#DC2626'}}>{fmt(safeCalc.incomeTax)}</span></div>
                      {safeCalc.dividends>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color:'#1E40AF'}}>Dividend Tax (~15%)</span><span style={{fontWeight:700,color:'#DC2626'}}>{fmt(safeCalc.divTax)}</span></div>}
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,paddingTop:6,borderTop:'1px solid rgba(30,64,175,0.2)',marginTop:4}}><span style={{color:'#1E40AF',fontWeight:700}}>Total Tax Burden</span><span style={{fontWeight:800,color:'#DC2626'}}>{fmt(safeCalc.combinedTax)}</span></div>
                    </div>
                  )}
                  <div style={{marginTop:10,padding:'8px 10px',background:'rgba(0,0,0,0.06)',borderRadius:6,borderLeft:'3px solid rgba(0,0,0,0.15)'}}>
                    <div style={{fontSize:11,color:safeCalc.refund>0?'#166534':'#7F1D1D',lineHeight:1.5}}>⚠ Accuracy depends on your inputs. Please review all fields for the most accurate result. This is an estimate — consult a tax professional for filing.</div>
                  </div>
                  {/* TAX-06-dash: Federal income tax only disclaimer — surfaces consistently
                      in the primary result panel so users cannot miss it. */}
                  <div style={{marginTop:8,padding:'7px 10px',background:'rgba(0,0,0,0.04)',borderRadius:6,borderLeft:'3px solid rgba(0,0,0,0.10)'}}>
                    <div style={{fontSize:11,color:safeCalc.refund>0?'#166534':'#7F1D1D',lineHeight:1.4}}>
                      📋 <strong>Federal income tax only.</strong> State and local taxes are not included in this estimate. Add your state's effective rate to your total for a complete liability picture.
                    </div>
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

        <div style={{marginTop:24,padding:'20px 24px',background:'#0D1B3E',borderRadius:14,textAlign:'center'}}>
          <div style={{color:'#fff',fontWeight:700,fontSize:16,marginBottom:6}}>Ready to save your tax snapshot?</div>
          <div style={{color:'#93b4d4',fontSize:13,marginBottom:16}}>Your record will include all business and personal inputs.</div>
          <button onClick={handleSave} style={{padding:'12px 40px',background:saved?'#059669':'#2563EB',color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',transition:'background 0.3s'}}>
            {saved ? '✅ Record Saved!' : '💾 Save This Record'}
          </button>
          {saveError && (
            <div style={{marginTop:10,padding:'8px 16px',background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:8,fontSize:13,color:'#991B1B'}}>
              {saveError}
            </div>
          )}
          {saved && <div style={{color:'#6EE7B7',fontSize:13,marginTop:10}}>Saved! View it in 📂 My Records.</div>}
        </div>

        <div style={{height:48}}/>
      </div>
      )}
    </div>
  )
}
