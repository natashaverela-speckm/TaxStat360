import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
const PK='pk_test_51TJPXq5MkNEttBVv7cYT6PpzXUhFaTS8iqFXfGqscrRXDsACVAZbZ2SVNQ0Gr8pQ9I0Dbo6OCpsaIKMLc9O8PCHr00TtaIAHB8'
const GMAPS_KEY='AIzaSyAjJJCGLoRNVWsSH4_mjL2hBuQhLI98Z2k'

const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}><svg width="30" height="30" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:17,borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)
const Page=({children})=>(<div style={{minHeight:'100vh',background:'#F0F4FF',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'32px 16px',fontFamily:'Inter,sans-serif'}}><div style={{background:'#fff',borderRadius:14,padding:'28px 32px',maxWidth:480,width:'100%',boxShadow:'0 4px 20px rgba(37,99,235,0.10)',border:'1px solid #E2E8F0'}}>{children}</div></div>)
const Field=({label,val,set,type='text',ph,mb=12,autoComplete})=>(<div style={{marginBottom:mb}}><label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</label><input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} autoComplete={autoComplete} style={{width:'100%',padding:'9px 12px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:14,color:N,boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}/></div>)

function SignupScreen(){
  const nav=useNavigate()
  const loc=useLocation()
  const plan=(new URLSearchParams(loc.search).get('plan')||'basic').toLowerCase()
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [pass,setPass]=useState('')
  const [conf,setConf]=useState('')
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState('')
  const [mfaStep,setMfaStep]=useState(false)
  const [otp,setOtp]=useState('')
  const [otpErr,setOtpErr]=useState('')
  const [otpLoading,setOtpLoading]=useState(false)
  const [info,setInfo]=useState('')
  const [stripeReady,setStripeReady]=useState(false)
  const stripeRef=useRef(null)
  const elemRef=useRef(null)
  const cardRef=useRef(null)
  const LABELS={basic:'Basic $49/mo',professional:'Professional $99/mo',advanced:'Advanced $199/mo'}

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
      localStorage.setItem('token',data.access_token)
      localStorage.setItem('plan',plan)
      localStorage.setItem('userName',name)
      localStorage.setItem('pendingEmail',email)
      try{const fd=new FormData();fd.append('EMAIL',email);fd.append('u','f8bbe8c960a3c7bae19433b3e');fd.append('id','f546bd92ac');fd.append('f_id','00cc07e9f0');fd.append('b_f8bbe8c960a3c7bae19433b3e_f546bd92ac','');await fetch('https://themoneynista.us4.list-manage.com/subscribe/post?u=f8bbe8c960a3c7bae19433b3e&id=f546bd92ac&f_id=00cc07e9f0',{method:'POST',mode:'no-cors',body:fd})}catch(e){}
      nav('/verify-email')
    }catch(e){setErr(e.message)}
    finally{setLoading(false)}
  }

  const verifyOtp = async() => {
    setOtpLoading(true);setOtpErr('')
    try{
      const r=await fetch('https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth/mfa/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code:otp})})
      const d=await r.json()
      if(!r.ok||!d.verified)throw new Error(d.error||'Invalid code')
      const redir=localStorage.getItem('login_redirect');localStorage.removeItem('login_redirect')
      nav(redir||((localStorage.getItem('pending_qb_data')||localStorage.getItem('pending_qb_token'))?'/calculate-tax':'/dashboard'))
    }catch(e){setOtpErr(e.message)}finally{setOtpLoading(false)}
  }
  if(mfaStep)return(<Page>
    <LOGO/>
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>Check your email</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 24px'}}>We sent a 6-digit code to <strong>{email}</strong></p>
    <Inp label="Verification Code" val={otp} set={v=>{setOtp(v);setOtpErr('')}} type="text" ph="000000" autoComplete="one-time-code"/>
    {otpErr&&<p style={{color:'#ef4444',fontSize:13,margin:'4px 0 0'}}>{otpErr}</p>}
  const verified=new URLSearchParams(window.location.search).get("verified")
    <button onClick={verifyOtp} disabled={otpLoading||otp.length<6} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',margin:'16px 0 0',opacity:otpLoading?0.7:1}}>{otpLoading?'Verifying...':'Verify Code →'}</button>
    <p style={{textAlign:'center',fontSize:12,color:SL,margin:'12px 0 0',cursor:'pointer'}} onClick={()=>{setMfaStep(false);setOtp('');setOtpErr('')}}>← Back to login</p>
  const verified = new URLSearchParams(window.location.search).get("verified");
  </Page>)
  return(<Page>
    <LOGO/>
    {verified&&<div style={{background:'#D1FAE5',border:'1px solid #6EE7B7',borderRadius:10,padding:'12px 20px',margin:'0 0 16px',color:'#065F46',fontSize:14,fontWeight:600,textAlign:'center'}}>✅ Email verified! Please sign in below.</div>}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
      <div><h2 style={{color:N,fontSize:20,fontWeight:800,margin:0}}>Start your free trial</h2><p style={{color:SL,fontSize:12,margin:'2px 0 0'}}>7 days free — no charge until trial ends</p></div>
      <span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:20,whiteSpace:'nowrap'}}>{LABELS[plan]}</span>
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
      <button onClick={()=>async()=>{
    const params=new URLSearchParams(window.location.search)
    const token=params.get('token')
    if(token){
      try{
        const r=await fetch(API+'/auth/verify-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,email:params.get('email')})})
        const d=await r.json()
        if(d.success){localStorage.setItem('emailVerified','true');nav('/login?verified=1');return}
        else{alert('Verification failed: '+(d.error||'Invalid token'))}
      }catch(e){alert('Network error. Please try again.')}
    } else {
      nav('/onboarding/entity')
    }
  }} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}>I verified my email →</button>
      <p style={{fontSize:12,color:'#94a3b8',margin:0}}>Didn't receive it? Check spam or <span onClick={()=>nav('/signup')} style={{color:B,cursor:'pointer'}} onClick={async()=>{
    const em=localStorage.getItem('pendingEmail')
    if(!em)return
    try{await fetch(API+'/auth/send-verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em})});alert('Verification email resent!');}catch(e){alert('Error resending.')}
  }}>resend email</span></p>
    </div>
  </Page>)
}

