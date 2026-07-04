import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
// SEC-01 FIX: Stripe live key moved to environment variable (VITE_STRIPE_PK).
//   Was: const PK='pk_live_51TJmYh...' hardcoded in source.
//   Now: reads from import.meta.env.VITE_STRIPE_PK.
//   Set VITE_STRIPE_PK in Amplify env vars (live pk_live_...); pk_test_... locally in .env.development
//
// SEC-02 FIX: Google Maps key moved to environment variable (VITE_GMAPS_KEY).
//   Was: const GMAPS_KEY='AIzaSy...' hardcoded in source.
//   Now: reads from import.meta.env.VITE_GMAPS_KEY only (no hardcoded fallback).
//   Set VITE_GMAPS_KEY in Amplify env vars; restrict key to taxstat360.com/* in GCP.
//
// SEC-03 FIX: API base URL now imported from constants.js instead of hardcoded.
//   Was: const API='https://app.taxstat360.com' (violates architecture rule in constants.js)
//   Now: imported as API_BASE_URL. Value is identical — no integration behaviour changes.
//   All integration connect URLs (QuickBooks, Xero, Wave, FreshBooks) continue to use
//   API + '/integrations/' + providerName + '/connect' which resolves identically.
//
// F-06 FIX: Annual discount label now uses ANNUAL_DISCOUNT_LABEL from constants.js.
//   Was: hardcoded 'save ~17%' — inconsistent with 'Save 2 months' on Landing.jsx.
//   Now: uses the canonical constant so any future discount change is one edit.
//
// UX-05 FIX: "← Home" span replaced with semantic <a href="/"> link.
//
// CC-04 FIX: LoginScreen now includes a minimal footer with ToS/Privacy links
//   and planning-only disclaimer.
//
// A11Y FIX: form labels are now programmatically associated with their inputs
//   (htmlFor/id) in the shared Field component and the two custom inputs
//   (signup password, business address).
//
// ── AUDIT PASS 2 FIXES ────────────────────────────────────────────────────────
// O3 FIX: Onboarding EntityScreen listed 5 entity types including "C Corporation"
//   and "Other", but the Tax Tracker only supports 4 types and omits C-Corp.
//   "Real Estate (Schedule E)" — a core use case for the target audience —
//   was absent from onboarding entirely. Fixed: EntityScreen lists the same
//   types the Tax Tracker supports, plus "Real Estate (Schedule E)".
//   (Update — C-Corp support has since been built out across the engine, Tax
//   Tracker, and Dashboard, so C Corporation is now a selectable option and the
//   former "not supported" notice has been removed.)
//   "Other" is removed (it mapped to no Tax Tracker entity). The entity type
//   written to localStorage now uses the canonical Tax Tracker string so it
//   hydrates the entity card correctly on first session.
//
// O4 FIX: ImportScreen "Go to My Dashboard →" button called nav('/calculate-tax'),
//   not nav('/dashboard'). Button label said Dashboard; destination was Tax Tracker.
//   Fixed: handleContinue now navigates to '/dashboard' when skipping or after
//   the MFA nudge's "Skip for now" path. A first-run banner is written to
//   sessionStorage key ts360_first_run so CalculateTaxInner can show a contextual
//   prompt guiding users who skipped Step 3 to add their revenue and expenses.
//   Note: the existing security-nudge "Set up 2FA in Settings →" path correctly
//   navigates to /settings; the "Skip for now — go to my dashboard" button within
//   that nudge is also fixed to nav('/dashboard').
//
// O5 FIX: Password mismatch ('Passwords do not match') only fired on form submit,
//   after the user had already scrolled past and entered card details. Fixed:
//   added an onBlur handler on the Confirm Password field that validates the match
//   immediately when the user tabs or clicks away. The error is set via setConfErr
//   (a dedicated confirm-field error state, separate from the submit-level setErr)
//   so it renders inline below the confirm field — visible without scrolling.
//   The submit guard still checks pass !== conf as a final safety net.
//
// O6 FIX: Plan selector in SignupScreen showed name + price only. Users had no
//   basis for choosing a plan without returning to the pricing page. Fixed: added
//   a one-line feature summary under each plan name in the picker. Summaries are
//   sourced from PLAN_FEATURES in constants.js (added in that file's patch).
//   The 'Professional' plan now also displays a 'Most popular' badge since it is
//   the default selection.
//
// O7 FIX: BusinessScreen collected Business Name, EIN, and Address but:
//   (a) none appeared anywhere in the Tax Tracker UI;
//   (b) the step looked required but skipping had no visible consequence.
//   Fixed: (a) Business name is written to sessionStorage key ts360_biz_name
//   so CalculateTaxInner can use it as the entity card label (entity.name)
//   when adding the first entity. EIN and address are written to
//   ts360_biz_ein and ts360_biz_address so AIAnalysis CPA Export can use them
//   on the report cover. (b) Step header and subtitle are updated to make the
//   optional nature explicit: subtitle now reads "Optional — used in your CPA
//   Export report and entity card". A "Business info" note in Settings is
//   outside this file's scope but is called out in the comment below.

