import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://app.taxstat360.com'
const PK='pk_live_51TJmYhGUoj1XrJQjwM8Wo8tLgTmyQsUISsQw9zUEre4RHmDu9ciJNspQPU43Gjt0uYaDhFJR0Pw5QHUHJx7Ru0op00di8gFL4e'
const GMAPS_KEY='AIzaSyAjJJCGLoRNVWsSH4_mjL2hBuQhLI98Z2k'

const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}><svg width="30" height="30" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:17,borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)
const Page=({children})=>(<div style={{minHeight:'100vh',background:'#F0F4FF',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'32px 16px',fontFamily:'Inter,sans-serif'}}><div style={{background:'#fff',borderRadius:14,padding:'28px 32px',maxWidth:480,width:'100%',boxShadow:'0 4px 20px rgba(37,99,235,0.10)',border:'1px solid #E2E8F0'}}>{children}</div></div>)
const Field=({label,val,set,type='text',ph,mb=12,autoComplete})=>(<div style={{marginBottom:mb}}><label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</label><input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} autoComplete={autoComplete} style={{width:'100%',padding:'9px 12px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:14,color:N,boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}/></div>)

function SignupScreen(){
  const nav=useNavigate()
  const loc=useLocation()
  const planRaw=(new URLSearchParams(loc.search).get('plan')||'starter').toLowerCase()
  const plan=['starter','professional','enterprise'].includes(planRaw)?planRaw:'starter'
  const billing=(new URLSearchParams(loc.search).get('billing')||'monthly').toLowerCase()==='annual'?'annual':'monthly'
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [pass,setPass]=useState('')
  const [conf,setConf]=useState('')
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState('')
  const [info,setInfo]=useState('')
  const [stripeReady,setStripeReady]=useState(false)
  const stripeRef=useRef(null)
  const elemRef=useRef(null)
  const cardRef=useRef(null)
  const MONTHLY_PRICES={starter:'$79',professional:'$149',enterprise:'$299'}
  const ANNUAL_PRICES={starter:'$66',professional:'$124',enterprise:'$249'}
  const planPrice=billing==='annual' ? ANNUAL_PRICES[plan] : MONTHLY_PRICES[plan]
  const planLabel=plan.charAt(0).toUpperCase()+plan.slice(1)+' '+planPrice+'/mo'+(billing==='annual' ? ' · Annual' : '')

  useEffect(()=>{
    const s=document.createElement('script');s.src='https://js.stripe.com/v3/'
    s.onload=()=>{
      const sk=window.Stripe(PK);stripeRef.current=sk
      const els=sk.elements();elemRef.current=els
      const card=els.create('card',{style:{base:{fontSize:'16px',color:'#0D1B3E',fontFamily:'Inter,sans-serif',lineHeight:'24px','::placeholder':{color:'#94a3b8'}}}})
      setTimeout(()=>{if(cardRef.current){card.mount(cardRef.current);setStripeReady(true)}},200)
    }
    document.head.appendChild(s)
  },[])

  async function submit(e){
    e.preventDefault()
    if(pass!==conf){setErr('Passwords do not match.');return}
    if(pass.length<8){setErr('Password must be at least 8 characters.');return}
    if(!stripeReady){setErr('Card input still loading, please wait...');return}
    setLoading(true);setErr('')
    try{
      const si=await fetch(API+'/stripe/setup-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json())
      if(!si.client_secret)throw new Error('Payment init failed')
      const card=elemRef.current.getElement('card')
      const {setupIntent,error}=await stripeRef.current.confirmCardSetup(si.client_secret,{payment_method:{card,billing_details:{name,email}}})
      if(error)throw new Error(error.message)
      const reg=await fetch(API+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pass,plan,payment_method_id:setupIntent.payment_method})})
      const data=await reg.json()
      if(!reg.ok)throw new Error(data.detail||'Registration failed')
      localStorage.setItem('token',data.access_token);localStorage.setItem('ts360_email',email)
      localStorage.setItem('ts360_session',data.access_token)
      localStorage.setItem('plan',plan)
      localStorage.setItem('billing',billing)
      // Create Stripe subscription for recurring billing
      try{
        await fetch(API+'/stripe/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,plan,billing,payment_method_id:setupIntent.payment_method})})
      }catch(e){ console.warn('Subscribe call failed:',e) }
      localStorage.setItem('userName',name)
      localStorage.setItem('pendingEmail',email)
      // Subscribe to Mailchimp audience (taxstat360.us4 — canonical list)
      try {
        const mcData = new URLSearchParams()
        mcData.append('EMAIL', email)
        mcData.append('FNAME', name ? name.split(' ')[0] : '')
        mcData.append('LNAME', name ? name.split(' ').slice(1).join(' ') : '')
        mcData.append('tags', 'TaxStat360 Signup')
        await fetch('https://taxstat360.us4.list-manage.com/subscribe/post?u=c09d008a62d6587f7f0b7e6888c354e8&id=f546bd92ac&f_id=00e0e0e1f0', {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: mcData.toString()
        })
      } catch(e) {}
      nav('/verify-email')
    }catch(e){setErr(e.message)}
    finally{setLoading(false)}
  }

  return(<Page>
    <LOGO/>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
      <div><h2 style={{color:N,fontSize:20,fontWeight:800,margin:0}}>Start your free trial</h2><p style={{color:SL,fontSize:12,margin:'2px 0 0'}}>7 days free — no charge until trial ends</p></div>
      <span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:20,whiteSpace:'nowrap'}}>{planLabel}</span>
    </div>
    <form onSubmit={submit}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        <Field label="Full Name" val={name} set={setName} ph="Jane Smith" mb={0} autoComplete="name"/>
        <Field label="Email" val={email} set={setEmail} type="email" ph="jane@co.com" mb={0} autoComplete="email"/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        <Field label="Password" val={pass} set={setPass} type="password" ph="Min. 8 chars" mb={0} autoComplete="new-password"/>
        <Field label="Confirm Password" val={conf} set={setConf} type="password" ph="Repeat password" mb={0} autoComplete="new-password"/>
      </div>
      <div style={{marginBottom:12}}>
        <label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Card Details</label>
        <div ref={cardRef} style={{padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',minHeight:48,cursor:'text'}}/>
        {!stripeReady&&<p style={{fontSize:11,color:'#94a3b8',margin:'4px 0 0'}}>Loading secure card input...</p>}
      </div>
      {err&&<div style={{background:'#FEF2F2',color:'#DC2626',padding:'8px 12px',borderRadius:7,fontSize:12,marginBottom:10}}>{err}</div>}
      <button type="submit" disabled={loading} style={{width:'100%',padding:'11px',background:loading?'#93c5fd':B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10}}>{loading?'Processing...':'Start Free Trial →'}</button>
      <p style={{fontSize:11,color:'#94a3b8',textAlign:'center',margin:'0 0 8px',lineHeight:1.4}}>🔒 Card for identity verification only. <b>Not charged</b> until after 7-day trial. Cancel anytime.</p>
      <p style={{textAlign:'center',fontSize:12,color:SL,margin:0}}>Have an account? <span onClick={()=>nav('/login')} style={{color:B,cursor:'pointer',fontWeight:600}}>Sign in</span> · <span onClick={()=>nav('/')} style={{color:SL,cursor:'pointer'}}>← Home</span></p>
    </form>
  </Page>)
}

function VerifyEmailScreen(){
  const nav=useNavigate()
  const email=localStorage.getItem('pendingEmail')||'your email'
  return(<Page>
    <LOGO/>
    <div style={{textAlign:'center',padding:'20px 0'}}>
      <div style={{fontSize:48,marginBottom:16}}>📧</div>
      <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>Check your email</h2>
      <p style={{color:SL,fontSize:14,margin:'0 0 8px'}}>We sent a verification link to</p>
      <p style={{color:B,fontWeight:700,fontSize:15,margin:'0 0 24px'}}>{email}</p>
      <p style={{color:SL,fontSize:13,margin:'0 0 24px',lineHeight:1.6}}>Click the link in the email to verify your account and continue setting up TaxStat360.</p>
      <button onClick={()=>nav('/onboarding/entity')} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}>I verified my email →</button>
      <p style={{fontSize:12,color:'#94a3b8',margin:0}}>Didn't receive it? Check spam or <span onClick={()=>nav('/signup')} style={{color:B,cursor:'pointer'}}>try a different email</span></p>
    </div>
  </Page>)
}