function LoginScreen(){
  const nav=useNavigate()
  const [email,setEmail]=useState('')
  const [pass,setPass]=useState('')
  const [loading,setLoading]=useState(false)
  // const verified=new URLSearchParams(window.location.search).get("verified") // moved to component level
  async function submit(e){
    e.preventDefault();setLoading(true);setErr('')
    // ── ADMIN BYPASS ──
    const ADMIN_EMAILS=['support@taxstat360.com','noreply@taxstat360.com']
    if(ADMIN_EMAILS.includes(email.toLowerCase().trim())&&pass==='TeddyBear2026!'){
      localStorage.setItem('token','admin-bypass-token')
      localStorage.setItem('plan','enterprise')
      localStorage.setItem('userName','Admin')
      localStorage.setItem('userEmail',email)
      localStorage.setItem('verified','true')
      localStorage.setItem('admin','true')
      setLoading(false)
      const _r=localStorage.getItem('login_redirect');localStorage.removeItem('login_redirect');window.location.href=_r||'/dashboard'
      return
    }
    // ── END ADMIN BYPASS ──
    try{
      const res=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})})
      const data=await res.json()
      if(!res.ok)throw new Error(data.detail||'Login failed')
      localStorage.setItem('token',data.access_token);localStorage.setItem('plan',data.plan)
      const redir=localStorage.getItem('login_redirect');localStorage.removeItem('login_redirect');nav(redir||((localStorage.getItem('pending_qb_data')||localStorage.getItem('pending_qb_token'))?'/calculate-tax':'/dashboard'))
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
        <p style={{textAlign:'center',fontSize:13,color:'#64748B',margin:'0 0 10px'}}><span onClick={()=>nav('/forgot-password')} style={{color:B,cursor:'pointer',fontWeight:600}}>Forgot your password?</span></p>
  </Page>)
}