import { API_BASE_URL as API, ANNUAL_DISCOUNT_LABEL, PLAN_FEATURES } from './constants.js'
import { refreshPlanFromServer, normalizePlanId } from './LockedFeature.jsx'
import { apiFetch } from './utils/apiClient.js'
import { readBusinessInfo, readLoggedIn, writeLoggedIn, readSessionStart, writeSessionStart, readEmail, writeEmail, writeToken, writePlan, readPlan, writeBilling, writeSubscriptionIncomplete, removeSubscriptionIncomplete, writeUserName, writeEmailVerified, removeEmailVerified, writePendingEmail, removeEmailConfirmedAck, readDisclaimerSeen, readPendingEmail } from './utils/sessionState.js'
import { needsOnboardingTour } from './utils/onboardingTour.js'
import BrandLogo from './BrandLogo'
import PasswordInput from './components/PasswordInput.jsx'
import Icon from './Icon'

const PK = import.meta.env.VITE_STRIPE_PK
// AUDIT FLOW REVISION: GMAPS_KEY removed — the address-autocomplete lived on
// the deleted BusinessScreen. VITE_GMAPS_KEY can be dropped from Amplify env
// vars once no other consumer exists.

const N='#0D1B3E',B='#2563EB',SL='#475569'

const LOGO = () => <div style={{ marginBottom: 20 }}><BrandLogo size={28} /></div>
const Page=({children})=>(<div style={{minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'32px 16px',fontFamily:'Inter,sans-serif'}}><div style={{background:'#fff',borderRadius:14,padding:'28px 32px',maxWidth:480,width:'100%',boxShadow:'0 4px 20px rgba(37,99,235,0.10)',border:'1px solid #E2E8F0'}}>{children}</div></div>)
const Field=({label,val,set,type='text',ph,mb=12,autoComplete,onBlur,onFocus})=>{const _id='fld-'+String(label).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');return (<div style={{marginBottom:mb}}><label htmlFor={_id} style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>{label}</label><input id={_id} type={type} value={val} onChange={e=>set(e.target.value)} onBlur={onBlur} onFocus={onFocus} placeholder={ph} autoComplete={autoComplete} style={{width:'100%',padding:'9px 12px',border:'1px solid #E2E8F0',borderRadius:7,fontSize:14,color:N,boxSizing:'border-box',outline:'none',fontFamily:'Inter,sans-serif'}}/></div>)}

// FIX (PW-STRENGTH): Password strength scoring and visual indicator.
function pwStrength(pass) {
const checks = {
length: pass.length >= 12,
upper: /[A-Z]/.test(pass),
number: /[0-9]/.test(pass),
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
{ key: 'length', text: '12+ chars' },
{ key: 'upper', text: 'A–Z' },
{ key: 'number', text: '0–9' },
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
const billingRaw=(new URLSearchParams(loc.search).get('billing')||'monthly').toLowerCase()
const [plan, setPlan] = useState(['starter','professional','enterprise'].includes(planRaw)?planRaw:'starter')
const [billing, setBilling] = useState(billingRaw==='annual'?'annual':'monthly')
const [name,setName]=useState('')
const [email,setEmail]=useState('')
const [pass,setPass]=useState('')
const [conf,setConf]=useState('')
// O5 FIX: dedicated confirm-field error state — shown inline below the confirm
// field on blur, before the user ever reaches the card section.
const [confErr,setConfErr]=useState('')
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

// O5 FIX: validate password match on blur of the confirm field — before the
// user scrolls to the card section. Error is shown inline, not just on submit.
function handleConfBlur() {
  if (conf && pass && conf !== pass) {
    setConfErr('Passwords do not match.')
  } else {
    setConfErr('')
  }
}

async function submit(e){
e.preventDefault()
// O5 FIX: final guard still present — catches the case where user submits
// without blurring the confirm field.
if(pass!==conf){setErr('Passwords do not match.');return}
if(pass.length<12){setErr('Password must be at least 12 characters.');return}
if(!stripeReady){setErr('Card input still loading, please wait...');return}
setLoading(true);setErr('')
try{
const si=await apiFetch('/stripe/setup-intent',{method:'POST',body:{},raw:true}).then(r=>r.json())
if(!si.client_secret)throw new Error('Payment init failed')
const card=elemRef.current.getElement('card')
const {setupIntent,error}=await stripeRef.current.confirmCardSetup(si.client_secret,{payment_method:{card,billing_details:{name,email}}})
if(error)throw new Error(error.message)
const reg=await apiFetch('/auth/register',{method:'POST',credentials:'include',body:{name,email,password:pass,plan,payment_method_id:setupIntent.payment_method},raw:true})
const data=await reg.json()
if(!reg.ok)throw new Error(data.detail||'Registration failed')
if(data.access_token)writeToken(data.access_token)
writeEmail(email)
removeEmailVerified()
writeLoggedIn('1')
writeSessionStart(String(Date.now()))
writeBilling(billing)
// Entitlement comes from the server (Stripe → DynamoDB → /auth/me), not ?plan= URL.
await refreshPlanFromServer()
if(!readPlan() && data.plan) writePlan(normalizePlanId(data.plan))
try{
const subRes=await apiFetch('/stripe/subscribe',{method:'POST',credentials:'include',body:{email,plan,billing,payment_method_id:setupIntent.payment_method},raw:true})
if(!subRes||!subRes.ok){
const subData=subRes?await subRes.json().catch(()=>({})):{}
console.error('Subscribe setup failed at signup:',subRes&&subRes.status,subData)
writeSubscriptionIncomplete('1')
try{await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_key:'0dfbc9fa-5311-4762-bdee-99e4221561ed',subject:'TaxStat360 ALERT: subscription setup failed at signup',email,plan,billing,status:String(subRes&&subRes.status),detail:JSON.stringify(subData)})})}catch(_){}
}else{ removeSubscriptionIncomplete() }
}catch(e){ console.error('Subscribe call failed at signup:',e); writeSubscriptionIncomplete('1'); try{await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_key:'0dfbc9fa-5311-4762-bdee-99e4221561ed',subject:'TaxStat360 ALERT: subscription setup failed at signup (network)',email,plan,billing,detail:String((e&&e.message)||e)})})}catch(_){} }
writeUserName(name)
writePendingEmail(email)
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
sessionStorage.setItem('ts360_new_registration','1')
nav('/verify-email')
}catch(e){setErr(e.message)}
finally{setLoading(false)}
}

