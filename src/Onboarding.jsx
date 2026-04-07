import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://app.taxstat360.com'
const PK='pk_test_51TJPXq5MkNEttBVv7cYT6PpzXUhFaTS8iqFXfGqscrRXDsACVAZbZ2SVNQ0Gr8pQ9I0Dbo6OCpsaIKMLc9O8PCHr00TtaIAHB8'
const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}><svg width="34" height="34" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)
const Wrap=({children})=>(<div style={{minHeight:'100vh',background:'#F0F4FF',display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:'Inter,sans-serif'}}><div style={{background:'#fff',borderRadius:16,padding:'40px 36px',maxWidth:480,width:'100%',boxShadow:'0 4px 24px rgba(37,99,235,0.10)',border:'1px solid #E2E8F0'}}><LOGO/>{children}</div></div>)

function SignupScreen(){
  const nav=useNavigate()
  const loc=useLocation()
  const plan=(new URLSearchParams(loc.search).get('plan')||'basic').toLowerCase()
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [pass,setPass]=useState('')
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState('')
  const [stripe,setStripe]=useState(null)
  const [elements,setElements]=useState(null)
  const cardRef=useRef(null)
  const LABELS={basic:'Basic — $49/mo',professional:'Professional — $99/mo',advanced:'Advanced — $199/mo'}
  useEffect(()=>{
    const s=document.createElement('script');s.src='https://js.stripe.com/v3/'
    s.onload=()=>{
      const sk=window.Stripe(PK);setStripe(sk)
      const els=sk.elements()
      const card=els.create('card',{style:{base:{fontSize:'15px',color:'#0D1B3E','::placeholder':{color:'#94a3b8'}}}})
      setTimeout(()=>{if(cardRef.current){card.mount(cardRef.current);setElements(els)}},200)
    }
    document.head.appendChild(s)
  },[])
  async function submit(e){
    e.preventDefault()
    if(!stripe||!elements){setErr('Payment loading, please wait...');return}
    setLoading(true);setErr('')
    try{
      const si=await fetch(API+'/stripe/setup-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json())
      if(!si.client_secret)throw new Error('Payment init failed')
      const card=elements.getElement('card')
      const {setupIntent,error}=await stripe.confirmCardSetup(si.client_secret,{payment_method:{card,billing_details:{name,email}}})
      if(error)throw new Error(error.message)
      const reg=await fetch(API+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pass,plan,payment_method_id:setupIntent.payment_method})})
      const data=await reg.json()
      if(!reg.ok)throw new Error(data.detail||'Registration failed')
      localStorage.setItem('token',data.access_token);localStorage.setItem('plan',plan);localStorage.setItem('userName',name)
      try{const fd=new FormData();fd.append('EMAIL',email);fd.append('u','f8bbe8c960a3c7bae19433b3e');fd.append('id','f546bd92ac');fd.append('f_id','00cc07e9f0');fd.append('b_f8bbe8c960a3c7bae19433b3e_f546bd92ac','');await fetch('https://themoneynista.us4.list-manage.com/subscribe/post?u=f8bbe8c960a3c7bae19433b3e&id=f546bd92ac&f_id=00cc07e9f0',{method:'POST',mode:'no-cors',body:fd})}catch(e){}
      nav('/onboarding/entity')
    }catch(e){setErr(e.message)}
    finally{setLoading(false)}
  }
  return(<Wrap>
    <div style={{display:'inline-block',background:'#EFF6FF',color:B,fontSize:12,fontWeight:700,padding:'4px 12px',borderRadius:20,marginBottom:12}}>{LABELS[plan]||'Basic — $49/mo'}</div>
    <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 4px'}}>Start your free trial</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 24px'}}>7-day free trial — no charge until it ends</p>
    <form onSubmit={submit}>
      {[{label:'Full Name',val:name,set:setName,type:'text',ph:'Jane Smith'},{label:'Email Address',val:email,set:setEmail,type:'email',ph:'jane@company.com'},{label:'Password',val:pass,set:setPass,type:'password',ph:'Min. 8 characters'}].map(f=>(
        <div key={f.label} style={{marginBottom:16}}><label style={{display:'block',fontSize:13,fontWeight:600,color:N,marginBottom:6}}>{f.label}</label><input type={f.type} value={f.val} onChange={ev=>f.set(ev.target.value)} placeholder={f.ph} required style={{width:'100%',padding:'11px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,boxSizing:'border-box'}}/></div>
      ))}
      <div style={{marginBottom:20}}><label style={{display:'block',fontSize:13,fontWeight:600,color:N,marginBottom:6}}>Card Details</label><div ref={cardRef} style={{padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:8,minHeight:44}}/></div>
      {err&&<div style={{background:'#FEF2F2',color:'#DC2626',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:16}}>{err}</div>}
      <button type="submit" disabled={loading} style={{width:'100%',padding:14,background:loading?'#93c5fd':B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:16}}>{loading?'Processing...':'Start Free Trial →'}</button>
      <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:8,padding:'10px 14px',marginBottom:16}}><p style={{color:'#166534',fontSize:11,margin:0,lineHeight:1.5}}>🔒 Your card is required for security only. You will <b>not</b> be billed until your 7-day free trial ends. Cancel anytime.</p></div>
      <p style={{textAlign:'center',fontSize:13,color:SL,margin:0}}>Already have an account? <span onClick={()=>nav('/login')} style={{color:B,cursor:'pointer',fontWeight:600}}>Sign in</span></p>
    </form>
    <p style={{textAlign:'center',fontSize:12,color:'#94a3b8',marginTop:16}}>← <span onClick={()=>nav('/')} style={{cursor:'pointer',color:B}}>Back to home</span></p>
  </Wrap>)
}

