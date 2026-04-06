import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://app.taxstat360.com'
export default function Onboarding({screen}){
  const nav=useNavigate()
  const [form,setForm]=useState({name:'',email:'',password:'',entityType:'',businessName:'',ein:'',selected:''})
  const [err,setErr]=useState('')
  const up=v=>setForm(f=>({...f,...v}))

  const handleSignup=async()=>{
    try{
      const r=await fetch(API+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.name,email:form.email,password:form.password})})
      const d=await r.json()
      if(d.access_token){localStorage.setItem('access_token',d.access_token);nav('/onboarding/entity')}
      else setErr(d.detail||'Registration failed')
    }catch(e){setErr('Unable to connect')}
  }
  const handleLogin=async()=>{
    try{
      const r=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.email,password:form.password})})
      const d=await r.json()
      if(d.access_token){localStorage.setItem('access_token',d.access_token);nav('/dashboard')}
      else setErr(d.detail||'Login failed')
    }catch(e){setErr('Unable to connect')}
  }
  const platforms=[
    {id:'quickbooks',name:'QuickBooks Online',icon:'📊',desc:'Auto-imports P&L, balance sheet, and transactions.',connectUrl:'https://app.taxstat360.com/integrations/quickbooks/connect'},
    {id:'xero',name:'Xero',icon:'📈',desc:'Bank-grade sync. Ideal for multi-currency businesses.',connectUrl:'https://app.taxstat360.com/integrations/xero/connect'},
    {id:'wave',name:'Wave (Free)',icon:'🌊',desc:'Great for startups. Import income, expenses, and invoices.',connectUrl:'https://app.taxstat360.com/integrations/wave/connect'},
    {id:'freshbooks',name:'FreshBooks',icon:'📒',desc:'Service businesses. Import time-based and project revenue.',connectUrl:'https://app.taxstat360.com/integrations/freshbooks/connect'},
  ]
  const S={background:'#fff',borderRadius:12,padding:32,maxWidth:480,margin:'60px auto',boxShadow:'0 2px 12px rgba(0,0,0,0.08)',fontFamily:'Inter,sans-serif'}
  const I={width:'100%',padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,marginBottom:12,boxSizing:'border-box'}
  const Btn=(p)=><button {...p} style={{width:'100%',padding:'12px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:15,cursor:'pointer',...p.style}}/>

  if(screen==='signup') return(<div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
    <div style={S}>
      <h2 style={{color:N,marginBottom:24}}>Create your account</h2>
      {err&&<div style={{color:'red',marginBottom:12,fontSize:13}}>{err}</div>}
      <input style={I} placeholder="Full name" value={form.name} onChange={e=>up({name:e.target.value})}/>
      <input style={I} placeholder="Email" type="email" value={form.email} onChange={e=>up({email:e.target.value})}/>
      <input style={I} placeholder="Password" type="password" value={form.password} onChange={e=>up({password:e.target.value})}/>
      <Btn onClick={handleSignup}>Create Account →</Btn>
      <p style={{textAlign:'center',marginTop:16,fontSize:13,color:SL}}>Already have an account? <span onClick={()=>nav('/login')} style={{color:B,cursor:'pointer',fontWeight:700}}>Sign in</span></p>
    </div>
  </div>)

  if(screen==='login') return(<div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
    <div style={S}>
      <h2 style={{color:N,marginBottom:24}}>Sign In</h2>
      {err&&<div style={{color:'red',marginBottom:12,fontSize:13}}>{err}</div>}
      <input style={I} placeholder="Email" type="email" value={form.email} onChange={e=>up({email:e.target.value})}/>
      <input style={I} placeholder="Password" type="password" value={form.password} onChange={e=>up({password:e.target.value})}/>
      <Btn onClick={handleLogin}>Sign In →</Btn>
      <p style={{textAlign:'center',marginTop:16,fontSize:13,color:SL}}>Don't have an account? <span onClick={()=>nav('/signup')} style={{color:B,cursor:'pointer',fontWeight:700}}>Start free trial</span></p>
    </div>
  </div>)

  if(screen==='entity') return(<div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
    <div style={{...S,maxWidth:540}}>
      <div style={{fontSize:13,color:SL,marginBottom:8}}>Step 1 of 3 &nbsp;—&nbsp; <b style={{color:B}}>33% complete</b></div>
      <div style={{height:4,background:'#E2E8F0',borderRadius:2,marginBottom:24}}><div style={{width:'33%',height:'100%',background:B,borderRadius:2}}/></div>
      <h2 style={{color:N,marginBottom:8}}>Select Your Entity Type</h2>
      <p style={{color:SL,fontSize:14,marginBottom:24}}>This determines how your K-1 income flows to Schedule E.</p>
      {['S-Corporation','Multi-Member LLC','Partnership'].map(e=>(
        <div key={e} onClick={()=>up({entityType:e})} style={{padding:16,border:'2px solid '+(form.entityType===e?B:'#E2E8F0'),borderRadius:10,marginBottom:12,cursor:'pointer',background:form.entityType===e?'#EFF6FF':'#fff'}}>
          <div style={{fontWeight:600,color:N}}>{e}</div>
        </div>
      ))}
      <Btn onClick={()=>form.entityType&&nav('/onboarding/business')} style={{opacity:form.entityType?1:0.5}}>Continue →</Btn>
    </div>
  </div>)

  if(screen==='business') return(<div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
    <div style={{...S,maxWidth:540}}>
      <div style={{fontSize:13,color:SL,marginBottom:8}}>Step 2 of 3 &nbsp;—&nbsp; <b style={{color:B}}>66% complete</b></div>
      <div style={{height:4,background:'#E2E8F0',borderRadius:2,marginBottom:24}}><div style={{width:'66%',height:'100%',background:B,borderRadius:2}}/></div>
      <h2 style={{color:N,marginBottom:24}}>Business Information</h2>
      <input style={I} placeholder="Business Name" value={form.businessName} onChange={e=>up({businessName:e.target.value})}/>
      <input style={I} placeholder="EIN (XX-XXXXXXX)" value={form.ein} onChange={e=>up({ein:e.target.value})}/>
      <Btn onClick={()=>nav('/onboarding/import')}>Continue →</Btn>
    </div>
  </div>)

  if(screen==='import') return(<div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
    <div style={{...S,maxWidth:600}}>
      <div style={{fontSize:13,color:SL,marginBottom:8}}>Step 3 of 3 &nbsp;—&nbsp; <b style={{color:B}}>100% complete</b></div>
      <div style={{height:4,background:'#E2E8F0',borderRadius:2,marginBottom:24}}><div style={{width:'100%',height:'100%',background:B,borderRadius:2}}/></div>
      <h2 style={{color:N,marginBottom:8}}>Import Your Financials</h2>
      <p style={{color:SL,fontSize:14,marginBottom:20}}>Connect your accounting software or upload your data to get started.</p>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
        {platforms.map(p=>(
          <div key={p.id} onClick={()=>up({selected:p.id})} style={{padding:16,border:'2px solid '+(form.selected===p.id?B:'#E2E8F0'),borderRadius:10,cursor:'pointer',background:form.selected===p.id?'#EFF6FF':'#fff'}}>
            <div style={{fontSize:22,marginBottom:6}}>{p.icon}</div>
            <div style={{fontWeight:600,color:N,fontSize:13}}>{p.name}</div>
            <div style={{fontSize:11,color:SL,marginTop:4}}>{p.desc}</div>
            {form.selected===p.id&&<button onClick={e=>{e.stopPropagation();window.open(p.connectUrl,'_blank')}} style={{marginTop:8,padding:'6px 0',background:B,color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',width:'100%'}}>Connect →</button>}
          </div>
        ))}
      </div>
      <Btn onClick={()=>nav('/dashboard')}>Continue to Dashboard →</Btn>
      <p style={{textAlign:'center',marginTop:12,fontSize:13,color:SL,cursor:'pointer'}} onClick={()=>nav('/dashboard')}>Skip — I'll add this later</p>
    </div>
  </div>)

  return null
}