return(<Page>
<LOGO/>
{/* Planning-tool disclaimer */}
<div style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'flex-start',gap:8}}>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{flexShrink:0,marginTop:1}}><rect x="5" y="5" width="14" height="16" rx="2" stroke="#92400e" strokeWidth="1.6"/><rect x="9" y="3" width="6" height="4" rx="1" fill="#92400e"/><path d="M8.5 11h7M8.5 14h7M8.5 17h4" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round"/></svg>
<span style={{fontSize:12,color:'#92400e',lineHeight:1.5}}>
<strong>TaxStat360 is a tax planning tool — not a tax preparation or filing service.</strong>{' '}Estimates are projections for planning purposes only. Consult a licensed tax professional before making any filing or financial decisions.
</span>
</div>
<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
<div><h2 style={{color:N,fontSize:20,fontWeight:800,margin:0}}>Start your free trial</h2><p style={{color:SL,fontSize:12,margin:'2px 0 0'}}>7 days free — no charge until trial ends</p></div>
<span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:20,whiteSpace:'nowrap'}}>{planLabel}</span>
</div>

{/* O6 FIX: Plan selector now shows a one-line feature summary under each plan
    name. Summaries come from PLAN_FEATURES in constants.js. The 'Professional'
    plan shows a 'Most popular' badge. Users can now choose their plan without
    leaving the page to consult the pricing table. */}
