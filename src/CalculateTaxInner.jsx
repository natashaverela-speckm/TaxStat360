// src/CalculateTaxInner.jsx
// Step 1 of the TaxStat360 two-step flow: Business Entity Entry.
// Users connect accounting software (QuickBooks, Xero, Wave, FreshBooks)
// or enter P&L figures manually, then advance to Step 2 (TaxReturn.jsx).
//
// ── Change log ────────────────────────────────────────────────────────────────
// BUG-02 FIX: EntityCard netProfit formula double-subtracted totalExpenses
//   when P&L data came from an accounting software integration (QuickBooks,
//   Xero, Wave, FreshBooks). The integration sets pnl.netProfit directly from
//   the API response (d.net_profit). The prior formula:
//     nf(pnl.netProfit ?? pnl.grossRevenue) - nf(pnl.totalExpenses)
//   resolves the ?? to pnl.netProfit when it exists, then STILL subtracts
//   totalExpenses — double-counting all expenses.
//   Example: netProfit=-106,507, totalExpenses=312,850 → displayed -419,357.
//   Fix: parentheses make (grossRevenue - totalExpenses) the fallback used
//   ONLY when netProfit is absent:
//     nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
//   When netProfit is present (integration sync), it is used directly.
//   When netProfit is absent (entity card before manual entry is applied),
//   it falls back to revenue - expenses as before.
//   Impact: display only — persistStep1() already used the correct formula,
//   so the tax calculation in Step 2 was always correct. This fixes the
//   entity card header K-1 value and the P&L summary Net Profit line.
//
// L-01 FIX: ReasonableCompIndicator displayed "35% of net profit" as the
//   description of the recommended officer salary threshold. The math is correct
//   (Math.round(0.35/0.65 * netProfit) produces the salary that equals 35% of
//   total comp when total comp = salary + distributions = netProfit), but the
//   LABEL was wrong. The heuristic is 35% of TOTAL OFFICER COMPENSATION
//   (salary ÷ (salary + distributions)), NOT 35% of net profit alone.
//   Fixed: "35% of net profit" → "35% of total officer compensation" in all
//   instances within ReasonableCompIndicator.
//
// F-05 FIX: No discrete depreciation field in manual entry form. Users with
//   depreciation deductions (Section 179, MACRS, bonus depreciation) had no
//   way to enter them separately. AIAnalysis.jsx was flagging "No Depreciation
//   Recorded" but there was no field to fill. Fix: added manDep state + a
//   dedicated Depreciation input field (between Operating Expenses and Officer
//   Salary) in the ManualEntryPanel. applyManual() now includes dep in
//   totalExpenses so it correctly reduces netProfit and flows to the tax engine.
//
// C-02 FIX: Footer "Save Record" button renamed to "Save This Record" to match
//   the identical button in TaxReturn.jsx Step 2, providing consistent labeling
//   across both steps of the flow.
//
// C-05 FIX: The "✏ Edit / re-enter data" control was styled as a bare text link
//   (background:none, border:none, textDecoration:underline). This made it
//   visually indistinguishable from a hyperlink and easy to miss. Restyled as a
//   small secondary outlined button (border: 1px solid #E2E8F0, borderRadius: 7,
//   padding: 6px 12px) consistent with secondary action buttons used elsewhere.
//
// L-01 FIX (Pass 3 — Correct Labeling):
//   QBI field label "Section 179 / Ordinary Income Addback (K-1 Box 11 / Box 12)"
//   had two errors:
//   (a) "Addback" is semantically backwards — persistStep1() SUBTRACTS box11_12
//       from k1Total, reducing K-1 income and QBI. An "addback" implies adding
//       something back to income. The tooltip even contradicted the label:
//       "they reduce your allocable K-1 income."
//   (b) "Ordinary Income Addback" is not an IRS form label. K-1 Box 11
//       (Form 1120-S) and Box 12 (Form 1065) are both labeled "Section 179
//       deduction" on the actual forms.
//   Tooltip also said "reduce your at-risk basis" — at-risk basis is a §465
//   concept. §179 reduces QBI (Treas. Reg. §1.199A-3(b)(1)(ii)(A)) and
//   shareholder/partner basis (§1367/§705), not at-risk basis.
//   Fix: label → "Section 179 Deduction (K-1 Box 11 / Box 12)"; tooltip
//   rewritten with correct citations and a double-counting warning.
//
// PASS4B-02b (§1366(d) Basis Limitation UI + §1368 Distribution Capital Gain):
//   The calculation engine (taxCalc.js) already implemented §1366(d) loss
//   limitation via the stockBasis / debtBasis fields on each entity. However,
//   there were no UI input fields for these values, so the gate was unreachable.
//   This change adds three new fields to every S-Corp entity:
//
//   1. stockBasis (Form 7203, Line 1) — beginning-of-year stock basis.
//      The engine reads e.stockBasis to cap deductible losses; losses in excess
//      of basis are suspended and carried forward (IRC §1366(d)(2)).
//
//   2. debtBasis (Form 7203, Part II) — loans personally made by the shareholder
//      to the S-Corp. Absorbs losses after stock basis is exhausted (§1366(d)(1)(B)).
//
//   3. distributions (Form 7203, Line 6 / Schedule M-2 Line 7) — cash or
//      property distributions received from the S-Corp this year. Distributions
//      in excess of remaining stock basis (after current-year income/loss) are
//      taxable as long-term capital gain (IRC §1368(b)(2)) and are threaded into
//      _ltGain in taxCalc.js (PASS4B-02b). This capital gain does not appear on
//      the K-1 — it is computed at the shareholder level.
//
//   UI: A collapsible "Form 7203 Basis & Distributions" panel is added inside
//   EntityCard for S-Corp entities (after the §199A QBI section). The panel
//   shows inline warning badges:
//   • §1366(d) suspension alert when entered loss > basis (red)
//   • §1366(d) full-loss confirmation when loss ≤ basis (green)
//   • §1368 capital gain alert when distributions > post-income basis (red)
//   • §1368 tax-free confirmation when distributions ≤ basis (green)
//   • "Enter basis to compute" prompt when distributions entered but no basis (amber)
//
//   All three fields are initialised to '' in addEntityOfType and handleCsvUpload.
//   The EntityCard badge computations are display-only — taxCalc.js is the
//   authoritative calculation source.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, calcQBI, getStdDed } from './taxCalc'
import { readPersonalContext, readTaxYear, writeStep1State, writeTaxYear } from './utils/sessionState.js'
import { signOut } from './utils/signOut'
import LockedFeature, { isPro, isEnterprise } from './LockedFeature'
import { ENTITY_TYPES, INTEGRATIONS, API_BASE_URL } from './constants.js'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R } from './theme.js'
import { fmt } from './utils/formatMoney.js'
import { ownPct, isSCorpEntity, isPassthroughEntity } from './utils/entityPredicates.js'

// ─── Color palette ──────────────────────────────────────────────────────────
const ENTITY_COLORS = [B, '#7C3AED', '#0891B2', '#D97706', '#059669', '#DC2626']

// ─── Helpers ─────────────────────────────────────────────────────────────────
const nf = (v, fallback = 0) => { const n = parseFloat(String(v || '').replace(/,/g, '')); return Number.isFinite(n) ? n : fallback }

