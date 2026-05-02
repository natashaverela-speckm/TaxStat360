import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'
const API = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'

const PLANS = {
  starter:      { label:'Starter',      price:{ monthly:79,  annual:66  }, color:'#64748B' },
  professional: { label:'Pro',          price:{ monthly:149, annual:124 }, color:B,        popular:true },
  enterprise:   { label:'Essential',    price:{ monthly:299, annual:249 }, color:N         },
}

const FEATURES = [
  { label:'Year-round tax liability calculator',    starter:true,  professional:true, enterprise:true  },
  { label:'Unlimited saved records',               starter:true,  professional:true, enterprise:true  },
  { label:'Dashboard with My Records',             starter:true,  professional:true, enterprise:true  },
  { label:'InfoTip field guidance',                starter:true,  professional:true, enterprise:true  },
  { label:'Prior year loss carryforward',          starter:true,  professional:true, enterprise:true  },
  { label:'AI Risk & Compliance Planner',          starter:false, professional:true, enterprise:true  },
  { label:'Risk alert engine',           starter:false, professional:true, enterprise:true  },
  { label:'Officer compensation analysis',         starter:false, professional:true, enterprise:true  },
  { label:'QuickBooks / Xero / Wave import',       starter:false, professional:true, enterprise:true  },
  { label:'Multiple business entities',            starter:false, professional:false, enterprise:true },
  { label:'Priority support',                      starter:false, professional:false, enterprise:true },
  { label:'Dedicated account manager',             starter:false, professional:false, enterprise:true },
]

