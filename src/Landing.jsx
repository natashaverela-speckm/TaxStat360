import React from 'react'
import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const VID='1180620888'

const LOGO=()=>(<div style={{display:'flex',flexDirection:'column',alignItems:'flex-start'}}><div style={{display:'flex',alignItems:'center',gap:10}}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,letterSpacing:'-0.3px',borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div><p style={{fontSize:10,color:'#64748B',margin:'2px 0 0 2px',letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600,whiteSpace:'nowrap'}}>IRS-Proven · Audit-Ready · Trusted</p></div>)


const CHECKOUT_API = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod/checkout'

const startCheckout = async (priceId) => {
  try {
    const r = await fetch(CHECKOUT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId })
    })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else alert('Unable to start checkout. Please try again.')
  } catch(e) {
    alert('Unable to start checkout. Please try again.')
  }
}

const TIERS=[
  {n:'ESSENTIAL PROTECTION',priceId:'price_1TJmmDGUoj1XrJQjbArxsVDy',p:'$79',period:'/mo',label:'10 AI Features',desc:'Essential AI tax tools for new S-Corp and LLC owners.',bg:'#fff',border:'#CBD5E1',btnBg:B,btnColor:'#fff',badge:null,
   features:['IRS Schedule Mapping (C, E, K-1)','Quarterly Tax Payment Planner','Explainable AI Layer','Tax-Saving Opportunity Discovery','Compliance Confidence Indicator','IRS Deadline & Penalty Awareness','IRS-Friendly Language Mode','Depreciation Compliance Engine','Data Confidence Score','AI-Generated Action Plan']},
  {n:'FULL TAX INTELLIGENCE',priceId:'price_1TJmmwGUoj1XrJQjZp897iCJ',p:'$149',period:'/mo',label:'20 AI Features',desc:'Advanced planning and compliance tools for growing businesses.',bg:N,border:B,btnBg:B,btnColor:'#fff',badge:'Most Popular',
   features:['Everything in Basic, plus:','Real-Time Risk Alert Engine','What-If Scenario Simulator','Advisor & Accountant Collaboration','One-Click CPA Export Pack','Mid-Year Tax & Risk Pulse','Year-Over-Year Intelligence','Financial Data Anomaly Detection','IRS Audit Readiness Mode','State-Level Tax Awareness','Safe Harbor Rule Detection','IRS Rule Change Monitoring','Compliance-Grade AI Guardrails','Industry Benchmark Intelligence','Risk Tolerance Profiling','IRS Data Retention & Audit Trail','AI Assumption Transparency Panel','YOY Intelligence Comparison','Personalized Risk Profiling','Advisor Collaboration Access']},
  {n:'ENTERPRISE DEFENSE',priceId:'price_1TJmnKGUoj1XrJQjfgrOhAlC',p:'$299',period:'/mo',label:'All 32 AI Features',desc:'The complete 32-feature platform, enterprise-ready and IRS-aligned.',bg:'#fff',border:'#CBD5E1',btnBg:N,btnColor:'#fff',badge:'Full Platform',
   features:['Everything in Professional, plus:','AI Recommendation Change Tracking','Support Replay & Audit Mode','Event-Triggered AI Re-Analysis','AI-Generated Audit Defense Narrative','Priority Support & Onboarding','Dedicated Account Manager','Custom IRS Correspondence Templates','White-Label Option Available','All 32 AI Features Included']},
]

const WHY=[
  {icon:'🛡️',title:'Powered by Former IRS Professionals',body:'Not guesswork. Built by former IRS professionals who ran audits — and know exactly what triggers them.'},
  {icon:'⚡',title:'Real-Time Risk Detection',body:'Catch IRS red flags before they become problems. 3 alerts on average found per user in the first 24 hours.'},
  {icon:'💰',title:'Tax Savings Discovery',body:'Our AI maps deductions and strategies specific to your entity type. Most users find $8K+ in their first analysis.'},
  {icon:'📋',title:'Audit Defense Ready',body:'AI-generated audit narratives and documentation — ready the moment you need them, not months later.'},
  {icon:'🔄',title:'What-If Simulator',body:'Model salary changes, entity restructuring, and depreciation strategies before you make a costly move.'},
  {icon:'🎯',title:'IRS Schedule Precision',body:'Auto-maps Schedule C, E, K-1 and more based on your actual entity type and financial data.'},
]