function InfoTip({ text, wide }) {
  const [show, setShow] = useState(false)
  const ref = useRef()
  useEffect(() => {
    if (!show) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShow(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [show])
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 5 }}>
      <button onClick={() => setShow(s => !s)}
        style={{ width: 16, height: 16, borderRadius: '50%', background: '#E2E8F0', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: SL, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        ?
      </button>
      {show && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: N, color: '#fff', borderRadius: 8, padding: '10px 14px',
          fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
          width: wide ? 340 : 280, zIndex: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}>
          {text}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid ' + N }} />
        </div>
      )}
    </span>
  )
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

    const stripped = e.target.value.replace(/[^0-9\-]/g, '')
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

  const handleFocus = () => {
    setFocused(true)
    // Keep formatted value on focus — commas remain visible while editing
  }

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

// ─── L-01 FIX: ReasonableCompIndicator ────────────────────────────────────────
function ReasonableCompIndicator({ officerSal, netProfit, isSCorp }) {
  if (!isSCorp || netProfit <= 20000) return null

  const totalComp = officerSal + Math.max(0, netProfit)
  const ratio = totalComp > 0 ? officerSal / totalComp : 0
  const minTarget = Math.round(0.35 / 0.65 * Math.max(0, netProfit))

  if (officerSal === 0) {
    return (
      <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '12px 14px', marginTop: 10, fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: R, marginBottom: 4 }}>🚨 No Officer Compensation</div>
        <div style={{ color: '#7F1D1D', lineHeight: 1.6 }}>
          S-Corp owners must receive reasonable W-2 compensation for services rendered (Rev. Rul. 74-44).
          A common practitioner starting point is <strong>35–45% of total officer compensation</strong>.
          Suggested minimum: <strong>{fmt(minTarget)}/yr</strong>.
        </div>
      </div>
    )
  }

  if (ratio < 0.35) {
    return (
      <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 10, padding: '12px 14px', marginTop: 10, fontSize: 13 }}>
        <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Officer Salary May Be Too Low</div>
        <div style={{ color: '#78350F', lineHeight: 1.6 }}>
          Your salary is {(ratio * 100).toFixed(0)}% of total officer compensation (salary ÷ total comp).
          Tax practitioners commonly recommend 35–45% of total officer compensation based on case law
          including Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012).
          A common starting point: <strong>{fmt(minTarget)}</strong>.
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 10, padding: '12px 14px', marginTop: 10, fontSize: 13 }}>
      <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Officer Compensation Looks Reasonable</div>
      <div style={{ color: '#166534', lineHeight: 1.6 }}>
        Salary is {(ratio * 100).toFixed(0)}% of total officer compensation — within the
        practitioner-recommended 35–45% range. Ensure FICA payroll taxes are being withheld and
        remitted quarterly.
      </div>
    </div>
  )
}

