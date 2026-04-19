import React from 'react'
import { useNavigate } from 'react-router-dom'

const N='#0D1B3E',B='#2563EB',SL='#475569',G='#16a34a',R='#dc2626'
const API='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
const INTS=[{id:'quickbooks',name:'QuickBooks',color:'#2CA01C',abbr:'QB'},{id:'xero',name:'Xero',color:'#13B5EA',abbr:'XE'},{id:'wave',name:'Wave',color:'#2C6ECB',abbr:'WV'},{id:'freshbooks',name:'FreshBooks',color:'#1a9c3e',abbr:'FB'}]
const fmt=n=>n<0?'($'+Math.abs(Math.round(n)||0).toLocaleString('en-US')+')':'$'+Math.abs(Math.round(n)||0).toLocaleString('en-US')
const nv=v=>parseFloat((v||'').toString().replace(/[^0-9.-]/g,''))||0
const OWN=[['100','100%'],['75','75%'],['67','67%'],['60','60%'],['50','50%'],['40','40%'],['33','33%'],['25','25%'],['20','20%'],['10','10%'],['5','5%'],['1','1%']]
const ENTITY_TYPES=['S-Corp','LLC (Partnership)','LLC (Single-Member)','Sole Proprietorship','C-Corp','Partnership']
const COLORS=['#2563EB','#16a34a','#dc2626','#7c3aed','#d97706','#0891b2']
const US_STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const TEMPLATES=[
  {label:'S-Corp Owner',icon:'🏢',type:'S-Corp',own:'100',defaults:{grossRevenue:'250000',operatingExpenses:'80000'},desc:'Owner-operator, reasonable salary set'},
  {label:'Real Estate LLC',icon:'🏠',type:'LLC (Partnership)',own:'50',defaults:{grossRevenue:'120000',operatingExpenses:'60000'},desc:'Rental income, 50/50 partnership'},
  {label:'Solo Consultant',icon:'💼',type:'Sole Proprietorship',own:'100',defaults:{grossRevenue:'150000',operatingExpenses:'30000'},desc:'Freelance / independent contractor'},
  {label:'Multi-Member LLC',icon:'🤝',type:'LLC (Partnership)',own:'33',defaults:{grossRevenue:'500000',operatingExpenses:'200000'},desc:'3-partner LLC, equal ownership'},
  {label:'C-Corp',icon:'🏦',type:'C-Corp',own:'100',defaults:{grossRevenue:'1000000',operatingExpenses:'600000'},desc:'Corporate entity, retained earnings'},
  {label:'Blank Entity',icon:'➕',type:'S-Corp',own:'100',defaults:{},desc:'Start from scratch'},
]

