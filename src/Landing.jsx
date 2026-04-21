import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Aria from './Aria'
import './Landing.css'

const N = '#0D1B3E'
const B = '#2563EB'

function Nav({ nav }) {
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => nav('/')}>
        <div style={{ width: 32, height: 32, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" fill="white" rx="1"/><rect x="10" y="7" width="4" height="14" fill="white" rx="1"/><rect x="17" y="3" width="4" height="18" fill="white" rx="1"/></svg>
        </div>
        <span style={{ fontWeight: 800, fontSize: 15, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
      </div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <a href="#how-it-works" style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>How It Works</a>
        <a href="#features" style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Features</a>
        <a href="#pricing" style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>Pricing</a>
        <a href="#faq" style={{ fontSize: 14, fontWeight: 500, color: N, textDecoration: 'none', padding: '4px 2px' }}>FAQ</a>
        <button onClick={() => nav('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, color: N }}>Sign In</button>
        <button onClick={() => nav('/signup')} style={{ background: N, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Start Free Trial</button>
      </div>
    </nav>
  )
}

export default function Landing() {
  const nav = useNavigate()
  const [billing, setBilling] = useState('monthly')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMsg, setContactMsg] = useState('')
  const [contactSent, setContactSent] = useState(false)
  const [contactSending, setContactSending] = useState(false)
  const [contactErr, setContactErr] = useState('')
  const handleContact = async (e) => {
    e.preventDefault()
    if (!contactName || !contactEmail || !contactMsg) { setContactErr('Please fill in all fields.'); return }
    setContactSending(true); setContactErr('')
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ access_key:'0dfbc9fa-5311-4762-bdee-99e4221561ed', subject:'TaxStat360 Contact — '+contactName, from_name:contactName, email:contactEmail, message:contactMsg })
      })
      if (res.ok) { setContactSent(true); setContactName(''); setContactEmail(''); setContactMsg('') }
      else throw new Error()
    } catch {
      window.location.href='mailto:support@taxstat360.com?subject='+encodeURIComponent('Contact from '+contactName)+'&body='+encodeURIComponent(contactMsg+'\n\nFrom: '+contactEmail)
      setContactSent(true)
    }
    setContactSending(false)
  }
  const isAnnual = billing === 'annual'
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: N, background: '#fff', paddingTop: 64 }}>
      <Nav nav={nav} />
      <section style={{ background: 'linear-gradient(135deg, #EEF4FF 0%, #F0F9FF 100%)', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #dde6f0', borderRadius: 100, padding: '8px 18px', fontSize: 15, fontWeight: 700, letterSpacing: 1.5, color: N, marginBottom: 32, textTransform: 'uppercase' }}>
          <span style={{ color: B }}>&#10003;</span> Get in Front of Your Largest Expense
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.15, margin: '0 auto 24px', maxWidth: 700, color: N }}>
          Build Wealth by Managing Tax<br />Liability in Real Time.
        </h1>
        <p style={{ fontSize: 15, color: '#475569', maxWidth: 620, margin: '0 auto 40px', lineHeight: 1.7 }}>
          Most business owners discover their tax liability at year-end when it&apos;s too late to optimize. TaxStat360 shows you exactly what you owe every month, so you can make strategic moves that preserve capital and accelerate wealth building.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          <button onClick={() => nav('/signup')} style={{ background: N, color: '#fff', border: 'none', borderRadius: 10, padding: '16px 32px', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Start Free 7-Day Trial</button>
          <button onClick={() => nav('/login')} style={{ background: '#fff', color: N, border: '2px solid ' + N, borderRadius: 10, padding: '16px 32px', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>Already have an account</button>
        </div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>No charge until after 7-day trial &middot; Cancel anytime &middot; No CPA required</p>
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Connects with</span>
          {[['QB','QuickBooks','#2CA01C'],['XE','Xero','#00B9FF'],['WV','Wave','#4BC7AD'],['FB','FreshBooks','#0075DE']].map(([abbr,name,color],i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{abbr}</div>
              <span style={{ fontSize: 14, fontWeight: 600, color: N }}>{name}</span>
            </div>
          ))}
        </div>
      </section>
      <section style={{ background: N, padding: '28px 24px', textAlign: 'center' }}>
        <p style={{ color: '#93b4d4', fontSize: 13, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>See It In Action</p>
        <h2 style={{ color: '#fff', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>See Strategic Tax Management in Action</h2>
        <p style={{ color: '#93b4d4', fontSize: 13, marginBottom: 16 }}>Watch how successful business owners use real-time tax intelligence to make wealth-building decisions every month</p>
        <div style={{ maxWidth: 900, margin: '0 auto', borderRadius: 12, overflow: 'hidden', position: 'relative', paddingTop: '50.625%' }}>
          <iframe src="https://player.vimeo.com/video/1185021252?autoplay=0&title=0&byline=0&portrait=0" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen></iframe>
        </div>
      </section>
      <section style={{ padding: '32px 24px', textAlign: 'center', background: '#fff' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: N, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 32 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.5 9H20L14.5 13L16.5 20L12 16L7.5 20L9.5 13L4 9H10.5L12 2Z" fill="white"/></svg>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>Built by a Former IRS Revenue Agent</h2>
        <p style={{ fontSize: 13, color: '#475569', maxWidth: 680, margin: '0 auto 24px', lineHeight: 1.7 }}>
          TaxStat360 was developed by someone who spent years inside the IRS, understanding exactly what triggers audits and how to stay compliant. This is insider knowledge transformed into AI-powered protection for your business.
        </p>
        <button onClick={() => nav('/signup')} style={{ background: N, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          &#10003; Built on IRS Tax Code Standards
        </button>
      </section>
      <section style={{ padding: '32px 24px', background: '#F8FAFC', textAlign: 'center' }}>
        <h2 id="features" style={{ scrollMarginTop: 72, fontSize: 26, fontWeight: 800, marginBottom: 12 }}>Built to Build Wealth &mdash; No Matter Your Entity Structure</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>S-Corp, LLC, Partnership, Sole Prop &mdash; every structure has legal strategies to reduce what you owe.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, maxWidth: 1000, margin: '0 auto' }}>
          {[
            { icon: '🏢', label: 'K-1', title: 'S-Corporations', desc: 'Officer W-2 salary, K-1 generation, and distributions all flow through to see your real bottom line calculated instantly.' },
            { icon: '🤝', label: 'K-1', title: 'Partnerships and Multi-Member LLCs', desc: "Each partner's distributive share calculated separately. K-1 flows directly into your personal tax calculation." },
            { icon: '📋', label: 'Schedule C', title: 'Sole Proprietors and SMLLCs', desc: 'Self-employment tax, QBI deduction, estimated quarterly payments all calculated and updated with every transaction.' },
            { icon: '💼', label: 'Combined', title: 'W-2 Plus Business Owner', desc: 'Have a day job and a business? We combine all income sources for your complete tax picture.' },
            { icon: '🏗️', label: 'Multi', title: 'Multiple Entities', desc: 'Run multiple businesses? Connect each accounting system and see your consolidated tax exposure.' },
          ].map((e,i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'left', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <span style={{ fontSize: 32 }}>{e.icon}</span>
                <span style={{ background: N, color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{e.label}</span>
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{e.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>{e.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: '32px 24px', textAlign: 'center', background: '#fff' }}>
        <h2 id="how-it-works" style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, scrollMarginTop: 72 }}>Your tax bill in 3 steps</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>From connected to calculated in under 5 minutes</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 900, margin: '0 auto' }}>
          {[
            { n: '01', title: 'Connect your software', desc: 'Link QuickBooks, Xero, Wave, or FreshBooks. We pull your income and expense totals with no sub-accounts, just the numbers that matter.' },
            { n: '02', title: 'Enter your personal info', desc: 'Filing status, any W-2 income, dependents. For K-1 entities we auto-apply your ownership percentage and flow income to your 1040.' },
            { n: '03', title: 'See your real tax bill', desc: 'Complete tax liability, quarterly payments, QBI deduction savings, and K-1 breakdown updated in real time as you adjust numbers.' },
          ].map((s,i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid ' + N, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 15, fontWeight: 700, color: N }}>{s.n}</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section style={{ padding: '32px 24px', background: '#F8FAFC', textAlign: 'center' }}>
        <h2 id="faq" style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, scrollMarginTop: 72 }}>Frequently Asked Questions</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Everything you need to know before getting started</p>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'left' }}>
          {[
            { q: 'Do I need a CPA or accountant to use TaxStat360?', a: 'No. TaxStat360 is built for business owners, not accountants. You connect your accounting software, answer a few questions about your filing situation, and the platform handles all the calculations. That said, many CPAs love TaxStat360 because it saves them time preparing for client meetings.' },
            { q: 'How accurate are the tax calculations?', a: 'TaxStat360 uses IRS-published tax rates, brackets, and rules updated every tax year. Our calculations include federal income tax, self-employment tax, QBI deductions, estimated quarterly payments, and K-1 passthrough income. Results are highly accurate for planning purposes. For your actual filed return, we recommend reviewing with a tax professional.' },
            { q: 'What accounting software does TaxStat360 connect to?', a: 'We currently integrate with QuickBooks Online, Xero, Wave, and FreshBooks. We pull your profit and loss data directly so you never have to manually enter numbers. More integrations are coming soon.' },
            { q: 'Can I use TaxStat360 if I have multiple businesses?', a: 'Yes. The Professional and Enterprise plans support multiple entities. You can connect a separate accounting system for each business and see your consolidated tax exposure across all of them in one view.' },
            { q: 'Is my financial data secure?', a: 'Absolutely. TaxStat360 uses bank-level 256-bit encryption and read-only API connections to your accounting software. We never have access to move or modify your money. Your data is never sold or shared with third parties.' },
            { q: 'What is the 7-day free trial?', a: 'You get full access to all features on your selected plan for 7 days. A credit card is required to start your trial — this is used to set up your subscription. You will not be charged until your 7-day trial ends. Cancel anytime before day 7 and you will never be billed.' },
            { q: 'What does real-time mean exactly?', a: 'TaxStat360 gives you on-demand visibility into your tax liability — not a once-a-year surprise. When you log in, your numbers reflect the data from your last sync. To update your figures, simply hit the Refresh or Connect button to pull the latest data from your accounting software. If you land a big client in October or make a large purchase in November, just sync and your tax picture updates immediately so you can act on it.' },
            { q: 'Does TaxStat360 replace my CPA?', a: 'No, and we do not try to. TaxStat360 is a tax management and planning tool, not a tax filing service. Think of it as giving you the same real-time visibility your CPA has, but available to you 365 days a year. Many of our users share their TaxStat360 dashboard with their CPA to make their relationship more productive.' },
          ].map((item, i) => (
            <details key={i} style={{ borderBottom: '1px solid #e2e8f0', padding: '20px 0' }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: '#0D1B3E', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {item.q}
                <span style={{ fontSize: 13, color: '#2563EB', flexShrink: 0, marginLeft: 16 }}>+</span>
              </summary>
              <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, marginTop: 12, paddingRight: 24 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
      <section id="pricing" style={{ scrollMarginTop: 72, padding: '32px 24px', textAlign: 'center', background: '#fff' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Simple, Transparent Pricing</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Card required — no charge until after your 7-day trial. Cancel anytime.</p>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:28 }}>
          <span style={{ fontSize:14, fontWeight: isAnnual ? 500 : 700, color: isAnnual ? '#64748b' : '#0D1B3E' }}>Monthly</span>
          <div onClick={() => setBilling(isAnnual ? 'monthly' : 'annual')} style={{ width:50, height:26, background: isAnnual ? '#2563EB' : '#CBD5E1', borderRadius:13, cursor:'pointer', position:'relative', transition:'background 0.2s' }}><div style={{ position:'absolute', top:3, left: isAnnual ? 27 : 3, width:20, height:20, background:'#fff', borderRadius:'50%', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} /></div>
          <span style={{ fontSize:14, fontWeight: isAnnual ? 700 : 500, color: isAnnual ? '#0D1B3E' : '#64748b' }}>Annual</span>
          <span style={{ background:'#DCFCE7', color:'#15803D', fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20 }}>Save 2 months</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 960, margin: '0 auto' }}>
          {[
            { name:'Starter', price:'$79', annualPrice:'$66', annualTotal:'$790', highlight:false, desc:'Know exactly what you owe — every month, not just in April.', features:['Real-time tax liability calculator','K-1 income (S-Corps, partnerships, LLCs)','Schedule C (sole props & SMLLCs)','Quarterly estimated payments','Personal tax return (W-2 + business income)','1 accounting software integration'] },
            { name:'Professional', price:'$149', annualPrice:'$124', annualTotal:'$1,490', highlight:true, desc:'AI that catches problems before they become expensive mistakes.', features:['Everything in Starter plus:','Real-Time Risk Alert Engine','What-If Tax Scenario Simulator','One-Click CPA Export Pack','Explainable AI: Why This Number?','Audit Red Flag Detector','Unlimited accounting integrations','Priority support'] },
            { name:'Enterprise', price:'$299', annualPrice:'$249', annualTotal:'$2,990', highlight:false, desc:'Built for owners running multiple businesses or entities.', features:['Everything in Professional plus:','Multi-entity consolidated tax view','AI-Generated Audit Defense Narrative','Risk Tolerance Profiling','CPA Collaboration Portal','Dedicated onboarding & setup call'] },
          ].map((p,i) => (
            <div key={i} style={{ borderRadius: 18, padding: '36px 28px', border: p.highlight ? 'none' : '2px solid #e2e8f0', background: p.highlight ? N : '#fff', color: p.highlight ? '#fff' : N, boxShadow: p.highlight ? '0 12px 40px rgba(13,27,62,0.2)' : '0 2px 8px rgba(0,0,0,0.04)', transform: p.highlight ? 'scale(1.04)' : 'none' }}>
              <p style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, color: p.highlight ? '#93b4d4' : '#64748b' }}>{p.name}</p>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, marginBottom: 2 }}>{isAnnual ? p.annualPrice : p.price}<span style={{ fontSize: 15, fontWeight: 500 }}>/mo</span></div>
              {isAnnual && <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>billed {p.annualTotal}/yr</div>}
              <p style={{ fontSize: 14, marginBottom: 24, color: p.highlight ? '#93b4d4' : '#64748b', lineHeight: 1.5 }}>{p.desc}</p>
              <button onClick={() => nav('/signup?plan='+p.name.toLowerCase()+'&billing='+billing)} style={{ width: '100%', padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', border: p.highlight ? '2px solid #fff' : '2px solid ' + N, background: p.highlight ? 'transparent' : N, color: '#fff', marginBottom: 24, textDecoration: 'underline' }}>Start Free Trial</button>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, textAlign: 'left' }}>
                {p.features.map((f,j) => (
                  <li key={j} style={{ fontSize: 13, padding: '7px 0', display: 'flex', alignItems: 'flex-start', gap: 8, color: p.highlight ? '#d1e0f5' : '#475569', borderTop: j === 0 ? 'none' : '1px solid ' + (p.highlight ? 'rgba(255,255,255,0.08)' : '#f1f5f9') }}>
                    <span style={{ color: p.highlight ? '#93b4d4' : B, flexShrink: 0 }}>&#10003;</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 32, fontSize: 13, color: '#94a3b8' }}>7-day free trial on all plans &middot; No charge until trial ends &middot; Cancel anytime</p>
      </section>
      <section style={{ padding: '36px 24px', background: N, textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 16 }}>Stop Discovering Your Tax Bill at Year-End</h2>
        <p style={{ fontSize: 15, color: '#93b4d4', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.6 }}>Join business owners who manage tax liability proactively every month and keep more of what they earn.</p>
        <button onClick={() => nav('/signup')} style={{ background: '#fff', color: N, border: 'none', borderRadius: 10, padding: '18px 40px', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 16 }}>Start Your Free 7-Day Trial</button>
        <p style={{ color: '#64748b', fontSize: 13 }}>Credit card required &middot; No charge for 7 days &middot; Cancel anytime</p>
      </section>
      <section id="contact" style={{background:'#F8FAFC',padding:'80px 24px'}}>
        <div style={{maxWidth:600,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:40}}>
            <p style={{fontSize:13,fontWeight:700,color:'#2563EB',letterSpacing:2,marginBottom:8,textTransform:'uppercase'}}>Get In Touch</p>
            <h2 style={{fontSize:32,fontWeight:800,color:'#0D1B3E',marginBottom:12}}>Contact Us</h2>
            <p style={{color:'#475569',fontSize:15}}>Have a question or need help? We typically respond within one business day.</p>
          </div>
          {contactSent ? (
            <div style={{background:'#ECFDF5',border:'1px solid #6EE7B7',borderRadius:12,padding:'32px 24px',textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              <h3 style={{color:'#065F46',fontWeight:700,fontSize:20,marginBottom:8}}>Message Sent!</h3>
              <p style={{color:'#047857',fontSize:14}}>Thank you for reaching out. Our team will get back to you at support@taxstat360.com within one business day.</p>
              <button onClick={()=>setContactSent(false)} style={{marginTop:16,padding:'8px 20px',background:'#0D1B3E',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontWeight:600}}>Send Another Message</button>
            </div>
          ) : (
            <div style={{background:'#fff',borderRadius:16,padding:'40px 36px',boxShadow:'0 4px 24px rgba(0,0,0,0.07)',border:'1px solid #E2E8F0'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
                <div>
                  <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:0.5}}>Full Name</label>
                  <input value={contactName} onChange={e=>setContactName(e.target.value)} placeholder="Jane Smith" style={{width:'100%',padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:0.5}}>Email Address</label>
                  <input value={contactEmail} onChange={e=>setContactEmail(e.target.value)} placeholder="jane@company.com" type="email" style={{width:'100%',padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                </div>
              </div>
              <div style={{marginBottom:20}}>
                <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:0.5}}>Message</label>
                <textarea value={contactMsg} onChange={e=>setContactMsg(e.target.value)} placeholder="Tell us how we can help..." rows={5} style={{width:'100%',padding:'11px 14px',border:'1.5px solid #E2E8F0',borderRadius:8,fontSize:14,outline:'none',resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}} />
              </div>
              {contactErr && <p style={{color:'#DC2626',fontSize:13,marginBottom:12}}>{contactErr}</p>}
              <button onClick={handleContact} disabled={contactSending} style={{width:'100%',padding:'13px',background:contactSending?'#94a3b8':'#0D1B3E',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:contactSending?'not-allowed':'pointer',transition:'background 0.2s'}}>
                {contactSending ? 'Sending...' : 'Send Message →'}
              </button>
              <p style={{textAlign:'center',color:'#94a3b8',fontSize:12,marginTop:12}}>Or email us directly at <a href="mailto:support@taxstat360.com" style={{color:'#2563EB'}}>support@taxstat360.com</a></p>
            </div>
          )}
        </div>
      </section>

      <footer style={{ background: '#0a1628', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, background: B, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" fill="white" rx="1"/><rect x="10" y="7" width="4" height="14" fill="white" rx="1"/><rect x="17" y="3" width="4" height="18" fill="white" rx="1"/></svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>TaxStat<span style={{ color: B }}>360</span></span>
          </div>
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <a href="/privacy" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Terms of Service</a>
            <a href="#contact" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Contact</a>
          </div>
          <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>© {new Date().getFullYear()} TaxStat360. All rights reserved.</p>
        </div>
      </footer>
      <Aria />
    </div>
  )
}
