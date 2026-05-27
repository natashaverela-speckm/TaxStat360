// src/Article.jsx
// AF-02: Article template — renders a single article from articles.js
// based on the :slug URL param.
//
// Route: <Route path="/resources/:slug" element={<Article />} />

import { useParams, useNavigate } from 'react-router-dom'
import { getArticle, ARTICLES } from './articles.js'

const N = '#0D1B3E', B = '#2563EB', SL = '#475569'

const CATEGORY_COLORS = {
  'S-Corporation': { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  'Tax Deductions': { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
  'Estimated Taxes': { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
  'Real Estate':    { bg: '#FDF4FF', text: '#7E22CE', border: '#E9D5FF' },
}

function Breadcrumb({ category, title }) {
  return (
    <nav style={{ fontSize: 12, color: '#94A3B8', marginBottom: 24 }}>
      <a href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Home</a>
      <span style={{ margin: '0 6px' }}>›</span>
      <a href="/resources" style={{ color: '#94A3B8', textDecoration: 'none' }}>Resources</a>
      <span style={{ margin: '0 6px' }}>›</span>
      <span style={{ color: SL }}>{title.length > 50 ? title.slice(0, 50) + '…' : title}</span>
    </nav>
  )
}

export default function Article() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const article = getArticle(slug)

  if (!article) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif',
        flexDirection: 'column', gap: 16, color: N,
      }}>
        <div style={{ fontSize: 48 }}>📄</div>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Article not found</h1>
        <button onClick={() => navigate('/resources')} style={{
          padding: '10px 24px', background: B, color: '#fff', border: 'none',
          borderRadius: 8, fontWeight: 600, cursor: 'pointer',
        }}>
          ← Back to Resources
        </button>
      </div>
    )
  }

  const catColor = CATEGORY_COLORS[article.category] || { bg: '#F1F5F9', text: SL, border: '#E2E8F0' }
  const related = article.relatedSlugs
    .map(s => ARTICLES.find(a => a.slug === s))
    .filter(Boolean)
    .slice(0, 3)

  return (
    <div style={{
      minHeight: '100vh', background: '#F8FAFC',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Nav */}
      <nav style={{
        background: '#fff', borderBottom: '1px solid #E2E8F0',
        padding: '0 32px', height: 58,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <svg width="28" height="28" viewBox="0 0 34 34">
            <rect width="34" height="34" rx="8" fill={B}/>
            <rect x="8" y="18" width="5" height="8" rx="2" fill="#fff"/>
            <rect x="15" y="12" width="5" height="14" rx="2" fill="#fff"/>
            <rect x="22" y="8" width="5" height="18" rx="2" fill="#fff"/>
          </svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: N }}>
            TaxStat<span style={{ color: B }}>360</span>
          </span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/resources" style={{ fontSize: 13, color: B, fontWeight: 700, textDecoration: 'none' }}>
            ← Resources
          </a>
          <a href="/signup" style={{
            fontSize: 13, color: '#fff', fontWeight: 700, textDecoration: 'none',
            padding: '8px 16px', background: N, borderRadius: 8,
          }}>
            Start Free Trial
          </a>
        </div>
      </nav>

      {/* Main layout */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '40px 20px 80px',
        display: 'grid', gridTemplateColumns: '1fr 300px', gap: 40,
        alignItems: 'start',
      }}>

        {/* Article body */}
        <article>
          <Breadcrumb category={article.category} title={article.title} />

          {/* Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: catColor.bg, color: catColor.text, border: `1px solid ${catColor.border}`,
            }}>
              {article.category}
            </span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>{article.readMinutes} min read</span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>·</span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>
              {new Date(article.publishedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {/* Hero emoji + title */}
          <div style={{ fontSize: 48, marginBottom: 16 }}>{article.heroEmoji}</div>
          <h1 style={{
            fontSize: 30, fontWeight: 900, color: N, margin: '0 0 16px', lineHeight: 1.25,
          }}>
            {article.title}
          </h1>

          {/* Byline */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32,
            paddingBottom: 24, borderBottom: '2px solid #E2E8F0',
          }}>
            <div style={{
              width: 36, height: 36, background: N, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              🏛️
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: N }}>TaxStat360 Editorial Team</div>
              <div style={{ fontSize: 12, color: SL }}>Former IRS Revenue Agents & Tax Planning Specialists</div>
            </div>
          </div>

          {/* Sections */}
          {article.sections.map((section, i) => (
            <div key={i} style={{ marginBottom: 36 }}>
              <h2 style={{
                fontSize: 20, fontWeight: 800, color: N,
                margin: '0 0 12px', lineHeight: 1.3,
                paddingLeft: 12,
                borderLeft: `3px solid ${B}`,
              }}>
                {section.heading}
              </h2>
              {section.body.split('\n\n').map((para, j) => (
                <p key={j} style={{
                  fontSize: 15, color: '#374151', lineHeight: 1.8,
                  margin: '0 0 16px',
                }}>
                  {para.trim()}
                </p>
              ))}
            </div>
          ))}

          {/* Tags */}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
            paddingTop: 24, borderTop: '1px solid #E2E8F0', marginTop: 8,
          }}>
            {article.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 11, color: SL, background: '#F1F5F9',
                border: '1px solid #E2E8F0', borderRadius: 6, padding: '4px 10px',
              }}>
                {tag}
              </span>
            ))}
          </div>

          {/* Disclaimer */}
          <div style={{
            marginTop: 32, background: '#FFFBEB', border: '1px solid #FDE68A',
            borderRadius: 10, padding: '14px 16px',
            fontSize: 12, color: '#92400E', lineHeight: 1.6,
          }}>
            <strong>Planning tool disclaimer:</strong> This article is for informational and
            planning purposes only — not professional tax, legal, or financial advice.
            Tax laws change; thresholds and limits cited reflect 2026 figures.
            Consult a licensed tax professional before making any filing or financial decisions.
          </div>
        </article>

        {/* Sidebar */}
        <aside style={{ position: 'sticky', top: 78 }}>

          {/* CTA card */}
          <div style={{
            background: N, borderRadius: 14, padding: '24px',
            marginBottom: 20, color: '#fff',
          }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>
              See these numbers in your own return
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', margin: '0 0 16px', lineHeight: 1.6 }}>
              Connect your accounting software and see your estimated federal tax
              liability — QBI deduction, FICA savings, quarterly payments — in real time.
            </p>
            <a href="/signup" style={{
              display: 'block', padding: '11px', background: B, color: '#fff',
              textDecoration: 'none', borderRadius: 8, fontWeight: 700,
              fontSize: 14, textAlign: 'center',
            }}>
              Start Free 7-Day Trial →
            </a>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '8px 0 0' }}>
              No charge for 7 days · Card for verification only
            </p>
          </div>

          {/* Related articles */}
          {related.length > 0 && (
            <div style={{
              background: '#fff', border: '1px solid #E2E8F0',
              borderRadius: 14, padding: '20px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '0.5px', marginBottom: 14, textTransform: 'uppercase' }}>
                Related Articles
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {related.map(rel => (
                  <a key={rel.slug} href={`/resources/${rel.slug}`} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    textDecoration: 'none',
                    padding: '10px', borderRadius: 8,
                    border: '1px solid transparent',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{rel.heroEmoji}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: N, lineHeight: 1.4 }}>
                        {rel.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                        {rel.readMinutes} min read
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Footer */}
      <div style={{
        background: '#fff', borderTop: '1px solid #E2E8F0',
        padding: '20px', textAlign: 'center',
        fontSize: 11, color: '#94A3B8', lineHeight: 1.6,
      }}>
        <p style={{ margin: '0 0 4px' }}>
          © 2026 TaxStat360 ·{' '}
          <a href="/terms" style={{ color: '#94A3B8' }}>Terms of Service</a> ·{' '}
          <a href="/privacy" style={{ color: '#94A3B8' }}>Privacy Policy</a>
        </p>
        <p style={{ margin: 0 }}>
          For planning purposes only — not professional tax, legal, or financial advice.
          Consult a licensed tax professional before making any filing or financial decisions.
        </p>
      </div>
    </div>
  )
}
