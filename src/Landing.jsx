import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'
import Icon from './Icon'
import { INTEGRATIONS, CTA_LABEL, CTA_COPY_FULL, CTA_COPY_SHORT, DISCLAIMER_SHORT } from './constants'
import './Landing.css'

const N = '#0D1B3E'
const B = '#2563EB'

const EYEBROW = {
  fontSize: 12,
  fontWeight: 700,
  color: B,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  marginBottom: 10,
}

// CTA copy (label + trial microcopy) is centralized in constants.js as the single
// source of truth — CTA_LABEL, CTA_COPY_FULL, CTA_COPY_SHORT are imported above.
// The FTC/ROSCA rationale for the exact wording (why it must say "Card required" +
// "No charge during your 7-day trial" and must NOT be softened to "card for
// verification only") lives in constants.js. Do NOT reintroduce local copies here:
// the whole point of centralizing was to stop these strings drifting between
// Landing, About, Nav, Terms, and ResourcesHub.

// #1 FIX: Credential claim now reflects the founder's actual, substantiated credential —
// a seasoned tax strategist who is an Enrolled Agent and a former IRS Revenue Agent.
// This replaces the prior unsubstantiated plural framing ("a dedicated team of former
// IRS agents", "built by former IRS Revenue Agents"). CREDENTIAL is the full statement;
// CREDENTIAL_SHORT is the compact form used in the small hero trust-badge pill.
const CREDENTIAL       = 'Built by a Seasoned Tax Strategist, Enrolled Agent and Former IRS Revenue Agent'
const CREDENTIAL_SHORT = 'Enrolled Agent & Former IRS Revenue Agent'

// #7 FIX: The site navigation was extracted into a shared <Nav> component
// (src/Nav.jsx) so Landing, About, Privacy, Terms, and Resources all render the
// same nav instead of each maintaining its own copy. Import it above and render
// <Nav nav={nav} /> below.

