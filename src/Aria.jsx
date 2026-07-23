import { useState, useRef, useEffect } from 'react'
import {
  readLoggedIn, removeLoggedIn, removeSessionStart,
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
// PRE-LAUNCH AUDIT B-4 (Jul 2026): Aria must answer from THE ENGINE'S computed return,
// never from the model's own arithmetic. selectTaxSummary() is the same read-only façade
// Step 2 and the Dashboard consume, so Aria cannot disagree with the Tax Tracker.
import { selectTaxSummary } from './utils/calcSelector.js'

// CONSISTENCY PASS (Jul 9 2026): palette from src/theme.js — the CC-M01
// migration finished; local hex constants retired. Aliased so usage sites
// are untouched.
import { NAVY as N } from './theme.js'

// ─────────────────────────────────────────────────────────────────────────────
// PRE-LAUNCH AUDIT — BLOCKER 3 & BLOCKER 4 (Jul 2026)
//
// B-3 (scaffolding leaked to the user). The N-2 guard used to PUSH the verified-facts
// card into `msgs` as a visible assistant turn. Users saw:
//
//     "VERIFIED FIGURES -- ... (Pinned from this app's tax tables; if the answer below
//      conflicts, trust these figures. The chat model's training data may predate the
//      2025 tax act.)"
//
// That is an internal guardrail rendered as product copy. It told a paying customer the
// AI they bought may be working from repealed law, and it made THEM the referee between
// two of our own systems. The facts are now sent to the backend in the request body
// (`verifiedFacts`) for the system turn, and are NEVER added to the message list.
//
// B-4 (Aria fabricated figures). Audit captured two hallucinations on live:
//   • invented "$470,000 of K-1 income" that existed nowhere in the record;
//   • invented an entire 2026 MFJ bracket table — every threshold wrong, and the 35%
//     bracket missing altogether — while the correct thresholds sat in its own context.
// Root cause: the model was handed raw P&L lines and left to do the tax math itself.
// Fix: buildSessionContext() now ships the ENGINE'S COMPUTED RETURN (AGI, taxable income,
// QBI, SE tax, total tax, marginal rate, quarterly) and the outgoing turn carries explicit
// grounding rules forbidding the model from computing or recalling any figure. Aria
// narrates the engine's numbers; it does not produce them.
//
// ANNUAL MAINTENANCE: update ARIA_SYSTEM (backend), VERIFIED_FACT_GUARDS below, and
// TAX_TABLES (src/taxCalc.js) together. They are three views of one set of facts.
// ─────────────────────────────────────────────────────────────────────────────

// AUDIT N-2: the Aria backend model self-reports an Oct-2023 knowledge cutoff and answers
// rate/threshold questions with repealed pre-OBBBA law. These facts are injected into the
// SYSTEM turn server-side — they are never rendered to the user (B-3).
const VERIFIED_FACT_GUARDS = [
  { rx: /bonus\s*depreciation|168\(k\)|cost\s*seg/i,
    fact: '100% bonus depreciation is PERMANENT under IRC Sec. 168(k) as amended by OBBBA (P.L. 119-21 Sec. 70301) for qualified property acquired after Jan 19, 2025. The old 80/60/40/20% phase-down no longer applies to new acquisitions. Cost-seg 5/7/15-year property placed in service in 2026 qualifies for the full 100%.' },
  { rx: /\b179\b/i,
    fact: 'Sec. 179 expensing for 2026: $2,560,000 limit, $4,090,000 phase-out threshold, $32,000 SUV sub-limit (Rev. Proc. 2025-32 Sec. 4.24).' },
  { rx: /401\(?k\)?|sep[- ]?ira|solo\s*401|retirement\s*limit|ira\s*limit/i,
    fact: '2026 retirement limits (IRS Notice 2025-67): 401(k) elective deferral $24,500; Sec. 415(c) total DC limit $72,000 (this caps a SEP-IRA); IRA $7,500 (catch-up $1,100); age-50 401(k) catch-up $8,000; ages 60-63 super catch-up $11,250. A SEP has NO catch-up. Sec. 401(a)(17) compensation limit $360,000.' },
  { rx: /salt|state and local tax/i,
    fact: '2026 SALT cap (OBBBA Sec. 70120): $40,400 ($20,200 MFS), reduced by 30% of MAGI above $505,000 ($252,500 MFS), floor $10,000 ($5,000 MFS).' },
  { rx: /excess business loss|461\(l\)/i,
    fact: '2026 excess business loss threshold (Rev. Proc. 2025-32 Sec. 4.31): $256,000 single / $512,000 MFJ. OBBBA RESET these DOWN from 2025.' },
  { rx: /qbi|199a|qualified business income/i,
    // AUDIT FIX F-5: the single-filer threshold was stated as $201,775 — that is the
    // MARRIED-FILING-SEPARATELY figure. Rev. Proc. 2025-32 Sec. 4.26 reads:
    //   MFJ $403,500 · MFS $201,775 · All other returns $201,750.
    // "All other returns" is where Single and HOH live.
    fact: '2026 Sec. 199A QBI: 20% deduction, made permanent by OBBBA. Threshold amounts (Rev. Proc. 2025-32 Sec. 4.26): $201,750 single/HOH, $201,775 MFS, $403,500 MFJ. Phase-in range: $75,000 (single/HOH/MFS) / $150,000 (MFJ), so the limitation is fully phased in at $276,750 / $276,775 / $553,500. ABOVE the phase-in range the deduction is capped by Sec. 199A(b)(2)(B) at the GREATER of 50% of the business W-2 wages, or 25% of W-2 wages plus 2.5% of UBIA — a sole proprietor with no payroll and no qualified property has a $0 cap. Sec. 199A(i) sets a $400 minimum deduction where active QBI is at least $1,000.' },
  { rx: /standard deduction|tax bracket|marginal rate/i,
    fact: '2026 (Rev. Proc. 2025-32): standard deduction $16,100 single/MFS, $32,200 MFJ, $24,150 HOH. MFJ brackets end at 24,800 (10%), 100,800 (12%), 211,400 (22%), 403,550 (24%), 512,450 (32%), 768,700 (35%), then 37%. Single brackets end at 12,400 / 50,400 / 105,700 / 201,775 / 256,225 / 640,600, then 37%.' },
  { rx: /social security|se tax|self.?employment tax|medicare/i,
    fact: '2026: Social Security wage base $184,500. SE tax 15.3% on 92.35% of net earnings up to the base, then 2.9% Medicare with no cap. Additional Medicare Tax 0.9% on wages plus SE earnings above $200,000 single / $250,000 MFJ / $125,000 MFS (statutory, not indexed).' },
  { rx: /mileage/i,
    fact: '2026 IRS standard mileage rate (Notice 2026-10): 72.5 cents per business mile.' },
]

function verifiedFactsFor(question) {
  return VERIFIED_FACT_GUARDS.filter(g => g.rx.test(question)).map(g => g.fact)
}

// AUDIT F16 FIX: the AI backend replies with markdown emphasis (**bold**), which
// rendered as literal asterisks in the chat bubble. This converts **…** spans to
// <strong> via React elements only — no dangerouslySetInnerHTML, so reply text can
// never inject HTML. Line breaks are already handled by whiteSpace: 'pre-wrap'.
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

// M7: looks like a duplicate of money.js fmt() but is NOT — see history. One app,
// one money format: Aria uses fmt() like every other surface.
import { fmt as fmtUSD } from './utils/money.js'

function readSessionSnapshot() {
  let entities = []
  let k1Total = 0
  let personal = null
  let taxYear = null
  let summary = null
  // M5 (audit F-10): each context source degrades independently to its default —
  // the assistant answers with whatever context IS readable rather than crashing.
  try { const s1 = readStep1State(); entities = s1.entities || []; k1Total = Number(s1.k1Total) || 0 } catch { entities = [] }
  try { personal = readPersonalContext() } catch { personal = null }
  try { taxYear = readTaxYear() } catch { taxYear = null }
  // B-4: the engine's computed return. If the guard rejects the session (incomplete
  // input), summary.ok is false and we simply omit the computed block — Aria is then
  // told, explicitly, that it has no computed figures and must not invent any.
  try { const s = selectTaxSummary(); summary = (s && s.ok) ? s : null } catch { summary = null }
  return { entities, k1Total, personal, taxYear, summary }
}

/**
 * B-4: the ENGINE-COMPUTED return, rendered for the model.
 *
 * These are the only tax figures Aria is ever allowed to state. Every one of them is
 * produced by calcTaxReturn — the same call Step 2 renders — so Aria and the Tax Tracker
 * are incapable of disagreeing about the same record.
 */
function buildComputedBlock(summary) {
  if (!summary) return null
  const rows = [
    ['Adjusted gross income (AGI)',        summary.agi],
    ['Taxable income before §199A',        summary.taxableBeforeQBI],
    ['§199A QBI deduction',                summary.qbi],
    ['Taxable income (final)',             summary.taxableAfterQBI],
    ['Federal income tax',                 summary.fedTax],
    ['Self-employment tax',                summary.seTax],
    ['Additional Medicare Tax (0.9%)',     summary.additionalMedicare],
    ['Net Investment Income Tax (3.8%)',   summary.niitAmount],
    ['Alternative Minimum Tax',            summary.amt],
    ['TOTAL estimated federal tax',        summary.totalTax],
    ['Balance due / (refund)',             summary.balance],
    ['Recommended quarterly payment',      summary.quarterlyRecommended],
  ]
  const lines = rows
    .filter(([, v]) => Number.isFinite(Number(v)))
    .map(([labelTxt, v]) => `${labelTxt}: ${fmtUSD(Number(v))}`)

  if (Number.isFinite(Number(summary.marginalRate))) {
    lines.push(`Marginal ordinary rate: ${(Number(summary.marginalRate) * 100).toFixed(0)}%`)
  }
  // Why the QBI number is what it is — so Aria explains the engine's reasoning instead
  // of inventing its own. These codes come straight from calcQBI.
  const reason = {
    wage:   'capped by the §199A(b)(2)(B) W-2 wage / UBIA limit',
    income: 'capped by the overall 20%-of-taxable-income limit',
    qbi:    'the full 20% of qualified business income (no limit binds)',
    min400: 'set to the §199A(i) OBBBA $400 minimum',
    none:   'not applicable (no qualifying business income)',
  }[summary.qbiLimitApplied]
  if (reason) lines.push(`§199A limit that binds: ${reason}`)
  if (summary.qbiWageDataMissing) {
    lines.push('NOTE: this record reports $0 of W-2 wages and $0 of UBIA, so the §199A wage cap is $0.')
  }
  return lines.join('\n')
}

function buildSessionContext({ entities = [], k1Total = 0, personal = null, taxYear = null, summary = null } = {}) {
  const lines = []
  const types = entities.map(e => e?.type).filter(Boolean)
  if (types.length) lines.push(`Entities: ${types.join('; ')}`)
  // Per-entity dollars so the model can see whether a loss even exists before reciting §469.
  for (const e of entities) {
    if (!e || !e.type) continue
    const p = e.pnl || {}
    const gross = Number(p.grossRevenue) || 0
    const net = (p.netProfit === undefined || p.netProfit === null) ? null : (Number(p.netProfit) || 0)
    const dep = Number(p.depreciation) || 0
    if (gross === 0 && (net === null || net === 0) && dep === 0) continue
    const parts = []
    if (gross) parts.push(`gross ${fmtUSD(gross)}`)
    if (net !== null) parts.push(`net ${fmtUSD(net)}`)
    if (dep) parts.push(`depreciation ${fmtUSD(dep)}`)
    const flags = []
    if (e.isREP) flags.push('REP status claimed')
    if (e.isActiveParticipant) flags.push('§469(i) active participation claimed')
    lines.push(`- ${e.type}${e.own ? ` (${e.own}% owned)` : ''}: ${parts.join(', ')}${flags.length ? ` [${flags.join('; ')}]` : ''}`)
  }
  if (k1Total) lines.push(`Total pass-through (K-1 / Schedule C) income: ${fmtUSD(k1Total)}`)
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

  const computed = buildComputedBlock(summary)
  if (computed) {
    lines.push('')
    lines.push('COMPUTED RETURN (authoritative — produced by the TaxStat360 engine):')
    lines.push(computed)
  }

  if (!lines.length) return null
  return lines.join('\n')
}

/**
 * B-4: the grounding contract. Sent with every turn.
 *
 * The model is a NARRATOR of the engine's output, not a calculator. Every hallucination
 * the audit caught was the model doing tax math or recalling a rate table from memory.
 * Both are now prohibited in the strongest terms the prompt can express, and the
 * backend ARIA_SYSTEM prompt carries the same rules.
 */
const GROUNDING_RULES = [
  'GROUNDING RULES — follow these exactly:',
  '1. The COMPUTED RETURN block below is authoritative. When the user asks what they owe, what their deduction is, what their AGI or taxable income or quarterly payment is, quote THOSE figures verbatim. Do not recompute them.',
  '2. Do NOT perform tax arithmetic. Do not add brackets, do not multiply rates, do not derive a tax liability. If a number is not in the context below, you do not have it.',
  '3. Do NOT state tax brackets, thresholds, rates, contribution limits, or wage bases from memory. Your training data predates the One Big Beautiful Bill Act (P.L. 119-21, July 2025) and is wrong for 2026. Use only figures given to you in this message.',
  '4. Do NOT invent income, entities, or dollar amounts. If the user references something not in the context, say you do not see it in their record and ask them to add it in the Tax Tracker.',
  '5. If you cannot answer from the figures provided, say so plainly and point the user to the Tax Tracker. An honest "I do not have that" is always correct; a plausible guess never is.',
  '6. You explain and model. You do not determine. Never tell the user they DO or DO NOT qualify for a status (Real Estate Professional, SSTB, material participation) — explain the test and tell them to confirm it with their CPA.',
].join('\n')

function suggestedPrompts({ entities = [] } = {}) {
  const types = entities.map(e => e?.type || '')
  const hasRE = types.some(isRealEstateEntity)
  const hasSCorp = types.some(isSCorpEntity)
  const hasSchedC = types.some(isScheduleCType)

  // AUDIT F-17: the old prompts asked Aria to make DETERMINATIONS ("Do I qualify for
  // Real Estate Professional status?", "Can I deduct my rental loss this year?").
  // Answering those is tax advice — which the disclaimer three inches below says Aria
  // does not give. We were inviting the question and disclaiming the answer, and in a
  // dispute the disclaimer is the part that loses. These are reframed toward what the
  // tool is actually good at: EXPLAINING a number the engine already computed, and
  // MODELLING a change. Same user value, no determination.
  const out = []
  if (hasRE) {
    out.push('"Why is my rental loss suspended this year?"')
    out.push('"What are the two tests for Real Estate Professional status?"')
    out.push('"How would a $50,000 cost segregation deduction change my estimate?"')
  }
  if (hasSCorp) {
    out.push('"How does the reasonable-compensation rule work for S-Corps?"')
    out.push('"How does my K-1 income flow into my 1040?"')
  }
  if (hasSchedC) {
    out.push('"What makes up my self-employment tax?"')
    out.push('"How do a Solo 401(k) and a SEP-IRA differ?"')
  }
  out.push('"Explain my quarterly payment."')
  out.push('"Walk me through how my tax was calculated."')

  return [...new Set(out)].slice(0, 4)
}

function buildWelcome(snapshot) {
  const prompts = suggestedPrompts(snapshot)
  return `Hi, I'm Aria — your TaxStat360 assistant.\n\nI can explain the numbers in your Tax Tracker, walk through how a figure was calculated, and model what a change would do to your estimate. I work from your saved record, so my answers match what Step 2 shows.\n\nHere are a few things you can ask me:\n${prompts.map(p => `• ${p}`).join('\n')}\n\nWhat can I help you with today?`
}

// Max conversation turns to send to API — prevents unbounded cost growth
const MAX_HISTORY_TURNS = 20

// Aria is mounted globally (its own root in main.jsx, outside the Router), so it
// would otherwise appear on every page — including the public marketing pages.
const ARIA_APP_ROUTES = ['/dashboard', '/calculate-tax', '/calculator', '/tax-return', '/ai-analysis', '/settings', '/upgrade']
function ariaAllowed() {
  try { if (!readLoggedIn()) return false } catch { return false }
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
  if (path.startsWith('/onboarding')) return true
  return ARIA_APP_ROUTES.includes(path)
}

export default function Aria() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [welcomed, setWelcomed] = useState(false)
  const [planError, setPlanError] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

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
      const history = msgs
        .filter(m => !m.intro)
        .slice(-MAX_HISTORY_TURNS)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))

      const snapshot = readSessionSnapshot()
      const context = buildSessionContext(snapshot)
      // B-3: verified facts go to the MODEL, never to the SCREEN.
      const facts = verifiedFactsFor(userMsg)

      // B-4: the outgoing turn carries the grounding rules + the engine's computed
      // return + any current-law facts the question touches. The visible chat bubble
      // still shows only what the user typed (see setMsgs above — `userMsg`, not
      // `outgoing`), so none of this scaffolding is ever rendered.
      const blocks = [userMsg, '', GROUNDING_RULES]
      if (facts.length) {
        blocks.push('')
        blocks.push('CURRENT LAW (2026, authoritative — overrides your training data):')
        blocks.push(facts.map(f => `- ${f}`).join('\n'))
      }
      if (context) {
        blocks.push('')
        blocks.push('MY RECORD:')
        blocks.push(context)
      } else {
        blocks.push('')
        blocks.push('MY RECORD: (empty — I have not entered figures yet. Do not invent any. Ask me to complete the Tax Tracker.)')
      }
      const outgoing = blocks.join('\n')

      const messages = [...history, { role: 'user', content: outgoing }]

      const r = await apiFetch('/aria', {
        method: 'POST',
        // `context` / `verifiedFacts` are additive: current backends ignore unknown
        // fields; ARIA_SYSTEM lifts them into the system turn where they belong.
        body: {
          messages,
          ...(context ? { context } : {}),
          ...(facts.length ? { verifiedFacts: facts } : {}),
          grounding: GROUNDING_RULES,
        },
        credentials: 'include',
        raw: true,
      })

      if (r.status === 401) {
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

      if (!r.ok) {
        const msg = r.status >= 500
          ? 'Aria is temporarily unavailable. This is on our side — please try again in a moment.'
          : 'Aria could not process that request. Please try again.'
        setMsgs(m => [...m, { role: 'assistant', text: msg }])
        setLoading(false)
        return
      }

      const d = await r.json()
      // B-3: NOTHING is pushed here except the model's reply. The verified-facts card
      // that used to appear as an assistant turn is gone. Do not reintroduce it — if the
      // model needs a fact, put the fact in the request body, not on the user's screen.
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
          <div style={{ padding: '6px 14px 10px', fontSize: 11, color: '#64748B', textAlign: 'center', lineHeight: 1.4, background: '#fff', borderTop: '1px solid #f1f5f9' }}>
            Aria explains the figures in your record for planning purposes only — not personalized tax, legal, or financial advice. Verify with a licensed professional before filing.
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close Aria AI assistant' : 'Open Aria AI assistant'}
        title={open ? 'Close Aria' : 'Ask Aria — AI Tax Assistant'}
        style={{
          position: 'fixed',
          bottom: 80,
          right: 24,
          height: 48,
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
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 2L16 16M16 2L2 16" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        ) : (
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
