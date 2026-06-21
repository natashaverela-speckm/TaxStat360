import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut as sharedSignOut } from './utils/signOut'
import { normalizePlanId } from './LockedFeature'
import BrandLogo from './BrandLogo'
import { apiFetch } from './utils/apiClient.js'
import { FEATURE_AUDIT_RISK_SCAN, FEATURE_WHATIF_SIMULATOR } from './constants.js'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'

// Stripe billing portal — handles cancellations, downgrades, and payment updates.
// FTC Click-to-Cancel compliance: users can cancel here as easily as they signed up.
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/aFa14n9hlfeA0Wx9jOejK00'

const PLANS = {
  starter:      { label:'Starter',      price:{ monthly:79,  annual:66  }, color:'#64748B' },
  professional: { label:'Professional', price:{ monthly:149, annual:124 }, color:B,        popular:true },
  enterprise:   { label:'Enterprise',   price:{ monthly:299, annual:249 }, color:N         },
}

// FEAT-01 FIX: FEATURES table now mirrors Landing.jsx plan feature lists exactly.
// Prior table used mismatched labels that diverged from marketing copy, and was
// missing several features (What-If Simulator, CPA Export Pack, Explainable AI,
// Audit Risk Indicators, multi-entity view, CPA Collaboration Portal).
// Users on the upgrade page now see the same features advertised on the landing page.
const FEATURES = [
  // ── Starter ──────────────────────────────────────────────────────────────
  { label:'Year-round federal tax liability tracker',                   starter:true,  professional:true,  enterprise:true  },
  { label:'K-1 income (S-Corps, partnerships, Multi-Member LLCs)',      starter:true,  professional:true,  enterprise:true  },
  { label:'Schedule C (sole props & SMLLCs)',                           starter:true,  professional:true,  enterprise:true  },
  { label:'Quarterly estimated payments',                               starter:true,  professional:true,  enterprise:true  },
  { label:'Personal tax return (W-2 + entity income)',                 starter:true,  professional:true,  enterprise:true  },
  { label:'1 accounting software integration',                          starter:true,  professional:false, enterprise:false },
  // ── Professional additions ────────────────────────────────────────────────
  // TERMINOLOGY FIX 5.1b: "Risk Alert Engine" did not match the in-app tab label "Audit Risk Scan."
  // A paying user landing in the app could not find the feature they purchased. Using the canonical
  // FEATURE_AUDIT_RISK_SCAN constant so this name stays in sync with AIAnalysis.jsx tab label.
  { label:FEATURE_AUDIT_RISK_SCAN,                                          starter:false, professional:true,  enterprise:true  },
  { label:FEATURE_WHATIF_SIMULATOR,                             starter:false, professional:true,  enterprise:true  },
  { label:'One-Click CPA Export Pack',                                  starter:false, professional:true,  enterprise:true  },
  { label:'Explainable AI: Why This Number?',                           starter:false, professional:true,  enterprise:true  },
  { label:'Unlimited accounting integrations',                          starter:false, professional:true,  enterprise:true  },
  { label:'Priority support',                                           starter:false, professional:true,  enterprise:true  },
  // ── Enterprise additions ──────────────────────────────────────────────────
  { label:'Multi-entity consolidated tax view',                         starter:false, professional:false, enterprise:true  },
  { label:'AI-Generated CPA Briefing Documents',                        starter:false, professional:false, enterprise:true  },
  { label:'Risk Tolerance Profiling',                                   starter:false, professional:false, enterprise:true  },
  { label:'CPA Collaboration Portal',                                   starter:false, professional:false, enterprise:true  },
  { label:'Dedicated onboarding & setup call',                          starter:false, professional:false, enterprise:true  },
]