function LOGO() {
  return (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <div style={{width:32,height:32,background:N,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="12" width="4" height="9" fill="white" rx="1"/>
          <rect x="10" y="7" width="4" height="14" fill="white" rx="1"/>
          <rect x="17" y="3" width="4" height="18" fill="white" rx="1"/>
        </svg>
      </div>
      <span style={{fontWeight:800,fontSize:18,color:N,letterSpacing:'-0.5px'}}>TaxStat<span style={{color:B}}>360</span></span>
    </div>
  )
}

function Check({ yes }) {
  if (yes) return <span style={{color:'#059669',fontWeight:700,fontSize:15}}>✓</span>
  return <span style={{color:'#CBD5E1',fontSize:15}}>—</span>
}

export default function Upgrade() {
  const nav = useNavigate()
  const [billing, setBilling] = useState('monthly')
  const [currentPlan, setCurrentPlan] = useState('starter')
  const [email, setEmail] = useState('')
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState(false)
  const [showCard, setShowCard] = useState(false)

  // Stripe refs for card input
  const stripeRef = useRef(null)
  const cardRef = useRef(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    const raw = (localStorage.getItem('plan') || 'starter').toLowerCase()
    // Normalize legacy plan names to current names
    const planMap = { 'basic': 'starter', 'pro': 'professional', 'expert': 'enterprise', 'elite': 'enterprise', 'essential': 'enterprise' }
    const plan = planMap[raw] || (PLANS[raw] ? raw : 'starter')
    const em = localStorage.getItem('ts360_email') || ''
    setCurrentPlan(plan)
    setEmail(em)
    // Load Stripe.js
    if (!window.Stripe) {
      const s = document.createElement('script')
      s.src = 'https://js.stripe.com/v3/'
      document.head.appendChild(s)
    }
  }, [])

  const planOrder = ['starter','professional','enterprise']
  const isUpgrade = (plan) => planOrder.indexOf(plan) > planOrder.indexOf(currentPlan)

  const mountCard = () => {
    if (mountedRef.current) return
    setTimeout(() => {
      if (!window.Stripe || !document.getElementById('card-element')) return
      const stripe = window.Stripe('pk_live_51TJmYhGUoj1XrJQjwM8Wo8tLgTmyQsUISsQw9zUEre4RHmDu9ciJNspQPU43Gjt0uYaDhFJR0Pw5QHUHJx7Ru0op00di8gFL4e')
      stripeRef.current = stripe
      const elements = stripe.elements()
      const card = elements.create('card', {
        style: { base: { fontSize:'15px', color:N, fontFamily:'Inter,sans-serif', '::placeholder':{ color:'#94A3B8' } } }
      })
      card.mount('#card-element')
      cardRef.current = card
      mountedRef.current = true
    }, 200)
  }

  const handleSelectPlan = (plan) => {
    if (!isUpgrade(plan)) return
    setSelectedPlan(plan)
    setShowCard(true)
    setErr('')
    setTimeout(mountCard, 50)
  }

  const handleUpgrade = async () => {
    if (!selectedPlan || !stripeRef.current || !cardRef.current) return
    setLoading(true)
    setErr('')
    try {
      // Get setup intent
      const si = await fetch(API + '/stripe/setup-intent', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}'
      }).then(r => r.json())
      if (!si.client_secret) throw new Error('Could not initialize payment')

      // Confirm card
      const { setupIntent, error } = await stripeRef.current.confirmCardSetup(si.client_secret, {
        payment_method: { card: cardRef.current, billing_details: { email } }
      })
      if (error) throw new Error(error.message)

      // Subscribe/upgrade
      const token = localStorage.getItem('token')
      await fetch(API + '/stripe/subscribe', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email, plan: selectedPlan, billing, payment_method_id: setupIntent.payment_method })
      })

      // Update local state
      localStorage.setItem('plan', selectedPlan)
      setSuccess(true)
    } catch(e) {
      setErr(e.message || 'Upgrade failed. Please try again.')
    }
    setLoading(false)
  }

  if (success) return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',maxWidth:400,padding:40}}>
        <div style={{width:64,height:64,background:'#DCFCE7',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:28}}>✓</div>
        <h2 style={{fontSize:24,fontWeight:800,color:N,marginBottom:8}}>You're upgraded!</h2>
        <p style={{color:SL,fontSize:15,marginBottom:24}}>Your plan has been updated to <strong>{PLANS[selectedPlan]?.label}</strong>. All features are now active.</p>
        <button onClick={()=>nav('/dashboard')} style={{padding:'12px 32px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer'}}>Go to Dashboard →</button>
      </div>
    </div>
  )

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {/* Nav */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div onClick={()=>nav('/dashboard')} style={{cursor:'pointer'}}><LOGO/></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>nav('/settings')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontSize:13,color:SL,fontWeight:600,cursor:'pointer'}}>← Back to Settings</button>
          <button onClick={()=>{{['token','plan','billing','ts360_session','ts360_email','userName','ts360_connected_app','ts360_quickbooks_token','ts360_quickbooks_connected','ts360_quickbooks_extra','ts360_xero_token','ts360_xero_connected','ts360_xero_refresh','ts360_wave_token','ts360_wave_connected','ts360_freshbooks_token','ts360_freshbooks_connected'].forEach(k=>localStorage.removeItem(k));nav('/')}}} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontSize:13,color:SL,fontWeight:600,cursor:'pointer'}}>Sign Out</button>
        </div>
      </nav>

      <div style={{maxWidth:960,margin:'0 auto',padding:'40px 20px'}}>
        {/* Header */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <h1 style={{fontSize:28,fontWeight:800,color:N,marginBottom:8}}>Upgrade Your Plan</h1>
          <p style={{color:SL,fontSize:15}}>You're currently on <strong>{PLANS[currentPlan]?.label || 'Starter'}</strong>. Choose a plan below to unlock more features.</p>

          {/* Billing toggle */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginTop:20}}>
            <span style={{fontSize:14,color:billing==='monthly'?N:SL,fontWeight:billing==='monthly'?700:400}}>Monthly</span>
            <div onClick={()=>setBilling(b=>b==='monthly'?'annual':'monthly')}
              style={{width:44,height:24,background:billing==='annual'?B:'#CBD5E1',borderRadius:12,cursor:'pointer',position:'relative',transition:'background 0.2s'}}>
              <div style={{width:18,height:18,background:'#fff',borderRadius:'50%',position:'absolute',top:3,left:billing==='annual'?23:3,transition:'left 0.2s'}}/>
            </div>
            <span style={{fontSize:14,color:billing==='annual'?N:SL,fontWeight:billing==='annual'?700:400}}>Annual</span>
            <span style={{fontSize:12,background:'#DCFCE7',color:'#059669',padding:'3px 10px',borderRadius:20,fontWeight:700}}>Save 2 months</span>
          </div>
        </div>

        {/* Plan cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:32}}>
          {Object.entries(PLANS).map(([key, plan]) => {
            const isCurrent = key === currentPlan
            const canUpgrade = isUpgrade(key)
            const isSelected = selectedPlan === key
            return (
              <div key={key} style={{
                background:'#fff', border:`2px solid ${isSelected?B:isCurrent?'#94A3B8':'#E2E8F0'}`,
                borderRadius:16, padding:24, position:'relative',
                opacity: !canUpgrade && !isCurrent ? 0.5 : 1,
                boxShadow: isSelected ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none'
              }}>
                {plan.popular && <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:B,color:'#fff',fontSize:11,fontWeight:700,padding:'4px 14px',borderRadius:20}}>MOST POPULAR</div>}
                {isCurrent && <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:'#64748B',color:'#fff',fontSize:11,fontWeight:700,padding:'4px 14px',borderRadius:20}}>CURRENT PLAN</div>}

                <div style={{marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:plan.color,letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>{plan.label}</div>
                  <div style={{display:'flex',alignItems:'baseline',gap:4}}>
                    <span style={{fontSize:36,fontWeight:800,color:N}}>${plan.price[billing]}</span>
                    <span style={{fontSize:13,color:SL}}>/mo</span>
                  </div>
                  {billing==='annual' && <div style={{fontSize:12,color:'#059669',marginTop:2}}>Billed annually · Save ${(plan.price.monthly-plan.price.annual)*12}/yr</div>}
                </div>

                {isCurrent ? (
                  <button disabled style={{width:'100%',padding:'10px',background:'#F1F5F9',color:SL,border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'not-allowed'}}>Current Plan</button>
                ) : canUpgrade ? (
                  <button onClick={()=>handleSelectPlan(key)} style={{
                    width:'100%',padding:'10px',background:isSelected?B:'#fff',
                    color:isSelected?'#fff':B, border:`1.5px solid ${B}`,
                    borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer',transition:'all 0.15s'
                  }}>
                    {isSelected ? '✓ Selected' : `Upgrade to ${plan.label} →`}
                  </button>
                ) : (
                  <button disabled style={{width:'100%',padding:'10px',background:'#F1F5F9',color:'#94A3B8',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'not-allowed'}}>Lower tier</button>
                )}
              </div>
            )
          })}
        </div>

        {/* Feature comparison */}
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,overflow:'hidden',marginBottom:32}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',padding:'12px 20px',background:'#F8FAFC',borderBottom:'1px solid #E2E8F0'}}>
            <div style={{fontSize:12,fontWeight:700,color:SL,textTransform:'uppercase',letterSpacing:'0.06em'}}>Feature</div>
            {['starter','professional','enterprise'].map(p=>(
              <div key={p} style={{textAlign:'center',fontSize:12,fontWeight:700,color:p===currentPlan?B:SL,textTransform:'uppercase',letterSpacing:'0.06em'}}>
                {PLANS[p].label}{p===currentPlan?' ✓':''}
              </div>
            ))}
          </div>
          {FEATURES.map((f,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',padding:'11px 20px',borderBottom:i<FEATURES.length-1?'1px solid #F1F5F9':'none',background:i%2===0?'#fff':'#FAFAFA'}}>
              <div style={{fontSize:13,color:N}}>{f.label}</div>
              <div style={{textAlign:'center'}}><Check yes={f.starter}/></div>
              <div style={{textAlign:'center'}}><Check yes={f.professional}/></div>
              <div style={{textAlign:'center'}}><Check yes={f.enterprise}/></div>
            </div>
          ))}
        </div>

        {/* Card input — shown when a plan is selected */}
        {showCard && selectedPlan && (
          <div style={{background:'#fff',border:`2px solid ${B}`,borderRadius:14,padding:28,maxWidth:520,margin:'0 auto'}}>
            <div style={{fontSize:16,fontWeight:700,color:N,marginBottom:4}}>
              Upgrade to {PLANS[selectedPlan]?.label} — ${PLANS[selectedPlan]?.price[billing]}/mo
            </div>
            <div style={{fontSize:13,color:SL,marginBottom:20}}>
              {billing==='annual'?'Billed annually':'Billed monthly'} · Cancel anytime · No hidden fees
            </div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:SL,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:8}}>Card Details</label>
              <div id="card-element" style={{padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:8,background:'#FAFAFA'}}/>
            </div>

            {err && <div style={{background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#DC2626',marginBottom:14}}>{err}</div>}

            <button onClick={handleUpgrade} disabled={loading} style={{
              width:'100%',padding:'13px',background:loading?'#94A3B8':B,color:'#fff',
              border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer'
            }}>
              {loading ? 'Processing...' : `Upgrade Now — $${PLANS[selectedPlan]?.price[billing]}/mo`}
            </button>
            <div style={{fontSize:12,color:SL,textAlign:'center',marginTop:10}}>🔒 Secured by Stripe · Card required · Cancel anytime</div>
          </div>
        )}
      </div>
    </div>
  )
}
