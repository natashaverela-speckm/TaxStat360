import { useEffect, useState } from 'react'
import Privacy from './Privacy'
import Terms from './Terms'
import About from './About'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation, Link } from 'react-router-dom'
import Landing from './Landing'
import Onboarding from './Onboarding'
import CalculateTaxInner from './CalculateTaxInner'
import TaxReturn from './TaxReturn'
import AIAnalysis from './AIAnalysis'
import Dashboard from './Dashboard'
import Settings from './Settings'
import Upgrade from './Upgrade'
import ResetPassword from './ResetPassword'
import ForgotPassword from './ForgotPassword'
import ErrorBoundary from './components/ErrorBoundary'
import EmailVerificationBanner, { fetchVerificationStatus } from './components/EmailVerificationBanner'
import { API_BASE_URL } from './constants.js'
import { refreshPlanFromServer } from './LockedFeature'
// AF-02: Resources / blog section for organic SEO traffic
import ResourcesHub from './ResourcesHub'
import Article from './Article'
// CC FIX: RouteTitle validates /resources/:slug against the article data so that
// unknown slugs (a soft-404 inside the indexable /resources/ pattern) get noindex.
import { getArticle } from './articles.js'

// ─── OAuth Callback Handler ───────────────────────────────────────────────────
// M1: Provider allowlist prevents arbitrary localStorage key pollution.
// Covers all four live integrations: QuickBooks, Xero, Wave, FreshBooks.
const OAUTH_PROVIDERS = new Set(['quickbooks', 'xero', 'wave', 'freshbooks'])

function OAuthCallback() {
  const { provider = 'unknown' } = useParams()
  const location = useLocation()
  useEffect(() => {
    const p = provider.toLowerCase()
    if (!OAUTH_PROVIDERS.has(p)) {
      window.location.href = '/calculate-tax'
      return
    }
    const name = p.charAt(0).toUpperCase() + p.slice(1)
    localStorage.setItem('ts360_connected_app', name)
    localStorage.setItem(`ts360_${p}_connected`, 'true')
    window.location.href = '/calculate-tax'
  }, [provider])
  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:'#EFF9FF',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:28}}>&#10003;</div>
        <h2 style={{fontSize:20,fontWeight:700,color:'#0D1B3E',marginBottom:8}}>Connecting {provider.charAt(0).toUpperCase()+provider.slice(1)}&hellip;</h2>
        <p style={{color:'#475569',fontSize:14}}>Completing secure OAuth handshake. You&apos;ll be redirected shortly.</p>
      </div>
    </div>
  )
}

// ─── Auth Keys ────────────────────────────────────────────────────────────────
// SEC-04: Session token migrated to httpOnly cookie (set by login Lambda).
// localStorage no longer stores the raw token — only non-sensitive metadata.
// ts360_logged_in is a lightweight hint; the real auth is the httpOnly cookie
// which the browser sends automatically on every credentialed request.
const AUTH_KEYS = [
  'ts360_logged_in','ts360_session_start',
  'ts360_email','plan','userName','ts360_connected_app',
  // Legacy keys from pre-SEC-04 — included so they get wiped on sign-out
  'token','ts360_session',
]

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function isValidSession() {
  const loggedIn = localStorage.getItem('ts360_logged_in')
  if (!loggedIn) return false
  const start = localStorage.getItem('ts360_session_start')
  if (start) {
    const startMs = parseInt(start, 10)
    if (!isNaN(startMs) && Date.now() - startMs > SESSION_MAX_AGE_MS) {
      fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
      AUTH_KEYS.forEach(k => localStorage.removeItem(k))
      return false
    }
  }
  return true
}

