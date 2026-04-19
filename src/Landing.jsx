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
      </section>


      <section style={{ padding: '32px 24px', background: '#F8FAFC', textAlign: 'center' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Frequently Asked Questions</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Everything you need to know before getting started</p>
        <div id="pricing" style={{ maxWidth: 760, margin: '0 auto', textAlign: 'left' }}>
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
      {/* Footer */}
      <footer style={{ background: '#0D1B3E', color: '#fff', padding: '40px 32px', marginTop: 0 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: '#2563EB', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" fill="white" rx="1"/><rect x="10" y="7" width="4" height="14" fill="white" rx="1"/><rect x="17" y="3" width="4" height="18" fill="white" rx="1"/></svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>TaxStat<span style={{ color: '#2563EB' }}>360</span></span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href="/privacy" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Terms of Service</a>
            <a href="mailto:support@taxstat360.com" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Contact</a>
          </div>
          <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>© {new Date().getFullYear()} TaxStat360. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