// ─── Integration tile ─────────────────────────────────────────────────────────
function IntegrationTile({ integ, onConnect, onDisconnect, connected }) {
  return (
    <div style={{
      background: connected ? integ.bg : '#fff',
      border: '1.5px solid ' + (connected ? integ.color : '#E2E8F0'),
      borderRadius: 10, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 8,
      transition: 'all 0.15s', overflow: 'hidden',
    }}>
      <div
        onClick={() => !connected && onConnect(integ.id)}
        style={{
          width: 32, height: 32, borderRadius: 8, background: integ.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
          cursor: connected ? 'default' : 'pointer',
        }}>
        {integ.abbr}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F1F3D' }}>{integ.name}</div>
        <div style={{ fontSize: 11, color: connected ? integ.color : '#94A3B8', fontWeight: 600 }}>
          {connected ? '● Connected' : 'Click to connect →'}
        </div>
      </div>
      {connected ? (
        <button
          onClick={() => onDisconnect(integ.id)}
          style={{
            background: 'none', border: '1px solid ' + integ.color + '66',
            borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700,
            color: integ.color, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}>
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => onConnect(integ.id)}
          style={{
            background: integ.color, border: 'none',
            borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
            color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          }}>
          Connect
        </button>
      )}
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
function ManualEntryPanel({ entity, onUpdate, onCancel, idx }) {
  const pnl = entity.pnl || {}
  const [manRev,        setManRev]        = useState(String(nf(pnl.grossRevenue)                         || ''))
  // AUDIT FIX (save/reload double-count): pnl.totalExpenses is the GRAND total
  // (pure opex + depreciation + officer salary + advertising + other). This field
  // is "Operating Expenses EXCLUDING those", so reloading it with the total made
  // every component get subtracted twice on re-apply (net profit dropped by the
  // salary). Recover pure operating expenses by removing the separately-reloaded
  // components — matching exactly how manDep / manOfficerSal / manAdv / manOther init.
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

  const rv  = nf(manRev)
  const ex  = nf(manExp)
  const dep = nf(manDep)
  const sal = nf(manOfficerSal)
  const adv = nf(manAdv)
  const oth = nf(manOther)

  const isSCorp = isSCorpEntity(entity.type)
  const isPartnership = /partner|mmllc/i.test(entity.type || '')
  // AUDIT FIX (phantom salary on entity-type switch): the Officer Salary (W-2) field is
  // only shown for S-Corps. If an entity is switched away from S-Corp, manOfficerSal can
  // still hold a stale value — count it ONLY when the field is actually applicable, so it
  // cannot silently inflate expenses / understate net profit for a sole prop or partnership.
  const effectiveSal = isSCorp ? sal : 0

  const totalExpenses = ex + dep + effectiveSal + adv + oth
  const manNetProfit  = rv - totalExpenses

  const officerExceedsRevenue   = effectiveSal > rv && effectiveSal > 0 && rv > 0
  const officerExceedsNetProfit = !officerExceedsRevenue && effectiveSal > (rv - ex - dep) && effectiveSal > 0 && rv > 0

  function applyManual() {
    if (rv > 0 || totalExpenses > 0) {
      onUpdate(idx, {
        ...entity,
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

  const lbl = { fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }
  const inp = { fontSize: 14 }

  return (
    <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 18px', marginTop: 10, border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: N, marginBottom: 12 }}>Manual Entry</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={lbl}>
            Gross Revenue
            <InfoTip text="Total revenue before any deductions. For S-Corps: enter gross revenue of the entity. Do NOT net out officer salary here — enter that separately below." />
          </label>
          <MoneyInput value={manRev} onChange={setManRev} placeholder="0" style={inp} />
        </div>
        <div>
          <label style={lbl}>
            Operating Expenses (excl. officer salary, depreciation, advertising)
            <InfoTip text="Recurring business expenses: rent, utilities, software, insurance, professional fees, payroll (non-owner), etc. Exclude officer salary, depreciation, and advertising — those have their own fields below." />
          </label>
          <MoneyInput value={manExp} onChange={setManExp} placeholder="0" style={inp} />
        </div>
        <div>
          <label style={lbl}>
            Depreciation (Sec. 179 + MACRS + Bonus)
            <InfoTip text={'Section 179 first-year expensing, MACRS (Modified Accelerated Cost Recovery System) regular depreciation, and bonus depreciation on qualified business assets.\n\nEnter the total deductible depreciation for this entity this year.\n\nDo NOT include depreciation on personal-use assets.\n\nFor vehicles: use either the standard mileage rate OR actual expenses (including depreciation) — you cannot use both methods for the same vehicle.'} wide />
          </label>
          <MoneyInput value={manDep} onChange={setManDep} placeholder="0" style={inp} />
        </div>
        {isSCorp && (
          <div>
            <label style={lbl}>
              Officer Salary (W-2)
              <InfoTip text={'S-Corp owners must pay themselves reasonable W-2 compensation for services rendered (Rev. Rul. 74-44). Too little salary is an audit trigger.\n\nA common starting point: 35–45% of total officer compensation (salary ÷ (salary + distributions)). For example, if the S-Corp earns $200K net, a salary of $70K–$90K is a reasonable range — though the right number depends on industry, comparable wages, and time devoted.\n\nPaying below-market salary:\n• IRS audit risk (Rev. Rul. 74-44)\n• Reduces your §199A W-2 wage limitation\n• Triggers the ReasonableCompIndicator warning below\n\nFICA taxes (15.3% combined) apply to salary — K-1 distributions avoid FICA, which is the core S-Corp tax advantage.'} wide />
            </label>
            <MoneyInput value={manOfficerSal} onChange={setManOfficerSal} placeholder="0" style={inp} />
            {officerExceedsRevenue && (
              <div style={{ fontSize: 12, color: R, marginTop: 4, fontWeight: 600 }}>
                ⚠ Officer salary exceeds gross revenue — verify your numbers.
              </div>
            )}
            {officerExceedsNetProfit && !officerExceedsRevenue && (
              <div style={{ fontSize: 12, color: '#D97706', marginTop: 4, fontWeight: 600 }}>
                ⚠ Officer salary exceeds net profit after operating expenses — this entity will show a net loss.
              </div>
            )}
            {/* AUDIT FIX (reasonable-comp ratio): pass POST-salary net profit
                (= distributions) as `netProfit`. manNetProfit already excludes the
                officer salary (totalExpenses includes sal), so it IS distributions.
                The prior `+ sal` made this the pre-salary pool, so the indicator
                computed salary ÷ (salary + pre-salary profit) — understating the
                ratio (20% instead of 25%) and overstating the suggested minimum
                ($215,385 vs the correct $161,538). The component internals
                (totalComp = sal + netProfit; minTarget = 0.35/0.65 × netProfit)
                require distributions here — matching reasonableCompAlert in taxCalc.js. */}
            <ReasonableCompIndicator
              officerSal={sal}
              netProfit={Math.max(0, manNetProfit)}
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
            Other Deductions
            <InfoTip text="Miscellaneous business deductions not captured in the fields above. Must be ordinary and necessary under IRC §162. Exclude depreciation, advertising, and officer salary — those have dedicated fields." />
          </label>
          <MoneyInput value={manOther} onChange={setManOther} placeholder="0" style={inp} />
        </div>
      </div>

      {rv > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: SL }}>Gross Revenue</span><span style={{ fontWeight: 600, color: N }}>{fmt(rv)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: SL }}>Total Expenses</span><span style={{ fontWeight: 600, color: N }}>- {fmt(totalExpenses)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 6, fontWeight: 700 }}>
            <span style={{ color: N }}>Net Profit{isPartnership ? ' → K-1 Box 1' : ''}</span>
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
              Enter K-1 Box 2 income in the <span style={{ fontWeight: 700 }}>Rental Real Estate (Schedule E)</span> section in Step 2. Passive activity rules (IRC §469) apply — including the $25K allowance and REP status.
            </div>
            <div style={{ borderTop: '1px solid #BAE6FD', paddingTop: 5 }}>
              <span style={{ fontWeight: 600 }}>Box 9a — Net §1231 Gain (Loss):</span>{' '}
              Enter K-1 Box 9a in the <span style={{ fontWeight: 700 }}>Capital Gains (Form 4797)</span> field in Step 2. Net §1231 gains are treated as long-term capital gain; net §1231 losses are ordinary.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '9px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, color: SL, cursor: 'pointer' }}>Cancel</button>
        <button onClick={applyManual} style={{ flex: 2, padding: '9px', background: B, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Apply →
        </button>
      </div>
    </div>
  )
}

// ─── Entity card ──────────────────────────────────────────────────────────────
function EntityCard({ entity, idx, onUpdate, onRemove, colorAccent, isExpanded, onToggleExpand }) {
  const [showManual, setShowManual] = useState(false)
  const [showQBI,    setShowQBI]    = useState(false)
  // PASS4B-02b: Basis & Distributions panel toggle
  const [showBasis,  setShowBasis]  = useState(false)
  const pnl = entity.pnl || {}

  // BUG-03 FIX: Disconnect button now actually disconnects.
  const handleDisconnect = () => {
    const pid = entity.connectedId
    if (pid) {
      localStorage.removeItem('ts360_' + pid + '_connected')
      localStorage.removeItem('ts360_' + pid + '_token')
      localStorage.removeItem('ts360_' + pid + '_extra')
      sessionStorage.removeItem('ts360_' + pid + '_token')
      localStorage.removeItem('ts360_connected_app')
    }
    onUpdate(idx, { ...entity, connectedId: null, isManual: true, pnl: {}, officerW2: 0 })
    setShowManual(true)
  }

  // BUG-02 FIX: parentheses so (grossRevenue - totalExpenses) is the fallback
  // only when netProfit is absent.
  const netProfit = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))

  const own    = ownPct(entity.own) / 100
  const k1     = Math.round(netProfit * own)
  const sal    = nf(pnl.officerSalary ?? entity.officerW2)
  const isSC   = isSCorpEntity(entity.type)
  const isPT   = isPassthroughEntity(entity.type)

  // ── PASS4B-02b: Inline badge computations ─────────────────────────────────
  // §1366(d) suspension badge — only when basis is entered and there is a loss.
  const basisBadge = (() => {
    if (!isSC) return null
    const sb = entity.stockBasis !== '' && entity.stockBasis !== undefined ? nf(entity.stockBasis) : null
    const db = entity.debtBasis  !== '' && entity.debtBasis  !== undefined ? nf(entity.debtBasis)  : 0
    if (sb === null) return null                          // basis not entered — no badge
    const lossAmt = Math.abs(Math.min(0, netProfit * own))
    if (lossAmt === 0) return null                        // no loss — nothing to limit
    const totalBasis  = sb + db
    const allowedLoss = Math.min(lossAmt, totalBasis)
    const suspended   = lossAmt - allowedLoss
    if (suspended > 0) {
      return { type: 'warn', msg: `§1366(d): ${fmt(suspended)} of your ${fmt(lossAmt)} loss is suspended — basis insufficient.` }
    }
    return { type: 'ok', msg: `§1366(d): Full ${fmt(lossAmt)} loss is deductible — within basis.` }
  })()

  // §1368 distribution badge — only when distributions are entered.
  const distBadge = (() => {
    if (!isSC) return null
    const dist = nf(entity.distributions)
    if (dist <= 0) return null
    const sb = entity.stockBasis !== '' && entity.stockBasis !== undefined ? nf(entity.stockBasis) : null
    if (sb === null) {
      return { type: 'amber', msg: `§1368: ${fmt(dist)} in distributions — enter stock basis to compute capital gain.` }
    }
    const k1Net = netProfit * own
    const k1Allowed = k1Net < 0 ? -Math.min(Math.abs(k1Net), sb) : k1Net
    const postIncomeBasis = Math.max(0, sb + k1Allowed)
    const excess = Math.max(0, dist - postIncomeBasis)
    if (excess > 0) {
      return { type: 'warn', msg: `§1368: ${fmt(excess)} of distributions exceeds basis — treated as capital gain.` }
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
          {/* Collapsed-state basis badges */}
          {!isExpanded && (basisBadge || distBadge) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              {basisBadge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: basisBadge.type === 'warn' ? '#FEF2F2' : '#F0FDF4', color: basisBadge.type === 'warn' ? R : '#166534', border: '1px solid ' + (basisBadge.type === 'warn' ? '#FECACA' : '#86EFAC') }}>
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
            <div style={{ fontSize: 11, color: SL }}>Net / K-1</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: k1 >= 0 ? N : R }}>
              {k1 >= 0 ? fmt(k1) : '-' + fmt(Math.abs(k1))}
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
                <span style={{ color: SL }}>Gross Revenue</span>
                <span style={{ fontWeight: 600, color: N }}>{fmt(nf(pnl.grossRevenue))}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: SL }}>Total Expenses</span>
                <span style={{ fontWeight: 600, color: N }}>- {fmt(nf(pnl.totalExpenses))}</span>
              </div>
              {sal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, paddingLeft: 12, fontSize: 12 }}>
                  <span style={{ color: '#94A3B8' }}>incl. Officer Salary</span>
                  <span style={{ color: '#94A3B8' }}>{fmt(sal)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #E2E8F0', paddingTop: 6, marginTop: 2 }}>
                <span style={{ color: N }}>Net Profit</span>
                <span style={{ color: netProfit >= 0 ? G : R }}>{fmt(netProfit)}</span>
              </div>
            </div>
          )}

          {/* Entity Name */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>Business Name</label>
            <input
              type="text"
              value={entity.name || ''}
              onChange={e => onUpdate(idx, { ...entity, name: e.target.value })}
              placeholder="e.g. ABC Consulting LLC"
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
              <option value="Partnership / LLC">Partnership / LLC</option>
              <option value="Sole Proprietor / SMLLC">Sole Proprietor / SMLLC</option>
              <option value="Real Estate (Schedule E)">Real Estate (Schedule E)</option>
            </select>
          </div>

          {/* Ownership % */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>
              Ownership %
              <InfoTip text="Your ownership percentage in this entity. K-1 income is allocated proportionally. Example: 75% ownership of a $100K profit = $75K on your personal return." />
            </label>
            <input
              type="number" min="0" max="100" value={entity.own || '100'}
              onChange={e => onUpdate(idx, { ...entity, own: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: N }}
            />
          </div>

          {/* QBI fields */}
          {isPT && (
            <div style={{ marginBottom: 10 }}>
              <button onClick={e => { e.stopPropagation(); setShowQBI(s => !s) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: B, padding: '4px 0', marginBottom: 6 }}>
                {showQBI ? '▲ Collapse' : '▼ Expand'} §199A QBI Inputs (W-2 Wages, UBIA, SSTB)
              </button>
              {showQBI && (
                <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 14px', border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>§199A QBI Inputs — from K-1</div>
                  {[
                    { label: 'W-2 Wages (K-1 Box 17V for S-Corp / Box 20Z for Partnership)', key: 'box17V_wages', tip: 'Your share of W-2 wages paid by the entity. From S-Corp K-1 Box 17, Code V.\n\nThis field only matters if your taxable income exceeds ~$197,300 (single) or $394,600 (MFJ) for 2025 (~$201,775 / $403,500 for 2026). Below those thresholds, the W-2 wage limitation does not apply and your QBI deduction is simply 20% of QBI.\n\nAbove the threshold, the deduction is limited to the lesser of: (a) 20% of QBI, or (b) 50% of W-2 wages paid by the entity (IRC §199A(b)(2)(A)).' },
                    { label: 'UBIA of Qualified Property (K-1 Box 17W / Box 20AA)', key: 'box17V_ubia', tip: 'Unadjusted Basis Immediately After Acquisition — the original cost of qualified property, not reduced by depreciation (IRC §199A(b)(6)(B)).\n\nThis field only matters if your taxable income exceeds ~$197,300 (single) or $394,600 (MFJ) for 2025. Below those thresholds this limitation does not apply.\n\nAbove the threshold, you may use the alternative W-2 + UBIA limitation: 25% of W-2 wages plus 2.5% of UBIA (§199A(b)(2)(B)). This helps capital-intensive businesses with low W-2 wages.' },
                    // L-01 FIX: Label was "Section 179 / Ordinary Income Addback" — "Addback"
                    // is backwards (persistStep1 SUBTRACTS this, reducing k1Total / QBI) and
                    // "Ordinary Income Addback" is not an IRS form label. K-1 Box 11 (Form 1120-S)
                    // and Box 12 (Form 1065) are both labeled "Section 179 deduction" on the
                    // actual forms. Tooltip fixed: §179 reduces QBI (Treas. Reg. §1.199A-3(b)(1)(ii)(A))
                    // and shareholder/partner basis — NOT "at-risk basis" (that is §465).
                    { label: 'Section 179 Deduction (K-1 Box 11 / Box 12)', key: 'box11_12', tip: 'Section 179 first-year expensing allocated to you from the entity.\n\nS-Corp: K-1 Box 11 · Partnership: K-1 Box 12\n\nThis deduction reduces your Qualified Business Income (QBI) for §199A purposes (Treas. Reg. §1.199A-3(b)(1)(ii)(A)). It also reduces your stock or partnership basis (IRC §1367 / §705).\n\nOnly enter this if §179 is shown separately on your K-1 and is NOT already reflected in the ordinary business income on Box 1 (S-Corp) or Box 1 (Partnership). If your accounting software already netted §179 into your net profit figure, leave this blank to avoid double-counting.' },
                    { label: 'Charitable Contributions (K-1 Box 12 / Box 13)', key: 'box12_13', tip: 'Charitable contributions passed through from the entity. These flow to Schedule A and also reduce your K-1 basis.' },
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

          {/* ── PASS4B-02b: §1366(d) Stock Basis & §1368 Distributions ── */}
          {isSC && (
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={e => { e.stopPropagation(); setShowBasis(s => !s) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#7C3AED', padding: '4px 0', marginBottom: 6 }}
              >
                {showBasis ? '▲ Collapse' : '▼ Expand'} Stock Basis & Distributions (Form 7203)
              </button>
              {showBasis && (
                <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '12px 14px', border: '1px solid #DDD6FE' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', marginBottom: 10 }}>
                    §1366(d) Basis Limitation · §1368 Distributions — from Form 7203
                  </div>

                  {/* Stock Basis */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Stock Basis at Beginning of Year (Form 7203, Line 1)
                      <InfoTip text={'Your adjusted stock basis at the start of the tax year (Form 7203, Line 1).\n\nStock basis starts with your original cash or property contribution when you acquired the shares. Each year it increases for income and tax-exempt items allocated to you, and decreases for losses, deductions, and distributions.\n\nWhy it matters — IRC §1366(d)(1):\nYour deductible S-Corp loss cannot exceed your combined stock basis + debt basis. Losses in excess of basis are SUSPENDED and carried forward to future years when basis is restored (§1366(d)(2)).\n\nWhen you enter your basis here, TaxStat360 will:\n• Cap the deductible loss at your available basis\n• Show a §1366(d) suspension warning badge on the card\n• Exclude the suspended portion from income automatically\n\nYour CPA tracks this figure on Form 7203 each year. Leave blank if you are unsure.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.stockBasis || ''}
                      onChange={v => onUpdate(idx, { ...entity, stockBasis: v })}
                      placeholder="0"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {/* Debt Basis */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Debt Basis (Form 7203, Part II) — Optional
                      <InfoTip text={'Debt basis arises from bona fide loans you have personally made to the S-Corp — NOT loans the corporation took from a bank or third party.\n\nDebt basis absorbs losses after stock basis is exhausted (IRC §1366(d)(1)(B)).\n\nExample: $0 stock basis + $50,000 personal loan to the S-Corp = $50,000 debt basis available to absorb losses.\n\nThis is an advanced field. Most shareholders only have stock basis. Leave blank if you have not personally loaned money to your S-Corp.\n\nSee Form 7203, Part II for the calculation.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.debtBasis || ''}
                      onChange={v => onUpdate(idx, { ...entity, debtBasis: v })}
                      placeholder="0 (optional)"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {/* §1366(d) suspension inline badge */}
                  {(() => {
                    const sb = entity.stockBasis !== '' && entity.stockBasis !== undefined ? nf(entity.stockBasis) : null
                    const db = entity.debtBasis  !== '' && entity.debtBasis  !== undefined ? nf(entity.debtBasis)  : 0
                    if (sb === null) return null
                    const lossAmt = Math.abs(Math.min(0, netProfit * own))
                    if (lossAmt === 0) return null
                    const totalBasis  = sb + db
                    const allowedLoss = Math.min(lossAmt, totalBasis)
                    const suspended   = lossAmt - allowedLoss
                    if (suspended > 0) {
                      return (
                        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: R, marginBottom: 4 }}>⚠ §1366(d) Loss Limitation Active</div>
                          <div style={{ color: '#7F1D1D', lineHeight: 1.5 }}>
                            Your {fmt(lossAmt)} K-1 loss exceeds your {fmt(totalBasis)} basis.
                            Only <strong>{fmt(allowedLoss)}</strong> is deductible this year.
                            <strong> {fmt(suspended)}</strong> is suspended and carries forward to future
                            years when basis is restored (IRC §1366(d)(2)).
                            Consult your CPA to confirm your exact basis before filing.
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Full Loss Deductible</div>
                        <div style={{ color: '#166534', lineHeight: 1.5 }}>
                          Your {fmt(lossAmt)} K-1 loss is within your {fmt(totalBasis)} basis — the full loss is deductible this year.
                        </div>
                      </div>
                    )
                  })()}

                  {/* Distributions */}
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', display: 'block', marginBottom: 3 }}>
                      Distributions Received This Year (Form 7203, Line 6)
                      <InfoTip text={'Total cash or property distributions you received from the S-Corp this year (Form 7203, Line 6 / Schedule M-2, Line 7).\n\nWhy this matters:\nDistributions reduce your stock basis. If distributions EXCEED your remaining stock basis (after the current year\'s income/loss allocation), the excess is taxable as a long-term capital gain (IRC §1368(b)(2)) — NOT ordinary income.\n\nThis capital gain does not appear on your K-1. It is computed at the shareholder level and belongs on Schedule D.\n\nExample:\n• Beginning basis: $0\n• K-1 loss: suspended (basis insufficient)\n• Distributions received: $100,000\n• Excess over remaining basis: $100,000 → long-term capital gain\n\nEnter your stock basis above — TaxStat360 computes the taxable portion automatically and includes it in your estimated liability.'} wide />
                    </label>
                    <MoneyInput
                      value={entity.distributions || ''}
                      onChange={v => onUpdate(idx, { ...entity, distributions: v })}
                      placeholder="0"
                      style={{ fontSize: 13 }}
                    />
                  </div>

                  {/* §1368 distribution capital gain inline badge */}
                  {(() => {
                    const dist = nf(entity.distributions)
                    if (dist <= 0) return null
                    const sb = entity.stockBasis !== '' && entity.stockBasis !== undefined ? nf(entity.stockBasis) : null
                    if (sb === null) {
                      return (
                        <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Enter Stock Basis to Compute Capital Gain</div>
                          <div style={{ color: '#78350F', lineHeight: 1.5 }}>
                            You have entered {fmt(dist)} in distributions. Enter your stock basis above
                            to determine whether any portion is taxable as long-term capital gain
                            (IRC §1368(b)(2)).
                          </div>
                        </div>
                      )
                    }
                    const k1Net       = netProfit * own
                    const k1Allowed   = k1Net < 0 ? -Math.min(Math.abs(k1Net), sb) : k1Net
                    const postBasis   = Math.max(0, sb + k1Allowed)
                    const excess      = Math.max(0, dist - postBasis)
                    if (excess > 0) {
                      return (
                        <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                          <div role="alert" style={{ fontWeight: 700, color: R, marginBottom: 4 }}>⚠ §1368 Capital Gain — Distributions Exceed Basis</div>
                          <div style={{ color: '#7F1D1D', lineHeight: 1.5 }}>
                            <strong>{fmt(excess)}</strong> of your {fmt(dist)} distributions exceeds your
                            remaining stock basis ({fmt(postBasis)}) and is treated as a{' '}
                            <strong>long-term capital gain</strong> on Schedule D (IRC §1368(b)(2)).
                            This amount is included in your tax estimate automatically.
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '10px 12px', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>✅ Distributions Within Basis</div>
                        <div style={{ color: '#166534', lineHeight: 1.5 }}>
                          All {fmt(dist)} in distributions are a tax-free return of basis — no capital gain triggered (IRC §1368(b)(1)).
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
          {/* ── end PASS4B-02b ── */}

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
              {entity.isManual ? '✏ Edit / re-enter data' : '⟳ Disconnect / reconnect software'}
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

// ─── Compare modal ────────────────────────────────────────────────────────────
function CompareModal({ entities, onClose }) {
  const personalCtx = readPersonalContext()
  const taxYear     = readTaxYear()
  const filing      = personalCtx.filingStatus || 'single'
  const w2          = nf(personalCtx.w2Income)
  const estPaid     = nf(personalCtx.estPaid)

  const entity = entities[0] || {}
  const pnl    = entity.pnl || {}
  const rev    = nf(pnl.grossRevenue)
  const opex   = nf(pnl.totalExpenses)
  const netP   = nf(pnl.netProfit ?? (rev - opex))

  if (rev <= 0 && netP === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '28px', maxWidth: 480, width: '100%' }}>
          <h3 style={{ fontWeight: 800, color: N, marginBottom: 12 }}>Entity Comparison</h3>
          <p style={{ color: SL, fontSize: 14, lineHeight: 1.6 }}>Enter revenue and expenses on your entity card first to see a side-by-side comparison across entity structures.</p>
          <button onClick={onClose} style={{ padding: '10px 24px', background: N, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 16 }}>Close</button>
        </div>
      </div>
    )
  }

  const stdDed   = getStdDed(taxYear, filing)
  const ownerPct = ownPct(entity.own) / 100

  const scenarios = ENTITY_TYPES.filter(t => !/c.?corp/i.test(t)).map(type => {
    const isSC     = /s.?corp/i.test(type)
    const salGuess = isSC ? Math.max(0, Math.round(netP * ownerPct * 0.40)) : 0
    const k1       = isSC ? Math.max(0, (netP - salGuess) * ownerPct) : Math.max(0, netP * ownerPct)
    const _w2All   = w2 + salGuess
    const taxableRough = Math.max(0, k1 + _w2All - stdDed)
    const { deduction: qbi } = isPassthroughEntity(type)
      ? calcQBI(k1, taxableRough, 0, { status: filing, taxYear, entityQbiData: [{ ...entity, type, k1, own: entity.own }] })
      : { deduction: 0 }
    const r = calcTaxReturn({
      taxYear, status: filing, dependents: nf(personalCtx.dependents),
      entities: [{ ...entity, type, k1, own: entity.own }],
      w2: _w2All, k1Total: k1, rentalNet: 0, stGain: 0, ltGain: 0,
      intInc: 0, divInc: 0, qualDiv: 0, f4797Inc: 0, taxableSS: 0, iraIncome: 0,
      selfEmpHealthIns: 0, hsaDeduction: 0, studentLoanInt: 0, selfEmpRetirement: 0,
      nolCarryforward: 0, priorYearQBILoss: 0, saltAmount: 0, hasISO: false, isoBargainElement: 0,
      isREP: false, unrecap1250: 0, collectiblesGain: 0,
      w2Withheld: nf(personalCtx.w2Withheld), estPaid,
      useItemized: false, itemizedAmt: 0, ytdFactor: 1,
    })
    return { type, qbi, totalTax: r.totalTax, seTax: r.seTax, ficaSavings: r.ficaSavings, k1, salGuess }
  })

  const minTax = Math.min(...scenarios.map(s => s.totalTax))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '28px', maxWidth: 740, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: N, margin: '0 0 4px' }}>Entity Structure Comparison</h3>
            <p style={{ fontSize: 13, color: SL, margin: 0 }}>Same revenue, different entity — estimated total federal tax liability</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: SL }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scenarios.sort((a, b) => a.totalTax - b.totalTax).map((s, i) => (
            <div key={s.type} style={{ background: s.totalTax === minTax ? '#F0FDF4' : '#F8FAFC', border: '1.5px solid ' + (s.totalTax === minTax ? '#86EFAC' : '#E2E8F0'), borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: N, marginBottom: 2 }}>
                    {s.type}
                    {s.totalTax === minTax && <span style={{ marginLeft: 8, fontSize: 11, background: G, color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700 }}>LOWEST TAX</span>}
                  </div>
                  <div style={{ fontSize: 12, color: SL }}>
                    K-1: {fmt(s.k1)}
                    {s.salGuess > 0 && <> · Officer salary: {fmt(s.salGuess)}</>}
                    {s.qbi > 0 && <> · QBI deduction: {fmt(s.qbi)}</>}
                    {s.seTax > 0 && <> · SE tax: {fmt(s.seTax)}</>}
                    {s.ficaSavings > 0 && <> · SE tax savings: {fmt(s.ficaSavings)}</>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.totalTax === minTax ? G : N }}>{fmt(s.totalTax)}</div>
                  {s.totalTax !== minTax && (
                    <div style={{ fontSize: 12, color: R, fontWeight: 600 }}>+{fmt(s.totalTax - minTax)} more</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: SL, textAlign: 'center', marginTop: 16 }}>
          Federal income tax only · {(readTaxYear() || 2025)} · {filing.toUpperCase()} · Estimates — consult a tax professional
        </p>
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function CalculateTaxInner() {
  const navigate = useNavigate()

  const [entities,        setEntities]        = useState([])
  const [expandedIdx,     setExpandedIdx]     = useState(null)
  const [showCompare,     setShowCompare]     = useState(false)
  const [showNameModal,    setShowNameModal]    = useState(false)
  const [showEntityPicker, setShowEntityPicker] = useState(false)
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState(null)
  const [saveStatus,      setSaveStatus]      = useState('idle')
  const [taxYear,         setTaxYear]         = useState(() => readTaxYear() || 2025)
  const [csvImportStatus, setCsvImportStatus] = useState(null)

  useEffect(() => {
    const existing = JSON.parse(sessionStorage.getItem('ts360_step1_entities') || '[]')
    if (existing.length > 0) {
      setEntities(existing.map(e => ({
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
    }
  }, [])

  const addEntity = useCallback(() => {
    // GATE: multi-entity input is an Enterprise feature. Everyone gets one entity;
    // adding more requires Enterprise (manual, picker, and CSV paths all gated).
    if (!isEnterprise() && entities.length >= 1) { navigate('/upgrade'); return }
    setShowEntityPicker(true)
  }, [entities.length, navigate])

  const addEntityOfType = useCallback((type) => {
    if (!isEnterprise() && entities.length >= 1) { setShowEntityPicker(false); navigate('/upgrade'); return }
    const newEnt = {
      id: Date.now(),
      type,
      name: '',
      own: '100',
      pnl: { grossRevenue: '', totalExpenses: '', officerSalary: '', netProfit: '' },
      isManual: true,
      connectedId: null,
      box17V_wages: '', box17V_ubia: '', box11_12: '', box12_13: '',
      box17V_sstb: false,
      // PASS4B-02b: §1366(d) basis fields + §1368 distributions field.
      // taxCalc.js reads these to gate loss deductibility and compute
      // distribution capital gains. Initialised to '' (not 0) so the
      // engine's hasBasisInput guard correctly skips entities where the
      // user has not yet entered a basis (avoids applying the limitation
      // to users who leave the field blank).
      stockBasis: '', debtBasis: '', distributions: '',
    }
    setEntities(prev => {
      const next = [...prev, newEnt]
      sessionStorage.setItem('ts360_step1_entities', JSON.stringify(next))
      return next
    })
    setExpandedIdx(entities.length)
    setShowEntityPicker(false)
  }, [entities.length, navigate])

  const updateEntity = useCallback((idx, updated) => {
    setEntities(prev => {
      const next = [...prev]
      next[idx] = updated
      sessionStorage.setItem('ts360_step1_entities', JSON.stringify(next))
      return next
    })
  }, [])

  const removeEntity = useCallback((idx) => {
    setEntities(prev => prev.filter((_, i) => i !== idx))
    setExpandedIdx(null)
  }, [])

  // ─── Integration disconnect ────────────────────────────────────────────────
  const handleIntegrationDisconnect = useCallback((pid) => {
    localStorage.removeItem('ts360_' + pid + '_connected')
    localStorage.removeItem('ts360_' + pid + '_token')
    localStorage.removeItem('ts360_' + pid + '_extra')
    localStorage.removeItem('ts360_connected_app')
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
      sessionStorage.setItem('ts360_step1_entities', JSON.stringify(next))
      return next
    })
  }, [])

  const persistStep1 = useCallback(() => {
    sessionStorage.setItem('ts360_step1_entities', JSON.stringify(entities))
    const k1Total = entities.reduce((s, e) => {
      const pnl = e.pnl || {}
      const net = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
      const own = ownPct(e.own) / 100
      const k1  = Math.round(net * own)
      const sec179 = nf(e.box11_12)
      const box12  = nf(e.box12_13)
      return s + k1 - sec179 - box12
    }, 0)
    writeStep1State({ entities, k1Total, isCoopPatron: false })
    writeTaxYear(taxYear)
    return k1Total
  }, [entities, taxYear])

  const handleSaveRecord = useCallback((name) => {
    setSaveStatus('saving')
    const k1Total = persistStep1()
    const email   = localStorage.getItem('ts360_email') || 'default'
    const key     = 'ts360_records_' + email
    const existing = JSON.parse(localStorage.getItem(key) || '[]')

    const record = {
      id: Date.now(),
      name: name || null,
      savedAt: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
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

    const updated = [record, ...existing].slice(0, 50)
    localStorage.setItem(key, JSON.stringify(updated))
    localStorage.setItem('ts360_records', JSON.stringify(updated))
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 3000)
  }, [entities, taxYear, persistStep1])

  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isEnterprise() && entities.length >= 1) { setCsvImportStatus('locked'); e.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const lines  = ev.target.result.split('\n').filter(l => l.trim())
        if (lines.length < 2) { setCsvImportStatus('error'); return }
        const header = lines[0].split(',').map(h => h.trim().toLowerCase())
        const vals   = lines[1].split(',').map(v => v.trim().replace(/"/g, ''))
        const get    = (keys) => { for (const k of keys) { const i = header.indexOf(k); if (i >= 0) return vals[i] || '' } return '' }

        const importedEnt = {
          id:   Date.now(),
          type: 'S Corporation',
          name: get(['entity', 'entity name', 'business', 'business name']) || 'Imported Entity',
          own:  get(['ownership', 'own', 'ownership %', 'pct']) || '100',
          pnl: {
            grossRevenue:  get(['revenue', 'gross revenue', 'income', 'gross income'])        || '',
            totalExpenses: get(['expenses', 'total expenses', 'operating expenses'])          || '',
            officerSalary: get(['officer salary', 'salary', 'w2', 'officer compensation'])    || '',
            netProfit:     get(['net profit', 'profit', 'net income'])                        || '',
          },
          isManual: true, connectedId: null,
          box17V_wages: '', box17V_ubia: '', box11_12: '', box12_13: '',
          box17V_sstb: false,
          // PASS4B-02b: initialise basis fields on CSV import
          stockBasis: '', debtBasis: '', distributions: '',
        }
        setEntities(prev => [...prev, importedEnt])
        setExpandedIdx(entities.length)
        setCsvImportStatus('success')
      } catch {
        setCsvImportStatus('error')
      }
    }
    reader.readAsText(file)
  }

  // ─── OAuth / integration data fetch ──────────────────────────────────────────
  async function fetchEntityPnL(idx, pid, tok, extra) {
    try {
      let url = `${API_BASE_URL}/integrations/${pid}/data?token=${encodeURIComponent(tok)}`
      if (pid === 'quickbooks' && extra) url += '&realm='   + extra
      if (pid === 'xero'        && extra) url += '&tenant='  + extra
      if (pid === 'freshbooks'  && extra) url += '&account=' + extra
      const d = await (await fetch(url)).json()
      if (d && !d.error) {
        if (d.revenue === 0 && d.expenses === 0 && d.net_profit === 0) {
          localStorage.removeItem('ts360_' + pid + '_token')
          localStorage.removeItem('ts360_' + pid + '_connected')
        } else {
          const pnl = {
            grossRevenue:  d.revenue,
            totalExpenses: d.expenses,
            netProfit:     d.net_profit,
            officerSalary: d.officer_salary || 0,
            categories:    d.categories || {}
          }
          setEntities(prev => {
            const updated = [...prev]
            const providerName = pid.charAt(0).toUpperCase() + pid.slice(1) + ' Business'
            if (updated[idx]) {
              updated[idx] = { ...updated[idx], pnl, connectedId: pid, isManual: false, name: providerName }
            } else {
              updated.push({
                name: providerName,
                type: 'S Corporation', own: '100', ein: '', state: '', formationDate: '',
                pnl, connectedId: pid, isManual: false,
                // PASS4B-02b: initialise basis fields on integration sync
                stockBasis: '', debtBasis: '', distributions: '',
              })
            }
            return updated
          })
        }
      }
    } catch (ex) { console.error('fetchEntityPnL error:', ex) }
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const mp = {
      qb_token: 'quickbooks', quickbooks_token: 'quickbooks',
      xero_token: 'xero',
      wave_token: 'wave', wave_token2: 'wave',
      fb_token: 'freshbooks', freshbooks_token: 'freshbooks'
    }
    const xeroRefresh = p.get('xero_refresh')
    if (xeroRefresh) localStorage.setItem('ts360_xero_refresh', xeroRefresh)
    const entityIdx = parseInt(p.get('entity') || sessionStorage.getItem('ts360_connecting_entity')) || 0
    let foundInUrl = false

    for (const pid of ['quickbooks', 'xero', 'wave', 'freshbooks']) {
      if (p.get(pid) === 'connected') {
        foundInUrl = true
        localStorage.setItem('ts360_' + pid + '_connected', 'true')
        const hasToken = Object.entries(mp).some(([k, v]) => v === pid && p.get(k))
        if (!hasToken) {
          fetchEntityPnL(entityIdx, pid, localStorage.getItem('token') || '', null)
        }
        break
      }
    }

    for (const [k, pid] of Object.entries(mp)) {
      const tok = p.get(k)
      if (tok) {
        foundInUrl = true
        localStorage.setItem('ts360_' + pid + '_connected', 'true')
        sessionStorage.setItem('ts360_' + pid + '_token', tok)  // AF-2.2: use sessionStorage (clears on tab close) — full fix is server-side token storage
        const extra = pid === 'quickbooks' ? p.get('realm')
                    : pid === 'xero'        ? p.get('tenant')
                    : pid === 'freshbooks'  ? p.get('account')
                    : null
        if (extra) localStorage.setItem('ts360_' + pid + '_extra', extra)
        fetchEntityPnL(entityIdx, pid, tok, extra)
      }
    }

    if (!foundInUrl) {
      for (const pid of ['quickbooks', 'xero', 'wave', 'freshbooks']) {
        if (localStorage.getItem('ts360_' + pid + '_connected') === 'true') {
          const tok   = sessionStorage.getItem('ts360_' + pid + '_token') || localStorage.getItem('ts360_' + pid + '_token') || localStorage.getItem('token') || ''
          const extra = localStorage.getItem('ts360_' + pid + '_extra')
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

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Nav */}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
          <svg width="30" height="30" viewBox="0 0 34 34" style={{ flexShrink: 0 }}><rect width="34" height="34" rx="8" fill={N}/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {[
            { n: 1, label: 'Entities', done: entities.length > 0 },
            { n: 2, label: 'Return',   done: false },
            { n: 3, label: 'AI',       done: false },
          ].map((s, i) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: s.n === 1 ? B : s.done ? G : '#E2E8F0', color: s.n === 1 || s.done ? '#fff' : '#94A3B8', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.done ? '✓' : s.n}
                </div>
                <span style={{ fontSize: 11, fontWeight: s.n === 1 ? 700 : 500, color: s.n === 1 ? N : '#94A3B8', whiteSpace: 'nowrap', display: 'inline' }}>{s.label}</span>
              </div>
              {i < 2 && <span style={{ color: '#CBD5E1', fontSize: 12 }}>›</span>}
            </div>
          ))}
        </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => navigate('/dashboard')}   style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600, whiteSpace: 'nowrap' }}>Dashboard</button>
          <button onClick={() => navigate('/ai-analysis')} style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: isPro() ? SL : '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>AI Analysis & Reporting{!isPro() ? ' 🔒' : ''}</button>
          <button onClick={() => signOut(navigate)}        style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600, whiteSpace: 'nowrap' }}>Sign Out</button>
          <button onClick={() => navigate('/settings')}    style={{ padding: '7px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600, whiteSpace: 'nowrap' }}>Settings</button>
        </div>
      </nav>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 20px 120px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 6px' }}>Business Entities</h1>
          <p style={{ color: SL, fontSize: 14, margin: 0 }}>Add each business entity you have an ownership stake in. Revenue, expenses, and K-1 allocations flow to your personal return in Step 2.</p>
        </div>

        {/* Tax year selector */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: N, flexShrink: 0 }}>Tax Year</label>
          <select value={taxYear} onChange={e => { setTaxYear(parseInt(e.target.value)); writeTaxYear(parseInt(e.target.value)) }}
            style={{ padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, fontFamily: 'inherit', outline: 'none', flex: 1 }}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Integrations */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: N, marginBottom: 4 }}>
            Connect accounting software
            <InfoTip text="Connect QuickBooks, Xero, Wave, or FreshBooks to pull your P&L data automatically. Or add an entity manually using the button below." />
          </div>
          <p style={{ fontSize: 12, color: SL, margin: '0 0 12px' }}>Sync P&L data directly — or skip and enter manually.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {(() => {
              const userIsPro = isPro()
              const connectedCount = entities.filter(e => e.connectedId).length
              return INTEGRATIONS.map(integ => {
                const isConnected = entities.some(e => e.connectedId === integ.id)
                const isLocked = !userIsPro && !isConnected && connectedCount >= 1
                if (isLocked) {
                  return (
                    <LockedFeature key={integ.id} requiredPlan="professional" label="Unlimited Integrations" minHeight={70}>
                      <IntegrationTile integ={integ} connected={false} onConnect={() => {}} onDisconnect={() => {}} />
                    </LockedFeature>
                  )
                }
                return (
                  <IntegrationTile
                    key={integ.id}
                    integ={integ}
                    connected={isConnected}
                    onConnect={() => { window.location.href = `${API_BASE_URL}/integrations/${integ.id}/connect` }}
                    onDisconnect={handleIntegrationDisconnect}
                  />
                )
              })
            })()}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label htmlFor="csv-upload" style={{ cursor: 'pointer', fontSize: 12, color: B, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              📄 Import CSV
              <input id="csv-upload" type="file" accept=".csv,.xlsx" onChange={handleCsvUpload} style={{ display: 'none' }} />
            </label>
            {csvImportStatus === 'success' && <span style={{ fontSize: 12, color: G, fontWeight: 600 }}>✓ Entity imported!</span>}
            {csvImportStatus === 'error'   && <span style={{ fontSize: 12, color: R, fontWeight: 600 }}>✗ Import failed — check CSV format</span>}
            {csvImportStatus === 'locked'  && <span style={{ fontSize: 12, color: B, fontWeight: 600 }}>🔒 Multi-entity import is an Enterprise feature</span>}
          </div>
        </div>

        {/* Entity cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {entities.map((ent, idx) => (
            <EntityCard
              key={ent.id || idx}
              entity={ent}
              idx={idx}
              onUpdate={updateEntity}
              onRemove={setConfirmRemoveIdx}
              colorAccent={ENTITY_COLORS[idx % ENTITY_COLORS.length]}
              isExpanded={expandedIdx === idx}
              onToggleExpand={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            />
          ))}
        </div>

        {/* Add entity button — multi-entity is an Enterprise feature; everyone gets one entity */}
        {(isEnterprise() || entities.length === 0) ? (
          <button onClick={addEntity} style={{ width: '100%', padding: '13px', border: '2px dashed #CBD5E1', borderRadius: 12, background: 'transparent', color: SL, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
            + Add Business Entity
          </button>
        ) : (
          <button onClick={() => navigate('/upgrade')} title="Multi-entity input is an Enterprise feature" style={{ width: '100%', padding: '13px', border: '2px dashed #BFDBFE', borderRadius: 12, background: '#F0F6FF', color: B, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            🔒 Add another entity — <span style={{ textDecoration: 'underline' }}>Enterprise</span>
          </button>
        )}

        {/* Compare button — Pro only */}
        {entities.length > 0 && isPro() && (
          <button
            onClick={() => setShowCompare(true)}
            title="Compare tax structures — e.g. S-Corp vs. LLC vs. Sole Proprietor."
            style={{ width: '100%', padding: '11px', border: '1.5px solid ' + B, borderRadius: 12, background: '#EFF6FF', color: B, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
            ⚖ Compare Entity Structures
          </button>
        )}
      </div>

      {/* Fixed footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 80, background: '#fff', borderTop: '1px solid #E2E8F0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 70 }}>
        <div style={{ fontSize: 12, color: SL, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {entities.length > 0
            ? `${entities.length} entit${entities.length > 1 ? 'ies' : 'y'} added`
            : 'Add an entity to continue'}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setShowNameModal(true)}
            disabled={!hasData || saveStatus === 'saving'}
            style={{
              padding: '10px 20px',
              background: saveStatus === 'saved' ? G : hasData ? B : '#94A3B8',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 700, cursor: hasData ? 'pointer' : 'default',
            }}
          >
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved!' : '💾 Save This Record'}
          </button>
          <button
            onClick={() => { persistStep1(); navigate('/tax-return') }}
            disabled={entities.length === 0}
            style={{
              padding: '10px 24px',
              background: entities.length > 0 ? N : '#94A3B8',
              color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 700, cursor: entities.length > 0 ? 'pointer' : 'default',
            }}
          >
            Continue to Step 2 →
          </button>
        </div>
      </div>

      {showCompare && <CompareModal entities={entities} onClose={() => setShowCompare(false)} />}

      {!isPro() && entities.length > 0 && (
        <div style={{ position: 'fixed', bottom: 70, left: 0, right: 0, zIndex: 65, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#F0F6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '6px 14px', fontSize: 11, color: '#1D4ED8', fontWeight: 600, pointerEvents: 'auto' }}>
            ⚖ Compare entity structures with <button onClick={() => navigate('/upgrade')} style={{ background: 'none', border: 'none', color: B, fontWeight: 700, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Professional →</button>
          </div>
        </div>
      )}

      {/* Remove entity confirmation modal */}
      {confirmRemoveIdx !== null && (
        <div onClick={() => setConfirmRemoveIdx(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: '28px 24px', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑</div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: N, margin: '0 0 8px' }}>Remove This Entity?</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px', lineHeight: 1.5 }}>All entered financial data, §199A inputs, and ownership percentages will be permanently lost. This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmRemoveIdx(null)} style={{ flex: 1, padding: '11px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: N }}>Cancel</button>
              <button onClick={() => { removeEntity(confirmRemoveIdx); setConfirmRemoveIdx(null) }} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 8, background: '#EF4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Remove Entity</button>
            </div>
          </div>
        </div>
      )}

      {/* Entity Type Picker Modal */}
      {showEntityPicker && (
        <div onClick={() => setShowEntityPicker(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: '28px 24px', maxWidth: 560, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: N, margin: '0 0 4px' }}>What type of business entity?</h2>
            <p style={{ fontSize: 13, color: SL, margin: '0 0 20px' }}>Select the structure that matches how your business files taxes.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { type: 'S Corporation',              icon: '🏢', desc: 'Elected S-Corp tax status. Officer salary + K-1 distributions. FICA savings analysis included. LLC with an S-Corp election? Choose this.' },
                { type: 'Partnership / LLC',           icon: '🤝', desc: 'Multi-member LLC or partnership (Form 1065). Each partner\'s distributive share from K-1. LLC without an S-Corp or C-Corp election? Choose this.' },
                { type: 'Sole Proprietor / SMLLC',    icon: '💼', desc: 'Schedule C filer. Self-employment income, SE tax, and QBI deduction calculated automatically. Single-member LLC with no tax election? Choose this.' },
                { type: 'Real Estate (Schedule E)',    icon: '🏠', desc: 'Personally-held rental property. Passive loss rules, depreciation, and REP status. Property held in an LLC or partnership? Use Partnership / LLC above.' },
              ].map(({ type, icon, desc }) => (
                <button
                  key={type}
                  onClick={() => addEntityOfType(type)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: '1.5px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = B; e.currentTarget.style.background = '#F0F6FF' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff' }}
                >
                  <span style={{ fontSize: 26, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: N, marginBottom: 2 }}>{type}</div>
                    <div style={{ fontSize: 12, color: SL, lineHeight: 1.4 }}>{desc}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#CBD5E1', fontSize: 18, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowEntityPicker(false)} style={{ marginTop: 16, background: 'none', border: 'none', color: SL, fontSize: 13, cursor: 'pointer', width: '100%' }}>Cancel</button>
          </div>
        </div>
      )}

      {showNameModal && (
        <NameRecordModal
          defaultName={entities[0]?.name || ''}
          onConfirm={(name) => { setShowNameModal(false); handleSaveRecord(name) }}
          onSkip={() => { setShowNameModal(false); handleSaveRecord(null) }}
        />
      )}
    </div>
  )
}
