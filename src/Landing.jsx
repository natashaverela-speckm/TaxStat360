import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const VIMEO_VIDEO_ID='1180620888'
const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:10}}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,letterSpacing:'-0.3px',borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)

const TIERS = [
  {
    name:'Basic',
    price:'$49',
    period:'/mo',
    desc:'Essential AI tax tools for new S-Corp and LLC owners just getting started.',
    color:'#475569',
    bg:'#F8FAFC',
    border:'#E2E8F0',
    btnBg:'#fff',
    btnColor:N,
    btnBorder:'1px solid #E2E8F0',
    badge:null,
    features:[
      {n:3,t:'Explainable AI Layer ("Why This Number?")'},
      {n:10,t:'Data Confidence Score'},
      {n:21,t:'IRS Schedule Mapping (C, E, K-1)'},
      {n:22,t:'Depreciation Compliance Engine (MACRS, 179, Bonus)'},
      {n:25,t:'Estimated Tax Payment Planner (Quarterly)'},
      {n:27,t:'Compliance Confidence Indicator'},
      {n:28,t:'IRS-Friendly Language Mode'},
      {n:31,t:'IRS Deadline & Penalty Awareness Engine'},
      {n:15,t:'Tax-Saving Opportunity Discovery'},
      {n:16,t:'AI-Generated Financial Action Plan'},
    ]
  },
  {
    name:'Professional',
    price:'$99',
    period:'/mo',
    desc:'Advanced planning and compliance tools for growing businesses and their advisors.',
    color:B,
    bg:'#EFF6FF',
    border:B,
    btnBg:B,
    btnColor:'#fff',
    btnBorder:'none',
    badge:'Most Popular',
    features:[
      {n:1,t:'Real-Time Risk Alert Engine'},
      {n:2,t:'What-If Scenario Simulator'},
      {n:4,t:'AI Assumption Transparency Panel'},
      {n:5,t:'Advisor & Accountant Collaboration Access'},
      {n:6,t:'One-Click CPA / Advisor Export Pack'},
      {n:7,t:'Mid-Year Tax & Risk Pulse'},
      {n:8,t:'Year-Over-Year Intelligence Comparison'},
      {n:9,t:'Financial Data Anomaly Detection'},
      {n:11,t:'Personalized Risk Tolerance Profiling'},
      {n:12,t:'Industry Benchmark Intelligence'},
      {n:20,t:'IRS Audit Readiness Mode'},
      {n:23,t:'State-Level Tax Awareness & Adjustments'},
      {n:24,t:'Safe Harbor Rule Detection'},
      {n:26,t:'IRS Rule Change Monitoring (AI-Driven)'},
      {n:29,t:'Compliance-Grade AI Guardrails'},
      {n:32,t:'IRS-Aligned Data Retention & Audit Trail'},
      {n:3,t:'Explainable AI Layer'},
      {n:10,t:'Data Confidence Score'},
      {n:15,t:'Tax-Saving Opportunity Discovery'},
      {n:16,t:'AI-Generated Financial Action Plan'},
    ]
  },
  {
    name:'Advanced',
    price:'$199',
    period:'/mo',
    desc:'The complete 32-feature AI platform — enterprise-ready, IRS-aligned, built to scale.',
    color:'#7C3AED',
    bg:'#F5F3FF',
    border:'#7C3AED',
    btnBg:'#7C3AED',
    btnColor:'#fff',
    btnBorder:'none',
    badge:'Full Platform',
    features:[
      {n:'All',t:'Everything in Professional, plus:'},
      {n:13,t:'AI Recommendation Change Tracking'},
      {n:14,t:'Support Replay & Audit Mode'},
      {n:17,t:'Event-Triggered AI Re-Analysis'},
      {n:18,t:'Multi-Entity / Multi-Business View'},
      {n:19,t:'Monetization-Ready AI Feature Tiers'},
      {n:30,t:'AI-Generated Audit Defense Narrative'},
      {n:'★',t:'Priority Support & Onboarding'},
      {n:'★',t:'Dedicated Account Manager'},
      {n:'★',t:'Custom IRS Correspondence Templates'},
      {n:'★',t:'White-Label Option Available'},
      {n:'32',t:'All 32 AI Features Included'},
    ]
  },
]

