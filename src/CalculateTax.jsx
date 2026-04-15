// v2 multi-entity
import React,{useState,useEffect} from 'react'
const e=React.createElement
const API=import.meta.env.VITE_API_URL||'https://api.taxstat360.com'
const B='#2563EB',G='#16A34A',R='#DC2626',N='#0F172A',SL='#64748B'
const OWN=[['100','100% (Sole Owner)'],['90','90%'],['80','80%'],['75','75%'],['70','70%'],['60','60%'],['50','50%'],['49','49%'],['40','40%'],['33','33%'],['25','25%'],['20','20%'],['10','10%']]
const INTS=[{id:'quickbooks',name:'QuickBooks',abbr:'QB',color:'#2CA01C'},{id:'xero',name:'Xero',abbr:'XE',color:'#13B5EA'},{id:'wave',name:'Wave',abbr:'WV',color:'#1C4ED8'},{id:'freshbooks',name:'FreshBooks',abbr:'FB',color:'#0E9E6E'}]
const fmt=n=>'$'+Math.abs(Math.round(n)).toLocaleString()
const nv=v=>parseFloat(v)||0
const BLANK_ENTITY={name:'',own:'100',pnl:null,manual:false,manRev:'',manExp:'',conn:{},syn:null,cId:null}
export default function CalculateTax(){
  const[entities,setEntities]=useState([{...BLANK_ENTITY}])
  function updEntity(idx,key,val){setEntities(prev=>{const a=[...prev];a[idx]={...a[idx],[key]:val};return a})}
  function addEntity(){if(entities.length<5)setEntities(prev=>[...prev,{...BLANK_ENTITY}])}
  function removeEntity(idx){setEntities(prev=>prev.filter((_,i)=>i!==idx))}
  const k1Total=Math.round(entities.reduce((sum,ent)=>{const profit=ent.pnl?ent.pnl.netProfit:(nv(ent.manRev)-nv(ent.manExp));return sum+(profit*nv(ent.own)/100)},0))
  const hasPnl=entities.some(ent=>ent.pnl)
  function proceed(){localStorage.setItem('ts360_k1',k1Total);window.location.href='/tax-return'}
  return e('div',{style:{maxWidth:900,margin:'0 auto',padding:'32px 20px',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}},
    e('div',{style:{marginBottom:28}},
      e('div',{style:{fontSize:13,color:SL,marginBottom:4}},'Step 1 of 3'),
      e('h1',{style:{fontSize:26,fontWeight:800,color:N,margin:0}},'Business Income & K-1 Shares')
    ),
    e('div',{style:{display:'flex',flexDirection:'column',gap:24}},
      ...entities.map((ent,idx)=>e(EntityBlock,{key:idx,idx,ent,total:entities.length,onUpdate:(k,v)=>updEntity(idx,k,v),onRemove:()=>removeEntity(idx)}))
    ),
    entities.length<5&&e('div',{style:{marginTop:16}},
      e('button',{onClick:addEntity,style:{padding:'10px 22px',background:'none',border:'2px dashed '+B,borderRadius:10,fontSize:14,fontWeight:700,color:B,cursor:'pointer',width:'100%'}},'+ Add Another Business / Entity')
    ),
    hasPnl&&e('div',{style:{marginTop:28}},
      e('div',{style:{background:'linear-gradient(135deg,#0D1B3E 0%,#1e3a70 100%)',borderRadius:12,padding:24,color:'#fff',textAlign:'center'}},
        e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.5)',marginBottom:6,letterSpacing:'0.5px'}},entities.length===1?'YOUR K-1 DISTRIBUTIVE SHARE':'TOTAL K-1 DISTRIBUTIVE SHARE (ALL ENTITIES)'),
        e('div',{style:{fontSize:46,fontWeight:800,color:k1Total>=0?'#4ADE80':'#F87171',lineHeight:1}},fmt(k1Total)),
        entities.length>1&&e('div',{style:{marginTop:10,display:'flex',flexDirection:'column',gap:4}},
          ...entities.filter(ent=>ent.pnl).map((ent,i)=>{const profit=ent.pnl.netProfit;const share=Math.round(profit*nv(ent.own)/100);return e('div',{key:i,style:{fontSize:12,color:'rgba(255,255,255,0.45)'}},(ent.name||'Entity '+(i+1))+': '+fmt(profit)+' × '+ent.own+'% = '+fmt(share))})
        ),
        e('div',{style:{fontSize:12,color:'rgba(255,255,255,0.45)',marginTop:12,padding:'8px 0',borderTop:'1px solid rgba(255,255,255,0.1)'}},k1Total>=0?'Flows to your personal Schedule E on Form 1040':'Loss may offset other income on your personal return')
      )
    ),
    hasPnl&&e('div',{style:{textAlign:'center',paddingBottom:40,marginTop:24}},
      e('button',{onClick:proceed,style:{padding:'16px 52px',background:B,border:'none',borderRadius:12,fontSize:17,fontWeight:800,color:'#fff',cursor:'pointer',boxShadow:'0 4px 24px rgba(37,99,235,0.35)'}},'Continue to Personal Tax Return (Form 1040) →'),
      e('div',{style:{fontSize:12,color:SL,marginTop:10}},'Your K-1 of '+fmt(k1Total)+' will be pre-filled on the next page')
    ),
    !hasPnl&&e('div',{style:{textAlign:'center',padding:'48px 20px',color:SL}},
      e('div',{style:{fontSize:52,marginBottom:12}},'📊'),
      e('div',{style:{fontSize:17,fontWeight:700,color:N,marginBottom:8}},'Connect your accounting software above'),
      e('div',{style:{fontSize:14}},'Or click “Enter Manually” to type in your revenue and expenses')
    )
  )
}
function EntityBlock({idx,ent,total,onUpdate,onRemove}){
  const[manual,setManual]=useState(ent.manual)
  const[conn,setConn]=useState(ent.conn||{})
  const[syn,setSyn]=useState(ent.syn||null)
  const[cId,setCId]=useState(ent.cId||null)
  const[pnl,setPnl]=useState(ent.pnl||null)
  const[manRev,setManRev]=useState(ent.manRev||'')
  const[manExp,setManExp]=useState(ent.manExp||'')
  useEffect(()=>{onUpdate('pnl',pnl)},[pnl])
  useEffect(()=>{onUpdate('manRev',manRev);onUpdate('manExp',manExp)},[manRev,manExp])
  const token=localStorage.getItem('token')
  async function refresh(id){setSyn(id);try{const r=await fetch(API+'/integrations/'+id+'/pnl',{headers:{Authorization:'Bearer '+token}});if(r.ok){const d=await r.json();setPnl(d);setCId(id);setConn(p=>({...p,[id]:true}))}}finally{setSyn(null)}}
  function disc(id){setConn(p=>({...p,[id]:false}));if(cId===id){setPnl(null);setCId(null)}localStorage.removeItem('ts360_'+id+'_connected')}
  function applyManual(){const rev=nv(manRev),exp=nv(manExp);if(!rev&&!exp)return;setPnl({grossRevenue:rev,totalExpenses:exp,netProfit:rev-exp,categories:{}});setManual(false)}
  return e('div',{style:{background:'#fff',borderRadius:14,border:'1px solid #E2E8F0',padding:24,position:'relative'}},
    e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}},
      e('div',{style:{display:'flex',alignItems:'center',gap:12}},
        e('div',{style:{background:B,color:'#fff',borderRadius:8,width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:13}},idx+1),
        e('input',{value:ent.name,onChange:v=>onUpdate('name',v.target.value),placeholder:'Business / Entity Name (optional)',style:{fontSize:14,fontWeight:600,color:N,border:'none',outline:'none',background:'transparent',fontFamily:'inherit',width:260}})
      ),
      e('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        e('button',{onClick:()=>{setManual(!manual);if(manual)setPnl(null)},style:{padding:'5px 14px',background:'none',border:'1px solid '+B,borderRadius:6,fontSize:12,fontWeight:600,color:B,cursor:'pointer'}},manual?'← Use Software':'✏️ Enter Manually'),
        total>1&&e('button',{onClick:onRemove,style:{padding:'5px 10px',background:'none',border:'1px solid #FECACA',borderRadius:6,fontSize:12,fontWeight:600,color:R,cursor:'pointer'}},'✕ Remove')
      )
    ),
    !manual&&!pnl&&e('div',null,
      e('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'1px',color:SL,marginBottom:12}},'CONNECT YOUR ACCOUNTING SOFTWARE'),
      e('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}},
        ...INTS.map(i=>{const isC=!!conn[i.id],isS=syn===i.id;return e('div',{key:i.id,style:{border:'2px solid '+(isC?i.color:'#E2E8F0'),borderRadius:12,padding:16,textAlign:'center',background:isC?i.color+'0D':'#fff'}},e('div',{style:{width:38,height:38,borderRadius:9,background:i.color,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px',fontSize:12,fontWeight:700,color:'#fff'}},i.abbr),e('div',{style:{fontSize:13,fontWeight:700,color:N,marginBottom:8}},i.name),isC?e('div',null,e('div',{style:{fontSize:12,color:G,fontWeight:700,marginBottom:8}},isS?'⟳ Syncing...':'✓ Connected'),e('div',{style:{display:'flex',gap:6,justifyContent:'center'}},e('button',{onClick:()=>refresh(i.id),style:{padding:'4px 10px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:5,fontSize:11,fontWeight:600,color:B,cursor:'pointer'}},'⟳ Refresh'),e('button',{onClick:()=>disc(i.id),style:{padding:'4px 10px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:5,fontSize:11,fontWeight:600,color:R,cursor:'pointer'}},'Disconnect'))):e('button',{onClick:()=>{window.location.href=API+'/auth/'+i.id+'/connect'},style:{width:'100%',padding:'8px',background:B,border:'none',borderRadius:7,fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer'}},isS?'Connecting...':'Connect'))})
      )
    ),
    manual&&!pnl&&e('div',{style:{background:'#F8FAFC',borderRadius:10,padding:20,border:'1px solid #E2E8F0'}},
      e('div',{style:{fontSize:13,fontWeight:700,color:N,marginBottom:14}},'✏️ Manual P&L Entry — '+new Date().getFullYear()+' Year-to-Date'),
      e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:14}},
        e('div',null,e('label',{style:{fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:4}},'Total Revenue / Gross Income'),e('input',{value:manRev,onChange:v=>setManRev(v.target.value),placeholder:'0',type:'number',style:{width:'100%',padding:'10px 14px',border:'2px solid #E2E8F0',borderRadius:8,fontSize:15,boxSizing:'border-box',fontFamily:'inherit'}})),
        e('div',null,e('label',{style:{fontSize:11,fontWeight:700,color:SL,display:'block',marginBottom:4}},'Total Business Expenses'),e('input',{value:manExp,onChange:v=>setManExp(v.target.value),placeholder:'0',type:'number',style:{width:'100%',padding:'10px 14px',border:'2px solid #E2E8F0',borderRadius:8,fontSize:15,boxSizing:'border-box',fontFamily:'inherit'}}))
      ),
      e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        e('div',{style:{fontSize:14,color:SL}},manRev||manExp?e('span',null,'Net: ',e('strong',{style:{color:nv(manRev)-nv(manExp)>=0?G:R}},fmt(nv(manRev)-nv(manExp)))):'Enter your figures above'),
        e('button',{onClick:applyManual,style:{padding:'9px 20px',background:G,border:'none',borderRadius:7,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer'}},'Apply →')
      )
    ),
    pnl&&e('div',null,
      e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}},
        e('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'1px',color:SL}},manual?'MANUAL P&L ENTRY':'P&L FROM '+(cId||'').toUpperCase()+' — '+new Date().getFullYear()+' YTD'),
        e('div',{style:{display:'flex',gap:8}},
          !manual&&cId&&e('button',{onClick:()=>refresh(cId),style:{padding:'4px 10px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:5,fontSize:11,fontWeight:600,color:B,cursor:'pointer'}},'⟳ Refresh'),
          e('button',{onClick:()=>setPnl(null),style:{padding:'4px 10px',background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:5,fontSize:11,fontWeight:600,color:R,cursor:'pointer'}},'✕ Clear')
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
    pnl&&e('div',{style:{marginTop:20,padding:'16px 0 0',borderTop:'1px solid #F1F5F9'}},
      e('div',{style:{display:'grid',gridTemplateColumns:'280px 1fr',gap:24,alignItems:'center'}},
        e('div',null,
          e('label',{style:{fontSize:13,fontWeight:700,color:N,display:'block',marginBottom:10}},'Your Ownership %'),
          e('select',{value:ent.own,onChange:v=>onUpdate('own',v.target.value),style:{width:'100%',padding:'12px 16px',border:'2px solid '+B,borderRadius:10,fontSize:16,fontWeight:700,color:N,background:'#fff',fontFamily:'inherit',cursor:'pointer'}},
            ...OWN.map(([v,l])=>e('option',{key:v,value:v},l))
          ),
          e('div',{style:{fontSize:11,color:SL,marginTop:8,lineHeight:1.5}},'For S-Corps, LLCs, and partnerships with multiple owners. Single-owner businesses are always 100%.')
        ),
        e('div',{style:{background:'linear-gradient(135deg,#0D1B3E 0%,#1e3a70 100%)',borderRadius:12,padding:20,color:'#fff',textAlign:'center'}},
          e('div',{style:{fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:4,letterSpacing:'0.5px'}},'K-1 SHARE — '+(ent.name||'ENTITY '+(idx+1))),
          e('div',{style:{fontSize:36,fontWeight:800,color:(pnl.netProfit*nv(ent.own)/100)>=0?'#4ADE80':'#F87171',lineHeight:1}},fmt(Math.round(pnl.netProfit*nv(ent.own)/100))),
          e('div',{style:{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:6}},fmt(pnl.netProfit)+' net profit × '+ent.own+'% ownership')
        )
      )
    )
  )
}