function LOGO() {
  return <BrandLogo size={32} />
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
  // FIX (FTC): cancel confirmation state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const stripeRef = useRef(null)
  const cardRef = useRef(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    const raw  = localStorage.getItem('ts360_plan') || 'starter'
    const plan = normalizePlanId(raw)
    const em = localStorage.getItem('ts360_email') || ''
    setCurrentPlan(plan)
    setEmail(em)
    if (!window.Stripe) {
      const s = document.createElement('script')
      s.src = 'https://js.stripe.com/v3/'
      document.head.appendChild(s)
    }
  }, [])

  const planOrder = ['starter','professional','enterprise']
  const isUpgrade = (plan) => planOrder.indexOf(plan) > planOrder.indexOf(currentPlan)
  const isDowngrade = (plan) => planOrder.indexOf(plan) < planOrder.indexOf(currentPlan)
  const isPaid = currentPlan !== 'starter'

  const mountCard = () => {
    if (mountedRef.current) return
    setTimeout(() => {
      if (!window.Stripe || !document.getElementById('card-element')) return
      // SEC-01 FIX: Stripe live key moved to environment variable.
      // Was: window.Stripe('pk_live_51TJmYh...' ) — hardcoded in source.
      // Now: reads from VITE_STRIPE_PK env var so dev builds use test key.
      const stripe = window.Stripe(import.meta.env.VITE_STRIPE_PK)
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
      const si = await apiFetch('/stripe/setup-intent', {
        method: 'POST', body: {}, raw: true
      }).then(r => r.json())
      if (!si.client_secret) throw new Error('Could not initialize payment')

      const { setupIntent, error } = await stripeRef.current.confirmCardSetup(si.client_secret, {
        payment_method: { card: cardRef.current, billing_details: { email } }
      })
      if (error) throw new Error(error.message)

      // B2: Check /stripe/subscribe response before updating local plan state.
      // Previously the response was discarded — if the API returned 402/500, the user
      // saw "You're upgraded!" but no subscription was created, resulting in silent
      // revenue loss. Now we verify the subscription is active before celebrating.
      const token = localStorage.getItem('ts360_token')
      const subRes = await apiFetch('/stripe/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${token}` },
        body: { plan: selectedPlan, billing, payment_method_id: setupIntent.payment_method },
        raw: true,
      })
      if (!subRes.ok) {
        const subData = await subRes.json().catch(() => ({}))
        throw new Error(subData.detail || 'Subscription activation failed. Your card was not charged.')
      }

      localStorage.setItem('ts360_plan', selectedPlan)
      setSuccess(true)
    } catch(e) {
      setErr(e.message || 'Upgrade failed. Please try again.')
    }
    setLoading(false)
  }

  // FIX (FTC Click-to-Cancel): routes to Stripe billing portal which handles
  // cancellations, downgrades, and payment method updates. Required by FTC
  // Click-to-Cancel rule (16 CFR §425) — users must be able to cancel as
  // easily as they signed up, via the same channel (online → online).
  const handleManageSubscription = () => {
    window.open(STRIPE_PORTAL_URL, '_blank')
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

  const signOutKeys = () => sharedSignOut(nav)

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {/* Nav */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100,overflowX:'auto',minWidth:0}}>
        <div onClick={()=>nav('/dashboard')} style={{cursor:'pointer'}}><LOGO/></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>nav('/settings')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontSize:13,color:SL,fontWeight:600,cursor:'pointer'}}>← Back to Settings</button>
          <button onClick={signOutKeys} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontSize:13,color:SL,fontWeight:600,cursor:'pointer'}}>Sign Out</button>
        </div>
      </nav>

      <div style={{maxWidth:960,margin:'0 auto',padding:'40px 20px'}}>

        {/* FIX (FTC): Manage Subscription section — visible to all paid (non-starter) users.
            FTC Click-to-Cancel (16 CFR §425) requires cancellation to be immediately available
            via the same channel as sign-up (online). This section surfaces the cancel path
            prominently and without friction, as required. */}
        {isPaid && (
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:'20px 24px',marginBottom:28,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:N,marginBottom:4}}>
                Current plan: <span style={{color:B}}>{PLANS[currentPlan]?.label}</span>
              </div>
              <div style={{fontSize:13,color:SL,lineHeight:1.5}}>
                Manage billing, update your payment method, downgrade, or cancel your subscription at any time.
                {' '}If you cancel, you keep access until the end of your current billing period.
              </div>
            </div>
            <div style={{display:'flex',gap:10,flexShrink:0}}>
              <button
                onClick={handleManageSubscription}
                style={{padding:'9px 18px',background:'#fff',color:N,border:'1.5px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}
              >
                Manage Billing →
              </button>
              {/* FIX (FTC): Cancel Plan button — prominent, no extra friction, direct path.
                  FTC requires cancellation be as simple as sign-up. One click here opens
                  Stripe's cancel flow in the billing portal. */}
              {!showCancelConfirm ? (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  style={{padding:'9px 18px',background:'#FEF2F2',color:'#DC2626',border:'1.5px solid #FCA5A5',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}
                >
                  Cancel Plan
                </button>
              ) : (
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#FEF2F2',border:'1.5px solid #FCA5A5',borderRadius:8,padding:'6px 12px'}}>
                  <span style={{fontSize:13,color:'#DC2626',fontWeight:500}}>Are you sure?</span>
                  <button
                    onClick={handleManageSubscription}
                    style={{padding:'5px 12px',background:'#DC2626',color:'#fff',border:'none',borderRadius:6,fontWeight:700,fontSize:12,cursor:'pointer'}}
                  >
                    Yes, cancel
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    style={{padding:'5px 10px',background:'transparent',color:SL,border:'none',borderRadius:6,fontWeight:600,fontSize:12,cursor:'pointer'}}
                  >
                    Keep plan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{textAlign:'center',marginBottom:36}}>
          <h1 style={{fontSize:28,fontWeight:800,color:N,marginBottom:8}}>
            {isPaid ? 'Change Your Plan' : 'Upgrade Your Plan'}
          </h1>
          <p style={{color:SL,fontSize:15}}>
            You're currently on <strong>{PLANS[currentPlan]?.label || 'Starter'}</strong>.
            {isPaid
              ? ' To downgrade or cancel, use "Manage Billing" above.'
              : ' Choose a plan below to unlock more features.'
            }
          </p>

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
            const canDowngrade = isDowngrade(key)
            const isSelected = selectedPlan === key
            return (
              <div key={key} style={{
                background:'#fff', border:`2px solid ${isSelected?B:isCurrent?'#94A3B8':'#E2E8F0'}`,
                borderRadius:16, padding:24, position:'relative',
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
                ) : canDowngrade ? (
                  // FIX (FTC): downgrade path — routes to Stripe billing portal.
                  // Previously disabled as "Lower tier" with no action.
                  <button
                    onClick={handleManageSubscription}
                    style={{width:'100%',padding:'10px',background:'#fff',color:SL,border:'1.5px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}
                  >
                    Downgrade →
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* FTC disclosure — required: clear statement of cancellation terms */}
        <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'14px 20px',marginBottom:24,fontSize:12,color:SL,lineHeight:1.6,textAlign:'center'}}>
          You may cancel or downgrade your subscription at any time using the "Cancel Plan" or "Manage Billing" buttons above.
          Upon cancellation, you retain access to your current plan until the end of the billing period. No refunds are issued for partial periods.
          To cancel, click "Cancel Plan" → confirm → you will be redirected to our secure billing portal.
        </div>

        {/* Feature comparison table */}
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

        {/* Card input for upgrades */}
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
            <div style={{fontSize:12,color:SL,textAlign:'center',marginTop:10}}>🔒 Secured by Stripe · Cancel anytime</div>
          </div>
        )}
      </div>
    </div>
  )
}