export default function Landing(){
  const nav=useNavigate()
  const [activeTier,setActiveTier]=useState(1)

  return(
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F0F4FF'}}>

      {/* NAV */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 40px',height:64,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <LOGO/>
        <div style={{display:'flex',gap:12}}>
          <button onClick={()=>nav('/login')} style={{padding:'8px 20px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',color:N}}>Sign In</button>
          <button onClick={()=>nav('/signup')} style={{padding:'8px 20px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:14,cursor:'pointer'}}>Get Started Free</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={{textAlign:'center',padding:'64px 24px 40px'}}>
        <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginBottom:16}}>
          <span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,letterSpacing:1.4,padding:'5px 14px',borderRadius:20}}>AI-BASED AUDIT & RISK PLANNER</span>
          <span style={{background:'#F0FDF4',color:'#15803D',fontSize:11,fontWeight:700,letterSpacing:1.2,padding:'5px 14px',borderRadius:20}}>US-SPECIFIC IRS, STATE & FEDERAL COMPLIANCE</span>
          <span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,letterSpacing:1.2,padding:'5px 14px',borderRadius:20}}>ADVANCED AI FEATURE EXPANSION</span>
        </div>
        <h1 style={{fontSize:52,fontWeight:800,color:N,margin:'0 0 12px',lineHeight:1.1}}>Your Tax Strategy,<br/>Powered by Intelligence</h1>
        <p style={{color:SL,fontSize:17,maxWidth:620,margin:'0 auto 32px'}}>TaxStat360 delivers 32 AI-powered features designed for IRS, state, and federal compliance — built for S-Corps, Multi-Member LLCs, and Partnerships.</p>
        <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
          <button onClick={()=>nav('/signup')} style={{padding:'14px 32px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:16,cursor:'pointer'}}>Start Free Trial →</button>
          <button onClick={()=>nav('/login')} style={{padding:'14px 32px',background:'#fff',color:N,border:'1px solid #E2E8F0',borderRadius:10,fontWeight:700,fontSize:16,cursor:'pointer'}}>Sign In</button>
        </div>
      </div>

      {/* SOCIAL PROOF STRIP */}
      <div style={{background:'#fff',borderTop:'1px solid #E2E8F0',borderBottom:'1px solid #E2E8F0',padding:'24px 40px'}}>
        <div style={{maxWidth:1000,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,textAlign:'center'}}>
          {[
            {stat:'$100M+',label:'Tax Dollars Saved for Clients'},
            {stat:'32',label:'AI-Powered Compliance Features'},
            {stat:'10,000+',label:'IRS Schedules Mapped'},
            {stat:'98%',label:'Compliance Confidence Rate'},
          ].map(s=>(
            <div key={s.stat}>
              <div style={{fontSize:30,fontWeight:800,color:B,marginBottom:4}}>{s.stat}</div>
              <div style={{fontSize:13,color:SL,fontWeight:500}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* VIDEO */}
      <div style={{maxWidth:860,margin:'48px auto',padding:'0 24px'}}>
        <div style={{background:'#fff',borderRadius:16,overflow:'hidden',boxShadow:'0 4px 24px rgba(37,99,235,0.10)',border:'1px solid #E2E8F0'}}>
          <div style={{background:N,padding:'14px 24px',display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:12,height:12,borderRadius:'50%',background:'#ef4444'}}/><div style={{width:12,height:12,borderRadius:'50%',background:'#f59e0b'}}/><div style={{width:12,height:12,borderRadius:'50%',background:'#10b981'}}/>
            <span style={{color:'#94a3b8',fontSize:13,marginLeft:8}}>TaxStat360 — Platform Overview</span>
          </div>
          <div style={{position:'relative',paddingBottom:'56.25%',height:0}}>
            <iframe
              src={'https://player.vimeo.com/video/' + VIMEO_VIDEO_ID + '?badge=0&autopause=0&title=0&byline=0&portrait=0&dnt=1'}
              title="TaxStat360 Platform Overview"
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
              allowFullScreen
              style={{position:'absolute',top:0,left:0,width:'100%',height:'100%'}}
            />
          </div>
        </div>
        <p style={{textAlign:'center',color:SL,fontSize:13,marginTop:12}}>Watch how TaxStat360 calculates your K-1 income and generates AI-powered tax strategies in minutes.</p>
      </div>

      {/* PRICING SECTION */}
      <div style={{background:N,padding:'64px 24px'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:48}}>
            <div style={{display:'inline-block',background:'rgba(37,99,235,0.3)',color:'#93c5fd',fontSize:11,fontWeight:700,letterSpacing:1.5,padding:'6px 14px',borderRadius:20,marginBottom:14}}>SIMPLE, TRANSPARENT PRICING</div>
            <h2 style={{color:'#fff',fontSize:34,fontWeight:800,margin:'0 0 10px'}}>Choose Your AI Tax Intelligence Level</h2>
            <p style={{color:'#94a3b8',fontSize:15,maxWidth:540,margin:'0 auto'}}>Start with the basics or unlock all 32 AI-powered features. Every plan includes a 14-day free trial.</p>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,alignItems:'start'}}>
            {TIERS.map((tier,i)=>(
              <div key={tier.name} style={{background:tier.bg,border:'2px solid '+(activeTier===i?tier.color:tier.border),borderRadius:16,padding:'28px 24px',position:'relative',transition:'all 0.2s',cursor:'pointer'}} onClick={()=>setActiveTier(i)}>
                {tier.badge&&<div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:tier.color,color:'#fff',fontSize:11,fontWeight:700,padding:'4px 14px',borderRadius:20,whiteSpace:'nowrap'}}>{tier.badge}</div>}
                <div style={{marginBottom:20}}>
                  <div style={{fontWeight:800,color:tier.color,fontSize:13,letterSpacing:1,marginBottom:6}}>{tier.name.toUpperCase()}</div>
                  <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:8}}>
                    <span style={{fontSize:40,fontWeight:800,color:N}}>{tier.price}</span>
                    <span style={{color:SL,fontSize:14}}>{tier.period}</span>
                  </div>
                  <div style={{color:SL,fontSize:13,lineHeight:1.5,marginBottom:16}}>{tier.desc}</div>
                  <button onClick={e=>{e.stopPropagation();nav('/signup')}} style={{width:'100%',padding:'12px',background:tier.btnBg,color:tier.btnColor,border:tier.btnBorder,borderRadius:8,fontWeight:700,fontSize:14,cursor:'pointer'}}>
                    Start Free Trial →
                  </button>
                </div>
                <div style={{borderTop:'1px solid #E2E8F0',paddingTop:20}}>
                  {tier.features.map(f=>(
                    <div key={f.n} style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10}}>
                      <div style={{width:20,height:20,borderRadius:5,background:tier.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff',flexShrink:0,marginTop:1}}>{f.n}</div>
                      <div style={{color:N,fontSize:13,lineHeight:1.4,fontWeight:f.n==='All'?700:400}}>{f.t}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p style={{textAlign:'center',color:'#64748b',fontSize:13,marginTop:24}}>All plans include a 14-day free trial. No credit card charged until trial ends. Cancel anytime.</p>
        </div>
      </div>

      {/* 32 FEATURES FULL GRID */}
      <div style={{background:'#0a1628',padding:'64px 24px'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:40}}>
      {/* FOOTER */}
      <div style={{background:'#060f1e',padding:'24px',textAlign:'center'}}>
        <p style={{color:'#475569',fontSize:13}}>© 2025 TaxStat360 · MoneyMasters Academy · Built by a former IRS Revenue Agent</p>
      </div>
    </div>
  )
}