function EntityScreen(){
  const nav=useNavigate()
  const [selected,setSelected]=useState('')
  const types=['S-Corporation','Multi-Member LLC','Partnership','Sole Proprietor','Single-Member LLC','C-Corporation']
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
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>Import your financial data</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 18px'}}>Import your financials to power your AI tax analysis.</p>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
      {integrations.map(i=>(<button key={i.name} type="button" onClick={()=>{ const userId=localStorage.getItem('userEmail')||'unknown'; const base='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/auth'; const routes={QuickBooks:base+'/quickbooks/connect',Xero:base+'/xero/connect',FreshBooks:base+'/freshbooks/connect',Wave:base+'/wave/connect'}; const url=routes[i.name]; if(url){ window.location.href=url+'?userId='+encodeURIComponent(userId) } else { nav('/calculate-tax') } }} style={{padding:'16px 12px',border:'1px solid #E2E8F0',borderRadius:10,cursor:'pointer',background:'#fff'}} onMouseOver={e=>e.currentTarget.style.borderColor=i.color} onMouseOut={e=>e.currentTarget.style.borderColor='#E2E8F0'}><div style={{width:38,height:38,borderRadius:8,background:i.color,color:'#fff',fontWeight:800,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px'}}>{i.logo}</div><div style={{fontSize:13,fontWeight:600,color:N}}>{i.name}</div><div style={{fontSize:10,color:'#64748B',marginTop:4}}>Upload CSV</div></button>))}
    </div>
    <button onClick={()=>nav('/dashboard')} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10}}>Go to My Dashboard →</button>
    <p style={{textAlign:'center',fontSize:12,color:SL,margin:0,cursor:'pointer'}} onClick={()=>nav('/dashboard')}>Skip — connect later</p>
  </Page>)
}


function ForgotPasswordScreen(){
  const nav=useNavigate()
  const [email,setEmail]=useState('')
  const [sent,setSent]=useState(false)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState('')
  const API_URL='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
  const submit=async()=>{
    if(!email.trim())return setErr('Please enter your email address')
    setLoading(true);setErr('')
    try{
      const r=await fetch(API_URL+'/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})})
      const d=await r.json()
      if(d.success)setSent(true)
      else setErr(d.error||'Something went wrong')
    }catch(e){setErr('Network error. Please try again.')}
    setLoading(false)
  }
  return(<Page><LOGO/>
    <div style={{textAlign:'center',padding:'20px 0'}}>
      {sent?(<>
        <div style={{fontSize:48,marginBottom:16}}>📬</div>
        <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>Check your email</h2>
        <p style={{color:SL,fontSize:14,margin:'0 0 24px',lineHeight:1.6}}>If an account exists for <strong>{email}</strong>, a reset link is on its way.</p>
        <button onClick={()=>nav('/login')} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer'}}>Back to Sign In</button>
      </>):(<>
        <div style={{fontSize:48,marginBottom:16}}>🔐</div>
        <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>Forgot your password?</h2>
        <p style={{color:SL,fontSize:14,margin:'0 0 24px',lineHeight:1.6}}>Enter your account email and we'll send you a reset link.</p>
        <Field label="Email" val={email} set={setEmail} type="email" ph="you@company.com" autoComplete="email"/>
        {err&&<p style={{color:'#ef4444',fontSize:13,margin:'4px 0 8px'}}>{err}</p>}
        <button onClick={submit} disabled={loading} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12,opacity:loading?0.7:1}}>{loading?'Sending...':'Send Reset Link'}</button>
        <button onClick={()=>nav('/login')} style={{width:'100%',padding:'10px',background:'transparent',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:14,cursor:'pointer'}}>Back to Sign In</button>
      </>)}
    </div>
  </Page>)
}

function ResetPasswordScreen(){
  const nav=useNavigate()
  const [pass,setPass]=useState('')
  const [confirm,setConfirm]=useState('')
  const [loading,setLoading]=useState(false)
  const [done,setDone]=useState(false)
  const [err,setErr]=useState('')
  const API_URL='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
  const token=new URLSearchParams(window.location.search).get('token')
  const submit=async()=>{
    if(!token)return setErr('Invalid reset link. Please request a new one.')
    if(pass.length<8)return setErr('Password must be at least 8 characters')
    if(pass!==confirm)return setErr('Passwords do not match')
    setLoading(true);setErr('')
    try{
      const r=await fetch(API_URL+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:pass})})
      const d=await r.json()
      if(d.success)setDone(true)
      else setErr(d.error||'Something went wrong')
    }catch(e){setErr('Network error. Please try again.')}
    setLoading(false)
  }
  return(<Page><LOGO/>
    <div style={{textAlign:'center',padding:'20px 0'}}>
      {done?(<>
        <div style={{fontSize:48,marginBottom:16}}>✅</div>
        <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>Password reset!</h2>
        <p style={{color:SL,fontSize:14,margin:'0 0 24px',lineHeight:1.6}}>Your password has been updated. Sign in with your new password.</p>
        <button onClick={()=>nav('/login')} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer'}}>Sign In →</button>
      </>):(<>
        <div style={{fontSize:48,marginBottom:16}}>🔑</div>
        <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>Set new password</h2>
        <p style={{color:SL,fontSize:14,margin:'0 0 24px',lineHeight:1.6}}>Choose a strong password for your TaxStat360 account.</p>
        <Field label="New Password" val={pass} set={setPass} type="password" ph="Min. 8 characters" mb={8}/>
        <Field label="Confirm Password" val={confirm} set={setConfirm} type="password" ph="Repeat password" mb={0}/>
        {err&&<p style={{color:'#ef4444',fontSize:13,margin:'8px 0 4px'}}>{err}</p>}
        <button onClick={submit} disabled={loading} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginTop:16,opacity:loading?0.7:1}}>{loading?'Resetting...':'Reset Password'}</button>
      </>)}
    </div>
  </Page>)
}

export default function Onboarding({screen}){
  if(screen==='login') return <LoginScreen/>
  if(screen==='verify') return <VerifyEmailScreen/>
  if(screen==='forgot') return <ForgotPasswordScreen/>
  if(screen==='reset') return <ResetPasswordScreen/>
  if(screen==='entity') return <EntityScreen/>
  if(screen==='business') return <BusinessScreen/>
  if(screen==='import') return <ImportScreen/>
  return <SignupScreen/>
}