function LoginScreen(){
  const nav=useNavigate()
  const location=useLocation()
  // F-04: if RequireAuth redirected the user here, location.state.from carries the URL they
  // were trying to reach. Send them back there after login. Falls back to /dashboard for
  // direct logins (user clicked Sign In link, no protected URL was attempted).
  const redirectTo=location.state?.from?.pathname || '/dashboard'
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
      localStorage.setItem('token',data.access_token);localStorage.setItem('ts360_email',email);localStorage.setItem('plan',data.plan);localStorage.setItem('ts360_session',data.access_token)
      nav(redirectTo,{replace:true})
    }catch(e){setErr(e.message)}
    finally{setLoading(false)}
  }
  return(<Page>
    <LOGO/>
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>Welcome back</h2>
    <p style={{color:SL,fontSize:12,margin:'0 0 20px'}}>Sign in to your TaxStat360 account</p>
    <form onSubmit={submit}>
      <Field label="Email" val={email} set={setEmail} type="email" ph="you@company.com" autoComplete="email"/>
      <Field label="Password" val={pass} set={setPass} type="password" ph="Your password" autoComplete="current-password"/>
      {err&&<div style={{background:'#FEF2F2',color:'#DC2626',padding:'8px 12px',borderRadius:7,fontSize:12,marginBottom:10}}>{err}</div>}
      <button type="submit" disabled={loading} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}>{loading?'Signing in...':'Sign In →'}</button>
      <p style={{textAlign:'center',fontSize:12,color:SL,margin:0}}>No account? <span onClick={()=>nav('/signup')} style={{color:B,cursor:'pointer',fontWeight:600}}>Start free trial</span></p>
    </form>
  </Page>)
}

