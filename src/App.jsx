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
      fontFamily:'Inter, system-ui,