<div style={{marginBottom:16}}>
<label style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px'}}>Your Plan</label>
<div style={{display:'flex',flexDirection:'column',gap:8}}>
{[
{id:'starter',      name:'Starter',      price:'$79/mo',  annual:'$66/mo'},
{id:'professional', name:'Professional', price:'$149/mo', annual:'$124/mo'},
{id:'enterprise',   name:'Enterprise',   price:'$299/mo', annual:'$249/mo'},
].map(p => {
const selected = plan === p.id
const features = PLAN_FEATURES?.[p.id] || ''
return (
<button
  key={p.id}
  type="button"
  onClick={() => { setPlan(p.id); window.history.replaceState({}, '', `?plan=${p.id}&billing=${billing}`) }}
  style={{
    padding:'10px 12px', border: `2px solid ${selected ? B : '#E2E8F0'}`,
    borderRadius:9, cursor:'pointer', textAlign:'left',
    background: selected ? '#EFF6FF' : '#fff', transition:'all 0.15s',
    display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
  }}
>
  <div>
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{fontSize:13,fontWeight:700,color:selected?B:N}}>{p.name}</span>
      {/* O6 FIX: 'Most popular' badge on Professional */}
      {p.id==='professional' && (
        <span style={{fontSize:10,fontWeight:700,background:B,color:'#fff',padding:'2px 7px',borderRadius:20}}>Most popular</span>
      )}
    </div>
    {/* O6 FIX: feature summary line */}
    {features && (
      <div style={{fontSize:11,color:SL,marginTop:3,lineHeight:1.4}}>{features}</div>
    )}
  </div>
  <div style={{fontSize:12,color:SL,flexShrink:0,textAlign:'right'}}>
    {billing==='annual'?p.annual:p.price}
  </div>
</button>
)
})}
</div>
<div style={{textAlign:'center',marginTop:6}}>
<button
type="button"
onClick={() => { const nb = billing==='annual'?'monthly':'annual'; setBilling(nb); window.history.replaceState({}, '', `?plan=${plan}&billing=${nb}`) }}
style={{background:'none',border:'none',fontSize:11,color:B,cursor:'pointer',textDecoration:'underline'}}
>
{billing==='annual' ? 'Switch to monthly billing' : `Switch to annual billing — ${ANNUAL_DISCOUNT_LABEL}`}
</button>
</div>
</div>

