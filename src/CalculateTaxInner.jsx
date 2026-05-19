import React from 'react'
import EntityCompareModal from './EntityCompareModal'
import { useNavigate } from 'react-router-dom'
import MoneyInput from './components/MoneyInput.jsx'
import DismissibleNotice from './components/DismissibleNotice'
import { parseMoney } from './utils/parseMoney.js'

import { API_BASE_URL, INTEGRATIONS, ENTITY_TYPES } from './constants.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R } from './theme.js'
import { writeStep1State, readPersonalContext, readIsCoopPatron, writeIsCoopPatron, readStep1StateRaw, readTaxYear } from './utils/sessionState.js'
// FIX (dead-imports): calcFederalTax, calcQBI, and getStdDed were imported but never
// called in this file. All tax calculation happens in TaxReturn.jsx (Step 2).
// CalculateTaxInner.jsx is Step 1 only — entity data collection and P&L entry.
// Removed to keep the import surface accurate and avoid misleading future readers
// into thinking this file computes income tax.
import { signOut } from './utils/signOut'

const fmt=n=>n<0?'($'+Math.abs(Math.round(n)||0).toLocaleString('en-US')+')':'$'+Math.abs(Math.round(n)||0).toLocaleString('en-US')
function InfoTip({ text, below }) { const [s, ss] = React.useState(false); const popupPos = below ? {top:'120%',right:0} : {bottom:'120%',left:'50%',transform:'translateX(-50%)'}; return (<span style={{position:'relative',display:'inline-flex',alignItems:'center',marginLeft:5}}><span onMouseEnter={()=>ss(true)} onMouseLeave={()=>ss(false)} onClick={()=>ss(v=>!v)} style={{width:16,height:16,borderRadius:'50%',background:'#DBEAFE',color:'#2563EB',fontSize:10,fontWeight:800,cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',border:'1px solid #93C5FD'}}>i</span>{s && <span style={{position:'absolute',...popupPos,background:'#1E293B',color:'#fff',fontSize:12,padding:'8px 12px',borderRadius:8,width:240,lineHeight:1.5,zIndex:999,pointerEvents:'none'}}>{text}</span>}</span>) }
const OWN_PRESETS=[100,75,50,33,25]
const INTS=INTEGRATIONS
const COLORS=['#2563EB','#16a34a','#A855F7','#F59E0B','#EC4899','#06B6D4']
const TEMPLATES=[
{label:'S-Corp Owner',icon:'🏢',type:'S Corporation',own:'100',defaults:{grossRevenue:'250000',operatingExpenses:'80000'},desc:'Owner-operator, reasonable salary set'},
{label:'Real Estate LLC',icon:'🏠',type:'Partnership / MMLLC — Passive',own:'50',defaults:{grossRevenue:'120000',operatingExpenses:'60000'},desc:'Rental income, 50/50 partnership'},
{label:'Solo Consultant',icon:'💼',type:'Sole Proprietor / Single-Member LLC',own:'100',defaults:{grossRevenue:'150000',operatingExpenses:'30000'},desc:'Freelance / independent contractor'},
{label:'Multi-Member LLC',icon:'🤝',type:'Partnership / MMLLC — Passive',own:'33',defaults:{grossRevenue:'500000',operatingExpenses:'200000'},desc:'3-partner LLC, equal ownership'},
{label:'C Corporation',icon:'🏦',type:'C Corporation',own:'100',defaults:{grossRevenue:'1000000',operatingExpenses:'600000'},desc:'Corporate entity, retained earnings'},
{label:'Blank Entity',icon:'➕',type:'S Corporation',own:'100',defaults:{},desc:'Start from scratch'},
]

function exportEntitiesToCSV(entities){
const rows=[['Name','Entity Type','EIN','Formation Date','Ownership %','Gross Revenue','Total Expenses','Net Profit (Loss)','K-1 Share']]
entities.forEach(ent=>{
const k1=ent.pnl&&ent.type!=='C Corporation'?Math.round(ent.pnl.netProfit*((parseFloat(ent.own)||100)/100)):''
rows.push([ent.name,ent.type,ent.ein||'',ent.formationDate||'',ent.own+'%',ent.pnl?Math.round(ent.pnl.grossRevenue):'',ent.pnl?Math.round(ent.pnl.totalExpenses):'',ent.pnl?Math.round(ent.pnl.netProfit):'',k1])
})
const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n')
const blob=new Blob([csv],{type:'text/csv'})
const url=URL.createObjectURL(blob)
const a=document.createElement('a');a.href=url;a.download='taxstat360-entities.csv';a.click()
URL.revokeObjectURL(url)
}

function parseCSVImport(text){
const lines=text.trim().split('\n').slice(1)
return lines.map((line,i)=>{
const cols=line.split(',').map(c=>c.replace(/^"|"$/g,'').replace(/""/g,'"').trim())
const[name,type,ein,formationDate,own,grossRevenue,totalExpenses]=cols
const rev=parseMoney(grossRevenue),exp=parseMoney(totalExpenses)
const ownPct=own?own.replace('%',''):'100'
return{name:name||'Business '+(i+1),type:ENTITY_TYPES.includes(type)?type:'S Corporation',ein:ein||'',state:'',formationDate:formationDate||'',own:ownPct,pnl:(rev||exp)?{grossRevenue:rev,totalExpenses:exp,netProfit:rev-exp,categories:{}}:null,connectedId:null,isManual:!!(rev||exp)}
}).filter(e=>e.name)
}

function ExpenseBreakdown({categories,total}){
const[open,setOpen]=React.useState(false)
return(
<div style={{marginTop:12}}>
<button onClick={()=>setOpen(!open)} style={{background:'none',border:'none',fontSize:11,fontWeight:700,color:SL,cursor:'pointer',letterSpacing:'1px',display:'flex',alignItems:'center',gap:6}}>
{open?'▼':'►'} EXPENSE BREAKDOWN ({Object.keys(categories).length} categories)
</button>
{open&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginTop:10}}>
{Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
<div key={cat} style={{background:'#F8FAFC',borderRadius:7,padding:'7px 10px',display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #F1F5F9'}}>
<div><div style={{fontSize:11,fontWeight:600,color:N}}>{cat}</div><div style={{fontSize:10,color:SL}}>{total>0?Math.round((amt/total)*100)+'%':''}</div></div>
<div style={{fontSize:11,fontWeight:700,color:R}}>${Math.round(amt).toLocaleString()}</div>
</div>
))}
</div>}
</div>
)
}

// ── F-H23: Reasonable Compensation Indicator ──────────────────────────────────
// TC-03: Reframed from "IRS benchmark" to practitioner recommendation.
// Tax practitioners commonly recommend a salary-to-total-compensation ratio of
// 35–45%, based on case law including Watson v. Commissioner, 668 F.3d 1008
// (8th Cir. 2012). The IRS applies a facts-and-circumstances test — there is
// no published safe harbor percentage. Rev. Rul. 74-44; IRC §162.
// Level:  'none'   — no salary entered (only shown if netProfit > $20K)
//         'low'    — salary < 35% of net profit (and net profit > $30K)
//         'ok'     — salary >= 35% of net profit
function ReasonableCompIndicator({ officerSalary, netProfit, entityType }) {
  const isCorp = ['S Corporation', 'C Corporation'].includes(entityType)
  if (!isCorp || netProfit <= 0) return null

  const salary = parseFloat(officerSalary) || 0
  // BUG-02: Watson formula — ratio is salary as % of TOTAL S-Corp compensation
  // (salary + distributions), not salary as % of net profit alone.
  // Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012).
  // Dashboard and taxCalc.js both use salary/(salary+k1) — now consistent.
  const totalComp = salary + netProfit
  const ratio = totalComp > 0 ? salary / totalComp : 0
  // minTarget: salary needed to reach 35% of totalComp = 0.35/(1-0.35) * netProfit
  const minTarget = Math.round(0.35 / 0.65 * netProfit)

  if (salary === 0 && netProfit > 20000) {
    return (
      <div style={{ marginTop: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#991B1B' }}>
        ⚠ <strong>No officer salary set.</strong> Tax practitioners and case law (Watson v. Commissioner, 668 F.3d 1008) flag zero salary as an S-Corp audit risk. The IRS uses a facts-and-circumstances test — there is no safe harbor, but a suggested starting point is {fmt(minTarget)} (35% of net profit). Consult your CPA.
      </div>
    )
  }
  if (salary > 0 && netProfit > 30000 && ratio < 0.35) {
    return (
      <div style={{ marginTop: 8, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#92400E' }}>
        ⚠ <strong>Officer salary ({(ratio * 100).toFixed(1)}% of net profit) may be below practitioner guidelines.</strong> Tax practitioners commonly recommend 35–45% based on Watson v. Commissioner. The IRS applies a facts-and-circumstances test — consider discussing with your CPA whether {fmt(minTarget)} or higher is appropriate.
      </div>
    )
  }
  if (salary > 0 && ratio >= 0.35) {
    return (
      <div style={{ marginTop: 8, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 7, padding: '7px 12px', fontSize: 12, color: '#166534' }}>
        ✓ Officer salary is {(ratio * 100).toFixed(1)}% of net profit — within the practitioner-recommended 35–45% range (Watson v. Commissioner).
      </div>
    )
  }
  return null
}

// ── F-03: Auto-name generator ─────────────────────────────────────────────────
// Builds a human-readable record name from entity type, tax year, and revenue.
// Used as the pre-filled default in the NameRecordModal so users can accept
// it with one click or customize it before saving.
//
// Format: "{TypeShort} — {Year} — {Revenue}"
// Examples:
//   "S-Corp — 2025 — $250K Revenue"
//   "Partnership — 2025 — $1.2M Revenue"
//   "Sole Prop — 2025"  (no revenue entered yet)
function generateRecordName(entities, taxYear) {
  const primary = entities[0]
  const entityType = primary?.type || 'S Corporation'
  const typeShort = {
    'S Corporation':                     'S-Corp',
    'C Corporation':                     'C-Corp',
    'Sole Proprietor / Single-Member LLC': 'Sole Prop',
    'Partnership / MMLLC — Active':      'Partnership (Active)',
    'Partnership / MMLLC — Passive':     'Partnership (Passive)',
  }[entityType] || entityType

  const year = taxYear || new Date().getFullYear()
  const revenue = parseFloat(primary?.pnl?.grossRevenue) || 0

  let revenueStr = ''
  if (revenue >= 1_000_000) {
    revenueStr = '$' + (revenue / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M Revenue'
  } else if (revenue >= 1_000) {
    revenueStr = '$' + Math.round(revenue / 1_000) + 'K Revenue'
  } else if (revenue > 0) {
    revenueStr = '$' + Math.round(revenue) + ' Revenue'
  }

  return [typeShort, String(year), revenueStr].filter(Boolean).join(' — ')
}

// ── F-03: Name Record Modal ───────────────────────────────────────────────────
// Shown when the user clicks "Save Record" and data is present.
// Pre-filled with the auto-generated name from generateRecordName().
// User can accept the default, edit it, or cancel.
// Pressing Enter submits; clicking the backdrop cancels.
function NameRecordModal({ defaultName, onConfirm, onCancel }) {
  const [name, setName] = React.useState(defaultName)
  const trimmed = name.trim()
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16, padding: 28,
          width: 440, maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0D1B3E', marginBottom: 6 }}>
          Name this record
        </div>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
          Give this calculation a name so you can find it on your Dashboard.
          The name below was generated from your inputs — edit it or keep it as-is.
        </div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && trimmed) onConfirm(trimmed) }}
          autoFocus
          maxLength={80}
          placeholder="e.g. S-Corp — 2025 — $250K Revenue"
          style={{
            width: '100%', padding: '10px 14px',
            border: '1.5px solid #2563EB', borderRadius: 8,
            fontSize: 14, color: '#0D1B3E',
            boxSizing: 'border-box', outline: 'none',
            fontFamily: 'inherit', marginBottom: 6,
          }}
        />
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 16, textAlign: 'right' }}>
          {name.length}/80
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '11px', borderRadius: 8,
              border: '1px solid #E2E8F0', background: '#fff',
              fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { if (trimmed) onConfirm(trimmed) }}
            disabled={!trimmed}
            style={{
              flex: 2, padding: '11px', borderRadius: 8, border: 'none',
              background: trimmed ? '#2563EB' : '#CBD5E1',
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: trimmed ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            💾 Save Record →
          </button>
        </div>
      </div>
    </div>
  )
}

function EntityCard({ent,idx,onUpdate,onRemove,canRemove,onCompare}){
const[syn,setSyn]=React.useState(null)
const[manual,setManual]=React.useState(false)
const[manRev,setManRev]=React.useState(()=>ent.pnl?.grossRevenue ?? 0)
const[manExp,setManExp]=React.useState(()=>ent.pnl ? ((ent.pnl.totalExpenses || 0) - (ent.pnl.officerSalary || 0)) : 0)
const[manOfficerSal,setManOfficerSal]=React.useState(()=>ent.pnl?.officerSalary ?? 0)
const[showDetails,setShowDetails]=React.useState(false)
const[showAdvK1,setShowAdvK1]=React.useState(false)
const [nameError, setNameError] = React.useState(null)
const color=COLORS[idx%COLORS.length]
const inp={width:'100%',padding:'8px 10px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:N,boxSizing:'border-box',outline:'none',fontFamily:'inherit',background:'#fff'}
const lbl={fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.5px'}

async function fetchPnL(pid,tok,extra){setSyn(pid);try{let url=API_BASE_URL+'/auth/'+pid+'/data?token='+encodeURIComponent(tok);if(pid==='quickbooks'&&extra)url+='&realm='+extra;if(pid==='xero'&&extra)url+='&tenant='+extra;if(pid==='freshbooks'&&extra)url+='&account='+extra;const d=await(await fetch(url)).json();if(d&&!d.error)onUpdate(idx,{...ent,pnl:d,connectedId:pid})}catch(ex){console.error(ex)}}
function connectSoftware(pid){sessionStorage.setItem('ts360_connecting_entity',idx);if(pid==='freshbooks'){window.location.href='https://auth.freshbooks.com/oauth/authorize?response_type=code&client_id=f5b72f6df7396ebf68e641c162c173d3ccfb815dbce44b7685b3f440d5054a01&redirect_uri='+encodeURIComponent('https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/freshbooks/callback')+'&scope='+encodeURIComponent('user:profile:read user:account:read user:expenses:read user:other_income:read user:invoices:read')}else{window.location.href=API_BASE_URL+'/auth/'+pid+'/connect'}}

function applyManual(){
  const r=manRev,opEx=manExp,sal=manOfficerSal,totalEx=opEx+sal
  if(r>0||totalEx>0)onUpdate(idx,{
    ...ent,
    officerW2: sal,
    pnl:{grossRevenue:r,totalExpenses:totalEx,netProfit:r-totalEx,officerSalary:sal,categories:{}},
    connectedId:null,
    isManual:true
  })
}

const k1 = (ent.pnl && ent.type !== 'C Corporation')
  ? Math.round((ent.pnl.netProfit || 0) * ((parseFloat(ent.own) || 100) / 100))
  : 0

const netIncomeLabel = ['S Corporation', 'C Corporation'].includes(ent.type)
  ? 'Ordinary Business Income (Loss)'
  : ent.type === 'Sole Proprietor / Single-Member LLC'
  ? 'Net Profit (Loss)'
  : 'Distributive Share (Loss)'

const k1ShareLabel = ent.type === 'C Corporation'
  ? 'CORP. NET INCOME (STAYS IN ENTITY)'
  : ent.type === 'Sole Proprietor / Single-Member LLC'
  ? 'SCHEDULE C NET PROFIT'
  : ent.type === 'S Corporation'
  ? 'K-1 PRO-RATA SHARE'
  : 'K-1 DISTRIBUTIVE SHARE'

const opExpLabel = ['S Corporation', 'C Corporation'].includes(ent.type)
  ? 'OPERATING EXPENSES (excl. officer W-2 salary)'
  : /partnership|mmllc/i.test(ent.type || '')
    ? 'OPERATING EXPENSES (excl. guaranteed payments)'
    : 'OPERATING EXPENSES'
const opExpTip = ['S Corporation', 'C Corporation'].includes(ent.type)
  ? 'All business expenses except the officer W-2 salary. Enter the officer W-2 separately below. The officer salary is a deductible business expense but also appears on your personal W-2.'
  : /partnership|mmllc/i.test(ent.type || '')
    ? 'All business expenses except guaranteed payments to partners (IRC §707(c)). Guaranteed payments are reported on K-1 Box 4a and are deductible at the entity level.'
    : 'All ordinary and necessary business expenses (IRC §162). Includes rent, utilities, supplies, professional fees, and other operating costs reported on Schedule C.'

const isCorp = ['S Corporation', 'C Corporation'].includes(ent.type)
const displayNetProfit = ent.pnl ? (ent.pnl.netProfit || 0) : 0
const displayOfficerSal = ent.pnl?.officerSalary || 0

const manNetProfit = manRev - manExp - manOfficerSal

const officerExceedsRevenue = manOfficerSal > manRev && manRev > 0
const officerExceedsNetProfit = !officerExceedsRevenue && manOfficerSal > (manRev - manExp) && manOfficerSal > 0 && manRev > 0

return(
<div style={{border:'2px solid '+color,borderRadius:14,overflow:'hidden',marginBottom:16}}>
<div style={{background:color,padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
<div style={{display:'flex',alignItems:'center',gap:12}}>
<div style={{color:'rgba(255,255,255,0.5)',fontSize:18,cursor:'grab',userSelect:'none'}}>⠣</div>
<div style={{width:28,height:28,borderRadius:7,background:'rgba(0,0,0,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:'#fff'}}>{idx+1}</div>
<div>
<div
  contentEditable
  suppressContentEditableWarning
  onBlur={v => {
    const raw = v.target.innerText.trim()
    if (/^\d+$/.test(raw)) {
      setNameError('Business name cannot be purely numeric. Please use a descriptive name (e.g., "Smith Consulting LLC").')
      v.target.innerText = ent.name
      return
    }
    if (raw.length < 2) {
      setNameError('Business name must be at least 2 characters.')
      v.target.innerText = ent.name
      return
    }
    setNameError(null)
    onUpdate(idx, {...ent, name: raw || 'Business ' + (idx + 1)})
  }}
  onKeyDown={v => { if (v.key === 'Enter') v.target.blur() }}
  style={{background:'transparent',border:'none',outline:'none',fontSize:15,fontWeight:700,color:'#fff',width:180,fontFamily:'inherit',cursor:'text',minWidth:80}}
>
  {ent.name}
</div>
<div style={{fontSize:11,color:'rgba(255,255,255,0.7)'}}>{ent.type}{ent.ein?' · EIN '+ent.ein:''}</div>
</div>
</div>
<div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',rowGap:6}}>
<select value={ent.type} onChange={v=>{const newType=v.target.value;const losingOfficer=['S Corporation','C Corporation'].includes(ent.type)&&!['S Corporation','C Corporation'].includes(newType);if(losingOfficer)setManOfficerSal(0);onUpdate(idx,{...ent,type:newType,officerW2:losingOfficer?0:ent.officerW2,pnl:losingOfficer&&ent.pnl?{...ent.pnl,officerSalary:0}:ent.pnl})}} style={{padding:'4px 8px',borderRadius:6,border:'none',fontSize:12,fontWeight:600,color:color,cursor:'pointer',background:'#fff'}}>
  {ENTITY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
</select>
<button
  onClick={()=>onCompare(idx)}
  title="Compare tax structures — e.g. S-Corp vs. LLC vs. Sole Proprietor. See side-by-side entity, self-employment, and QBI tax differences."
  style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:700,color:color,background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}
>
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="0.5" y="0.5" width="6" height="15" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="9.5" y="0.5" width="6" height="15" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="3.5" y1="4" x2="3.5" y2="12" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="12.5" y1="4" x2="12.5" y2="12" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
  Compare</button>
{canRemove&&<button onClick={()=>onRemove(idx)} style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.8)',background:'rgba(0,0,0,0.2)',cursor:'pointer'}}>✕ Remove</button>}
<button onClick={()=>setShowDetails(!showDetails)} style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:700,color:color,background:'#fff',cursor:'pointer'}}>{showDetails?'▲':'▼'} Details</button>
</div>
</div>

{nameError && (
  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '8px 20px', fontSize: 12, color: '#991B1B' }}>
    ⚠ {nameError}
  </div>
)}

{showDetails&&(
<div style={{background:color+'15',padding:'12px 20px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
<div>
<label style={lbl}>EIN</label>
<input value={ent.ein||''} onChange={v=>onUpdate(idx,{...ent,ein:v.target.value})} placeholder="XX-XXXXXXX" style={inp} />
</div>
<div>
<label style={lbl}>Formation Date</label>
<input type="date" aria-label="Business formation date" value={ent.formationDate||''} onChange={v=>onUpdate(idx,{...ent,formationDate:v.target.value})} style={inp} />
</div>
<div>
<label style={lbl}>Ownership %</label>
<input type="number" aria-label="Ownership percentage" value={ent.own||'100'} min="1" max="100" step="0.01" onChange={v=>onUpdate(idx,{...ent,own:v.target.value})} style={{...inp,background:'#EFF6FF',fontWeight:700,color:B}} />
</div>
<div style={{gridColumn:'1/-1'}}>
<button onClick={()=>setShowAdvK1(!showAdvK1)} style={{background:'none',border:'none',fontSize:11,fontWeight:700,color:SL,cursor:'pointer',letterSpacing:'1px',display:'flex',alignItems:'center',gap:6}}>
{showAdvK1?'▲':'▼'} Advanced K-1 items
</button>
</div>
{showAdvK1&&(
<div style={{gridColumn:'1/-1',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
<div>
  <label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>Section 179 Recapture (K-1 Box 17K) <InfoTip text="Recapture of §179 deduction when the property is disposed of or business use drops below 50% (IRC §1245). Reported as ordinary income on Form 4797 Part II — flows to Schedule 1 Line 4. Do NOT include in Long-Term Capital Gains." /></label>
  <MoneyInput value={ent.box17K || 0} onChange={n => onUpdate(idx, {...ent, box17K: n})} placeholder="0" style={inp} />
</div>
<div>
<label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>§179 expense (K-1 Box 11 S-corp / Box 12 partnership) <InfoTip text="Your share of §179 deduction from the entity. Limited to your active business income — excess is disallowed and carried forward." /></label>
<MoneyInput value={ent.box11_12 || 0} onChange={n => onUpdate(idx, {...ent, box11_12: n})} placeholder="0" style={inp} />
</div>
<div style={{gridColumn:'1/-1'}}>
<label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>K-1 ordinary deductions (do NOT include charitable contributions, investment interest, or §199A info — those flow elsewhere) <InfoTip text="Other deductions passed through on K-1 Box 12 (S-corp) or Box 13 (partnership) that reduce ordinary income — e.g. business interest expense subject to §163(j)." /></label>
<MoneyInput value={ent.box12_13 || 0} onChange={n => onUpdate(idx, {...ent, box12_13: n})} placeholder="0" style={inp} />
</div>
<div>
<label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>
  QBI: entity W-2 wages (S-corp K-1 Box 17V / partnership K-1 Box 20Z){' '}
  <InfoTip text="W-2 wages paid by the entity — required for the §199A(b)(2) W-2 wage limitation when your income is above the QBI threshold ($197,300 single / $394,600 MFJ for 2025). If blank, the officer W-2 salary entered above is used as a proxy — enter Box 17V for maximum accuracy." />
</label>
<MoneyInput value={ent.box17V_wages || 0} onChange={n => onUpdate(idx, {...ent, box17V_wages: n})} placeholder="0" style={inp} />
</div>
<div>
  <label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>QBI: UBIA of qualified property (S-corp K-1 Box 17W / partnership K-1 Box 20Z) <InfoTip text="Unadjusted basis immediately after acquisition of qualified property — used in the §199A(b)(2)(B)(ii) UBIA limitation. S-corp K-1 Box 17, Code W (not Code V — Code V is W-2 wages, entered in the field above)." /></label>
  <MoneyInput value={ent.box17V_ubia || 0} onChange={n => onUpdate(idx, {...ent, box17V_ubia: n})} placeholder="0" style={inp} />
</div>
<div style={{gridColumn:'1/-1'}}>
<label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569',fontWeight:600,cursor:'pointer'}}>
<input type="checkbox" checked={!!ent.box17V_sstb} onChange={e=>onUpdate(idx,{...ent,box17V_sstb:e.target.checked})} />
Specified Service Trade or Business (SSTB) <InfoTip text="SSTBs (law, health, consulting, financial services, athletics, performing arts, etc.) are subject to the §199A phase-out at high income levels. Check if the entity's primary activity is an SSTB." />
</label>
</div>
</div>
)}
</div>
)}
<div style={{padding:20,background:'#fff'}}>
{!ent.pnl ? (
<div>
{!manual ? (
<div>
<div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:10}}>CONNECT ACCOUNTING SOFTWARE</div>
<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
{INTS.map(p=>{
const tok=localStorage.getItem('ts360_'+p.id+'_connected')==='true'?localStorage.getItem('ts360_'+p.id+'_token'):null
return(
<div key={p.id} onClick={()=>tok?fetchPnL(p.id,tok,localStorage.getItem('ts360_'+p.id+'_extra')):connectSoftware(p.id)} style={{background:tok?p.color+'22':'#F8FAFC',border:'2px solid '+(tok?p.color:'#E2E8F0'),borderRadius:10,padding:'12px 8px',cursor:'pointer',textAlign:'center',transition:'all 0.15s'}}>
<div style={{width:32,height:32,borderRadius:8,background:p.color,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 6px',fontSize:13,fontWeight:800,color:'#fff'}}>{p.abbr}</div>
<div style={{fontSize:11,fontWeight:700,color:N}}>{p.name}</div>
{syn===p.id&&<div style={{fontSize:10,color:SL,marginTop:3}}>Syncing…</div>}
{tok&&syn!==p.id&&<div style={{fontSize:10,color:G,marginTop:3}}>✓ Connected</div>}
</div>
)
})}
</div>
<button onClick={()=>setManual(true)} style={{width:'100%',padding:'10px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',fontSize:12,fontWeight:600,color:SL,cursor:'pointer'}}>Enter Manually</button>
</div>
) : (
<div>
<div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>ENTER INCOME &amp; EXPENSES <button onClick={()=>setManual(false)} style={{background:'none',border:'none',fontSize:11,color:B,cursor:'pointer',fontWeight:600}}>Use Software</button></div>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
<div>
<label style={lbl}>GROSS REVENUE</label>
<MoneyInput value={manRev} onChange={setManRev} placeholder="0" style={inp} />
</div>
<div>
<label style={lbl}>{opExpLabel} <InfoTip text={opExpTip} /></label>
<MoneyInput value={manExp} onChange={setManExp} placeholder="0" style={inp} />
</div>
</div>
{['S Corporation','C Corporation'].includes(ent.type)&&(
<div style={{marginBottom:10}}>
<label style={lbl}>OFFICER W-2 SALARY (ENTERED SEPARATELY) <InfoTip text="The W-2 wages paid to the officer/owner. This is an S-Corp deduction but also appears on your personal W-2 and flows to your 1040. Also used as the §199A W-2 wage proxy when Box 17V is not entered." /></label>
<MoneyInput value={manOfficerSal} onChange={setManOfficerSal} placeholder="0" style={inp} />
{officerExceedsRevenue && (
  <div style={{ marginTop: 5, fontSize: 11, color: R, fontWeight: 600 }}>
    ⚠ Officer salary cannot exceed gross revenue.
  </div>
)}
{officerExceedsNetProfit && (
  <div style={{ marginTop: 5, fontSize: 11, color: '#D97706', fontWeight: 600 }}>
    ⚠ Officer salary exceeds net income — the S-Corp would show a loss after deducting all expenses including payroll taxes.
  </div>
)}
{!officerExceedsRevenue && manRev > 0 && (
  <ReasonableCompIndicator
    officerSalary={manOfficerSal}
    netProfit={manNetProfit}
    entityType={ent.type}
  />
)}
</div>
)}
<button onClick={applyManual} style={{width:'100%',padding:'10px',borderRadius:8,border:'none',background:N,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Calculate</button>
</div>
)}
</div>
) : (
<div>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
<div style={{background:'#F8FAFC',borderRadius:10,padding:'12px 16px',textAlign:'center'}}>
<div style={{fontSize:10,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:4}}>GROSS REVENUE</div>
<div style={{fontSize:18,fontWeight:800,color:N}}>{fmt(ent.pnl.grossRevenue)}</div>
</div>
<div style={{background:'#FFF1F2',borderRadius:10,padding:'12px 16px',textAlign:'center'}}>
<div style={{fontSize:10,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:4}}>TOTAL EXPENSES</div>
<div style={{fontSize:18,fontWeight:800,color:R}}>{fmt(ent.pnl.totalExpenses)}</div>
</div>
<div style={{background:ent.pnl.netProfit>=0?'#F0FDF4':'#FFF1F2',borderRadius:10,padding:'12px 16px',textAlign:'center'}}>
<div style={{fontSize:10,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:4}}>{netIncomeLabel.toUpperCase()}</div>
<div style={{fontSize:18,fontWeight:800,color:ent.pnl.netProfit>=0?G:R}}>{fmt(ent.pnl.netProfit)}</div>
</div>
</div>
<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
<div style={{background:'#EFF6FF',borderRadius:10,padding:'12px 16px',textAlign:'center'}}>
<div style={{fontSize:10,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:4}}>OWNERSHIP</div>
<div style={{fontSize:18,fontWeight:800,color:B}}>{parseInt(ent.own)||100}%</div>
<div style={{fontSize:10,color:SL,marginTop:4,cursor:'pointer'}} onClick={()=>setShowDetails(true)}>▼ Details to change</div>
</div>
<div style={{background: ent.type==='C Corporation'?'#F8FAFC':'#EFF6FF',borderRadius:10,padding:'12px 16px',textAlign:'center'}}>
<div style={{fontSize:10,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:4}}>{k1ShareLabel}</div>
<div style={{fontSize:18,fontWeight:800,color:ent.type==='C Corporation'?SL:B}}>
  {ent.type==='C Corporation' ? fmt(ent.pnl.netProfit) : fmt(k1)}
</div>
{ent.type==='C Corporation'&&<div style={{fontSize:10,color:SL,marginTop:4}}>Taxed at entity level — does not flow to your 1040</div>}
</div>
</div>

{isCorp && (
  <ReasonableCompIndicator
    officerSalary={displayOfficerSal}
    netProfit={displayNetProfit}
    entityType={ent.type}
  />
)}

{ent.type === 'S Corporation' && k1 > 0 && (
  <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:8,padding:'10px 14px',marginBottom:10,marginTop:8,fontSize:12,color:'#1E40AF',display:'flex',alignItems:'flex-start',gap:8}}>
    <span style={{fontSize:14,flexShrink:0}}>💡</span>
    <span>
      <strong>For accurate §199A QBI deduction:</strong> enter your K-1 Box 17V W-2 wages in{' '}
      <span style={{fontWeight:700,cursor:'pointer',textDecoration:'underline'}} onClick={()=>{setShowDetails(true);setShowAdvK1(true)}}>
        ▼ Details → Advanced K-1 items
      </span>
      . If not entered, the officer W-2 salary above is used as a proxy.
    </span>
  </div>
)}
{ent.pnl.categories&&Object.keys(ent.pnl.categories).length>0&&<ExpenseBreakdown categories={ent.pnl.categories} total={ent.pnl.totalExpenses} />}

{/* F-M15: Disconnect / re-enter label is conditional on how data was entered */}
<div style={{textAlign:'center',marginTop:10}}>
<button
  onClick={()=>onUpdate(idx,{...ent,pnl:null,connectedId:null,isManual:false})}
  style={{background:'none',border:'none',fontSize:12,color:SL,cursor:'pointer',textDecoration:'underline'}}
>
  {ent.isManual ? '✏ Edit / re-enter data' : '⟳ Disconnect / reconnect software'}
</button>
</div>
</div>
)}
</div>
</div>
)
}

function TemplatePicker({onSelect,onClose}){return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}><div style={{background:'#fff',borderRadius:16,padding:24,width:480,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}><div style={{fontSize:16,fontWeight:800,color:N,marginBottom:16}}>Choose a Template</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{TEMPLATES.map(t=><div key={t.label} onClick={()=>{onSelect(t);onClose()}} style={{border:'2px solid #E2E8F0',borderRadius:10,padding:'14px 16px',cursor:'pointer',transition:'all 0.15s'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=B;e.currentTarget.style.background='#EFF6FF'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='#E2E8F0';e.currentTarget.style.background='#fff'}}><div style={{fontSize:22,marginBottom:6}}>{t.icon}</div><div style={{fontSize:13,fontWeight:700,color:N}}>{t.label}</div><div style={{fontSize:11,color:SL,marginTop:3}}>{t.desc}</div></div>)}</div></div></div>)}

// F-L26: ImportModal includes a "Download Template CSV" button
function ImportModal({onImport,onClose}){
const [csvErr, setCsvErr] = React.useState('')
function handleFile(f){
if(!f)return
const r=new FileReader()
r.onload=e=>{
try{
  const entities=parseCSVImport(e.target.result)
  if(entities.length){ setCsvErr(''); onImport(entities); onClose() }
  else { setCsvErr('No valid entities found. Check that your CSV matches the template format.') }
}catch(err){
  setCsvErr('Could not parse CSV: ' + (err.message || 'Please check the file format and try again.'))
}
}
r.readAsText(f)
}

function downloadTemplate() {
  const rows = [
    ['"Name"','"Entity Type"','"EIN"','"Formation Date"','"Ownership %"','"Gross Revenue"','"Total Expenses"'],
    ['"Smith Consulting LLC"','"S Corporation"','"12-3456789"','"2020-01-15"','"100"','"250000"','"80000"'],
    ['"Main Street Rentals"','"Sole Proprietor / Single-Member LLC"','"","","100"','"120000"','"60000"'],
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'taxstat360-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}><div style={{background:'#fff',borderRadius:16,padding:24,width:440,maxWidth:'90vw'}} onClick={e=>e.stopPropagation()}>
  <div style={{fontSize:16,fontWeight:800,color:N,marginBottom:12}}>Import from CSV</div>
  <div style={{fontSize:13,color:SL,marginBottom:8,lineHeight:1.6}}>
    Upload a CSV with these columns:<br />
    <span style={{fontFamily:'monospace',fontSize:11,color:N}}>Name, Entity Type, EIN, Formation Date, Ownership %, Gross Revenue, Total Expenses</span>
  </div>
  <button
    onClick={downloadTemplate}
    style={{width:'100%',padding:'9px',borderRadius:8,border:'1px solid #BFDBFE',background:'#EFF6FF',fontSize:12,fontWeight:700,color:'#1D4ED8',cursor:'pointer',marginBottom:12}}
  >
    ⬇ Download Template CSV
  </button>
  <input type="file" accept=".csv" onChange={e=>handleFile(e.target.files[0])} style={{width:'100%',marginBottom:12}} />
  {csvErr && (
    <div style={{background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA',borderRadius:7,padding:'8px 12px',fontSize:12,marginBottom:10}}>
      {csvErr}
    </div>
  )}
  <button onClick={onClose} style={{width:'100%',padding:'10px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',fontSize:13,fontWeight:600,color:SL,cursor:'pointer'}}>Cancel</button>
</div></div>)
}

export default function CalculateTax() {
    const nav = useNavigate()

    const computeK1Total = (ents) =>
      ents.reduce((sum, e) => {
        if (!e.pnl || e.type === 'C Corporation') return sum
        return sum + Math.round((e.pnl.netProfit || 0) * ((parseFloat(e.own) || 100) / 100))
      }, 0)

    const [entities, setEntities] = React.useState(()=>{
      const raw = readStep1StateRaw()
      if(raw && raw.length) return raw
      return [{ name: 'Business 1', type: 'S Corporation', own: '100', ein: '', state: '', formationDate: '', pnl: null, connectedId: null, isManual: false }]
    })
    const [isCoopPatron, setIsCoopPatronState] = React.useState(readIsCoopPatron())
    const [showTemplates, setShowTemplates] = React.useState(false)
    const [showImport, setShowImport] = React.useState(false)
    const [dragIdx, setDragIdx] = React.useState(null)
    const [compareIdx, setCompareIdx] = React.useState(null)
    const [showAdvancedSituations, setShowAdvancedSituations] = React.useState(false)

    // FIX (alert replacement): saveRecord previously used alert() for both validation
    // errors and success confirmation — a blocking browser dialog that breaks the UX
    // on mobile and cannot be styled. Replaced with inline state-based messages:
    //   saveMsg.type  — 'error' | 'success'
    //   saveMsg.text  — displayed below the Save Record button
    // Message auto-clears after 4 seconds for success (errors persist until user acts).
    const [saveMsg, setSaveMsg] = React.useState(null)

    // F-03: Name modal state.
    // showNameModal — controls whether the NameRecordModal is visible.
    // pendingRecordName — the auto-generated name pre-filled into the modal input.
    // Both are set together inside saveRecord() once data validation passes.
    const [showNameModal, setShowNameModal] = React.useState(false)
    const [pendingRecordName, setPendingRecordName] = React.useState('')

    React.useEffect(() => {
      writeStep1State({ entities, isCoopPatron, k1Total: computeK1Total(entities), entitiesRaw: entities })
    }, [entities, isCoopPatron])

    React.useEffect(() => {
      const p = new URLSearchParams(window.location.search)
      const mp = {qb_token:'quickbooks',xero_token:'xero',wave_token:'wave',fb_token:'freshbooks'}
      const xeroRefresh=p.get('xero_refresh');if(xeroRefresh)localStorage.setItem('ts360_xero_refresh',xeroRefresh)
      const entityIdx=parseInt(sessionStorage.getItem('ts360_connecting_entity'))||0
      let foundInUrl=false
      for(const[k,pid] of Object.entries(mp)){
        const tok=p.get(k)
        if(tok){foundInUrl=true;localStorage.setItem('ts360_'+pid+'_connected','true');localStorage.setItem('ts360_'+pid+'_token',tok)
          const extra=pid==='quickbooks'?p.get('realm'):pid==='xero'?p.get('tenant'):pid==='freshbooks'?p.get('account'):null
          if(extra)localStorage.setItem('ts360_'+pid+'_extra',extra)
          fetchEntityPnL(entityIdx,pid,tok,extra)
        }
      }
      if(!foundInUrl){
        const pids=['quickbooks','xero','wave','freshbooks']
        for(const pid of pids){
          if(localStorage.getItem('ts360_'+pid+'_connected')==='true'){
            const tok=localStorage.getItem('ts360_'+pid+'_token')
            const extra=localStorage.getItem('ts360_'+pid+'_extra')
            if(tok)fetchEntityPnL(entityIdx,pid,tok,extra)
            break
          }
        }
      }
    }, [])

    async function fetchEntityPnL(idx,pid,tok,extra){
      try{
        let url=API_BASE_URL+'/auth/'+pid+'/data?token='+encodeURIComponent(tok)
        if(pid==='quickbooks'&&extra)url+='&realm='+extra
        if(pid==='xero'&&extra)url+='&tenant='+extra
        if(pid==='freshbooks'&&extra)url+='&account='+extra
        const d=await(await fetch(url)).json()
        if(d&&!d.error)updateEntity(idx,{...entities[idx],pnl:d,connectedId:pid})
      }catch(ex){console.error(ex)}
    }

    function updateEntity(idx,updated){setEntities(prev=>prev.map((e,i)=>i===idx?updated:e))}
    function removeEntity(idx){setEntities(prev=>prev.filter((_,i)=>i!==idx))}
    function addFromTemplate(t){setEntities(prev=>[...prev,{name:t.label,type:t.type,own:t.own,ein:'',state:'',formationDate:'',pnl:t.defaults.grossRevenue?{grossRevenue:parseMoney(t.defaults.grossRevenue),totalExpenses:parseMoney(t.defaults.operatingExpenses),netProfit:parseMoney(t.defaults.grossRevenue)-parseMoney(t.defaults.operatingExpenses),categories:{}}:null,connectedId:null,isManual:!!t.defaults.grossRevenue}])}
    function handleImport(imported){setEntities(prev=>[...prev,...imported])}
    function onDragStart(idx){setDragIdx(idx)}
    function onDragOver(e,idx){e.preventDefault();if(dragIdx===null||dragIdx===idx)return;setEntities(prev=>{const a=[...prev];const[item]=a.splice(dragIdx,1);a.splice(idx,0,item);return a});setDragIdx(idx)}
    function onDrop(){setDragIdx(null)}
    function onDragEnd(){setDragIdx(null)}

    function proceed() {
      writeStep1State({ entities, isCoopPatron, k1Total: computeK1Total(entities), entitiesRaw: entities })
      nav('/tax-return')
    }

    // F-03: saveRecord — validation only.
    // When data is present, generates an auto-name and opens the NameRecordModal.
    // The actual write to localStorage happens in confirmSave() after the user
    // accepts or edits the name. This prevents nameless records (the original bug)
    // without blocking the save flow — the modal is one click to confirm.
    function saveRecord() {
      const hasAnyData = entities.some(e => e.pnl && (
        (parseFloat(e.pnl.grossRevenue) || 0) > 0 ||
        (parseFloat(e.pnl.totalExpenses) || 0) > 0
      ))
      if (!hasAnyData) {
        setSaveMsg({ type: 'error', text: 'Please enter revenue or expenses for at least one entity before saving a record.' })
        return
      }
      // Clear any previous error, generate the auto-name, and show the modal.
      setSaveMsg(null)
      const autoName = generateRecordName(entities, readTaxYear())
      setPendingRecordName(autoName)
      setShowNameModal(true)
    }

    // F-03: confirmSave — called by NameRecordModal with the final record name.
    // Builds the record object (now with a `name` field), writes to localStorage,
    // and shows the inline success message. Matches the original save logic exactly
    // except for the added `name` property.
    function confirmSave(name) {
      setShowNameModal(false)
      writeStep1State({ entities, isCoopPatron, k1Total: computeK1Total(entities), entitiesRaw: entities })
      const email = localStorage.getItem('ts360_email') || 'default'
      const existing = JSON.parse(localStorage.getItem('ts360_records_' + email) || '[]')
      const record = {
        id: Date.now(),
        name,                          // F-03: human-readable name chosen/confirmed by user
        savedAt: new Date().toISOString(),
        entities,
        isCoopPatron,
        biz: {
          entityType: entities[0]?.type || 'Unknown',
          year: readTaxYear(),
          ownershipPct: entities[0]?.own || '100',
          grossRevenue: String(entities[0]?.pnl?.grossRevenue || 0),
        },
        f1040: readPersonalContext(),
      }
      existing.unshift(record)
      localStorage.setItem('ts360_records_' + email, JSON.stringify(existing))
      setSaveMsg({ type: 'success', text: 'Record saved! View it on your Dashboard.' })
      setTimeout(() => setSaveMsg(null), 4000)
    }

    const hasData = entities.some(e => e.pnl)

    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', paddingBottom: 60 }}>
        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div onClick={()=>nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <svg width="28" height="28" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#2563EB"/><rect x="8" y="18" width="5" height="8" rx="2" fill="#fff"/><rect x="15" y="12" width="5" height="14" rx="2" fill="#fff"/><rect x="22" y="8" width="5" height="18" rx="2" fill="#fff"/></svg>
              <span style={{ fontWeight: 800, color: '#0D1B3E', fontSize: 17 }}>TaxStat<span style={{ color: '#2563EB' }}>360</span></span>
            </div>
            <div style={{ background: '#F1F5F9', color: '#475569', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>Step 1 of 2 — Business Entities &amp; Income</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={()=>setShowImport(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, fontWeight: 600, color: SL, cursor: 'pointer' }}>📂 Import CSV</button>
            <button onClick={()=>nav('/dashboard')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, fontWeight: 600, color: SL, cursor: 'pointer' }}>Dashboard</button>
            <button onClick={()=>nav('/ai-analysis')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, fontWeight: 600, color: SL, cursor: 'pointer' }}>AI Analysis</button>
            <button onClick={() => signOut(nav)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, fontWeight: 600, color: SL, cursor: 'pointer' }}>Sign Out</button>
            <button onClick={()=>nav('/settings')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, fontWeight: 600, color: SL, cursor: 'pointer' }}>Settings</button>
          </div>
        </div>

        <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
          <DismissibleNotice storageKey="calc_disclaimer" style={{ marginBottom: 20 }}>
            TaxStat360 calculates <strong>federal tax estimates</strong> for planning purposes only. Results are not professional tax advice and do not account for state taxes, AMT in all cases, or your complete financial picture. Consult a licensed CPA or tax professional before making any filing or financial decisions.
          </DismissibleNotice>

          <h1 style={{ fontSize: 24, fontWeight: 800, color: N, marginBottom: 6, textAlign: 'center' }}>Step 1: Business Entities &amp; Income</h1>
          <p style={{ textAlign: 'center', color: SL, fontSize: 13, marginBottom: 24 }}>Add all your business entities. Drag ⠣ to reorder. Click ▼ Details to add EIN &amp; formation date.</p>

          <div>
            {entities.map((ent, idx) => (
              <div key={idx} draggable onDragStart={()=>onDragStart(idx)} onDragOver={e=>onDragOver(e,idx)} onDrop={onDrop} onDragEnd={onDragEnd}>
                <EntityCard
                  ent={ent}
                  idx={idx}
                  onUpdate={updateEntity}
                  onRemove={removeEntity}
                  canRemove={entities.length > 1}
                  onCompare={setCompareIdx}
                />
              </div>
            ))}
          </div>

          {/* Add entity actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <button
              onClick={()=>setShowTemplates(true)}
              title="Start with a pre-filled example entity (S-Corp, Partnership, Real Estate) — adds to your current setup without replacing existing entities"
              style={{ padding: '14px', borderRadius: 12, border: '1px solid #CBD5E1', background: '#fff', fontSize: 13, fontWeight: 700, color: SL, cursor: 'pointer' }}
            >🗂 Add from Template</button>
            <button onClick={()=>setEntities(prev=>[...prev, { name: 'Business ' + (prev.length + 1), type: 'S Corporation', own: '100', ein: '', state: '', formationDate: '', pnl: null, connectedId: null, isManual: false }])} style={{ padding: '14px', borderRadius: 12, border: '1px solid #2563EB', background: '#fff', fontSize: 13, fontWeight: 700, color: SL, cursor: 'pointer' }}>+ Add Entity</button>
          </div>

          {/* Advanced / Special Situations — collapsed by default (F-M14) */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
            <button
              onClick={() => setShowAdvancedSituations(v => !v)}
              style={{
                width: '100%', background: 'none', border: 'none',
                padding: '13px 20px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 12, fontWeight: 700, color: SL, letterSpacing: '0.5px',
              }}
            >
              <span>Advanced / Special Situations</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{showAdvancedSituations ? '▲ Collapse' : '▼ Expand'}</span>
            </button>
            {showAdvancedSituations && (
              <div style={{ padding: '0 20px 16px', borderTop: '1px solid #F1F5F9' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', paddingTop: 14 }}>
                  <input
                    type="checkbox"
                    checked={isCoopPatron}
                    onChange={e => { setIsCoopPatronState(e.target.checked); writeIsCoopPatron(e.target.checked) }}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: N }}>I am a patron of an agricultural or horticultural cooperative</div>
                    <div style={{ fontSize: 12, color: SL, marginTop: 4 }}>Check this if you received Form 1099-PATR or a K-1 from an ag/hort co-op (e.g., dairy, grain, fruit/vegetable, or livestock). Per IRS Form 8995 instructions, co-op patrons file Form 8995-A regardless of taxable income. The §199A(g)(2) patron reduction (Form 8995-A Schedule D) is not currently calculated by this tool.</div>
                  </div>
                </label>
              </div>
            )}
          </div>

          {!hasData && (
            <p style={{ textAlign: 'center', color: SL, fontSize: 12, marginBottom: 8 }}>
              Connect accounting software or enter data manually for at least one entity above to continue.
            </p>
          )}

          <button
            onClick={proceed}
            disabled={!hasData}
            style={{
              width: '100%', padding: '16px', borderRadius: 12, border: 'none',
              background: hasData ? '#2563EB' : '#CBD5E1', color: '#fff',
              fontSize: 16, fontWeight: 700, cursor: hasData ? 'pointer' : 'not-allowed',
              marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            Continue to Step 2: Personal Return →
          </button>
          <button
            onClick={saveRecord}
            style={{
              width: '100%', padding: '12px', background: '#fff',
              border: '1px solid #E2E8F0', borderRadius: 12,
              color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            💾 Save Record
          </button>

          {/* Inline save feedback — replaces alert() for both error and success states */}
          {saveMsg && (
            <div style={{
              marginTop: 10, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: saveMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
              border: '1px solid ' + (saveMsg.type === 'success' ? '#86EFAC' : '#FECACA'),
              color: saveMsg.type === 'success' ? '#166534' : '#991B1B',
            }}>
              {saveMsg.type === 'success' ? '✅ ' : '⚠ '}{saveMsg.text}
            </div>
          )}
        </div>

        {showTemplates && <TemplatePicker onSelect={addFromTemplate} onClose={()=>setShowTemplates(false)} />}
        {showImport && <ImportModal onImport={handleImport} onClose={()=>setShowImport(false)} />}

        {/* F-03: Name Record Modal — shown after data validation passes in saveRecord().
            Receives the auto-generated name as the default. confirmSave() writes the
            record to localStorage with the user's final name choice. */}
        {showNameModal && (
          <NameRecordModal
            defaultName={pendingRecordName}
            onConfirm={confirmSave}
            onCancel={() => setShowNameModal(false)}
          />
        )}

        <EntityCompareModal
          isOpen={compareIdx !== null}
          onClose={() => setCompareIdx(null)}
          entity={compareIdx !== null ? entities[compareIdx] : null}
          entities={entities}
          entityIdx={compareIdx}
          personalContext={() => { const pc = readPersonalContext(); return { taxyear: pc.taxyear, status: pc.filingStatus, dependents: pc.dependents }}}
        />
      </div>
    )
}
