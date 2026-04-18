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
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <button onClick={() => nav('/login')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 15, color: N }}>Sign In</button>
        <button onClick={() => nav('/signup')} style={{ background: N, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Start Free Trial</button>
      </div>
    </nav>
  )
}

export default function Landing() {
  const nav = useNavigate()

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
        <div style={{ maxWidth: 780, margin: '0 auto', background: '#1a2f5e', borderRadius: 16, padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, cursor: 'pointer' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 28 }}>&#9654;</div>
            <span style={{ color: '#93b4d4', fontSize: 14 }}>Play Video</span>
          </div>
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
          &#10003; IRS-Approved Methodology
        </button>
      </section>

      <section style={{ padding: '32px 24px', background: '#F8FAFC', textAlign: 'center' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>Built to Build Wealth &mdash; No Matter Your Entity Structure</h2>
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
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Your tax bill in 3 steps</h2>
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
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Real Wealth Building Results from Strategic Tax Planning</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Business owners who stopped reacting to taxes and started managing them</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, maxWidth: 1000, margin: '0 auto' }}>
          {[
            { quote: 'TaxStat360 helped me keep an extra $47,000 in working capital this year by showing me exactly when to make strategic moves. My cash flow has never been stronger.', name: 'Sarah Chen', role: 'S-Corp Owner, Marketing Agency' },
            { quote: 'Real-time tax visibility changed everything. Instead of scrambling at year-end, I make informed decisions monthly that compound my wealth over time.', name: 'Marcus Rodriguez', role: 'Multi-Entity Real Estate Investor' },
            { quote: 'The strategic insights are incredible. I saved over $31,000 in taxes last year by timing deductions properly. This is the tool every business owner needs.', name: 'Jennifer Park', role: 'LLC Owner, Consulting Firm' },
          ].map((t,i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ color: '#F59E0B', fontSize: 13, marginBottom: 16 }}>&#9733;&#9733;&#9733;&#9733;&#9733;</div>
              <p style={{ fontSize: 15, color: '#334155', lineHeight: 1.7, fontStyle: 'italic', marginBottom: 20 }}>&ldquo;{t.quote}&rdquo;</p>
              <p style={{ fontWeight: 700, color: N, marginBottom: 4 }}>{t.name}</p>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>{t.role}</p>
            </div>
          ))}
        </div>
      </section>


      <section style={{ padding: '32px 24px', background: '#F8FAFC', textAlign: 'center' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Frequently Asked Questions</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Everything you need to know before getting started</p>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'left' }}>
          {[
            { q: 'Do I need a CPA or accountant to use TaxStat360?', a: 'No. TaxStat360 is built for business owners, not accountants. You connect your accounting software, answer a few questions about your filing situation, and the platform handles all the calculations. That said, many CPAs love TaxStat360 because it saves them time preparing for client meetings.' },
            { q: 'How accurate are the tax calculations?', a: 'TaxStat360 uses IRS-published tax rates, brackets, and rules updated every tax year. Our calculations include federal income tax, self-employment tax, QBI deductions, estimated quarterly payments, and K-1 passthrough income. Results are highly accurate for planning purposes. For your actual filed return, we recommend reviewing with a tax professional.' },
            { q: 'What accounting software does TaxStat360 connect to?', a: 'We currently integrate with QuickBooks Online, Xero, Wave, and FreshBooks. We pull your profit and loss data directly so you never have to manually enter numbers. More integrations are coming soon.' },
            { q: 'Can I use TaxStat360 if I have multiple businesses?', a: 'Yes. The Professional and Enterprise plans support multiple entities. You can connect a separate accounting system for each business and see your consolidated tax exposure across all of them in one view.' },
            { q: 'Is my financial data secure?', a: 'Absolutely. TaxStat360 uses bank-level 256-bit encryption and read-only API connections to your accounting software. We never have access to move or modify your money. Your data is never sold or shared with third parties.' },
            { q: 'What is the 7-day free trial?', a: 'You get full access to all features on your selected plan for 7 days at no charge. No credit card is required to start. At the end of the trial, you can choose to subscribe or your account simply becomes inactive. No surprise charges.' },
            { q: 'What does real-time mean exactly?', a: 'Every time you log in, TaxStat360 syncs with your accounting software and recalculates your estimated tax liability using your most current income and expense data. If you land a big client in October or make a large purchase in November, your tax picture updates immediately so you can act on it.' },
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

      <section style={{ padding: '32px 24px', textAlign: 'center', background: '#fff' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Simple, Transparent Pricing</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Start free. No credit card required. Cancel anytime.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 960, margin: '0 auto' }}>
          {[
            { name:'Starter', price:'$79', highlight:false, desc:'Everything you need to know what you owe right now.', features:['Real-time tax liability calculator','K-1 generation (S-Corps, partnerships, LLCs)','Schedule C (sole props and SMLLCs)','Entity-level tax calculation','Quarterly estimated payments','1 accounting software integration'] },
            { name:'Professional', price:'$149', highlight:true, desc:'AI that watches your numbers and flags problems before they cost you.', features:['Everything in Starter plus:','Real-Time Risk Alert Engine','Explainable AI: Why This Number?','AI Assumption Transparency Panel','Audit Red Flag Detector','Unlimited integrations','Priority support'] },
            { name:'Enterprise', price:'$299', highlight:false, desc:'Multi-entity management, CPA collaboration, and full audit defense.', features:['Everything in Professional plus:','What-If Scenario Simulator','Risk Tolerance Profiling','Industry Benchmark Intelligence','CPA Collaboration Portal','White-label reporting','Dedicated account manager'] },
          ].map((p,i) => (
            <div key={i} style={{ borderRadius: 18, padding: '36px 28px', border: p.highlight ? 'none' : '2px solid #e2e8f0', background: p.highlight ? N : '#fff', color: p.highlight ? '#fff' : N, boxShadow: p.highlight ? '0 12px 40px rgba(13,27,62,0.2)' : '0 2px 8px rgba(0,0,0,0.04)', transform: p.highlight ? 'scale(1.04)' : 'none' }}>
              <p style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, color: p.highlight ? '#93b4d4' : '#64748b' }}>{p.name}</p>
              <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>{p.price}<span style={{ fontSize: 15, fontWeight: 500 }}>/mo</span></div>
              <p style={{ fontSize: 14, marginBottom: 24, color: p.highlight ? '#93b4d4' : '#64748b', lineHeight: 1.5 }}>{p.desc}</p>
              <button onClick={() => nav('/signup')} style={{ width: '100%', padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', border: p.highlight ? '2px solid #fff' : '2px solid ' + N, background: p.highlight ? 'transparent' : N, color: '#fff', marginBottom: 24, textDecoration: 'underline' }}>Start Free Trial</button>
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
        <p style={{ fontSize: 15, color: '#93b4d4', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.6 }}>Join thousands of business owners who manage tax liability proactively every month and keep more of what they earn.</p>
        <button onClick={() => nav('/signup')} style={{ background: '#fff', color: N, border: 'none', borderRadius: 10, padding: '18px 40px', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 16 }}>Start Your Free 7-Day Trial</button>
        <p style={{ color: '#64748b', fontSize: 13 }}>No credit card required &middot; Full access &middot; Cancel anytime</p>
      </section>

      <Aria />
    </div>
  )
}
