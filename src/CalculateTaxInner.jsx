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

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { calcTaxReturn, calcQBI, getStdDed, getTable } from './taxCalc'
import { readPersonalContext, readTaxYear, writeStep1State, clearStep1State, writeTaxYear } from './utils/sessionState.js'
import { parseMoney } from './utils/parseMoney.js'
import { signOut } from './utils/signOut'
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
    const v = e.target.value.replace(/[^0-9.\-]/g, '')
    setRaw(v)
    onChange(v)
  }

  const handleFocus = () => {
    setFocused(true)
    setRaw(String(value || '').replace(/,/g, ''))
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
        <div style={{ fontWeight: 700, color: '#78350F', marginBottom: 4 }}>⚠ Officer Salary May Be Too Low</div>
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
function IntegrationTile({ integ, onConnect, connected }) {
  return (
    <div style={{
      background: connected ? integ.bg : '#fff',
      border: '1.5px solid ' + (connected ? integ.color : '#E2E8F0'),
      borderRadius: 10, padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      cursor: 'pointer', transition: 'all 0.15s',
    }} onClick={() => onConnect(integ.id)}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: integ.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
        {integ.abbr}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: N }}>{integ.name}</div>
        <div style={{ fontSize: 11, color: connected ? integ.color : '#94A3B8', fontWeight: 600 }}>
          {connected ? '● Connected' : 'Connect →'}
        </div>
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
function ManualEntryPanel({ entity, onUpdate, onCancel, idx }) {
  const pnl = entity.pnl || {}
  const [manRev,        setManRev]        = useState(String(nf(pnl.grossRevenue)                         || ''))
  const [manExp,        setManExp]        = useState(String(nf(pnl.totalExpenses)                        || ''))
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

  const totalExpenses = ex + dep + sal + adv + oth
  const manNetProfit  = rv - totalExpenses

  const officerExceedsRevenue   = sal > rv && sal > 0 && rv > 0
  const officerExceedsNetProfit = !officerExceedsRevenue && sal > (rv - ex - dep) && sal > 0 && rv > 0

  const isSCorp = isSCorpEntity(entity.type)

  function applyManual() {
    if (rv > 0 || totalExpenses > 0) {
      onUpdate(idx, {
        ...entity,
        officerW2: sal,
        pnl: {
          grossRevenue:    rv,
          totalExpenses,
          officerSalary:   sal,
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
              <InfoTip text={'S-Corp owners must pay themselves a reasonable W-2 salary for services rendered (Rev. Rul. 74-44).\n\nThis is deductible to the S-Corp and reduces its net profit. FICA taxes (15.3% combined employee + employer) apply to W-2 wages.\n\nK-1 distributions avoid FICA entirely — which is the core S-Corp tax advantage.'} wide />
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
            <ReasonableCompIndicator
              officerSal={sal}
              netProfit={Math.max(0, manNetProfit + sal)}
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
            <span style={{ color: N }}>Net Profit</span>
            <span style={{ color: manNetProfit >= 0 ? G : R }}>{fmt(manNetProfit)}</span>
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
  const pnl = entity.pnl || {}

  // BUG-02 FIX: Parentheses added so (grossRevenue - totalExpenses) is the
  // fallback used ONLY when netProfit is absent. When QuickBooks (or any
  // integration) populates pnl.netProfit directly, it is used as-is without
  // subtracting totalExpenses again.
  // Prior (broken): nf(pnl.netProfit ?? pnl.grossRevenue) - nf(pnl.totalExpenses)
  // Fixed:          nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))
  const netProfit = nf(pnl.netProfit ?? (nf(pnl.grossRevenue) - nf(pnl.totalExpenses)))

  const own    = ownPct(entity.own) / 100
  const k1     = Math.round(netProfit * own)
  const sal    = nf(pnl.officerSalary ?? entity.officerW2)
  const isSC   = isSCorpEntity(entity.type)
  const isPT   = isPassthroughEntity(entity.type)

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
              <button onClick={() => setShowQBI(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: B, padding: 0, marginBottom: 6 }}>
                {showQBI ? '▲ Collapse' : '▼ Expand'} §199A QBI Inputs (W-2 Wages, UBIA, SSTB)
              </button>
              {showQBI && (
                <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 14px', border: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>§199A QBI Inputs — from K-1</div>
                  {[
                    { label: 'W-2 Wages (K-1 Box 17V for S-Corp / Box 20Z for Partnership)', key: 'box17V_wages', tip: 'Your share of W-2 wages paid by the entity. From S-Corp K-1 Box 17, Code V. Used in the §199A(b)(2) 50% W-2 wage limitation test. Applies only above the QBI threshold ($197,300 single / $394,600 MFJ for 2025).' },
                    { label: 'UBIA of Qualified Property (K-1 Box 17W / Box 20AA)', key: 'box17V_ubia', tip: 'Unadjusted Basis Immediately After Acquisition — the original cost of qualified property, not reduced by depreciation (IRC §199A(b)(6)(B)). Used in the 25% W-2 + 2.5% UBIA alternative limitation (§199A(b)(2)(B)).' },
                    { label: 'Section 179 / Ordinary Income Addback (K-1 Box 11 / Box 12)', key: 'box11_12', tip: 'Section 179 deductions passed through from the entity reduce your at-risk basis. These are entered here for basis tracking; they reduce your allocable K-1 income.' },
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
                      <InfoTip text={'SSTBs include: law, accounting, consulting, financial services, performing arts, athletics, and health (IRC §199A(d)(1)(B)).\n\nNOT SSTBs: engineering, architecture, real estate, insurance, banking, manufacturing, and retail.\n\nSSTB status phases out the QBI deduction above $397,300 MFJ / $247,300 single (2025).'} wide />
                    </label>
                  </div>
                </div>
              )}
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
              onClick={() => setShowManual(s => !s)}
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
    const taxable = Math.max(0, taxableRough - qbi)
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
          Federal income tax only · {(readTaxYear() || 2025)} · {filing.toUpperCase()} · Estimates — consult a CPA
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
  const [showNameModal,   setShowNameModal]   = useState(false)
  const [saveStatus,      setSaveStatus]      = useState('idle')
  const [taxYear,         setTaxYear]         = useState(() => readTaxYear() || 2025)
  const [csvImportStatus, setCsvImportStatus] = useState(null)

  const connectedApp = localStorage.getItem('ts360_connected_app') || ''

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
    const newEnt = {
      id: Date.now(),
      type: 'S Corporation',
      name: '',
      own: '100',
      pnl: { grossRevenue: '', totalExpenses: '', officerSalary: '', netProfit: '' },
      isManual: true,
      connectedId: null,
      box17V_wages: '', box17V_ubia: '', box11_12: '', box12_13: '',
      box17V_sstb: false, box17K: '',
    }
    setEntities(prev => [...prev, newEnt])
    setExpandedIdx(entities.length)
  }, [entities.length])

  const updateEntity = useCallback((idx, updated) => {
    setEntities(prev => {
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [])

  const removeEntity = useCallback((idx) => {
    setEntities(prev => prev.filter((_, i) => i !== idx))
    setExpandedIdx(null)
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
          box17V_sstb: false, box17K: '',
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
            if (updated[idx]) {
              updated[idx] = { ...updated[idx], pnl, connectedId: pid, isManual: false }
            } else {
              updated.push({
                name: pid.charAt(0).toUpperCase() + pid.slice(1) + ' Business',
                type: 'S Corporation', own: '100', ein: '', state: '', formationDate: '',
                pnl, connectedId: pid, isManual: false
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
        localStorage.setItem('ts360_' + pid + '_token', tok)
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
          const tok   = localStorage.getItem('ts360_' + pid + '_token') || localStorage.getItem('token') || ''
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
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 24px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="30" height="30" viewBox="0 0 34 34"><rect width="34" height="34" rx="8" fill={N}/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg>
          <span style={{ fontWeight: 800, fontSize: 17, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
          <div style={{ background: '#EFF6FF', color: B, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>Step 1 of 2 — Business Entities</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/dashboard')}   style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Dashboard</button>
          <button onClick={() => navigate('/ai-analysis')} style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>AI Analysis</button>
          <button onClick={() => signOut(navigate)}        style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Sign Out</button>
          <button onClick={() => navigate('/settings')}    style={{ padding: '7px 14px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', fontSize: 12, cursor: 'pointer', color: SL, fontWeight: 600 }}>Settings</button>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {INTEGRATIONS.map(integ => (
              <IntegrationTile
                key={integ.id}
                integ={integ}
                connected={connectedApp.toLowerCase() === integ.id}
                onConnect={() => {
                  window.open(`${API_BASE_URL}/integrations/${integ.id}/connect`, '_blank')
                }}
              />
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label htmlFor="csv-upload" style={{ cursor: 'pointer', fontSize: 12, color: B, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              📄 Import CSV
              <input id="csv-upload" type="file" accept=".csv,.xlsx" onChange={handleCsvUpload} style={{ display: 'none' }} />
            </label>
            {csvImportStatus === 'success' && <span style={{ fontSize: 12, color: G, fontWeight: 600 }}>✓ Entity imported!</span>}
            {csvImportStatus === 'error'   && <span style={{ fontSize: 12, color: R, fontWeight: 600 }}>✗ Import failed — check CSV format</span>}
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
              onRemove={removeEntity}
              colorAccent={ENTITY_COLORS[idx % ENTITY_COLORS.length]}
              isExpanded={expandedIdx === idx}
              onToggleExpand={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            />
          ))}
        </div>

        {/* Add entity button */}
        <button onClick={addEntity} style={{ width: '100%', padding: '13px', border: '2px dashed #CBD5E1', borderRadius: 12, background: 'transparent', color: SL, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
          + Add Business Entity
        </button>

        {/* Compare button */}
        {entities.length > 0 && (
          <button
            onClick={() => setShowCompare(true)}
            title="Compare tax structures — e.g. S-Corp vs. LLC vs. Sole Proprietor."
            style={{ width: '100%', padding: '11px', border: '1.5px solid ' + B, borderRadius: 12, background: '#EFF6FF', color: B, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
            ⚖ Compare Entity Structures
          </button>
        )}
      </div>

      {/* Fixed footer */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E2E8F0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 50 }}>
        <div style={{ fontSize: 12, color: SL, flex: 1 }}>
          {entities.length > 0
            ? `${entities.length} entit${entities.length > 1 ? 'ies' : 'y'} — K-1 flows to personal return in Step 2`
            : 'Add at least one business entity to continue'}
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
