import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://app.taxstat360.com'
const PK='pk_live_51TJmYhGUoj1XrJQjwM8Wo8tLgTmyQsUISsQw9zUEre4RHmDu9ciJNspQPU43Gjt0uYaDhFJR0Pw5QHUHJx7Ru0op00di8gFL4e'
const GMAPS_KEY='AIzaSyAjJJCGLoRNVWsSH4_mjL2hBuQhLI98Z2k'

const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:20}}><svg width="28" height="28" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill="#2563EB"/><rect x="8" y="18" width="5" height="8" rx="2" fill="#fff"/><rect x="15" y="12" width="5" height="14" rx="2" fill="#fff"/><rect x="22" y="8" width="5" height="18" rx="2" fill="#fff"/></svg><div style={{fontWeight:800,color:N,fontSize:17,borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)
const Page=({children})=>(<div style={{minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'32px 16px',fontFamily:'Inter,sans-serif'}}><div style={{background:'#fff',borderRadius:14,padding:'28px 32px',maxWidth:480,width:'100%',boxShadow:'0 4px 20px rgba(37,99,235,0.10)',border:'1px solid #E2E8F0'}}>{children}</div></div>)
const Field=({label,val,set,type='text',ph,mb=12,autoComplete})=>(<div style={{marginBottom:mb}}><label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</label><input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph} autoComplete={autoComplete} style={{width:'100%',padding:'9px 12px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:14,color:N,boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}/></div>)

// FIX (PW-STRENGTH): Password strength scoring and visual indicator.
function pwStrength(pass) {
  const checks = {
    length:  pass.length >= 12,
    upper:   /[A-Z]/.test(pass),
    number:  /[0-9]/.test(pass),
    special: /[^A-Za-z0-9]/.test(pass),
  }
  const score = Object.values(checks).filter(Boolean).length
  const LEVELS = ['', 'Weak', 'Fair', 'Strong', 'Very Strong']
  const COLORS = ['', '#dc2626', '#d97706', '#059669', '#2563EB']
  return { score, checks, label: LEVELS[score] || '', color: COLORS[score] || '' }
}

function PasswordStrength({ pass }) {
  if (!pass) return null
  const { score, checks, label, color } = pwStrength(pass)
  return (
    <div style={{ marginTop: 6, marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= score ? color : '#E2E8F0',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        {label && (
          <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { key: 'length',  text: '12+ chars' },
            { key: 'upper',   text: 'A–Z' },
            { key: 'number',  text: '0–9' },
            { key: 'special', text: '!@#…' },
          ].map(c => (
            <span key={c.key} style={{
              fontSize: 10, fontWeight: 600,
              color: checks[c.key] ? '#059669' : '#CBD5E1',
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              {checks[c.key] ? '✓' : '·'} {c.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

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
    if(pass.length<12){setErr('Password must be at least 12 characters.');return}
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
      localStorage.setItem('ts360_session_start', String(Date.now()))
      localStorage.setItem('plan',plan)
      localStorage.setItem('billing',billing)
      try{
        await fetch(API+'/stripe/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,plan,billing,payment_method_id:setupIntent.payment_method})})
      }catch(e){ console.warn('Subscribe call failed:',e) }
      localStorage.setItem('userName',name)
      localStorage.setItem('pendingEmail',email)
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

    {/* UX-02: Two-step progress indicator — shows users what's coming before they
        start filling fields, reducing form abandonment anxiety. Step 1 is active
        (account info: name, email, password). Step 2 is upcoming (card). */}
    <div style={{display:'flex',alignItems:'center',marginBottom:20,padding:'12px 16px',background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
      {/* Step 1 — active */}
      <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
        <div style={{width:26,height:26,borderRadius:'50%',background:B,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,flexShrink:0}}>1</div>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:B,lineHeight:1.2}}>Account Info</div>
          <div style={{fontSize:10,color:'#94A3B8',lineHeight:1.2}}>Name, email, password</div>
        </div>
      </div>
      {/* Connector */}
      <div style={{flex:'0 0 28px',height:2,background:'#E2E8F0',margin:'0 6px'}}/>
      {/* Step 2 — upcoming */}
      <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
        <div style={{width:26,height:26,borderRadius:'50%',background:'#E2E8F0',color:'#94A3B8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,flexShrink:0}}>2</div>
        <div>
          <div style={{fontSize:12,fontWeight:700,color:'#94A3B8',lineHeight:1.2}}>Trial Setup</div>
          <div style={{fontSize:10,color:'#CBD5E1',lineHeight:1.2}}>Card verification</div>
        </div>
      </div>
    </div>

    <form onSubmit={submit}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        <Field label="Full Name" val={name} set={setName} ph="Jane Smith" mb={0} autoComplete="name"/>
        <Field label="Email" val={email} set={setEmail} type="email" ph="jane@co.com" mb={0} autoComplete="email"/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:4}}>
        <div>
          <label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Password</label>
          <input
            type="password"
            value={pass}
            onChange={e=>setPass(e.target.value)}
            placeholder="Min. 12 chars"
            autoComplete="new-password"
            style={{width:'100%',padding:'9px 12px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:14,color:N,boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}
          />
        </div>
        <Field label="Confirm Password" val={conf} set={setConf} type="password" ph="Repeat password" mb={0} autoComplete="new-password"/>
      </div>
      <div style={{marginBottom:12}}>
        <PasswordStrength pass={pass} />
      </div>

      {/* UX-01: Trust message moved to BEFORE the card field so users see it
          before entering card details — not buried after the submit button.
          Displayed as a green notice to draw the eye and build confidence. */}
      <div style={{
        display:'flex',alignItems:'flex-start',gap:10,
        background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:8,
        padding:'10px 14px',marginBottom:12,
      }}>
        <span style={{fontSize:16,flexShrink:0,lineHeight:1.4}}>🔒</span>
        <p style={{fontSize:12,color:'#166534',margin:0,lineHeight:1.5}}>
          <strong>Card for identity verification only.</strong> You will <strong>not be charged</strong> until after your 7-day free trial ends. Cancel anytime.
        </p>
      </div>

      <div style={{marginBottom:12}}>
        <label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Card Details</label>
        <div ref={cardRef} style={{padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',minHeight:48,cursor:'text'}}/>
        {!stripeReady&&<p style={{fontSize:11,color:'#94a3b8',margin:'4px 0 0'}}>Loading secure card input...</p>}
      </div>

      {err&&<div style={{background:'#FEF2F2',color:'#DC2626',padding:'8px 12px',borderRadius:7,fontSize:12,marginBottom:10}}>{err}</div>}
      <p style={{fontSize:11,color:'#64748b',textAlign:'center',margin:'0 0 10px',lineHeight:1.5}}>
        By creating an account you agree to our{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{color:B,textDecoration:'underline'}}>Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{color:B,textDecoration:'underline'}}>Privacy Policy</a>.
      </p>
      <button type="submit" disabled={loading} style={{width:'100%',padding:'11px',background:loading?'#93c5fd':B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}>{loading?'Processing...':'Start Free Trial →'}</button>
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
      localStorage.setItem('ts360_session_start', String(Date.now()))
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
      <p style={{textAlign:'center',fontSize:12,color:SL,margin:'0 0 8px'}}>No account? <span onClick={()=>nav('/signup')} style={{color:B,cursor:'pointer',fontWeight:600}}>Start free trial</span></p>
      <p style={{textAlign:'center',fontSize:12,margin:0}}><span onClick={()=>nav('/forgot-password')} style={{color:SL,cursor:'pointer',textDecoration:'underline'}}>Forgot your password?</span></p>
    </form>
  </Page>)
}

function EntityScreen(){
  const nav=useNavigate()
  const [selected,setSelected]=useState('')
  const types=['Sole Proprietor / Single-Member LLC','Partnership / MMLLC','S Corporation','C Corporation','Other']
  return(<Page>
    <LOGO/>
    <div style={{marginBottom:16}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 1 of 3</span></div>
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>What is your business entity?</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 18px'}}>We use this to map the right IRS schedules for your analysis.</p>
    <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
      {types.map(t=>(<button key={t} type="button" onClick={()=>setSelected(t)} style={{padding:'14px 14px',textAlign:'left',border:'2px solid '+(selected===t?B:'#E2E8F0'),borderRadius:10,cursor:'pointer',fontSize:13,fontWeight:600,color:selected===t?B:N,background:selected===t?'#EFF6FF':'#fff'}}>{t}</button>))}
    </div>
    <p style={{color:SL,fontSize:11,margin:'0 0 20px',lineHeight:1.5,fontStyle:'italic'}}>For partnerships, you'll specify Active vs Passive treatment when entering your tax details — this affects whether self-employment tax applies.</p>
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
  const [showSecurityNudge, setShowSecurityNudge]=useState(false)
  const mfaAlreadyEnabled=localStorage.getItem('ts360_mfa_enabled')==='1'
  const integrations=[{name:'QuickBooks',color:'#2CA01C',logo:'QB'},{name:'FreshBooks',color:'#1a9c3e',logo:'FB'},{name:'Xero',color:'#13B5EA',logo:'XE'},{name:'Wave',color:'#2C6ECB',logo:'WV'}]

  function handleContinue(){
    if(!mfaAlreadyEnabled){
      setShowSecurityNudge(true)
    } else {
      nav('/calculate-tax')
    }
  }

  if(showSecurityNudge){
    return(
      <Page>
        <LOGO/>
        <div style={{textAlign:'center',padding:'8px 0'}}>
          <div style={{fontSize:44,marginBottom:14}}>🔐</div>
          <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 10px'}}>One last thing — protect your account</h2>
          <p style={{color:SL,fontSize:13,margin:'0 0 6px',lineHeight:1.6}}>
            TaxStat360 stores sensitive financial and tax data. Two-factor authentication adds a critical second layer of security — strongly recommended by IRS Publication 4557 for any software handling taxpayer information.
          </p>
          <p style={{color:'#64748b',fontSize:12,margin:'0 0 24px',lineHeight:1.5}}>
            Takes less than 2 minutes with any authenticator app (Google Authenticator, Authy, 1Password).
          </p>
          <button
            onClick={()=>nav('/settings')}
            style={{width:'100%',padding:'12px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}
          >
            🔐 Set up 2FA in Settings →
          </button>
          <button
            onClick={()=>nav('/calculate-tax')}
            style={{width:'100%',padding:'10px',background:'#fff',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',marginBottom:8}}
          >
            Skip for now — go to my dashboard
          </button>
          <p style={{fontSize:11,color:'#94a3b8',margin:0,lineHeight:1.5}}>
            You can enable 2FA at any time in Settings → Security.
          </p>
        </div>
      </Page>
    )
  }

  return(<Page>
    <LOGO/>
    <div style={{marginBottom:16}}><span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20}}>Step 3 of 3</span></div>
    <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>Connect your accounting software</h2>
    <p style={{color:SL,fontSize:13,margin:'0 0 18px'}}>Import your financials to power your AI tax analysis.</p>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
      {integrations.map(i=>(<button key={i.name} type="button" onClick={()=>window.open(API+'/integrations/'+i.name.toLowerCase()+'/connect','_blank')} style={{padding:'16px 12px',border:'1px solid #E2E8F0',borderRadius:10,cursor:'pointer',background:'#fff'}} onMouseOver={e=>e.currentTarget.style.borderColor=i.color} onMouseOut={e=>e.currentTarget.style.borderColor='#E2E8F0'}><div style={{width:38,height:38,borderRadius:8,background:i.color,color:'#fff',fontWeight:800,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px'}}>{i.logo}</div><div style={{fontSize:13,fontWeight:600,color:N}}>{i.name}</div></button>))}
    </div>
    <button onClick={handleContinue} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10}}>Go to My Dashboard →</button>
    <p style={{textAlign:'center',fontSize:12,color:SL,margin:0,cursor:'pointer'}} onClick={handleContinue}>Skip — connect later</p>
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