function LoginScreen(){
  const nav=useNavigate()
  const [email,setEmail]=useState('')
  const [pass,setPass]=useState('')
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState('')
  async function submit(e){
    e.preventDefault();setLoading(true);setErr('')
    try{
      const res=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})})
      const data=await res.json()
      if(!res.ok)throw new Error(data.detail||'Login failed')
      localStorage.setItem('token',data.access_token);localStorage.setItem('plan',data.plan)
      nav('/dashboard')
    }catch(e){setErr(e.message)}
    finally{setLoading(false)}
  }
  return(<Wrap>
    <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 4px'}}>Welcome back</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 24px'}}>Sign in to your TaxStat360 account</p>
    <form onSubmit={submit}>
      {[{label:'Email Address',val:email,set:setEmail,type:'email',ph:'you@company.com'},{label:'Password',val:pass,set:setPass,type:'password',ph:'Your password'}].map(f=>(
        <div key={f.label} style={{marginBottom:16}}><label style={{display:'block',fontSize:13,fontWeight:600,color:N,marginBottom:6}}>{f.label}</label><input type={f.type} value={f.val} onChange={ev=>f.set(ev.target.value)} placeholder={f.ph} required style={{width:'100%',padding:'11px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,boxSizing:'border-box'}}/></div>
      ))}
      {err&&<div style={{background:'#FEF2F2',color:'#DC2626',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:16}}>{err}</div>}
      <button type="submit" disabled={loading} style={{width:'100%',padding:14,background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:16}}>{loading?'Signing in...':'Sign In →'}</button>
      <p style={{textAlign:'center',fontSize:13,color:SL,margin:0}}>No account? <span onClick={()=>nav('/signup')} style={{color:B,cursor:'pointer',fontWeight:600}}>Start free trial</span></p>
    </form>
  </Wrap>)
}

function EntityScreen(){
  const nav=useNavigate()
  const [selected,setSelected]=useState('')
  const types=['S-Corporation','Multi-Member LLC','Partnership','Sole Proprietor','C-Corporation','Other']
  return(<Wrap>
    <div style={{marginBottom:8}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 1 of 3</span></div>
    <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 4px'}}>What type of business entity?</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 24px'}}>This helps us map the right IRS schedules for you.</p>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:24}}>
      {types.map(t=>(<div key={t} onClick={()=>setSelected(t)} style={{padding:'14px 12px',border:'2px solid '+(selected===t?B:'#E2E8F0'),borderRadius:10,cursor:'pointer',textAlign:'center',fontSize:13,fontWeight:600,color:selected===t?B:N,background:selected===t?'#EFF6FF':'#fff',transition:'all 0.15s'}}>{t}</div>))}
    </div>
    <button onClick={()=>{if(selected){localStorage.setItem('entityType',selected);nav('/onboarding/business')}}} disabled={!selected} style={{width:'100%',padding:14,background:selected?B:'#94a3b8',color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:selected?'pointer':'not-allowed'}}>Continue →</button>
  </Wrap>)
}

