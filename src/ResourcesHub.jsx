// src/ResourcesHub.jsx
// AF-02: /resources landing page — the entry point for TaxStat360's
// organic content strategy. Displays article cards for all published
// articles targeting high-intent tax planning search queries.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ARTICLES } from './articles.js'
// #4 FIX: trial CTA label + microcopy now come from the single source in
// constants.js (was hardcoded here as "Card for verification only" — an FTC
// negative-option risk that contradicted the auto-billing in the Terms).
import { CTA_LABEL, CTA_COPY_SHORT } from './constants.js'
// #6 FIX: use the shared site nav instead of a second hand-rolled inline <nav>.
import Nav from './Nav'
import Icon from './Icon'
// CC FIX: the page's hand-rolled inline footer (its own hardcoded disclaimer +
// dynamic year) is replaced by the shared <Footer>, matching every other page
// and giving the disclaimer a single source of truth (DISCLAIMER_FULL).
import Footer from './Footer'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'

const CATEGORY_COLORS = {
  'S-Corporation': { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  'Tax Deductions': { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
  'Estimated Taxes': { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
  'Real Estate':    { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF' },
}

function CategoryPill({ category }) {
  const c = CATEGORY_COLORS[category] || { bg: '#F1F5F9', text: SL, border: '#E2E8F0' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {category}
    </span>
  )
}

function ArticleCard({ article }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link
      to={`/resources/${article.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: `1.5px solid ${hovered ? B : '#E2E8F0'}`,
        borderRadius: 14,
        padding: '24px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
        boxShadow: hovered ? '0 4px 20px rgba(37,99,235,0.10)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Icon + Category */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Icon name={article.heroIcon} size={28} color={B} />
        <CategoryPill category={article.category} />
      </div>

      {/* Title */}
      <h2 style={{
        fontSize: 17, fontWeight: 700, margin: 0, lineHeight: 1.4,
        color: hovered ? B : N, transition: 'color 0.15s',
      }}>
        {article.title}
      </h2>

      {/* Description */}
      <p style={{
        fontSize: 13, color: SL, margin: 0, lineHeight: 1.6,
        display: '-webkit-box', WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {article.metaDescription}
      </p>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #F1F5F9',
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {article.tags.slice(0, 2).map(t => (
            <span key={t} style={{
              fontSize: 10, color: '#64748B', background: '#F8FAFC',
              border: '1px solid #E2E8F0', borderRadius: 6, padding: '2px 7px',
            }}>
              {t}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>
          {article.readMinutes} min read →
        </span>
      </div>
    </Link>
  )
}

export default function ResourcesHub() {
  const nav = useNavigate()
  const [activeCategory, setActiveCategory] = useState('All')

  const categories = ['All', ...new Set(ARTICLES.map(a => a.category))]
  const filtered = activeCategory === 'All'
    ? ARTICLES
    : ARTICLES.filter(a => a.category === activeCategory)

  return (
    /* #6 FIX: paddingTop 64 offsets the shared fixed <Nav> (height 64). */
    <div style={{
      minHeight: '100vh', background: '#F8FAFC',
      fontFamily: 'Inter, system-ui, sans-serif', paddingTop: 64,
    }}>
      {/* #6 FIX: shared <Nav> replaces the page's own inline nav (separate logo,
          links, Sign In, and a hardcoded "Start Free 7-Day Trial" CTA). */}
      <Nav nav={nav} />

      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${N} 0%, #1e3a6e 100%)`,
        padding: '60px 32px 48px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.12)', borderRadius: 20,
          padding: '4px 14px', marginBottom: 20,
        }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.5px' }}>
            <Icon name="institution" size={13} color="rgba(255,255,255,0.85)" style={{ marginRight: 6 }} />BUILT ON IRS &amp; TAX EXPERTISE
          </span>
        </div>
        <h1 style={{
          fontSize: 36, fontWeight: 900, color: '#fff',
          margin: '0 0 14px', lineHeight: 1.2,
        }}>
          Tax Planning Resources
        </h1>
        <p style={{
          fontSize: 16, color: 'rgba(255,255,255,0.72)', margin: '0 auto',
          maxWidth: 560, lineHeight: 1.6,
        }}>
          Practical guides to S-Corp strategy, §199A QBI deductions, estimated taxes,
          and real estate investing — grounded in how the IRS examines returns
          and how the tax code rewards proactive planning.
        </p>
      </div>

      {/* Category filter */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '24px 20px 8px',
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '7px 16px',
              border: `1.5px solid ${activeCategory === cat ? B : '#E2E8F0'}`,
              borderRadius: 20,
              background: activeCategory === cat ? B : '#fff',
              color: activeCategory === cat ? '#fff' : SL,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Article grid */}
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        padding: '16px 20px 80px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 20,
      }}>
        {filtered.map(article => (
          <ArticleCard
            key={article.slug}
            article={article}
          />
        ))}
      </div>

      {/* Tools & Partners — RepsRecord (companion app) + Engineered Tax Services (affiliate partner) */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 72px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 6px' }}>Recommended Tools & Partners</h2>
        <p style={{ fontSize: 14, color: SL, margin: '0 0 20px' }}>Tools and partners we trust for real-estate and tax planning.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>

          {/* RepsRecord — TaxStat360's companion app */}
          <a href="https://repsrecord.com" target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 24, textDecoration: 'none' }}>
            <span style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: B, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '3px 8px' }}>Our App</span>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}><span style={{ color: '#14233B' }}>REPS</span><span style={{ color: '#3AA896' }}>Record</span></h3>
            <p style={{ fontSize: 13, color: SL, margin: 0, lineHeight: 1.6 }}>Log and substantiate your Real Estate Professional Status (REPS) hours to support material-participation claims at tax time.</p>
            <span style={{ fontSize: 13, fontWeight: 700, color: B }}>Visit RepsRecord &rarr;</span>
          </a>

          {/* Engineered Tax Services — affiliate partner (cost segregation) */}
          <a href="https://engineeredtaxservices.com/?ref_id=pyvjdbl" target="_blank" rel="sponsored noopener noreferrer"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 24, textDecoration: 'none' }}>
            <span style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: SL, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '3px 8px' }}>Partner</span>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: N, margin: 0 }}>Engineered Tax Services</h3>
            <p style={{ fontSize: 13, color: SL, margin: 0, lineHeight: 1.6 }}>Engineering-based cost segregation studies that accelerate depreciation on commercial and rental property &mdash; front-loading deductions to reduce taxable income.</p>
            <span style={{ fontSize: 13, fontWeight: 700, color: B }}>Visit Engineered Tax Services &rarr;</span>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>Affiliate partner &mdash; TaxStat360 may earn a commission at no additional cost to you.</span>
          </a>

        </div>
      </div>

      {/* CTA */}
      <div style={{
        background: '#fff', borderTop: '1px solid #E2E8F0',
        padding: '48px 20px', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 10px' }}>
          See These Calculations Live in Your Numbers
        </h2>
        <p style={{ fontSize: 14, color: SL, margin: '0 0 24px' }}>
          Connect your accounting software and see your estimated federal tax liability,
          §199A QBI deduction, and S-Corp SE-tax savings updated in real time.
        </p>
        <a href="/signup" style={{
          display: 'inline-block', padding: '13px 32px',
          background: N, color: '#fff', textDecoration: 'none',
          borderRadius: 8, fontWeight: 700, fontSize: 15,
        }}>
          {CTA_LABEL} →
        </a>
        {/* #4 FIX: was "Card for verification only · Cancel anytime" — now the shared,
            FTC-accurate trial microcopy from constants.js. */}
        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 10 }}>
          {CTA_COPY_SHORT}
        </p>
      </div>

      {/* CC FIX: shared <Footer> replaces the page's own inline footer (which had
          a hardcoded disclaimer string). Year is dynamic; disclaimer is single-sourced. */}
      <Footer />
    </div>
  )
}