function exportEntitiesToCSV(entities){
  const rows=[['Name','Entity Type','EIN','State','Formation Date','Ownership %','Gross Revenue','Total Expenses','Net Profit (Loss)','K-1 Share']]
  entities.forEach(ent=>{
    const k1=ent.pnl?Math.round(ent.pnl.netProfit*(parseInt(ent.own)/100)):''
    rows.push([ent.name,ent.type,ent.ein||'',ent.state||'',ent.formationDate||'',ent.own+'%',ent.pnl?Math.round(ent.pnl.grossRevenue):'',ent.pnl?Math.round(ent.pnl.totalExpenses):'',ent.pnl?Math.round(ent.pnl.netProfit):'',k1])
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
    const[name,type,ein,state,formationDate,own,grossRevenue,totalExpenses]=cols
    const rev=parseFloat(grossRevenue)||0,exp=parseFloat(totalExpenses)||0
    const ownPct=own?own.replace('%',''):'100'
    return{name:name||'Business '+(i+1),type:ENTITY_TYPES.includes(type)?type:'S-Corp',ein:ein||'',state:state||'',formationDate:formationDate||'',own:ownPct,pnl:(rev||exp)?{grossRevenue:rev,totalExpenses:exp,netProfit:rev-exp,categories:{}}:null,connectedId:null,isManual:!!(rev||exp)}
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

function EntityCard({ent,idx,onUpdate,onRemove,canRemove}){
  const[syn,setSyn]=React.useState(null)
  const[manual,setManual]=React.useState(false)
  const[manRev,setManRev]=React.useState('')
  const[manExp,setManExp]=React.useState('')
  const[showDetails,setShowDetails]=React.useState(false)
  const color=COLORS[idx%COLORS.length]
  const inp={width:'100%',padding:'8px 10px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:N,boxSizing:'border-box',outline:'none',fontFamily:'inherit',background:'#fff'}
  const lbl={fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.5px'}

  async function fetchPnL(pid,tok,extra){setSyn(pid);try{let url=API+'/auth/'+pid+'/data?token='+encodeURIComponent(tok);if(pid==='quickbooks'&&extra)url+='&realm='+extra;if(pid==='xero'&&extra)url+='&tenant='+extra;if(pid==='freshbooks'&&extra)url+='&account='+extra;const d=await(await fetch(url)).json();if(d&&!d.error)onUpdate(idx,{...ent,pnl:d,connectedId:pid})}catch(ex){console.error(ex)}}
  function connectSoftware(pid){sessionStorage.setItem('ts360_connecting_entity',idx);window.location.href=API+'/auth/'+pid+'/connect'}
  function applyManual(){const r=nv(manRev),ex=nv(manExp);if(r>0||ex>0)onUpdate(idx,{...ent,pnl:{grossRevenue:r,totalExpenses:ex,netProfit:r-ex,categories:{}},connectedId:null,isManual:true})}
  const k1=ent.pnl?Math.round(ent.pnl.netProfit*(parseInt(ent.own)/100)):0

  return(
    <div style={{border:'2px solid '+color,borderRadius:14,overflow:'hidden',marginBottom:16}}>
      <div style={{background:color,padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{color:'rgba(255,255,255,0.5)',fontSize:18,cursor:'grab',userSelect:'none'}}>⠿</div>
          <div style={{width:28,height:28,borderRadius:7,background:'rgba(0,0,0,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:'#fff'}}>{idx+1}</div>
          <div>
            <div contentEditable suppressContentEditableWarning onBlur={v=>onUpdate(idx,{...ent,name:v.target.innerText.trim()||'Business '+(idx+1)})} onKeyDown={v=>{if(v.key==='Enter')v.target.blur()}} style={{background:'transparent',border:'none',outline:'none',fontSize:15,fontWeight:700,color:'#fff',width:180,fontFamily:'inherit',cursor:'text',minWidth:80}}>{ent.name}</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.7)'}}>{ent.type}{ent.state?' · '+ent.state:''}{ent.ein?' · EIN '+ent.ein:''}</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <select value={ent.type} onChange={v=>onUpdate(idx,{...ent,type:v.target.value})} style={{padding:'4px 8px',borderRadius:6,border:'none',fontSize:12,fontWeight:600,color:color,cursor:'pointer',background:'#fff'}}>
            {ENTITY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={()=>setShowDetails(!showDetails)} style={{padding:'4px 10px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:6,fontSize:11,fontWeight:600,color:'#fff',cursor:'pointer'}}>{showDetails?'▲ Details':'▼ Details'}</button>
          {canRemove&&<button onClick={()=>onRemove(idx)} style={{padding:'4px 10px',background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.4)',borderRadius:6,fontSize:11,fontWeight:700,color:'#fff',cursor:'pointer'}}>Remove</button>}
        </div>
      </div>

      {showDetails&&(
        <div style={{background:'#F8FAFC',padding:'14px 20px',borderBottom:'1px solid #E2E8F0'}}>
          <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'1px',marginBottom:10}}>ENTITY DETAILS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12}}>
            <div><label style={lbl}>EIN</label><input value={ent.ein||''} onChange={e=>onUpdate(idx,{...ent,ein:e.target.value})} placeholder="XX-XXXXXXX" style={inp}/></div>
            <div><label style={lbl}>State</label><select value={ent.state||''} onChange={e=>onUpdate(idx,{...ent,state:e.target.value})} style={inp}><option value="">— Select —</option>{US_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
            <div><label style={lbl}>Formation Date</label><input type="date" value={ent.formationDate||''} onChange={e=>onUpdate(idx,{...ent,formationDate:e.target.value})} style={inp}/></div>
            <div><label style={lbl}>Ownership %</label><select value={ent.own} onChange={v=>onUpdate(idx,{...ent,own:v.target.value})} style={{...inp,fontWeight:700,border:'2px solid '+color}}>{OWN.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
          </div>
        </div>
      )}

      <div style={{padding:20,background:'#fff'}}>
        {!ent.pnl&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'1px'}}>CONNECT ACCOUNTING SOFTWARE</div>
              <button onClick={()=>setManual(!manual)} style={{padding:'4px 12px',background:'none',border:'1px solid '+B,borderRadius:5,fontSize:11,fontWeight:600,color:B,cursor:'pointer'}}>{manual?'Use Software':'Enter Manually'}</button>
            </div>
            {!manual&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>{INTS.map(i=><button key={i.id} onClick={()=>connectSoftware(i.id)} style={{padding:'10px 6px',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,fontSize:11,fontWeight:700,color:N,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:5}}><div style={{width:28,height:28,borderRadius:6,background:i.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff'}}>{i.abbr}</div>{i.name}</button>)}</div>}
            {manual&&<div style={{background:'#F8FAFC',borderRadius:10,padding:16,border:'1px solid #E2E8F0'}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}><div><label style={lbl}>Total Revenue</label><input value={manRev} onChange={v=>setManRev(v.target.value)} placeholder="0" type="number" style={{width:'100%',padding:'9px 12px',border:'2px solid #E2E8F0',borderRadius:7,fontSize:14,boxSizing:'border-box',fontFamily:'inherit'}}/></div><div><label style={lbl}>Total Expenses</label><input value={manExp} onChange={v=>setManExp(v.target.value)} placeholder="0" type="number" style={{width:'100%',padding:'9px 12px',border:'2px solid #E2E8F0',borderRadius:7,fontSize:14,boxSizing:'border-box',fontFamily:'inherit'}}/></div></div><button onClick={applyManual} style={{padding:'8px 18px',background:G,border:'none',borderRadius:7,fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer'}}>Apply P&L</button></div>}
          </div>
        )}
        {ent.pnl&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'1px'}}>{ent.isManual?'MANUAL ENTRY':'P&L FROM '+(ent.connectedId||'').toUpperCase()}</div>
              <div style={{display:'flex',gap:6}}>
                {!ent.isManual&&ent.connectedId&&<button onClick={()=>{const t=localStorage.getItem('ts360_'+ent.connectedId+'_token'),x=localStorage.getItem('ts360_'+ent.connectedId+'_extra');if(t)fetchPnL(ent.connectedId,t,x)}} style={{padding:'3px 9px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:5,fontSize:11,fontWeight:600,color:B,cursor:'pointer'}}>{syn?'Refreshing...':'Refresh'}</button>}
                <button onClick={()=>onUpdate(idx,{...ent,pnl:null,connectedId:null,isManual:false})} style={{padding:'3px 9px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:5,fontSize:11,fontWeight:600,color:R,cursor:'pointer'}}>Disconnect</button>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
              {[['Revenue',fmt(ent.pnl.grossRevenue),G],['Expenses',fmt(ent.pnl.totalExpenses),R],['Net Profit (Loss)',fmt(ent.pnl.netProfit),ent.pnl.netProfit>=0?G:R]].map(([l,v,c])=>(
                <div key={l} style={{background:'#F8FAFC',borderRadius:8,padding:'10px 14px',textAlign:'center',border:'1px solid #F1F5F9'}}>
                  <div style={{fontSize:10,color:SL,marginBottom:2}}>{l}</div>
                  <div style={{fontSize:17,fontWeight:800,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:14,alignItems:'center'}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:5}}>YOUR OWNERSHIP %</label>
                <select value={ent.own} onChange={v=>onUpdate(idx,{...ent,own:v.target.value})} style={{width:'100%',padding:'9px 12px',border:'2px solid '+color,borderRadius:8,fontSize:15,fontWeight:700,color:N,background:'#fff',cursor:'pointer',fontFamily:'inherit'}}>
                  {OWN.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div style={{background:color,borderRadius:10,padding:'12px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',color:'#fff'}}>
                <div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.6)',marginBottom:2}}>K-1 DISTRIBUTIVE SHARE</div>
                  <div style={{fontSize:26,fontWeight:800,color:k1>=0?'#4ADE80':'#F87171'}}>{fmt(k1)}</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',marginTop:2}}>{fmt(ent.pnl.netProfit)} x {ent.own}%</div>
                </div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.6)',maxWidth:160,textAlign:'right',lineHeight:1.4}}>{k1>=0?'Flows to Schedule E on your personal 1040':'Loss may offset other income on personal return'}</div>
              </div>
            </div>
            {ent.pnl.categories&&Object.keys(ent.pnl.categories).length>0&&<ExpenseBreakdown categories={ent.pnl.categories} total={ent.pnl.totalExpenses}/>}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplatePicker({onSelect,onClose}){
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(13,27,62,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:16,padding:28,maxWidth:560,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div><h3 style={{color:N,fontSize:18,fontWeight:800,margin:0}}>Choose Entity Template</h3><p style={{color:SL,fontSize:12,margin:'4px 0 0'}}>Start with pre-configured defaults or blank</p></div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:SL}}>×</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {TEMPLATES.map(t=>(
            <button key={t.label} onClick={()=>onSelect(t)} style={{padding:'14px 16px',background:'#F8FAFC',border:'1.5px solid #E2E8F0',borderRadius:10,cursor:'pointer',textAlign:'left'}} onMouseOver={e=>{e.currentTarget.style.borderColor=B;e.currentTarget.style.background='#EFF6FF'}} onMouseOut={e=>{e.currentTarget.style.borderColor='#E2E8F0';e.currentTarget.style.background='#F8FAFC'}}>
              <div style={{fontSize:22,marginBottom:6}}>{t.icon}</div>
              <div style={{fontWeight:700,color:N,fontSize:13,marginBottom:3}}>{t.label}</div>
              <div style={{fontSize:11,color:SL,lineHeight:1.4}}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function ImportModal({onImport,onClose}){
  const[dragging,setDragging]=React.useState(false)
  const[error,setError]=React.useState('')
  const fileRef=React.useRef()
  function handleFile(file){
    if(!file)return
    if(!file.name.match(/\.(csv|txt)$/i)){setError('Please upload a CSV file');return}
    const reader=new FileReader()
    reader.onload=e=>{try{const entities=parseCSVImport(e.target.result);if(!entities.length){setError('No valid rows found');return}onImport(entities)}catch(ex){setError('Could not parse CSV')}}
    reader.readAsText(file)
  }
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(13,27,62,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:16,padding:28,maxWidth:480,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{color:N,fontSize:18,fontWeight:800,margin:0}}>Import Entities from CSV</h3>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:SL}}>×</button>
        </div>
        <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:8,padding:12,marginBottom:16,fontSize:11,color:SL,fontFamily:'monospace',lineHeight:1.6}}>
          Name, Entity Type, EIN, State, Formation Date, Ownership %, Gross Revenue, Total Expenses
        </div>
        <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0])}} onClick={()=>fileRef.current.click()} style={{border:'2px dashed '+(dragging?B:'#CBD5E1'),borderRadius:10,padding:'32px 20px',textAlign:'center',cursor:'pointer',background:dragging?'#EFF6FF':'#fff',marginBottom:12}}>
          <div style={{fontSize:32,marginBottom:8}}>📂</div>
          <div style={{fontWeight:700,color:N,fontSize:14,marginBottom:4}}>Drop CSV here or click to browse</div>
          <div style={{fontSize:12,color:SL}}>Supports .csv files</div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
        </div>
        {error&&<div style={{background:'#FEF2F2',color:R,padding:'8px 12px',borderRadius:7,fontSize:12,marginBottom:10}}>{error}</div>}
        <p style={{fontSize:11,color:SL,margin:0,textAlign:'center'}}>Revenue & expenses auto-populate as manual P&L entries</p>
      </div>
    </div>
  )
}

export default function CalculateTax(){
  const nav=useNavigate()
  const[entities,setEntities]=React.useState([{name:'Business 1',type:'S-Corp',own:'100',ein:'',state:'',formationDate:'',pnl:null,connectedId:null,isManual:false}])
  const[showTemplates,setShowTemplates]=React.useState(false)
  const[showImport,setShowImport]=React.useState(false)
  const[dragIdx,setDragIdx]=React.useState(null)
  const[dragOverIdx,setDragOverIdx]=React.useState(null)

  React.useEffect(()=>{
    const p=new URLSearchParams(window.location.search)
    const mp={qb_token:'quickbooks',xero_token:'xero',wave_token:'wave',fb_token:'freshbooks'}
    const xeroRefresh=p.get('xero_refresh');if(xeroRefresh)localStorage.setItem('ts360_xero_refresh',xeroRefresh)
    const entityIdx=parseInt(sessionStorage.getItem('ts360_connecting_entity')||'0')
    // Check for OAuth callback tokens in URL first
    let foundInUrl=false
    for(const[k,pid] of Object.entries(mp)){
      const tok=p.get(k)
      if(tok){foundInUrl=true;localStorage.setItem('ts360_'+pid+'_connected','true');localStorage.setItem('ts360_'+pid+'_token',tok);const ex={quickbooks:p.get('realm'),xero:p.get('tenant'),freshbooks:p.get('account')};if(ex[pid])localStorage.setItem('ts360_'+pid+'_extra',ex[pid]);window.history.replaceState({},'','/calculate-tax');fetchEntityPnL(entityIdx,pid,tok,ex[pid]);break}
    }
    // If no URL token, auto-load any already-connected integrations into entity 0
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
  },[])

  async function fetchEntityPnL(idx,pid,tok,extra){if(pid==='xero'){const refresh=localStorage.getItem('ts360_xero_refresh');if(refresh){try{const r=await fetch(API+'/auth/xero/refresh?refresh='+encodeURIComponent(refresh));const d=await r.json();if(d.access_token){tok=d.access_token;localStorage.setItem('ts360_xero_token',tok);if(d.refresh_token)localStorage.setItem('ts360_xero_refresh',d.refresh_token)}}catch(e){}}}try{let url=API+'/auth/'+pid+'/data?token='+encodeURIComponent(tok);if(pid==='quickbooks'&&extra)url+='&realm='+extra;if(pid==='xero'&&extra)url+='&tenant='+extra;if(pid==='freshbooks'&&extra)url+='&account='+extra;const d=await(await fetch(url)).json();if(d&&!d.error){setEntities(prev=>{const next=[...prev];if(next[idx])next[idx]={...next[idx],pnl:d,connectedId:pid};return next})}}catch(ex){console.error(ex)}}
  function updateEntity(idx,updated){setEntities(prev=>{const n=[...prev];n[idx]=updated;return n})}
  function removeEntity(idx){setEntities(prev=>prev.filter((_,i)=>i!==idx))}

  function addFromTemplate(t){
    const rev=parseFloat(t.defaults.grossRevenue)||0,exp=parseFloat(t.defaults.operatingExpenses)||0
    const newEnt={name:t.label==='Blank Entity'?'Business '+(entities.length+1):t.label,type:t.type,own:t.own,ein:'',state:'',formationDate:'',pnl:Object.keys(t.defaults).length>0?{grossRevenue:rev,totalExpenses:exp,netProfit:rev-exp,categories:{}}:null,connectedId:null,isManual:Object.keys(t.defaults).length>0}
    setEntities(prev=>[...prev,newEnt]);setShowTemplates(false)
  }

  function handleImport(imported){setEntities(prev=>[...prev,...imported]);setShowImport(false)}

  function onDragStart(idx){setDragIdx(idx)}
  function onDragOver(e,idx){e.preventDefault();setDragOverIdx(idx)}
  function onDrop(idx){if(dragIdx===null||dragIdx===idx)return;setEntities(prev=>{const next=[...prev];const[moved]=next.splice(dragIdx,1);next.splice(idx,0,moved);return next});setDragIdx(null);setDragOverIdx(null)}
  function onDragEnd(){setDragIdx(null);setDragOverIdx(null)}

  const k1Total=entities.reduce((sum,ent)=>ent.pnl?sum+Math.round(ent.pnl.netProfit*(parseInt(ent.own)/100)):sum,0)
  const anyPnl=entities.some(e=>e.pnl)

  function proceed(){
    const k1Data=entities.filter(e=>e.pnl).map(e=>({name:e.name,type:e.type,own:e.own,netProfit:e.pnl.netProfit,k1:Math.round(e.pnl.netProfit*(parseInt(e.own)/100))}))
    sessionStorage.setItem('ts360_k1',k1Total);sessionStorage.setItem('ts360_own','100');sessionStorage.setItem('ts360_entities',JSON.stringify(k1Data));nav('/tax-return')
  }

  return(
    <>
      <style>{'input:focus,select:focus{outline:2px solid #0D1B3E !important;box-shadow:none !important;}'}</style>
      {showTemplates&&<TemplatePicker onSelect={addFromTemplate} onClose={()=>setShowTemplates(false)}/>}
      {showImport&&<ImportModal onImport={handleImport} onClose={()=>setShowImport(false)}/>}
      <div style={{minHeight:'100vh',background:'#F8FAFC',fontFamily:'system-ui,sans-serif',color:N}}>
        <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 40px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:32,height:32,background:N,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" fill="white" rx="1"/><rect x="10" y="7" width="4" height="14" fill="white" rx="1"/><rect x="17" y="3" width="4" height="18" fill="white" rx="1"/></svg></div><span style={{fontSize:19,fontWeight:800,color:N}}>TaxStat<span style={{color:B}}>360</span></span></div>
            <span style={{fontSize:12,background:'#0D1B3E',color:'#fff',padding:'3px 10px',borderRadius:20,fontWeight:600}}>Step 1 of 2 — Business</span>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setShowImport(true)} style={{padding:'7px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}}>📂 Import CSV</button>
            {anyPnl&&<button onClick={()=>exportEntitiesToCSV(entities)} style={{padding:'7px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}}>⬇ Export CSV</button>}
            <button onClick={()=>nav('/ai-analysis')} style={{padding:'7px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}}>AI Analysis</button>
            <button onClick={()=>{localStorage.clear();nav('/')}} style={{padding:'7px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}}>Sign Out</button>
          </div>
        </nav>
        <div style={{maxWidth:1100,margin:'0 auto',padding:'32px 20px'}}>
          <h1 style={{fontSize:26,fontWeight:800,color:N,textAlign:'center',marginBottom:4}}>Entity Calculator</h1>
          <p style={{textAlign:'center',color:SL,fontSize:14,marginBottom:28}}>Add all your business entities. Drag ⠿ to reorder. Click ▼ Details to add EIN, state & formation date.</p>
          {entities.map((ent,idx)=>(
            <div key={idx} draggable onDragStart={()=>onDragStart(idx)} onDragOver={e=>onDragOver(e,idx)} onDrop={()=>onDrop(idx)} onDragEnd={onDragEnd}
              style={{opacity:dragIdx===idx?0.4:1,outline:dragOverIdx===idx&&dragIdx!==idx?'2px dashed '+B:'none',borderRadius:14,transition:'opacity 0.15s'}}>
              <EntityCard ent={ent} idx={idx} onUpdate={updateEntity} onRemove={removeEntity} canRemove={entities.length>1}/>
            </div>
          ))}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:24}}>
            <button onClick={()=>setShowTemplates(true)} style={{padding:'14px',background:'#fff',border:'2px dashed #CBD5E1',borderRadius:12,fontSize:14,fontWeight:700,color:SL,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><span style={{fontSize:18}}>🗂</span> Add from Template</button>
            <button onClick={()=>setEntities(prev=>[...prev,{name:'Business '+(prev.length+1),type:'S-Corp',own:'100',ein:'',state:'',formationDate:'',pnl:null,connectedId:null,isManual:false}])} style={{padding:'14px',background:'#fff',border:'2px dashed #CBD5E1',borderRadius:12,fontSize:14,fontWeight:700,color:SL,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><span style={{fontSize:20,lineHeight:1}}>+</span> Add Blank Entity</button>
          </div>
          {anyPnl&&(
            <div style={{background:'linear-gradient(135deg,#0D1B3E 0%,#1e3a70 100%)',borderRadius:16,padding:28,color:'#fff',marginBottom:24}}>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.5)',letterSpacing:'1px',marginBottom:16,textAlign:'center'}}>COMBINED K-1 SUMMARY — ALL ENTITIES</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat('+Math.min(entities.filter(e=>e.pnl).length,4)+',1fr)',gap:14,marginBottom:20}}>
                {entities.filter(ent=>ent.pnl).map((ent,i)=>{const k1=Math.round(ent.pnl.netProfit*(parseInt(ent.own)/100));const color=COLORS[entities.indexOf(ent)%COLORS.length];return(
                  <div key={i} style={{background:'rgba(255,255,255,0.07)',borderRadius:10,padding:'14px 16px',borderTop:'3px solid '+color}}>
                    <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.8)',marginBottom:4}}>{ent.name}</div>
                    <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginBottom:8}}>{ent.type} · {ent.own}% ownership{ent.state?' · '+ent.state:''}</div>
                    <div style={{fontSize:10,color:'rgba(255,255,255,0.4)'}}>{fmt(ent.pnl.netProfit)} net →</div>
                    <div style={{fontSize:22,fontWeight:800,color:k1>=0?'#4ADE80':'#F87171'}}>{fmt(k1)}</div>
                  </div>
                )})}
              </div>
              <div style={{borderTop:'1px solid rgba(255,255,255,0.12)',paddingTop:18,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginBottom:4}}>TOTAL K-1 TO SCHEDULE E</div>
                  <div style={{fontSize:44,fontWeight:800,color:k1Total>=0?'#4ADE80':'#F87171'}}>{fmt(k1Total)}</div>
                </div>
                <button onClick={proceed} style={{padding:'16px 40px',background:B,border:'none',borderRadius:12,fontSize:16,fontWeight:800,color:'#fff',cursor:'pointer',boxShadow:'0 4px 20px rgba(37,99,235,0.5)'}}>Continue to Personal Tax Return →</button>
              </div>
            </div>
          )}
          {!anyPnl&&(
            <div style={{textAlign:'center',padding:'32px 20px',color:SL}}>
              <div style={{fontSize:48,marginBottom:10}}>🏢</div>
              <div style={{fontSize:16,fontWeight:700,color:N,marginBottom:6}}>Add your business entities above</div>
              <div style={{fontSize:13}}>Connect accounting software, enter P&L manually, or import from CSV</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