// ─── Authenticated Footer ─────────────────────────────────────────────────────
function AuthFooter() {
  const year = new Date().getFullYear()
  const link = { color: '#64748B', textDecoration: 'none', fontWeight: 600 }
  return (
    <div style={{
      position:'fixed',bottom:0,left:0,right:0,background:'#fff',
      borderTop:'1px solid #E2E8F0',display:'flex',alignItems:'center',
      justifyContent:'center',flexWrap:'wrap',gap:12,padding:'6px 24px',
      fontSize:11,color:'#94A3B8',zIndex:50,
      fontFamily:'Inter, system-ui, sans-serif',lineHeight:1.4,minHeight:36,
    }}>
      <span>&#169; {year} TaxStat360</span>
      <span style={{color:'#E2E8F0'}}>|</span>
      <Link to="/terms"   style={link}>Terms of Service</Link>
      <Link to="/privacy" style={link}>Privacy Policy</Link>
      <span style={{color:'#E2E8F0'}}>|</span>
      <a href="mailto:support@taxstat360.com" style={link}>support@taxstat360.com</a>
      <span style={{color:'#E2E8F0'}}>|</span>
      <span>For planning purposes only &mdash; not professional tax, legal, or financial advice. Consult a licensed tax professional before filing.</span>
    </div>
  )
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const sessionOk = isValidSession()
  const location = useLocation()

  // SEC-05: re-validate the real plan from the server on every authenticated
  // load, so dev-tools localStorage tampering can't unlock paid features.
  // Fail-safe: refreshPlanFromServer() leaves the plan untouched on any error
  // or if /auth/me doesn't exist yet. The state bump re-renders gated UI once
  // the server's answer lands.
  const [, setPlanChecked] = useState(0)
  const [verifyState, setVerifyState] = useState({ email: '', verified: true })
  useEffect(() => {
    if (!sessionOk) return
    let active = true
    refreshPlanFromServer().then(() => { if (active) setPlanChecked(n => n + 1) })
    return () => { active = false }
  }, [sessionOk])

  useEffect(() => {
    if (!sessionOk) return
    const email = (localStorage.getItem('ts360_email') || '').trim().toLowerCase()
    if (!email) return
    let active = true
    fetchVerificationStatus(email).then((s) => {
      if (active) setVerifyState({ email: s.email || email, verified: !!s.verified })
    })
    return () => { active = false }
  }, [sessionOk])

  useEffect(() => {
    if (!sessionOk) return
    try {
      const history = JSON.parse(localStorage.getItem('ts360_login_history') || '[]')
      const today = new Date().toDateString()
      const lastEntry = history[0]
      if (!lastEntry || new Date(lastEntry.timestamp).toDateString() !== today) {
        history.unshift({ timestamp: new Date().toISOString(), userAgent: navigator.userAgent })
        localStorage.setItem('ts360_login_history', JSON.stringify(history.slice(0, 10)))
      }
    } catch(e) {}

    const timeoutMins = parseInt(localStorage.getItem('ts360_idle_timeout_mins') || '0')
    if (!timeoutMins) return
    let timer
    const handleExpiry = () => { AUTH_KEYS.forEach(k => localStorage.removeItem(k)); window.location.href = '/login' }
    const resetTimer = () => { clearTimeout(timer); timer = setTimeout(handleExpiry, timeoutMins * 60 * 1000) }
    const EVENTS = ['mousedown','mousemove','keydown','scroll','touchstart','click']
    EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => { clearTimeout(timer); EVENTS.forEach(e => window.removeEventListener(e, resetTimer)) }
  }, [sessionOk])

  if (!sessionOk) return <Navigate to="/login" state={{ from: location }} replace />

  return (
    <ErrorBoundary>
      <EmailVerificationBanner
        email={verifyState.email}
        verified={verifyState.verified}
        onEmailUpdated={(next) => setVerifyState({ email: next, verified: false })}
      />
      {children}
      <AuthFooter />
    </ErrorBoundary>
  )
}

