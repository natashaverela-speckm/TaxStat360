import React, { useState, useEffect, useRef } from 'react'
import { readEmail, readPlan, readToken, writePlan, removeSubscriptionIncomplete } from '../utils/sessionState.js'
import { useNavigate } from 'react-router-dom'
import { signOut as sharedSignOut } from '../utils/SignOut'
import { normalizePlanId, refreshPlanFromServer } from './LockedFeature'
import BrandLogo from './BrandLogo'
import { apiFetch } from '../utils/apiClient.js'
import { FEATURE_AUDIT_RISK_SCAN, FEATURE_WHATIF_SIMULATOR, PLAN_PRICING } from '../lib/constants.js'
import { NAVY as N, BLUE as B, SLATE as SL } from '../lib/theme.js'
// AUDIT B2 (Sep 2026): canonical route + step label live in complianceCopy.js.
import { FEATURE_PERSONAL_ESTIMATE } from '../lib/complianceCopy.js'
import { STRIPE_PORTAL_URL } from '../lib/constants.js'


// Stripe billing portal — handles cancellations, downgrades, and payment updates.
// AUDIT H9 (Sep 2026): moved to constants.js. It was duplicated here and in
// Settings.jsx, and it is the product's only cancellation path — see the note there
// about verifying that cancellation is actually enabled in the portal configuration.