function EntityScreen(){
  const nav=useNavigate()
  const [selected,setSelected]=useState('')
  const types=['S-Corporation','Multi-Member LLC','Partnership','Sole Proprietor','C-Corporation','Other']
  return(<Page>
    <LOGO/>
    <div style={{marginBottom:16}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 1 of 3</span></div>
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>What is your business entity?</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 18px'}}>We use this to map the right IRS schedules for your analysis.</p>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
      {types.map(t=>(<button key={t} type="button" onClick={()=>setSelected(t)} style={{padding:'14px 10px',border:'2px solid '+(selected===t?B:'#E2E8F0'),borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:600,color:selected===t?B:N,background:selected===t?'#EFF6FF':'#fff'}}>{t}</button>))}
    </div>
    <button onClick={()=>{if(selected){localStorage.setItem('entityType',selected);nav('/onboarding/business')}}} disabled={!selected} style={{width:'100%',padding:'11px',background:selected?B:'#94a3b8',color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:selected?'pointer':'not-allowed'}}>Continue →</button>
  </Page>)
}

function BusinessScreen(){
  const nav=useNavigate()
  const [biz,setBiz]=useState('')
  const [ein,setEin]=useState('')
  const [addr,setAddr]=useState('')
  const addrRef=useRef(null)

  useEffect(()=>{
    // Load Google Places autocomplete
    if(window.google&&window.google.maps){
      initAutocomplete()
    } else {
      const s=document.createElement('script')
      s.src='https://maps.googleapis.com/maps/api/js?key='+GMAPS_KEY+'&libraries=places'
      s.onload=initAutocomplete
      document.head.appendChild(s)
    }
    function initAutocomplete(){
      if(!addrRef.current)return
      try{
        const ac=new window.google.maps.places.Autocomplete(addrRef.current,{types:['address'],componentRestrictions:{country:'us'}})
        ac.addListener('place_changed',()=>{
          const p=ac.getPlace()
          if(p.formatted_address)setAddr(p.formatted_address)
        })
      }catch(e){}
    }
  },[])

  async function submit(e){
    e.preventDefault()
    try{await fetch(API+'/user/business-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_name:biz,ein,address:addr})})}catch(e){}
    nav('/onboarding/import')
  }
  return(<Page>
    <LOGO/>
    <div style={{marginBottom:16}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 2 of 3</span></div>
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>Tell us about your business</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 18px'}}>Personalizes your IRS compliance and tax analysis.</p>
    <form onSubmit={submit}>
      <Field label="Business Name" val={biz} set={setBiz} ph="Acme Corp LLC" autoComplete="organization"/>
      <Field label="EIN (optional)" val={ein} set={setEin} ph="XX-XXXXXXX"/>
      <div style={{marginBottom:12}}>
        <label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Business Address</label>
        <input ref={addrRef} type="text" value={addr} onChange={e=>setAddr(e.target.value)} placeholder="Start typing your address..." autoComplete="street-address" style={{width:'100%',padding:'9px 12px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:14,color:N,boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}/>
      </div>
      <button type="submit" style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10}}>Continue →</button>
      <p style={{textAlign:'center',fontSize:12,color:SL,margin:0,cursor:'pointer'}} onClick={()=>nav('/onboarding/import')}>Skip for now →</p>
    </form>
  </Page>)
}

function ImportScreen(){
  const nav=useNavigate()
  const integrations=[{name:'QuickBooks',color:'#2CA01C',logo:'QB'},{name:'FreshBooks',color:'#1a9c3e',logo:'FB'},{name:'Xero',color:'#13B5EA',logo:'XE'},{name:'Wave',color:'#2C6ECB',logo:'WV'}]
  return(<Page>
    <LOGO/>
    <div style={{marginBottom:16}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 3 of 3</span></div>
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>Connect your accounting software</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 18px'}}>Import your financials to power your AI tax analysis.</p>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
      {integrations.map(i=>(<button key={i.name} type="button" onClick={()=>window.open(API+'/integrations/'+i.name.toLowerCase()+'/connect','_blank')} style={{padding:'16px 12px',border:'1px solid #E2E8F0',borderRadius:10,cursor:'pointer',background:'#fff'}} onMouseOver={e=>e.currentTarget.style.borderColor=i.color} onMouseOut={e=>e.currentTarget.style.borderColor='#E2E8F0'}><div style={{width:38,height:38,borderRadius:8,background:i.color,color:'#fff',fontWeight:800,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px'}}>{i.logo}</div><div style={{fontSize:13,fontWeight:600,color:N}}>{i.name}</div></button>))}
    </div>
    <button onClick={()=>nav('/calculate-tax')} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10}}>Go to My Dashboard →</button>
    <p style={{textAlign:'center',fontSize:12,color:SL,margin:0,cursor:'pointer'}} onClick={()=>nav('/calculate-tax')}>Skip — connect later</p>
  </Page>)
}

export default function Onboarding({screen}){
  if(screen==='login') return <LoginScreen/>
  if(screen==='verify') return <VerifyEmailScreen/>
  if(screen==='entity') return <EntityScreen/>
  if(screen==='business') return <BusinessScreen/>
  if(screen==='import') return <ImportScreen/>
  return <SignupScreen/>
}
