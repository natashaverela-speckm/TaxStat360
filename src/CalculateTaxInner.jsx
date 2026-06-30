// src/CalculateTaxInner.jsx
// Step 1 of the TaxStat360 two-step flow: Business Entity Entry.
// Users connect accounting software (QuickBooks, Xero, Wave, FreshBooks)
// or enter P&L figures manually, then advance to Step 2 (TaxReturn.jsx).
//
import { useState, useEffect, useRef, useCallback } from 'react'
import { removeConnectedApp, readXeroRefresh, writeXeroRefresh } from './utils/sessionState.js'
import { useNavigate } from 'react-router-dom'
import { readPersonalContext, readTaxYear, writeStep1State, writeTaxYear, readStep1StateRaw, readUserRecords, readActiveRecordId, readActiveRecordName, writeActiveRecord, syncRecordToServer, readPresetEntityType, clearPresetEntityType, writeStep1Entities, write2FANudge, read2FANudge, readGotoForm, clearGotoForm } from './utils/sessionState.js'
import { signOut } from './utils/SignOut'
import { nf } from './utils/money.js'
import LockedFeature, { isPro } from './LockedFeature'
import EntityCompareModal from './EntityCompareModal'
import { apiFetch } from './utils/apiClient.js'
import { ENTITY_TYPES, INTEGRATIONS, API_BASE_URL, CURRENT_TAX_YEAR, DEFAULT_TAX_YEAR, SUPPORTED_TAX_YEARS, STEP3_LABEL, FINANCIAL_LABELS, DEFAULT_OFFICER_SALARY_FRACTION, SCORP_REASONABLE_COMP_RATIO_THRESHOLD, SCORP_REVENUE_SALARY_THRESHOLD } from './constants.js'
import { integrationKey } from './utils/integrations.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R } from './theme.js'
import { fmt, formatTimestamp, formatRelativeTime } from './utils/money.js'
import { ownPct, isSCorpEntity, isCCorpEntity, isPassthroughEntity, isRealEstateEntity, issuesK1Entity, isScheduleCType } from './utils/entityPredicates.js'
import InfoTip from './components/InfoTip.jsx'

// ─── Color palette ──────────────────────────────────────────────────────────
const ENTITY_COLORS = [B, '#7C3AED', '#0891B2', '#D97706', '#059669', '#DC2626']

// ─── Helpers ─────────────────────────────────────────────────────────────────
// nf() (numeric coercion) is imported from utils/parseMoney.js — single shared definition (audit C-2).

/**
 * Entity-card "result" label (the small caption above the net figure on each Step-1
 * entity card). Names the line by HOW the result reaches the personal return, so we
 * only say "K-1" for entities that actually issue one.
 *
 * Audit Category A: the old code was `isCCorp ? 'Net Profit' : 'Net / K-1'`, which
 * labeled a directly-held Schedule E rental AND a Schedule C sole prop as "K-1" — neither
 * issues one. Binds to issuesK1Entity() (S-corp + partnership only); a positive check so
 * any future entity type never silently inherits the "K-1" label.
 */
export function entityResultLabel(type) {
  if (issuesK1Entity(type)) return 'Net / K-1'      // S-corp (1120-S) + partnership (1065)
  if (isRealEstateEntity(type)) return 'Net (Sch. E)' // directly-held rental, Part I — no K-1
  if (isScheduleCType(type)) return 'Net (Sch. C)'    // sole prop / SMLLC — no K-1
  if (isCCorpEntity(type)) return 'Net Profit'        // entity-level tax; no personal K-1
  return 'Net'
}

function MoneyInput({ value, onChange, placeholder, style, disabled, id }) {
  const [raw, setRaw] = useState(value || '')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      const n = parseFloat(String(value || '').replace(/,/g, ''))
      setRaw(Number.isFinite(n) && n !== 0 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : (value || ''))
    }
  }, [value, focused])

  const handleChange = (e) => {
    const input = e.target
    const cursorPos = input.selectionStart
    const prevVal = input.value
    const prevCommasBefore = (prevVal.slice(0, cursorPos).match(/,/g) || []).length

    const stripped = e.target.value.replace(/[^0-9-]/g, '')
    const isNeg = stripped.startsWith('-')
    const digits = stripped.replace(/^-/, '')
    const n = parseInt(digits, 10)
    const formatted = stripped === '' ? '' : stripped === '-' ? '-' :
      (isNeg ? '-' : '') + (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : digits)

    setRaw(formatted)
    onChange(stripped)

    requestAnimationFrame(() => {
      if (input && document.activeElement === input) {
        const newCommasBefore = (formatted.slice(0, cursorPos).match(/,/g) || []).length
        const diff = newCommasBefore - prevCommasBefore
        const newPos = Math.max(0, Math.min(cursorPos + diff, formatted.length))
        input.setSelectionRange(newPos, newPos)
      }
    })
  }

  const handleFocus = () => { setFocused(true) }

  const handleBlur = () => {
    setFocused(false)
    const n = parseFloat(String(raw).replace(/,/g, ''))
    if (Number.isFinite(n)) {
      const formatted = n.toLocaleString('en-US', { maximumFractionDigits: 0 })
      setRaw(formatted)
      onChange(String(n))
    }
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={placeholder || '0'}
      disabled={disabled}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={{
        width: '100%', padding: '10px 12px',
        border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14,
        fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
        background: disabled ? '#F8FAFC' : '#fff',
        color: disabled ? '#94A3B8' : N,
        ...style,
      }}
    />
  )
}

// ─── ReasonableCompIndicator ─────────────────────────────────────────────────
// Uses SCORP_REVENUE_SALARY_THRESHOLD from constants.js (Rev. Rul. 74-44 / Watson).

// F6 FIX (UX audit): collapsible "Why this matters & sources" used by the
// reasonable-comp warnings so the plain takeaway + suggested number lead and the
// case-law / regulation citations are tucked away. Hoisted to module scope (not
// nested in ReasonableCompIndicator) so it doesn't remount/collapse on re-render.
// `color` themes the disclosure to match each state's card.
function CompSources({ color, children }) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color, opacity: 0.8 }}>
        Why this matters &amp; sources
      </summary>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color, opacity: 0.92 }}>
        {children}
      </div>
    </details>
  )
}

function ReasonableCompIndicator({ officerSal, netProfit, grossRevenue, isSCorp }) {
  if (!isSCorp || netProfit <= 20000) return null

  const totalComp = officerSal + Math.max(0, netProfit)
  const ratio = totalComp > 0 ? officerSal / totalComp : 0
  const _compRatio = SCORP_REASONABLE_COMP_RATIO_THRESHOLD
  const minTarget = Math.round(_compRatio / (1 - _compRatio) * Math.max(0, netProfit))

  // F-02: Watson revenue-ratio advisory — independent of total-comp ratio
  const revRatio = (grossRevenue > 0 && officerSal > 0) ? officerSal / grossRevenue : null
  const watsonWarning = revRatio !== null && revRatio < SCORP_REVENUE_SALARY_THRESHOLD
  // C-8 FIX: in a loss year the 35-45% gross-receipts heuristic is unreliable — the
  // denominator (total compensation) is distorted by the negative net income and the
  // recommended salary figure can be misleading. In that case, surface a loss-year note
  // instead of a dollar suggestion. netProfit here is the entity's net profit before
  // officer salary; a negative value signals the entity lost money this year.
  const isLossYear = netProfit < 0

  if (officerSal === 0) {
    return (
      <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 14px', marginTop: 10, fontSize: 13 }}>
        <div role="alert" style={{ fontWeight: 700, color: R, marginBottom: 4 }}>🚨 No Officer Compensation Set</div>
        <div style={{ color: '#7F1D1D', lineHeight: 1.6 }}>
          You haven't entered a W-2 salary. As an S-Corp owner working in the business, pay yourself a
          reasonable salary <em>before</em> taking distributions.
          {/* C-8 FIX: don't suggest a gross-receipts-based dollar figure in a loss year */}
          {isLossYear
            ? <> In a loss year, reasonable compensation is determined primarily by the <em>value of services you rendered</em> — not by gross receipts or net income. Discuss the appropriate salary with your CPA, who can evaluate comparable market pay for your role.</>
            : <> A common starting point here is about <strong>{fmt(minTarget)}/yr</strong> (≈35–45% of your total take from the business). Note: this is a rough heuristic, not a statutory floor — the correct amount reflects the value of services you personally performed.</>
          }
        </div>
        <CompSources color="#7F1D1D">
          Paying $0 salary while taking distributions is the most common S-Corp audit trigger — the IRS
          can reclassify distributions as wages and assess back FICA plus penalties. Authority:
          Rev. Rul. 74-44; Treas. Reg. §1.162-7. The 35–45% range is a practitioner heuristic, not a
          statutory safe harbor — reasonable comp ultimately reflects the value of services you provide.
        </CompSources>
      </div>
    )
  }

  if (ratio < SCORP_REASONABLE_COMP_RATIO_THRESHOLD) {
    return (
      <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 10, padding: '12px 14px', marginTop: 10, fontSize: 13 }}>
        <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Officer Compensation May Be Too Low</div>
        <div style={{ color: '#78350F', lineHeight: 1.6 }}>
          Consider raising your W-2 salary to about <strong>{fmt(minTarget)}</strong>. Right now it's
          {' '}{(ratio * 100).toFixed(0)}% of your total officer take ({fmt(officerSal)} of {fmt(totalComp)});
          a common target is 35–45%. Paying a reasonable salary first, then taking the rest as
          distributions, is what keeps the S-Corp structure defensible.
          {watsonWarning && (
            <> Your salary is also <strong>{(revRatio * 100).toFixed(0)}%</strong> of gross receipts
            ({fmt(officerSal)} ÷ {fmt(grossRevenue)}) — under the ~30% many advisors watch for in
            single-owner service businesses.</>
          )}
        </div>
        <CompSources color="#78350F">
          The IRS can recharacterize distributions as wages (with back FICA and penalties) when an
          owner-employee's salary is unreasonably low. Key authority: Watson v. Commissioner,
          668 F.3d 1008 (8th Cir. 2012); Treas. Reg. §1.162-7; Rev. Rul. 74-44. The 35–45% range is a
          practitioner heuristic, not a safe harbor — reasonable comp depends on the value of services
          you provide.
        </CompSources>
      </div>
    )
  }

  return (
    <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 10, padding: '12px 14px', marginTop: 10, fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Officer Compensation Looks Reasonable</div>
      <div style={{ color: '#166534', lineHeight: 1.6 }}>
        Your salary is {(ratio * 100).toFixed(0)}% of total officer compensation — within the commonly
        recommended 35–45% range. Make sure FICA payroll taxes are withheld and remitted (quarterly
        Form 941).
        {watsonWarning && (
          <> One thing to watch: your salary is <strong>{(revRatio * 100).toFixed(0)}%</strong> of gross
          receipts ({fmt(officerSal)} ÷ {fmt(grossRevenue)}) — under the ~30% some advisors flag even when
          the total-comp ratio looks fine.</>
        )}
      </div>
      {watsonWarning && (
        <CompSources color="#166534">
          Treas. Reg. §1.162-7; Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012). Salary-to-receipts
          is one factor the IRS weighs alongside the total-compensation ratio.
        </CompSources>
      )}
    </div>
  )
}