const PLANS = {
  // D-06: derived from PLAN_PRICING (constants.js) — single price source.
  // NOTE (OBS-9): this page's "Save $X/yr" line computes (monthly−annual)×12,
  // which differs from Landing's monthly×2 figure — preserved verbatim.
  starter:      { label:'Starter',      price:{ monthly:PLAN_PRICING.starter.monthly,      annual:PLAN_PRICING.starter.annualMonthly      }, color:'#64748B' },
  professional: { label:'Professional', price:{ monthly:PLAN_PRICING.professional.monthly, annual:PLAN_PRICING.professional.annualMonthly }, color:B,        popular:true },
  enterprise:   { label:'Enterprise',   price:{ monthly:PLAN_PRICING.enterprise.monthly,   annual:PLAN_PRICING.enterprise.annualMonthly   }, color:N         },
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
    // AUDIT B2 (Sep 2026): was 'Personal tax return (W-2 + entity income)'.
  // Must stay byte-identical to the Landing pricing card and comparison table.
  { label:FEATURE_PERSONAL_ESTIMATE,                                    starter:true,  professional:true,  enterprise:true  },
  { label:'1 accounting software integration',                          starter:true,  professional:false, enterprise:false },
  // ── Professional additions ────────────────────────────────────────────────
  // TERMINOLOGY FIX 5.1b: "Risk Alert Engine" did not match the in-app tab label "Audit Risk Scan."
  // A paying user landing in the app could not find the feature they purchased. Using the canonical
  // FEATURE_AUDIT_RISK_SCAN constant so this name stays in sync with AIAnalysis.jsx tab label.
  { label:FEATURE_AUDIT_RISK_SCAN,                                          starter:false, professional:true,  enterprise:true  },
  { label:FEATURE_WHATIF_SIMULATOR,                             starter:false, professional:true,  enterprise:true  },
  { label:'One-Click CPA Export Pack',                                  starter:false, professional:true,  enterprise:true  },
  { label:'Explainable AI: Why This Number?',                           starter:false, professional:true,  enterprise:true  },
  { label:'Ask Aria — AI tax assistant',                                starter:false, professional:true,  enterprise:true  },
  { label:'Unlimited accounting integrations',                          starter:false, professional:true,  enterprise:true  },
  { label:'Priority support',                                           starter:false, professional:true,  enterprise:true  },
  // ── Enterprise additions ──────────────────────────────────────────────────
  { label:'Multi-entity consolidated tax view',                         starter:false, professional:false, enterprise:true  },
  { label:'Auto-Generated CPA Briefing — planning summary for CPA discussion (not for filing)', starter:false, professional:false, enterprise:true  },
  // ── AUDIT H10 (second launch audit, Sep 2026): THREE FEATURES THAT DO NOT EXIST ──
  //
  // Removed from this table:
  //     Risk Tolerance Profiling
  //     CPA Collaboration Portal
  //     Dedicated onboarding & setup call
  //
  // A full-repo search found each of those strings in this file and NOWHERE else — no
  // component, no route, no gate, no handler, no backend call — and none of them appeared
  // on the Landing pricing card or its comparison table either, despite the comment at
  // the top of this file claiming the two mirror each other exactly.
  //
  // This is the identical defect constants.js already records and fixed once: "'multi-user'
  // was advertised HERE and nowhere else in the product... A $299/mo customer who
  // subscribed for team access had a clean refund claim." FTC Act §5 substantiation
  // requires a reasonable basis to exist BEFORE the claim is made, and these were being
  // made to someone looking at a $299/mo price.
  //
  // ⚠ If any of these ships one day, it goes back in the SAME commit as its
  // implementation and its Landing-page row — never ahead of them. There is now a CI
  // guard asserting this table is a subset of the Landing comparison table.
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

  const stripeRef = useRef(null)
  const cardRef = useRef(null)
  const cardNodeRef = useRef(null)
  // AUDIT M7 (second launch audit, Sep 2026): readiness is STATE, not a bare ref,
  // because the button's enabled-ness has to re-render off it. mountedRef could not do
  // that — which is precisely how an unmounted card left an enabled, dead button.
  const [stripeLoaded, setStripeLoaded] = useState(false)
  const [stripeReady, setStripeReady] = useState(false)
  // AUDIT M7: distinguishes 'not ready yet' from 'will never be ready'. Without it a
  // missing key or a failed SDK shows "Loading secure card input..." indefinitely,
  // which is a different lie from the one this finding started with.
  const [stripeFailed, setStripeFailed] = useState(false)

  useEffect(() => {
    const raw  = readPlan() || 'starter'
    const plan = normalizePlanId(raw)
    const em = readEmail() || ''
    setCurrentPlan(plan)
    setEmail(em)
  }, [])

  // AUDIT M7: "UPGRADE NOW" COULD BE AN ENABLED NO-OP.
  //
  // The old code appended the Stripe script with NO load listener, then mountCard() ran
  // on a bare setTimeout(200) and returned SILENTLY when window.Stripe or the mount node
  // was not there yet. handleUpgrade() then bailed silently too. So on a slow connection
  // — or any time the user picked a plan within ~250ms of first paint — the card never
  // mounted, the button stayed ENABLED, and clicking it did nothing. No error, no
  // spinner, no console message, and nothing a server log would show. This is the path
  // every entity-cap gate funnels into.
  //
  // Onboarding.jsx already solved this (a load listener, a readiness flag, a disabled
  // control, a visible loading note). That pattern is mirrored here rather than
  // reinvented, including its tagged-script reuse so the SDK is never appended twice.
  //
  // Three failure modes are now distinguishable instead of identical:
  //   publishable key missing -> payment unavailable, contact support
  //   SDK still loading       -> button disabled + "Loading secure card input..."
  //   SDK failed to load      -> explicit "could not load card input" error
  useEffect(() => {
    let cancelled = false
    const PK = import.meta.env.VITE_STRIPE_PK
    if (!PK) {
      setErr('Payment form is temporarily unavailable. Please refresh or contact support.')
      setStripeFailed(true)
      return
    }
    function initStripe() {
      if (cancelled || !window.Stripe || stripeRef.current) return
      try {
        const sk = window.Stripe(PK)
        stripeRef.current = sk
        const els = sk.elements()
        cardRef.current = els.create('card', {
          style: { base: { fontSize:'15px', color:N, fontFamily:'Inter,sans-serif', '::placeholder':{ color:'#94A3B8' } } }
        })
        setStripeLoaded(true)
      } catch {
        if (!cancelled) { setErr('Could not load card input. Please refresh and try again.'); setStripeFailed(true) }
      }
    }
    if (window.Stripe) {
      initStripe()
    } else {
      let sc = document.querySelector('script[data-ts360-stripe="1"]')
      if (!sc) {
        sc = document.createElement('script')
        sc.src = 'https://js.stripe.com/v3/'
        sc.async = true
        sc.dataset.ts360Stripe = '1'
        document.head.appendChild(sc)
      }
      sc.addEventListener('load', initStripe)
      sc.addEventListener('error', () => {
        if (!cancelled) { setErr('Could not load card input. Please refresh and try again.'); setStripeFailed(true) }
      })
    }
    return () => { cancelled = true }
  }, [])

  // Mount the Card Element once its node is actually in the DOM (it exists only while
  // showCard is true), and report readiness so the button can gate on it.
  useEffect(() => {
    if (!showCard || !stripeLoaded || !cardRef.current) return
    let cancelled = false
    setStripeReady(false)
    const t = window.setTimeout(() => {
      if (cancelled || !cardNodeRef.current || !cardRef.current) return
      try {
        cardRef.current.mount(cardNodeRef.current)
        if (!cancelled) setStripeReady(true)
      } catch (e) {
        const msg = String((e && e.message) || e)
        // Re-mounting an already-mounted element throws; that state is still ready.
        if (/mounted/i.test(msg)) { if (!cancelled) setStripeReady(true) }
        else if (!cancelled) { setErr('Could not load card input. Please refresh and try again.'); setStripeFailed(true) }
      }
    }, 0)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [showCard, stripeLoaded])

  const planOrder = ['starter','professional','enterprise']
  const isUpgrade = (plan) => planOrder.indexOf(plan) > planOrder.indexOf(currentPlan)
  const isDowngrade = (plan) => planOrder.indexOf(plan) < planOrder.indexOf(currentPlan)
  const isPaid = currentPlan !== 'starter'

  const handleSelectPlan = (plan) => {
    if (!isUpgrade(plan)) return
    setSelectedPlan(plan)
    setShowCard(true)
    setErr('')
    // AUDIT M7: no setTimeout(mountCard, 50) race — the mount effect fires when the
    // node exists, and the button stays disabled until it reports ready.
  }

  const handleUpgrade = async () => {
    // AUDIT M7: this used to `return` silently, which is what made the button a no-op.
    if (!selectedPlan) return
    if (!stripeReady || !stripeRef.current || !cardRef.current) {
      setErr('Card input is still loading \u2014 give it a moment and try again.')
      return
    }
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
      const token = readToken()
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

      await refreshPlanFromServer()
      if (!readPlan()) writePlan(normalizePlanId(selectedPlan))
      // D-03 (Batch 7): a successful upgrade completes any signup-time payment
      // failure — clear the flag so the Dashboard recovery banner stands down.
      removeSubscriptionIncomplete()
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
    window.open(STRIPE_PORTAL_URL, '_blank', 'noopener')
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
              {/* ── AUDIT H9 (second launch audit, Sep 2026): RETENTION INTERSTITIAL REMOVED ──
                  This used to set showCancelConfirm and render "Are you sure?" with a
                  "Keep plan" button standing between the user and cancellation. Whatever
                  it was called internally, a button placed there to talk someone out of
                  leaving is a retention prompt.

                  It falsified two shipped promises:
                    Terms.jsx §4  — cancel "without being routed through a retention offer"
                    Settings.jsx  — "with no phone call and no retention offer"
                  and ran against Cal. Bus. & Prof. Code §17602(c) (steps that obstruct or
                  delay cancellation) and ROSCA 15 U.S.C. §8403(3).

                  The H9 guard written in an earlier audit bans exactly this pattern —
                  including the literal "are you sure" — but was scoped to Settings.jsx.
                  Same product, same action, same Stripe portal, different file. The guard
                  now runs over both.

                  Cancel Plan goes straight to the billing portal, matching Settings. */}
              <button
                onClick={handleManageSubscription}
                style={{padding:'9px 18px',background:'#FEF2F2',color:'#DC2626',border:'1.5px solid #FCA5A5',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}
              >
                Cancel Plan
              </button>
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
            {/* AUDIT FIX (fresh-eyes re-audit, Aug 2026): plain onClick div with no
                role/aria-checked/keyboard handling -- same gap as the pricing-page
                toggle in Landing.jsx, independently reimplemented here. */}
            <div onClick={()=>setBilling(b=>b==='monthly'?'annual':'monthly')}
              onKeyDown={e=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); setBilling(b=>b==='monthly'?'annual':'monthly') } }}
              role="switch"
              aria-checked={billing==='annual'}
              aria-label="Toggle annual billing"
              tabIndex={0}
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
                  {/* OBS-9 (Batch 7): unified on Landing's ×2 figure (matches the 'Save 2 months' badge) — was (monthly−annual)×12, a ÷12-rounding artifact ($300 vs $298). */}
                  {billing==='annual' && <div style={{fontSize:12,color:'#059669',marginTop:2}}>Billed annually · Save ${PLAN_PRICING[key]?.annualSavings ?? plan.price.monthly*2}/yr</div>}
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
        {/* AUDIT M7: a setup failure detected on mount (missing key, SDK refused to
            load) used to have nowhere to render — the error element lived inside the
            card block, which only exists after a plan is chosen. Surface it here too,
            so the user is told before they pick a plan rather than after. */}
        {stripeFailed && err && !showCard && (
          <div style={{background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#DC2626',maxWidth:520,margin:'0 auto 16px'}}>{err}</div>
        )}
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
              <div id="card-element" ref={cardNodeRef} style={{padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:8,background:'#FAFAFA'}}/>
              {!stripeReady && !stripeFailed && <p style={{fontSize:11,color:'#94A3B8',margin:'6px 0 0'}}>Loading secure card input...</p>}
            </div>
            {err && <div style={{background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#DC2626',marginBottom:14}}>{err}</div>}
            {/* AUDIT M7: disabled until the card element reports ready, so the control
                can no longer look clickable while it is inert. */}
            <button onClick={handleUpgrade} disabled={loading || !stripeReady} style={{
              width:'100%',padding:'13px',background:(loading || !stripeReady)?'#94A3B8':B,color:'#fff',
              border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:(loading || !stripeReady)?'not-allowed':'pointer'
            }}>
              {loading ? 'Processing...' : stripeFailed ? 'Payment unavailable' : !stripeReady ? 'Loading secure card input...' : `Upgrade Now — $${PLANS[selectedPlan]?.price[billing]}/mo`}
            </button>
            <div style={{fontSize:12,color:SL,textAlign:'center',marginTop:10}}>🔒 Secured by Stripe · Cancel anytime</div>
          </div>
        )}
      </div>
    </div>
  )
}
