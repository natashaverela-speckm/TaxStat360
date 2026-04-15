import React from 'react'
import{useNavigate}from 'react-router-dom'
const e=React.createElement
const N='#0D1B3E',B='#2563EB',SL='#475569',G='#16a34a',R='#dc2626'
const API='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
const INTS=[{id:'quickbooks',name:'QuickBooks',color:'#2CA01C',abbr:'QB'},{id:'xero',name:'Xero',color:'#13B5EA',abbr:'XE'},{id:'wave',name:'Wave',color:'#2C6ECB',abbr:'WV'},{id:'freshbooks',name:'FreshBooks',color:'#1a9c3e',abbr:'FB'}]
const fmt=n=>'$'+Math.abs(Math.round(n)||0).toLocaleString('en-US')
const nv=v=>parseFloat((v||'').toString().replace(/[^0-9.-]/g,''))||0
const OWN=[['100','100% (sole owner)'],['75','75%'],['67','67%'],['60','60%'],['50','50% (equal partners)'],['40','40%'],['33','33%'],['25','25%'],['20','20%'],['10','10%']]
const BLANK={conn:{},syn:null,pnl:null,manual:false,manRev:'',manExp:'',own:'100'}

function Entity({idx,ent,upd,onRemove,showRemove}){
  const{conn,syn,pnl,manual,manRev,manExp,own}=ent
  const set=(k,v)=>upd({...ent,[k]:v})
  const cId=Object.keys(conn).find(k=>conn[k])
  async function fetchPnL(pid,tok,extra){
    set('syn',pid)
    try{
      let url=API+'/auth/'+pid+'/data?token='+encodeURIComponent(tok)
      if(pid==='quickbooks'&&extra)url+='&realm='+extra
      if(pid==='xero'&&extra)url+='&tenant='+extra
      if(pid==='freshbooks'&&extra)url+='&account='+extra
      const d=await(await fetch(url)).json()
      if(d&&!d.error){set('pnl',d);set('manual',false)}
    }catch(ex){console.error(ex)}
    set('syn',null)
  }
  function refresh(id){const t=localStorage.getItem('ts360_'+id+'_token'),x=localStorage.getItem('ts360_'+id+'_extra');if(t)fetchPnL(id,t,x)}
  function disc(id){localStorage.removeItem('ts360_'+id+'_connected');localStorage.removeItem('ts360_'+id+'_token');localStorage.removeItem('ts360_'+id+'_extra');const c={...conn};delete c[id];upd({...ent,conn:c,pnl:null})}
  function applyManual(){const r=nv(manRev),ex=nv(manExp);if(r>0||ex>0)set('pnl',{grossRevenue:r,totalExpenses:ex,netProfit:r-ex,categories:{}})}
  const net=pnl?.netProfit||0
  const k1=Math.round(net*(parseInt(own)/100))
  return e('div',{style:{marginBottom:20}},
    showRemove&&e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}},
      e('div',{style:{fontSize:13,fontWeight:700,color:N}},'Business / Entity '+(idx+1)),
      e('button',{onClick:onRemove,style:{padding:'4px 12px',background:'none',border:'1px solid #FECACA',borderRadius:6,fontSize:12,fontWeight:600,color:R,cursor:'pointer'}},'✕ Remove')
    ),
    !showRemove&&idx>0&&e('div',{style:{fontSize:13,fontWeight:700,color:N,marginBottom:8}},'Business / Entity '+(idx+1)),
    e('div',{style:{background:'#fff',borderRadius:14,padding:24,border:'1px solid #E2E8F0',marginBottom:pnl?16:0}},
      e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}},
        e('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'1px',color:SL}},'CONNECT YOUR ACCOUNTING SOFTWARE'),
        e('button',{onClick:()=>{set('manual',!manual);if(manual)set('pnl',null)},style:{padding:'5px 14px',background:'none',border:'1px solid '+B,borderRadius:6,fontSize:12,fontWeight:600,color:B,cursor:'pointer'}},manual?'← Use Software':'✏️ Enter Manually')
      ),
      !manual&&e('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}},
        ...INTS.map(i=>{const isC=!!conn[i.id],isS=syn===i.id;return e('div',{key:i.id,style:{border:'2px solid '+(isC?i.color:'#E2E8F0'),borderRadius:12,padding:16,textAlign:'center',background:isC?i.color+'0D':'#fff'}},e('div',{style:{width:38,height:38,borderRadius:9,background:i.color,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px',fontSize:12,fontWeight:700,color:'#fff'}},i.abbr),e('div',{style:{fontSize:13,fontWeight:700,color:N,marginBottom:8}},i.name),isC?e('div',null,e('div',{style:{fontSize:12,color:G,fontWeight:700,marginBottom:8}},isS?'⟳ Syncing...':'✓ Connected'),e('div',{style:{display:'flex',gap:6,justifyContent:'center'}},e('button',{onClick:()=>refresh(i.id),style:{padding:'4px 10px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:5,fontSize:11,fontWeight:600,color:B,cursor:'pointer'}},'⟳ Refresh'),e('button',{onClick:()=>disc(i.id),style:{padding:'4px 10px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:5,fontSize:11,fontWeight:600,color:R,cursor:'pointer'}},'Disconnect'))):e('button',{onClick:()=>{window.location.href=API+'/auth/'+i.id+'/connect'},style:{width:'100%',padding:'8px',background:B,border:'none',borderRadius:7,fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer'}},isS?'Connecting...':'Connect'))})
      ),
      manual&&e('div',{style:{background:'#F8FAFC',borderRadius:10,padding:20,border:'1px solid #E2E8F0'}},
        e('div',{style:{fontSize:13,fontWeight:700,color:N,marginBottom:14}},'✏️ Manual P&L Entry — '+new Date().getFullYear()+' Year-to-Date'),
        e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:14}},
          e('div',null,e('label',{style:{fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:4}},'Total Revenue / Gross Income'),e('input',{value:manRev,onChange:v=>set('manRev',v.target.value),placeholder:'0',type:'number',style:{width:'100%',padding:'10px 14px',border:'2px solid #E2E8F0',borderRadius:8,fontSize:15,boxSizing:'border-box',fontFamily:'inherit'}})),
          e('div',null,e('label',{style:{fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:4}},'Total Business Expenses'),e('input',{value:manExp,onChange:v=>set('manExp',v.target.value),placeholder:'0',type:'number',style:{width:'100%',padding:'10px 14px',border:'2px solid #E2E8F0',borderRadius:8,fontSize:15,boxSizing:'border-box',fontFamily:'inherit'}}))
        ),
        e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
          e('div',{style:{fontSize:14,color:SL}},manRev||manExp?e('span',null,'Net: ',e('strong',{style:{color:nv(manRev)-nv(manExp)>=0?G:R}},fmt(nv(manRev)-nv(manExp)))):'Enter your figures above'),
          e('button',{onClick:applyManual,style:{padding:'9px 20px',background:G,border:'none',borderRadius:7,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer'}},'Apply →')
        )
      )
    ),
    pnl&&e('div',null,
      e('div',{style:{background:'#fff',borderRadius:14,padding:24,border:'1px solid #E2E8F0',marginBottom:16}},
        e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}},
          e('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'1px',color:SL}},manual?'MANUAL P&L ENTRY':'P&L FROM '+(cId||'').toUpperCase()+' — '+new Date().getFullYear()+' YTD'),
          e('div',{style:{display:'flex',gap:8}},
            !manual&&cId&&e('button',{onClick:()=>refresh(cId),style:{padding:'4px 10px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:5,fontSize:11,fontWeight:600,color:B,cursor:'pointer'}},'⟳ Refresh'),
            e('button',{onClick:()=>set('pnl',null),style:{padding:'4px 10px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:5,fontSize:11,fontWeight:600,color:R,cursor:'pointer'}},'✕ Clear')
          )
        ),
        e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:pnl.categories&&Object.keys(pnl.categories).length>0?20:0}},
          ...[['Total Revenue',fmt(pnl.grossRevenue),G,'📈'],['Total Expenses',fmt(pnl.totalExpenses),R,'📉'],['Net Profit / Loss',fmt(pnl.netProfit),pnl.netProfit>=0?G:R,'💰']].map(([l,v,c,ic])=>e('div',{key:l,style:{background:'#F8FAFC',borderRadius:10,padding:16,textAlign:'center',border:'1px solid #F1F5F9'}},e('div',{style:{fontSize:18,marginBottom:4}},ic),e('div',{style:{fontSize:11,color:SL,marginBottom:3}},l),e('div',{style:{fontSize:22,fontWeight:800,color:c}},v)))
        ),
        pnl.categories&&Object.keys(pnl.categories).length>0&&e('div',null,
          e('div',{style:{fontSize:11,fontWeight:700,color:SL,marginBottom:10}},'EXPENSE BREAKDOWN'),
          e('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}},
            ...Object.entries(pnl.categories).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>e('div',{key:cat,style:{background:'#F8FAFC',borderRadius:8,padding:'9px 12px',display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #F1F5F9'}},e('div',null,e('div',{style:{fontSize:12,fontWeight:600,color:N}},cat),e('div',{style:{fontSize:10,color:SL}},pnl.totalExpenses>0?Math.round((amt/pnl.totalExpenses)*100)+'% of expenses':'')),e('div',{style:{fontSize:12,fontWeight:700,color:R}},fmt(amt))))
          )
        )
      ),
      e('div',{style:{background:'#fff',borderRadius:14,padding:24,border:'1px solid #E2E8F0'}},
        e('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'1px',color:SL,marginBottom:18}},'OWNERSHIP PERCENTAGE & K-1 SHARE'),
        e('div',{style:{display:'grid',gridTemplateColumns:'280px 1fr',gap:24,alignItems:'center'}},
          e('div',null,
            e('label',{style:{fontSize:13,fontWeight:700,color:N,display:'block',marginBottom:10}},'Your Ownership %'),
            e('select',{value:own,onChange:v=>set('own',v.target.value),style:{width:'100%',padding:'12px 16px',border:'2px solid '+B,borderRadius:10,fontSize:16,fontWeight:700,color:N,background:'#fff',fontFamily:'inherit',cursor:'pointer'}},
              ...OWN.map(([v,l])=>e('option',{key:v,value:v},l))
            ),
            e('div',{style:{fontSize:11,color:SL,marginTop:8,lineHeight:1.5}},'For S-Corps, LLCs, and partnerships with multiple owners. Single-owner businesses are always 100%.')
          ),
          e('div',{style:{background:'linear-gradient(135deg,#0D1B3E 0%,#1e3a70 100%)',borderRadius:12,padding:24,color:'#fff',textAlign:'center'}},
            e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.5)',marginBottom:6,letterSpacing:'0.5px'}},'YOUR K-1 DISTRIBUTIVE SHARE'),
            e('div',{style:{fontSize:46,fontWeight:800,color:k1>=0?'#4ADE80':'#F87171',lineHeight:1}},fmt(k1)),
            e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.45)',marginTop:8}},fmt(pnl.netProfit)+' net profit × '+own+'% ownership'),
            e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.45)',marginTop:12,padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.1)'}},k1>=0?'Flows to your personal Schedule E on Form 1040':'Loss may offset other income on your personal return')
          )
        )
      )
    )
  )
}

export default function CalculateTax(){
  const nav=useNavigate()
  const[entities,setEntities]=React.useState([{...BLANK}])
  React.useEffect(()=>{
    const c={};for(const i of INTS){if(localStorage.getItem('ts360_'+i.id+'_connected')==='true')c[i.id]=true}
    if(Object.keys(c).length)setEntities(prev=>{const a=[...prev];a[0]={...a[0],conn:c};return a})
    const p=new URLSearchParams(window.location.search)
    const mp={qb_token:'quickbooks',xero_token:'xero',wave_token:'wave',fb_token:'freshbooks'}
    for(const[k,pid]of Object.entries(mp)){const tok=p.get(k);if(tok){localStorage.setItem('ts360_'+pid+'_connected','true');localStorage.setItem('ts360_'+pid+'_token',tok);const ex={quickbooks:p.get('realm'),xero:p.get('tenant'),freshbooks:p.get('account')};if(ex[pid])localStorage.setItem('ts360_'+pid+'_extra',ex[pid]);setEntities(prev=>{const a=[...prev];a[0]={...a[0],conn:{...a[0].conn,[pid]:true}};return a});window.history.replaceState({},'','/calculate-tax')}}
  },[])
  function upd(idx,updated){setEntities(prev=>{const a=[...prev];a[idx]=updated;return a})}
  function add(){if(entities.length<5)setEntities(prev=>[...prev,{...BLANK}])}
  function remove(idx){setEntities(prev=>prev.filter((_,i)=>i!==idx))}
  const totalK1=entities.reduce((sum,ent)=>{const net=ent.pnl?.netProfit||0;return sum+Math.round(net*(parseInt(ent.own)/100))},0)
  const anyPnl=entities.some(en=>en.pnl)
  function proceed(){sessionStorage.setItem('ts360_k1',totalK1);sessionStorage.setItem('ts360_own',entities[0].own);nav('/tax-return')}
  return e('div',{style:{minHeight:'100vh',background:'#F8FAFC',fontFamily:'system-ui,sans-serif',color:N}},
    e('nav',{style:{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 40px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}},
      e('div',{style:{display:'flex',alignItems:'center',gap:12}},
        e('span',{style:{fontSize:19,fontWeight:800,color:N}},'TaxStat',e('span',{style:{color:B}},'360')),
        e('span',{style:{fontSize:12,background:'#EFF6FF',color:B,padding:'3px 10px',borderRadius:20,fontWeight:600}},'Step 1 of 2 — Business')
      ),
      e('div',{style:{display:'flex',gap:8}},
        e('button',{onClick:()=>nav('/ai-analysis'),style:{padding:'7px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}},'AI Analysis'),
        e('button',{onClick:()=>{localStorage.clear();nav('/')},style:{padding:'7px 14px',background:'none',border:'1px solid #E2E8F0',borderRadius:7,fontSize:13,color:SL,cursor:'pointer'}},'Sign Out')
      )
    ),
    e('div',{style:{maxWidth:1100,margin:'0 auto',padding:'32px 20px'}},
      e('h1',{style:{fontSize:26,fontWeight:800,color:N,textAlign:'center',marginBottom:4}},'Business Income & K-1 Calculator'),
      e('p',{style:{textAlign:'center',color:SL,fontSize:14,marginBottom:28}},'Connect your accounting software to import your Profit & Loss, then calculate your K-1 distributive share'),
      ...entities.map((ent,idx)=>e(Entity,{key:idx,idx,ent,upd:(u)=>upd(idx,u),onRemove:()=>remove(idx),showRemove:entities.length>1})),
      entities.length<5&&e('div',{style:{marginBottom:20}},
        e('button',{onClick:add,style:{width:'100%',padding:'14px',background:'none',border:'2px dashed #CBD5E1',borderRadius:12,fontSize:14,fontWeight:600,color:SL,cursor:'pointer'}},
          '+ Add Another Business / Entity')
      ),
      anyPnl&&entities.length>1&&entities.filter(en=>en.pnl).length>1&&e('div',{style:{background:'linear-gradient(135deg,#0D1B3E 0%,#1e3a70 100%)',borderRadius:14,padding:24,marginBottom:20,color:'#fff',textAlign:'center'}},
        e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.5)',marginBottom:6,letterSpacing:'1px'}},'COMBINED K-1 (ALL ENTITIES)'),
        e('div',{style:{fontSize:52,fontWeight:800,color:totalK1>=0?'#4ADE80':'#F87171',lineHeight:1}},fmt(totalK1)),
        e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.45)',marginTop:10}},'Sum across '+entities.filter(en=>en.pnl).length+' entities')
      ),
      anyPnl&&e('div',{style:{textAlign:'center',paddingBottom:40}},
        e('button',{onClick:proceed,style:{padding:'16px 52px',background:B,border:'none',borderRadius:12,fontSize:17,fontWeight:800,color:'#fff',cursor:'pointer',boxShadow:'0 4px 24px rgba(37,99,235,0.35)'}},'Continue to Personal Tax Return (Form 1040) →'),
        e('div',{style:{fontSize:12,color:SL,marginTop:10}},'Your K-1 of '+fmt(totalK1)+' will be pre-filled on the next page')
      ),
      !anyPnl&&e('div',{style:{textAlign:'center',padding:'48px 20px',color:SL}},
        e('div',{style:{fontSize:52,marginBottom:12}},'📊'),
        e('div',{style:{fontSize:17,fontWeight:700,color:N,marginBottom:8}},'Connect your accounting software above'),
        e('div',{style:{fontSize:14}},'Or click "Enter Manually" to type in your revenue and expenses')
      )
    )
  )
}