{/* UX-02: Two-step progress indicator */}
<div style={{display:'flex',alignItems:'center',marginBottom:20,padding:'12px 16px',background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
<div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
<div style={{width:26,height:26,borderRadius:'50%',background:B,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,flexShrink:0}}>1</div>
<div>
<div style={{fontSize:12,fontWeight:700,color:B,lineHeight:1.2}}>Account Info</div>
<div style={{fontSize:10,color:'#94A3B8',lineHeight:1.2}}>Name, email, password</div>
</div>
</div>
<div style={{flex:'0 0 28px',height:2,background:'#E2E8F0',margin:'0 6px'}}/>
<div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
<div style={{width:26,height:26,borderRadius:'50%',background:'#E2E8F0',color:'#94A3B8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,flexShrink:0}}>2</div>
<div>
<div style={{fontSize:12,fontWeight:700,color:'#94A3B8',lineHeight:1.2}}>Trial Setup</div>
<div style={{fontSize:10,color:'#CBD5E1',lineHeight:1.2}}>Card required · no charge until trial ends</div>
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
<label htmlFor="signup-password" style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Password</label>
<PasswordInput
id="signup-password"
value={pass}
onChange={e=>setPass(e.target.value)}
placeholder="Min. 12 chars"
autoComplete="new-password"
/>
</div>
{/* O5 FIX: onBlur handler validates match immediately when the user leaves the
    confirm field — before they scroll to the card section. confErr renders
    inline below the field. The Field component now accepts an onBlur prop. */}
<div>
<label htmlFor="signup-confirm-password" style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Confirm Password</label>
<PasswordInput
  id="signup-confirm-password"
  value={conf}
  onChange={e=>{setConf(e.target.value);if(confErr)setConfErr('')}}
  onBlur={handleConfBlur}
  placeholder="Repeat password"
  autoComplete="new-password"
  hasError={!!confErr}
/>
{/* O5 FIX: inline error shown immediately on blur — no scrolling required */}
{confErr && (
  <p style={{fontSize:11,color:'#DC2626',margin:'4px 0 0',fontWeight:600}}>{confErr}</p>
)}
</div>
</div>
<div style={{marginBottom:12}}>
<PasswordStrength pass={pass} />
</div>

<div style={{
display:'flex',alignItems:'flex-start',gap:10,
background:'#F0FDF4',border:'1px solid #86EFAC',borderRadius:8,
padding:'10px 14px',marginBottom:12,
}}>
<Icon name="lock" size={18} color="#166534" style={{marginTop:1}} />
<p style={{fontSize:12,color:'#166534',margin:0,lineHeight:1.5}}>
<strong>No charge for 7 days.</strong> You will <strong>not be charged</strong> until after your free trial ends. Cancel in one click anytime.
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
<p style={{textAlign:'center',fontSize:12,color:SL,margin:0}}>Have an account? <span onClick={()=>nav('/login')} style={{color:B,cursor:'pointer',fontWeight:600}}>Sign in</span> · <a href="/" style={{color:SL,textDecoration:'none'}}>← Back to home</a></p>

<div style={{display:'flex',justifyContent:'center',gap:20,marginTop:20,paddingTop:16,borderTop:'1px solid #E2E8F0',flexWrap:'wrap'}}>
<div style={{display:'flex',alignItems:'center',gap:6}}>
<Icon name="institution" size={15} color={SL} />
<span style={{fontSize:11,color:SL,fontWeight:600}}>Built by a Former IRS Revenue Agent</span>
</div>
<div style={{display:'flex',alignItems:'center',gap:6}}>
<Icon name="lock" size={15} color={SL} />
<span style={{fontSize:11,color:SL,fontWeight:600}}>256-bit Encryption</span>
</div>
<div style={{display:'flex',alignItems:'center',gap:6}}>
<Icon name="check" size={15} color={SL} />
<span style={{fontSize:11,color:SL,fontWeight:600}}>CPA-Compatible Export</span>
</div>
</div>
</form>
</Page>)
}

function VerifyEmailScreen(){
  const nav=useNavigate()
  const [searchParams]=useSearchParams()
  const token=searchParams.get('token')||''
  const emailParam=searchParams.get('email')||''
  const [status,setStatus]=useState(token&&emailParam?'loading':'ready')
  const [err,setErr]=useState('')

  useEffect(()=>{
    if(!token||!emailParam)return
    window.history.replaceState(null,'','/verify-email')
    let cancelled=false
    ;(async()=>{
      try{
        const res=await apiFetch(`/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(emailParam)}`,{raw:true})
        const data=await res.json().catch(()=>({}))
        if(!res.ok)throw new Error(data.detail||'Verification failed')
        if(!cancelled){
          writeEmail(emailParam)
          writeEmailVerified('1')
          removeEmailConfirmedAck()
          setStatus('verified')
        }
      }catch(e){
        if(!cancelled){setStatus('error');setErr(e.message||'Invalid or expired link')}
      }
    })()
    return()=>{cancelled=true}
  },[token,emailParam])

  if(status==='loading')return(<Page><LOGO/><p style={{color:SL,textAlign:'center'}}>Confirming your email…</p></Page>)
  if(status==='verified')return(<Page><LOGO/><div style={{textAlign:'center',padding:'20px 0'}}>
    <div style={{marginBottom:16}}><Icon name="checkCircle" size={48} color="#059669" /></div>
    <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>Email confirmed</h2>
    <p style={{color:SL,fontSize:14,margin:'0 0 24px',lineHeight:1.6}}>Thanks — your email is verified. You can continue using TaxStat360.</p>
    <button onClick={() => continueAfterVerifyEmail(nav)} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer'}}>Continue →</button>
  </div></Page>)
  if(status==='error')return(<Page><LOGO/><div style={{textAlign:'center',padding:'20px 0'}}>
    <p style={{color:'#DC2626',marginBottom:16}}>{err}</p>
    <button onClick={()=>nav('/dashboard')} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer'}}>Go to app →</button>
  </div></Page>)

  const displayEmail=readEmail()||readPendingEmail()||''
  return(<Page>
    <LOGO/>
    <div style={{textAlign:'center',padding:'20px 0'}}>
      <div style={{marginBottom:16}}><Icon name="checkCircle" size={48} color="#059669" /></div>
      <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>You're all set!</h2>
      <p style={{color:SL,fontSize:14,margin:'0 0 12px',lineHeight:1.6}}>Your TaxStat360 account is ready. Let's finish setting up your profile.</p>
      {displayEmail?(
        <p style={{color:SL,fontSize:13,margin:'0 0 20px',lineHeight:1.6,background:'#F8FAFC',padding:'10px 12px',borderRadius:8}}>
          <Icon name="mail" size={14} color={SL} /> Please confirm your email. We sent a verification link to <strong>{displayEmail}</strong>. Check your inbox (and junk/spam). You can still continue into the app without verifying.
        </p>
      ):null}
      <button onClick={() => nav('/onboarding/welcome')} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:12}}>Continue →</button>
    </div>
  </Page>)
}

