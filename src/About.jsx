import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from './Nav'
import { CTA_LABEL, CTA_COPY_SHORT } from './constants'

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
// source of truth — CTA_LABEL and CTA_COPY_SHORT are imported above. Do NOT reintroduce
// local copies or hardcode the trial line inline: the whole point of centralizing was
// to stop these strings drifting between Landing, About, Nav, Terms, and ResourcesHub.
// (The FTC/ROSCA rationale for the exact wording lives in constants.js.)

// #7 FIX: the page-specific <AboutNav> (which showed "Home" instead of "How It
// Works" and used /features-style links) was removed in favor of the shared
// <Nav> component (src/Nav.jsx), so this page now matches every other page.

// #1 FIX (alignment): About now owns the SAME specific, substantiated credential
// the homepage asserts — an Enrolled Agent and former IRS Revenue Agent — instead
// of softening to passive "deep expertise." Framing is deliberately SINGULAR (one
// founder) and intentionally carries NO name, per owner decision. The claim is
// truthful and substantiable (EA enrollment is verifiable in the IRS directory;
// Revenue Agent tenure is documented in her service record), which is what FTC
// substantiation requires — publishing the name is not required, but the homepage
// and this page MUST tell the same story, and nothing here may imply more than one
// person. The variable below is FOUNDER_EXPERTISE (not TEAM_ROLES) for that reason:
// these are three areas of ONE person's background, not three people.
const FOUNDER_EXPERTISE = [
  {
    icon: '🏛️',
    title: 'IRS Examination Insight',
    desc: 'Built around how the IRS examines businesses, partnerships, and corporations — what examiners look for, how returns are selected for audit, and where the real exposure sits.',
  },
  {
    icon: '📊',
    title: 'Tax Compliance',
    desc: 'Built around tax reporting requirements across S-Corps, partnerships, LLCs, sole proprietorships, and real estate — the exact structures TaxStat360 serves — so every calculation reflects how the IRS actually reads these returns.',
  },
  {
    icon: '⚖️',
    title: 'Proactive Tax Planning',
    desc: 'Focused on legal, proactive strategies to reduce tax liability — not year-end scrambles, but structured decisions made throughout the year, when they still have the power to change the outcome.',
  },
]

const APPROACH = [
  {
    icon: '🎯',
    heading: 'Real-Time Clarity',
    text: 'Most business owners only learn their federal tax liability in April. We give you that number every day of the year — updated as your income and expenses change — so you can act on it while there is still time.',
  },
  {
    icon: '🛡️',
    heading: 'Compliance-First Design',
    text: 'Every calculation is built on IRS-published tax rates and rules, updated for the tax year you select. TaxStat360 is designed around exactly where the IRS draws those lines — to help keep you on the right side of them.',
  },
  {
    icon: '🤝',
    heading: 'CPA-Compatible, Not CPA-Replacing',
    text: 'TaxStat360 is built to make your relationship with your CPA more productive — not to replace it. Our CPA export tools and collaboration portal give you and your advisor the same real-time visibility.',
  },
]

