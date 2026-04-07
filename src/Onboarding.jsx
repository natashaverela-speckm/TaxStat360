import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://app.taxstat360.com'
const STRIPE_PK='pk_test_51TJPXq5MkNEttBVv7cYT6PpzXUhFaTS8iqFXfGqscrRXDsACVAZbZ2SVNQ0Gr8pQ9I0Dbo6OCpsaIKMLc9O8PCHr00TtaIAHB8'
const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)

export default function Onboarding(){
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

  const PLAN_LABELS={basic:'Basic — $49/mo',professional:'Professional — $99/mo',advanced:'Advanced — $199/mo'}

  useEffect(()=>{
    const s=document.createElement('script')
    s.src='https://js.stripe.com/v3/'
    s.onload=()=>{
      const sk=window.Stripe(STRIPE_PK)
      setStripe(sk)
      const els=sk.elements()
      const card=els.create('card',{style:{base:{fontSize:'15px',color:'#0D1B3E','::placeholder':{color:'#94a3b8'}}}})
      setTimeout(()=>{ if(cardRef.current){ card.mount(cardRef.current); setElements(els) } },100)
    }
    document.head.appendChild(s)
    return ()=>{ try{ document.head.removeChild(s) }catch(e){} }
  },[])

  async function mcSubscribe(em){
    try{
      const fd=new FormData()
      fd.append('EMAIL',em)
      fd.append('u','f8bbe8c960a3c7bae19433b3e')
      fd.append('id','f546bd92ac')
      fd.append('f_id','00cc07e9f0')
      fd.append('b_f8bbe8c960a3c7bae19433b3e_f546bd92ac','')
      await fetch('https://themoneynista.us4.list-manage.com/subscribe/post?u=f8bbe8c960a3c7bae19433b3e&id=f546bd92ac&f_id=00cc07e9f0',{method:'POST',mode:'no-cors',body:fd})
    }catch(e){}
  }

  async function handleSubmit(e){
    e.preventDefault()
    if(!stripe||!elements){setErr('Payment system loading, please wait...');return}
    setLoading(true);setErr('')
    try{
      // 1. Get setup intent from backend
      const siRes=await fetch(API+'/stripe/setup-intent',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
      const siData=await siRes.json()
      if(!siData.client_secret) throw new Error('Could not initialize payment')
      // 2. Confirm card setup with Stripe
      const card=elements.getElement('card')
      const {setupIntent,error}=await stripe.confirmCardSetup(siData.client_secret,{payment_method:{card,billing_details:{name,email}}})
      if(error) throw new Error(error.message)
      // 3. Register user + attach payment method
      const regRes=await fetch(API+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pass,plan,payment_method_id:setupIntent.payment_method})})
      const regData=await regRes.json()
      if(!regRes.ok) throw new Error(regData.detail||'Registration failed')
      // 4. Subscribe to Mailchimp silently
      mcSubscribe(email)
      // 5. Save token and redirect
      localStorage.setItem('token',regData.access_token)
      localStorage.setItem('plan',plan)
      nav('/onboarding/entity')
    }catch(e){setErr(e.message)}
    finally{setLoading(false)}
  }

  return(
    <div style={{minHeight:'100vh',background:'#F0F4FF',display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:'Inter,sans-serif'}}>
      <div style={{background:'#fff',borderRadius:16,padding:'40px 36px',maxWidth:460,width:'100%',boxShadow:'0 4px 24px rgba(37,99,235,0.10)',border:'1px solid #E2E8F0'}}>
        <LOGO/>
        <div style={{display:'inline-block',background:'#EFF6FF',color:B,fontSize:12,fontWeight:700,padding:'4px 12px',borderRadius:20,marginBottom:12}}>{PLAN_LABELS[plan]||'Basic — $49/mo'}</div>
        <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 4px'}}>Start your free trial</h2>
        <p style={{color:SL,fontSize:13,margin:'0 0 24px'}}>7-day free trial — no charge until it ends</p>
        <form onSubmit={handleSubmit}>
          {[{label:'Full Name',val:name,set:setName,type:'text',ph:'Jane Smith'},{label:'Email Address',val:email,set:setEmail,type:'email',ph:'jane@company.com'},{label:'Password',val:pass,set:setPass,type:'password',ph:'Min. 8 characters'}].map(f=>(
            <div key={f.label} style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,color:N,marginBottom:6}}>{f.label}</label>
              <input type={f.type} value={f.val} onChange={ev=>f.set(ev.target.value)} placeholder={f.ph} required style={{width:'100%',padding:'11px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:14,color:N,boxSizing:'border-box',outline:'none'}}/>
            </div>
          ))}
          <div style={{marginBottom:20}}>
            <label style={{display:'block',fontSize:13,fontWeight:600,color:N,marginBottom:6}}>Card Details</label>
            <div ref={cardRef} style={{padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',minHeight:42}}/>
          </div>
          {err&&<div style={{background:'#FEF2F2',color:'#DC2626',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:16}}>{err}</div>}
          <button type="submit" disabled={loading} style={{width:'100%',padding:14,background:loading?'#93c5fd':B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',marginBottom:16}}>
            {loading?'Processing...':'Start Free Trial →'}
          </button>
          <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
            <p style={{color:'#166534',fontSize:11,margin:0,lineHeight:1.5}}>🔒 Your card is required for security only — to prevent fraud and verify your identity. You will <b>not</b> be billed until your 7-day free trial ends. Cancel anytime before then at no cost.</p>
          </div>
          <p style={{textAlign:'center',fontSize:13,color:SL,margin:0}}>Already have an account? <span onClick={()=>nav('/login')} style={{color:B,cursor:'pointer',fontWeight:600}}>Sign in</span></p>
        </form>
        <p style={{textAlign:'center',fontSize:12,color:'#94a3b8',marginTop:16}}>← <span onClick={()=>nav('/')} style={{cursor:'pointer',color:B}}>Back to home</span></p>
      </div>
    </div>
  )
}
