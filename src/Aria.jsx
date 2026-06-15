import { useState, useRef, useEffect } from 'react'
// SEC-05: requests route through CloudFront (app.taxstat360.com) via the shared apiClient,
// which builds every URL from API_BASE_URL — never the raw API Gateway URL — so CloudFront /
// WAF rules apply uniformly. raw:true below keeps Aria's per-status (401/403/5xx) handling.
import { apiFetch } from './utils/apiClient.js'

const N = '#0D1B3E'

const WELCOME = `Hi, I'm Aria — your TaxStat360 AI tax strategist.\n\nI'm here to help you manage your tax liability year-round, uncover deductions, reduce what you owe, and build long-term wealth through smart tax planning.\n\nHere are a few things you can ask me:\n• "What's my estimated quarterly payment?"\n• "Am I paying myself a reasonable S-Corp salary?"\n• "What deductions am I missing?"\n• "How does my K-1 income affect my 1040?"\n\nWhat can I help you with today?`

// Max conversation turns to send to API — prevents unbounded cost growth
const MAX_HISTORY_TURNS = 20

// Aria is mounted globally (its own root in main.jsx, outside the Router), so it
// would otherwise appear on every page — including the public marketing pages.
// Gate it to the authenticated app routes only: signed-in users on the actual
// product, never on the landing / pricing / legal / auth pages.
const ARIA_APP_ROUTES = ['/dashboard', '/calculate-tax', '/calculator', '/tax-return', '/ai-analysis', '/settings', '/upgrade']
function ariaAllowed() {
  try { if (!localStorage.getItem('ts360_logged_in')) return false } catch { return false }
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
  if (path.startsWith('/onboarding')) return true
  return ARIA_APP_ROUTES.includes(path)
}