function FAQ({q,a}){
  const [open,setOpen]=React.useState(false)
  return(
    <div style={{borderBottom:'1px solid #E2E8F0',padding:'20px 0'}}>
      <div onClick={()=>setOpen(!open)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',gap:16}}>
        <p style={{color:'#0D1B3E',fontWeight:700,fontSize:16,margin:0,lineHeight:1.4}}>{q}</p>
        <span style={{color:'#2563EB',fontSize:22,fontWeight:300,flexShrink:0,transform:open?'rotate(45deg)':'none',transition:'transform 0.2s'}}>+</span>
      </div>
      {open&&<p style={{color:'#475569',fontSize:15,lineHeight:1.8,margin:'14px 0 0',paddingRight:32}}>{a}</p>}
    </div>
  )
}

export default function Landing(){
  const nav=useNavigate()
  return(
    <div style={{fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',minHeight:'100vh',background:'#fff'}}>

      {/* NAV */}
      <nav style={{position:'sticky',top:0,zIndex:50,background:'rgba(255,255,255,0.97)',backdropFilter:'blur(8px)',borderBottom:'1px solid #E2E8F0',padding:'0 40px',height:68,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div onClick={()=>nav('/')} style={{cursor:'pointer'}}><LOGO/></div>
        <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}><a href='/about' style={{color:'#475569',fontSize:14,fontWeight:600,textDecoration:'none',marginRight:4}}>About</a><a href='/why-taxstat360' style={{color:'#475569',fontSize:14,fontWeight:600,textDecoration:'none',marginRight:4}}>Why Us</a><a href='/contact' style={{color:'#475569',fontSize:14,fontWeight:600,textDecoration:'none',marginRight:8}}>Contact</a>
          <button onClick={()=>nav('/login')} style={{padding:'10px 24px',background:'#fff',color:N,border:'1px solid #CBD5E1',borderRadius:10,fontWeight:600,fontSize:14,cursor:'pointer'}}>Sign In</button>
          <button onClick={()=>nav('/signup')} style={{padding:'10px 24px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:600,fontSize:14,cursor:'pointer'}}>Get Started Free</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={{background:'linear-gradient(150deg,#EFF6FF 0%,#F8FAFC 50%,#EFF6FF 100%)',padding:'100px 40px 80px',textAlign:'center'}}>
        <div style={{maxWidth:1200,margin:'0 auto'}}>
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:24}}>
            {['AI-BASED AUDIT & RISK PLANNER','US-SPECIFIC IRS, STATE & FEDERAL COMPLIANCE','ADVANCED AI FEATURE EXPANSION'].map((b,i)=>(
              <span key={b} style={{background:i===1?'#D1FAE5':'#EFF6FF',color:i===1?'#065F46':B,fontSize:11,fontWeight:700,letterSpacing:'1.2px',padding:'5px 16px',borderRadius:20,border:`1px solid ${i===1?'#A7F3D0':'#BFDBFE'}`}}>{b}</span>
            ))}
          </div>
          <h1 style={{color:N,fontSize:64,fontWeight:900,margin:'0 0 20px',lineHeight:1.05,letterSpacing:'-1.5px',maxWidth:900,marginLeft:'auto',marginRight:'auto'}}>
            Your Tax Strategy,<br/>Powered by Intelligence
          </h1>
          <p style={{color:SL,fontSize:20,maxWidth:700,margin:'0 auto 40px',lineHeight:1.7}}>
            TaxStat360 delivers 32 AI-powered features for IRS, state, and federal compliance — built for every business entity type, from Sole Proprietors and Single-Member LLCs to S-Corps, Partnerships, and Multi-Member LLCs.
          </p>
          <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap',marginBottom:48}}>
            <button onClick={()=>nav('/signup')} style={{padding:'16px 44px',background:B,color:'#fff',border:'none',borderRadius:12,fontWeight:700,fontSize:17,cursor:'pointer',boxShadow:'0 4px 20px rgba(37,99,235,0.35)'}}>Start Free Trial — 7 Days Free</button>
            <button onClick={()=>nav('/login')} style={{padding:'16px 36px',background:'#fff',color:N,border:'2px solid #CBD5E1',borderRadius:12,fontWeight:700,fontSize:17,cursor:'pointer'}}>Sign In</button>
          </div>
          <p style={{fontSize:13,color:'#94A3B8',margin:0}}>No credit card charged until trial ends · Cancel anytime</p>
        </div>
      </div>

      {/* STATS BAR */}
      <div style={{background:'#fff',borderTop:'1px solid #E2E8F0',borderBottom:'1px solid #E2E8F0',padding:'32px 40px'}}>
        <div style={{maxWidth:1100,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,textAlign:'center'}}>
          {[{s:'$100M+',l:'Tax Dollars Saved'},{s:'32',l:'AI-Powered Features'},{s:'10,000+',l:'IRS Schedules Mapped'},{s:'98%',l:'Compliance Rate'}].map(x=>(
            <div key={x.l}>
              <div style={{fontSize:36,fontWeight:900,color:B,marginBottom:6,letterSpacing:'-1px'}}>{x.s}</div>
              <div style={{fontSize:14,color:SL,fontWeight:500}}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* WHY SECTION */}
      <div style={{background:'#F8FAFC',padding:'80px 40px'}}>
        <div style={{maxWidth:1200,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:56}}>
            <div style={{display:'inline-block',background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'6px 16px',borderRadius:20,marginBottom:16,letterSpacing:'1.5px'}}>WHY TAXSTAT360</div>
            <h2 style={{color:N,fontSize:42,fontWeight:900,margin:'0 0 14px',letterSpacing:'-0.5px'}}>The IRS knows something you don't.</h2>
            <p style={{color:SL,fontSize:18,maxWidth:580,margin:'0 auto',lineHeight:1.6}}>We built the platform to level the playing field — giving business owners the same intelligence the IRS uses.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24}}>
            {WHY.map(w=>(
              <div key={w.title} style={{background:'#fff',borderRadius:16,padding:'28px',border:'1px solid #E2E8F0',boxShadow:'0 2px 12px rgba(0,0,0,0.04)'}}>
                <div style={{fontSize:32,marginBottom:14}}>{w.icon}</div>
                <h3 style={{color:N,fontSize:17,fontWeight:800,margin:'0 0 10px'}}>{w.title}</h3>
                <p style={{color:SL,fontSize:14,lineHeight:1.7,margin:0}}>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* VIDEO */}
      <div style={{background:'#fff',padding:'80px 40px'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:36}}>
            <div style={{display:'inline-block',background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,padding:'6px 16px',borderRadius:20,marginBottom:16,letterSpacing:'1.5px'}}>SEE IT IN ACTION</div>
            <h2 style={{color:N,fontSize:38,fontWeight:900,margin:'0 0 12px',letterSpacing:'-0.5px'}}>Watch TaxStat360 Work</h2>
            <p style={{color:SL,fontSize:16,margin:0}}>See how the AI engine analyzes your business and surfaces savings in real time.</p>
          </div>
          <div style={{background:'#F8FAFC',borderRadius:20,overflow:'hidden',boxShadow:'0 8px 48px rgba(37,99,235,0.13)',border:'1px solid #E2E8F0'}}>
            <div style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'12px 20px',display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:12,height:12,borderRadius:'50%',background:'#ef4444'}}/>
              <div style={{width:12,height:12,borderRadius:'50%',background:'#f59e0b'}}/>
              <div style={{width:12,height:12,borderRadius:'50%',background:'#10b981'}}/>
              <span style={{color:'#94A3B8',fontSize:13,marginLeft:8,fontWeight:500}}>TaxStat360 Platform Overview</span>
            </div>
            <div style={{position:'relative',paddingBottom:'56.25%',height:0}}>
              <iframe src={'https://player.vimeo.com/video/'+VID+'?badge=0&autopause=0&title=0&byline=0&portrait=0&dnt=1'} title="TaxStat360 Overview" frameBorder="0" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen style={{position:'absolute',top:0,left:0,width:'100%',height:'100%'}}/>
            </div>
          </div>
        </div>
      </div>

      {/* PRICING */}
      <div style={{background:'#0D1B3E',padding:'90px 40px'}}>
        <div style={{maxWidth:1200,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:56}}>
            <div style={{display:'inline-block',background:'rgba(147,197,253,0.15)',color:'#93C5FD',fontSize:11,fontWeight:700,padding:'6px 16px',borderRadius:20,marginBottom:16,letterSpacing:'1.5px'}}>SIMPLE, TRANSPARENT PRICING</div>
            <h2 style={{color:'#fff',fontSize:42,fontWeight:900,margin:'0 0 14px',letterSpacing:'-0.5px'}}>Choose Your AI Tax Intelligence Level</h2>
            <p style={{color:'#94A3B8',fontSize:17,maxWidth:520,margin:'0 auto',lineHeight:1.6}}>Every plan includes a 7-day free trial. No credit card charged until trial ends.</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24,alignItems:'start'}}>
            {TIERS.map(tier=>(
              <div key={tier.n} style={{background:tier.bg,border:`2px solid ${tier.border}`,borderRadius:18,padding:'32px 28px',position:'relative',boxShadow:tier.n==='FULL TAX INTELLIGENCE'?'0 8px 40px rgba(37,99,235,0.3)':'none'}}>
                {tier.badge&&(<div style={{position:'absolute',top:-14,left:'50%',transform:'translateX(-50%)',background:B,color:'#fff',fontSize:11,fontWeight:700,padding:'5px 18px',borderRadius:20,whiteSpace:'nowrap'}}>{tier.badge}</div>)}
                <div style={{fontSize:11,fontWeight:700,color:tier.n==='FULL TAX INTELLIGENCE'?'#93C5FD':'#64748B',letterSpacing:'1.5px',marginBottom:10}}>{tier.n}</div>
                <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:8}}>
                  <span style={{fontSize:52,fontWeight:900,color:tier.n==='FULL TAX INTELLIGENCE'?'#fff':N,letterSpacing:'-2px'}}>{tier.p}</span>
                  <span style={{color:tier.n==='FULL TAX INTELLIGENCE'?'#94A3B8':'#64748B',fontSize:15}}>{tier.period}</span>
                </div>
                <div style={{display:'inline-block',background:tier.n==='FULL TAX INTELLIGENCE'?'rgba(37,99,235,0.3)':B+'18',color:tier.n==='FULL TAX INTELLIGENCE'?'#93C5FD':B,fontSize:12,fontWeight:700,padding:'4px 14px',borderRadius:20,marginBottom:14}}>{tier.label}</div>
                <div style={{color:tier.n==='FULL TAX INTELLIGENCE'?'#CBD5E1':'#475569',fontSize:14,lineHeight:1.6,marginBottom:22}}>{tier.desc}</div>
                <button onClick={()=>startCheckout(tier.priceId)} style={{width:'100%',padding:'13px',background:tier.btnBg,color:tier.btnColor,border:'none',borderRadius:10,fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:26}}>Start Free Trial</button>
                <div style={{borderTop:`1px solid ${tier.n==='FULL TAX INTELLIGENCE'?'rgba(255,255,255,0.1)':'#E2E8F0'}`,paddingTop:22}}>
                  {tier.features.map((f,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:11}}>
                      <span style={{color:i===0&&f.includes('Everything')?'#64748B':'#10B981',fontSize:13,fontWeight:600,flexShrink:0,marginTop:1}}>{i===0&&f.includes('Everything')?'—':'✓'}</span>
                      <span style={{color:tier.n==='FULL TAX INTELLIGENCE'?i===0&&f.includes('Everything')?'#94A3B8':'#E2E8F0':i===0&&f.includes('Everything')?'#64748B':N,fontSize:13,lineHeight:1.5,fontWeight:i===0&&f.includes('Everything')?600:400}}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BOTTOM CTA */}
      <div style={{background:'linear-gradient(135deg,#1E3A8A 0%,#1D4ED8 100%)',padding:'80px 40px',textAlign:'center'}}>
        <div style={{background:'#F8FAFC',padding:'72px 24px'}}>
  <div style={{maxWidth:800,margin:'0 auto'}}>
    <p style={{textAlign:'center',color:B,fontWeight:700,fontSize:12,letterSpacing:'0.1em',textTransform:'uppercase',margin:'0 0 8px'}}>Got Questions?</p>
    <h2 style={{textAlign:'center',fontSize:36,fontWeight:900,color:N,margin:'0 0 8px'}}>Frequently Asked Questions</h2>
    <p style={{textAlign:'center',color:SL,fontSize:16,margin:'0 0 48px'}}>Everything you need to know about TaxStat360.</p>
    {[
      {q:'Is TaxStat360 a tax filing service?',a:'No. TaxStat360 is an AI-powered tax intelligence platform, not a tax filing service. We help you understand your IRS risk, surface savings opportunities, and stay compliant year-round. You still work with your CPA to file returns, but you arrive prepared with audit-ready documentation and identified savings they can act on immediately.'},
      {q:'Who is TaxStat360 designed for?',a:'TaxStat360 is built for every business entity type — S-Corporations, Multi-Member LLCs, Partnerships, Sole Proprietors, and Single-Member LLCs. Whether you file Schedule C, Schedule E, or K-1s, our AI maps your specific tax obligations, identifies your risk profile, and surfaces savings opportunities unique to your entity structure.'},
      {q:'How is TaxStat360 different from TurboTax or QuickBooks?',a:'TurboTax and QuickBooks help you record what happened. TaxStat360 tells you what is about to happen — identifying risk flags, compliance gaps, and savings opportunities before they become costly problems. Our platform is built on real IRS audit methodology, not generic financial software logic.'},
      {q:'How much can I actually save?',a:'Most users identify $8,000 or more in savings opportunities in their first analysis. This includes missed deductions, misclassified expenses, entity structure inefficiencies, and salary optimization specific to their entity type. Results vary by business size and complexity.'},
      {q:'Is my financial data secure?',a:'Yes. Your data is encrypted in transit and at rest using industry-standard protocols on AWS infrastructure. We do not sell your data to third parties under any circumstances. See our Privacy Policy for full details.'},
      {q:'What happens after the 7-day free trial?',a:"After your trial ends, you'll be billed monthly for your chosen plan. You can cancel any time before the trial ends with no charge whatsoever. We send a reminder email before your trial concludes."},
      {q:'Do I need to connect my bank account?',a:'No integrations are required to get started. You enter your business data through our onboarding flow. Accounting software integrations are on our roadmap for future releases.'},
      {q:'Can I share TaxStat360 reports with my CPA?',a:'Yes. Every plan includes the ability to export compliance reports and AI-generated documentation in CPA-friendly formats. The Full Tax Intelligence and Enterprise Defense plans include the One-Click CPA Export Pack for seamless collaboration.'},
    ].map((item,i)=>(<FAQ key={i} q={item.q} a={item.a}/>))}
  </div>
</div>
<div style={{maxWidth:700,margin:'0 auto'}}>
          <h2 style={{color:'#fff',fontSize:42,fontWeight:900,margin:'0 0 16px',letterSpacing:'-0.5px'}}>Ready to stop overpaying?</h2>
          <p style={{color:'#BFDBFE',fontSize:18,margin:'0 0 36px',lineHeight:1.6}}>Join business owners who've already found thousands in savings and sleep better knowing their IRS risk is under control.</p>
          <button onClick={()=>nav('/signup')} style={{padding:'18px 52px',background:'#fff',color:B,border:'none',borderRadius:12,fontWeight:800,fontSize:18,cursor:'pointer',boxShadow:'0 4px 24px rgba(0,0,0,0.2)'}}>Start Your Free Trial →</button>
          <p style={{color:'#93C5FD',fontSize:13,marginTop:16}}>7 days free · No credit card until trial ends · Cancel anytime</p>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{background:'#060F1e',padding:'28px 40px',textAlign:'center'}}>
        <p style={{color:'#475569',fontSize:13,margin:0}}><div style={{display:'flex',gap:20,marginBottom:8,justifyContent:'center',flexWrap:'wrap'}}>
          <a href='/about' style={{color:'#64748B',fontSize:12,textDecoration:'none'}}>About</a>
          <a href='/privacy' style={{color:'#64748B',fontSize:12,textDecoration:'none'}}>Privacy Policy</a>
          <a href='/terms' style={{color:'#64748B',fontSize:12,textDecoration:'none'}}>Terms of Service</a>
          <a href='mailto:support@taxstat360.com' style={{color:'#64748B',fontSize:12,textDecoration:'none'}}>Contact</a>
        </div>
        © 2026 TaxStat360 · Powered by Former IRS Professionals · <span style={{color:B,cursor:'pointer'}} onClick={()=>nav('/login')}>Sign In</span></p>
      </div>
    </div>
  )
}
