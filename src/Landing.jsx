import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const N='#0D1B3E', B='#2563EB', SL='#475569'

// Your Mailchimp form action URL — paste yours here
const MAILCHIMP_URL = 'https://themoneynista.us4.list-manage.com/subscribe/post'
// Your YouTube video ID — paste yours after the = sign
const YOUTUBE_VIDEO_ID = 'ataA4nELR_U'

export default function Landing() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [subStatus, setSubStatus] = useState('')

  const handleSubscribe = (e) => {
    e.preventDefault()
    if (!email) return
    setSubStatus('pending')
    // Mailchimp JSONP - bypasses CORS
    const callbackName = 'mc_callback_' + Date.now()
    window[callbackName] = (data) => {
      if (data.result === 'success') setSubStatus('success')
      else setSubStatus('error')
      delete window[callbackName]
      document.body.removeChild(script)
    }
    const params = new URLSearchParams({
      u: 'f8bbe8c960a3c7bae19433b3e',
      id: '244ef2b8b6',
      f_id: '00cd07e9f0',
      EMAIL: email,
      'b_f8bbe8c960a3c7bae19433b3e_244ef2b8b6': '',
      c: callbackName,
    })
    const script = document.createElement('script')
    script.src = MAILCHIMP_URL + '?' + params.toString()
    script.onerror = () => { setSubStatus('error') }
    document.body.appendChild(script)
  }

  return (
    <div style={{fontFamily:'Inter,sans-serif', minHeight:'100vh', background:'#F0F4FF'}}>

      {/* NAV */}
      <nav style={{background:'#fff', borderBottom:'1px solid #E2E8F0', padding:'0 40px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,letterSpacing:'-0.3px',borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>
        <div style={{display:'flex', gap:12}}>
          <button onClick={()=>nav('/login')} style={{padding:'8px 20px', border:'1px solid #E2E8F0', borderRadius:8, background:'#fff', fontWeight:600, fontSize:14, cursor:'pointer', color:N}}>Sign In</button>
          <button onClick={()=>nav('/signup')} style={{padding:'8px 20px', background:B, color:'#fff', border:'none', borderRadius:8, fontWeight:600, fontSize:14, cursor:'pointer'}}>Get Started Free</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={{textAlign:'center', padding:'72px 24px 48px'}}>
        <div style={{display:'inline-block', background:'#EFF6FF', color:B, fontSize:12, fontWeight:700, letterSpacing:1.5, padding:'6px 16px', borderRadius:20, marginBottom:20}}>BUILT BY A FORMER IRS REVENUE AGENT</div>
        <h1 style={{fontSize:52, fontWeight:800, color:N, margin:'0 0 8px', lineHeight:1.15}}>Your Tax Strategy,</h1>
        <h1 style={{fontSize:52, fontWeight:800, color:B, margin:'0 0 20px', lineHeight:1.15}}>Powered by Intelligence</h1>
        <p style={{color:SL, fontSize:18, marginBottom:36, maxWidth:600, margin:'0 auto 36px'}}>TaxStat360 analyzes your financial data and delivers AI-powered tax strategies for S-Corps, Multi-Member LLCs, and Partnerships.</p>
        <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
          <button onClick={()=>nav('/signup')} style={{padding:'14px 32px', background:B, color:'#fff', border:'none', borderRadius:10, fontWeight:700, fontSize:16, cursor:'pointer'}}>Get Started Free →</button>
          <button onClick={()=>nav('/login')} style={{padding:'14px 32px', background:'#fff', color:N, border:'1px solid #E2E8F0', borderRadius:10, fontWeight:700, fontSize:16, cursor:'pointer'}}>Sign In</button>
        </div>
      </div>

      {/* VIDEO SECTION */}
      <div style={{maxWidth:860, margin:'0 auto 64px', padding:'0 24px'}}>
        <div style={{background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 4px 24px rgba(37,99,235,0.10)', border:'1px solid #E2E8F0'}}>
          <div style={{background:N, padding:'14px 24px', display:'flex', alignItems:'center', gap:8}}>
            <div style={{width:12, height:12, borderRadius:'50%', background:'#ef4444'}}/>
            <div style={{width:12, height:12, borderRadius:'50%', background:'#f59e0b'}}/>
            <div style={{width:12, height:12, borderRadius:'50%', background:'#10b981'}}/>
            <span style={{color:'#94a3b8', fontSize:13, marginLeft:8}}>TaxStat360 — Platform Overview</span>
          </div>
          <div style={{position:'relative', paddingBottom:'56.25%', height:0}}>
            <iframe
              src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?rel=0&modestbranding=1`}
              title="TaxStat360 Overview"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{position:'absolute', top:0, left:0, width:'100%', height:'100%'}}
            />
          </div>
        </div>
        <p style={{textAlign:'center', color:SL, fontSize:13, marginTop:12}}>Watch how TaxStat360 calculates your K-1 income and generates AI-powered tax strategies in minutes.</p>
      </div>

      {/* FEATURES */}
      <div style={{maxWidth:1100, margin:'0 auto 64px', padding:'0 24px'}}>
        <h2 style={{textAlign:'center', fontSize:32, fontWeight:800, color:N, marginBottom:8}}>Everything you need to optimize your taxes</h2>
        <p style={{textAlign:'center', color:SL, marginBottom:40}}>Built specifically for business owners with pass-through income.</p>
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24}}>
          {[
            {icon:'📊', title:'K-1 Auto-Calculator', desc:'Enter your gross revenue, expenses, officer salary, and depreciation. K-1 flows automatically to Schedule E on Form 1040.'},
            {icon:'🤖', title:'AI Tax Analysis', desc:'Get personalized recommendations, audit risk scoring, and 3 savings scenarios — increase deductions, optimize salary, max Section 179.'},
            {icon:'🔗', title:'Accounting Integrations', desc:'Connect QuickBooks, Xero, Wave, or FreshBooks to auto-import your P&L, balance sheet, and transactions.'},
          ].map(f=>(
            <div key={f.title} style={{background:'#fff', borderRadius:12, padding:28, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', border:'1px solid #E2E8F0'}}>
              <div style={{fontSize:32, marginBottom:12}}>{f.icon}</div>
              <div style={{fontWeight:700, color:N, fontSize:16, marginBottom:8}}>{f.title}</div>
              <div style={{color:SL, fontSize:14, lineHeight:1.6}}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* EMAIL CAPTURE — MAILCHIMP */}
      <div style={{background:N, padding:'56px 24px', textAlign:'center', marginBottom:0}}>
        <h2 style={{color:'#fff', fontSize:30, fontWeight:800, marginBottom:8}}>Get free tax-saving tips for S-Corp owners</h2>
        <p style={{color:'#94a3b8', marginBottom:28, fontSize:15}}>Join 2,000+ business owners getting weekly strategies from a former IRS Revenue Agent.</p>
        <form onSubmit={handleSubscribe} style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', maxWidth:500, margin:'0 auto'}}>
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="Enter your email address"
            required
            style={{flex:1, minWidth:220, padding:'13px 18px', borderRadius:8, border:'none', fontSize:15, outline:'none'}}
          />
          <button type="submit" style={{padding:'13px 24px', background:B, color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:15, cursor:'pointer', whiteSpace:'nowrap'}}>
            {subStatus==='pending' ? 'Subscribing...' : 'Get Free Tips →'}
          </button>
        </form>
        {subStatus==='success' && <p style={{color:'#34d399', marginTop:16, fontWeight:600}}>✓ You're in! Check your inbox.</p>}
        {subStatus==='error' && <p style={{color:'#f87171', marginTop:16}}>Something went wrong — try again.</p>}
        <p style={{color:'#64748b', fontSize:12, marginTop:16}}>No spam. Unsubscribe anytime.</p>
      </div>

      {/* FOOTER */}
      <div style={{background:'#0a1628', padding:'24px', textAlign:'center'}}>
        <p style={{color:'#475569', fontSize:13}}>© 2025 TaxStat360 · MoneyMasters Academy · Built by a former IRS Revenue Agent</p>
      </div>
    </div>
  )
}
