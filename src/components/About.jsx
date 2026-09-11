import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'
import Icon from './Icon'
import { CTA_LABEL, CTA_COPY_SHORT, DISCLAIMER_FULL } from '../lib/constants'
// AUDIT B3/B4 (Sep 2026) — compliance-reviewed credential copy. See complianceCopy.js
// for the rule citations behind each string; do not re-inline them here.
import {
  ABOUT_HERO_BODY,
  ABOUT_EXPERTISE_INTRO,
  ABOUT_EXPERTISE_HEADING,
  ABOUT_CARD_EXAMINATION,
} from '../lib/complianceCopy.js'

// CONSISTENCY PASS (Jul 9 2026): palette from src/theme.js — the CC-M01
// migration finished; local hex constants retired. Aliased so usage sites
// are untouched.
import { NAVY as N, BLUE as B } from '../lib/theme.js'

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
    icon: 'institution',
    // AUDIT B4 (Sep 2026): was "what examiners look for, how returns are selected
    // for audit, and where the real exposure sits." Audit-selection methodology is
    // non-public. Claiming to know it is either a disclosure problem or a false
    // claim under 31 C.F.R. §10.30(a)(1) — there is no third reading that helps.
    // Reframed onto PUBLISHED authority, which is both true and still credible.
    title: 'Published Examination Standards',
    desc: ABOUT_CARD_EXAMINATION,
  },
  {
    icon: 'chartBar',
    title: 'Tax Compliance',
    desc: 'Built around tax reporting requirements across S-Corps, partnerships, LLCs, sole proprietorships, and real estate — the exact structures TaxStat360 serves — so every calculation reflects how the IRS actually reads these returns.',
  },
  {
    icon: 'scales',
    title: 'Proactive Tax Planning',
    desc: 'Focused on legal, proactive strategies to reduce tax liability — not year-end scrambles, but structured decisions made throughout the year, when they still have the power to change the outcome.',
  },
]

const APPROACH = [
  {
    icon: 'target',
    // AUDIT H6 (Sep 2026): the product is last-sync-based and refreshes on demand,
    // as the FAQ itself says. "Every day of the year, updated as your income and
    // expenses change" describes continuous auto-sync, which does not exist.
    heading: 'Clarity On Demand',
    text: 'Most business owners only learn their federal tax liability in April. TaxStat360 gives you that number any day of the year — sync your accounting software with one click and the estimate recalculates immediately — so you can act on it while there is still time.',
  },
  {
    icon: 'shield',
    heading: 'Compliance-First Design',
    // FRESH-EYES C-3 (11 Sep 2026): "to help keep you on the right side of them"
    // promised an outcome — under a heading that says "Compliance-First", on a
    // site whose Terms §7 disclaims in capitals any warranty that a calculation is
    // accurate or complete. Every other disclosure on this site is carefully
    // bounded (the §10.3 / Form 2848 representation line, the non-endorsement
    // footer); this was the one line that drifted. Reworded to promise visibility,
    // which is what the product actually delivers, rather than an outcome no
    // estimation tool can guarantee.
    text: 'Every calculation is built on IRS-published tax rates and rules, updated for the tax year you select. TaxStat360 is designed around exactly where the IRS draws those lines — so you can see where your figures fall relative to them, and take that picture to your tax professional.',
  },
  {
    icon: 'partners',
    heading: 'CPA-Compatible, Not CPA-Replacing',
    text: 'TaxStat360 is built to make your relationship with your CPA more productive — not to replace it. Our CPA export tools and a dashboard you can share with your advisor give you both the same up-to-date picture.',
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
        {/* AUDIT B3/B4: removed "spent years inside the IRS understanding exactly
            what triggers audits and how returns are scrutinized" and "encoded into
            every calculation." The first claims non-public audit-selection knowledge;
            the second represents the output as the practitioner's own professional
            judgment, which directly contradicts Terms §2. Copy now describes
            provenance (who designed the methodology) rather than authorship of advice. */}
        <p style={{ fontSize: 15, color: '#475569', maxWidth: 640, margin: '0 auto', lineHeight: 1.8 }}>
          {ABOUT_HERO_BODY}
        </p>
      </section>

      {/* ─── FOUNDER EXPERTISE ────────────────────────────────────────── */}
      <section style={{ padding: '72px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
          <p style={EYEBROW}>The Expertise Behind It</p>
          {/* AUDIT B3: heading was "One Background. Built Into Every Calculation." —
              the "built into every calculation" framing is the exact claim that
              contradicts Terms §2's "NOT a ... enrolled agent." */}
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{ABOUT_EXPERTISE_HEADING}</h2>
          {/* #1 FIX (retained): intro attributes this to the single founder, so the three
              cards below read as one person's areas of expertise — not a multi-person team.
              AUDIT B3: reworded from "All three are built directly into the product." */}
          <p style={{ fontSize: 14, color: '#475569', maxWidth: 620, margin: '0 auto 52px', lineHeight: 1.7 }}>
            {ABOUT_EXPERTISE_INTRO}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(272px, 1fr))', gap: 24 }}>
            {FOUNDER_EXPERTISE.map((r, i) => (
              <div key={i} style={{ background: '#F8FAFC', borderRadius: 16, padding: '32px 26px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                <div style={{ marginBottom: 18 }}><Icon name={r.icon} size={36} color={N} /></div>
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
            One pattern shows up over and over in business tax: owners who could have legally reduced their liability by tens of thousands of dollars — but didn't — because they had no visibility into their liability until it was April and too late to act.
          </p>
          <p style={{ fontSize: 15, color: '#93b4d4', lineHeight: 1.85, marginBottom: 20 }}>
            S-Corp salary-to-distribution ratios set incorrectly. §199A QBI deductions missed. Quarterly payments underfunded. Depreciation strategies overlooked. Passive loss rules misapplied. These aren't exotic maneuvers — they're legal planning tools every business owner should be using, month by month, not once a year.
          </p>
          <p style={{ fontSize: 15, color: '#fff', fontWeight: 700, lineHeight: 1.8 }}>
            TaxStat360 exists so that every business owner can get the kind of year-round tax visibility that has traditionally required a professional engagement — and make strategic moves before the year is over.
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
                <div style={{ marginBottom: 18 }}><Icon name={a.icon} size={34} color={N} /></div>
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
<strong>Important:</strong> {DISCLAIMER_FULL}
          </p>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────── */}
      <section style={{ padding: '72px 24px', background: '#F8FAFC', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: N, marginBottom: 16 }}>Ready to Know Your Tax Liability?</h2>
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

      {/* ─── FOOTER (shared component — audit Pass 5 consolidation) ─────── */}
      <Footer />
    </div>
  )
}
