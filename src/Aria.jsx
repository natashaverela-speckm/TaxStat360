import { useState, useRef, useEffect } from 'react'
import {
  readLoggedIn, removeLoggedIn, readSessionStart, removeSessionStart,
  // AUDIT F10 (Jul 2026): Aria now reads the active session's entities and
  // personal figures so its welcome prompts and answers reflect the user's
  // actual situation instead of a fixed S-Corp script.
  readStep1State, readPersonalContext, readTaxYear,
} from './utils/sessionState.js'
import { isRealEstateEntity, isSCorpEntity, isScheduleCType } from './utils/entityPredicates.js'
// SEC-05: requests route through CloudFront (app.taxstat360.com) via the shared apiClient,
// which builds every URL from API_BASE_URL — never the raw API Gateway URL — so CloudFront /
// WAF rules apply uniformly. raw:true below keeps Aria's per-status (401/403/5xx) handling.
import { apiFetch } from './utils/apiClient.js'

const N = '#0D1B3E'

// AUDIT N-2 REPO-SIDE MITIGATION (Jul 2026): the Aria backend model self-reports an
// Oct-2023 knowledge cutoff and answers rate/threshold questions with repealed
// pre-OBBBA law (audit captured it advising "20% bonus depreciation" for 2026 -- the
// correct answer is 100%, permanent, P.L. 119-21 Sec. 70301). Until the backend gains
// current-law injection, this client-side guard pins a verified-facts card ABOVE the
// model's reply whenever the question matches a stale-prone topic. Facts below are
// maintained alongside the engine's parameter tables -- update both together.
const VERIFIED_FACT_GUARDS = [
  { rx: /bonus\s*depreciation|168\(k\)|cost\s*seg/i,
    fact: 'Verified: 100% bonus depreciation is PERMANENT under IRC Sec. 168(k) as amended by OBBBA (P.L. 119-21 Sec. 70301) for qualified property acquired after Jan 19, 2025. The old 80%/60%/40%/20% phase-down no longer applies to new acquisitions. Cost-seg 5/7/15-year property placed in service in 2026 qualifies for the full 100%.' },
  { rx: /\b179\b/i,
    fact: 'Verified: Sec. 179 expensing limit is $2.5M with a $4M phase-out threshold for 2025 (OBBBA), indexed for 2026 -- confirm the current-year figure in the Tax Tracker before relying on a chat answer.' },
  { rx: /401\(?k\)?|sep[- ]?ira|solo\s*401|retirement\s*limit|ira\s*limit/i,
    fact: 'Verified 2026 limits (IRS Notice 2025-67): 401(k) elective deferral $24,500; Sec. 415(c) total DC limit $72,000; IRA $7,500 (catch-up $1,100); age-50 401(k) catch-up $8,000.' },
  { rx: /salt|state and local tax/i,
    fact: 'Verified 2026 SALT cap (OBBBA Sec. 70120): $40,400 ($20,200 MFS), reduced by 30% of MAGI above $505,000 ($252,500 MFS), floor $10,000 ($5,000 MFS). PTET elections remain available.' },
  { rx: /excess business loss|461\(l\)/i,
    fact: 'Verified 2026 excess business loss threshold (Rev. Proc. 2025-32 Sec. 4.31): $256,000 single / $512,000 MFJ. OBBBA RESET these DOWN from 2025 ($313K/$626K).' },
  { rx: /qbi|199a|qualified business income/i,
    fact: 'Verified 2026 QBI: 20% deduction, permanent (OBBBA); thresholds $201,775 single / $403,500 MFJ; $75K/$150K phase-in; $400 minimum deduction.' },
  { rx: /standard deduction|tax bracket/i,
    fact: 'Verified 2026 (Rev. Proc. 2025-32): standard deduction $16,100 single / $32,200 MFJ / $24,150 HOH; top 37% bracket starts at $640,600 single / $768,700 MFJ.' },
]

// AUDIT N-2 FINAL (Jul 2026): the current-law brief now lives in the BACKEND
// system prompt (taxstat360-api app/main.py ARIA_SYSTEM), its proper home — it can
// never be sliced out of history or spoofed by a client, and the per-request client
// token cost is gone. The client-side LAW_PRIMER that bridged the gap has been
// removed. The pinned VERIFIED FIGURES card below is deliberately KEPT: zero API
// cost, renders instantly, and is defense-in-depth if the backend ever regresses.
// ANNUAL MAINTENANCE: update ARIA_SYSTEM, these guard facts, and TAX_TABLES together.
function verifiedFactsFor(question) {
  return VERIFIED_FACT_GUARDS.filter(g => g.rx.test(question)).map(g => g.fact)
}