export default function About() {
  const nav = useNavigate()

  // #1 FIX: set the /about <title> to the singular, substantiated credential so it
  // matches the homepage. The audit flagged the old title tag as carrying the plural
  // "former IRS Revenue Agents" wording. Setting it here overrides the global default
  // for this route. NOTE: the default <title> in index.html still needs the same
  // plural→singular correction for any route that does not set its own title.
  useEffect(() => {
    const prev = document.title
    document.title = 'About — Built by a Former IRS Revenue Agent | TaxStat360'
    return () => { document.title = prev }
  }, [])

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: N, background: '#fff', paddingTop: 64 }}>
      <Nav nav={nav} />

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      {/* #1 FIX: hero now leads with the specific, substantiated credential (singular,
          unnamed) to match the homepage, replacing the passive "Built on Deep IRS &
          Tax Expertise" headline that dropped the claim. */}
      <section style={{ background: 'linear-gradient(135deg, #EEF4FF 0%, #F0F9FF 100%)', padding: '80px 24px 64px', textAlign: 'center' }}>
        <p style={EYEBROW}>About TaxStat360</p>
        <h1 style={{ fontSize: 36, fontWeight: 900, lineHeight: 1.15, margin: '0 auto 24px', maxWidth: 740, color: N }}>
          Built by a Former IRS Revenue Agent.<br />Designed for Business Owners.
        </h1>
        <p style={{ fontSize: 15, color: '#475569', maxWidth: 640, margin: '0 auto', lineHeight: 1.8 }}>
          TaxStat360 was built by a seasoned tax strategist — an Enrolled Agent and former IRS Revenue Agent — who spent years inside the IRS understanding exactly what triggers audits and how returns are scrutinized. That firsthand experience is encoded into every calculation: what the IRS looks for, where the real exposure sits, and where legal tax-reduction strategies deliver the most impact.
        </p>
      </section>

      {/* ─── FOUNDER EXPERTISE ────────────────────────────────────────── */}
      <section style={{ padding: '72px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
          <p style={EYEBROW}>The Expertise Behind It</p>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>One Background. Built Into Every Calculation.</h2>
          {/* #1 FIX: intro explicitly attributes this to the single founder and her IRS
              career, so the three cards below read as one person's areas of expertise —
              not as a multi-person team. */}
          <p style={{ fontSize: 14, color: '#475569', maxWidth: 620, margin: '0 auto 52px', lineHeight: 1.7 }}>
            TaxStat360 is built on one person's career: an Enrolled Agent and former IRS Revenue Agent whose work spans the full arc of business tax — how the IRS examines returns, how compliance actually works across entity types, and how proactive planning legally lowers what you owe. All three are built directly into the product.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(272px, 1fr))', gap: 24 }}>
            {FOUNDER_EXPERTISE.map((r, i) => (
              <div key={i} style={{ background: '#F8FAFC', borderRadius: 16, padding: '32px 26px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                <div style={{ fontSize: 38, marginBottom: 18 }}>{r.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: N, marginBottom: 10 }}>{r.title}</h3>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.75, margin: 0 }}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ORIGIN ───────────────────────────────────────────────────── */}
      <section style={{ padding: '72px 24px', background: N }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ ...EYEBROW, color: '#93b4d4' }}>Why We Built This</p>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 28 }}>The Problem We Set Out to Solve</h2>
          <p style={{ fontSize: 15, color: '#93b4d4', lineHeight: 1.85, marginBottom: 20 }}>
            One pattern shows up over and over in business tax: owners who could have legally reduced their liability by tens of thousands of dollars — but didn't — because they had no visibility into what they owed until it was April and too late to act.
          </p>
          <p style={{ fontSize: 15, color: '#93b4d4', lineHeight: 1.85, marginBottom: 20 }}>
            S-Corp salary-to-distribution ratios set incorrectly. QBI deductions missed. Quarterly payments underfunded. Depreciation strategies overlooked. Passive loss rules misapplied. These aren't exotic maneuvers — they're legal planning tools every business owner should be using, month by month, not once a year.
          </p>
          <p style={{ fontSize: 15, color: '#fff', fontWeight: 700, lineHeight: 1.8 }}>
            TaxStat360 exists so that every business owner has the same real-time tax visibility their CPA does — and can make strategic moves before the year is over.
          </p>
        </div>
      </section>

      {/* ─── APPROACH ─────────────────────────────────────────────────── */}
      <section style={{ padding: '72px 24px', background: '#F8FAFC' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
          <p style={EYEBROW}>Our Approach</p>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 52 }}>How We Think About Tax Planning</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(272px, 1fr))', gap: 24 }}>
            {APPROACH.map((a, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '32px 26px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                <div style={{ fontSize: 34, marginBottom: 18 }}>{a.icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: N, marginBottom: 10 }}>{a.heading}</h3>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.75, margin: 0 }}>{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DISCLAIMER ───────────────────────────────────────────────── */}
      <section style={{ padding: '32px 24px', background: '#fff', textAlign: 'center' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '20px 28px' }}>
          <p style={{ fontSize: 13, color: '#92400E', lineHeight: 1.6, margin: 0 }}>
            <strong>Important:</strong> TaxStat360 is a tax planning and estimation tool — not a tax preparation or filing service. Calculations cover federal tax only and are for planning purposes only. Consult a licensed tax professional before making any filing or financial decisions.
          </p>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────── */}
      <section style={{ padding: '72px 24px', background: '#F8FAFC', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: N, marginBottom: 16 }}>Ready to Know What You Owe?</h2>
        <p style={{ fontSize: 14, color: '#475569', maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.7 }}>
          Start your 7-day free trial and see your estimated federal tax liability in under 5 minutes.
        </p>
        <button
          onClick={() => nav('/signup')}
          style={{ background: N, color: '#fff', border: 'none', borderRadius: 10, padding: '16px 40px', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 12 }}
        >
          {CTA_LABEL}
        </button>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>{CTA_COPY_SHORT}</p>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────── */}
      <footer style={{ background: '#0a1628', padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, background: B, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" fill="white" rx="1"/><rect x="10" y="7" width="4" height="14" fill="white" rx="1"/><rect x="17" y="3" width="4" height="18" fill="white" rx="1"/></svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>TaxStat<span style={{ color: B }}>360</span></span>
          </div>
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <a href="/about"   style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>About</a>
            <a href="/privacy" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms"   style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Terms of Service</a>
            <a href="/#contact" style={{ color: '#94a3b8', fontSize: 13, textDecoration: 'none' }}>Contact</a>
          </div>
          <p style={{ color: '#64748b', fontSize: 11, margin: '0 0 8px', lineHeight: 1.5 }}>
            TaxStat360 is a tax planning and estimation tool — not a tax preparation or filing service — for informational purposes only. It is not professional tax, legal, or financial advice. Consult a licensed tax professional before making any filing or financial decisions.
          </p>
          <p style={{ color: '#475569', fontSize: 11, margin: '0 0 8px' }}>
            TaxStat360 LLC &middot; 3065 Daniels Road, Winter Garden, FL 34787 &middot; support@taxstat360.com
          </p>
          <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>© {new Date().getFullYear()} TaxStat360. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