export default function Landing() {
  const nav = useNavigate()
  const [billing, setBilling] = useState('monthly')
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [contactName, setContactName]       = useState('')
  const [contactEmail, setContactEmail]     = useState('')
  const [contactMsg, setContactMsg]         = useState('')
  // F-05 FIX: Added inquiry type dropdown to contact form.
  // Feeds into web3forms subject line for easier triage.
  const [contactType, setContactType]       = useState('General Question')
  const [contactSent, setContactSent]       = useState(false)
  const [contactSending, setContactSending] = useState(false)
  const [contactErr, setContactErr]         = useState('')

  const handleContact = async (e) => {
    e.preventDefault()
    // #5 FIX: honeypot spam trap. Humans never see/fill the hidden "botcheck" field;
    // bots auto-fill every field. If it has a value, silently accept and drop.
    if (e.target && e.target.elements && e.target.elements.botcheck && e.target.elements.botcheck.value) {
      setContactSent(true)
      return
    }
    const _emailRgx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!contactName || !contactName.trim())                   { setContactErr('Please enter your full name.'); return }
    if (!contactEmail || !_emailRgx.test(contactEmail.trim())) { setContactErr('Please enter a valid email address.'); return }
    if (!contactMsg || !contactMsg.trim())                     { setContactErr('Please describe how we can help.'); return }
    setContactErr('')
    setContactSending(true)
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ADD-01 FIX: Web3Forms key moved to env var with hardcode fallback.
          access_key: import.meta.env.VITE_WEB3FORMS_KEY || '0dfbc9fa-5311-4762-bdee-99e4221561ed',
          // F-05 FIX: Subject line now includes inquiry type for triage.
          subject:   `TaxStat360 [${contactType}] — ${contactName}`,
          from_name:  contactName,
          email:      contactEmail,
          message:    contactMsg,
        })
      })
      if (res.ok) { setContactSent(true); setContactName(''); setContactEmail(''); setContactMsg(''); setContactType('General Question') }
      else throw new Error()
    } catch {
      window.location.href = 'mailto:support@taxstat360.com?subject=' +
        encodeURIComponent(`[${contactType}] Contact from ${contactName}`) + '&body=' +
        encodeURIComponent(contactMsg + '\n\nFrom: ' + contactEmail)
      setContactSent(true)
    }
    setContactSending(false)
  }

  const isAnnual = billing === 'annual'

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: N, background: '#fff', paddingTop: 64 }}>
      <Nav nav={nav} />

      {/* ─── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ background: 'linear-gradient(135deg, #EEF4FF 0%, #F0F9FF 100%)', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #dde6f0', borderRadius: 100, padding: '8px 18px', fontSize: 15, fontWeight: 700, letterSpacing: 1.5, color: N, marginBottom: 32, textTransform: 'uppercase' }}>
          <span style={{ color: B }}>&#10003;</span> No More April Surprises
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.15, margin: '0 auto 24px', maxWidth: 700, color: N }}>
          See What You&apos;re On Track to Owe the IRS&nbsp;&mdash;<br />Right Now, Not in April.
        </h1>
        <p style={{ fontSize: 15, color: '#475569', maxWidth: 620, margin: '0 auto 24px', lineHeight: 1.7 }}>
          Most S-Corp owners and self-employed business owners write massive checks to the IRS every April&nbsp;&mdash; and had no idea it was coming. TaxStat360 shows you your estimated federal tax liability every single day, so you can make moves while there&apos;s still time to make them.
        </p>
        {/* UX-1.2: IRS credential trust badge — moved into hero for immediate credibility.
            #1 FIX: now states the founder's substantiated credential (EA + former IRS Revenue Agent). */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 32, background: '#fff', border: '1.5px solid #dde6f0', borderRadius: 100, padding: '7px 18px' }}>
          <Icon name="institution" size={16} color={N} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{CREDENTIAL_SHORT}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          <button onClick={() => nav('/signup')} style={{ background: N, color: '#fff', border: 'none', borderRadius: 10, padding: '16px 32px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{CTA_LABEL}</button>
          <button onClick={() => nav('/login')}  style={{ background: '#fff', color: N, border: '2px solid ' + N, borderRadius: 10, padding: '16px 32px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Sign In to Your Account</button>
        </div>
        {/* CTA_COPY_FULL: "Card required" + "No charge during your 7-day trial" — accurate up-front trial disclosure */}
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>{CTA_COPY_FULL}</p>

        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Integrates with</span>
          {INTEGRATIONS.map((integ) => (
            <div key={integ.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: integ.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{integ.abbr}</div>
              <span style={{ fontSize: 14, fontWeight: 600, color: N }}>{integ.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#dcfce7', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.03em' }}>Available</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Don&apos;t use accounting software? Enter your numbers manually — it takes under 2 minutes.</p>
      </section>

      {/* ─── VIDEO ────────────────────────────────────────────────────────────── */}
      <section style={{ background: N, padding: '28px 24px', textAlign: 'center' }}>
        <p style={{ ...EYEBROW, color: '#93b4d4' }}>Product Demo</p>
        <h2 style={{ color: '#fff', fontSize: 26, fontWeight: 800, marginBottom: 8 }}>See Strategic Tax Planning in Action</h2>
        <p style={{ color: '#93b4d4', fontSize: 13, marginBottom: 16 }}>Watch how successful business owners use year-round tax intelligence to make wealth-building decisions every month</p>
        <div style={{ maxWidth: 900, margin: '0 auto', borderRadius: 12, overflow: 'hidden', position: 'relative', aspectRatio: '16/9' }}>
          <iframe
            src="https://player.vimeo.com/video/1185021252?autoplay=0&title=0&byline=0&portrait=0"
            title="TaxStat360 Product Demo"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </section>

      {/* ─── IRS CREDENTIALING ────────────────────────────────────────────────── */}
      <section style={{ padding: '32px 24px', textAlign: 'center', background: '#fff' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: N, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 32 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.5 9H20L14.5 13L16.5 20L12 16L7.5 20L9.5 13L4 9H10.5L12 2Z" fill="white"/></svg>
        </div>
        {/* #1 FIX: singular, substantiated credential replaces "Dedicated Team of Former IRS Agents". */}
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>{CREDENTIAL}</h2>
        <p style={{ fontSize: 13, color: '#475569', maxWidth: 680, margin: '0 auto 24px', lineHeight: 1.7 }}>
          TaxStat360 was built by a seasoned tax strategist &mdash; an Enrolled Agent and former IRS Revenue Agent &mdash; who spent years inside the IRS understanding exactly what triggers audits and how to stay compliant. That firsthand experience is built into the platform&apos;s automated tax calculations, AI-powered risk alerts, and audit scenario analysis &mdash; purpose-built for business owners.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => nav('/signup')} style={{ background: N, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            {CTA_LABEL} →
          </button>
          {/* #2 FIX: relabeled "Meet Our Team →" to "About →" — the destination /about is the
              About page (a single-founder story), not a multi-person team roster. */}
          <button onClick={() => nav('/about')} style={{ background: 'transparent', color: B, border: '2px solid ' + B, borderRadius: 8, padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            About →
          </button>
        </div>
      </section>

      {/* ─── ENTITY FEATURES ──────────────────────────────────────────────────── */}
      <section style={{ padding: '32px 24px', background: '#fff', textAlign: 'center' }}>
        <p style={EYEBROW}>Built for Every Structure</p>
        <h2 id="features" style={{ scrollMarginTop: 72, fontSize: 26, fontWeight: 800, marginBottom: 12 }}>Built to Build Wealth &mdash; No Matter Your Entity Structure</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>S-Corp, LLC, Partnership, Sole Prop &mdash; every structure has legal strategies to reduce what you owe.</p>
        {/* UX-08: Federal-only scope stated clearly at the top of the features section */}
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>Covers federal tax only. State taxes are not included.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, maxWidth: 1000, margin: '0 auto' }}>
          {[
            { icon: 'office', label: 'K-1',
              title: 'S-Corporations',
              desc: 'Officer W-2 salary, K-1 distributions, and SE tax savings on distributions all calculated instantly. See exactly how your salary-to-distribution split affects your estimated federal tax liability.' },
            { icon: 'partners', label: 'K-1',
              title: 'Partnerships and Multi-Member LLCs',
              desc: "Each partner's distributive share calculated separately. K-1 flows directly into your personal tax calculation." },
            { icon: 'document', label: 'Schedule C',
              title: 'Sole Proprietors and SMLLCs',
              desc: 'Self-employment tax, QBI deduction, estimated quarterly payments all calculated and updated with every transaction.' },
            { icon: 'home', label: 'Schedule E',
              title: 'Real Estate Investors',
              desc: 'Rental income, depreciation schedule, and passive losses all factored in. Schedule E flows directly into your personal tax calculation.' },
            { icon: 'briefcase', label: 'Combined',
              title: 'W-2 Plus Business Owner',
              desc: 'Have a day job and a business? We combine all income sources for your complete tax picture.' },
            { icon: 'layers', label: 'Multi',
              title: 'Multiple Entities',
              desc: 'Run multiple businesses? Our Enterprise plan tracks each entity and shows your consolidated federal tax exposure across all of them in one view.' },
          ].map((e, i) => (
            <div
              key={i}
              onClick={() => setSelectedEntity(selectedEntity === i ? null : i)}
              style={{
                background: selectedEntity === i ? '#EFF6FF' : '#F8FAFC',
                borderRadius: 16, padding: 28, textAlign: 'left',
                border: selectedEntity === i ? '2px solid ' + B : '1px solid #e2e8f0',
                boxShadow: selectedEntity === i ? '0 4px 16px rgba(37,99,235,0.12)' : '0 2px 8px rgba(0,0,0,0.04)',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <Icon name={e.icon} size={32} color={N} />
                <span style={{ background: selectedEntity === i ? B : N, color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{e.label}</span>
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{e.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>{e.desc}</p>
              {selectedEntity === i && (
                <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: B }}>✓ Selected — {e.title}</div>
              )}
            </div>
          ))}
        </div>
        {/* UX-1.3: Contextual CTA appears when user selects their entity type */}
        {selectedEntity !== null && (() => {
          const e = [
            { icon: 'office', title: 'S-Corp Owner' },
            { icon: 'partners', title: 'Partnership / LLC Owner' },
            { icon: 'document', title: 'Sole Proprietor' },
            { icon: 'home', title: 'Real Estate Investor' },
            { icon: 'briefcase', title: 'W-2 + Business Owner' },
            { icon: 'layers', title: 'Multi-Entity Operator' },
          ][selectedEntity]
          return (
            <div style={{ marginTop: 24, padding: '20px 28px', background: '#EFF6FF', border: '1.5px solid ' + B, borderRadius: 14, maxWidth: 540, margin: '24px auto 0', textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}><Icon name={e.icon} size={28} color={N} /></div>
              <div style={{ fontWeight: 700, fontSize: 15, color: N, marginBottom: 6 }}>
                Start tracking your taxes as a {e.title}
              </div>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>
                TaxStat360 is built for your structure. See your federal tax liability in minutes.
              </div>
              <button
                onClick={() => nav('/signup')}
                style={{ background: N, color: '#fff', border: 'none', borderRadius: 10, padding: '13px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                {CTA_LABEL} as {e.title} →
              </button>
            </div>
          )
        })()}
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '32px 24px', textAlign: 'center', background: '#F8FAFC' }}>
        <p style={EYEBROW}>Simple Setup</p>
        <h2 id="how-it-works" style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, scrollMarginTop: 72 }}>Your estimated tax liability in 3 steps</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 20 }}>From connected to calculated in under 5 minutes</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 900, margin: '0 auto' }}>
          {[
            { n: '01', title: 'Connect your software — or enter manually',
              desc: 'Link QuickBooks, Xero, Wave, or FreshBooks to pull your income and expense totals automatically. Prefer not to connect? Enter your revenue and expenses directly — it takes under 2 minutes.' },
            { n: '02', title: 'Enter your personal info',
              desc: 'Filing status, any W-2 income, dependents. For K-1 entities we auto-apply your ownership percentage and flow income to your 1040.' },
            { n: '03', title: 'See your estimated federal tax liability',
              desc: 'Complete estimated federal tax liability, quarterly payments, QBI deduction savings, and K-1 breakdown update instantly as you enter numbers. Sync your accounting software anytime with one click to pull the latest data.' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid ' + N, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 15, fontWeight: 700, color: N }}>{s.n}</div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────────────────── */}
      <section style={{ padding: '32px 24px', background: '#fff', textAlign: 'center' }}>
        <p style={EYEBROW}>Common Questions</p>
        <h2 id="faq" style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, scrollMarginTop: 72 }}>Frequently Asked Questions</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>Everything you need to know before getting started</p>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'left' }}>
          {[
            { q: 'Do I need a CPA — and does TaxStat360 replace one?',
              a: "You don't need a CPA to use TaxStat360 — it's built for business owners, not accountants. You connect your accounting software (or enter your numbers manually), answer a few questions about your filing situation, and the platform handles the calculations. But it isn't a replacement for your CPA, and we don't try to be one: TaxStat360 is a tax planning and estimation tool, not a tax filing service. Think of it as the same year-round visibility your CPA has, available to you 365 days a year. Many users share their TaxStat360 dashboard with their CPA to make that relationship more productive — which is why many CPAs like it too." },
            { q: 'How accurate are the tax calculations?',
              // UX-09 FIX: Added explicit mention of the tax year selector — users choose
              // their applicable year from a dropdown and all IRS rates/brackets update
              // automatically. Previously the answer said "updated every tax year" without
              // explaining the year-selection mechanic or who controls it.
              // UX-08 FIX: Added explicit "federal tax only — state taxes are not included"
              // statement so users understand the scope of what is calculated.
              a: 'TaxStat360 uses IRS-published tax rates, brackets, and rules for the tax year you select — choose your applicable year from the year dropdown in the Tax Tracker (Step 2 of the calculator) and all calculations update automatically to reflect the correct IRS rates for that year. Our calculations cover federal tax only (state taxes are not included) and encompass: federal income tax, self-employment tax, the §199A QBI deduction, estimated quarterly payments (with safe harbor), K-1 passthrough income, the 3.8% Net Investment Income Tax (NIIT), the 0.9% Additional Medicare Tax, and Alternative Minimum Tax (AMT). Results are designed for accurate planning estimates. For your actual filed return, always review with a tax professional.' },
            { q: 'What accounting software does TaxStat360 connect to?',
              a: "TaxStat360 integrates with QuickBooks Online, Xero, Wave, and FreshBooks. Connect your account and we pull your profit and loss totals automatically — no manual data entry needed. If you don't use one of these platforms, or prefer not to connect, you can enter your revenue and expenses directly in the calculator. Manual entry takes under 2 minutes and gives you the same full analysis. More integrations are coming soon." },
            { q: 'Can I use TaxStat360 if I have multiple businesses?',
              a: 'Multiple entities is an Enterprise plan feature. On Enterprise you can track each business separately and see your consolidated federal tax exposure across all of them in one view. The Starter and Professional plans cover a single business entity.' },
            { q: 'Is my financial data secure?',
              a: 'Absolutely. TaxStat360 uses bank-level 256-bit encryption and read-only API connections to your accounting software. We never have access to move or modify your money. Your data is never sold or shared with third parties.' },
            { q: 'What is the 7-day free trial?',
              a: 'You get full access to all features on your selected plan for 7 days, completely free. You will not be charged until your 7-day trial ends. Cancel in one click before day 7 and you will never be billed. A payment method is required to activate your trial.' },
            { q: 'How current is the data I see?',
              a: "Your numbers reflect the data from your last sync. Hit Refresh or Connect to pull the latest data from your accounting software. If you land a big client in October or make a large purchase in November, just sync and your tax picture updates immediately so you can act on it. We don't auto-sync continuously — it's on-demand to keep your data secure and your control absolute." },
          ].map((item, i) => (
            <details key={i} open={i === 0} style={{ borderBottom: '1px solid #e2e8f0', padding: '20px 0' }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: '#0D1B3E', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {item.q}
                <span className="faq-toggle-icon" style={{ flexShrink: 0 }} />
              </summary>
              <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, marginTop: 12, paddingRight: 24 }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ scrollMarginTop: 72, padding: '32px 24px', textAlign: 'center', background: '#F8FAFC' }}>
        <p style={EYEBROW}>Simple, Transparent Pricing</p>
        <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Plans for Every Business</h2>
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 16 }}>{CTA_COPY_SHORT}</p>

        {/* UX-07: Planning-only disclaimer at the top of the pricing section.
            Mirrors the banner shown on /login and /register so users evaluating
            plans see the same scope disclosure before committing. */}
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '12px 20px', maxWidth: 680, margin: '0 auto 24px', fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
{DISCLAIMER_SHORT}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
          <span style={{ fontSize: 14, fontWeight: isAnnual ? 500 : 700, color: isAnnual ? '#64748b' : '#0D1B3E' }}>Monthly</span>
          <div onClick={() => setBilling(isAnnual ? 'monthly' : 'annual')} style={{ width: 50, height: 26, background: isAnnual ? B : '#CBD5E1', borderRadius: 13, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
            <div style={{ position: 'absolute', top: 3, left: isAnnual ? 27 : 3, width: 20, height: 20, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: isAnnual ? 700 : 500, color: isAnnual ? '#0D1B3E' : '#64748b' }}>Annual</span>
          <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>Save 2 months</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, maxWidth: 960, margin: '0 auto' }}>
          {[
            {
              name: 'Starter', price: '$79', annualPrice: '$66', annualTotal: '$790', annualSavings: '$158',
              highlight: false,
              desc: 'Know what you owe — every month, not just in April.',
              features: [
                'Year-round federal tax liability tracker',
                'K-1 income (S-Corps, partnerships, Multi-Member LLCs)',
                'Schedule C (sole props & SMLLCs)',
                'Quarterly estimated payments',
                'Personal tax return (W-2 + business income)',
                '1 accounting software integration',
              ],
            },
            {
              name: 'Professional', price: '$149', annualPrice: '$124', annualTotal: '$1,490', annualSavings: '$298',
              highlight: true,
              desc: 'AI that catches problems before they become expensive mistakes.',
              // #8 FIX: surfaced "Ask Aria" (the in-app AI assistant) in the marketing copy.
              // Previously Aria shipped in the product but was only named in the Privacy Policy.
              // NOTE: placed on Professional+ to match the other AI features. If Aria is actually
              // available on Starter too, move this bullet up to the Starter feature list and to
              // the Starter column in the comparison table below.
              features: [
                'Everything in Starter plus:',
                'Risk Alert Engine',
                'What-If Tax Scenario Simulator',
                'One-Click CPA Export Pack (calculation summary, input assumptions & scenario comparisons — for CPA review)',
                'Explainable AI: Why This Number?',
                'Ask Aria — AI tax assistant',
                'Audit Risk Indicators',
                'Unlimited accounting integrations',
                'Priority support',
              ],
            },
            {
              name: 'Enterprise', price: '$299', annualPrice: '$249', annualTotal: '$2,990', annualSavings: '$598',
              highlight: false,
              desc: 'Built for owners running multiple businesses or entities.',
              // #7 FIX: reworded "IRS response templates" to make clear these are planning /
              // documentation aids, not IRS representation. Keeps the tool on the planning side
              // of its own "not a tax preparation or filing service" disclaimer.
              features: [
                'Everything in Professional plus:',
                'Multi-entity consolidated tax view',
                'Auto-Generated CPA Briefing — planning summary for CPA discussion (not for filing)',
                'Tax Position Documentation & IRS Notice-Response Templates (documentation — not representation)',
              ],
            },
          ].map((p, i) => (
            <div key={i} style={{ borderRadius: 18, padding: '36px 28px', border: p.highlight ? 'none' : '2px solid #e2e8f0', background: p.highlight ? N : '#fff', color: p.highlight ? '#fff' : N, boxShadow: p.highlight ? '0 12px 40px rgba(13,27,62,0.2)' : '0 2px 8px rgba(0,0,0,0.04)', transform: p.highlight ? 'scale(1.04)' : 'none' }}>
              <p style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, color: p.highlight ? '#93b4d4' : '#64748b' }}>{p.name}</p>

              {/* UX-04 FIX: Annual pricing now shows:
                  - The discounted per-month rate (e.g. $66/mo)
                  - A strikethrough of the original monthly price ($79/mo) beside it
                  - The actual annual total billed and the yearly savings amount
                  Previously the toggle just showed the discounted rate with an opacity-dimmed
                  "billed X/yr" line — users had to calculate the savings themselves. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <div style={{ fontSize: 38, fontWeight: 900, lineHeight: 1 }}>
                  {isAnnual ? p.annualPrice : p.price}<span style={{ fontSize: 15, fontWeight: 500 }}>/mo</span>
                </div>
                {isAnnual && (
                  <span style={{ fontSize: 14, color: p.highlight ? 'rgba(147,180,212,0.7)' : '#94a3b8', textDecoration: 'line-through', lineHeight: 1 }}>
                    {p.price}/mo
                  </span>
                )}
              </div>
              {isAnnual && (
                <div style={{ fontSize: 12, color: p.highlight ? '#86efac' : '#16a34a', fontWeight: 600, marginBottom: 8 }}>
                  billed {p.annualTotal}/yr &mdash; save {p.annualSavings}/yr
                </div>
              )}

              <p style={{ fontSize: 14, marginBottom: 24, color: p.highlight ? '#93b4d4' : '#64748b', lineHeight: 1.5 }}>{p.desc}</p>
              <button
                onClick={() => nav('/signup?plan=' + p.name.toLowerCase() + '&billing=' + billing)}
                style={{ width: '100%', padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', border: p.highlight ? '2px solid #fff' : '2px solid ' + N, background: p.highlight ? 'transparent' : N, color: '#fff', marginBottom: 24 }}
              >{CTA_LABEL}</button>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, textAlign: 'left' }}>
                {p.features.map((f, j) => (
                  <li key={j} style={{ fontSize: 13, padding: '7px 0', display: 'flex', alignItems: 'flex-start', gap: 8, color: p.highlight ? '#d1e0f5' : '#475569', borderTop: j === 0 ? 'none' : '1px solid ' + (p.highlight ? 'rgba(255,255,255,0.08)' : '#f1f5f9') }}>
                    <span style={{ color: p.highlight ? '#93b4d4' : B, flexShrink: 0 }}>&#10003;</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 32, fontSize: 13, color: '#94a3b8' }}>7-day free trial on all plans &middot; No charge until trial ends &middot; Cancel in one click</p>
        <p style={{ marginTop: 8, fontSize: 11, color: '#cbd5e1' }}>
          Cancel before day 7 for no charge. No refunds on completed billing periods. Manage or cancel anytime via your account settings.
        </p>

        {/* ─── PLAN COMPARISON TABLE ────────────────────────────────────────── */}
        <div style={{ marginTop: 56, overflowX: 'auto' }}>
          <p style={{ ...EYEBROW, color: B, marginBottom: 12 }}>Full Comparison</p>
          <table style={{ width: '100%', maxWidth: 860, margin: '0 auto', borderCollapse: 'collapse', fontSize: 14, textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 600, borderBottom: '2px solid #e2e8f0', width: '44%' }}></th>
                {[
                  { name: 'Starter', price: '$79', highlight: false },
                  { name: 'Professional', price: '$149', highlight: true },
                  { name: 'Enterprise', price: '$299', highlight: false },
                ].map(plan => (
                  <th key={plan.name} style={{
                    padding: '12px 16px', textAlign: 'center', borderBottom: '2px solid #e2e8f0',
                    background: plan.highlight ? '#eff6ff' : 'transparent',
                    borderRadius: plan.highlight ? '8px 8px 0 0' : 0,
                    color: plan.highlight ? B : N, fontWeight: 700,
                  }}>
                    <div style={{ fontSize: 15 }}>{plan.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 400, color: '#64748b', marginTop: 2 }}>{plan.price}/mo</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { group: 'Tax Calculations', rows: [
                  ['Year-round federal tax liability tracker', true, true, true],
                  ['K-1 income (S-Corps, partnerships, Multi-Member LLCs)', true, true, true],
                  ['Schedule C (sole props & SMLLCs)',       true,  true,  true],
                  ['Quarterly estimated payments',           true,  true,  true],
                  ['Personal tax return (W-2 + business income)', true, true, true],
                  ['Multi-entity consolidated tax view',     false, false, true],
                ]},
                { group: 'AI & Analysis', rows: [
                  ['Risk Alert Engine',                      false, true,  true],
                  ['What-If Tax Scenario Simulator',         false, true,  true],
                  ['Explainable AI: Why This Number?',       false, true,  true],
                  // #8 FIX: Ask Aria added to the comparison table (Professional+). If Aria
                  // ships on Starter too, change this row to [..., true, true, true].
                  ['Ask Aria — AI tax assistant',            false, true,  true],
                  ['Audit Risk Indicators',                  false, true,  true],
                ]},
                { group: 'Integrations', rows: [
                  ['Accounting software integration',         true,  true,  true],
                  ['Unlimited accounting integrations',      false, true,  true],
                ]},
                { group: 'CPA Tools', rows: [
                  ['One-Click CPA Export Pack',              false, true,  true],
                  ['Auto-Generated CPA Briefing',           false, false, true],
                  // #7 FIX: reworded to match the pricing card (documentation, not representation).
                  ['Tax Position Documentation & IRS Notice-Response Templates', false, false, true],
                ]},
                { group: 'Support', rows: [
                  ['Priority support',                       false, true,  true],
                ]},
              ].map(({ group, rows }) => (
                <React.Fragment key={group}>
                  <tr>
                    <td style={{
                      padding: '16px 16px 6px', fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: '#94a3b8', borderTop: '2px solid #f1f5f9',
                    }}>{group}</td>
                    <td style={{ background: 'transparent', borderTop: '2px solid #f1f5f9' }} />
                    <td style={{ background: '#eff6ff', borderTop: '2px solid #dbeafe' }} />
                    <td style={{ background: 'transparent', borderTop: '2px solid #f1f5f9' }} />
                  </tr>
                  {rows.map(([label, s, p, e], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '11px 16px', color: '#374151', fontSize: 13 }}>{label}</td>
                      {[s, p, e].map((val, j) => (
                        <td key={j} style={{
                          padding: '11px 16px', textAlign: 'center',
                          background: j === 1 ? '#eff6ff' : 'transparent',
                          color: val === true ? B : '#cbd5e1',
                          fontWeight: val === true ? 700 : 400,
                          fontSize: val === true ? 16 : 13,
                        }}>
                          {val === true ? '✓' : val === false ? '—' : val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── BOTTOM CTA ───────────────────────────────────────────────────────── */}
      <section style={{ padding: '36px 24px', background: N, textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 16 }}>Stop Discovering Your Tax Bill at Year-End</h2>
        <p style={{ fontSize: 15, color: '#93b4d4', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.6 }}>Join business owners who manage tax liability proactively every month and keep more of what they earn.</p>
        <button onClick={() => nav('/signup')} style={{ background: '#fff', color: N, border: 'none', borderRadius: 10, padding: '18px 40px', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 16 }}>{CTA_LABEL}</button>
        <p style={{ color: '#64748b', fontSize: 13 }}>{CTA_COPY_SHORT}</p>
      </section>

      {/* ─── CONTACT ──────────────────────────────────────────────────────────── */}
      <section id="contact" style={{ background: '#F8FAFC', padding: '80px 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={EYEBROW}>Get In Touch</p>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: N, marginBottom: 12 }}>Contact Us</h2>
            <p style={{ color: '#475569', fontSize: 15 }}>Have a question or need help? We typically respond within one business day.</p>
          </div>
          {contactSent ? (
            <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ marginBottom: 12 }}><Icon name="checkCircle" size={40} color="#059669" /></div>
              <h3 style={{ color: '#065F46', fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Message Sent!</h3>
              <p style={{ color: '#047857', fontSize: 14 }}>Thank you for reaching out. Our team will get back to you at support@taxstat360.com within one business day.</p>
              <button type="button" onClick={() => setContactSent(false)} style={{ marginTop: 16, padding: '8px 20px', background: N, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Send Another Message</button>
            </div>
          ) : (
            // #5 FIX: contact inputs are now wrapped in a semantic <form> with onSubmit, so
            // Enter submits and assistive tech announces it as a form. Inputs carry id + name +
            // required + autoComplete and are tied to <label htmlFor>. A hidden honeypot
            // ("botcheck") traps bots. noValidate lets our custom inline messages drive UX while
            // the required attributes still convey semantics to assistive technology.
            <form onSubmit={handleContact} noValidate style={{ background: '#fff', borderRadius: 16, padding: '40px 36px', boxShadow: '0 4px 24px rgba(0,0,0,0.07)', border: '1px solid #E2E8F0' }}>
              {/* honeypot — visually hidden; never filled by humans */}
              <input
                type="text" name="botcheck" tabIndex={-1} autoComplete="off" aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              />
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="contact-type" style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Inquiry Type</label>
                <select
                  id="contact-type" name="contactType"
                  value={contactType}
                  onChange={e => setContactType(e.target.value)}
                  style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', color: N }}
                >
                  {['General Question', 'Billing & Plans', 'Technical Support', 'Tax Calculation Question', 'Partnership / CPA Inquiry', 'Feature Request'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label htmlFor="contact-name" style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Full Name</label>
                  <input id="contact-name" name="name" required autoComplete="name" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Jane Smith" style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label htmlFor="contact-email" style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Address</label>
                  <input id="contact-email" name="email" type="email" required autoComplete="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="jane@company.com" style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="contact-msg" style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Message</label>
                <textarea id="contact-msg" name="message" required value={contactMsg} onChange={e => setContactMsg(e.target.value)} placeholder="Tell us how we can help..." rows={5} style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              {contactErr && <p role="alert" style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{contactErr}</p>}
              <button type="submit" disabled={contactSending} style={{ width: '100%', padding: '13px', background: contactSending ? '#94a3b8' : N, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: contactSending ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>
                {contactSending ? 'Sending...' : 'Send Message →'}
              </button>
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 12 }}>Or email us directly at <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a></p>
            </form>
          )}
        </div>
      </section>

      {/* ─── FOOTER (shared component — audit Pass 5 consolidation) ─────────────── */}
      <Footer />
    </div>
  )
}