// ─── 404 Not Found ────────────────────────────────────────────────────────────
// F-01 FIX: Inlined (no external file dependency) to avoid import path failures.
// Replaces the silent <Navigate to="/" replace /> wildcard that gave users no
// indication their URL was invalid.
function NotFound() {
  // F-01b FIX: the 404's SEO hardening (noindex + distinct title + canonical→home)
  // is handled centrally in RouteTitle, since that's what owns the document <head>.
  // Here, the two recovery actions are now real <a href> anchors (were nav()
  // buttons with no crawlable/usable href) so middle-click and open-in-new-tab
  // work and they degrade gracefully without JS.
  return (
    <div style={{minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter, system-ui, sans-serif',padding:24}}>
      <div style={{textAlign:'center',maxWidth:480}}>
        <div style={{fontSize:64,fontWeight:900,color:'#E2E8F0',lineHeight:1,marginBottom:8}}>404</div>
        <h1 style={{fontSize:24,fontWeight:800,color:'#0D1B3E',margin:'0 0 12px'}}>Page Not Found</h1>
        <p style={{fontSize:14,color:'#475569',lineHeight:1.6,margin:'0 0 28px'}}>
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
          <a href="/" style={{display:'inline-block',padding:'11px 28px',background:'#0D1B3E',color:'#fff',borderRadius:8,fontWeight:700,fontSize:14,textDecoration:'none',fontFamily:'inherit'}}>
            &larr; Back to Home
          </a>
          <a href="/login" style={{display:'inline-block',padding:'11px 28px',background:'#fff',color:'#0D1B3E',border:'1.5px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:14,textDecoration:'none',fontFamily:'inherit'}}>
            Sign In
          </a>
        </div>
        <p style={{fontSize:11,color:'#CBD5E1',marginTop:32,lineHeight:1.5}}>
          TaxStat360 is a tax planning tool &mdash; not a tax preparation or filing service.
        </p>
      </div>
    </div>
  )
}

// ─── Landing Section Scroll Helper ───────────────────────────────────────────
const SECTION_META = {
  features: {
    title: 'Features — TaxStat360 | S-Corp, LLC & Real Estate Tax Calculator',
    description: 'See every TaxStat360 feature: live K-1 and Schedule C tax calculation, §199A QBI deduction, FICA savings, quarterly estimated payments, multi-entity consolidation, and AI-powered risk analysis.',
    canonical: 'https://www.taxstat360.com/features',
    ogTitle: 'TaxStat360 Features — Live Tax Calculator for Business Owners',
    ogDescription: 'K-1 income, QBI deduction, FICA savings, quarterly estimates, and AI risk analysis — all in one place.',
  },
  pricing: {
    title: 'Pricing — TaxStat360 | Plans Starting at $79/mo',
    description: 'TaxStat360 plans start at $79/month with a 7-day free trial. Compare Starter, Professional, and Enterprise plans — no hidden fees, cancel anytime.',
    canonical: 'https://www.taxstat360.com/pricing',
    ogTitle: 'TaxStat360 Pricing — Plans from $79/mo, 7-Day Free Trial',
    ogDescription: 'Start free for 7 days. Starter $79/mo · Professional $149/mo · Enterprise $299/mo.',
  },
  faq: {
    title: 'FAQ — TaxStat360 | Questions About S-Corp, LLC & Real Estate Tax Planning',
    description: 'Answers to common questions about TaxStat360: tax year selection, accuracy of calculations, accounting software integrations, data security, multi-entity support, and how the 7-day free trial works.',
    canonical: 'https://www.taxstat360.com/faq',
    ogTitle: 'TaxStat360 FAQ — Your Tax Planning Questions Answered',
    ogDescription: 'Do I need a CPA? How accurate are the calculations? What software integrates? All your TaxStat360 questions answered.',
  },
}

function useSectionMeta(sectionId) {
  useEffect(() => {
    const meta = SECTION_META[sectionId]
    if (!meta) return
    const origTitle   = document.title
    const origDesc    = document.querySelector('meta[name="description"]')?.content || ''
    const origCanon   = document.querySelector('link[rel="canonical"]')?.href || ''
    const origOgTitle = document.querySelector('meta[property="og:title"]')?.content || ''
    const origOgDesc  = document.querySelector('meta[property="og:description"]')?.content || ''
    const origOgUrl   = document.querySelector('meta[property="og:url"]')?.content || ''
    const origOgImage = document.querySelector('meta[property="og:image"]')?.content || ''
    const origTwCard  = document.querySelector('meta[name="twitter:card"]')?.content || ''
    const origTwTitle = document.querySelector('meta[name="twitter:title"]')?.content || ''
    const origTwDesc  = document.querySelector('meta[name="twitter:description"]')?.content || ''
    const origTwImage = document.querySelector('meta[name="twitter:image"]')?.content || ''

    document.title = meta.title
    let descEl = document.querySelector('meta[name="description"]')
    if (!descEl) { descEl = document.createElement('meta'); descEl.name = 'description'; document.head.appendChild(descEl) }
    descEl.content = meta.description
    let canonEl = document.querySelector('link[rel="canonical"]')
    if (!canonEl) { canonEl = document.createElement('link'); canonEl.rel = 'canonical'; document.head.appendChild(canonEl) }
    canonEl.href = meta.canonical
    const setOg = (prop, val) => {
      let el = document.querySelector(`meta[property="${prop}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el) }
      el.content = val
    }
    setOg('og:title',       meta.ogTitle)
    setOg('og:description', meta.ogDescription)
    setOg('og:url',         meta.canonical)
    const OG_IMAGE = 'https://www.taxstat360.com/og-image.png'
    setOg('og:image', OG_IMAGE)
    const setMeta = (name, val) => {
      let el = document.querySelector(`meta[name="${name}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el) }
      el.content = val
    }
    setMeta('twitter:card',        'summary_large_image')
    setMeta('twitter:title',       meta.ogTitle)
    setMeta('twitter:description', meta.ogDescription)
    setMeta('twitter:image',       OG_IMAGE)

    return () => {
      document.title = origTitle
      if (descEl)  descEl.content = origDesc
      if (canonEl) canonEl.href   = origCanon
      setOg('og:title',       origOgTitle)
      setOg('og:description', origOgDesc)
      setOg('og:url',         origOgUrl)
      setOg('og:image',       origOgImage)
      setMeta('twitter:card',        origTwCard)
      setMeta('twitter:title',       origTwTitle)
      setMeta('twitter:description', origTwDesc)
      setMeta('twitter:image',       origTwImage)
    }
  }, [sectionId])
}

function LandingAtSection({ sectionId }) {
  useSectionMeta(sectionId)
  useEffect(() => {
    const timer = setTimeout(() => {
      const el = document.getElementById(sectionId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => clearTimeout(timer)
  }, [sectionId])
  return <Landing />
}

// ─── Route-level page titles ──────────────────────────────────────────────────
const ROUTE_TITLES = {
  '/':                 'TaxStat360 — Year-Round Tax Liability Management for Business Owners',
  '/about':            'About — Built by a Former IRS Revenue Agent | TaxStat360',
  '/how-it-works':     'How It Works | TaxStat360',
  '/contact':          'Contact | TaxStat360',
  '/login':            'Sign In | TaxStat360',
  '/signin':           'Sign In | TaxStat360',
  '/sign-in':          'Sign In | TaxStat360',
  '/signup':           'Start Free Trial | TaxStat360',
  '/register':         'Start Free Trial | TaxStat360',
  '/verify-email':     'Verify Email | TaxStat360',
  '/dashboard':        'Dashboard | TaxStat360',
  '/calculate-tax':    'Tax Tracker | TaxStat360',
  '/calculator':       'Tax Tracker | TaxStat360',
  '/tax-return':       'Personal Return | TaxStat360',
  '/ai-analysis':      'AI Analysis & Reporting | TaxStat360',
  '/settings':         'Account Settings | TaxStat360',
  '/upgrade':          'Upgrade Plan | TaxStat360',
  '/reset-password':   'Reset Password | TaxStat360',
  '/forgot-password':  'Forgot Password | TaxStat360',
  '/resources':        'Tax Planning Resources | TaxStat360',
  '/privacy':          'Privacy Policy | TaxStat360',
  '/privacy-policy':   'Privacy Policy | TaxStat360',
  '/terms':            'Terms of Service | TaxStat360',
  '/terms-of-service': 'Terms of Service | TaxStat360',
}
const META_OWNED_ROUTES = ['/features', '/pricing', '/faq']
const NOINDEX_PREFIXES  = [
  '/dashboard','/calculate-tax','/calculator',
  '/tax-return','/ai-analysis','/settings',
  '/onboarding','/upgrade','/integrations',
]

function setNoindex(shouldNoindex) {
  let tag = document.querySelector('meta[name="robots"]')
  if (shouldNoindex) {
    if (!tag) { tag = document.createElement('meta'); tag.setAttribute('name','robots'); document.head.appendChild(tag) }
    tag.setAttribute('content','noindex, nofollow')
  } else {
    if (tag) tag.setAttribute('content','index, follow, max-image-preview:large')
  }
}

// #6 FIX: per-route canonical URL. Without this, every SPA route inherited the
// static homepage canonical baked into index.html (href=".../"), which tells
// search engines that /about, /privacy, /terms, and every /resources article are
// duplicates of the homepage — and would drop them from the index (defeating the
// whole point of the Resources SEO section). Each indexable route now canonicalizes
// to its OWN trailing-slash-normalized URL, which also dedupes the /privacy vs
// /privacy/ trailing-slash variants the audit flagged under #6.
const SITE_ORIGIN = 'https://www.taxstat360.com'
function setCanonical(path) {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el) }
  el.href = SITE_ORIGIN + (path === '/' ? '/' : path)
}

// F-01b FIX: client-side route recognizer used to detect 404s. React Router
// renders <NotFound> for unmatched paths, but the document <head>
// (robots/title/canonical) is owned here in RouteTitle — which previously had no
// notion of an "unknown route" and so left junk URLs as index,follow with a
// self-referential canonical (audit HIGH: soft-404s indexable). This reuses the
// existing route constants as the single source of truth, so it stays in sync as
// routes are added:
//   • ROUTE_TITLES keys         → public + app static routes
//   • META_OWNED_ROUTES         → /features, /pricing, /faq
//   • NOINDEX_PREFIXES (prefix) → /onboarding/*, /integrations/*, and app areas
//   • /resources/:slug pattern  → article pages
function isKnownRoute(path) {
  if (path === '/') return true
  if (ROUTE_TITLES[path] !== undefined) return true
  if (META_OWNED_ROUTES.includes(path)) return true
  if (NOINDEX_PREFIXES.some(p => path.startsWith(p))) return true
  if (/^\/resources\/[^/]+$/.test(path)) return true
  return false
}

function RouteTitle() {
  const location = useLocation()
  useEffect(() => {
    const path = location.pathname.replace(/\/$/, '') || '/'

    // F-01b FIX: unknown path → the catch-all <NotFound> is rendering. Mark it
    // noindex,nofollow, give it a distinct title, and point the canonical at the
    // homepage so junk URLs can't be indexed as thin duplicates of real pages.
    // (Serving a real 404 HTTP status is a host/CDN concern, tracked separately.)
    if (!isKnownRoute(path)) {
      setNoindex(true)
      setCanonical('/')
      document.title = 'Page Not Found | TaxStat360'
      return
    }

    setNoindex(NOINDEX_PREFIXES.some(p => path.startsWith(p)))
    // META_OWNED_ROUTES (/features, /pricing, /faq) manage BOTH their title and
    // their canonical inside useSectionMeta; skip them here so the two effects
    // don't fight over the <link rel="canonical"> element.
    if (META_OWNED_ROUTES.some(r => path.startsWith(r))) return
    setCanonical(path)
    if (path.startsWith('/onboarding'))   { document.title = 'Set Up Your Account | TaxStat360'; return }
    // CC FIX: /resources/:slug — validate the slug against the article data. The
    // /resources/<unknown> case renders <Article>'s "not found" view, which is a
    // soft-404 INSIDE the indexable /resources/ pattern (so the catch-all NotFound
    // never matches it). Mark those noindex + canonical→home. Article.jsx only
    // sets document.title (never robots), so this noindex is the one that sticks,
    // regardless of parent/child effect ordering. Valid slugs keep index,follow +
    // their own canonical (already set above); Article.jsx sets the exact title.
    if (path.startsWith('/resources/')) {
      const slug = path.slice('/resources/'.length)
      if (!getArticle(slug)) {
        setNoindex(true)
        setCanonical('/')
        document.title = 'Page Not Found | TaxStat360'
      } else {
        document.title = 'Tax Planning Resources | TaxStat360'
      }
      return
    }
    if (path.startsWith('/integrations')) return
    const title = ROUTE_TITLES[path]
    if (title) document.title = title
  }, [location.pathname])
  return null
}

// ─── Cookie Consent Banner ────────────────────────────────────────────────────
// ADD-02: GDPR (EU) and CCPA (California) require consent before setting
// non-essential cookies. Banner appears once on first visit. Value stored in
// localStorage as 'accepted' or 'declined'.
function CookieBanner() {
  const [visible, setVisible] = useState(() => !localStorage.getItem('ts360_cookie_consent'))

  if (!visible) return null

  const dismiss = (choice) => {
    localStorage.setItem('ts360_cookie_consent', choice)
    setVisible(false)
  }

  const N = '#0F1F3D'
  const B = '#2563EB'

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
      background: N,
      borderTop: '1px solid rgba(255,255,255,0.1)',
      padding: '14px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: 12,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.85)', maxWidth: 700, lineHeight: 1.5 }}>
        We use cookies to keep you signed in and to understand how TaxStat360 is used.
        By clicking <strong style={{ color: '#fff' }}>Accept</strong> you consent to all cookies.{' '}
        <a href="/privacy" style={{ color: '#93b4d4', textDecoration: 'underline' }}>Privacy Policy</a>
      </p>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => dismiss('declined')}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 6, padding: '7px 14px', fontSize: 13, color: 'rgba(255,255,255,0.75)',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          }}>
          Essential only
        </button>
        <button
          onClick={() => dismiss('accepted')}
          style={{
            background: B, border: 'none',
            borderRadius: 6, padding: '7px 18px', fontSize: 13, color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
          }}>
          Accept
        </button>
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <RouteTitle />
      <CookieBanner />
      <Routes>
        {/* Public */}
        <Route path="/"             element={<Landing />} />
        <Route path="/features"     element={<LandingAtSection sectionId="features" />} />
        <Route path="/pricing"      element={<LandingAtSection sectionId="pricing" />} />
        <Route path="/how-it-works" element={<LandingAtSection sectionId="how-it-works" />} />
        <Route path="/faq"          element={<LandingAtSection sectionId="faq" />} />
        <Route path="/contact"      element={<LandingAtSection sectionId="contact" />} />

        {/* UX-03: About page — single founder: an Enrolled Agent and former IRS Revenue Agent */}
        <Route path="/about"        element={<About />} />

        <Route path="/signup"       element={<Onboarding screen="signup" />} />
        <Route path="/register"     element={<Onboarding screen="signup" />} />
        <Route path="/signin"       element={<Onboarding screen="login" />} />
        <Route path="/sign-in"      element={<Navigate to="/login" replace />} />
        <Route path="/login"        element={<Onboarding screen="login" />} />
        <Route path="/verify-email" element={<Onboarding screen="verify" />} />

        {/* Onboarding — auth required */}
        <Route path="/onboarding/entity"   element={<RequireAuth><Onboarding screen="entity" /></RequireAuth>} />
        <Route path="/onboarding/business" element={<RequireAuth><Onboarding screen="business" /></RequireAuth>} />
        <Route path="/onboarding/import"   element={<RequireAuth><Onboarding screen="import" /></RequireAuth>} />

        {/* OAuth callback — QuickBooks, Xero, Wave, FreshBooks */}
        <Route path="/integrations/:provider/callback" element={<OAuthCallback />} />

        {/* Protected app routes */}
        <Route path="/calculate-tax" element={<RequireAuth><CalculateTaxInner /></RequireAuth>} />
        <Route path="/calculator"    element={<RequireAuth><CalculateTaxInner /></RequireAuth>} />
        <Route path="/dashboard"     element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/tax-return"    element={<RequireAuth><TaxReturn /></RequireAuth>} />
        <Route path="/ai-analysis"   element={<RequireAuth><AIAnalysis /></RequireAuth>} />
        <Route path="/settings"      element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/upgrade"       element={<RequireAuth><Upgrade /></RequireAuth>} />

        {/* Password reset — public */}
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Public legal */}
        <Route path="/privacy"          element={<Privacy />} />
        <Route path="/terms"            element={<Terms />} />
        <Route path="/privacy-policy"   element={<Navigate to="/privacy" replace />} />
        <Route path="/terms-of-service" element={<Navigate to="/terms"   replace />} />

        {/* AF-02: Public resources / blog section — no auth required, fully indexable */}
        <Route path="/resources"       element={<ResourcesHub />} />
        <Route path="/resources/:slug" element={<Article />} />

        {/* F-01 FIX: Branded 404 replaces silent redirect to homepage */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