// AUDIT F16 FIX: the AI backend replies with markdown emphasis (**bold**), which
// rendered as literal asterisks in the chat bubble. This converts **…** spans to
// <strong> via React elements only — no dangerouslySetInnerHTML, so reply text can
// never inject HTML. Line breaks are already handled by whiteSpace: 'pre-wrap'.
// Deliberately minimal: other markdown (links, headings) passes through as text.
function renderAriaText(text) {
  const s = String(text ?? '')
  const parts = s.split(/(\*\*[^*]+\*\*)/g)
  if (parts.length === 1) return s
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT F10 (Jul 2026) — session grounding & entity-aware prompts.
//
// The audit asked Aria "Can I deduct my rental loss this year?" while the
// active record showed net rental INCOME. Aria answered with a generic §469
// framework and never noticed the user's own numbers; its four suggested
// prompts were all S-Corp/K-1 flavored, none for the product's real-estate-
// investor audience. Two client-side fixes:
//
//   1) buildSessionContext() summarizes the active session (entity types,
//      tax year, filing status, key dollar figures) and it is sent with every
//      question — appended to the outgoing message text inside a clearly
//      delimited block (guaranteed to reach the model regardless of backend
//      version) AND as a structured `context` field on the request body for
//      the backend to move into the system turn when it's ready. The visible
//      chat bubble shows only what the user typed.
//
//   2) suggestedPrompts() picks the welcome examples from the entity mix:
//      rental-first for Schedule E investors, reasonable-comp for S-Corps,
//      SE-tax/home-office for Schedule C, and the original generic set when
//      no entities exist yet.
//
// Everything is read defensively — a signed-in user with no session data gets
// exactly the old behavior.
// ─────────────────────────────────────────────────────────────────────────────

const fmtUSD = (n) => {
  const num = Number(n) || 0
  return (num < 0 ? '-$' : '$') + Math.round(Math.abs(num)).toLocaleString('en-US')
}

function readSessionSnapshot() {
  let entities = []
  let personal = null
  let taxYear = null
  try { entities = readStep1State().entities || [] } catch { entities = [] }
  try { personal = readPersonalContext() } catch { personal = null }
  try { taxYear = readTaxYear() } catch { taxYear = null }
  return { entities, personal, taxYear }
}

function buildSessionContext({ entities = [], personal = null, taxYear = null } = {}) {
  const lines = []
  const types = entities.map(e => e?.type).filter(Boolean)
  if (types.length) lines.push(`Entities: ${types.join('; ')}`)
  if (taxYear) lines.push(`Tax year: ${taxYear}`)
  if (personal) {
    if (personal.filingStatus) lines.push(`Filing status: ${personal.filingStatus}`)
    const money = [
      ['W-2 income', personal.w2Income],
      ['Federal tax withheld', personal.w2Withheld],
      ['Rental income (personal return)', personal.rentalIncome],
      ['Rental expenses (personal return)', personal.rentalExpenses],
      ['Estimated payments made', personal.estPaid],
      ['Prior-year suspended passive loss', personal.priorSuspendedLoss],
    ]
    for (const [labelTxt, v] of money) {
      const n = Number(v) || 0
      if (n !== 0) lines.push(`${labelTxt}: ${fmtUSD(n)}`)
    }
    if (personal.isREP) lines.push('Real Estate Professional status: claimed')
    if (Number(personal.dependents) > 0) lines.push(`Dependents: ${personal.dependents}`)
  }
  if (!lines.length) return null
  return lines.join('\n')
}

function suggestedPrompts({ entities = [] } = {}) {
  const types = entities.map(e => e?.type || '')
  const hasRE = types.some(isRealEstateEntity)
  const hasSCorp = types.some(isSCorpEntity)
  const hasSchedC = types.some(isScheduleCType)

  const out = []
  // Rental-investor prompts lead when a Schedule E property is on file —
  // this is the product's core real-estate audience.
  if (hasRE) {
    out.push('"Can I deduct my rental loss this year?"')
    out.push('"Would cost segregation or bonus depreciation help on my rental?"')
    out.push('"Do I qualify for Real Estate Professional status?"')
  }
  if (hasSCorp) {
    out.push('"Am I paying myself a reasonable S-Corp salary?"')
    out.push('"How does my K-1 income affect my 1040?"')
  }
  if (hasSchedC) {
    out.push('"How can I lower my self-employment tax?"')
    out.push('"Should I open a Solo 401(k) or SEP-IRA this year?"')
  }
  out.push('"What\'s my estimated quarterly payment?"')
  out.push('"What deductions am I missing?"')

  // De-dupe, cap at 4 so the welcome bubble stays scannable.
  return [...new Set(out)].slice(0, 4)
}

function buildWelcome(snapshot) {
  const prompts = suggestedPrompts(snapshot)
  return `Hi, I'm Aria — your TaxStat360 AI tax strategist.\n\nI'm here to help you manage your tax liability year-round, uncover deductions, reduce what you owe, and build long-term wealth through smart tax planning.\n\nHere are a few things you can ask me:\n${prompts.map(p => `• ${p}`).join('\n')}\n\nWhat can I help you with today?`
}

// Max conversation turns to send to API — prevents unbounded cost growth
const MAX_HISTORY_TURNS = 20

// Aria is mounted globally (its own root in main.jsx, outside the Router), so it
// would otherwise appear on every page — including the public marketing pages.
// Gate it to the authenticated app routes only: signed-in users on the actual
// product, never on the landing / pricing / legal / auth pages.
const ARIA_APP_ROUTES = ['/dashboard', '/calculate-tax', '/calculator', '/tax-return', '/ai-analysis', '/settings', '/upgrade']
function ariaAllowed() {
  try { if (!readLoggedIn()) return false } catch { return false }
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
      // intro:true marks the welcome as a display-only message — excluded from API history.
      // F10: the welcome is built at open time so its example prompts reflect the
      // entities in the CURRENT session (rental-first for Schedule E investors).
      const snapshot = readSessionSnapshot()
      setTimeout(() => { setMsgs([{ role: 'assistant', text: buildWelcome(snapshot), intro: true }]); setWelcomed(true) }, 300)
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

      // F10: ground the model in the user's own record. Only the CURRENT turn
      // carries the context block (history entries stay as displayed), so the
      // model always sees the freshest figures without duplicated boilerplate.
      const snapshot = readSessionSnapshot()
      const context = buildSessionContext(snapshot)
      const outgoing = context
        ? `${userMsg}\n\n[Session context — figures from my TaxStat360 record. Ground your answer in these before citing general rules; if a rule doesn't apply to my numbers, say so:\n${context}]`
        : userMsg
      const messages = [...history, { role: 'user', content: outgoing }]

      const r = await apiFetch('/aria', {
        method: 'POST',
        // `context` is additive: current backends ignore unknown fields; the
        // planned ARIA_SYSTEM upgrade will lift it into the system turn.
        body: context ? { messages, context } : { messages },
        credentials: 'include',
        raw: true,
      })

      if (r.status === 401) {
        // Cookie expired or invalid — clear local flags and redirect to login
        removeLoggedIn()
        removeSessionStart()
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
      // N-2 guard: pin verified figures ahead of the model's reply on stale-prone topics.
      const _facts = verifiedFactsFor(userMsg)
      if (_facts.length) {
        setMsgs(m => [...m, { role: 'assistant', verified: true,
          text: 'VERIFIED FIGURES -- ' + _facts.join('\n\n') + '\n\n(Pinned from this app\u2019s tax tables; if the answer below conflicts, trust these figures. The chat model\u2019s training data may predate the 2025 tax act.)' }])
      }
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
                  {renderAriaText(m.text)}
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
            <button onClick={send} disabled={loading} aria-label="Send message to Aria" style={{ background: N, border: 'none', borderRadius: '50%', width: 38, height: 38, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, opacity: loading ? 0.6 : 1 }}>→</button>
          </div>
          {/* Planning-lane disclaimer — Aria is an AI assistant, so it carries the same
              federal-planning-only scope the rest of the app shows (FederalScopeBanner,
              TaxReturn footer). The authoritative guardrails live server-side in the
              /aria system prompt; this is the user-facing reminder. */}
          <div style={{ padding: '6px 14px 10px', fontSize: 11, color: '#64748B', textAlign: 'center', lineHeight: 1.4, background: '#fff', borderTop: '1px solid #f1f5f9' }}>
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