function isValidSession(){
  return readLoggedIn()==='1' && !!readBusinessInfo()
}

function continueAfterVerifyEmail(nav) {
  const isNew = sessionStorage.getItem('ts360_new_registration') === '1'
  const email = readEmail()
  if (isNew || needsOnboardingTour(email)) {
    nav('/onboarding/welcome')
    return
  }
  sessionStorage.removeItem('ts360_new_registration')
  // AUDIT FLOW REVISION: '/onboarding/entity' no longer exists — a valid session
  // lands on the Dashboard (pick a saved card or start a new calculation); an
  // invalid one re-authenticates.
  nav(isValidSession() ? '/dashboard' : '/login')
}

function LoginScreen(){
const nav=useNavigate()
const location=useLocation()
const from=location.state?.from
// F-FUNC-03: surface a clear "session expired" notice instead of a silent bounce.
// Set either by RequireAuth's redirect (router state) or the idle-timeout reload (?expired=1).
const sessionExpired=location.state?.sessionExpired===true||new URLSearchParams(location.search).get('expired')==='1'
const [accountDeleted]=useState(()=>new URLSearchParams(window.location.search).get('deleted')==='1')
const loginAttemptAllowed=useRef(!accountDeleted)
const redirectTo=from?(from.pathname+(from.search||'')):"/dashboard"
const [email,setEmail]=useState('')
const [pass,setPass]=useState('')
const [loading,setLoading]=useState(false)
const [err,setErr]=useState('')
const [mfaStep,setMfaStep]=useState(false)
const [mfaCode,setMfaCode]=useState('')
const [loginToken,setLoginToken]=useState('')
const [pendingEmail,setPendingEmail]=useState('')

useEffect(()=>{
if(!accountDeleted)return
const params=new URLSearchParams(location.search)
if(params.get('deleted')!=='1')return
params.delete('deleted')
const next=params.toString()
nav({pathname:location.pathname,search:next?`?${next}`:''},{replace:true,state:location.state})
},[accountDeleted,location.pathname,location.search,location.state,nav])

function markLoginAttemptAllowed(){
loginAttemptAllowed.current=true
}

// UX F-01: Only show the planning-tool disclaimer to first-time visitors.
// Returning users have already seen it — showing it on every login trains
// dismissal and delays the path to their tax position.
const isReturningUser = !!(readDisclaimerSeen() || readSessionStart())

// UX F-02: "Remember this device for 30 days" — bypass 2FA challenge on trusted devices.
const TRUST_DAYS = 30
const DEVICE_KEY = 'ts360_trusted_device'
const [rememberDevice, setRememberDevice] = useState(false)

function getDeviceFingerprint() {
  try { return btoa([navigator.userAgent, screen.width, screen.height].join('|')).slice(0, 40) } catch { return 'unknown' }
}

function isTrustedDevice(emailAddr) {
  try {
    const stored = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null')
    if (!stored || stored.email !== emailAddr) return false
    if (stored.fingerprint !== getDeviceFingerprint()) return false
    if (Date.now() > stored.expires) { localStorage.removeItem(DEVICE_KEY); return false }
    return true
  } catch { return false }
}

function trustThisDevice(emailAddr) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({
      email: emailAddr,
      fingerprint: getDeviceFingerprint(),
      expires: Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000,
    }))
  } catch {}
}

async function finishLogin(data,actualEmail){
if(data.access_token) writeToken(data.access_token)
writeEmail(actualEmail)
writeLoggedIn('1')
writeSessionStart(String(Date.now()))
await refreshPlanFromServer()
if(!readPlan() && data.plan) writePlan(normalizePlanId(data.plan))
nav(redirectTo,{replace:true})
}