// ─── Integration tile ─────────────────────────────────────────────────────────
// F19 FIX: reads localStorage ts360_{provider}_connected and ts360_{provider}_failed
//   to render correct connected / failed / default state on every render.
// F23 FIX: reads ts360_{provider}_synced_at to display last-synced timestamp.
//   onSync prop triggers a manual re-fetch.
function IntegrationTile({ integ, onConnect, onDisconnect, onSync, syncDiff }) {
  // Derive live connection state from localStorage on every render
  const isConnected = localStorage.getItem(integrationKey(integ.id, 'connected')) === 'true'
  const hasFailed   = localStorage.getItem(integrationKey(integ.id, 'failed'))   === 'true'
  const syncedAt    = localStorage.getItem(integrationKey(integ.id, 'syncedAt'))
  const syncedLabel = formatRelativeTime(syncedAt)

  return (
    <div style={{
      background: isConnected ? integ.bg : hasFailed ? '#FEF2F2' : '#fff',
      border: '1.5px solid ' + (isConnected ? integ.color : hasFailed ? '#FECACA' : '#E2E8F0'),
      borderRadius: 10, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 8,
      transition: 'all 0.15s', overflow: 'hidden',
    }}>
      <div
        onClick={() => !isConnected && !hasFailed && onConnect(integ.id)}
        style={{
          width: 32, height: 32, borderRadius: 8, background: integ.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
          cursor: isConnected ? 'default' : 'pointer',
        }}>
        {integ.abbr}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: N }}>{integ.name}</div>
        {/* F19 FIX: status line reflects actual connection state */}
        {isConnected && hasFailed ? (
          <div style={{ fontSize: 11, color: R, fontWeight: 600 }}>
            Sync failed — use ⟳ Sync now
          </div>
        ) : isConnected ? (
          <div style={{ fontSize: 11, color: integ.color, fontWeight: 600 }}>
            ✓ Connected
            {/* F23 FIX: show last-synced timestamp when available */}
            {syncedLabel && (
              <span style={{ color: SL, fontWeight: 400, marginLeft: 6 }}>· Synced {syncedLabel}</span>
            )}
          </div>
        ) : hasFailed ? (
          <div style={{ fontSize: 11, color: R, fontWeight: 600 }}>Connection failed — try again</div>
        ) : (
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Click to connect →</div>
        )}
        {/* F23 FIX: show revenue diff after a manual sync */}
        {isConnected && syncDiff && (
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>
            {syncDiff}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        {isConnected ? (
          <>
            {/* F23 FIX: "Sync now" button for manual re-fetch */}
            {onSync && (
              <button
                onClick={() => onSync(integ.id)}
                style={{
                  background: 'none', border: '1px solid ' + integ.color + '66',
                  borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700,
                  color: integ.color, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                ⟳ Sync now
              </button>
            )}
            <button
              onClick={() => onDisconnect(integ.id)}
              style={{
                background: 'none', border: '1px solid ' + integ.color + '66',
                borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700,
                color: integ.color, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={() => hasFailed ? onConnect(integ.id) : onConnect(integ.id)}
            style={{
              background: hasFailed ? '#FEF2F2' : integ.color,
              border: hasFailed ? '1px solid #FECACA' : 'none',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
              color: hasFailed ? R : '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}>
            {hasFailed ? 'Retry' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Name record modal ────────────────────────────────────────────────────────
function NameRecordModal({ defaultName, onConfirm, onSkip }) {
  const [name, setName] = useState(defaultName || '')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px', maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: N, margin: '0 0 8px' }}>Name This Record</h3>
        <p style={{ fontSize: 13, color: SL, margin: '0 0 16px', lineHeight: 1.6 }}>
          Give this record a descriptive name so you can find it later — or skip and we'll use the date.
        </p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. 2025 Q3 Planning, S-Corp Scenario A..."
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()) }}
          autoFocus
          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box', outline: 'none', color: N }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onSkip} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>
            Skip (use date)
          </button>
          <button
            onClick={() => onConfirm(name.trim() || defaultName)}
            disabled={!name.trim()}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: name.trim() ? B : '#94A3B8', color: '#fff', fontSize: 13, fontWeight: 700, cursor: name.trim() ? 'pointer' : 'default' }}>
            Save with Name →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Manual entry panel ───────────────────────────────────────────────────────
// Exported for the F2 live-commit regression test (CalculateTaxInner.test.jsx).
export function ManualEntryPanel({ entity, onUpdate, onCancel, idx }) {
  // BUG-A ROOT FIX: the live-bind useEffect below has a stale closure on `entity`
  // because `entity` is intentionally excluded from the dep array (including it would
  // create an update loop). Any field set on the entity via onUpdate OUTSIDE this
  // panel — e.g. box17V_sstb via the §199A checkbox, box17V_wages, qbiLossCarryforward —
  // was being silently overwritten back to its old value whenever the effect re-ran
  // (triggered by any P&L field change). The fix: keep a ref that always holds the
  // LATEST entity prop so the effect reads fresh values for the fields it does not own.
  const entityRef = useRef(entity)
  useEffect(() => { entityRef.current = entity })   // sync ref on every render, no deps
  const pnl = entity.pnl || {}
  const [manRev,        setManRev]        = useState(String(nf(pnl.grossRevenue)                         || ''))
  const _reloadOpex = Math.max(0,
    nf(pnl.totalExpenses)
    - nf(entity.depreciation || pnl.depreciation)
    - nf(pnl.officerSalary || entity.officerW2)
    - nf(pnl.advertising)
    - nf(pnl.otherDeductions))
  const [manExp,        setManExp]        = useState(String(_reloadOpex || ''))
  const [manDep,        setManDep]        = useState(String(nf(entity.depreciation || pnl.depreciation)  || ''))
  const [manOfficerSal, setManOfficerSal] = useState(String(nf(pnl.officerSalary  || entity.officerW2)   || ''))
  const [manAdv,        setManAdv]        = useState(String(nf(pnl.advertising)                          || ''))
  const [manOther,      setManOther]      = useState(String(nf(pnl.otherDeductions)                      || ''))
  // FINDING-1 FIX: K-1 Box 1 direct-entry mode.
  // The manual P&L form (gross receipts − expenses) cannot represent a K-1 loss from
  // a filed return without the user reconstructing the full P&L — which is impossible
  // from a K-1 alone. K-1 Box 1 is the SIGNED net ordinary business income; losses are
  // negative. When useK1Direct is true, the user enters Box 1 directly and the P&L
  // decomposition is hidden. The engine already uses pnl.netProfit as-is (taxCalc.js
  // entitiesLimited map); setting it directly is the correct fix path.
  // Restore from entity state on re-open: if the entity has a k1DirectMode flag,
  // pre-select the direct mode and populate the field from pnl.netProfit.
  const [useK1Direct,  setUseK1Direct]   = useState(!!entity.k1DirectMode)
  const [manK1Direct,  setManK1Direct]   = useState(
    entity.k1DirectMode ? String(nf(pnl.netProfit) || '') : ''
  )

  const rv  = nf(manRev)
  const ex  = nf(manExp)
  const dep = nf(manDep)
  const sal = nf(manOfficerSal)
  const adv = nf(manAdv)
  const oth = nf(manOther)

  const isSCorp = isSCorpEntity(entity.type)
  const isCCorp = isCCorpEntity(entity.type)
  const isPartnership = /partner|mmllc/i.test(entity.type || '')
  const isRE = isRealEstateEntity(entity.type)
  const effectiveSal = (isSCorp || isCCorp) ? sal : 0

  const totalExpenses = ex + dep + effectiveSal + adv + oth
  const manNetProfit  = rv - totalExpenses

  const officerExceedsRevenue   = effectiveSal > rv && effectiveSal > 0 && rv > 0
  const officerExceedsNetProfit = !officerExceedsRevenue && effectiveSal > (rv - ex - dep) && effectiveSal > 0 && rv > 0

  function applyManual() {
    if (rv > 0 || totalExpenses > 0) {
      onUpdate(idx, {
        ...entityRef.current,   // BUG-A ROOT FIX: use ref, not stale closure
        officerW2: effectiveSal,
        pnl: {
          grossRevenue:    rv,
          totalExpenses,
          officerSalary:   effectiveSal,
          depreciation:    dep,
          advertising:     adv,
          otherDeductions: oth,
          netProfit:       rv - totalExpenses,
          categories: {},
        },
        connectedId: null,
        isManual: true,
      })
    }
    onCancel()
  }

  // F2 FIX (UX audit — Critical): the manual P&L used to commit to the parent
  // entity ONLY when the user clicked "Save P&L →". If they instead collapsed the
  // panel (the "Edit P&L" toggle), collapsed the entity card, or advanced to Step 2,
  // every figure they typed was silently discarded — so the entity reached Step 2/3
  // with an empty $0 P&L (the "I typed my income and the app says I have none" bug).
  // Live-bind the fields to the entity (the audit's recommended fix) so revenue and
  // expenses persist as typed, exactly like the W-2 field in Step 2. The confirm
  // button (relabeled "Done" in the F9 save-button consolidation; formerly "Save P&L →")
  // stays as a confirm-and-close affordance but is no longer the only way the data is
  // saved. The numeric fields fully determine the committed pnl, so onUpdate /
  // entity / idx are intentionally excluded from the deps: including the callback or
  // the entity object would re-fire this on every parent re-render (and could loop).
  useEffect(() => {
    // Do not clobber a live software sync when the panel opens with empty defaults.
    if (entityRef.current.connectedId) return
    // FINDING-1 FIX: K-1 direct mode bypasses the P&L decomposition entirely.
    // netProfit is set directly from the K-1 Box 1 value (may be negative).
    // The entity is flagged with k1DirectMode so the panel restores correctly on re-open.
    if (useK1Direct) {
      const k1Net = nf(manK1Direct)
      onUpdate(idx, {
        ...entityRef.current,
        officerW2: effectiveSal,
        k1DirectMode: true,
        pnl: {
          grossRevenue:    0,
          totalExpenses:   0,
          officerSalary:   0,
          depreciation:    0,
          advertising:     0,
          otherDeductions: 0,
          netProfit:       k1Net,
          categories: (entityRef.current.pnl && entityRef.current.pnl.categories) || {},
        },
        connectedId: null,
        isManual: true,
      })
      return
    }
    onUpdate(idx, {
      // BUG-A ROOT FIX: use entityRef.current (always fresh) instead of `entity`
      // (stale closure). Without this, every P&L field change re-ran this effect
      // with the OLD entity, silently resetting box17V_sstb and other QBI fields
      // that were set by other onUpdate calls (e.g. the SSTB checkbox) after this
      // panel last rendered. entityRef.current is kept current by the sync effect above.
      ...entityRef.current,
      officerW2: effectiveSal,
      k1DirectMode: false,
      // BUG-B FIX (W-2 wages disconnected from officer comp): reset box17V_wages
      // to '' whenever officer salary changes so the engine's fallback chain at
      // taxCalc.js L389 (box17V_wages || officerW2 || pnl.officerSalary) resolves
      // to officerW2, which IS synced above. A stale box17V_wages value would
      // otherwise shadow officerW2 and compute the wage limit on the wrong figure.
      ...(effectiveSal > 0 || entityRef.current.box17V_wages !== '' ? { box17V_wages: '' } : {}),
      pnl: {
        grossRevenue:    rv,
        totalExpenses,
        officerSalary:   effectiveSal,
        depreciation:    dep,
        advertising:     adv,
        otherDeductions: oth,
        netProfit:       rv - totalExpenses,
        categories: (entityRef.current.pnl && entityRef.current.pnl.categories) || {},
      },
      connectedId: null,
      isManual: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rv, ex, dep, sal, adv, oth, effectiveSal, totalExpenses, useK1Direct, manK1Direct])

  const lbl = { fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }
  const inp = { fontSize: 14 }

  return (
    <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 18px', marginTop: 10, border: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: N }}>Manual Entry</div>
        {/* FINDING-1 FIX: K-1 Box 1 direct entry toggle.
            Users with a filed K-1 can enter Box 1 directly instead of reconstructing
            the full P&L from gross receipts/expenses — which is impossible from a K-1 alone.
            Toggle resets the mode; the live-bind effect handles both paths. */}
        {isPT && !isRE && (
          <button
            onClick={() => { setUseK1Direct(v => !v); setManK1Direct('') }}
            style={{ fontSize: 11, fontWeight: 600, color: useK1Direct ? B : SL, background: 'none', border: '1px solid ' + (useK1Direct ? B : '#CBD5E1'), borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
          >
            {useK1Direct ? '← Switch to P&L entry' : 'Have a K-1? Enter Box 1 directly →'}
          </button>
        )}
      </div>
      {useK1Direct && isPT && !isRE ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '10px 14px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE', fontSize: 12, color: '#1E40AF', marginBottom: 4 }}>
            <strong>K-1 Box 1 — Ordinary Business Income (Loss).</strong> Enter your share of net ordinary business income from the K-1 exactly as shown. Losses are negative — enter a minus sign (e.g. −343,443). This bypasses the gross receipts / expense breakdown.
          </div>
          <div>
            <label style={lbl}>
              K-1 Box 1 — Net Ordinary Business Income (Loss)
              <InfoTip text={'Enter the amount from Box 1 of your K-1 exactly as shown — positive for profit, negative for loss.\n\nS-Corp: Form 1120-S, Schedule K-1, Box 1 "Ordinary business income (loss)"\nPartnership: Form 1065, Schedule K-1, Box 1 "Ordinary business income (loss)"\n\nThis is your SHARE of the entity\'s ordinary income — already scaled by your ownership percentage on the K-1. Do not enter the entity\'s total income; enter only your share as shown on your K-1.\n\nA K-1 loss (negative Box 1) may be limited by your stock or debt basis under IRC §1366(d). If your loss is limited, expand the Stock & Debt Basis section below to enter your Form 7203 basis — the engine will apply the §1366(d) limitation automatically.'} wide />
            </label>
            <MoneyInput
              value={manK1Direct}
              onChange={setManK1Direct}
              placeholder="0 (negative for a loss)"
              style={{ ...inp, border: '1.5px solid ' + B }}
            />
          </div>
          {isSCorp && (
            <div>
              <label style={lbl}>
                {FINANCIAL_LABELS.officerCompensationField}
                <InfoTip text={'Your W-2 officer salary from this S-Corp. Enter this even in K-1 direct mode — the salary appears on your W-2 and flows to your personal return separately from the K-1 income. It also determines your §199A W-2 wage limitation and your FICA tax obligation.'} wide />
              </label>
              <MoneyInput value={manOfficerSal} onChange={setManOfficerSal} placeholder="0" style={inp} />
            </div>
          )}
          {nf(manK1Direct) !== 0 && (
            <div style={{ marginTop: 4, padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span style={{ color: N }}>Net / K-1 Box 1</span>
              <span style={{ color: nf(manK1Direct) >= 0 ? G : R }}>{fmt(nf(manK1Direct))}</span>
            </div>
          )}
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={lbl}>
            {isRE ? 'Rental Income (gross rents received)' : FINANCIAL_LABELS.grossReceiptsField}
            <InfoTip text={isRE ? 'Total gross rents received from this rental property before any expenses (Schedule E, line 3).' : 'Total gross receipts before any deductions — everything the business took in, before any expenses. For S-Corps and partnerships, enter the entity\'s gross receipts (your taxable share flows via K-1, not the full gross receipts amount). For Schedule C filers, enter Line 1 gross receipts, not Line 3 gross profit. Do NOT net out officer compensation — enter that separately below.'} />
          </label>
          <MoneyInput value={manRev} onChange={setManRev} placeholder="0" style={inp} />
        </div>
        <div>
          <label style={lbl}>
            {isRE ? 'Rental Operating Expenses (excl. depreciation, advertising)' : FINANCIAL_LABELS.operatingExpensesField}
            <InfoTip text={isRE ? 'Recurring rental expenses: repairs, maintenance, property management, insurance, property tax, utilities, HOA dues, etc. (Schedule E). Exclude depreciation and advertising — those have their own fields below.' : 'Recurring business expenses: rent, utilities, software, insurance, professional fees, payroll (non-owner), etc. Exclude officer compensation, depreciation, and advertising — those have their own fields below.'} />
          </label>
          <MoneyInput value={manExp} onChange={setManExp} placeholder="0" style={inp} />
        </div>
        <div>
          <label style={lbl}>
            {/* TERMINOLOGY FIX 3.1: "Sec. 179 + MACRS + Bonus" used mixed notation. Every other IRC
                section in the app uses the § symbol (§199A, §469, §1366, etc.). "Bonus" is informal
                for §168(k) bonus depreciation. Normalized to § style throughout. */}
            Depreciation (§179 + MACRS + §168(k) Bonus)
            <InfoTip text={'§179 first-year expensing, MACRS (Modified Accelerated Cost Recovery System) regular depreciation, and §168(k) bonus depreciation on qualified business assets.\n\nEnter the total deductible depreciation for this entity this year.\n\nDo NOT include depreciation on personal-use assets.\n\nFor vehicles: use either the standard mileage rate OR actual expenses (including depreciation) — you cannot use both methods for the same vehicle.\n\nEnter the depreciation you (or your accountant) already computed — TaxStat360 uses this figure as entered and does not calculate bonus depreciation for you. For 2025 the §168(k) bonus rate is 40% for property placed in service on or before Jan 19, 2025 and 100% for property placed in service after Jan 19, 2025 (OBBBA; IRS Notice 2026-11).'} wide />
          </label>
          <MoneyInput value={manDep} onChange={setManDep} placeholder="0" style={inp} />
        </div>
        {(isSCorp || isCCorp) && (
          <div>
            <label style={lbl}>
              {FINANCIAL_LABELS.officerCompensationField}
              <InfoTip text={isCCorp
                ? 'C-Corp owner-employees are paid a W-2 salary. The salary (and the employer-side payroll tax on it) is deductible to the corporation, reducing the profit subject to the 21% corporate tax. Reasonable-compensation rules still apply. The remaining after-tax corporate profit, when distributed, is taxed AGAIN as qualified dividends on your personal return — the classic C-Corp double taxation.'
                : 'S-Corp owners must pay themselves reasonable W-2 compensation for services rendered (Rev. Rul. 74-44). Too little salary is an audit trigger.\n\nA common starting point: 35–45% of your total S-Corp take (salary ÷ (salary + K-1 net income)). For example, if the S-Corp earns $200K net, a salary of $70K–$90K is a reasonable range — though the right number depends on industry, comparable wages, and time devoted.\n\nNote: "K-1 net income" here means ordinary business income (Box 1 of your K-1), not distributions. Distributions are cash drawn from the S-Corp and can differ from your share of net profit.\n\nPaying below-market salary:\n• IRS audit risk (Rev. Rul. 74-44)\n• Reduces your §199A W-2 wage limitation\n• Triggers the Reasonable Compensation Alert below\n\nFICA taxes (15.3% combined) apply to your W-2 salary — the K-1 business income that passes through is not subject to FICA or self-employment tax (whether or not it is distributed), which is the core S-Corp tax advantage.'} wide />
            </label>
            <MoneyInput value={manOfficerSal} onChange={setManOfficerSal} placeholder="0" style={inp} />
            {officerExceedsRevenue && (
              <div style={{ fontSize: 12, color: R, marginTop: 4, fontWeight: 600 }}>
                ⚠ Officer compensation exceeds gross receipts — verify your numbers.
              </div>
            )}
            {officerExceedsNetProfit && !officerExceedsRevenue && (
              <div style={{ fontSize: 12, color: '#D97706', marginTop: 4, fontWeight: 600 }}>
                ⚠ Officer compensation exceeds net profit after operating expenses — this entity will show a net loss.
              </div>
            )}
            <ReasonableCompIndicator
              officerSal={sal}
              netProfit={Math.max(0, manNetProfit)}
              grossRevenue={nf(manRev)}
              isSCorp={isSCorp}
            />
          </div>
        )}
        <div>
          <label style={lbl}>
            Advertising & Marketing
            <InfoTip text="All advertising, marketing, and promotional expenses. Entered separately so AIAnalysis.jsx can flag if advertising is unusually high as a percentage of revenue (a common audit profile indicator)." />
          </label>
          <MoneyInput value={manAdv} onChange={setManAdv} placeholder="0" style={inp} />
        </div>
        <div>
          <label style={lbl}>
            Other Operating Expenses
            <InfoTip text="Miscellaneous business operating expenses not captured in the fields above. Must be ordinary and necessary under IRC §162. Exclude depreciation, advertising, and officer compensation — those have dedicated fields." />
          </label>
          <MoneyInput value={manOther} onChange={setManOther} placeholder="0" style={inp} />
        </div>
      </div>

      {rv > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: SL }}>{isRE ? 'Rental Income' : FINANCIAL_LABELS.grossReceiptsField}</span><span style={{ fontWeight: 600, color: N }}>{fmt(rv)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: SL }}>{FINANCIAL_LABELS.totalExpenses}</span><span style={{ fontWeight: 600, color: N }}>- {fmt(totalExpenses)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 6, fontWeight: 700 }}>
            <span style={{ color: N }}>{isRE ? FINANCIAL_LABELS.netRentalIncome : FINANCIAL_LABELS.netBusinessIncome}{isRE ? ' → Schedule E' : isPartnership ? ' → K-1 Box 1' : ''}</span>
            <span style={{ color: manNetProfit >= 0 ? G : R }}>{fmt(manNetProfit)}</span>
          </div>
        </div>
      )}

      {isPartnership && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: '#F0F9FF', borderRadius: 8, border: '1px solid #BAE6FD', fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#0369A1', marginBottom: 6 }}>📋 K-1 Box Mapping — Partnership / LLC</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, color: '#334155' }}>
            <div>
              <span style={{ fontWeight: 600 }}>Box 1 — Ordinary Business Income:</span>{' '}
              Your net profit above flows here. Taxed at ordinary rates on Schedule E (page 2). Not subject to self-employment tax for limited partners.
            </div>
            <div style={{ borderTop: '1px solid #BAE6FD', paddingTop: 5 }}>
              <span style={{ fontWeight: 600 }}>Box 2 — Net Rental Income (Loss):</span>{' '}
              Rental income on this partnership K-1 (Box 2) is passive rental real estate on Schedule E, page 2 — it stays with this partnership entity rather than being entered as a separate Real Estate card. Passive activity rules (IRC §469) apply, including the $25K allowance and REP status.
            </div>
            <div style={{ borderTop: '1px solid #BAE6FD', paddingTop: 5 }}>
              <span style={{ fontWeight: 600 }}>Box 9a — Net §1231 Gain (Loss):</span>{' '}
              Enter K-1 Box 9a in the <span style={{ fontWeight: 700 }}>Capital Gains (Form 4797)</span> field in Step 2. Net §1231 gains are treated as long-term capital gain; net §1231 losses are ordinary.
            </div>
          </div>
        </div>
      )}

      {isRE && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: '#F5F3FF', borderRadius: 8, border: '1px solid #DDD6FE', fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#6D28D9', marginBottom: 4 }}>🏠 Rental Property — Income, Expenses & Depreciation</div>
          <div style={{ fontSize: 11, color: '#6D28D9', marginBottom: 6, fontWeight: 500 }}>Schedule E · Passive activity rules (§469) apply</div>
          <div style={{ color: '#334155', lineHeight: 1.5 }}>
            Whether a net rental loss is deductible this year depends on your passive-activity status — Real Estate Professional (REP) status plus the §1.469-9(g) aggregation election makes the loss nonpassive, or the $25,000 active-participation allowance applies if you don't qualify as REP. Set your status on this card. Officer compensation doesn't apply to rentals.
          </div>
        </div>
      )}
      {/* end P&L mode else branch */}
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '9px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>Cancel</button>
        <button onClick={applyManual} style={{ flex: 2, padding: '9px', background: B, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Done
        </button>
      </div>
    </div>
  )
}

// ─── Entity card ──────────────────────────────────────────────────────────────
function EntityCard({ entity, idx, onUpdate, onAggregationElection, portfolioAggregationElected, onRemove, colorAccent, isExpanded, onToggleExpand }) {
  const [showManual, setShowManual] = useState(false)
  const [showQBI,    setShowQBI]    = useState(false)
  const [showBasis,  setShowBasis]  = useState(false)
  const pnl = entity.pnl || {}

  const handleDisconnect = () => {
    const pid = entity.connectedId
    if (pid) {
      localStorage.removeItem(integrationKey(pid, 'connected'))
      localStorage.removeItem(integrationKey(pid, 'token'))
      localStorage.removeItem(integrationKey(pid, 'extra'))
      localStorage.removeItem(integrationKey(pid, 'syncedAt'))
      sessionStorage.removeItem(integrationKey(pid, 'token'))
      removeConnectedApp()
    }
    onUpdate(idx, { ...entity, connectedId: null, isManual: true, pnl: {}, officerW2: 0 })
    setShowManual(true)
  }

  const netProfit = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))

  const own    = ownPct(entity.own) / 100
  const k1     = Math.round(netProfit * own)
  const sal    = nf(pnl.officerSalary ?? entity.officerW2)
  const isSC   = isSCorpEntity(entity.type)
  const isPT   = isPassthroughEntity(entity.type)
  const isRE   = isRealEstateEntity(entity.type)

  // ── Findings 1 + 3 FIX — single source of truth for S-Corp basis math ────────
  // Mirrors taxCalc.js exactly so every badge and panel on this card agrees with the
  // engine that produces the filed return:
  //   • §1367(a)(1): beginning stock basis (7203 Line 1) is raised by current-year
  //     capital contributions (Line 2) and basis-restoring income (Lines 3a–3m), then
  //     by current-year income — BEFORE distributions or losses are applied.
  //   • §1368 BEFORE §1366 (Reg. §1.1368-1(e)): distributions reduce that basis next;
  //     only the true excess over pre-loss basis is §1368(b)(2) long-term capital gain.
  //   • §1366(d): the loss is then limited to whatever stock basis remains, plus debt
  //     basis. Capital contributions/income alone count as a basis entry (Finding 3).
  const scBasis = (() => {
    if (!isSC) return null
    const stockEntered = entity.stockBasis !== '' && entity.stockBasis !== undefined && entity.stockBasis !== null
    const contrib   = Math.max(0, nf(entity.capitalContributions))
    const basisInc  = Math.max(0, nf(entity.basisIncomeItems))
    const hasBasisInput = stockEntered || contrib > 0 || basisInc > 0
    const sb   = Math.max(0, nf(entity.stockBasis))
    const db   = entity.debtBasis !== '' && entity.debtBasis !== undefined ? Math.max(0, nf(entity.debtBasis)) : 0
    const dist = Math.max(0, nf(entity.distributions))
    const k1Net   = netProfit * own
    const lossAmt = Math.abs(Math.min(0, k1Net))
    // §1367(a)(1) income-first basis (a current-year loss is a §1366 item applied LAST).
    const stockBasisForDist = sb + contrib + basisInc + Math.max(0, k1Net)
    // §1368 excess gain only on the true excess over pre-loss basis (when basis is known).
    const distExcessGain = hasBasisInput ? Math.max(0, dist - stockBasisForDist) : 0
    const stockAfterDist = Math.max(0, stockBasisForDist - dist)
    // §1366(d): loss capped by stock basis remaining AFTER distributions, plus debt basis.
    const basisForLoss   = stockAfterDist + db
    const allowedLoss    = Math.min(lossAmt, basisForLoss)
    const suspendedLoss  = lossAmt - allowedLoss
    return {
      hasBasisInput, sb, db, contrib, basisInc, dist, k1Net, lossAmt,
      stockBasisForDist, distExcessGain, stockAfterDist, basisForLoss,
      allowedLoss, suspendedLoss,
    }
  })()

  // ── PASS4B-02b: Inline badge computations ─────────────────────────────────
  const basisBadge = (() => {
    if (!isSC || !scBasis) return null
    const { lossAmt, hasBasisInput, basisForLoss, suspendedLoss, dist } = scBasis
    if (lossAmt === 0) return null
    // C-10: a loss with no basis figure at all is conservatively suspended — prompt for basis.
    if (!hasBasisInput) {
      return { type: 'amber', msg: `§1366(d): enter stock basis — ${fmt(lossAmt)} loss may be limited.` }
    }
    if (suspendedLoss > 0) {
      const why = dist > 0
        ? `basis insufficient after §1368 distributions`
        : `basis insufficient`
      return { type: 'warn', msg: `§1366(d): ${fmt(suspendedLoss)} of your ${fmt(lossAmt)} loss is suspended — ${why}.` }
    }
    return { type: 'ok', msg: `§1366(d): Full ${fmt(lossAmt)} loss is deductible — within ${fmt(basisForLoss)} basis.` }
  })()

  const distBadge = (() => {
    if (!isSC || !scBasis) return null
    const { dist, hasBasisInput, distExcessGain } = scBasis
    if (dist <= 0) return null
    if (!hasBasisInput) {
      return { type: 'amber', msg: `§1368: ${fmt(dist)} in distributions — enter stock basis to compute capital gain.` }
    }
    if (distExcessGain > 0) {
      return { type: 'warn', msg: `§1368: ${fmt(distExcessGain)} of distributions exceeds basis — treated as capital gain.` }
    }
    return { type: 'ok', msg: `§1368: All ${fmt(dist)} distributions are tax-free return of basis.` }
  })()

  return (
    <div style={{
      background: '#fff',
      border: '1.5px solid ' + (isExpanded ? colorAccent : '#E2E8F0'),
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Card header */}
      <div
        onClick={onToggleExpand}
        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: isExpanded ? colorAccent + '0D' : '#fff' }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 8, background: colorAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {/s.?corp/i.test(entity.type || '') ? '🏢' : /partner|mmllc/i.test(entity.type || '') ? '🤝' : /sole|single/i.test(entity.type || '') ? '💼' : /c.?corp/i.test(entity.type || '') ? '🏗️' : '📋'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: N, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {entity.name || entity.type || 'Business Entity'}
          </div>
          <div style={{ fontSize: 12, color: SL }}>
            {entity.type} · {entity.own || 100}% ownership
            {entity.connectedId && <span style={{ marginLeft: 8, color: G, fontWeight: 600 }}>● Synced</span>}
            {entity.isManual && <span style={{ marginLeft: 8, color: '#D97706', fontWeight: 600 }}>✏ Manual</span>}
          </div>
          {!isExpanded && (basisBadge || distBadge) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {basisBadge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: basisBadge.type === 'warn' ? '#FEF2F2' : basisBadge.type === 'amber' ? '#FFFBEB' : '#F0FDF4', color: basisBadge.type === 'warn' ? R : basisBadge.type === 'amber' ? '#78350F' : '#166534', border: '1px solid ' + (basisBadge.type === 'warn' ? '#FECACA' : basisBadge.type === 'amber' ? '#FDE68A' : '#86EFAC') }}>
                  {basisBadge.msg}
                </span>
              )}
              {distBadge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: distBadge.type === 'warn' ? '#FEF2F2' : distBadge.type === 'amber' ? '#FFFBEB' : '#F0FDF4', color: distBadge.type === 'warn' ? R : distBadge.type === 'amber' ? '#78350F' : '#166534', border: '1px solid ' + (distBadge.type === 'warn' ? '#FECACA' : distBadge.type === 'amber' ? '#FDE68A' : '#86EFAC') }}>
                  {distBadge.msg}
                </span>
              )}
            </div>
          )}
        </div>
        {netProfit !== 0 && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {/* UX-M1 FIX: show gross rents for RE entities in collapsed header */}
            {isRE && nf(pnl.grossRevenue) > 0 && (
              <div style={{ fontSize: 10, color: SL, marginBottom: 1 }}>Rents {fmt(nf(pnl.grossRevenue))}</div>
            )}
            <div style={{ fontSize: 11, color: SL }}>{entityResultLabel(entity.type)}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: k1 >= 0 ? N : R }}>
              {fmt(k1)}
            </div>
          </div>
        )}
        <div style={{ color: SL, fontSize: 14, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: '14px 18px', borderTop: '1px solid #F1F5F9' }}>

          {/* P&L summary */}
          {nf(pnl.grossRevenue) > 0 && (
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: SL }}>{isRE ? 'Rental Income' : FINANCIAL_LABELS.grossReceiptsField}</span>
                <span style={{ fontWeight: 600, color: N }}>{fmt(nf(pnl.grossRevenue))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: SL }}>{FINANCIAL_LABELS.totalExpenses}</span>
                <span style={{ fontWeight: 600, color: N }}>- {fmt(nf(pnl.totalExpenses))}</span>
              </div>
              {sal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, paddingLeft: 12, fontSize: 12 }}>
                  <span style={{ color: '#64748B' }}>incl. Officer Compensation</span>
                  <span style={{ color: '#64748B' }}>{fmt(sal)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #E2E8F0', paddingTop: 6, marginTop: 2 }}>
                <span style={{ color: N }}>{isRE ? FINANCIAL_LABELS.netRentalIncome : FINANCIAL_LABELS.netBusinessIncome}</span>
                <span style={{ color: netProfit >= 0 ? G : R }}>{fmt(netProfit)}</span>
              </div>
            </div>
          )}

          {/* Entity Name */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>{isRE ? 'Rental Name' : 'Business Name'}</label>
            <input
              type="text"
              value={entity.name || ''}
              onChange={e => onUpdate(idx, { ...entity, name: e.target.value })}
              placeholder={isRE ? "e.g. 123 Main St Duplex" : "e.g. Smith Consulting S-Corp"}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: N, boxSizing: 'border-box' }}
            />
          </div>

          {/* Entity Type */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>Entity Type</label>
            <select
              value={entity.type || 'S Corporation'}
              onChange={e => onUpdate(idx, { ...entity, type: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: N, background: '#fff' }}
            >
              <option value="S Corporation">S Corporation</option>
              <option value="C Corporation">C Corporation</option>
              <option value="Partnership / LLC">Partnership / LLC</option>
              <option value="Sole Proprietor / SMLLC">Sole Proprietor / SMLLC</option>
              <option value="Real Estate (Schedule E)">Real Estate (Schedule E)</option>
            </select>
          </div>

          {/* F-05 FIX: Ownership % — fully controlled input with 0–100 clamp */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
              Ownership %
              <InfoTip text="Your ownership percentage in this entity. K-1 income is allocated proportionally. Example: 75% ownership of a $100K profit = $75K on your personal return." />
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={entity.own ?? '100'}
              onChange={e => {
                const raw = e.target.value
                if (raw === '' || raw === '-') { onUpdate(idx, { ...entity, own: raw }); return }
                const clamped = Math.min(100, Math.max(0, parseFloat(raw) || 0))
                onUpdate(idx, { ...entity, own: String(clamped) })
              }}
              onBlur={e => {
                const v = parseFloat(e.target.value)
                if (!Number.isFinite(v) || v < 0 || v > 100) {
                  onUpdate(idx, { ...entity, own: String(Math.min(100, Math.max(0, v || 0))) })
                }
              }}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: N }}
            />
          </div>

          {/* QBI fields */}
          {isPT && (
            <div style={{ marginBottom: 10 }}>
              <button onClick={e => { e.stopPropagation(); setShowQBI(s => !s) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: B, padding: '4px 0', marginBottom: 6 }}>
                {showQBI ? '▲ Collapse' : '▼ Expand'} §199A Qualified Business Income (QBI) Deduction <span style={{ fontWeight: 500, opacity: 0.7 }}>· W-2 wages, UBIA, SSTB</span>
              </button>
              {/* P3c FIX: contextual hint so users know when these fields matter.
                  Without this, users either ignore the section entirely or enter
                  values they don't need, creating confusion. The threshold hint
                  matches the InfoTip tooltips inside each field. */}
              {!showQBI && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: -4, marginBottom: 6 }}>
                  {/* NEW-6 FIX: previous text said "only needed if taxable income exceeds
                      the threshold" — but the prior-year QBI loss carryforward must be
                      tracked even in LOSS years when current QBI deduction = $0.
                      Updated text covers both cases. IRC §199A(c)(2). */}
                  Only needed if your taxable income exceeds the §199A threshold — about $197,300 (single) or $394,600 (MFJ) for 2025 ($201,775 / $403,500 for 2026) — except §179 and charitable contributions, which always reduce QBI regardless of income level. <strong>Also complete this section in loss years</strong> — the QBI loss carryforward (Form 8995 Line 3) must be tracked for future years even when the current-year deduction is $0 (IRC §199A(c)(2)).
                </div>
              )}
              {showQBI && (
                <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 14px', border: '1px solid #BFDBFE' }}>
                  {/* NEW-1 FIX: SSTB advisory for businesses likely classified as SSTBs.
                      Teaching, tutoring, instruction, consulting etc. fall under §199A(d)(1)(B).
                      We warn when entity name/type contains SSTB keywords and the checkbox is
                      not yet checked — this is an advisory, not a determination. */}
                  {(() => {
                    const entityText = ((entity.name || '') + ' ' + (entity.type || '') + ' ' + (entity.pnl?.businessActivity || '')).toLowerCase()
                    const sstbKeywords = ['tutor', 'teach', 'instruct', 'coach', 'consult', 'legal', 'law ', 'accounting', 'actuar', 'athlet', 'performing', 'brokerage', 'financial service', 'investing', 'trading', 'health', 'medical', 'doctor', 'dentist', 'therapist', 'counsel', 'education', 'course', 'training']
                    const matchedKeyword = sstbKeywords.find(kw => entityText.includes(kw))
                    if (!matchedKeyword || entity.box17V_sstb) return null
                    return (
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#78350F' }}>
                        <strong>⚠ Possible Specified Service Trade or Business (SSTB) — review below.</strong>{' '}
                        Businesses involving teaching, tutoring, instruction, consulting, coaching, and similar services
                        commonly qualify as SSTBs under IRC §199A(d)(1)(B). If this is an SSTB, the QBI deduction
                        phases out above $197,300 AGI (single 2025) and is eliminated above $247,300.
                        Check the SSTB box at the bottom of this section if applicable. Confirm with your CPA.
                      </div>
                    )
                  })()}
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>§199A QBI Inputs — from K-1</div>
                  {[
                    { label: 'W-2 Wages (K-1 §199A statement)',  /* UX-M4 FIX: shortened; box ref in tooltip */ key: 'box17V_wages', tip: 'Your share of W-2 wages paid by the entity. Reported on the Section 199A statement attached to your K-1 (S-Corp: Box 17, Code V; Partnership: Box 20, Code Z).\n\nThis field only matters if your taxable income exceeds ~$197,300 (single) or $394,600 (MFJ) for 2025 (~$201,775 / $403,500 for 2026). Below those thresholds, the W-2 wage limitation does not apply and your QBI deduction is simply 20% of QBI.\n\nAbove the threshold, the deduction is limited to the lesser of: (a) 20% of QBI, or (b) 50% of W-2 wages paid by the entity (IRC §199A(b)(2)(A)).' },
                    { label: 'UBIA of Qualified Property (K-1 §199A statement)',  /* UX-M4 FIX: shortened */ key: 'box17V_ubia', tip: 'Unadjusted Basis Immediately After Acquisition — the original cost of qualified property, not reduced by depreciation (IRC §199A(b)(6)(B)). Reported on the Section 199A statement attached to your K-1 (S-Corp: Box 17, Code V; Partnership: Box 20, Code Z).\n\nThis field only matters if your taxable income exceeds ~$197,300 (single) or $394,600 (MFJ) for 2025. Below those thresholds this limitation does not apply.\n\nAbove the threshold, you may use the alternative W-2 + UBIA limitation: 25% of W-2 wages plus 2.5% of UBIA (§199A(b)(2)(B)). This helps capital-intensive businesses with low W-2 wages.' },
                    { label: '§179 Deduction (K-1 Box 11 / Box 12)', key: 'box11_12', tip: '§179 first-year expensing allocated to you from the entity.\n\nS-Corp: K-1 Box 11 · Partnership: K-1 Box 12\n\nThis deduction reduces your Qualified Business Income (QBI) for §199A purposes (Treas. Reg. §1.199A-3(b)(1)(ii)(A)). It also reduces your stock or partnership basis (IRC §1367 / §705).\n\nOnly enter this if §179 is shown separately on your K-1 and is NOT already reflected in the ordinary business income on Box 1 (S-Corp) or Box 1 (Partnership). If your accounting software already netted §179 into your net profit figure, leave this blank to avoid double-counting.' },
                    { label: 'Charitable Contributions — K-1 Box 12 (S-Corp) or Box 13 (Partnership)', key: 'box12_13', tip: 'Charitable contributions passed through on your K-1 (S-Corp: Box 12; Partnership: Box 13). Enter totals from your own K-1 only — do not combine S-Corp Box 12 and Partnership Box 13 if you hold both entity types. These flow to Schedule A and also reduce your K-1 basis.' },
                    { label: 'Prior-Year QBI Loss Carryforward (Form 8995, Line 3)', key: 'qbiLossCarryforward', tip: 'If this entity generated a net QBI loss in the prior year, that loss must reduce this entity\'s QBI in the CURRENT year before computing the 20% deduction (IRC §199A(c)(2)).\n\nEnter the absolute value of last year\'s net QBI loss from this entity (as a positive number). From Form 8995 line 3 or Form 8995-A.\n\nTracking this per-entity (not pooled) is required by Treas. Reg. §1.199A-1(d)(2)(iii).' },
                  ].map(({ label, key, tip }) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', display: 'block', marginBottom: 3 }}>
                        {label}
                        <InfoTip text={tip} wide />
                      </label>
                      <MoneyInput
                        value={entity[key] || ''}
                        onChange={v => onUpdate(idx, { ...entity, [key]: v })}
                        placeholder="0"
                        style={{ fontSize: 13 }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <input type="checkbox" id={'sstb_' + idx} checked={!!entity.box17V_sstb} onChange={e => onUpdate(idx, { ...entity, box17V_sstb: e.target.checked })} />
                    <label htmlFor={'sstb_' + idx} style={{ fontSize: 12, color: '#1D4ED8', cursor: 'pointer' }}>
                      This is a Specified Service Trade or Business (SSTB) — limits QBI deduction at high income
                      <InfoTip text={'SSTBs (Specified Service Trades or Businesses) per IRC §199A(d)(1)(B) include:\nlaw, accounting, actuarial science, performing arts, consulting, athletics, financial services, brokerage, investing/trading, and any business where the principal asset is the reputation or skill of an employee or owner.\n\nNOT SSTBs: engineering, architecture, real estate, insurance, banking, manufacturing, retail, and health (starting 2026 under OBBBA).\n\n2025 SSTB phase-out range:\n• Single/HOH: $197,300 – $247,300\n• MFJ: $394,600 – $494,600\n\n2026 SSTB phase-out range (estimated):\n• Single/HOH: $201,775 – $276,775\n• MFJ: $403,500 – $553,500\n\nAbove the ceiling your §199A deduction is $0 on SSTB income. Below the floor there is no limitation.'} wide />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PASS4B-02b: §1366(d) Stock Basis & §1368 Distributions */}
          {isSC && (
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={e => { e.stopPropagation(); setShowBasis(s => !s) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#7C3AED', padding: '4px 0', marginBottom: 6 }}
              >
                {showBasis ? '▲ Collapse' : '▼ Expand'} Stock & Debt Basis (Form 7203) <span style={{ fontWeight: 500, opacity: 0.7 }}>· §1366(d) loss limits & §1368 distributions</span>
              </button>
              {/* P3c FIX: contextual hint so users know when stock basis matters.
                  Stock basis limits loss deductibility — irrelevant if the entity
                  is profitable. Surfacing that context prevents users from
                  hunting for numbers they don't need. */}
              {!showBasis && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: -4, marginBottom: 6 }}>
                  Needed only if your S-Corp shows a loss — limits how much is deductible this year
                </div>
              )}
              {showBasis && (
                <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '12px 14px', border: '1px solid #DDD6FE' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', marginBottom: 10 }}>
                    §1366(d) Basis Limitation · §1368 Distributions — from Form 7203
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Stock Basis at Beginning of Year (Form 7203, Line 1)
                      <InfoTip text={'Your adjusted stock basis at the start of the tax year (Form 7203, Line 1).\n\nStock basis starts with your original cash or property contribution when you acquired the shares. Each year it increases for income and tax-exempt items allocated to you, and decreases for losses, deductions, and distributions.\n\nWhy it matters — IRC §1366(d)(1):\nYour deductible S-Corp loss cannot exceed your combined stock basis + debt basis. Losses in excess of basis are SUSPENDED and carried forward to future years when basis is restored (§1366(d)(2)).\n\nYour CPA tracks this figure on Form 7203 each year. Leave blank if you are unsure.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.stockBasis || ''}
                      onChange={v => onUpdate(idx, { ...entity, stockBasis: v })}
                      placeholder="Enter basis — leave blank if unsure"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {/* Finding 3 FIX: current-year capital contributions (Form 7203, Line 2).
                      A return funded by current-year contributions — not beginning basis —
                      previously had none of that basis recognized, understating deductible
                      loss and overstating §1368 capital gain. This raises stock basis under
                      §1367(a)(1) before distributions and losses are applied. */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Capital Contributions This Year (Form 7203, Line 2) — Optional
                      <InfoTip text={'Cash or property you contributed to the S-Corp during THIS tax year, plus any additional stock you acquired (Form 7203, Line 2).\n\nThese contributions increase your stock basis under IRC §1367(a)(1) BEFORE the year\'s distributions and losses are applied. If you funded a loss year with new contributions rather than relying on beginning basis, enter that amount here — otherwise the loss may be understated (suspended) and distributions may be incorrectly treated as a capital gain.\n\nLeave blank if you made no contributions this year.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.capitalContributions || ''}
                      onChange={v => onUpdate(idx, { ...entity, capitalContributions: v })}
                      placeholder="0 (optional)"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {/* Finding 3 FIX: basis-restoring income items (Form 7203, Lines 3a–3m) —
                      income/tax-exempt items that raise stock basis under §1367(a)(1). */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Other Basis-Restoring Income (Form 7203, Lines 3a–3m) — Optional
                      <InfoTip text={'Current-year income and tax-exempt items allocated to you that increase stock basis (Form 7203, Lines 3a–3m) — for example separately stated income, interest, dividends, capital gains, or tax-exempt income.\n\nDo NOT include the ordinary business loss here (that is entered as the entity\'s P&L and applied last under §1366). Enter only positive basis-increasing items. These raise basis under §1367(a)(1) before distributions and losses.\n\nLeave blank if not applicable.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.basisIncomeItems || ''}
                      onChange={v => onUpdate(idx, { ...entity, basisIncomeItems: v })}
                      placeholder="0 (optional)"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Debt Basis (Form 7203, Part II) — Optional
                      <InfoTip text={'Debt basis arises from bona fide loans you have personally made to the S-Corp — NOT loans the corporation took from a bank or third party.\n\nDebt basis absorbs losses after stock basis is exhausted (IRC §1366(d)(1)(B)).\n\nThis is an advanced field. Most shareholders only have stock basis. Leave blank if you have not personally loaned money to your S-Corp.\n\nSee Form 7203, Part II for the calculation.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.debtBasis || ''}
                      onChange={v => onUpdate(idx, { ...entity, debtBasis: v })}
                      placeholder="0 (optional)"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {(() => {
                    const { lossAmt, hasBasisInput, basisForLoss, allowedLoss, suspendedLoss, dist } = scBasis || {}
                    if (!scBasis || lossAmt === 0) return null
                    // C-10: loss present but no basis figure at all — conservatively suspended.
                    if (!hasBasisInput) {
                      return (
                        <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ §1366(d) — Enter Stock Basis</div>
                          <div style={{ color: '#78350F', lineHeight: 1.5 }}>
                            This entity shows a {fmt(lossAmt)} loss. Your deductible S-Corp loss is capped at your
                            combined stock + debt basis (IRC §1366(d)(1)). Because no beginning basis or contributions
                            have been entered, this {fmt(lossAmt)} loss is being conservatively suspended and carried
                            forward (§1366(d)(2)) rather than deducted against your other income. Enter your beginning
                            stock basis (Line 1) or current-year contributions (Line 2) above to release the portion
                            your basis supports.
                          </div>
                        </div>
                      )
                    }
                    if (suspendedLoss > 0) {
                      return (
                        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: R, marginBottom: 4 }}>⚠ §1366(d) Loss Limitation Active</div>
                          <div style={{ color: '#7F1D1D', lineHeight: 1.5 }}>
                            Your {fmt(lossAmt)} K-1 loss exceeds the {fmt(basisForLoss)} of basis available to absorb it
                            {dist > 0 ? ' after this year\u2019s distributions reduce stock basis first (§1368 before §1366)' : ''}.
                            Only <strong>{fmt(allowedLoss)}</strong> is deductible this year.
                            <strong> {fmt(suspendedLoss)}</strong> is suspended and carries forward (IRC §1366(d)(2)).
                            Consult your CPA to confirm your exact basis before filing.
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Full Loss Deductible</div>
                        <div style={{ color: '#166534', lineHeight: 1.5 }}>
                          Your {fmt(lossAmt)} K-1 loss is within the {fmt(basisForLoss)} of basis available
                          {dist > 0 ? ' (after distributions are applied first under §1368)' : ''} — the full loss is deductible this year.
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Distributions Received This Year (Form 7203, Line 6)
                      <InfoTip text={'Total cash or property distributions you received from the S-Corp this year.\n\nDistributions reduce your stock basis. If distributions exceed your remaining stock basis (after the current year\'s income/loss allocation), the excess is taxable as a long-term capital gain (IRC §1368(b)(2)) — NOT ordinary income.\n\nThis capital gain does not appear on your K-1. It is computed at the shareholder level and belongs on Schedule D.\n\nAAA note: If your S-Corp has accumulated earnings and profits (E&P) from a prior C-Corp period, AAA ordering rules (§1368(c)) apply — distributions reduce AAA first, then E&P (taxable as an ordinary dividend). Consult your CPA if prior C-Corp E&P exists.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.distributions || ''}
                      onChange={v => onUpdate(idx, { ...entity, distributions: v })}
                      placeholder="0"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {(() => {
                    const { dist, hasBasisInput, distExcessGain, stockBasisForDist, stockAfterDist } = scBasis || {}
                    if (!scBasis || dist <= 0) return null
                    if (!hasBasisInput) {
                      return (
                        <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Enter Stock Basis to Compute Capital Gain</div>
                          <div style={{ color: '#78350F', lineHeight: 1.5 }}>
                            You have entered {fmt(dist)} in distributions. Enter your stock basis (Line 1) or
                            current-year contributions (Line 2) above to determine whether any portion is taxable
                            as long-term capital gain (IRC §1368(b)(2)).
                          </div>
                        </div>
                      )
                    }
                    // Finding 1: §1368 is applied to pre-loss basis (income-first under
                    // §1367(a)(1)); a current-year loss does NOT reduce the basis that
                    // absorbs distributions, so the §1368(b)(2) gain is only the true excess.
                    if (distExcessGain > 0) {
                      return (
                        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: R, marginBottom: 4 }}>⚠ §1368 Capital Gain — Distributions Exceed Basis</div>
                          <div style={{ color: '#7F1D1D', lineHeight: 1.5 }}>
                            <strong>{fmt(distExcessGain)}</strong> of your {fmt(dist)} distributions exceeds your
                            pre-loss stock basis ({fmt(stockBasisForDist)}) and is treated as a{' '}
                            <strong>long-term capital gain</strong> on Schedule D (IRC §1368(b)(2)).
                            Distributions are applied to basis before the year's loss (Reg. §1.1368-1(e)),
                            so only this true excess is taxed. This amount is included in your tax estimate automatically.
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Distributions Within Basis</div>
                        <div style={{ color: '#166534', lineHeight: 1.5 }}>
                          All {fmt(dist)} in distributions are a tax-free return of basis — no capital gain triggered (IRC §1368(b)(1)).
                          {stockAfterDist > 0 ? ` Your stock basis after distributions is ${fmt(stockAfterDist)}.` : ''}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* REG-01 / F6: §469 Passive Activity Status — the single home for rental treatment */}
          {isRE && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '12px 14px', border: '1px solid #DDD6FE' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', marginBottom: 10 }}>
                  §469 Passive Activity Status — Schedule E Rental
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" id={'rep_' + idx} checked={!!entity.isREP} onChange={e => onUpdate(idx, { ...entity, isREP: e.target.checked, ...(e.target.checked ? {} : { rentalAggregationElection: undefined }) })} style={{ marginTop: 2 }} />
                  <label htmlFor={'rep_' + idx} style={{ fontSize: 12, color: '#5B21B6', cursor: 'pointer', lineHeight: 1.4 }}>
                    Real Estate Professional (REP) — IRC §469(c)(7)
                    <InfoTip text={'Check this ONLY if you meet both IRC §469(c)(7) tests:\n(1) more than half of the personal services you perform in all trades or businesses during the year are in real property trades or businesses in which you materially participate, AND\n(2) you perform more than 750 hours of service in those real property trades or businesses.\n\nREP status alone does NOT make your rentals nonpassive — you must also make the §1.469-9(g) aggregation election below.'} wide />
                  </label>
                </div>

                {/* C-11: §469(c)(7)(B) quantitative hours test. Replaces blank self-attestation
                    with the two-part test applied to the user's own hours. Warn-and-allow: failing
                    the test surfaces the gap + audit risk but does NOT block the REP election or
                    change passive treatment (the §1.469-9(g) election below is still the switch). */}
                {entity.isREP && (() => {
                  const reHrs    = parseFloat(entity.repHoursRE) || 0
                  const totalHrs = parseFloat(entity.repHoursTotal) || 0
                  const entered  = String(entity.repHoursRE ?? '').trim() !== '' && String(entity.repHoursTotal ?? '').trim() !== ''
                  const pass750  = reHrs > 750
                  const pass50   = totalHrs > 0 && reHrs > totalHrs / 2
                  const qualifies = pass750 && pass50
                  const pctRE    = totalHrs > 0 ? Math.round((reHrs / totalHrs) * 100) : 0
                  const reasons  = []
                  if (!pass750) reasons.push(`you entered ${reHrs.toLocaleString()} real-property hours — the statute requires more than 750`)
                  if (!pass50)  reasons.push(`real-property hours must exceed 50% of your total personal-service hours (currently ${pctRE}%)`)
                  const hrInput = (key, label, ph) => (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: '#5B21B6', display: 'block', marginBottom: 3 }}>{label}</label>
                      <input
                        type="number" min="0" inputMode="numeric"
                        value={entity[key] ?? ''}
                        onChange={e => onUpdate(idx, { ...entity, [key]: e.target.value })}
                        placeholder={ph}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #DDD6FE', borderRadius: 6, fontSize: 13 }}
                      />
                    </div>
                  )
                  return (
                    <div style={{ background: '#fff', border: '1px solid #DDD6FE', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', marginBottom: 8 }}>
                        §469(c)(7)(B) qualification — enter your hours
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                        {hrInput('repHoursRE', 'Hours in real property trades/businesses', 'e.g. 900')}
                        {hrInput('repHoursTotal', 'Total hours, ALL your work this year', 'e.g. 1,500')}
                      </div>
                      {!entered ? (
                        <div style={{ fontSize: 12, color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '7px 10px', lineHeight: 1.5 }}>
                          Enter both figures to confirm the two-part test: more than 750 hours in real property trades or businesses, <strong>and</strong> more than 50% of your total personal-service hours in real estate.
                        </div>
                      ) : qualifies ? (
                        <div style={{ fontSize: 12, color: '#166534', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 6, padding: '7px 10px', lineHeight: 1.5 }}>
                          ✓ Meets the §469(c)(7)(B) test — {reHrs.toLocaleString()} real-property hours ({'>'} 750) and {pctRE}% of your {totalHrs.toLocaleString()} total hours ({'>'} 50%). Keep contemporaneous daily time logs to support this if examined.
                        </div>
                      ) : (
                        <div role="alert" style={{ fontSize: 12, color: '#78350F', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '7px 10px', lineHeight: 1.5 }}>
                          ⚠ These hours do not meet the §469(c)(7)(B) test: {reasons.join('; ')}. You can still elect REP below, but this is one of the most frequently challenged positions — the IRS expects contemporaneous daily time logs, and significant W-2 employment makes the 50% test hard to satisfy. Confirm with your CPA before relying on it.
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* F6: §1.469-9(g) aggregation election — shown once REP is checked. This is the
                    single control that makes the rental portfolio nonpassive. */}
                {entity.isREP && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <input type="checkbox" id={'agg_' + idx} checked={portfolioAggregationElected === true} onChange={e => (onAggregationElection ? onAggregationElection(e.target.checked) : onUpdate(idx, { ...entity, rentalAggregationElection: e.target.checked ? true : false }))} style={{ marginTop: 2 }} />
                    <label htmlFor={'agg_' + idx} style={{ fontSize: 12, color: '#5B21B6', cursor: 'pointer', lineHeight: 1.4 }}>
                      Apply the aggregate-hours rule across all rental properties (§1.469-9(g) election)
                      <InfoTip text={'Elect to treat ALL your rental real estate as a single activity, counting your participation HOURS across every property together. Meeting material participation on the combined activity makes the whole rental portfolio nonpassive — losses offset other income with no §469(i) cap, and rental income is excluded from the 3.8% net investment income tax.\n\nThis is a deliberate, generally irrevocable election made on the return; it is never assumed. Leave it unchecked and your rentals stay passive (the default).\n\nNote: this is the §469 aggregation ELECTION, not the §199A 250-hour rental "safe harbor" (Rev. Proc. 2019-38), which only affects the QBI deduction.\n\nTreas. Reg. §1.469-9(g) · IRC §469(c)(7).'} wide />
                    </label>
                  </div>
                )}

                {!entity.isREP && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <input type="checkbox" id={'active_' + idx} checked={!!entity.isActiveParticipant} onChange={e => onUpdate(idx, { ...entity, isActiveParticipant: e.target.checked })} style={{ marginTop: 2 }} />
                    <label htmlFor={'active_' + idx} style={{ fontSize: 12, color: '#5B21B6', cursor: 'pointer', lineHeight: 1.4 }}>
                      Active Participant — §469(i) $25,000 allowance
                      <InfoTip text={'Active participation is a lower bar than material participation — it generally means you make bona fide management decisions (approving tenants, setting rental terms, approving expenses).\n\nIf you actively participate, up to $25,000 of rental losses may offset other (non-passive) income under IRC §469(i). This allowance phases out at 50 cents per dollar of modified AGI between $100,000 and $150,000.'} wide />
                    </label>
                  </div>
                )}

                {/* Prior-year passive loss carryforward (Form 8582) — moved here from Step 2 */}
                <div style={{ marginTop: 8, marginBottom: 4 }}>
                  <label htmlFor={'pal_' + idx} style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                    Prior-Year Passive Loss Carryforward (Form 8582)
                    <InfoTip text={'Suspended passive losses from prior years on this rental (Form 8582, Line 3). Released when the rental generates passive income or the property is disposed of. Enter the total carryforward, NOT the current-year loss.'} wide />
                  </label>
                  <MoneyInput
                    value={entity.priorPAL || ''}
                    onChange={v => onUpdate(idx, { ...entity, priorPAL: v })}
                    placeholder="0"
                    style={{ fontSize: 13 }}
                  />
                </div>

                {(() => {
                  const reNet = netProfit
                  if (reNet >= 0) {
                    return (
                      <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Rental Income Flows Through</div>
                        <div style={{ color: '#166534', lineHeight: 1.5 }}>
                          Net rental income of {fmt(reNet)} is included in your return.
                        </div>
                      </div>
                    )
                  }
                  if (entity.isREP && entity.rentalAggregationElection === true) {
                    // ── Finding 2 FIX ──────────────────────────────────────────────
                    // The §1.469-9(g) election alone no longer green-lights the loss when
                    // the taxpayer's own §469(c)(7)(B) hours FAIL the quantitative test.
                    // Mirrors taxCalc.js (repAggregationGatedOut): a failed hours test
                    // suspends the loss unless the user makes an explicit override
                    // acknowledgment. Hours left blank stay backward-compatible (allowed),
                    // but are nudged. A green "currently deductible" state is shown ONLY
                    // when the test passes or no hours were entered to contradict it.
                    const reHrs  = parseFloat(entity.repHoursRE)
                    const totHrs = parseFloat(entity.repHoursTotal)
                    const hoursProvided = !Number.isNaN(reHrs) && !Number.isNaN(totHrs)
                    const hoursPass = hoursProvided && reHrs > 750 && reHrs > totHrs / 2
                    const hoursFail = hoursProvided && !hoursPass
                    const override  = entity.repAggregationOverride === true
                    const pctRE     = hoursProvided && totHrs > 0 ? Math.round((reHrs / totHrs) * 100) : 0

                    // Failed test, NOT overridden → suspended. No green state. Offer override.
                    if (hoursFail && !override) {
                      return (
                        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: R, marginBottom: 4 }}>⚠ REP Hours Test Failed — Loss Suspended (§469(c)(7)(B))</div>
                          <div style={{ color: '#7F1D1D', lineHeight: 1.5, marginBottom: 8 }}>
                            Your entered hours don't meet the §469(c)(7)(B) test ({reHrs.toLocaleString()} real-property hours{totHrs > 0 ? `, ${pctRE}% of your ${totHrs.toLocaleString()} total` : ''} — the statute requires more than 750 hours <strong>and</strong> more than 50%). Because the test fails, the §1.469-9(g) election does not make this {fmt(Math.abs(reNet))} loss currently deductible — it is treated as passive and suspended on Form 8582. This is the single largest audit-exposure item on a return with significant non-real-estate W-2 income.
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <input type="checkbox" id={'repovr_' + idx} checked={false} onChange={e => onUpdate(idx, { ...entity, repAggregationOverride: e.target.checked })} style={{ marginTop: 2 }} />
                            <label htmlFor={'repovr_' + idx} style={{ fontSize: 12, color: '#7F1D1D', cursor: 'pointer', lineHeight: 1.4 }}>
                              I understand the hours test is not met and I am electing to deduct this loss anyway. I have contemporaneous daily time logs and have confirmed this position with my CPA. (High audit risk.)
                            </label>
                          </div>
                        </div>
                      )
                    }

                    // Failed test but explicitly overridden → loss IS deducted, flagged high risk.
                    if (hoursFail && override) {
                      return (
                        <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Deducting Against a Failed Hours Test — High Audit Risk</div>
                          <div style={{ color: '#78350F', lineHeight: 1.5, marginBottom: 8 }}>
                            You've elected to treat this {fmt(Math.abs(reNet))} loss as nonpassive even though your entered hours ({reHrs.toLocaleString()} real-property{totHrs > 0 ? `, ${pctRE}% of total` : ''}) do not meet the §469(c)(7)(B) test. The loss is included in your estimate, but REP status against significant outside W-2 income is one of the most frequently challenged positions — keep contemporaneous daily time logs and confirm with your CPA.
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <input type="checkbox" id={'repovr_' + idx} checked={true} onChange={e => onUpdate(idx, { ...entity, repAggregationOverride: e.target.checked })} style={{ marginTop: 2 }} />
                            <label htmlFor={'repovr_' + idx} style={{ fontSize: 12, color: '#78350F', cursor: 'pointer', lineHeight: 1.4 }}>
                              Override active — deducting despite the failed hours test. Uncheck to suspend the loss.
                            </label>
                          </div>
                        </div>
                      )
                    }

                    // Hours pass, or none entered (backward-compatible) → currently deductible.
                    return (
                      <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Nonpassive — Currently Deductible (REP + §1.469-9(g) election)</div>
                        <div style={{ color: '#166534', lineHeight: 1.5 }}>
                          You are a real estate professional and have elected to aggregate your rentals, so this {fmt(Math.abs(reNet))} loss is nonpassive and deductible against your other income this year.
                          {hoursPass
                            ? ` Your ${reHrs.toLocaleString()} real-property hours (${pctRE}% of total) meet the §469(c)(7)(B) test — keep contemporaneous daily time logs to support it.`
                            : ' Enter your §469(c)(7)(B) hours above to confirm this position — without them, the deduction is unverified and at risk on audit, especially alongside significant W-2 income.'}
                        </div>
                      </div>
                    )
                  }
                  if (entity.isREP) {
                    return (
                      <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12 }}>
                        <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Passive Until You Elect (§1.469-9(g))</div>
                        <div style={{ color: '#78350F', lineHeight: 1.5 }}>
                          REP status alone does not make this {fmt(Math.abs(reNet))} loss deductible. Check the §1.469-9(g) aggregation election above to treat your portfolio as nonpassive; otherwise it is limited by the §469(i) $25,000 allowance and otherwise suspended on Form 8582.
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginTop: 8, fontSize: 12 }}>
                      <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Passive Loss — Suspended This Year (§469)</div>
                      <div style={{ color: '#78350F', lineHeight: 1.5 }}>
                        This {fmt(Math.abs(reNet))} rental loss is passive. Under IRC §469(a) it is suspended and carried forward on Form 8582{entity.isActiveParticipant ? ', except for any portion allowed by the §469(i) $25,000 active-participation allowance (which phases out between $100K–$150K MAGI)' : ''}.
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Reasonable comp indicator for non-manual S-Corps */}
          {isSC && nf(pnl.grossRevenue) > 0 && !entity.isManual && (
            <ReasonableCompIndicator
              officerSal={sal}
              netProfit={Math.max(0, netProfit + sal)}
              isSCorp={isSC}
            />
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={entity.isManual ? () => setShowManual(s => !s) : handleDisconnect}
              style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderRadius: 7,
                padding: '6px 12px',
                fontSize: 12,
                color: SL,
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontFamily: 'inherit',
              }}
            >
              {/* TERMINOLOGY FIX 8.1: "Edit P&L" used accounting jargon and "Edit" was wrong on first
                  use (nothing to edit yet). Use verb-accurate labels: "Enter Financials" when the
                  entity has no data yet, "Edit Financials" when it does. */}
              {entity.isManual
                ? (nf(entity.pnl?.grossRevenue) > 0 || nf(entity.pnl?.totalExpenses) > 0
                    ? '✏ Edit Financials'
                    : '✏ Enter Financials')
                : '⟳ Disconnect / reconnect software'}
            </button>
            <button onClick={() => onRemove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#EF4444', fontWeight: 600, padding: '6px 0', fontFamily: 'inherit' }}>
              🗑 Remove entity
            </button>
          </div>

          {showManual && (
            <ManualEntryPanel
              entity={entity}
              onUpdate={onUpdate}
              onCancel={() => setShowManual(false)}
              idx={idx}
            />
          )}
        </div>
      )}
    </div>
  )
}


// ─── Main export ──────────────────────────────────────────────────────────────
export default function CalculateTaxInner() {
  const navigate = useNavigate()

  const [entities,         setEntities]         = useState([])
  const [expandedIdx,      setExpandedIdx]      = useState(null)
  const [showCompare,      setShowCompare]      = useState(false)
  const [showNameModal,    setShowNameModal]    = useState(false)
  const [showEntityPicker, setShowEntityPicker] = useState(false)
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState(null)
  const [saveStatus,       setSaveStatus]       = useState('idle')
  const [taxYear,          setTaxYear]          = useState(() => readTaxYear() || DEFAULT_TAX_YEAR)
  // F-01 / F-02: inline error toast state for footer button guard
  const [footerError,      setFooterError]      = useState(null)
  // O1 FIX: track whether the standalone manual-entry panel is open (for
  // users who have no entities yet and click "Enter manually")
  const [showStandaloneManual, setShowStandaloneManual] = useState(false)
  // F23 FIX: per-provider sync diff message shown after a manual re-sync
  const [syncDiffs,        setSyncDiffs]        = useState({})
  const [integrationRevision, setIntegrationRevision] = useState(0)
  const bumpIntegrationUi = () => setIntegrationRevision(n => n + 1)

  useEffect(() => {
    // F-12 FIX: When a record is loaded via Dashboard ("Load & Continue"), the
    // load handler writes the full record to sessionStorage key ts360_loaded_record
    // before navigating to /calculate. On mount here, if Step 1 entity array is
    // empty but a loaded record exists, hydrate entities from the record's saved
    // entity data so Step 1 correctly reflects the loaded state.
    const existingStep1 = JSON.parse(sessionStorage.getItem('ts360_step1_entities') || '[]')
    if (existingStep1.length > 0) {
      setEntities(existingStep1.map(e => ({
        ...e,
        pnl: e.pnl || {
          grossRevenue:  e.grossRevenue  || '',
          totalExpenses: e.totalExpenses || '',
          officerSalary: e.officerSalary || '',
          netProfit:     e.netProfit     || '',
        },
        own:      e.own      || '100',
        isManual: e.isManual || false,
      })))
    } else {
      // No in-progress Step 1 working copy. Hydrate from a one-off loaded record if one
      // exists, otherwise from the canonical Step-1 state (ts360_entities_raw) written by
      // Dashboard.loadRecord / AIAnalysis "Calculate Tax" / Dashboard tab-nav.
      let hydrated = null

      const loadedRaw = sessionStorage.getItem('ts360_loaded_record')
      if (loadedRaw) {
        try {
          const loaded = JSON.parse(loadedRaw)
          if (loaded.entities && loaded.entities.length > 0) hydrated = loaded.entities
          if (loaded.taxYear) {
            setTaxYear(loaded.taxYear)
            writeTaxYear(loaded.taxYear)
          }
        } catch (err) {
          console.error('CalculateTaxInner: failed to parse loaded record', err)
        }
      }

      // C-04 FIX: loadRecord (and the AIAnalysis "Calculate Tax" / tab-nav paths) persist
      // the entity list via writeStep1State — which Step 2 reads through readStep1State —
      // but they do NOT write the ts360_step1_entities working copy that Step 1 reads. The
      // result was a loaded record showing in Step 2 while Step 1 sat empty ("Add an entity
      // to continue", Continue disabled). Fall back to the canonical raw entity array so
      // Step 1 hydrates from the same source of truth as Step 2.
      if (!hydrated || hydrated.length === 0) {
        const raw = readStep1StateRaw()
        if (Array.isArray(raw) && raw.length > 0) hydrated = raw
      }

      if (hydrated && hydrated.length > 0) {
        const mapped = hydrated.map(e => ({
          ...e,
          pnl: e.pnl || {
            grossRevenue:  e.grossRevenue  || '',
            totalExpenses: e.totalExpenses || '',
            officerSalary: e.officerSalary || '',
            netProfit:     e.netProfit     || '',
          },
          own:      e.own      || '100',
          isManual: e.isManual !== undefined ? e.isManual : true,
        }))
        setEntities(mapped)
        // Persist to the Step 1 working key so subsequent renders stay hydrated.
        writeStep1Entities(mapped)
      }
    }
  }, [])

  const addEntity = useCallback(() => {
    if (!isPro() && entities.length >= 1) { navigate('/upgrade'); return }
    setShowEntityPicker(true)
  }, [entities.length, navigate])

  const addEntityOfType = useCallback((type) => {
    if (!isPro() && entities.length >= 1) { setShowEntityPicker(false); navigate('/upgrade'); return }
    const newEnt = {
      id: Date.now(),
      type,
      name: '',
      own: '100',
      pnl: { grossRevenue: '', totalExpenses: '', officerSalary: '', netProfit: '' },
      isManual: true,
      connectedId: null,
      box17V_wages: '', box17V_ubia: '', box11_12: '', box12_13: '', qbiLossCarryforward: '',
      box17V_sstb: false,
      stockBasis: '', debtBasis: '', distributions: '',
      isREP: false, isActiveParticipant: false,
    }
    setEntities(prev => {
      // F-FUNC-07: a newly added rental inherits the portfolio-wide §1.469-9(g)
      // election so it isn't silently treated as passive while the rest of the
      // portfolio is elected nonpassive.
      const portfolioElected = prev.some(e => isRealEstateEntity(e.type) && e.rentalAggregationElection === true)
      const seeded = (isRealEstateEntity(type) && portfolioElected)
        ? { ...newEnt, rentalAggregationElection: true }
        : newEnt
      const next = [...prev, seeded]
      writeStep1Entities(next)
      return next
    })
    setExpandedIdx(entities.length)
    setShowEntityPicker(false)
  }, [entities.length, navigate])

  // F-FUNC-05: consume a Dashboard entity-preset hand-off once on mount. If the
  // user arrived via a preset card (e.g. "S-Corp Owner") and Step 1 is empty,
  // seed an entity of that type through the same addEntityOfType path the in-app
  // picker uses, then clear the hint so it fires exactly once.
  const presetConsumed = useRef(false)
  useEffect(() => {
    if (presetConsumed.current) return
    const presetType = readPresetEntityType()
    if (presetType && entities.length === 0) {
      presetConsumed.current = true
      addEntityOfType(presetType)
    }
    clearPresetEntityType()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateEntity = useCallback((idx, updated) => {
    setEntities(prev => {
      const next = [...prev]
      next[idx] = updated
      writeStep1Entities(next)
      // BUG-A FIX (SSTB / QBI fields not reaching Step 2 via nav): writeStep1Entities
      // writes only the session working copy; Step 2 reads via readStep1State() which
      // reads writeStep1State. If the user navigates to Step 2 via the breadcrumb before
      // the async persistStep1 useEffect fires, box17V_sstb (and any other QBI field)
      // is absent from the Step-2 entity list, silently ignoring the SSTB checkbox.
      // Fix: eagerly compute and write the full Step-1 payload here, synchronously, so
      // readStep1State always reflects the latest entity state regardless of nav path.
      const k1Total = next.reduce((s, e) => {
        if (!e || isCCorpEntity(e.type)) return s
        const pnl = e.pnl || {}
        const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
        const own = ownPct(e.own) / 100
        const k1  = Math.round(net * own)
        return s + k1 - nf(e.box11_12) - nf(e.box12_13)
      }, 0)
      writeStep1State({ entities: next, entitiesRaw: next, k1Total, isCoopPatron: false })
      return next
    })
  }, [])

  // F-FUNC-07: the §1.469-9(g) aggregation election is a SINGLE taxpayer-level
  // election covering the entire rental portfolio (the engine already reads it as
  // "any rental elected"). The label says "across all rental properties," so the
  // control is now portfolio-wide: toggling it on any rental card applies to every
  // rental, and newly added rentals inherit the current election. This keeps the
  // per-card checkboxes consistent with the one portfolio election the label
  // describes, instead of each rental starting unchecked and needing a re-election.
  const setRentalAggregationElectionAll = useCallback((value) => {
    setEntities(prev => {
      const next = prev.map(e =>
        isRealEstateEntity(e.type) ? { ...e, rentalAggregationElection: value === true } : e
      )
      writeStep1Entities(next)
      return next
    })
  }, [])

  const removeEntity = useCallback((idx) => {
    setEntities(prev => prev.filter((_, i) => i !== idx))
    setExpandedIdx(null)
  }, [])

  const handleIntegrationDisconnect = useCallback((pid) => {
    localStorage.removeItem(integrationKey(pid, 'connected'))
    localStorage.removeItem(integrationKey(pid, 'token'))
    localStorage.removeItem(integrationKey(pid, 'extra'))
    localStorage.removeItem(integrationKey(pid, 'syncedAt'))
    localStorage.removeItem(integrationKey(pid, 'failed'))
    removeConnectedApp()
    setEntities(prev => {
      const next = prev.map(e =>
        e.connectedId === pid
          ? {
              ...e,
              connectedId: null,
              isManual: true,
              name: '',
              pnl: { grossRevenue: '', totalExpenses: '', officerSalary: '', netProfit: '', categories: {} },
            }
          : e
      )
      writeStep1Entities(next)
      return next
    })
  }, [])

  const persistStep1 = useCallback(() => {
    writeStep1Entities(entities)
    const k1Total = entities.reduce((s, e) => {
      // C-Corp profit is taxed at the entity level (21%) and reaches the owner as dividends,
      // NOT as pass-through K-1 — so it must not be summed into k1Total. TaxReturn computes
      // its corporate layer and folds the dividends into qualified dividends separately.
      if (isCCorpEntity(e.type)) return s
      const pnl = e.pnl || {}
      const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
      const own = ownPct(e.own) / 100
      const k1  = Math.round(net * own)
      const sec179 = nf(e.box11_12)
      const box12  = nf(e.box12_13)
      return s + k1 - sec179 - box12
    }, 0)
    writeStep1State({ entities, entitiesRaw: entities, k1Total, isCoopPatron: false })  // F-05: persist qbiLossCarryforward in raw shape
    writeTaxYear(taxYear)
    return k1Total
  }, [entities, taxYear])

  // FIX (k1-sync): keep the persisted Step-1 payload — entities AND the derived
  // k1Total — current on every edit, not only when "Save P&L"/"Continue" runs.
  // updateEntity previously refreshed only the sessionStorage working copy, so
  // editing a field that feeds k1Total (e.g. the QBI §179 box11_12) after an
  // initial save left writeStep1State's k1Total stale. Step 2/3 reach the data
  // through readStep1State(), so a user who jumps there via the top nav (instead
  // of the "Continue to Step 2" button) could see a K-1 total that lagged the
  // entity edits. Re-persisting whenever entities/taxYear change closes that gap.
  // Safe: persistStep1 writes storage only and never calls setEntities, so this
  // cannot loop.
  useEffect(() => {
    if (Array.isArray(entities) && entities.length > 0) persistStep1()
  }, [entities, taxYear, persistStep1])

  const handleSaveRecord = useCallback(async (name) => {
    setSaveStatus('saving')
    const k1Total = persistStep1()
    const existing = readUserRecords()

    // F-FUNC-02: when a saved record is loaded (Dashboard.loadRecord set the
    // active-record pointer), UPDATE that record in place instead of minting a
    // new id on every save — which previously forked an identically-named
    // duplicate each time. A genuinely new calculation (no active pointer, or
    // one cleared by clearStep1State) still gets a fresh id.
    const activeId     = readActiveRecordId()
    const existingIdx  = activeId != null
      ? existing.findIndex(r => String(r.id) === String(activeId))
      : -1
    const priorName    = existingIdx >= 0 ? (existing[existingIdx].name || null) : null
    const recordId     = existingIdx >= 0 ? existing[existingIdx].id : Date.now()
    // Skipping the name (modal "Skip") passes null/'' — keep the record's prior
    // name rather than blanking it; a new record with no name stays null as before.
    const finalName    = (name != null && name !== '') ? name : priorName

    const record = {
      id: recordId,
      name: finalName,
      savedAt: formatTimestamp(new Date()),
      taxYear,
      entities,
      k1Income: k1Total,
      biz: {
        entityType:    entities[0]?.type       || 'S Corporation',
        year:          taxYear,
        ownershipPct:  entities[0]?.own        || '100',
        grossRevenue:  String(nf(entities[0]?.pnl?.grossRevenue)    || ''),
        operatingExpenses: String(nf(entities[0]?.pnl?.totalExpenses) || ''),
        officerSalary: String(nf(entities[0]?.pnl?.officerSalary)   || ''),
        depreciation:  String(nf(entities[0]?.pnl?.depreciation)    || ''),
        pnl:           entities[0]?.pnl || {},
      },
      f1040: readPersonalContext(),
    }

    try {
      await syncRecordToServer(record)
      writeActiveRecord(record.id, record.name || record.savedAt)
      setSaveStatus('saved')
    } catch (err) {
      console.error('CalculateTaxInner handleSaveRecord error:', err)
      setSaveStatus('error')
    }
    setTimeout(() => setSaveStatus('idle'), 3000)
  }, [entities, taxYear, persistStep1])

  // F23 FIX: fetchEntityPnL now writes a ts360_{provider}_synced_at timestamp
  // after every successful sync, and returns a diff summary string so the tile
  // can display "Revenue updated: $X → $Y (+$Z)".
  async function fetchEntityPnL(idx, pid, tok, extra, isManualSync = false) {
    try {
      let url = `/integrations/${pid}/data?token=${encodeURIComponent(tok)}&year=${encodeURIComponent(taxYear)}`
      if (pid === 'quickbooks' && extra) url += '&realm='   + extra
      if (pid === 'xero'        && extra) url += '&tenant='  + extra
      if (pid === 'freshbooks'  && extra) url += '&account=' + extra
      if (pid === 'xero') {
        const xeroRefresh = readXeroRefresh()
        if (xeroRefresh) url += '&refresh_token=' + encodeURIComponent(xeroRefresh)
      }
      const d = await apiFetch(url, { raw: true }).then(r => r.json())
      if (d && !d.error) {
        const empty =
          d.revenue === 0 && d.expenses === 0 && (d.net_profit === 0 || d.net_profit == null)
        if (empty) {
          localStorage.setItem(integrationKey(pid, 'failed'), 'true')
          bumpIntegrationUi()
          setFooterError(`${pid.charAt(0).toUpperCase() + pid.slice(1)} connected but returned no P&L for ${taxYear}. Try another tax year, Sync now, or enter figures manually.`)
          setTimeout(() => setFooterError(null), 10000)
        } else {
          const pnl = {
            grossRevenue:  d.revenue,
            totalExpenses: d.expenses,
            netProfit:     d.net_profit,
            officerSalary: d.officer_salary || 0,
            categories:    d.categories || {}
          }
          // F23 FIX: write sync timestamp
          const syncedAt = new Date().toISOString()
          localStorage.setItem(integrationKey(pid, 'syncedAt'), syncedAt)
          localStorage.removeItem(integrationKey(pid, 'failed'))
          bumpIntegrationUi()

          setEntities(prev => {
            const updated = [...prev]
            const providerName = pid.charAt(0).toUpperCase() + pid.slice(1) + ' Business'

            // F23 FIX: compute diff for manual re-syncs
            if (isManualSync && updated[idx]) {
              const prevRev = nf(updated[idx]?.pnl?.grossRevenue)
              const newRev  = d.revenue
              if (prevRev !== newRev && prevRev > 0) {
                const diff = newRev - prevRev
                const sign = diff >= 0 ? '+' : ''
                setSyncDiffs(s => ({
                  ...s,
                  [pid]: `Gross receipts updated: ${fmt(prevRev)} → ${fmt(newRev)} (${sign}${fmt(diff)})`
                }))
                // Clear diff after 8s
                setTimeout(() => setSyncDiffs(s => { const n = { ...s }; delete n[pid]; return n }), 8000)
              }
            }

            if (updated[idx]) {
              updated[idx] = { ...updated[idx], pnl, connectedId: pid, isManual: false, name: providerName }
            } else {
              updated.push({
                name: providerName,
                type: 'S Corporation', own: '100', ein: '', state: '', formationDate: '',
                pnl, connectedId: pid, isManual: false,
                stockBasis: '', debtBasis: '', distributions: '',
                isREP: false, isActiveParticipant: false,
              })
            }
            return updated
          })
        }
      } else if (d?.error) {
        localStorage.setItem(integrationKey(pid, 'failed'), 'true')
        bumpIntegrationUi()
        const detail = d.status ? ` (HTTP ${d.status})` : ''
        setFooterError(`${pid.charAt(0).toUpperCase() + pid.slice(1)} sync failed${detail} — try Sync now or reconnect.`)
        setTimeout(() => setFooterError(null), 10000)
      } else if (isManualSync) {
        localStorage.setItem(integrationKey(pid, 'failed'), 'true')
        bumpIntegrationUi()
      }
    } catch (ex) {
      console.error('fetchEntityPnL error:', ex)
      if (isManualSync) {
        localStorage.setItem(integrationKey(pid, 'failed'), 'true')
        bumpIntegrationUi()
      }
    }
  }

  // F23 FIX: manual re-sync handler called from IntegrationTile "Sync now" button
  const handleManualSync = useCallback((pid) => {
    const tok   = sessionStorage.getItem(integrationKey(pid, 'token')) || localStorage.getItem(integrationKey(pid, 'token')) || ''
    const extra = localStorage.getItem(integrationKey(pid, 'extra'))
    const idx   = entities.findIndex(e => e.connectedId === pid)
    fetchEntityPnL(idx >= 0 ? idx : 0, pid, tok, extra, true)
  }, [entities, taxYear])

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const mp = {
      qb_token: 'quickbooks', quickbooks_token: 'quickbooks',
      xero_token: 'xero',
      wave_token: 'wave', wave_token2: 'wave',
      fb_token: 'freshbooks', freshbooks_token: 'freshbooks'
    }
    const xeroRefresh = p.get('xero_refresh')
    if (xeroRefresh) writeXeroRefresh(xeroRefresh)
    const entityIdx = parseInt(p.get('entity') || sessionStorage.getItem('ts360_connecting_entity')) || 0
    let foundInUrl = false

    for (const pid of ['quickbooks', 'xero', 'wave', 'freshbooks']) {
      if (p.get(pid) === 'connected') {
        foundInUrl = true
        localStorage.setItem(integrationKey(pid, 'connected'), 'true')
        localStorage.removeItem(integrationKey(pid, 'failed'))
        const hasToken = Object.entries(mp).some(([k, v]) => v === pid && p.get(k))
        if (!hasToken) {
          fetchEntityPnL(entityIdx, pid, '', null)
        }
        break
      }
    }

    for (const [k, pid] of Object.entries(mp)) {
      const tok = p.get(k)
      if (tok) {
        foundInUrl = true
        localStorage.setItem(integrationKey(pid, 'connected'), 'true')
        localStorage.removeItem(integrationKey(pid, 'failed'))
        localStorage.setItem(integrationKey(pid, 'token'), tok)
        sessionStorage.setItem(integrationKey(pid, 'token'), tok)
        const extra = pid === 'quickbooks' ? p.get('realm')
                    : pid === 'xero'        ? p.get('tenant')
                    : pid === 'freshbooks'  ? p.get('account')
                    : null
        if (extra) localStorage.setItem(integrationKey(pid, 'extra'), extra)
        fetchEntityPnL(entityIdx, pid, tok, extra)
      }
    }

    if (!foundInUrl) {
      for (const pid of ['quickbooks', 'xero', 'wave', 'freshbooks']) {
        if (localStorage.getItem(integrationKey(pid, 'connected')) === 'true') {
          const tok   = sessionStorage.getItem(integrationKey(pid, 'token')) || localStorage.getItem(integrationKey(pid, 'token')) || ''
          const extra = localStorage.getItem(integrationKey(pid, 'extra'))
          if (tok) { fetchEntityPnL(0, pid, tok, extra); break }
        }
      }
    }

    if (foundInUrl) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const hasData = entities.length > 0 && entities.some(e => {
    const pnl = e.pnl || {}
    return nf(pnl.grossRevenue) > 0 || nf(pnl.netProfit) !== 0
  })

  // F-01 / F-02: footer buttons are disabled when no entity has been added
  const footerDisabled = entities.length === 0

  // O2 FIX: handleContinueToStep2 always navigates to /tax-return.
  // The guard checks entities.length > 0 before calling persistStep1() and
  // navigate(). This prevents the new-account edge case where the footer's
  // onClick resolved to /privacy due to a missing record ID in the route param.
  const handleContinueToStep2 = () => {
    if (footerDisabled) {
      setFooterError('Add at least one business entity to continue.')
      setTimeout(() => setFooterError(null), 4000)
      return
    }
    persistStep1()
    navigate('/tax-return')
  }

  const handleFooterSave = () => {
    if (footerDisabled) {
      setFooterError('Add at least one business entity before saving.')
      setTimeout(() => setFooterError(null), 4000)
      return
    }
    setShowNameModal(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Mobile desktop nudge — shown on narrow viewports only via CSS media query equivalent.
          TaxStat360 is a desktop tool — the Tax Tracker has too many fields and a live
          side panel to be usable at phone widths. This banner appears on viewports under
          800px and nudges users to switch to a desktop browser without blocking the app.
          Uses inline style + a hidden <style> tag since we're in a JSX component. */}
      <style>{`
        .ts360-mobile-nudge { display: none; }
        @media (max-width: 800px) { .ts360-mobile-nudge { display: flex; } }
      `}</style>
      <div className="ts360-mobile-nudge" style={{
        background: '#1e293b', color: '#f1f5f9',
        padding: '10px 16px', gap: 12, alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, lineHeight: 1.5,
      }}>
        <span>💻 <strong>TaxStat360 works best on a desktop browser.</strong> Some features may be hard to use on a small screen.</span>
      </div>

      {/* Nav */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, minWidth: 0, overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <svg width="30" height="30" viewBox="0 0 34 34" style={{ flexShrink: 0 }}><rect width="34" height="34" rx="8" fill={N}/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {[
              { n: 1, label: 'Entities', done: entities.length > 0, isCurrent: true,  isReachable: true  },
              { n: 2, label: 'Personal Return', done: false,                isCurrent: false, isReachable: false },
              { n: 3, label: STEP3_LABEL, done: false,             isCurrent: false, isReachable: false },
            ].map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: s.isCurrent ? B : s.done ? G : '#E2E8F0',
                    color: s.isCurrent || s.done ? '#fff' : '#94A3B8',
                    fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {s.done ? '✓' : s.n}
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: s.isCurrent ? 700 : 500,
                    color: s.isCurrent ? N : '#94A3B8',
                    whiteSpace: 'nowrap',
                    display: 'inline',
                    pointerEvents: 'none',
                    cursor: 'default',
                  }}>
                    {s.label}
                  </span>
                </div>
                {i < 2 && <span style={{ color: '#CBD5E1', fontSize: 12 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => navigate('/dashboard')}   style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600, whiteSpace: 'nowrap' }}>Dashboard</button>
          <button onClick={() => navigate('/ai-analysis')} style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: isPro() ? SL : '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>{STEP3_LABEL}{!isPro() ? ' 🔒' : ''}</button>
          <button onClick={() => signOut(navigate)}        style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600, whiteSpace: 'nowrap' }}>Sign Out</button>
          <button onClick={() => navigate('/settings')}    style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600, whiteSpace: 'nowrap' }}>Settings</button>
        </div>
      </nav>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 20px 120px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 6px' }}>Business Entities</h1>
          <p style={{ color: SL, fontSize: 14, margin: 0 }}>Add each business entity you have an ownership stake in. Gross receipts, expenses, and your share of business income flow to your personal return in Step 2.</p>
        </div>

        {/* Tax year selector */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: N, flexShrink: 0 }}>Tax Year</label>
          <select value={taxYear} onChange={e => { setTaxYear(parseInt(e.target.value)); writeTaxYear(parseInt(e.target.value)) }}
            style={{ padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, fontFamily: 'inherit', outline: 'none', flex: 1 }}>
            {SUPPORTED_TAX_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Integrations */}
        {/* O1 FIX: The subtitle "or skip and enter manually" now has a working
            counterpart. An "Enter manually →" button appears in the integration
            card for users without accounting software. Clicking it opens a
            standalone ManualEntryPanel that creates a new entity. The subtitle
            copy is preserved — the path now fulfils the promise.
            CSV import has been removed entirely — entities are added by connecting
            accounting software or by manual entry. */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: N, marginBottom: 4 }}>
            Add your business financials
            <InfoTip text="Two ways to add an entity: type your gross receipts, expenses, and salary yourself, or connect QuickBooks, Xero, Wave, or FreshBooks to sync your P&L automatically." />
          </div>
          <p style={{ fontSize: 12, color: SL, margin: '0 0 12px' }}>
            Enter your figures yourself, or sync them automatically from accounting software.
          </p>

          {/* F1 FIX (UX audit): the manual/express path was a small secondary button while
              the integration tiles dominated — but most first-time users (and real-estate
              investors) just want to type their numbers. Manual entry is now the PRIMARY,
              full-width action; connecting software is the "or sync automatically" alternative
              below the divider. Same one-click behavior: creates a blank entity and opens it. */}
          <button
            onClick={() => {
              // FINDING 1 FIX: "Enter my figures manually" previously bypassed the
              // entity-type picker and silently appended a duplicate S-Corp entity each
              // time it was clicked, with no scroll to the new card.
              //
              // New behavior:
              //   1. If an empty/blank entity already exists, just expand + scroll to it
              //      rather than creating a second one (dedupe guard).
              //   2. If no entities exist yet, open the entity-type picker (same as
              //      "+ Add Business Entity") so the user selects their entity type
              //      first — avoids hardcoding S-Corp for every user.
              //   3. If the user already has entities and is Pro, open the picker to
              //      add another of the correct type.
              //
              // The scroll runs after a 100 ms tick to give React time to render the
              // newly expanded card before we measure its position.

              // Check for an existing entity that has no income entered (blank P&L)
              const blankIdx = entities.findIndex(e =>
                e.isManual &&
                !nf(e.pnl?.grossRevenue) &&
                !nf(e.pnl?.totalExpenses) &&
                !nf(e.pnl?.officerSalary)
              )

              if (blankIdx !== -1) {
                // Reuse the existing blank entity — just expand and scroll to it
                setExpandedIdx(blankIdx)
                setTimeout(() => {
                  const cards = document.querySelectorAll('[data-entity-card]')
                  if (cards[blankIdx]) cards[blankIdx].scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 100)
                return
              }

              // No blank entity exists — gate on Pro before adding another
              if (!isPro() && entities.length >= 1) { navigate('/upgrade'); return }

              // Open the entity-type picker (same path as "+ Add Business Entity")
              // so the user's entity type is chosen explicitly, not hardcoded to S-Corp
              setShowEntityPicker(true)
            }}
            style={{
              width: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: B,
              border: 'none',
              borderRadius: 10,
              padding: '13px',
              cursor: 'pointer',
              color: '#fff',
              fontFamily: 'inherit',
              marginBottom: 14,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>✏ Enter my figures manually</span>
            <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>Fastest — type your gross receipts, expenses & salary</span>
          </button>

          {/* divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
            <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>or connect accounting software</span>
            <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {(() => {
              const userIsPro = isPro()
              const connectedCount = entities.filter(e => e.connectedId).length
              return INTEGRATIONS.map(integ => {
                const isConnected = localStorage.getItem(integrationKey(integ.id, 'connected')) === 'true'
                const isLocked = !userIsPro && !isConnected && connectedCount >= 1
                if (isLocked) {
                  return (
                    <LockedFeature key={integ.id} requiredPlan="professional" label="Unlimited Integrations" minHeight={70}>
                      <IntegrationTile
                        integ={integ}
                        onConnect={() => {}}
                        onDisconnect={() => {}}
                        onSync={null}
                        syncDiff={null}
                      />
                    </LockedFeature>
                  )
                }
                return (
                  <IntegrationTile
                    key={`${integ.id}-${integrationRevision}`}
                    integ={integ}
                    onConnect={() => { window.location.href = `${API_BASE_URL}/integrations/${integ.id}/connect` }}
                    onDisconnect={handleIntegrationDisconnect}
                    onSync={handleManualSync}
                    syncDiff={syncDiffs[integ.id] || null}
                  />
                )
              })
            })()}
          </div>
        </div>

        {/* Entity cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {entities.map((ent, idx) => (
            <div key={ent.id || idx} data-entity-card="">
              <EntityCard
                entity={ent}
                idx={idx}
                onUpdate={updateEntity}
                onAggregationElection={setRentalAggregationElectionAll}
                portfolioAggregationElected={entities.some(e => isRealEstateEntity(e.type) && e.rentalAggregationElection === true)}
                onRemove={setConfirmRemoveIdx}
                colorAccent={ENTITY_COLORS[idx % ENTITY_COLORS.length]}
                isExpanded={expandedIdx === idx}
                onToggleExpand={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              />
            </div>
          ))}
        </div>

        {/* Add entity button */}
        {(isPro() || entities.length === 0) ? (
          <button onClick={addEntity} style={{ width: '100%', padding: '13px', border: '2px dashed #CBD5E1', borderRadius: 12, background: 'transparent', color: SL, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
            + Add Business Entity
          </button>
        ) : (
          <button onClick={() => navigate('/upgrade')} title="Multi-entity input is a Professional feature" style={{ width: '100%', padding: '13px', border: '2px dashed #BFDBFE', borderRadius: 12, background: '#F0F6FF', color: B, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            🔒 Add another entity — <span style={{ textDecoration: 'underline' }}>Professional</span>
          </button>
        )}
        <button onClick={() => addEntityOfType('Real Estate (Schedule E)')} style={{ width: '100%', padding: '13px', border: '2px dashed #A78BFA', borderRadius: 12, background: '#FAF5FF', color: '#6D28D9', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 8 }}>{'🏠 + Add Rental Property (Schedule E)'}</button>
        {/* UX-M3 FIX: unsaved warning also shown in sticky footer so it's always visible */}
        {entities.length > 0 && (<div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 10, padding: '10px 14px', color: '#92400E', fontSize: 13, fontWeight: 500, marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 16 }}>{'⚠️'}</span><span>{'Your entries are not saved yet. Click Save Progress below to keep them — unsaved work can be lost when you sign out or when accounting software re-syncs.'}</span></div>)}

        {/* Compare button */}
        {entities.length > 0 && isPro() && (
          <button
            onClick={() => setShowCompare(true)}
            style={{ width: '100%', padding: '11px', border: '1.5px solid ' + B, borderRadius: 12, background: '#EFF6FF', color: B, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
            ⚖ Compare Entity Structures
          </button>
        )}
      </div>

      {/* P0 FIX: Ask Aria widget is position:fixed bottom-right (~60x60px at bottom:16 right:16).
          The prior `right: 80` offset left a visual gap on desktop and still caused overlap on
          mobile because the widget's bottom edge (16 + 60 = 76px) exceeded the footer height
          (~58px), pushing the widget partially over "Continue to Step 2".
          Fix: extend footer to full-width (right: 0) and add paddingRight: 90 to the inner
          button row so the rightmost button always clears the widget regardless of viewport.
          The footer background still covers the full width so it reads as a clean bar. */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E2E8F0', padding: '12px 24px', zIndex: 70 }}>
        {footerError && (
          <div role="alert" style={{ fontSize: 12, color: R, fontWeight: 600, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '6px 12px', marginBottom: 6 }}>
            {footerError}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingRight: 80 }}>
          <div style={{ fontSize: 12, color: SL, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {entities.length > 0
              ? `${entities.length} entit${entities.length > 1 ? 'ies' : 'y'} added`
              : <span style={{ color: R, fontWeight: 600 }}>Add an entity to continue</span>
            }
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleFooterSave}
              disabled={footerDisabled}
              style={{
                padding: '10px 16px',
                border: '1px solid ' + (footerDisabled ? '#E2E8F0' : '#CBD5E1'),
                borderRadius: 8, background: '#fff',
                fontSize: 13, fontWeight: 600,
                color: footerDisabled ? '#94A3B8' : SL,
                cursor: footerDisabled ? 'not-allowed' : 'pointer',
                opacity: footerDisabled ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {/* F-11 UX FIX: dot indicator signals unsaved changes so users don't
                  need to scroll to the bottom warning to know they need to save. */}
              {saveStatus !== 'saved' && !footerDisabled && (
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} aria-label="Unsaved changes" />
              )}
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'Save Progress'}
            </button>
            {/* O2 FIX: onClick is now guarded and always navigates to /tax-return */}
            <button
              onClick={handleContinueToStep2}
              disabled={footerDisabled}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: 8,
                background: footerDisabled ? '#94A3B8' : N,
                color: '#fff',
                fontSize: 13, fontWeight: 700,
                cursor: footerDisabled ? 'not-allowed' : 'pointer',
                opacity: footerDisabled ? 0.6 : 1,
              }}
            >
              Continue to Step 2 →
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EntityCompareModal
        isOpen={showCompare}
        onClose={() => setShowCompare(false)}
        entity={entities[0]}
        entities={entities}
        entityIdx={0}
        personalContext={() => readPersonalContext()}
      />
      {showNameModal && (
        <NameRecordModal
          defaultName={readActiveRecordName() || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          onConfirm={name => { handleSaveRecord(name); setShowNameModal(false) }}
          onSkip={() => { handleSaveRecord(null); setShowNameModal(false) }}
        />
      )}
      {confirmRemoveIdx !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px', maxWidth: 380, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
            <h4 style={{ fontWeight: 800, color: N, margin: '0 0 8px' }}>Remove this entity?</h4>
            <p style={{ fontSize: 13, color: SL, margin: '0 0 16px' }}>This will remove the entity and all its data from Step 1. This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmRemoveIdx(null)} style={{ flex: 1, padding: '10px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { removeEntity(confirmRemoveIdx); setConfirmRemoveIdx(null) }} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: R, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Entity picker modal */}
      {showEntityPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: N, margin: '0 0 6px' }}>What type of entity?</h3>
            <p style={{ fontSize: 13, color: SL, margin: '0 0 20px', lineHeight: 1.6 }}>
              Choose the structure that matches your ownership interest. This determines how income flows to your personal return.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { type: 'S Corporation',            icon: '🏢', desc: 'K-1 income not subject to SE tax · reasonable officer W-2 compensation required'         },
                { type: 'Partnership / LLC',         icon: '🤝', desc: 'K-1 income · Schedule E page 2 · SE tax may apply'           },
                { type: 'Sole Proprietor / SMLLC',   icon: '💼', desc: 'Schedule C · self-employment tax · QBI eligible'             },
                { type: 'Real Estate (Schedule E)',   icon: '🏠', desc: 'Rental income/loss · passive activity rules · depreciation'  },
              ].map(({ type, icon, desc }) => (
                <button
                  key={type}
                  onClick={() => addEntityOfType(type)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1.5px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = B}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
                >
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: N, marginBottom: 2 }}>{type}</div>
                    <div style={{ fontSize: 12, color: SL }}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowEntityPicker(false)} style={{ width: '100%', marginTop: 16, padding: '10px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
