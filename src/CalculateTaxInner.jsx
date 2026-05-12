import React from 'react'
import EntityCompareModal from './EntityCompareModal'
import { useNavigate } from 'react-router-dom'
import MoneyInput from './components/MoneyInput.jsx'
import DismissibleNotice from './components/DismissibleNotice'
import { parseMoney } from './utils/parseMoney.js'

import { API_BASE_URL, INTEGRATIONS, ENTITY_TYPES } from './constants.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R } from './theme.js'
import { writeStep1State, readPersonalContext, readIsCoopPatron, writeIsCoopPatron, readStep1StateRaw, readTaxYear } from './utils/sessionState.js'
// FIX (U-02): import tax calc helpers to power the Step 1 preview estimate
import { calcFederalTax, calcQBI, getStdDed } from './taxCalc'
const fmt=n=>n<0?'($'+Math.abs(Math.round(n)||0).toLocaleString('en-US')+')':'$'+Math.abs(Math.round(n)||0).toLocaleString('en-US')
function InfoTip({ text, below }) { const [s, ss] = React.useState(false); const popupPos = below ? {top:'120%',right:0} : {bottom:'120%',left:'50%',transform:'translateX(-50%)'}; return (<span style={{position:'relative',display:'inline-flex',alignItems:'center',marginLeft:5}}><span onMouseEnter={()=>ss(true)} onMouseLeave={()=>ss(false)} onClick={()=>ss(v=>!v)} style={{width:16,height:16,borderRadius:'50%',background:'#DBEAFE',color:'#2563EB',fontSize:10,fontWeight:800,cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',border:'1px solid #93C5FD'}}>i</span>{s && <span style={{position:'absolute',...popupPos,background:'#1E293B',color:'#fff',fontSize:12,padding:'8px 12px',borderRadius:8,width:240,lineHeight:1.5,zIndex:999,pointerEvents:'none'}}>{text}</span>}</span>) } const OWN_PRESETS=[100,75,50,33,25]
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
    const k1=ent.pnl?Math.round(ent.pnl.netProfit*((parseInt(ent.own)||100)/100)):''
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

function EntityCard({ent,idx,onUpdate,onRemove,canRemove,onCompare}){
  const[syn,setSyn]=React.useState(null)
  const[manual,setManual]=React.useState(false)
  const[manRev,setManRev]=React.useState(0)
  const[manExp,setManExp]=React.useState(0)
  const[manOfficerSal,setManOfficerSal]=React.useState(0)
  const[showDetails,setShowDetails]=React.useState(false)
  const[showAdvK1,setShowAdvK1]=React.useState(false)
  const color=COLORS[idx%COLORS.length]
  const inp={width:'100%',padding:'8px 10px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:N,boxSizing:'border-box',outline:'none',fontFamily:'inherit',background:'#fff'}
  const lbl={fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.5px'}

  async function fetchPnL(pid,tok,extra){setSyn(pid);try{let url=API_BASE_URL+'/auth/'+pid+'/data?token='+encodeURIComponent(tok);if(pid==='quickbooks'&&extra)url+='&realm='+extra;if(pid==='xero'&&extra)url+='&tenant='+extra;if(pid==='freshbooks'&&extra)url+='&account='+extra;const d=await(await fetch(url)).json();if(d&&!d.error)onUpdate(idx,{...ent,pnl:d,connectedId:pid})}catch(ex){console.error(ex)}}
  function connectSoftware(pid){sessionStorage.setItem('ts360_connecting_entity',idx);if(pid==='freshbooks'){window.location.href='https://auth.freshbooks.com/oauth/authorize?response_type=code&client_id=f5b72f6df7396ebf68e641c162c173d3ccfb815dbce44b7685b3f440d5054a01&redirect_uri='+encodeURIComponent('https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/freshbooks/callback')+'&scope='+encodeURIComponent('user:profile:read user:account:read user:expenses:read user:other_income:read user:invoices:read')}else{window.location.href=API_BASE_URL+'/auth/'+pid+'/connect'}}
  function applyManual(){const r=manRev,opEx=manExp,sal=manOfficerSal,totalEx=opEx+sal;if(r>0||totalEx>0)onUpdate(idx,{...ent,pnl:{grossRevenue:r,totalExpenses:totalEx,netProfit:r-totalEx,officerSalary:sal,categories:{}},connectedId:null,isManual:true})}
  const k1=ent.pnl?Math.round(ent.pnl.netProfit*((parseInt(ent.own)||100)/100)):0

  // FIX (L-01): "Net Profit (Loss)" is Schedule C / sole-proprietor language. The correct
  // term for S-Corp income is "Ordinary Business Income (Loss)" — this appears on Form 1120-S
  // Line 21 and flows to K-1 Box 1 (IRC §1366). For partnerships the term is "Distributive
  // Share". Using "Net Profit (Loss)" for an S-Corp owner comparing this label against their
  // actual tax forms creates confusion and undermines trust in the accuracy of the tool.
  const netIncomeLabel = ['S Corporation', 'C Corporation'].includes(ent.type)
    ? 'Ordinary Business Income (Loss)'
    : ent.type === 'Sole Proprietor / Single-Member LLC'
    ? 'Net Profit (Loss)'
    : 'Distributive Share (Loss)'

  // FIX (L-02): "K-1 Distributive Share" is partnership terminology (IRC §704).
  // S-Corp shareholders receive a "pro-rata share" under IRC §1366, not a distributive
  // share. A tax-savvy user comparing this label to their actual K-1 (Form 1120-S,
  // Schedule K-1) will notice the mismatch. Sole proprietors don't have a K-1 at all —
  // their income flows directly from Schedule C, which is already labelled correctly.
  const k1ShareLabel = ent.type === 'Sole Proprietor / Single-Member LLC'
    ? 'SCHEDULE C NET PROFIT'
    : ent.type === 'S Corporation'
    ? 'K-1 PRO-RATA SHARE'
    : 'K-1 DISTRIBUTIVE SHARE'

  return(
    <div style={{border:'2px solid '+color,borderRadius:14,overflow:'hidden',marginBottom:16}}>
      <div style={{background:color,padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{color:'rgba(255,255,255,0.5)',fontSize:18,cursor:'grab',userSelect:'none'}}>⠿</div>
          <div style={{width:28,height:28,borderRadius:7,background:'rgba(0,0,0,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:'#fff'}}>{idx+1}</div>
          <div>
            <div contentEditable suppressContentEditableWarning onBlur={v=>onUpdate(idx,{...ent,name:v.target.innerText.trim()||'Business '+(idx+1)})} onKeyDown={v=>{if(v.key==='Enter')v.target.blur()}} style={{background:'transparent',border:'none',outline:'none',fontSize:15,fontWeight:700,color:'#fff',width:180,fontFamily:'inherit',cursor:'text',minWidth:80}}>{ent.name}</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.7)'}}>{ent.type}{ent.ein?' · EIN '+ent.ein:''}</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',rowGap:6}}>
          <select value={ent.type} onChange={v=>{const newType=v.target.value;const losingOfficer=['S Corporation','C Corporation'].includes(ent.type)&&!['S Corporation','C Corporation'].includes(newType);if(losingOfficer)setManOfficerSal('');onUpdate(idx,{...ent,type:newType,pnl:losingOfficer&&ent.pnl?{...ent.pnl,officerSalary:0}:ent.pnl})}} style={{padding:'4px 8px',borderRadius:6,border:'none',fontSize:12,fontWeight:600,color:color,cursor:'pointer',background:'#fff'}}>
            {ENTITY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={()=>onCompare(idx)} style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:700,color:color,background:'#fff',cursor:'pointer'}}>⚖ Compare</button>
          {canRemove&&<button onClick={()=>onRemove(idx)} style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.8)',background:'rgba(0,0,0,0.2)',cursor:'pointer'}}>✕ Remove</button>}
          <button onClick={()=>setShowDetails(!showDetails)} style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:700,color:color,background:'#fff',cursor:'pointer'}}>{showDetails?'▲':'▼'} Details</button>
        </div>
      </div>
      {showDetails&&(
        <div style={{background:color+'15',padding:'12px 20px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
          <div>
            <label style={lbl}>EIN</label>
            <input value={ent.ein||''} onChange={v=>onUpdate(idx,{...ent,ein:v.target.value})} placeholder="XX-XXXXXXX" style={inp} />
          </div>
          <div>
            <label style={lbl}>Formation Date</label>
            <input type="date" value={ent.formationDate||''} onChange={v=>onUpdate(idx,{...ent,formationDate:v.target.value})} style={inp} />
          </div>
          <div>
            <label style={lbl}>Ownership %</label>
            <input type="number" value={ent.own||'100'} min="1" max="100" onChange={v=>onUpdate(idx,{...ent,own:v.target.value})} style={{...inp,background:'#EFF6FF',fontWeight:700,color:B}} />
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <button onClick={()=>setShowAdvK1(!showAdvK1)} style={{background:'none',border:'none',fontSize:11,fontWeight:700,color:SL,cursor:'pointer',letterSpacing:'1px',display:'flex',alignItems:'center',gap:6}}>
              {showAdvK1?'▲':'▼'} Advanced K-1 items
            </button>
          </div>
          {showAdvK1&&(
            <div style={{gridColumn:'1/-1',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>Section 179 disposition gain (K-1 Box 17K) <InfoTip text="Form 4797 Part II ordinary gain allocated to you — flows to Schedule 1 Line 4. Do NOT include in LTCG." /></label>
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
                <label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>QBI: entity W-2 wages (S-corp K-1 Box 17V / partnership K-1 Box 20Z) <InfoTip text="W-2 wages paid by the entity — used in the §199A W-2 wage limitation (IRC §199A(b)(2)(B)(i))." /></label>
                <MoneyInput value={ent.box17V_wages || 0} onChange={n => onUpdate(idx, {...ent, box17V_wages: n})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={{display:'block',fontSize:12,color:'#475569',marginBottom:4,fontWeight:600}}>QBI: UBIA of qualified property (S-corp K-1 Box 17V / partnership K-1 Box 20Z) <InfoTip text="Unadjusted basis immediately after acquisition of qualified property — used in the §199A UBIA limitation (IRC §199A(b)(2)(B)(ii))." /></label>
                <MoneyInput value={ent.box17V_ubia || 0} onChange={n => onUpdate(idx, {...ent, box17V_ubia: n})} placeholder="0" style={inp} />
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569',fontWeight:600,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!ent.isSSTB} onChange={e=>onUpdate(idx,{...ent,isSSTB:e.target.checked})} />
                  Specified Service Trade or Business (SSTB) <InfoTip text="SSSTBs (law, health, consulting, financial services, athletics, performing arts, etc.) are subject to the §199A phase-out at high income levels. Check if the entity's primary activity is an SSTB." />
                </label>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{padding:20,background:'#fff'}}>
        {!ent.pnl ? (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              {/* FIX (F1-07): Section header updates contextually with mode */}
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'1px'}}>
                {manual ? 'MANUAL P&L ENTRY' : 'CONNECT ACCOUNTING SOFTWARE'}
              </div>
              <button onClick={()=>setManual(!manual)} style={{padding:'4px 12px',background:'none',border:'1px solid #E2E8F0',borderRadius:6,fontSize:11,fontWeight:700,color:SL,cursor:'pointer'}}>
                {manual ? 'Use Software' : 'Enter Manually'}
              </button>
            </div>
            {!manual&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              {INTS.map(app=>(
                <button key={app.id} onClick={()=>connectSoftware(app.id)} style={{background:app.bg,border:'1px solid '+app.color+'33',borderRadius:10,padding:'14px 10px',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:6,transition:'transform 0.15s'}}>
                  <div style={{width:36,height:36,borderRadius:8,background:app.color,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:800}}>{app.abbr}</div>
                  <div style={{fontSize:11,fontWeight:600,color:app.color}}>{app.name}</div>
                </button>
              ))}
            </div>}
            {manual&&<div style={{background:'#F8FAFC',borderRadius:10,padding:16,border:'1px solid #E2E8F0'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={lbl}>Total Revenue</label>
                  <MoneyInput value={manRev} onChange={setManRev} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Operating Expenses (excl. Owner W-2) <InfoTip text="All business expenses except officer salary — rent, software, contractor fees, COGS, etc." /></label>
                  <MoneyInput value={manExp} onChange={setManExp} placeholder="0" style={inp} />
                </div>
                {['S Corporation','C Corporation'].includes(ent.type)&&(
                  <div style={{gridColumn:'1/-1'}}>
                    <label style={lbl}>Officer W-2 Salary (entered separately) <InfoTip text="Your W-2 salary as an S-corp or C-corp officer. Entered separately because it is both a deductible expense to the corporation AND income to you — the app accounts for both sides automatically." /></label>
                    <MoneyInput value={manOfficerSal} onChange={setManOfficerSal} placeholder="0" style={inp} />
                  </div>
                )}
              </div>
              <button onClick={applyManual} style={{marginTop:14,width:'100%',padding:'10px',background:G,border:'none',borderRadius:8,color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>Apply P&L</button>
            </div>}
          </div>
        ) : (
          <div>
            {ent.pnl.categories&&Object.keys(ent.pnl.categories).length>0&&<ExpenseBreakdown categories={ent.pnl.categories} total={ent.pnl.totalExpenses} />}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:14}}>
              <div style={{textAlign:'center',background:'#F8FAFC',borderRadius:10,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.5px',marginBottom:4}}>GROSS REVENUE</div>
                <div style={{fontSize:20,fontWeight:800,color:N}}>{fmt(ent.pnl.grossRevenue)}</div>
              </div>
              <div style={{textAlign:'center',background:'#FFF5F5',borderRadius:10,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.5px',marginBottom:4}}>TOTAL EXPENSES</div>
                <div style={{fontSize:20,fontWeight:800,color:R}}>{fmt(ent.pnl.totalExpenses)}</div>
              </div>
              <div style={{textAlign:'center',background:ent.pnl.netProfit>=0?'#F0FDF4':'#FFF5F5',borderRadius:10,padding:14}}>
                <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.5px',marginBottom:4}}>{netIncomeLabel.toUpperCase()}</div>
                <div style={{fontSize:20,fontWeight:800,color:ent.pnl.netProfit>=0?G:R}}>{fmt(ent.pnl.netProfit)}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}>
              <div style={{textAlign:'center',background:'#EFF6FF',borderRadius:10,padding:12}}>
                <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.5px',marginBottom:4}}>OWNERSHIP</div>
                <div style={{fontSize:16,fontWeight:800,color:B}}>{ent.own||100}%</div>
              </div>
              <div style={{textAlign:'center',background:'#EFF6FF',borderRadius:10,padding:12}}>
                <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.5px',marginBottom:4}}>{k1ShareLabel}</div>
                <div style={{fontSize:16,fontWeight:800,color:k1>=0?B:R}}>{fmt(k1)}</div>
              </div>
            </div>
            <button onClick={()=>onUpdate(idx,{...ent,pnl:null,connectedId:null,isManual:false})} style={{marginTop:12,background:'none',border:'none',fontSize:11,color:SL,cursor:'pointer',textDecoration:'underline'}}>Disconnect / re-enter data</button>
          </div>
        )}
      </div>
    </div>
  )
}

function TemplatePicker({onSelect,onClose}){return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:18,padding:32,width:520,maxWidth:'95vw',maxHeight:'85vh',overflowY:'auto'}}><h3 style={{margin:'0 0 20px',fontSize:18,fontWeight:800,color:'#0D1B3E'}}>Add from Template</h3><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>{TEMPLATES.map(t=><button key={t.label} onClick={()=>{onSelect(t);onClose()}} style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:12,padding:16,cursor:'pointer',textAlign:'left',transition:'border-color 0.15s'}}><div style={{fontSize:24,marginBottom:8}}>{t.icon}</div><div style={{fontSize:13,fontWeight:700,color:'#0D1B3E',marginBottom:4}}>{t.label}</div><div style={{fontSize:11,color:'#475569'}}>{t.desc}</div></button>)}</div></div></div>)}

function ImportModal({onImport,onClose}){
  function handleFile(f){
    if(!f)return
    const r=new FileReader()
    r.onload=e=>{
      try{const entities=parseCSVImport(e.target.result);if(entities.length)onImport(entities)}catch(err){alert('Could not parse CSV. Please check the format.')}
      onClose()
    }
    r.readAsText(f)
  }
  return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:18,padding:32,width:480,maxWidth:'95vw'}}><h3 style={{margin:'0 0 16px',fontSize:18,fontWeight:800,color:'#0D1B3E'}}>Import from CSV</h3><p style={{fontSize:13,color:'#475569',marginBottom:20}}>CSV must have columns: Name, Entity Type, EIN, Formation Date, Ownership %, Gross Revenue, Total Expenses</p><input type="file" accept=".csv" onChange={e=>handleFile(e.target.files[0])} style={{width:'100%',marginBottom:16}} /><div style={{display:'flex',gap:10,justifyContent:'flex-end'}}><button onClick={onClose} style={{padding:'8px 16px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer',fontSize:13}}>Cancel</button></div></div></div>)
}

export default function CalculateTax() {
  const nav = useNavigate()
  const raw = readStep1StateRaw()
  const [entities, setEntities] = React.useState(
    raw.entities && raw.entities.length > 0
      ? raw.entities
      : [{ name: 'Business 1', type: 'S Corporation', own: '100', ein: '', state: '', formationDate: '', pnl: null, connectedId: null, isManual: false }]
  )
  const [isCoopPatron, setIsCoopPatronState] = React.useState(readIsCoopPatron())
  const [showTemplates, setShowTemplates] = React.useState(false)
  const [showImport, setShowImport] = React.useState(false)
  const [dragIdx, setDragIdx] = React.useState(null)
  const [compareIdx, setCompareIdx] = React.useState(null)

  // FIX (F1-05): persist to session state whenever entities change
  React.useEffect(() => {
    writeStep1State({ entities, isCoopPatron })
  }, [entities, isCoopPatron])

  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const mp = {qb_token:'quickbooks',xero_token:'xero',wave_token:'wave',fb_token:'freshbooks'}
    const xeroRefresh=p.get('xero_refresh');if(xeroRefresh)localStorage.setItem('ts360_xero_refresh',xeroRefresh)
    const entityIdx=parseInt(sessionStorage.getItem('ts360_connecting_entity')||'0')
    let foundInUrl=false
    for(const[k,pid] of Object.entries(mp)){
      const tok=p.get(k)
      if(tok){foundInUrl=true;localStorage.setItem('ts360_'+pid+'_connected','true');localStorage.setItem('ts360_'+pid+'_token',tok)}
    }
    if(!foundInUrl){
      const pids=['quickbooks','xero','wave','freshbooks']
      for(const pid of pids){
        const tok=localStorage.getItem('ts360_'+pid+'_token')
        const connected=localStorage.getItem('ts360_'+pid+'_connected')
        if(tok&&connected==='true'){
          const extra=localStorage.getItem('ts360_'+pid+'_extra')
          fetchEntityPnL(0,pid,tok,extra)
          break
        }
      }
    }
  }, [])

  async function fetchEntityPnL(idx,pid,tok,extra){if(pid==='xero'){const refresh=localStorage.getItem('ts360_xero_refresh');if(refresh)extra=refresh}try{let url=API_BASE_URL+'/auth/'+pid+'/data?token='+encodeURIComponent(tok);if(pid==='quickbooks'&&extra)url+='&realm='+extra;if(pid==='xero'&&extra)url+='&tenant='+extra;if(pid==='freshbooks'&&extra)url+='&account='+extra;const d=await(await fetch(url)).json();if(d&&!d.error)updateEntity(idx,{...entities[idx],pnl:d,connectedId:pid})}catch(ex){console.error(ex)}}
  function updateEntity(idx,ent){setEntities(prev=>{const next=[...prev];next[idx]=ent;return next})}
  function removeEntity(idx){setEntities(prev=>prev.filter((_,i)=>i!==idx))}
  function addFromTemplate(t){setEntities(prev=>[...prev,{name:t.label,type:t.type,own:t.own,ein:'',state:'',formationDate:'',pnl:t.defaults.grossRevenue?{grossRevenue:parseMoney(t.defaults.grossRevenue),totalExpenses:parseMoney(t.defaults.operatingExpenses),netProfit:parseMoney(t.defaults.grossRevenue)-parseMoney(t.defaults.operatingExpenses),categories:{}}:null,connectedId:null,isManual:!!t.defaults.grossRevenue}])}
  function handleImport(imported){setEntities(prev=>[...prev,...imported])}

  function onDragStart(idx){setDragIdx(idx)}
  function onDragOver(e,idx){e.preventDefault();if(dragIdx===null||dragIdx===idx)return;setEntities(prev=>{const next=[...prev];const[moved]=next.splice(dragIdx,1);next.splice(idx,0,moved);return next});setDragIdx(idx)}
  function onDrop(){setDragIdx(null)}
  function onDragEnd(){setDragIdx(null)}

  // FIX (F1-02): proceed() navigates to Step 2. Saves state first.
  function proceed() {
    writeStep1State({ entities, isCoopPatron })
    nav('/tax-return')
  }

  function saveRecord() {
    writeStep1State({ entities, isCoopPatron })
    const existing = JSON.parse(localStorage.getItem('ts360_records_' + localStorage.getItem('ts360_email')) || '[]')
    const record = {
      id: Date.now(),
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
    localStorage.setItem('ts360_records_' + localStorage.getItem('ts360_email'), JSON.stringify(existing.slice(0, 20)))
    alert('✅ Record saved! View it on your Dashboard.')
  }

  const hasData = entities.some(e => e.pnl)

  return (
    // FIX (F1-03): paddingBottom ensures "Save Record" button clears the 34px fixed AuthFooter.
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div onClick={() => nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <svg width="28" height="28" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#0D1B3E" /><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3" /><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55" /><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8" /><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white" /></svg>
            <span style={{ fontWeight: 800, color: '#0D1B3E', fontSize: 17 }}>TaxStat<span style={{ color: '#2563EB' }}>360</span></span>
          </div>
          <div style={{ background: '#2563EB', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>Step 1 of 2 — Business</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImport(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>📂 Import CSV</button>
          <button onClick={() => nav('/dashboard')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>📂 Dashboard</button>
          <button onClick={() => nav('/ai-analysis')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>AI Analysis</button>
          <button onClick={() => { localStorage.clear(); nav('/login') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>Sign Out</button>
          <button onClick={() => nav('/settings')} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>⚙ Settings</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0D1B3E', margin: '0 0 8px' }}>Entity Calculator</h1>
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>Add all your business entities. Drag ⠿ to reorder. Click ▼ Details to add EIN &amp; formation date.</p>
        </div>

        <DismissibleNotice storageKey="ts360_notice_calc_v2">
          TaxStat360 calculates <strong>federal tax estimates</strong> for planning purposes only. Results are not professional tax advice and do not account for state taxes, AMT in all cases, or your complete financial picture. Consult a licensed CPA or tax professional before making any filing or financial decisions.
        </DismissibleNotice>

        {entities.map((ent, idx) => (
          <div
            key={idx}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={e => onDragOver(e, idx)}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          >
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

        {/* Add entity actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setShowTemplates(true)} style={{ padding: '14px', borderRadius: 12, border: '2px dashed #CBD5E1', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>🗂 Add from Template</button>
          <button onClick={() => setEntities(prev => [...prev, { name: 'Business ' + (prev.length + 1), type: 'S Corporation', own: '100', ein: '', state: '', formationDate: '', pnl: null, connectedId: null, isManual: false }])} style={{ padding: '14px', borderRadius: 12, border: '2px dashed #CBD5E1', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>+ Add Entity</button>
        </div>

        {/* Co-op patron checkbox */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={isCoopPatron} onChange={e => { setIsCoopPatronState(e.target.checked); writeIsCoopPatron(e.target.checked) }} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1B3E' }}>I am a patron of an agricultural or horticultural cooperative</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Check this if you received Form 1099-PATR or a K-1 from an ag/hort co-op (e.g., dairy, grain, fruit/vegetable, or livestock). Per IRS Form 8995 instructions, co-op patrons file Form 8995-A regardless of taxable income. The §199A(g)(2) patron reduction (Form 8995-A Schedule D) is not currently calculated by this tool.</div>
            </div>
          </label>
        </div>

        {/* FIX (F1-05): Empty state only shown when no entities exist */}
        {entities.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: SL }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🏢</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0D1B3E', marginBottom: 6 }}>Add your business entities above</div>
            <div style={{ fontSize: 13 }}>Connect accounting software, enter P&L manually, or import from CSV</div>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, flexDirection: 'column', marginTop: 8 }}>
          {/* FIX (F1-02): "Continue to Step 2" primary CTA — always visible at bottom of Step 1 */}
          <button
            onClick={proceed}
            style={{
              width: '100%',
              padding: '16px',
              background: '#2563EB',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            Continue to Step 2: Personal Return →
          </button>
          <button
            onClick={saveRecord}
            style={{
              width: '100%',
              padding: '12px',
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              color: '#475569',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            💾 Save Record
          </button>
        </div>
      </div>

      {showTemplates && <TemplatePicker onSelect={addFromTemplate} onClose={() => setShowTemplates(false)} />}
      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      <EntityCompareModal
        isOpen={compareIdx !== null}
        onClose={() => setCompareIdx(null)}
        entity={compareIdx !== null ? entities[compareIdx] : null}
        entities={entities}
        entityIdx={compareIdx}
        personalContext={() => { const pc = readPersonalContext(); return { taxyear: pc.taxyear, status: pc.filingStatus } }}
      />
    </div>
  )
}
