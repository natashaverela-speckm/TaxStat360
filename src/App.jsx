import { useEffect, useState } from 'react'
import { writeSessionStart, readEmail, readLoginHistory, writeLoginHistory, readIdleTimeoutMins, readCookieConsent, writeCookieConsent } from './utils/sessionState.js'
import Privacy from './Privacy'
import Terms from './Terms'
import About from './About'
import { writeIntegrationField } from './utils/integrations.js'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation, Link } from 'react-router-dom'
import Landing from './Landing'
import Onboarding from './Onboarding'
import CalculateTaxInner from './CalculateTaxInner'
import TaxReturn from './TaxReturn'
import AIAnalysis from './AIAnalysis'
import Dashboard from './Dashboard'
import Settings from './Settings'
import Admin from './Admin'
import Upgrade from './Upgrade'
import ResetPassword from './ResetPassword'
import ForgotPassword from './ForgotPassword'
import ErrorBoundary from './components/ErrorBoundary'
import EmailVerificationBanner, { fetchVerificationStatus } from './components/EmailVerificationBanner'
import { apiGet, ApiError } from './utils/apiClient.js'
import { normalizePlanId } from './LockedFeature'
import { writePlan } from './utils/sessionState.js'
import { clearInvalidSession, isValidSession, clearAuthKeys } from './utils/sessionAuth.js'
// AF-02: Resources / blog section for organic SEO traffic
import ResourcesHub from './ResourcesHub'
import Article from './Article'
// CC FIX: RouteTitle validates /resources/:slug against the article data so that
// unknown slugs (a soft-404 inside the indexable /resources/ pattern) get noindex.
import { getArticle } from './lib/articles.js'
import { NAVY as N, SLATE as SL } from './lib/theme.js'
import WelcomeTourScreen from './components/WelcomeTourScreen.jsx'
import { needsOnboardingTour } from './utils/onboardingTour.js'

// ─── OAuth Callback Handler ───────────────────────────────────────────────────
// M1: Provider allowlist prevents arbitrary localStorage key pollution.
// Covers all four live integrations: QuickBooks, Xero, Wave, FreshBooks.
const OAUTH_PROVIDERS = new Set(['quickbooks', 'xero', 'wave', 'freshbooks'])

function OAuthCallback() {
  const { provider = 'unknown' } = useParams()
  useEffect(() => {
    const p = provider.toLowerCase()
    if (!OAUTH_PROVIDERS.has(p)) {
      window.location.href = '/calculate-tax'
      return
    }
    writeIntegrationField(p, 'connected', 'true')   // M4 (audit F-06): accessor swap, caught by architecture-invariants.test.js
    window.location.href = '/calculate-tax'
  }, [provider])
  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:'#EFF9FF',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:28}}>&#10003;</div>
        <h2 style={{fontSize:20,fontWeight:700,color:N,marginBottom:8}}>Connecting {provider.charAt(0).toUpperCase()+provider.slice(1)}&hellip;</h2>
        <p style={{color:SL,fontSize:14}}>Completing secure OAuth handshake. You&apos;ll be redirected shortly.</p>
      </div>
    </div>
  )
}

// ─── Auth Keys ────────────────────────────────────────────────────────────────
// SEC-04: Session token migrated to httpOnly cookie (set by login Lambda).
// localStorage no longer stores the raw token — only non-sensitive metadata.
// ts360_logged_in is a lightweight hint; the real auth is the httpOnly cookie
// which the browser sends automatically on every credentialed request.
// D-11 (dead-code & duplication audit): AUTH_KEYS / SESSION_MAX_AGE_MS /
// isValidSession() moved verbatim to utils/sessionAuth.js — the single
// definition of session validity, now shared with Onboarding.