export default function Aria() {
  // FIX (CLEANUP): Removed unused `useNavigate` import and `nav` variable.
  // The component uses plain <a href> tags for all navigation (login, upgrade),
  // not programmatic nav() calls. The import was dead code from an earlier draft.
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const [planError, setPlanError] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Visibility gate — re-evaluated on navigation so it tracks SPA route changes
  // and login/logout without requiring a full page reload.
  const [visible, setVisible] = useState(ariaAllowed)
  useEffect(() => {
    const check = () => setVisible(ariaAllowed())
    check()
    window.addEventListener('popstate', check)
    window.addEventListener('focus', check)
    const id = setInterval(check, 1500)
    return () => { window.removeEventListener('popstate', check); window.removeEventListener('focus', check); clearInterval(id) }
  }, [])

  useEffect(() => {
    if (open && !welcomed) {
      // intro:true marks the welcome as a display-only message — excluded from API history
      setTimeout(() => { setMsgs([{ role: 'assistant', text: WELCOME, intro: true }]); setWelcomed(true) }, 300)
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 400)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, msgs])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)
    setPlanError(false)
    try {
      // SEC-04: Session token now lives in an httpOnly cookie set by the login Lambda.
      // The browser sends it automatically on credentialed requests — no localStorage read needed.
      // Build conversation history — exclude intro welcome message and cap at MAX_HISTORY_TURNS
      const history = msgs
        .filter(m => !m.intro)
        .slice(-MAX_HISTORY_TURNS)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
      const messages = [...history, { role: 'user', content: userMsg }]

      const r = await apiFetch('/aria', {
        method: 'POST',
        body: { messages },
        credentials: 'include',
        raw: true,
      })

      if (r.status === 401) {
        // Cookie expired or invalid — clear local flags and redirect to login
        localStorage.removeItem('ts360_logged_in')
        localStorage.removeItem('ts360_session_start')
        setMsgs(m => [...m, {
          role: 'assistant',
          text: 'Your session has expired.',
          action: { label: 'Sign in →', href: '/login' }
        }])
        setLoading(false)
        return
      }

      if (r.status === 403) {
        setPlanError(true)
        setMsgs(m => [...m, { role: 'assistant', text: 'Aria is available on the Professional plan and above. Upgrade to unlock AI tax strategy.' }])
        setLoading(false)
        return
      }

      // FIX (aria-5xx): any other non-2xx response (notably a 503 when the /aria
      // service is unavailable) previously fell through to r.json() below, threw on
      // the non-JSON body, and surfaced the generic "Connection error" — which reads
      // like a client/network problem. Distinguish a server outage so the user knows
      // it's temporary and to retry, rather than re-checking their connection.
      if (!r.ok) {
        const msg = r.status >= 500
          ? 'Aria is temporarily unavailable. This is on our side — please try again in a moment.'
          : 'Aria could not process that request. Please try again.'
        setMsgs(m => [...m, { role: 'assistant', text: msg }])
        setLoading(false)
        return
      }

      const d = await r.json()
      setMsgs(m => [...m, { role: 'assistant', text: d.reply || d.response || d.message || 'Sorry, I had trouble responding.' }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  if (!visible) return null

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', bottom: 140, right: 20, width: 360, maxHeight: 500, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(13,27,62,0.18)', display: 'flex', flexDirection: 'column', zIndex: 9998, overflow: 'hidden', border: '1px solid #E2E8F0', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div style={{ background: N, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 30 30" fill="none">
              <path d="M15 2L16.2 10L24 12L16.2 14L15 22L13.8 14L6 12L13.8 10Z" fill="#F5C842"/>
              <path d="M24 1L24.7 4.3L28 5L24.7 5.7L24 9L23.3 5.7L20 5L23.3 4.3Z" fill="#F5C842" opacity="0.85"/>
              <path d="M5 18L5.5 20.5L8 21L5.5 21.5L5 24L4.5 21.5L2 21L4.5 20.5Z" fill="#F5C842" opacity="0.7"/>
            </svg>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Aria</div>
            <div style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>TaxStat360 AI</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ background: m.role === 'user' ? N : '#F8FAFC', color: m.role === 'user' ? '#fff' : '#0D1B3E', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '10px 14px', fontSize: 13, maxWidth: '85%', whiteSpace: 'pre-wrap', lineHeight: 1.5, border: m.role === 'user' ? 'none' : '1px solid #E2E8F0' }}>
                  {m.text}
                  {m.action && (
                    <div style={{ marginTop: 8 }}>
                      <a href={m.action.href} style={{ color: '#2563EB', fontWeight: 700, fontSize: 12 }}>{m.action.label}</a>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '4px 16px 16px 16px', padding: '10px 14px', fontSize: 13, color: '#64748B' }}>Aria is thinking...</div></div>}
            {planError && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#1E40AF', textAlign: 'center' }}>
                <a href="/upgrade" style={{ color: '#2563EB', fontWeight: 700, textDecoration: 'underline' }}>Upgrade to Professional →</a>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid #e8edf5', display: 'flex', gap: 8, background: '#fff' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask Aria anything about your taxes..."
              disabled={loading}
              style={{ flex: 1, border: '1.5px solid #d1d5db', borderRadius: 22, padding: '9px 16px', fontSize: 13, outline: 'none', background: loading ? '#f1f5f9' : '#f8fafc' }}
            />
            <button onClick={send} disabled={loading} style={{ background: N, border: 'none', borderRadius: '50%', width: 38, height: 38, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, opacity: loading ? 0.6 : 1 }}>→</button>
          </div>
          {/* Planning-lane disclaimer — Aria is an AI assistant, so it carries the same
              federal-planning-only scope the rest of the app shows (FederalScopeBanner,
              TaxReturn footer). The authoritative guardrails live server-side in the
              /aria system prompt; this is the user-facing reminder. */}
          <div style={{ padding: '6px 14px 10px', fontSize: 10, color: '#64748B', textAlign: 'center', lineHeight: 1.4, background: '#fff', borderTop: '1px solid #f1f5f9' }}>
            Aria gives general federal tax-planning information for estimates only — not personalized tax, legal, or financial advice. Verify with a licensed professional before filing.
          </div>
        </div>
      )}

      {/* UX-05 FIX: The trigger button now has a visible label so users know what it does
          without having to hover or guess.
          —
          BEFORE (regression): A bare 56×56 navy circle with the Aria star SVG and no text.
          The aria-label / title attributes were present for screen readers and hover tooltips,
          but sighted users on mobile — where title tooltips never fire — had no affordance.
          The button was invisible as a feature; click-through on the widget was low as a result.
          —
          AFTER: Two distinct states driven by the existing `open` boolean:
            • Closed → pill button (auto width, 48px tall): star SVG + "Ask Aria" text.
                        Pill shape is the industry-standard chat widget pattern (Intercom, Drift).
                        Makes the feature discoverable on first visit without any interaction.
            • Open   → circle button (48×48): plain × glyph.
                        Collapses back to a compact close target that doesn't obscure the chat panel.
          —
          Positioning, z-index, onClick, aria-label, and title are all unchanged from the prior
          version so nothing else in the component is affected. */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close Aria AI assistant' : 'Open Aria AI assistant'}
        title={open ? 'Close Aria' : 'Ask Aria — AI Tax Assistant'}
        style={{
          position: 'fixed',
          bottom: 80,
          right: 24,
          height: 48,
          // Pill when closed (fits icon + label), circle when open (just the × glyph)
          width: open ? 48 : 'auto',
          borderRadius: 24,
          background: N,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: open ? 0 : 8,
          padding: open ? 0 : '0 20px 0 14px',
          boxShadow: '0 4px 20px rgba(13,27,62,0.35)',
          zIndex: 9999,
          fontFamily: 'Inter, system-ui, sans-serif',
          transition: 'width 0.2s ease, padding 0.2s ease, border-radius 0.2s ease',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        {open ? (
          /* Close state — compact × so it doesn't cover the chat panel */
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 2L16 16M16 2L2 16" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        ) : (
          /* Open/idle state — star icon + visible label */
          <>
            <svg width="22" height="22" viewBox="0 0 30 30" fill="none" style={{ flexShrink: 0 }}>
              <path d="M15 2L16.2 10L24 12L16.2 14L15 22L13.8 14L6 12L13.8 10Z" fill="#F5C842"/>
              <path d="M24 1L24.7 4.3L28 5L24.7 5.7L24 9L23.3 5.7L20 5L23.3 4.3Z" fill="#F5C842" opacity="0.85"/>
              <path d="M5 18L5.5 20.5L8 21L5.5 21.5L5 24L4.5 21.5L2 21L4.5 20.5Z" fill="#F5C842" opacity="0.7"/>
            </svg>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '0.01em' }}>
              Ask Aria
            </span>
          </>
        )}
      </button>
    </>
  )
}
