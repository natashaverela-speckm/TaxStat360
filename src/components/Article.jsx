// src/Article.jsx
// AF-02: Individual article page for the /resources/:slug route.
// Renders a single published article from the canonical data module
// (./articles.js). This file is the VIEW; all article data lives in
// articles.js (single source of truth, also consumed by ResourcesHub).
//
// Routing (App.jsx):
//   <Route path="/resources/:slug" element={<Article />} />
//
// CC FIX (nav/footer consolidation): this page previously shipped its OWN
// SiteNav + SiteFooter — the footer hardcoded "© 2026" (stale in 2027) and
// hand-copied the disclaimer text, which could drift from the canonical wording.
// Both are now the shared <Nav> and <Footer> used by Landing/About/Terms/Privacy/
// ResourcesHub, so the year is always dynamic and the disclaimer has one source
// of truth (DISCLAIMER_FULL in constants.js, rendered by Footer). The shared
// <Nav> is position:fixed (height 64), so the page wrapper adds paddingTop:64.

import { useEffect } from 'react'
import { NAVY as N, BLUE as B, SLATE as SL } from '../lib/theme.js'
import { useParams, useNavigate } from 'react-router-dom'
import { ARTICLES, getArticle } from '../lib/articles.js'
import Icon from './Icon'
import Nav from './Nav'
import Footer from './Footer'


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
      fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      {category}
    </span>
  )
}

export default function Article() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const article = getArticle(slug)

  // Set document title for SEO; reset scroll on slug change.
  // (Unknown-slug noindex is handled centrally in App.jsx RouteTitle, which owns
  // the robots/canonical <head> tags; this effect only manages title + scroll.)
  useEffect(() => {
    document.title = article
      ? `${article.title} | TaxStat360`
      : 'Article Not Found | TaxStat360'
    window.scrollTo(0, 0)
  }, [slug, article])

  // Unknown slug — graceful fallback back to the hub.
  if (!article) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif', paddingTop: 64 }}>
        <Nav nav={navigate} />
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '80px 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: N, margin: '0 0 12px' }}>Article not found</h1>
          <p style={{ fontSize: 15, color: SL, margin: '0 0 24px' }}>
            We couldn't find the article you're looking for.
          </p>
          <a href="/resources" style={{
            display: 'inline-block', background: B, color: '#fff', fontSize: 14, fontWeight: 700,
            padding: '12px 24px', borderRadius: 10, textDecoration: 'none',
          }}>
            ← Back to Resources
          </a>
        </div>
        <Footer />
      </div>
    )
  }

  const related = (article.relatedSlugs || [])
    .map(s => ARTICLES.find(a => a.slug === s))
    .filter(Boolean)

  const formattedDate = (() => {
    try {
      return new Date(article.publishedDate).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    } catch { return article.publishedDate /* M5: unparseable date → show raw string */ }
  })()

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif', paddingTop: 64 }}>
      <Nav nav={navigate} />

      <article style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 64px' }}>
        {/* Back link */}
        <a href="/resources" style={{
          display: 'inline-block', fontSize: 13, fontWeight: 600, color: B,
          textDecoration: 'none', marginBottom: 24,
        }}>
          ← Back to Resources
        </a>

        {/* Hero */}
        <div style={{ lineHeight: 1, marginBottom: 16 }}><Icon name={article.heroIcon} size={44} color={B} /></div>
        <div style={{ marginBottom: 16 }}>
          <CategoryPill category={article.category} />
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: N, lineHeight: 1.2, margin: '0 0 16px', letterSpacing: '-0.5px' }}>
          {article.title}
        </h1>
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 8 }}>
          {formattedDate}
          {article.readMinutes ? ` · ${article.readMinutes} min read` : ''}
        </div>
        {article.metaDescription && (
          <p style={{ fontSize: 17, color: SL, lineHeight: 1.6, margin: '8px 0 0', fontWeight: 400 }}>
            {article.metaDescription}
          </p>
        )}

        <hr style={{ border: 0, borderTop: '1px solid #E2E8F0', margin: '32px 0' }} />

        {/* Sections */}
        {(article.sections || []).map((section, i) => (
          <section key={i} style={{ marginBottom: 32 }}>
            {section.heading && (
              <h2 style={{ fontSize: 21, fontWeight: 700, color: N, margin: '0 0 12px' }}>
                {section.heading}
              </h2>
            )}
            {String(section.body || '').split('\n\n').map((para, j) => (
              <p key={j} style={{ fontSize: 16, color: '#334155', lineHeight: 1.7, margin: '0 0 14px', whiteSpace: 'pre-wrap' }}>
                {para}
              </p>
            ))}
          </section>
        ))}

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 0' }}>
            {article.tags.map(t => (
              <span key={t} style={{
                fontSize: 12, fontWeight: 600, color: SL, background: '#F1F5F9',
                border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px',
              }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* CTA */}
        <div style={{
          background: N, borderRadius: 16, padding: '32px', textAlign: 'center', margin: '40px 0 0',
        }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>
            See These Numbers in Your Own Return
          </h3>
          <p style={{ fontSize: 14, color: '#AEB9D4', margin: '0 0 20px', lineHeight: 1.6 }}>
            TaxStat360 applies these rules to your real numbers and shows your estimated federal tax liability year-round.
          </p>
          <a href="/signup" style={{
            display: 'inline-block', background: B, color: '#fff', fontSize: 15, fontWeight: 700,
            padding: '14px 32px', borderRadius: 10, textDecoration: 'none',
          }}>
            Start Your Free 7-Day Trial →
          </a>
          <p style={{ fontSize: 12, color: '#6B7AA3', marginTop: 12 }}>
            No charge for 7 days · Cancel anytime
          </p>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div style={{ marginTop: 48 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 16px' }}>Related Articles</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              {related.map(r => (
                <div
                  key={r.slug}
                  onClick={() => navigate(`/resources/${r.slug}`)}
                  style={{
                    background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 12,
                    padding: 18, cursor: 'pointer',
                  }}
                >
                  <div style={{ marginBottom: 8 }}><CategoryPill category={r.category} /></div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: N, lineHeight: 1.35 }}>{r.title}</div>
                  {r.readMinutes ? (
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>{r.readMinutes} min read →</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </article>

      <Footer />
    </div>
  )
}