// ─── Authenticated Footer ─────────────────────────────────────────────────────
function AuthFooter() {
  const year = new Date().getFullYear()
  const link = { color: '#64748B', textDecoration: 'none', fontWeight: 600 }
  // PHASE 3.4 (mobile check B1): Step 1 has its own fixed bottom action bar
  // (Save / Continue, zIndex 70) occupying the same strip as this fixed footer
  // (zIndex 50) — on phones the wrapped legal text poked out from under the
  // bar mid-sentence. On that route the footer renders IN FLOW at the end of
  // the document with clearance below, so the full disclaimer scrolls into
  // view above the bar; every other page keeps the fixed strip.
  const { pathname } = useLocation()
  const hasActionBar = pathname === '/calculate-tax'
  return (
    <div style={{
      ...(hasActionBar
        ? { position: 'static', margin: '24px 0 92px' }
        : { position: 'fixed', bottom: 0, left: 0, right: 0 }),
      background:'#fff',
      borderTop:'1px solid #E2E8F0',display:'flex',alignItems:'center',
      justifyContent:'center',flexWrap:'wrap',gap:12,padding:'6px 24px',
      fontSize:12,color:SL,zIndex:50,
      fontFamily:'Inter, system-ui, sans-serif',lineHeight:1.4,minHeight:36,
    }}>
      <span>&#169; {year} TaxStat360</span>
      <span style={{color:'#E2E8F0'}}>|</span>
      <Link to="/terms"   style={link}>Terms of Service</Link>
      <Link to="/privacy" style={link}>Privacy Policy</Link>
      <span style={{color:'#E2E8F0'}}>|</span>
      <a href="mailto:support@taxstat360.com" style={link}>support@taxstat360.com</a>
      <span style={{color:'#E2E8F0'}}>|</span>
      <span>For planning purposes only &mdash; not professional tax, legal, or financial advice. These are simplified federal estimates and may not reflect every tax situation, including complex or multi-entity returns and specialized deductions. Consult a licensed tax professional before filing or relying on these figures.</span>
    </div>
  )
}

// ─── Welcome tour gate ────────────────────────────────────────────────────────
function RequireWelcomeTour({ children }) {
  const location = useLocation()
  const email = readEmail()
  if (email && needsOnboardingTour(email)) {
    return <Navigate to="/onboarding/welcome" replace state={{ from: location }} />
  }
  return children
}

