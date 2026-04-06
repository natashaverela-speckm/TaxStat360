import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://app.taxstat360.com'

export default function Onboarding({screen}){
  const nav=useNavigate()
  const [form,setForm]=useState({name:'',email:'',password:'',entityType:'',businessName:'',ein:'',address:'',selected:'',cardNumber:'',cardExpiry:'',cvv:''})
  const [err,setErr]=useState('')
  const addressRef=useRef(null)
  const up=v=>setForm(f=>({...f,...v}))

  // Google Places address autocomplete
  useEffect(()=>{
    if(screen!=='business') return
    const loadPlaces=()=>{
      if(!window.google||!addressRef.current) return
      const ac=new window.google.maps.places.Autocomplete(addressRef.current,{types:['address'],componentRestrictions:{country:'us'}})
      ac.addListener('place_changed',()=>{
        const place=ac.getPlace()
        if(place.formatted_address) up({address:place.formatted_address})
      })
    }
    if(window.google){ loadPlaces(); return }
    const script=document.createElement('script')
    script.src='https://maps.googleapis.com/maps/api/js?key=AIzaSyC3KvKYOYULvNMQ7L_PLACEHOLDER&libraries=places&callback=__gplacesLoaded'
    window.__gplacesLoaded=loadPlaces
    document.head.appendChild(script)
  },[screen])

  const handleSignup=async()=>{
    try{
      const r=await fetch(API+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.name,email:form.email,password:form.password})})
      const d=await r.json()
      if(d.access_token){localStorage.setItem('access_token',d.access_token);
      // Auto-subscribe to Mailchimp on successful signup
      const mcCallback = 'mc_signup_' + Date.now()
      const mcScript = document.createElement('script')
      window[mcCallback] = () => { delete window[mcCallback]; document.body.contains(mcScript) && document.body.removeChild(mcScript) }
      const mcParams = new URLSearchParams({
        u: 'f8bbe8c960a3c7bae19433b3e',
        id: '244ef2b8b6',
        f_id: '00cd07e9f0',
        EMAIL: form.email,
        FNAME: form.name,
        'b_f8bbe8c960a3c7bae19433b3e_244ef2b8b6': '',
        c: mcCallback,
      })
      mcScript.src = 'https://themoneynista.us4.list-manage.com/subscribe/post?' + mcParams.toString()
      document.body.appendChild(mcScript)
      nav('/onboarding/entity')}
      else setErr(d.detail||'Registration failed')
    }catch(e){setErr('Unable to connect. Please try again.')}
  }
  const handleLogin=async()=>{
    try{
      const r=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.email,password:form.password})})
      const d=await r.json()
      if(d.access_token){localStorage.setItem('access_token',d.access_token);nav('/dashboard')}
      else setErr(d.detail||'Login failed')
    }catch(e){setErr('Unable to connect. Please try again.')}
  }

  const platforms=[
    {id:'quickbooks',name:'QuickBooks Online',icon:'QB',color:'#2CA01C',desc:'Auto-imports P&L, balance sheet, transactions.',connectUrl:'https://app.taxstat360.com/integrations/quickbooks/connect'},
    {id:'xero',name:'Xero',icon:'X',color:'#13B5EA',desc:'Bank-grade sync. Multi-currency support.',connectUrl:'https://app.taxstat360.com/integrations/xero/connect'},
    {id:'wave',name:'Wave (Free)',icon:'W',color:'#2D9CDB',desc:'Great for startups. Free forever.',connectUrl:'https://app.taxstat360.com/integrations/wave/connect'},
    {id:'freshbooks',name:'FreshBooks',icon:'FB',color:'#1E90FF',desc:'Service businesses & project revenue.',connectUrl:'https://app.taxstat360.com/integrations/freshbooks/connect'},
  ]

  const S={background:'#fff',borderRadius:16,padding:'40px 36px',maxWidth:480,margin:'48px auto',boxShadow:'0 4px 24px rgba(0,0,0,0.08)',fontFamily:'Inter,sans-serif'}
  const I={width:'100%',padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:15,marginBottom:12,boxSizing:'border-box',outline:'none',transition:'border 0.15s'}
  const Btn=({children,...p})=><button {...p} style={{width:'100%',padding:'13px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:15,cursor:'pointer',transition:'opacity 0.15s',...p.style}}>{children}</button>

  const ProgressBar=({pct})=>(
    <div style={{marginBottom:28}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:SL,marginBottom:6}}>
        <span style={{fontWeight:600,color:B}}>Step {pct===33?1:pct===66?2:3} of 3</span>
        <span>{pct}% complete</span>
      </div>
      <div style={{height:5,background:'#E2E8F0',borderRadius:3}}><div style={{width:pct+'%',height:'100%',background:B,borderRadius:3,transition:'width 0.3s'}}/></div>
    </div>
  )

  if(screen==='signup') return(
    <div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
      <div style={{...S}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:4}}><svg width="28" height="28" viewBox="0 0 34 34" style={{flexShrink:0,marginRight:8}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:22,borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>
          <div style={{color:SL,fontSize:13,marginTop:2}}>14-day free trial — no charge until it ends</div>
          <div style={{color:B,fontSize:12,cursor:'pointer',marginTop:6}} onClick={()=>nav('/')}>&larr; Back to home</div>
        </div>
        {err&&<div style={{background:'#FEE2E2',color:'#DC2626',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>{err}</div>}
        <input style={I} placeholder="Full name" value={form.name} onChange={e=>up({name:e.target.value})}/>
        <input style={I} placeholder="Email address" type="email" value={form.email} onChange={e=>up({email:e.target.value})}/>
        <input style={I} placeholder="Password (8+ characters)" type="password" value={form.password} onChange={e=>up({password:e.target.value})}/>
        <div style={{marginBottom:4}}>
          <div style={{fontSize:12,fontWeight:600,color:SL,marginBottom:6}}>Credit Card Number</div>
          <div style={{position:'relative'}}>
            <input
              style={{...I,marginBottom:0,paddingRight:80,letterSpacing:form.cardNumber?'0.1em':'normal'}}
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              value={form.cardNumber}
              onChange={e=>{
                const v=e.target.value.replace(/\D/g,'').slice(0,16)
                const fmt=v.replace(/(\d{4})/g,'$1 ').trim()
                up({cardNumber:fmt})
              }}
            />
            <div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',display:'flex',gap:4}}>
              <span style={{fontSize:18}}>💳</span>
            </div>
          </div>
          <div style={{display:'flex',gap:12,marginTop:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:SL,marginBottom:6}}>Expiry Date</div>
              <input style={{...I,marginBottom:0}} placeholder="MM / YY" maxLength={7} value={form.cardExpiry} onChange={e=>{
                const v=e.target.value.replace(/\D/g,'')
                const fmt=v.length>2?v.slice(0,2)+' / '+v.slice(2,4):v
                up({cardExpiry:fmt})
              }}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:SL,marginBottom:6}}>CVV</div>
              <input style={{...I,marginBottom:0}} placeholder="123" maxLength={4} type="password" value={form.cvv} onChange={e=>up({cvv:e.target.value.replace(/\D/g,'').slice(0,4)})}/>
            </div>
          </div>
          <div style={{background:'#F0FDF4',border:'1px solid #BBF7D0',borderRadius:8,padding:'10px 14px',marginTop:12,display:'flex',gap:10,alignItems:'flex-start'}}>
            <span style={{fontSize:16,flexShrink:0}}>🔒</span>
            <div>
              <div style={{fontWeight:700,color:'#15803D',fontSize:12}}>No charge until your free trial ends</div>
              <div style={{color:'#166534',fontSize:11,marginTop:2,lineHeight:1.5}}>Your card is required for security purposes only — to prevent fraud and verify your identity. You will <b>not</b> be billed until your 14-day free trial ends. Cancel anytime before then at no cost.</div>
            </div>
          </div>
        </div>
        <Btn onClick={handleSignup} style={{marginTop:4}}>Start Free Trial →</Btn>
        <p style={{textAlign:'center',marginTop:16,fontSize:13,color:SL}}>Already have an account? <span onClick={()=>nav('/login')} style={{color:B,cursor:'pointer',fontWeight:700}}>Sign in</span></p>
        <p style={{textAlign:'center',marginTop:8,fontSize:11,color:'#94a3b8'}}>By creating an account you agree to our Terms of Service</p>
      </div>
    </div>
  )

  if(screen==='login') return(
    <div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
      <div style={{...S}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontWeight:800,color:N,fontSize:22}}>TaxStat<span style={{color:B}}>360</span></div>
          <div style={{color:SL,fontSize:14,marginTop:4}}>Welcome back</div>
        </div>
        {err&&<div style={{background:'#FEE2E2',color:'#DC2626',padding:'10px 14px',borderRadius:8,marginBottom:16,fontSize:13}}>{err}</div>}
        <input style={I} placeholder="Email address" type="email" value={form.email} onChange={e=>up({email:e.target.value})}/>
        <input style={I} placeholder="Password" type="password" value={form.password} onChange={e=>up({password:e.target.value})}/>
        <Btn onClick={handleLogin} style={{marginTop:4}}>Sign In →</Btn>
        <p style={{textAlign:'center',marginTop:16,fontSize:13,color:SL}}>Don't have an account? <span onClick={()=>nav('/signup')} style={{color:B,cursor:'pointer',fontWeight:700}}>Start free trial</span></p>
      </div>
    </div>
  )

  if(screen==='entity') return(
    <div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
      <div style={{...S,maxWidth:540}}>
        <ProgressBar pct={33}/>
        <h2 style={{color:N,marginBottom:6,fontSize:20}}>Select Your Entity Type</h2>
        <p style={{color:SL,fontSize:14,marginBottom:24}}>This determines how your K-1 income flows to Schedule E on Form 1040.</p>
        {[
          {type:'S-Corporation',desc:'Owners take W-2 salary + K-1 distributions. Best for reducing self-employment tax.'},
          {type:'Multi-Member LLC',desc:'K-1 income flows to each member based on ownership %. Subject to SE tax.'},
          {type:'Partnership',desc:'Similar to Multi-Member LLC. K-1 flows to Schedule E Part II.'},
        ].map(e=>(
          <div key={e.type} onClick={()=>up({entityType:e.type})} style={{padding:'16px 20px',border:'2px solid '+(form.entityType===e.type?B:'#E2E8F0'),borderRadius:12,marginBottom:12,cursor:'pointer',background:form.entityType===e.type?'#EFF6FF':'#fff',transition:'all 0.15s'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:20,height:20,borderRadius:'50%',border:'2px solid '+(form.entityType===e.type?B:'#CBD5E1'),background:form.entityType===e.type?B:'#fff',flexShrink:0}}/>
              <div>
                <div style={{fontWeight:700,color:N,fontSize:15}}>{e.type}</div>
                <div style={{fontSize:12,color:SL,marginTop:2}}>{e.desc}</div>
              </div>
            </div>
          </div>
        ))}
        <Btn onClick={()=>form.entityType&&nav('/onboarding/business')} style={{marginTop:8,opacity:form.entityType?1:0.5}}>Continue →</Btn>
      </div>
    </div>
  )

  if(screen==='business') return(
    <div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
      <div style={{...S,maxWidth:540}}>
        <ProgressBar pct={66}/>
        <h2 style={{color:N,marginBottom:6,fontSize:20}}>Business Information</h2>
        <p style={{color:SL,fontSize:14,marginBottom:24}}>Tell us about your business so we can personalize your tax strategy.</p>
        <div style={{fontSize:12,fontWeight:600,color:SL,marginBottom:6}}>Business Name *</div>
        <input style={I} placeholder="e.g. Verela Consulting LLC" value={form.businessName} onChange={e=>up({businessName:e.target.value})}/>
        <div style={{fontSize:12,fontWeight:600,color:SL,marginBottom:6}}>EIN (Employer Identification Number)</div>
        <input style={I} placeholder="XX-XXXXXXX" value={form.ein} onChange={e=>up({ein:e.target.value})}/>
        <div style={{fontSize:12,fontWeight:600,color:SL,marginBottom:6}}>Business Address</div>
        <input
          ref={addressRef}
          style={I}
          placeholder="Start typing your address..."
          value={form.address}
          onChange={e=>up({address:e.target.value})}
        />
        <div style={{fontSize:11,color:'#94a3b8',marginTop:-8,marginBottom:12}}>Address auto-populates as you type — powered by Google Maps</div>
        <Btn onClick={()=>form.businessName&&nav('/onboarding/import')} style={{marginTop:8,opacity:form.businessName?1:0.5}}>Continue →</Btn>
      </div>
    </div>
  )

  if(screen==='import') return(
    <div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
      <div style={{...S,maxWidth:600}}>
        <ProgressBar pct={100}/>
        <h2 style={{color:N,marginBottom:6,fontSize:20}}>Connect Your Accounting Software</h2>
        <p style={{color:SL,fontSize:14,marginBottom:24}}>Auto-import your financials so TaxStat360 can calculate your K-1 and generate tax strategies.</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
          {platforms.map(p=>(
            <div key={p.id} onClick={()=>up({selected:p.id})} style={{padding:'20px 16px',border:'2px solid '+(form.selected===p.id?B:'#E2E8F0'),borderRadius:12,cursor:'pointer',background:form.selected===p.id?'#EFF6FF':'#fff',transition:'all 0.15s'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:8,background:p.color,color:'#fff',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{p.icon}</div>
                <div style={{fontWeight:700,color:N,fontSize:13}}>{p.name}</div>
              </div>
              <div style={{fontSize:11,color:SL,lineHeight:1.5}}>{p.desc}</div>
              {form.selected===p.id&&(
                <button onClick={e=>{e.stopPropagation();window.open(p.connectUrl,'_blank')}} style={{marginTop:10,padding:'8px 0',background:B,color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer',width:'100%'}}>Connect {p.name} →</button>
              )}
            </div>
          ))}
        </div>
        <Btn onClick={()=>nav('/dashboard')}>Continue to Dashboard →</Btn>
        <p style={{textAlign:'center',marginTop:12,fontSize:13,color:SL,cursor:'pointer'}} onClick={()=>nav('/dashboard')}>Skip — I'll connect later</p>
      </div>
    </div>
  )

  return null
}