async function submit(e){
e.preventDefault()
if(accountDeleted&&!loginAttemptAllowed.current)return
markLoginAttemptAllowed()
setLoading(true);setErr('')
try{
const domEmail = document.querySelector('input[type="email"]')?.value || ''
const actualEmail = (email || domEmail).toLowerCase().trim()
const actualPass  = pass
if (!actualEmail || !actualPass) { setErr('Please enter your email and password.'); setLoading(false); return }
const res=await apiFetch('/auth/login',{method:'POST',credentials:'include',body:{email:actualEmail,password:actualPass},raw:true})
const data=await res.json()
if(!res.ok)throw new Error(data.detail||'Login failed')
if(data.mfa_required){
// UX F-02: skip MFA challenge if this device is trusted and not expired
if(isTrustedDevice(actualEmail)){
await finishLogin(data,actualEmail)
return
}
setMfaStep(true)
setLoginToken(data.login_token||'')
setPendingEmail(data.email||actualEmail)
setMfaCode('')
setLoading(false)
return
}
await finishLogin(data,actualEmail)
}catch(e){setErr(e.message)}
finally{setLoading(false)}
}

async function submitMfa(e){
e.preventDefault();setLoading(true);setErr('')
try{
const code=mfaCode.trim()
if(!code){setErr('Enter your 6-digit code or a backup code.');setLoading(false);return}
const res=await apiFetch('/auth/mfa/challenge',{method:'POST',credentials:'include',body:{email:pendingEmail,login_token:loginToken,code},raw:true})
const data=await res.json()
if(!res.ok)throw new Error(data.detail||'Invalid authentication code')
if(rememberDevice) trustThisDevice(pendingEmail)
await finishLogin(data,pendingEmail)
}catch(e){setErr(e.message)}
finally{setLoading(false)}
}