function BusinessScreen(){
  const nav=useNavigate()
  const [biz,setBiz]=useState('')
  const [ein,setEin]=useState('')
  const [addr,setAddr]=useState('')
  async function submit(e){
    e.preventDefault()
    const token=localStorage.getItem('token')
    try{await fetch(API+'/user/business-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_name:biz,ein,address:addr})})}catch(e){}
    nav('/onboarding/import')
  }
  return(<Wrap>
    <div style={{marginBottom:8}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 2 of 3</span></div>
    <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 4px'}}>Tell us about your business</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 24px'}}>Used to personalize your IRS compliance analysis.</p>
    <form onSubmit={submit}>
      {[{label:'Business Name',val:biz,set:setBiz,ph:'Acme Corp LLC'},{label:'EIN (optional)',val:ein,set:setEin,ph:'XX-XXXXXXX'},{label:'Business Address (optional)',val:addr,set:setAddr,ph:'123 Main St, City, ST'}].map(f=>(
        <div key={f.label} style={{marginBottom:16}}><label style={{display:'block',fontSize:13,fontWeight:600,color:N,marginBottom:6}}>{f.label}</label><input type="text" value={f.val} onChange={ev=>f.set(ev.target.value)} placeholder={f.ph} required={f.label==='Business Name'} style={{width:'100%',padding:'11px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,boxSizing:'border-box'}}/></div>
      ))}
      <button type="submit" style={{width:'100%',padding:14,background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer'}}>Continue →</button>
    </form>
    <p style={{textAlign:'center',marginTop:12,fontSize:13}}><span onClick={()=>nav('/onboarding/import')} style={{color:SL,cursor:'pointer'}}>Skip for now →</span></p>
  </Wrap>)
}

function ImportScreen(){
  const nav=useNavigate()
  const integrations=[{name:'QuickBooks',color:'#2CA01C',logo:'QB'},{name:'FreshBooks',color:'#1a9c3e',logo:'FB'},{name:'Xero',color:'#13B5EA',logo:'XE'},{name:'Wave',color:'#2C6ECB',logo:'WV'}]
  return(<Wrap>
    <div style={{marginBottom:8}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 3 of 3</span></div>
    <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 4px'}}>Connect your accounting software</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 24px'}}>We'll import your financial data to power your AI analysis.</p>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:24}}>
      {integrations.map(i=>(<div key={i.name} onClick={()=>window.open(API+'/integrations/'+i.name.toLowerCase()+'/connect','_blank')} style={{padding:'18px 12px',border:'1px solid #E2E8F0',borderRadius:10,cursor:'pointer',textAlign:'center',transition:'all 0.15s'}} onMouseOver={e=>e.currentTarget.style.borderColor=i.color} onMouseOut={e=>e.currentTarget.style.borderColor='#E2E8F0'}><div style={{width:40,height:40,borderRadius:8,background:i.color,color:'#fff',fontWeight:800,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px'}}>{i.logo}</div><div style={{fontSize:13,fontWeight:600,color:N}}>{i.name}</div></div>))}
    </div>
    <button onClick={()=>nav('/dashboard')} style={{width:'100%',padding:14,background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}>Go to Dashboard →</button>
    <p style={{textAlign:'center',fontSize:13,color:SL,margin:0}}><span onClick={()=>nav('/dashboard')} style={{cursor:'pointer'}}>Skip — I'll connect later</span></p>
  </Wrap>)
}

export default function Onboarding({screen}){
  if(screen==='login') return <LoginScreen/>
  if(screen==='entity') return <EntityScreen/>
  if(screen==='business') return <BusinessScreen/>
  if(screen==='import') return <ImportScreen/>
  return <SignupScreen/>
}