function AuthedWithTour({ children }) {
  return (
    <RequireAuth>
      <RequireWelcomeTour>{children}</RequireWelcomeTour>
    </RequireAuth>
  )
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const sessionOk = isValidSession()
  const location = useLocation()

  const [serverAuth, setServerAuth] = useState(() => (sessionOk ? 'pending' : 'fail'))
  const [, setPlanChecked] = useState(0)
  const [verifyState, setVerifyState] = useState({ email: '', verified: true })

  useEffect(() => {
    if (!sessionOk) {
      setServerAuth('fail')
      return
    }
    let active = true
    setServerAuth('pending')
    apiGet('/auth/me', { headers: { Accept: 'application/json' } })
      .then((data) => {
        if (!active) return
        if (data?.plan) writePlan(normalizePlanId(data.plan))
        setServerAuth('ok')
        setPlanChecked(n => n + 1)
      })
      .catch((e) => {
        if (!active) return
        if (e instanceof ApiError && e.status === 401) {
          clearInvalidSession()
          clearAuthKeys()
        }
        setServerAuth('fail')
      })
    return () => { active = false }
  }, [sessionOk])

  useEffect(() => {
    if (!sessionOk || serverAuth !== 'ok') return
    const email = (readEmail() || '').trim().toLowerCase()
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
      const history = JSON.parse(readLoginHistory() || '[]')
      const today = new Date().toDateString()
      const lastEntry = history[0]
      if (!lastEntry || new Date(lastEntry.timestamp).toDateString() !== today) {
        history.unshift({ timestamp: new Date().toISOString(), userAgent: navigator.userAgent })
        writeLoginHistory(JSON.stringify(history.slice(0, 10)))
      }
    } catch(e) {
      // M5 (audit F-10): login history is a Settings display nicety — a storage
      // failure (private browsing, quota) must never interfere with sign-in.
    }

    const timeoutMins = parseInt(readIdleTimeoutMins() || '0')
    if (!timeoutMins) return
    let timer
    const handleExpiry = () => { clearAuthKeys(); window.location.href = '/login?expired=1' }
    const resetTimer = () => { clearTimeout(timer); timer = setTimeout(handleExpiry, timeoutMins * 60 * 1000) }
    const EVENTS = ['mousedown','mousemove','keydown','scroll','touchstart','click']
    EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => { clearTimeout(timer); EVENTS.forEach(e => window.removeEventListener(e, resetTimer)) }
  }, [sessionOk])

  // F-FUNC-03: sliding session expiry. isValidSession() ages a session out once the
  // fixed SESSION_MAX_AGE_MS window from ts360_session_start lapses — which, without
  // renewal, silently bounces an actively-working user to Sign In mid-session and
  // discards any not-yet-saved edits. Refresh the start timestamp on genuine activity
  // (throttled to at most once a minute) so a session that is still in use keeps
  // sliding forward and only a truly idle session ages out. The httpOnly auth cookie
  // (SEC-04) remains the real credential; this only keeps the client-side window in
  // step with continued use. In-progress work already survives a forced re-login
  // because isValidSession()/handleExpiry clear only AUTH_KEYS, never the ts360_*
  // session-state keys that hold entity and 1040 data.
  useEffect(() => {
    if (!sessionOk) return
    let last = Date.now()
    const THROTTLE_MS = 60 * 1000
    const bump = () => {
      const now = Date.now()
      if (now - last < THROTTLE_MS) return
      last = now
      writeSessionStart(String(now))
    }
    const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    EVENTS.forEach(e => window.addEventListener(e, bump, { passive: true }))
    return () => EVENTS.forEach(e => window.removeEventListener(e, bump))
  }, [sessionOk])

  // F-FUNC-03: flag the redirect as an expiry (not a fresh visit) so the Sign In
  // screen can surface a "your session expired" notice instead of bouncing silently.
  if (!sessionOk || serverAuth === 'fail') {
    return <Navigate to="/login" state={{ from: location, sessionExpired: !sessionOk, sessionInvalid: serverAuth === 'fail' }} replace />
  }
  if (serverAuth === 'pending') return null

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
        <h1 style={{fontSize:24,fontWeight:800,color:N,margin:'0 0 12px'}}>Page Not Found</h1>
        <p style={{fontSize:14,color:SL,lineHeight:1.6,margin:'0 0 28px'}}>
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
          <a href="/" style={{display:'inline-block',padding:'11px 28px',background:N,color:'#fff',borderRadius:8,fontWeight:700,fontSize:14,textDecoration:'none',fontFamily:'inherit'}}>
            &larr; Back to Home
          </a>
          <a href="/login" style={{display:'inline-block',padding:'11px 28px',background:'#fff',color:N,border:'1.5px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:14,textDecoration:'none',fontFamily:'inherit'}}>
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
// Canonical site origin — single source for canonical links and OG image URLs.
const SITE_ORIGIN = 'https://www.taxstat360.com'
const SECTION_META = {
  features: {
    title: 'Features — TaxStat360 | S-Corp, LLC & Real Estate Tax Calculator',
    description: 'See every TaxStat360 feature: live K-1 and Schedule C tax calculation, §199A QBI deduction, S-Corp SE-tax savings, quarterly estimated payments, multi-entity consolidation, and AI-powered risk analysis.',
    canonical: SITE_ORIGIN + '/features',
    ogTitle: 'TaxStat360 Features — Live Tax Calculator for Business Owners',
    ogDescription: 'K-1 income, §199A QBI deduction, S-Corp SE-tax savings, quarterly estimates, and AI risk analysis — all in one place.',
  },
  pricing: {
    title: 'Pricing — TaxStat360 | Plans Starting at $79/mo',
    description: 'TaxStat360 plans start at $79/month with a 7-day free trial. Compare Starter, Professional, and Enterprise plans — no hidden fees, cancel anytime.',
    canonical: SITE_ORIGIN + '/pricing',
    ogTitle: 'TaxStat360 Pricing — Plans from $79/mo, 7-Day Free Trial',
    ogDescription: 'Start free for 7 days. Starter $79/mo · Professional $149/mo · Enterprise $299/mo.',
  },
  faq: {
    title: 'FAQ — TaxStat360 | Questions About S-Corp, LLC & Real Estate Tax Planning',
    description: 'Answers to common questions about TaxStat360: tax year selection, accuracy of calculations, accounting software integrations, data security, multi-entity support, and how the 7-day free trial works.',
    canonical: SITE_ORIGIN + '/faq',
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
    const OG_IMAGE = SITE_ORIGIN + '/og-image.png'
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
  '/admin':            'Admin | TaxStat360',
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
  '/tax-return','/ai-analysis','/settings','/admin',
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
  const [visible, setVisible] = useState(() => !readCookieConsent())

  if (!visible) return null

  const dismiss = (choice) => {
    writeCookieConsent(choice)
    // Consent-gated Meta Pixel (defined in index.html): load it ONLY on Accept.
    // "Essential only" (choice === 'declined') deliberately never loads it.
    if (choice === 'accepted' && typeof window !== 'undefined' && typeof window.__ts360LoadPixel === 'function') {
      window.__ts360LoadPixel()
    }
    setVisible(false)
  }

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
      {/* PHASE 3.3 (semantic pass): skip link — visually hidden until keyboard
          focus, jumps past the nav to each page's <main id="main-content">. */}
      <a
        href="#main-content"
        style={{ position: 'absolute', left: -9999, top: 8, zIndex: 1000, background: '#0D1B3E', color: '#fff', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
        onFocus={e => { e.currentTarget.style.left = '8px' }}
        onBlur={e => { e.currentTarget.style.left = '-9999px' }}
      >
        Skip to main content
      </a>
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
        <Route path="/onboarding/welcome"  element={<RequireAuth><WelcomeTourScreen /></RequireAuth>} />
        {/* AUDIT FLOW REVISION (owner decision): the entity/business/import setup
            funnel is removed — users go straight to the Dashboard after the welcome
            tour and manage entities in the Tax Tracker. The old step URLs redirect
            so bookmarks, stale nav calls, and in-flight sessions never 404. */}
        <Route path="/onboarding/entity"   element={<AuthedWithTour><Navigate to="/dashboard" replace /></AuthedWithTour>} />
        <Route path="/onboarding/business" element={<AuthedWithTour><Navigate to="/dashboard" replace /></AuthedWithTour>} />
        <Route path="/onboarding/import"   element={<AuthedWithTour><Navigate to="/dashboard" replace /></AuthedWithTour>} />

        {/* OAuth callback — QuickBooks, Xero, Wave, FreshBooks */}
        <Route path="/integrations/:provider/callback" element={<OAuthCallback />} />

        {/* Protected app routes */}
        {/* AUDIT #7: /tracker (the "Tax Tracker" nav label) previously 404’d; the live
            route is /calculate-tax. Redirect so bookmarks and stale links never dead-end. */}
        <Route path="/tracker"       element={<Navigate to="/calculate-tax" replace />} />
        <Route path="/calculate-tax" element={<AuthedWithTour><CalculateTaxInner /></AuthedWithTour>} />
        <Route path="/calculator"    element={<AuthedWithTour><CalculateTaxInner /></AuthedWithTour>} />
        <Route path="/dashboard"     element={<AuthedWithTour><Dashboard /></AuthedWithTour>} />
        <Route path="/tax-return"    element={<AuthedWithTour><TaxReturn /></AuthedWithTour>} />
        <Route path="/ai-analysis"   element={<AuthedWithTour><AIAnalysis /></AuthedWithTour>} />
        <Route path="/settings"      element={<AuthedWithTour><Settings /></AuthedWithTour>} />
        <Route path="/admin"         element={<AuthedWithTour><Admin /></AuthedWithTour>} />
        <Route path="/upgrade"       element={<AuthedWithTour><Upgrade /></AuthedWithTour>} />

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