return(<Page>
<LOGO/>
{!isReturningUser && (
<div style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px',marginBottom:16,display:'flex',alignItems:'flex-start',gap:8}}>
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{flexShrink:0,marginTop:1}}><rect x="5" y="5" width="14" height="16" rx="2" stroke="#92400e" strokeWidth="1.6"/><rect x="9" y="3" width="6" height="4" rx="1" fill="#92400e"/><path d="M8.5 11h7M8.5 14h7M8.5 17h4" stroke="#92400e" strokeWidth="1.5" strokeLinecap="round"/></svg>
<span style={{fontSize:12,color:'#92400e',lineHeight:1.5}}>
<strong>TaxStat360 is a tax planning tool — not a tax preparation or filing service.</strong>{' '}Estimates are projections for planning purposes only. Consult a licensed tax professional before making any filing or financial decisions.
</span>
</div>
)}
<h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 4px'}}>{mfaStep?'Two-factor authentication':'Welcome back'}</h2>
<p style={{color:SL,fontSize:12,margin:'0 0 20px'}}>{mfaStep?'Enter the 6-digit code from your authenticator app, or a backup code.':'Sign in to your TaxStat360 account'}</p>
{accountDeleted&&!mfaStep&&<div role="status" style={{background:'#F0FDF4',border:'1px solid #BBF7D0',color:'#166534',padding:'10px 12px',borderRadius:8,fontSize:12,marginBottom:16,lineHeight:1.5}}>Your account has been deleted. We&apos;re sorry to see you go.</div>}
{sessionExpired&&!accountDeleted&&!mfaStep&&<div role="status" style={{background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#1E40AF',padding:'10px 12px',borderRadius:8,fontSize:12,marginBottom:16,lineHeight:1.5}}>Your session expired and you were signed out. Sign back in to pick up where you left off — your saved records and in-progress entries are still here.</div>}
{mfaStep?(
<form onSubmit={submitMfa}>
<label style={{display:'block',fontSize:12,fontWeight:600,color:N,marginBottom:6}}>Authentication code</label>
<input
type="text"
inputMode="text"
autoComplete="one-time-code"
value={mfaCode}
onChange={e=>setMfaCode(e.target.value.replace(/[^0-9A-Za-z-]/g,'').slice(0,9))}
placeholder="6-digit code or backup code"
style={{width:'100%',padding:'10px 12px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:15,marginBottom:12,boxSizing:'border-box',letterSpacing:'0.08em'}}
/>
{err&&<div style={{background:'#FEF2F2',color:'#DC2626',padding:'8px 12px',borderRadius:7,fontSize:12,marginBottom:10}}>{err}</div>}
<label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:SL,marginBottom:12,cursor:'pointer'}}>
<input type="checkbox" checked={rememberDevice} onChange={e=>setRememberDevice(e.target.checked)} style={{width:15,height:15,cursor:'pointer'}} />
Trust this device for {TRUST_DAYS} days — skip 2FA on this browser
</label>
<button type="submit" disabled={loading||mfaCode.length<6} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:loading||mfaCode.length<6?'not-allowed':'pointer',opacity:loading||mfaCode.length<6?0.5:1,transition:'opacity 0.15s',marginBottom:10}}>{loading?'Verifying...':'Verify →'}</button>
<button type="button" onClick={()=>{setMfaStep(false);setMfaCode('');setLoginToken('');setErr('')}} style={{width:'100%',padding:'10px',background:'#fff',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>← Back to sign in</button>
</form>
):(
<form onSubmit={submit} autoComplete={accountDeleted?'off':'on'}>
<Field label="Email" val={email} set={setEmail} type="email" ph="you@company.com" autoComplete={accountDeleted?'off':'email'} onFocus={markLoginAttemptAllowed}/>
<div style={{marginBottom:12}}>
<label htmlFor="login-password" style={{display:'block',fontSize:12,fontWeight:600,color:SL,marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Password</label>
<PasswordInput id="login-password" value={pass} onChange={e=>setPass(e.target.value)} onFocus={markLoginAttemptAllowed} placeholder="Your password" autoComplete={accountDeleted?'off':'current-password'} />
</div>
{err && (!accountDeleted || loginAttemptAllowed.current) ? <div style={{background:'#FEF2F2',color:'#DC2626',padding:'8px 12px',borderRadius:7,fontSize:12,marginBottom:10}}>{err}</div> : null}
<button type="submit" disabled={loading} onClick={markLoginAttemptAllowed} style={{width:'100%',padding:'11px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10}}>{loading?'Signing in...':'Sign In →'}</button>
<button type="button" onClick={()=>nav('/signup')} style={{width:'100%',padding:'10px',background:'#fff',color:B,border:`1.5px solid ${B}`,borderRadius:8,fontWeight:700,fontSize:14,cursor:'pointer',marginBottom:12}}>New here? Start your free 7-day trial →</button>
<p style={{textAlign:'center',fontSize:12,margin:0}}><span onClick={()=>nav('/forgot-password')} style={{color:SL,cursor:'pointer',textDecoration:'underline'}}>Forgot your password?</span></p>
</form>
)}
<div style={{borderTop:'1px solid #E2E8F0',marginTop:24,paddingTop:16,textAlign:'center'}}>
<p style={{fontSize:11,color:'#94a3b8',margin:'0 0 6px'}}>
<a href="/terms" style={{color:'#94a3b8',marginRight:12,textDecoration:'none'}}>Terms of Service</a>
<a href="/privacy" style={{color:'#94a3b8',textDecoration:'none'}}>Privacy Policy</a>
</p>
<p style={{fontSize:10,color:'#CBD5E1',margin:0,lineHeight:1.5}}>
For planning purposes only — not professional tax, legal, or financial advice. Consult a licensed tax professional before filing.
</p>
</div>
</Page>)
}

// EntityScreen entity list matches the Tax Tracker's ENTITY_TYPES exactly:
//   S Corporation, C Corporation, Partnership / LLC, Sole Proprietor / SMLLC,
//   Real Estate (Schedule E).
// C Corporation: now a fully selectable option (audit F6 / Module 4 — C-Corp
//   support built out across the engine, Tax Tracker, and Dashboard). The prior
//   "not supported" notice has been removed.
// "Other": not offered — it had no corresponding Tax Tracker entity type.
// Entity type strings match the canonical Tax Tracker values exactly so
//   readOnboardingEntityType() hydrates the entity card dropdown
//   correctly on the first Tax Tracker session.
// AUDIT FLOW REVISION (owner decision, July 2026): the post-signup setup funnel
// (EntityScreen → BusinessScreen → ImportScreen) has been removed. Users go
// straight to the Dashboard after the welcome tour, where they load a previously
// saved record card or start a new calculation. Entity-type selection (all five
// types, including C Corporation) and the accounting-software connectors both
// live in the Tax Tracker, so no capability was lost. The report-cover business
// profile (name/EIN/address) is no longer collected; AIAnalysis.getOnboardingBizInfo()
// already falls back gracefully when it is absent, and its EIN sanitization keeps
// legacy stored values off the CPA Briefing cover.

export default function Onboarding({screen}){
if(screen==='login') return <LoginScreen/>
if(screen==='verify') return <VerifyEmailScreen/>
// AUDIT FLOW REVISION: 'entity' / 'business' / 'import' screens removed —
// their routes redirect to /dashboard in App.jsx.
return <SignupScreen/>
}
