import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { calcQBI, QBI_THRESHOLDS, getStdDed, getMarginalRate, calcFederalTax, SALT_CAPS } from './taxCalc'
import DismissibleNotice from './components/DismissibleNotice'
import { readPersonalContext, writePersonalContext, writeTaxYear, readTaxYear, readStep1State, writeStep1State, normalizeF1040 } from './utils/sessionState.js'
import { signOut } from './utils/signOut'

const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'
const G = '#059669'
const R = '#DC2626'
const P = '#7C3AED'
const O = '#D97706'

// Entity-type predicates (Issue #56) — tolerant of 'S Corporation' (canonical, with space)
// and 'S-Corporation' (legacy, with hyphen) variants in saved or synthesized records.
const isPassthroughEntity = (t) => /partnership|llc|s.?corp|sole/i.test(t || '')
const isSCorpEntity      = (t) => /s.?corp/i.test(t || '')
const isCCorpEntity      = (t) => /c.?corp/i.test(t || '')

// F-06: returns the user's TOTAL W-2 wages (additional W-2 from non-S-Corp jobs +
// aggregated officer salary across all S-Corp/C-Corp entities). Post-F-06, saved
// f.w2Income carries 'additional only' semantics — the per-entity officer salary
// lives in rec.entities[i].pnl.officerSalary. Mirrors the existing pattern where
// f.form4797 is aggregated with rec.entities[i].box17K in getRecord.
function getTotalW2(rec) {
  if (!rec) return 0
  const f = rec.f1040 || {}
  // f.w2Income is a UI-string from saved records — may carry commas (e.g. '50,000')
  // because Dashboard saves the user's typed input verbatim. Entity values like
  // e.pnl.officerSalary come from the structured data layer (no commas) — bare
  // parseFloat is sufficient there. The asymmetry is intentional, not a bug.
  const additionalW2 = parseFloat(String(f.w2Income || '').replace(/,/g, '')) || 0
  const entities = Array.isArray(rec.entities) ? rec.entities : []
  const totalOfficerSalary = entities.reduce(
    (s, e) => s + (parseFloat(e?.pnl?.officerSalary) || 0),
    0,
  )
  return additionalW2 + totalOfficerSalary
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <svg width="34" height="34" viewBox="0 0 34 34" style={{ flexShrink: 0 }}>
        <rect width="34" height="34" rx="8" fill={N} />
        <rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3" />
        <rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55" />
        <rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8" />
        <rect x="26" y="5" width="4" height="26" rx="1.5" fill="white" />
      </svg>
      <div style={{ fontWeight: 800, color: N, fontSize: 18, letterSpacing: '-0.3px', borderBottom: '2px solid ' + B, paddingBottom: 1 }}>
        TaxStat<span style={{ color: B }}>360</span>
      </div>
    </div>
  )
}

const fmt = n => n < 0 ? '($' + Math.abs(Math.round(n)).toLocaleString() + ')' : '$' + Math.abs(Math.round(n)).toLocaleString()
const pct = n => (parseFloat(n) || 0).toFixed(1) + '%'

// ── Data helpers ─────────────────────────────────────────────────────────────
function getAllRecords() {
  const found = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('ts360_records')) {
      try {
        const recs = JSON.parse(localStorage.getItem(k) || '[]')
        recs.forEach(r => { if (r.biz && !found.find(x => x.id === r.id)) found.push(r) })
      } catch(e) {}
    }
  }
  return found.sort((a, b) => (b.id || 0) - (a.id || 0))
}

function getRecord(liveState) {
  const _isCoopPatron = readStep1State().isCoopPatron
  if (liveState) {
    const ent = (liveState.entities || [])[0] || {}
    const f1040 = liveState.f1040 || readPersonalContext()
    const k1 = liveState.k1Income || 0
    const taxyear = liveState.taxYear || readTaxYear()
    if (k1 !== 0 || parseFloat(f1040.w2Income) > 0 || ent.netProfit) {
      return {
        type: 'personal-return',
        _unsaved: true,
        _source: 'live',
        k1Income: k1,
        entities: liveState.entities || [],
        biz: { entityType: ent.type || ent.name || 'Unknown', year: taxyear, ownershipPct: ent.own || '100', grossRevenue: String(ent.netProfit || 0) },
        f1040: { filingStatus: f1040.filingStatus || 'single', w2Income: f1040.w2Income || '', otherIncome: f1040.otherIncome || '', estPaid: f1040.estPaid || '', dependents: f1040.dependents || '', isREP: f1040.isREP || false, isCoopPatron: liveState.isCoopPatron ?? _isCoopPatron, useItemized: f1040.useItemized || false, itemizedAmt: f1040.itemizedAmt || '', capitalGains: f1040.capitalGains || '', stGain: f1040.stGain || '', interest: f1040.interest || '', dividends: f1040.dividends || '', qualDividends: f1040.qualDividends || f1040.qualifiedDividends || '', form4797: (parseFloat(f1040.form4797) || 0) + (liveState.entities || []).reduce((s, e) => s + (parseFloat(e.box17K) || 0), 0) }
      }
    }
  }
  const recs = getAllRecords()
  const saved = recs.find(r => r.biz && (parseFloat(r.biz.grossRevenue) > 0 || parseFloat(r.k1Income) > 0 || parseFloat(r.f1040?.w2Income) > 0)) || recs[0] || null

  try {
    const { entities, k1Total: k1 } = readStep1State()
    const f1040 = readPersonalContext()
    const totalSec179 = entities.reduce((s,e)=>s+(parseFloat(e.box11_12)||0), 0)
    const totalBox12_13 = entities.reduce((s,e)=>s+(parseFloat(e.box12_13)||0), 0)
    const k1ActiveIncome = k1 + totalSec179 + totalBox12_13
    const totalOfficerSalary = entities.reduce((s,e)=>s+(parseFloat(e?.pnl?.officerSalary)||0), 0)
    const activeBusinessIncome = Math.max(0, k1ActiveIncome + (parseFloat(f1040.w2Income)||0) + totalOfficerSalary)
    const sec179Allowed = Math.min(totalSec179, activeBusinessIncome)
    const sec179Disallowed = Math.max(0, totalSec179 - activeBusinessIncome)
    const k1Capped = k1ActiveIncome - sec179Allowed - totalBox12_13
    const taxyear = readTaxYear()
    const ent = entities[0] || {}
    if (k1 !== 0 || parseFloat(f1040.w2Income) > 0 || ent.netProfit) {
      return {
        id: Date.now(),
        savedAt: 'Current session (unsaved)',
        type: 'personal-return',
        _unsaved: true,
        k1Income: k1Capped, sec179Disallowed, sec179Allowed, totalSec179, activeBusinessIncome,
        entities,
        biz: {
          entityType: ent.type || ent.name || 'Unknown',
          year: taxyear,
          ownershipPct: ent.own || '100',
          grossRevenue: String(ent.netProfit > 0 ? ent.netProfit : 0),
          operatingExpenses: '',
          officerSalary: '',
        },
        f1040: {
          ...f1040,
          filingStatus: f1040.filingStatus || 'single',
          w2Income: f1040.w2Income || '',
          otherIncome: f1040.otherIncome || '',
          dependents: f1040.dependents || '',
          w2Withheld: f1040.w2Withheld || '',
          rentalIncome: f1040.rentalIncome || '',
          rentalExpenses: f1040.rentalExpenses || '',
          isREP: f1040.isREP || false,
          isCoopPatron: _isCoopPatron,
          capitalGains: f1040.capitalGains || '',
          stGain: f1040.stGain || '',
          interest: f1040.interest || '',
          dividends: f1040.dividends || '',
          qualDividends: f1040.qualDividends || f1040.qualifiedDividends || '',
          priorYearLosses: f1040.priorYearLosses || '',
          estPaid: f1040.estPaid || '',
          useItemized: f1040.useItemized || false,
          itemizedAmt: f1040.itemizedAmt || '',
          niit: f1040.niit || 0,
          additionalMedicare: f1040.additionalMedicare || 0,
          form4797: (parseFloat(f1040.form4797) || 0) + entities.reduce((s, e) => s + (parseFloat(e.box17K) || 0), 0),
        },
        quarterly: 0,
        totalTax: 0,
      }
    }
  } catch(e) {}

  if (saved) {
    const fallback = Object.assign({ _savedFallback: true }, saved)
    if (!Array.isArray(fallback.entities) || fallback.entities.length === 0) {
      try {
        const sessionEntities = readStep1State().entities
        if (Array.isArray(sessionEntities) && sessionEntities.length > 0) fallback.entities = sessionEntities
      } catch(e) {}
    }
    return fallback
  }
  return null
}

function completeness(rec) {
  if (!rec) return 0
  let s = 30
  const b = rec.biz || {}, f = rec.f1040 || {}
  if (parseFloat(b.grossRevenue) > 0) s += 15
  if (b.entityType) s += 10
  if (f.filingStatus) s += 10
  if (getTotalW2(rec) > 0) s += 10
  if (parseFloat(b.officerSalary) > 0) s += 5
  if (parseFloat(b.operatingExpenses) > 0) s += 5
  if (parseFloat(b.depreciation) > 0) s += 5
  if (parseFloat(f.estPaid) > 0) s += 10
  return Math.min(s, 98)
}

// ── TAB 1: Risk Scan ─────────────────────────────────────────────────────────
function RiskScan({ rec }) {
  if (!rec) return <NoData />
  const b = rec.biz || {}, f = rec.f1040 || {}
  const revenue = parseFloat(b.grossRevenue) || 0
  const officerSal = parseFloat(b.officerSalary) || 0
  const k1 = parseFloat(rec.k1Income) || 0
  const w2 = getTotalW2(rec)
  const estPay = parseFloat(f.estPaid) || 0
  const dep = parseFloat(b.depreciation) || 0
  const rentalIncome = parseFloat(b.rentalIncome || 0) || parseFloat(f.rentalIncome || 0) || 0
  const isREP = !!(b.isREP || f.isREP || rec.isREP)
  const totalIncome = k1 + w2
  const year = parseInt(b.year) || 2025
  const filing = f.filingStatus || 'single'
  // FIX: roughTax declared here — before the estimated-payments finding that uses roughTax / 4
  // Applies QBI deduction to match TaxReturn.jsx calculation
  const _taxableBeforeQBI_rough = Math.max(0, totalIncome - getStdDed(year, filing))
  const { deduction: _qbiRough } = isPassthroughEntity(b.entityType) && k1 > 0
    ? calcQBI(k1, _taxableBeforeQBI_rough, 0, { status: filing, taxYear: year, entityQbiData: rec.entities || [] })
    : { deduction: 0 }
  const _taxable = Math.max(0, _taxableBeforeQBI_rough - _qbiRough)
  const roughTax = calcFederalTax(_taxable, year, filing)
  const _marginalRate = getMarginalRate(_taxable, year, filing)
  const today = new Date()
  const qDeadlines = [
    {month:4,day:15,label:'April 15'},
    {month:6,day:16,label:'June 16'},
    {month:9,day:15,label:'September 15'},
    {month:1,day:15,label:'January 15',nextYear:true}
  ]
  const nextDeadline = qDeadlines.find(d => {
    const dl = new Date(today.getFullYear() + (d.nextYear ? 1 : 0), d.month-1, d.day)
    return dl > today
  }) || qDeadlines[0]
  const deadlines = { get month(){ return nextDeadline.label } }
  const month = 'month'

  const findings = []

  const sCorpEntities = (Array.isArray(rec.entities) ? rec.entities : []).filter(e => isSCorpEntity(e?.type))
  if (sCorpEntities.length > 0) {
    sCorpEntities.forEach(e => {
      const entityName = e.name || 'S-Corp'
      const eK1 = Math.round((parseFloat(e.netProfit) || 0) * (parseInt(e.own) || 100) / 100)
      const eOfficerSal = parseFloat(e.pnl?.officerSalary) || 0
      if (eOfficerSal === 0 && eK1 > 20000) {
        findings.push({ level: 'high', icon: '🚨', title: `No Officer Salary — ${entityName} (Audit Risk)`,
          detail: `${entityName} shows ${fmt(eK1)} in K-1 income but no officer salary recorded. The IRS requires S-Corp owner-operators to pay themselves a "reasonable" W-2 salary. Skipping this is one of the most common S-Corp audit triggers.`,
          action: `Set ${entityName}'s officer salary on Step 1 to at least 35–40% of its net profit. This is deductible to the S-Corp and reduces self-employment tax exposure.` })
      } else if (eOfficerSal > 0 && eK1 > 30000 && eOfficerSal < eK1 * 0.4) {
        findings.push({ level: 'medium', icon: '⚠️', title: `Officer Salary May Be Too Low — ${entityName}`,
          detail: `${entityName} shows ${fmt(eOfficerSal)} in officer compensation versus ${fmt(eK1)} in K-1 income (${((eOfficerSal/eK1)*100).toFixed(1)}% ratio). The IRS benchmarks "reasonable compensation" typically at 30–40% of net profit for owner-operators.`,
          action: `Consider increasing ${entityName}'s officer salary to at least ${fmt(Math.round(eK1 * 0.35))} to align with IRS reasonable compensation guidelines.` })
      } else if (eOfficerSal > 0) {
        findings.push({ level: 'good', icon: '✅', title: `Officer Salary Recorded — ${entityName}`,
          detail: `${entityName} shows officer compensation of ${fmt(eOfficerSal)} on file. Ensure payroll taxes (FICA) are being withheld and remitted quarterly.`,
          action: null })
      }
    })
  } else if (isSCorpEntity(b.entityType)) {
    const ownerComp = officerSal > 0 ? officerSal : w2
    if (ownerComp === 0 && k1 > 20000) {
      findings.push({ level: 'high', icon: '🚨', title: 'No Officer Salary — Audit Risk',
        detail: `You have ${fmt(k1)} in K-1 income but no officer salary recorded. The IRS requires S-Corp owner-operators to pay themselves a "reasonable" W-2 salary. Skipping this is one of the most common S-Corp audit triggers.`,
        action: 'Set an officer salary of at least 35–40% of net profit. This is deductible to the S-Corp and reduces self-employment tax exposure.' })
    } else if (ownerComp > 0 && k1 > 30000 && ownerComp < k1 * 0.4) {
      findings.push({ level: 'medium', icon: '⚠️', title: 'Officer Salary May Be Too Low',
        detail: `Reported owner compensation is ${fmt(ownerComp)} versus K-1 income of ${fmt(k1)}. The IRS benchmarks "reasonable compensation" typically at 30–40% of net profit for owner-operators.`,
        action: `Consider increasing your salary to at least ${fmt(Math.round(k1 * 0.35))} to align with IRS reasonable compensation guidelines.` })
    } else if (ownerComp > 0) {
      findings.push({ level: 'good', icon: '✅', title: 'Officer Salary Recorded',
        detail: `Owner compensation of ${fmt(ownerComp)} is on file. Ensure payroll taxes (FICA) are being withheld and remitted quarterly.`,
        action: null })
    }
  }

  // ── Estimated payments ───────────────────────────────────────────────────────
  if (k1 > 5000 && estPay === 0) {
    findings.push({ level: 'high', icon: '🚨', title: 'No Estimated Tax Payments — Penalty Risk',
      detail: `With ${fmt(k1)} in K-1 income, you are likely required to make quarterly estimated payments. Failure to pay results in IRS underpayment penalties (currently ~8% annually).`,
      action: `Estimated quarterly payment: approx. ${fmt(Math.round(roughTax / 4))}. Due dates: April 15, June 16, September 15, January 15.` })
  } else if (estPay > 0) {
    findings.push({ level: 'good', icon: '✅', title: 'Estimated Payments Recorded',
      detail: `${fmt(estPay)} in estimated payments on file. Next quarterly deadline: ${deadlines[month]}.`,
      action: null })
  }

  // ── Depreciation opportunity ─────────────────────────────────────────────────
  if (revenue > 50000 && dep === 0) {
    findings.push({ level: 'medium', icon: '⚠️', title: 'No Depreciation Recorded',
      detail: 'Businesses with equipment, vehicles, computers, or property can deduct depreciation — often reducing taxable income significantly.',
      action: 'If you own any business assets, enter depreciation under Section 179 (full first-year deduction) or MACRS. A $20,000 asset could reduce your tax by $4,400+ at the 22% bracket.' })
  }

  // ── QBI deduction ────────────────────────────────────────────────────────────
  if (isPassthroughEntity(b.entityType) && k1 > 10000) {
    const _year = parseInt(b.year) || 2025
    const _filing = f.filingStatus || 'single'
    const _taxableBeforeQBI = Math.max(0, k1 + w2 - getStdDed(_year, _filing))
    const { deduction: qbi, limitApplied: _limitApplied, caps: _caps } = calcQBI(k1, _taxableBeforeQBI, 0, { status: _filing, taxYear: _year, entityQbiData: rec.entities || [] })
    const _t = QBI_THRESHOLDS[_year] || QBI_THRESHOLDS[2025]
    const _qbiGap = _caps ? Math.max(0, Math.round(_caps.qbi - qbi)) : 0
    const _limitPrefix = _limitApplied === 'wage' ? `Your deduction is currently reduced by ${fmt(_qbiGap)} due to the §199A(b)(2) wage/UBIA limit — increasing W-2 wages paid by the entity (Box 17V) or qualified property (UBIA) could recapture it. `
                       : _limitApplied === 'income' ? `Your deduction is currently reduced by ${fmt(_qbiGap)} due to the overall taxable-income limit (20% of taxable income less net capital gain). `
                       : _limitApplied === 'min400' ? `Your deduction is set to the §199A(i) OBBBA minimum of ${fmt(qbi)} — without this floor, your regular calc would have been lower. `
                       : ''
    findings.push({ level: 'good', icon: '✅', title: `QBI Deduction Applied — ${fmt(qbi)} Saved`,
      detail: `The Qualified Business Income deduction (IRC §199A) is applied to your K-1 income, reducing your taxable income by ${fmt(qbi)}.`,
      action: `${_limitPrefix}QBI phases in W-2 wage / UBIA limits above ${fmt(_t.single)} (single) or ${fmt(_t.mfj)} (MFJ) in ${_year}.` })
  }

  // ── C-Corp double tax ────────────────────────────────────────────────────────
  if (isCCorpEntity(b.entityType) && revenue > 0) {
    findings.push({ level: 'medium', icon: '💡', title: 'C-Corp Double Taxation',
      detail: 'C-Corp profits are taxed at 21% at the entity level. Dividends distributed to you are then taxed again at qualified dividend rates (0–20%) on your personal return.',
      action: 'Consider whether an S-Corp election would eliminate entity-level tax. An S-Corp with the same income passes profits directly to your personal return, avoiding the 21% corporate tax.' })
  }

  // ── Large tax liability — advertising & Section 179 ──────────────────────────
  if (roughTax > 10000) {
    findings.push({ level: 'medium', icon: '📢', title: 'Advertising & Marketing — Fully Deductible (IRC §162)',
      detail: `With an estimated tax liability of ${fmt(roughTax)}+, investing in business advertising reduces your taxable income dollar-for-dollar. Advertising spend is 100% deductible as an ordinary and necessary business expense.`,
      action: 'Increase advertising, marketing, or business development spend before year-end. Digital ads, print, sponsorships, and website costs all qualify. Document all expenses with receipts and business purpose.' })
    findings.push({ level: 'medium', icon: '🔧', title: 'Equipment & Tools — Section 179 / Bonus Depreciation',
      detail: 'Section 179 lets you deduct the full cost of qualifying business equipment, tools, machinery, vehicles, and technology in the year of purchase — up to $2.5M in 2025 under the One Big Beautiful Bill Act (OBBBA), with phase-out beginning above $4M of qualifying purchases. Bonus depreciation was restored to 100% for property acquired and placed in service after January 19, 2025 (applies to both new and used property).',
      action: `Qualifying purchases include computers, phones, machinery, office furniture, and business vehicles (with limits). Must be placed in service before December 31. At your income level, up to ${fmt(Math.max(0, Math.min(Math.round(roughTax / _marginalRate), revenue - (parseFloat(b.operatingExpenses) || 0) - officerSal)))} in Section 179 purchases could offset your estimated tax liability — but Section 179 cannot exceed your business's net taxable income (it can reduce income to zero, not create a loss). Bonus depreciation (100% in 2025 under OBBBA, for property placed in service after January 19, 2025) has no net-income cap. Consult a CPA to confirm eligibility and combine the two strategies correctly.` })
  }

  // ── Real Estate Professional (REP) ──────────────────────────────────────────
  if (rentalIncome > 0 || isREP) {
    if (isREP) {
      findings.push({ level: 'info', icon: '🏠', title: 'Real Estate Professional — Criteria Checklist',
        detail: 'You have REP status selected. Under IRC §469(c)(7), you must meet ALL three tests each tax year to deduct rental losses without limitation:',
        action: `① MORE THAN 750 HOURS in real property trades or businesses — of which MORE THAN 500 hours must be in activities where you materially participate.\n\n② MORE THAN 50% of your total personal service time across all work must be in real estate activities.\n\n③ ⚠️ IMPORTANT: If you have a full-time W-2 job, qualifying as a REP is extremely difficult. The IRS scrutinizes this heavily. Document your time with contemporaneous daily logs. Without proper documentation, REP status will likely be disallowed on audit.` })
    } else {
      findings.push({ level: 'info', icon: '🏠', title: 'Rental Income Detected — REP Status Could Unlock Full Deductions',
        detail: 'Rental losses are normally "passive" and can only offset other passive income. Qualifying as a Real Estate Professional makes your rental losses fully deductible against all income — including W-2 wages and business income.',
        action: `To qualify as a REP you must meet ALL of these each year:\n\n① More than 750 hours in real property trades or businesses — of which 500+ must be in activities where you materially participate.\n\n② More than 50% of your total working hours across ALL jobs must be in real estate.\n\n⚠️ If you have a full-time W-2 job, qualifying is very difficult. Most full-time W-2 earners cannot meet the 50% test. If you believe you qualify, check the REP box on the Tax Return page and maintain detailed daily time logs.` })
    }
  }

  // ── Next quarterly deadline ──────────────────────────────────────────────────
  findings.push({ level: 'info', icon: '📅', title: `Next Quarterly Deadline: ${deadlines[month]}`,
    detail: 'IRS Form 1040-ES quarterly estimated tax payment due date.',
    action: estPay > 0
      ? `Your recorded payments total ${fmt(estPay)}. Verify this covers 90% of current year tax or 100% of prior year tax to avoid penalties.`
      : 'If you have self-employment or business income, you likely owe quarterly payments. Underpayment incurs penalties at the current IRS rate.' })

  const levelOrder = { high: 0, medium: 1, info: 2, good: 3 }
  findings.sort((a, b) => levelOrder[a.level] - levelOrder[b.level])

  const colors = {
    high:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', badge: '#DC2626' },
    medium: { bg: '#FFFBEB', border: '#FDE68A', text: '#78350F', badge: '#D97706' },
    info:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', badge: '#2563EB' },
    good:   { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', badge: '#059669' },
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>AI Risk Scan Results</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Based on your saved record. These findings are specific to your situation.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {findings.map((f, i) => {
          const c = colors[f.level]
          return (
            <div key={i} style={{ background: c.bg, border: '1px solid ' + c.border, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{f.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: c.text, fontSize: 14, marginBottom: 6 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: c.text, lineHeight: 1.6, marginBottom: f.action ? 8 : 0 }}>{f.detail}</div>
                  {f.action && (
                    <div style={{ fontSize: 12, color: c.text, background: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '8px 12px', borderLeft: '3px solid ' + c.badge, whiteSpace: 'pre-line' }}>
                      <strong>What to do:</strong> {f.action}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ── TAB 2: Tax Optimization ──────────────────────────────────────────────────
function TaxOptimization({ rec }) {
  if (!rec) return <NoData />
  const b = rec.biz || {}, f = rec.f1040 || {}
  const revenue = parseFloat(b.grossRevenue) || 0
  const opExp = parseFloat(b.operatingExpenses) || 0
  const dep = parseFloat(b.depreciation) || 0
  const sCorpEntities = (Array.isArray(rec.entities) ? rec.entities : []).filter(e => isSCorpEntity(e?.type))
  const totalOfficerSalary = sCorpEntities.reduce((s, e) => s + (parseFloat(e?.pnl?.officerSalary) || 0), 0)
  const sCorpK1 = sCorpEntities.reduce((s, e) => s + Math.max(0, parseFloat(e?.pnl?.netProfit) || 0), 0)
  const k1 = parseFloat(rec.k1Income) || 0
  const w2 = getTotalW2(rec)
  const estPay = parseFloat(f.estPaid) || 0
  const year = parseInt(b.year) || 2025
  const isPassthrough = isPassthroughEntity(b.entityType)
  const filing = f.filingStatus || 'single'
  const stdDed = getStdDed(year, filing)
  // FIX: apply QBI before getMarginalRate — matches TaxReturn.jsx calculation
  const agi = Math.max(0, k1 + w2)
  const _taxableBeforeQBI_opt = Math.max(0, agi - stdDed)
  const { deduction: _qbiOpt } = isPassthroughEntity(b.entityType) && k1 > 0
    ? calcQBI(k1, _taxableBeforeQBI_opt, 0, { status: filing, taxYear: year, entityQbiData: rec.entities || [] })
    : { deduction: 0 }
  const taxable = Math.max(0, _taxableBeforeQBI_opt - _qbiOpt)
  const marginalRate = getMarginalRate(taxable, year, filing)

  const opportunities = []

  const maxSEP = Math.min(69000, Math.round((k1 + w2) * 0.25))
  if (maxSEP > 0 && isPassthrough) {
    const taxSaved = Math.round(maxSEP * marginalRate)
    opportunities.push({
      icon: '🏦', title: 'SEP-IRA or Solo 401(k)', priority: 'high',
      saving: taxSaved,
      detail: `You can contribute up to ${fmt(maxSEP)} (25% of net self-employment income, max $69,000) to a SEP-IRA. This reduces your AGI dollar-for-dollar.`,
      howTo: `At your marginal rate of ${pct(marginalRate * 100)}, a max SEP-IRA contribution saves approx. ${fmt(taxSaved)} in federal tax. Open at any major brokerage (Fidelity, Schwab, Vanguard). Deadline: your tax filing date including extensions.`
    })
  }

  if (revenue > 30000 && dep === 0) {
    const est179 = Math.round(revenue * 0.05)
    const taxSaved = Math.round(est179 * marginalRate)
    opportunities.push({
      icon: '🏗️', title: 'Section 179 Equipment Deduction', priority: 'medium',
      saving: null,
      detail: 'Section 179 lets you deduct the full cost of qualifying equipment, vehicles, and business property in the year of purchase (up to $2.5M in 2025 under the One Big Beautiful Bill Act; phase-out begins above $4M of qualifying purchases). Bonus depreciation is 100% for property placed in service after January 19, 2025.',
      howTo: 'If you purchased any computers, phones, furniture, vehicles, or equipment for the business this year — even partially — enter the cost under Depreciation. The deduction can be substantial.'
    })
  }

  opportunities.push({
    icon: '🏠', title: 'Home Office Deduction', priority: 'medium',
    saving: null,
    detail: 'If you use a portion of your home exclusively and regularly for business, you can deduct either $5 per sq ft (simplified, up to 300 sq ft = $1,500 max) or actual expenses proportional to office size.',
    howTo: 'The space must be used exclusively for business. Calculate your home office percentage (office sq ft ÷ total home sq ft) and apply to rent/mortgage interest, utilities, and insurance. Claim on Schedule C or as an S-Corp expense.'
  })

  if (sCorpEntities.length > 0 && totalOfficerSalary > 0 && sCorpK1 > 50000) {
    const seTaxSaved = Math.round((sCorpK1 - totalOfficerSalary) * 0.0765 * 2)
    if (seTaxSaved > 1000) {
      opportunities.push({
        icon: '💼', title: 'S-Corp Salary vs. Distribution Split', priority: 'high',
        saving: seTaxSaved,
        detail: `Your S-Corp structure already saves FICA taxes on the ${fmt(k1)} distributed as K-1 (vs. a sole prop where all income is subject to SE tax). Distributions above your officer salary avoid 15.3% self-employment tax.`,
        howTo: `Estimated FICA savings from K-1 vs. W-2 structure: ~${fmt(seTaxSaved)}. Maintain documentation showing salary is reasonable for your role. Avoid setting salary too low — IRS minimum guidance is typically 35–40% of net profit.`
      })
    }
  }

  opportunities.push({
    icon: '🏥', title: 'Health Savings Account (HSA)', priority: 'medium',
    saving: Math.round(4300 * marginalRate),
    detail: `If you have a High-Deductible Health Plan (HDHP), you can contribute up to $4,300 (self-only) or $8,550 (family) to an HSA in 2025. Contributions are tax-deductible and grow tax-free.`,
    howTo: `At your rate of ${pct(marginalRate * 100)}, a max HSA contribution saves approx. ${fmt(Math.round(4300 * marginalRate))}. Funds roll over each year and can be invested. Withdrawals for medical expenses are always tax-free.`
  })

  if (isSCorpEntity(b.entityType) && revenue > 0) {
    opportunities.push({
      icon: '🏡', title: 'Augusta Rule — IRC §280A(g)', priority: 'low',
      saving: null,
      detail: 'You can rent your personal home to your S-Corp for up to 14 days per year. The rental income is tax-free to you personally, and the rental payment is a deductible business expense for the S-Corp.',
      howTo: 'Document business meetings, shareholder meetings, or strategy sessions held at your home. Pay fair market rent (research comparable event venue rates in your area). Keep written agreements. Maximum benefit: fair market rate × 14 days, deductible to the S-Corp.'
    })
  }

  const priorityColors = { high: { bg: '#F0FDF4', border: '#86EFAC', badge: G }, medium: { bg: '#EFF6FF', border: '#93C5FD', badge: B }, low: { bg: '#F5F3FF', border: '#C4B5FD', badge: P } }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Tax-Saving Opportunities</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Specific strategies based on your {b.entityType || 'business'} structure and {year} tax year. Estimated savings at your {pct(marginalRate * 100)} marginal rate.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {opportunities.map((o, i) => {
          const c = priorityColors[o.priority]
          return (
            <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>{o.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: N, fontSize: 14 }}>{o.title}</span>
                      {o.saving && <span style={{ fontSize: 11, background: '#F0FDF4', color: G, border: '1px solid #86EFAC', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>Save ~{fmt(o.saving)}</span>}
                      <span style={{ fontSize: 10, background: c.bg, color: c.badge, border: '1px solid ' + c.border, borderRadius: 10, padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase' }}>{o.priority} impact</span>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: SL, margin: 0, lineHeight: 1.6 }}>{o.detail}</p>
              </div>
              <div style={{ padding: '12px 20px', background: '#F8FAFC' }}>
                <div style={{ fontSize: 12, color: N, lineHeight: 1.6 }}>
                  <strong style={{ color: B }}>How to apply:</strong> {o.howTo}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: SL, textAlign: 'center' }}>
        Estimates based on inputs entered. Consult a CPA before implementing any strategy.
      </div>
    </div>
  )
}

// ── TAB 3: IRS Schedule Map ──────────────────────────────────────────────────
function IRSCompliance({ rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const k1 = parseFloat(rec?.k1Income) || 0
  const w2 = getTotalW2(rec)
  const rental = false // future
  const entity = b.entityType || 'Unknown'
  const year = parseInt(b.year) || 2025
  const today = new Date()

  const schedules = []

  schedules.push({ form: 'Form 1040', title: 'U.S. Individual Income Tax Return', status: 'required', detail: 'Your main personal tax return. All income sources flow here — W-2, K-1, Schedule E, Schedule C.', deadline: `April 15, ${year + 1}` })

  if (isSCorpEntity(entity)) {
    schedules.push({ form: 'Form 1120-S', title: 'S-Corporation Tax Return', status: 'required', detail: `Your S-Corp files its own informational return showing income, deductions, and K-1 allocations to shareholders.`, deadline: `March 15, ${year + 1}` })
    schedules.push({ form: 'Schedule K-1 (1120-S)', title: 'Shareholder Share of Income', status: 'required', detail: `Your ${fmt(k1)} share of S-Corp income flows to your personal return via this form. Attach to Schedule E, Part II.`, deadline: `Issued with Form 1120-S` })
    schedules.push({ form: 'Schedule E (Part II)', title: 'Supplemental Income — S-Corp K-1', status: 'required', detail: 'Reports your K-1 income on your personal return. Passive vs. active participation rules apply.', deadline: 'Filed with Form 1040' })
  }
  if (/partnership|multi.?member|mmllc/i.test(entity || '')) {
    schedules.push({ form: 'Form 1065', title: 'Partnership Return', status: 'required', detail: 'Partnership or multi-member LLC files this informational return. Issues K-1s to each partner/member.', deadline: `March 15, ${year + 1}` })
    schedules.push({ form: 'Schedule K-1 (1065)', title: 'Partner Share of Income', status: 'required', detail: 'Your distributive share of partnership income, deductions, and credits.', deadline: 'Issued with Form 1065' })
  }
  if (/sole|single.?member/i.test(entity || '')) {
    schedules.push({ form: 'Schedule C', title: 'Profit or Loss from Business', status: 'required', detail: 'Reports all business revenue and expenses. Net profit flows directly to Form 1040 Line 8.', deadline: 'Filed with Form 1040' })
    schedules.push({ form: 'Schedule SE', title: 'Self-Employment Tax', status: 'required', detail: 'Calculates 15.3% SE tax on net self-employment income. Half is deductible on Schedule 1.', deadline: 'Filed with Form 1040' })
  }

  if (isPassthroughEntity(entity) && k1 > 0) {
    const _filing = f.filingStatus || 'single'
    const _taxableBeforeQBI = Math.max(0, k1 + w2 - getStdDed(year, _filing))
    const { deduction: _qbi, limitApplied: _limitApplied, caps: _caps } = calcQBI(k1, _taxableBeforeQBI, 0, { status: _filing, taxYear: year, entityQbiData: rec.entities || [] })
    const _qbiGap = _caps ? Math.max(0, Math.round(_caps.qbi - _qbi)) : 0
    const _qbiThresholds = QBI_THRESHOLDS[year] || QBI_THRESHOLDS[2025]
    const _qbiThreshold = _qbiThresholds[_filing] || _qbiThresholds.single
    const _isCoopPatron = !!f.isCoopPatron
    const _useForm8995A = _taxableBeforeQBI > _qbiThreshold || _isCoopPatron
    const _entitiesArr = Array.isArray(rec.entities) ? rec.entities : []
    const _hasSSTB = _entitiesArr.some(e => !!(e && (e.box17V_sstb || e.sstb)))
    const _currentYearQbiLoss = _entitiesArr.some(e => {
      const np = parseFloat(e?.netProfit ?? e?.pnl?.netProfit ?? 0) || 0
      const own = parseFloat(e?.own ?? 100) || 100
      return (np * own / 100) < 0
    }) || k1 < 0
    const _priorQbiLoss = (parseFloat(f.priorQBILossCO || f.priorYearLosses || 0) || 0) > 0
    const _formNum = _useForm8995A ? 'Form 8995-A' : 'Form 8995'
    const _formTitle = _useForm8995A ? 'QBI Deduction — Detailed Computation (IRC §199A)' : 'QBI Deduction (IRC §199A)'
    const _sstbNote = (_useForm8995A && _hasSSTB && _taxableBeforeQBI > _qbiThreshold) ? ' SSTB activity detected at or above the income threshold — see Form 8995-A Schedule A for the §199A(d)(3) phase-in / phase-out of the QBI deduction for specified service trades or businesses.' : ''
    const _lossNote = (_useForm8995A && (_currentYearQbiLoss || _priorQbiLoss)) ? ' QBI loss detected — see Form 8995-A Schedule C for loss netting across qualified businesses and the §199A(c)(2) carryforward of negative QBI to subsequent years.' : ''
    const _coopNote = (_isCoopPatron && _useForm8995A) ? ' Co-op patron status flagged — see Form 8995-A Schedule D for the §199A(g)(2) patron reduction (lesser of 9% of QBI allocable to qualified payments or 50% of allocable W-2 wages); not currently calculated by this tool.' : ''
    schedules.push({ form: _formNum, title: _formTitle, status: 'required', detail: `Your Qualified Business Income deduction of ~${fmt(_qbi)}${_limitApplied === 'wage' ? ` (limited by W-2 wage/UBIA cap; reducing your deduction by ${fmt(_qbiGap)})` : _limitApplied === 'income' ? ` (capped by 20% of taxable income; reducing your deduction by ${fmt(_qbiGap)})` : _limitApplied === 'min400' ? ` (set to §199A(i) OBBBA minimum of ${fmt(_qbi)})` : ''} is reported here. Reduces taxable income without reducing AGI.${_sstbNote}${_lossNote}${_coopNote}`, deadline: 'Filed with Form 1040' })
  }

  if (w2 > 0) {
    schedules.push({ form: 'W-2 / Form W-2', title: 'Wages and Withholding', status: 'required', detail: `Your ${fmt(w2)} in W-2 wages are reported on Line 1a of Form 1040. Federal withholding reduces your tax liability.`, deadline: 'Issued by employer Jan 31' })
  }

  if (parseFloat(f.estPaid) > 0) {
    schedules.push({ form: 'Form 1040-ES', title: 'Quarterly Estimated Tax Payments', status: 'active', detail: `${fmt(parseFloat(f.estPaid))} in estimated payments recorded. These reduce your balance due at filing.`, deadline: 'Q1: Apr 15 | Q2: Jun 16 | Q3: Sep 15 | Q4: Jan 15' })
  }

  schedules.push({ form: 'Schedule 1', title: 'Additional Income and Adjustments', status: 'required', detail: 'Reports K-1 income, rental income, capital gains, NOL carryforward, and above-the-line deductions. Flows to Form 1040 Lines 8 and 10.', deadline: 'Filed with Form 1040' })
  schedules.push({ form: 'Schedule 2', title: 'Additional Taxes', status: 'required', detail: 'Carries SE tax, Additional Medicare Tax, and Net Investment Income Tax to Form 1040 Line 23.', deadline: 'Filed with Form 1040' })

  const _interest = parseFloat(String(f.interest || '').replace(/,/g, '')) || 0
  const _dividends = parseFloat(String(f.dividends || '').replace(/,/g, '')) || 0
  if (_interest > 1500 || _dividends > 1500) {
    schedules.push({ form: 'Schedule B', title: 'Interest and Ordinary Dividends', status: 'required', detail: `Required when interest or ordinary dividends exceed $1,500. You reported ${fmt(_interest)} in interest and ${fmt(_dividends)} in ordinary dividends.`, deadline: 'Filed with Form 1040' })
  }

  const _stGain = parseFloat(String(f.capitalGains || '').replace(/,/g, '')) || 0
  const _ltGain = parseFloat(String(f.ltCapGains || '').replace(/,/g, '')) || 0
  const _unrec1250 = parseFloat(String(f.unrecap1250 || '').replace(/,/g, '')) || 0
  const _collectibles = parseFloat(String(f.collectiblesGain || '').replace(/,/g, '')) || 0
  const _capGainTotal = _stGain + _ltGain + _unrec1250 + _collectibles
  if (_capGainTotal !== 0) {
    schedules.push({ form: 'Schedule D', title: 'Capital Gains and Losses', status: 'required', detail: `Reports your ${fmt(_stGain + _ltGain)} in capital gains/losses. Short-term taxed at ordinary rates; long-term at 0/15/20% preferential rates.`, deadline: 'Filed with Form 1040' })
    schedules.push({ form: 'Form 8949', title: 'Sales and Other Dispositions of Capital Assets', status: 'required', detail: 'Lists individual capital asset sales — purchase date, sale date, basis, proceeds. Subtotals roll up to Schedule D.', deadline: 'Filed with Schedule D' })
  }

  const _form4797 = parseFloat(String(f.form4797 || '').replace(/,/g, '')) || 0
  if (_form4797 !== 0 || _unrec1250 > 0) {
    schedules.push({ form: 'Form 4797', title: 'Sales of Business Property', status: 'required', detail: `Reports ${_form4797 !== 0 ? 'ordinary gain/loss on §1231 property and §1245/§1250 recapture' : 'unrecaptured §1250 gain (depreciation recapture on real property, taxed at max 25%)'}.`, deadline: 'Filed with Form 1040' })
  }

  const _rentalIncomeSch = parseFloat(String(b.rentalIncome || f.rentalIncome || '').replace(/,/g, '')) || 0
  const _isREP = b.isREP || f.isREP || rec?.isREP
  if (_rentalIncomeSch > 0) {
    schedules.push({ form: 'Schedule E (Part I)', title: 'Rental Real Estate', status: 'required', detail: 'Reports rental property income and expenses. ' + (_isREP ? 'REP status under IRC 469(c)(7) allows full loss deduction.' : 'Non-REP filers limited to passive loss rules under IRC 469.'), deadline: 'Filed with Form 1040' })
    if (!_isREP) {
      schedules.push({ form: 'Form 8582', title: 'Passive Activity Loss Limitations', status: 'required', detail: 'Required for non-REP filers with rental activities.', deadline: 'Filed with Form 1040' })
    }
  }

  if ((parseFloat(String(b.depreciation || '').replace(/,/g, '')) || 0) > 0) {
    schedules.push({ form: 'Form 4562', title: 'Depreciation and Amortization', status: 'required', detail: 'Reports depreciation deductions for business assets and rental property.', deadline: 'Filed with Form 1040' })
  }

  const _niitThreshold = (f.filingStatus === 'mfj' || f.filingStatus === 'qss') ? 250000 : (f.filingStatus === 'mfs' ? 125000 : 200000)
  if ((k1 + w2) > _niitThreshold) {
    schedules.push({ form: 'Form 8960', title: 'Net Investment Income Tax (3.8%)', status: 'required', detail: 'MAGI exceeds the NIIT threshold for the selected filing status. Applies 3.8% to net investment income.', deadline: 'Filed with Form 1040' })
  }

  const totalIncome = k1 + w2
  if (f.useItemized && (parseFloat(f.itemizedAmt)||0) > 0) {
    const _saltCap = SALT_CAPS[year] || SALT_CAPS[2025]
    schedules.push({ form: 'Schedule A', title: 'Itemized Deductions', status: 'required', detail: `Itemizing chosen over standard deduction. Reports mortgage interest, SALT (capped at ${fmt(_saltCap)}), charitable contributions, medical.`, deadline: 'Filed with Form 1040' })
  }

  const _addlMedThreshold = (f.filingStatus === 'mfj' || f.filingStatus === 'qss') ? 250000 : (f.filingStatus === 'mfs' ? 125000 : 200000)
  if (w2 > _addlMedThreshold) {
    schedules.push({ form: 'Form 8959', title: 'Additional Medicare Tax (0.9%)', status: 'required', detail: `With ${fmt(w2)} in wages, the 0.9% Additional Medicare Tax applies to wages above ${fmt(_addlMedThreshold)} (${f.filingStatus || 'single'} threshold).`, deadline: 'Filed with Form 1040' })
  }

  const upcomingDeadlines = [
    { date: `Jan 31, ${year + 1}`, event: 'W-2s issued by employers' },
    { date: `Mar 15, ${year + 1}`, event: `Form 1120-S / 1065 due (S-Corps & Partnerships)` },
    { date: `Apr 15, ${year + 1}`, event: 'Form 1040 personal return due / Q1 estimated payment' },
    { date: `Jun 16, ${year + 1}`, event: 'Q2 estimated tax payment due' },
    { date: `Sep 15, ${year + 1}`, event: 'Q3 estimated tax payment due' },
    { date: `Jan 15, ${year + 2}`, event: 'Q4 estimated tax payment due' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Your IRS Filing Map</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Forms and schedules required for a {entity} filing {year} taxes. Based on your saved record.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        {schedules.map((s, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: s.status === 'required' ? '#EFF6FF' : '#F0FDF4', color: s.status === 'required' ? B : G, border: '1px solid ' + (s.status === 'required' ? '#BFDBFE' : '#86EFAC'), borderRadius: 4, padding: '1px 7px' }}>{s.form}</span>
            </div>
            <div style={{ fontWeight: 700, color: N, fontSize: 13, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: SL, lineHeight: 1.5, marginBottom: 6 }}>{s.detail}</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>📅 {s.deadline}</div>
          </div>
        ))}
      </div>
      <div style={{ background: N, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', letterSpacing: '1px', marginBottom: 14 }}>KEY DEADLINES — TAX YEAR {year}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {upcomingDeadlines.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', minWidth: 110, flexShrink: 0 }}>{d.date}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{d.event}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── TAB 4: Reports & Tools ───────────────────────────────────────────────────
function Modal({ onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 740, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        {children}
      </div>
    </div>
  )
}

function ReportModal({ onClose, rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const k1 = parseFloat(rec?.k1Income) || 0
  const totalW2 = getTotalW2(rec)
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 4 }}>CPA EXPORT PACK</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>Tax Analysis Report</h2>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>Generated {now} · TaxStat360</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ padding: '8px 18px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>🖨 Print / Save PDF</button>
            <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
          </div>
        </div>
        {rec && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>LAST SAVED CALCULATION — {rec.savedAt}</div>
            {[
              ['Entity Type', b.entityType],['Tax Year', String(b.year || '')],
              ['Gross Revenue', b.grossRevenue ? '$' + parseFloat(b.grossRevenue).toLocaleString() : ''],
              ['Operating Expenses', b.operatingExpenses ? '$' + parseFloat(b.operatingExpenses).toLocaleString() : ''],
              ['Officer Salary', b.officerSalary ? '$' + parseFloat(b.officerSalary).toLocaleString() : ''],
              ['K-1 Income to Personal Return', rec.k1Income ? '$' + parseFloat(rec.k1Income).toLocaleString() : '$0'],
              ['Filing Status', (f.filingStatus || '').toUpperCase()],
              ['W-2 Income', totalW2 > 0 ? '$' + totalW2.toLocaleString() : ''],
              ['Estimated Payments Made', f.estPaid ? '$' + parseFloat(f.estPaid).toLocaleString() : ''],
            ].filter(([,v]) => v).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                <span style={{ color: SL }}>{label}</span><span style={{ fontWeight: 600, color: N }}>{value}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1D4ED8', fontSize: 13, marginBottom: 10 }}>📋 IRS Schedule Mapping</div>
          {[
            ['Schedule E (Part II)', 'K-1 income from S-Corps, Partnerships, and Trusts'],
            ['Form 8995', 'QBI deduction — 20% of qualified business income'],
            ['Form 8959', 'Additional Medicare Tax — 0.9% on wages over $200K'],
            ['Schedule A', 'Itemized deductions — mortgage, taxes, charitable'],
            ['Form 7203', 'S-Corp shareholder stock and debt basis limitations'],
          ].map(([s, d]) => (
            <div key={s} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13, borderBottom: '1px solid #BFDBFE' }}>
              <span style={{ fontWeight: 700, color: '#1D4ED8', minWidth: 145, flexShrink: 0 }}>{s}</span>
              <span style={{ color: SL }}>{d}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>For planning purposes only. Consult a licensed CPA before filing.</div>
      </div>
    </Modal>
  )
}

function SimulatorModal({ onClose, rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const taxYear = parseInt(b.year) || 2025
  const filing  = f.filingStatus || 'single'
  const ownerPct = parseFloat(b.ownershipPct || 100) / 100
  const entity  = b.entityType || 'Unknown'

  const base = {
    grossRevenue:      parseFloat(b.grossRevenue)      || 0,
    cogs:              parseFloat(b.cogs)               || 0,
    operatingExpenses: parseFloat(b.operatingExpenses)  || 0,
    officerSalary:     parseFloat(b.officerSalary)      || 0,
    depreciation:      parseFloat(b.depreciation)       || 0,
    advertising:       parseFloat(b.advertising)        || 0,
    otherDeductions:   parseFloat(b.otherDeductions)    || 0,
    w2Income:          getTotalW2(rec)                       || 0,
    estPaid:           parseFloat(f.estPaid)  || 0,
  }

  const [delta, setDelta] = useState({
    grossRevenue: 0, operatingExpenses: 0, officerSalary: 0,
    depreciation: 0, advertising: 0, otherDeductions: 0, w2Income: 0,
  })
  const [activeScenario, setActiveScenario] = useState(null)

  const applyPreset = (id) => {
    setActiveScenario(id)
    const presets = {
      adv15:   { advertising: 15000 },
      adv30:   { advertising: 30000 },
      equip20: { depreciation: 20000 },
      equip50: { depreciation: 50000 },
      sep:     { otherDeductions: Math.min(69000, Math.round((base.grossRevenue - base.cogs - base.operatingExpenses - base.officerSalary) * ownerPct * 0.25)) },
      revenue: { grossRevenue: 50000 },
      salary:  { officerSalary: 20000 },
      custom:  {},
    }
    setDelta({ grossRevenue:0, operatingExpenses:0, officerSalary:0, depreciation:0, advertising:0, otherDeductions:0, w2Income:0, ...(presets[id]||{}) })
  }

  const stdDed = getStdDed(taxYear, filing)

  const calcScenario = (d) => {
    const rev   = base.grossRevenue      + (d.grossRevenue      || 0)
    const cogs  = base.cogs
    const opex  = base.operatingExpenses + (d.operatingExpenses || 0)
    const sal   = base.officerSalary     + (d.officerSalary     || 0)
    const dep   = base.depreciation      + (d.depreciation      || 0)
    const adv   = base.advertising       + (d.advertising       || 0)
    const other = base.otherDeductions   + (d.otherDeductions   || 0)
    const w2    = base.w2Income          + (d.w2Income          || 0) + (d.officerSalary || 0)
    const grossProfit = rev - cogs
    const totalBizExp = opex + sal + dep + adv + other
    const netBizIncome = grossProfit - totalBizExp
    let k1 = 0
    if (isPassthroughEntity(entity)) {
      k1 = Math.max(0, netBizIncome) * ownerPct
    }
    const totalPersonalIncome = k1 + w2
    const _taxableBeforeQBI = Math.max(0, totalPersonalIncome - stdDed)
    const { deduction: qbi } = isPassthroughEntity(entity) ? calcQBI(k1, _taxableBeforeQBI, 0, { status: filing, taxYear, entityQbiData: rec?.entities || [] }) : { deduction: 0 }
    const agi = Math.max(0, totalPersonalIncome - qbi)
    const taxableInc = Math.max(0, agi - stdDed)
    let fedTax = calcFederalTax(taxableInc, taxYear, filing)
    return { rev, opex, sal, dep, adv, other, netBizIncome, k1, qbi, w2, agi, taxableInc, fedTax }
  }

  const baseline = calcScenario({ grossRevenue:0, operatingExpenses:0, officerSalary:0, depreciation:0, advertising:0, otherDeductions:0, w2Income:0 })
  const scenario = calcScenario(delta)
  const taxSaving = baseline.fedTax - scenario.fedTax

  const fmt = n => '$' + Math.abs(Math.round(n)).toLocaleString()
  const chg = (base, scen) => {
    const diff = scen - base
    if (diff === 0) return null
    return <span style={{fontSize:11,fontWeight:700,color:diff>0?'#DC2626':'#059669',marginLeft:6}}>{diff>0?'↑+'+fmt(diff):'↓'+fmt(Math.abs(diff))}</span>
  }

  const presets = [
    { id:'adv15',   icon:'📢', label:'$15K Advertising',    color:'#D97706' },
    { id:'adv30',   icon:'📣', label:'$30K Advertising',    color:'#D97706' },
    { id:'equip20', icon:'🔧', label:'$20K Equipment',       color:'#2563EB' },
    { id:'equip50', icon:'🏗️', label:'$50K Equipment',       color:'#7C3AED' },
    { id:'sep',     icon:'🏦', label:'Max SEP-IRA',          color:'#059669' },
    { id:'revenue', icon:'📈', label:'+$50K Revenue',        color:'#0891B2' },
    { id:'salary',  icon:'💼', label:'+$20K Salary',         color:'#475569' },
    { id:'custom',  icon:'✏️', label:'Custom',               color:'#94A3B8' },
  ]

  const row = (label, baseVal, scenVal, indent=false) => (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #F1F5F9'}}>
      <span style={{fontSize:13,color:indent?'#64748B':'#334155',paddingLeft:indent?12:0}}>{label}</span>
      <div style={{display:'flex',alignItems:'center',gap:4}}>
        <span style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{fmt(scenVal)}</span>
        {chg(baseVal, scenVal)}
      </div>
    </div>
  )

  return (
    <Modal onClose={onClose}>
      <div style={{padding:'24px 28px',fontFamily:'Inter,sans-serif'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'#059669',letterSpacing:'1px',marginBottom:3}}>WHAT-IF TAX SIMULATOR</div>
            <h2 style={{fontSize:20,fontWeight:800,color:'#0D1B3E',margin:'0 0 3px'}}>How would this affect my taxes?</h2>
            <div style={{fontSize:12,color:'#64748B'}}>{entity} · Tax Year {taxYear} · {filing.toUpperCase()} · Changes don't affect your saved record</div>
          </div>
          <button onClick={onClose} style={{padding:'7px 13px',background:'#F1F5F9',color:'#64748B',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>✕</button>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:'#64748B',letterSpacing:'0.5px',marginBottom:8}}>PICK A SCENARIO TO MODEL</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
            {presets.map(p => (
              <button key={p.id} onClick={()=>applyPreset(p.id)} style={{
                padding:'8px 14px',borderRadius:20,fontSize:12,fontWeight:700,cursor:'pointer',
                background: activeScenario===p.id ? p.color : '#F8FAFC',
                color: activeScenario===p.id ? '#fff' : '#334155',
                border: '1.5px solid ' + (activeScenario===p.id ? p.color : '#E2E8F0'),
                transition:'all 0.15s'
              }}>{p.icon} {p.label}</button>
            ))}
          </div>
        </div>
        {activeScenario === 'custom' && (
          <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,padding:'14px 18px',marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:'#64748B',marginBottom:10}}>ENTER CHANGES (+ to add, - to reduce)</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[
                ['Advertising ($)', 'advertising'],
                ['Depreciation / Equip ($)', 'depreciation'],
                ['Operating Expenses ($)', 'operatingExpenses'],
                ['Other Deductions ($)', 'otherDeductions'],
                ['Gross Revenue Change ($)', 'grossRevenue'],
                ['Officer Salary Change ($)', 'officerSalary'],
              ].map(([label, key]) => (
                <div key={key}>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748B',display:'block',marginBottom:3}}>{label}</label>
                  <input type="number" value={delta[key]||0} onChange={e=>setDelta(d=>({...d,[key]:parseFloat(e.target.value)||0}))}
                    style={{width:'100%',padding:'8px 10px',border:'1.5px solid #E2E8F0',borderRadius:7,fontSize:14,fontWeight:600,color:'#0D1B3E',boxSizing:'border-box',fontFamily:'inherit',outline:'none'}} />
                </div>
              ))}
            </div>
          </div>
        )}
        {activeScenario && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px 18px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#64748B',letterSpacing:'0.5px',marginBottom:10}}>{entity.toUpperCase()} — ENTITY LEVEL</div>
              {row('Gross Revenue',     baseline.rev,        scenario.rev)}
              {row('Operating Expenses',baseline.opex,       scenario.opex,     true)}
              {row('Officer Salary',    baseline.sal,        scenario.sal,      true)}
              {row('Depreciation',      baseline.dep,        scenario.dep,      true)}
              {row('Advertising',       baseline.adv,        scenario.adv,      true)}
              {row('Other Deductions',  baseline.other,      scenario.other,    true)}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',marginTop:4}}>
                <span style={{fontSize:13,fontWeight:700,color:'#0D1B3E'}}>Net Business Income</span>
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:15,fontWeight:800,color:scenario.netBizIncome>=0?'#059669':'#DC2626'}}>{fmt(scenario.netBizIncome)}</span>
                  {chg(baseline.netBizIncome, scenario.netBizIncome)}
                </div>
              </div>
              <div style={{background:'#EFF6FF',borderRadius:8,padding:'8px 12px',marginTop:6}}>
                <div style={{fontSize:11,color:'#1D4ED8',fontWeight:700,marginBottom:2}}>K-1 TO YOUR 1040</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:13,color:'#1D4ED8'}}>Your share ({b.ownershipPct||100}%)</span>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <span style={{fontSize:16,fontWeight:800,color:'#1D4ED8'}}>{fmt(scenario.k1)}</span>
                    {chg(baseline.k1, scenario.k1)}
                  </div>
                </div>
              </div>
            </div>
            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px 18px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#64748B',letterSpacing:'0.5px',marginBottom:10}}>YOUR PERSONAL 1040</div>
              {row('K-1 Income',        baseline.k1,         scenario.k1)}
              {row('W-2 Wages (total)', baseline.w2,         scenario.w2)}
              {row('QBI Deduction (20%)', baseline.qbi,      scenario.qbi,      true)}
              {row('Standard Deduction', stdDed,             stdDed)}
              {row('Taxable Income',    baseline.taxableInc, scenario.taxableInc)}
              <div style={{background: taxSaving>0?'#F0FDF4':'#FEF2F2',borderRadius:10,padding:'12px 14px',marginTop:10,border:'2px solid '+(taxSaving>0?'#86EFAC':'#FECACA')}}>
                <div style={{fontSize:11,fontWeight:700,color:'#64748B',marginBottom:4}}>FEDERAL TAX</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:11,color:'#94A3B8',textDecoration:'line-through'}}>{fmt(baseline.fedTax)} before</div>
                    <div style={{fontSize:22,fontWeight:800,color:taxSaving>0?'#059669':'#DC2626'}}>{fmt(scenario.fedTax)}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'#64748B',marginBottom:2}}>{taxSaving>0?'YOU SAVE':'ADDITIONAL TAX'}</div>
                    <div style={{fontSize:26,fontWeight:800,color:taxSaving>0?'#059669':'#DC2626'}}>
                      {taxSaving>=0?'':'+'}{ taxSaving>0 ? fmt(taxSaving) : fmt(Math.abs(taxSaving)) }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {!activeScenario && (
          <div style={{textAlign:'center',padding:'32px 20px',background:'#F8FAFC',borderRadius:12,border:'1px dashed #CBD5E1'}}>
            <div style={{fontSize:32,marginBottom:10}}>☝️</div>
            <div style={{fontWeight:700,color:'#0D1B3E',fontSize:15,marginBottom:6}}>Pick a scenario above</div>
            <div style={{fontSize:13,color:'#64748B'}}>Select any strategy to instantly see how it flows from your {entity} through to your personal 1040.</div>
          </div>
        )}
        <div style={{fontSize:11,color:'#94A3B8',textAlign:'center',marginTop:8}}>
          Uses {taxYear} federal brackets · {filing.toUpperCase()} · ${stdDed.toLocaleString()} std deduction · Does not include state tax, FICA, or AMT · Consult a CPA before implementing.
        </div>
      </div>
    </Modal>
  )
}

function NarrativeModal({ onClose }) {
  const [selected, setSelected] = useState(0)
  const [copied, setCopied] = useState(false)
  const narratives = [
    { title: 'Real Estate Professional Status', tag: 'REP · IRC §469(c)(7)', color: P, text: `Dear IRS Representative,

This letter responds to your inquiry regarding the taxpayer's Real Estate Professional (REP) classification under IRC Section 469(c)(7) for tax year 2025.

The taxpayer qualifies as a Real Estate Professional based on the following:

1. MORE THAN 50% OF PERSONAL SERVICES
The taxpayer performed more than 50% of all personal services in real property trades or businesses in which they materially participated.

2. MORE THAN 750 HOURS
The taxpayer performed more than 750 hours of services during the year satisfying the statutory threshold under IRC §469(c)(7)(B).

3. MATERIAL PARTICIPATION
The taxpayer materially participated in each rental activity meeting the 500-hour test under Treas. Reg. §1.469-5T(a)(1).

As a result, rental real estate losses are treated as non-passive and are fully deductible pursuant to IRC §469(c)(7)(A).

Respectfully submitted,` },
    { title: 'S-Corp Reasonable Compensation', tag: 'Officer Salary · Rev. Rul. 74-44', color: R, text: `Dear IRS Representative,

This letter addresses your inquiry regarding officer compensation paid through the taxpayer's S-Corporation for tax year 2025.

The officer salary represents reasonable compensation based on:

1. INDUSTRY BENCHMARKS — Compensation was determined by reference to comparable salaries consistent with Rev. Rul. 74-44.

2. DUTIES AND RESPONSIBILITIES — The officer-shareholder performs substantial services including business development, client management, and financial oversight.

3. CORPORATE PROFITABILITY — The compensation represents a reasonable percentage of gross revenues consistent with industry norms.

The S-Corporation maintains complete payroll records and W-2 forms.

Respectfully submitted,` },
    { title: 'K-1 Loss Deductibility', tag: 'Schedule E · IRC §1366(d)', color: '#0891b2', text: `Dear IRS Representative,

This letter responds to your inquiry regarding Schedule E losses reported from the taxpayer's S-Corporation K-1 for tax year 2025.

The K-1 losses are fully deductible for the following reasons:

1. SHAREHOLDER BASIS — The taxpayer maintains sufficient stock basis under IRC §1366(d). Form 7203 is attached.

2. AT-RISK RULES — The taxpayer is at risk for the full amount of the loss under IRC §465.

3. MATERIAL PARTICIPATION — The taxpayer satisfies material participation standards under Treas. Reg. §1.469-5T.

Complete corporate returns (Form 1120-S) and K-1 schedules are available upon request.

Respectfully submitted,` },
  ]
  const current = narratives[selected]
  const handleCopy = () => { navigator.clipboard.writeText(current.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px' }}>
        <DismissibleNotice storageKey="tx360.positionDocBanner.dismissed">
          This document organizes your records and the positions taken on your return.
          It is not legal or tax representation. For an actual audit response, engage
          a CPA, EA, or tax attorney authorized to practice before the IRS.
        </DismissibleNotice>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: P, letterSpacing: '1px', marginBottom: 4 }}>POSITION DOCUMENTATION</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>IRS Response Templates</h2>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>Review and edit before sending — not a substitute for legal advice</div>
          </div>
          <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {narratives.map((n, i) => (
            <button key={i} onClick={() => { setSelected(i); setCopied(false) }} style={{ padding: '7px 14px', background: selected === i ? n.color : '#fff', color: selected === i ? '#fff' : SL, border: '1px solid ' + (selected === i ? n.color : '#E2E8F0'), borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{n.title}</button>
          ))}
        </div>
        <div style={{ display: 'inline-block', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700, color: P, marginBottom: 14 }}>📋 {current.tag}</div>
        <div style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '20px 24px', marginBottom: 16, fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.85, color: N, whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>{current.text}</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button onClick={handleCopy} style={{ flex: 1, padding: '11px', background: copied ? G : P, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{copied ? '✓ Copied!' : '📋 Copy to Clipboard'}</button>
          <button onClick={() => window.print()} style={{ flex: 1, padding: '11px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>🖨 Print</button>
        </div>
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>⚠️ Templates only — review with a licensed tax attorney before submitting to the IRS.</div>
      </div>
    </Modal>
  )
}

function ReportsTab({ rec, onReport, onSimulator, onNarrative }) {
  const tools = [
    { icon: '📋', title: 'CPA Export Pack', desc: 'A print-ready PDF with your financials, K-1 summary, risk alerts, and IRS schedule mapping. Hand this to your accountant instead of explaining everything from scratch.', btn: 'Generate Report', color: B, action: onReport, available: true },
    { icon: '🎯', title: 'What-If Tax Simulator', desc: 'Model a financial decision before making it. Try different salary levels, add a deduction, or max a retirement account — see the exact dollar impact on your estimated tax.', btn: 'Open Simulator', color: G, action: onSimulator, available: true },
    { icon: '🛡️', title: 'Position Documentation', desc: 'Generates a written summary of the positions taken on your return with supporting documentation references. Useful for your CPA, your records, or as starting material for a professional response. Not a substitute for representation by a CPA, EA, or tax attorney.', btn: 'View Templates', color: P, action: onNarrative, available: true },
  ]
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Reports & Tools</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Three tools built for your CPA relationship and IRS preparedness.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tools.map(t => (
          <div key={t.title} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px', display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ fontSize: 48, flexShrink: 0 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: N, fontSize: 16, marginBottom: 6 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: SL, lineHeight: 1.6 }}>{t.desc}</div>
            </div>
            <button onClick={t.action} style={{ padding: '12px 24px', background: t.color, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>{t.btn}</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function NoData() {
  const nav = useNavigate()
  const location = useLocation()
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
      <div style={{ fontWeight: 700, color: N, fontSize: 18, marginBottom: 8 }}>No data found</div>
      <div style={{ color: SL, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>Complete a tax calculation first — either save a record from the Dashboard, or run Step 1 + Step 2 and come back here without saving.</div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={() => nav('/dashboard')} style={{ padding: '12px 28px', background: B, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Go to Dashboard →</button>
        <button onClick={() => nav('/calculate-tax')} style={{ padding: '12px 28px', background: '#fff', color: N, border: '2px solid #E2E8F0', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Start Calculation →</button>
      </div>
    </div>
  )
}

export default function AIAnalysis() {
  const nav = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [showNarrative, setShowNarrative] = useState(false)

  const rec = getRecord(location.state?.liveState)
  const score = completeness(rec)

  const TABS = [
    { label: '🔍 Risk Scan', desc: 'AI findings from your data' },
    { label: '💡 Tax Optimization', desc: 'Strategies to reduce your tax' },
    { label: '📋 IRS Filing Map', desc: 'Your required forms & deadlines' },
    { label: '🛠 Reports & Tools', desc: 'CPA export, simulator, position documentation' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {rec && rec._source !== 'live' && (
        <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FCD34D', padding: '10px 20px', textAlign: 'center', fontSize: 13, color: '#92400E' }}>
          ℹ Showing last saved data — <a href="#" onClick={(e) => { e.preventDefault(); nav('/tax-return'); }} style={{ color: '#92400E', textDecoration: 'underline', fontWeight: 600 }}>return to the calculator</a> to refresh with current inputs.
        </div>
      )}
      {showReport && <ReportModal onClose={() => setShowReport(false)} rec={rec} />}
      {showSimulator && <SimulatorModal onClose={() => setShowSimulator(false)} rec={rec} />}
      {showNarrative && <NarrativeModal onClose={() => setShowNarrative(false)} />}

      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div onClick={() => nav('/dashboard')}><Logo /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/dashboard')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>📂 Dashboard</button>
          <button onClick={() => {
            const r = getRecord(location.state?.liveState)
            if (r) {
              writeTaxYear(r.biz?.year || 2025)
              writePersonalContext(normalizeF1040(r.f1040 || {}))
              writeStep1State({
                entities: isPassthroughEntity(r.biz?.entityType)
                  ? [{ type: r.biz?.entityType, k1: r.k1Income || 0 }]
                  : [],
                k1Total: r.k1Income || 0,
                isCoopPatron: !!r.f1040?.isCoopPatron,
              })
              nav('/tax-return')
            } else {
              nav('/calculate-tax')
            }
          }} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>Calculate Tax</button>
          <button style={{ padding: '7px 16px', background: B, color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>AI Analysis</button>
          <button onClick={() => nav('/settings')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>⚙ Settings</button>
          <button onClick={() => { signOut(nav) }} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>Sign Out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: N, fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>AI Risk & Tax Analysis</h1>
          <p style={{ color: SL, fontSize: 14, margin: 0 }}>
            {rec ? `Analyzing your ${rec.biz?.entityType || 'business'} — saved ${rec.savedAt}` : 'Save a record on the Dashboard to unlock personalized analysis'}
          </p>
        </div>

        {rec?._savedFallback && (
          <div style={{ background: '#FFF7ED', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ fontSize: 13, color: '#92400E' }}>
              <strong>⚠ Showing saved record —</strong> Analysis below is from a saved snapshot. Open the calculator to see analysis on your current inputs.
            </div>
            <button onClick={() => {
              if (rec) {
                const email = localStorage.getItem('ts360_email') || 'default'
                const key = 'ts360_records_' + email
                const record = { id: Date.now(), savedAt: new Date().toLocaleString(), type: 'personal-return', ...rec, _unsaved: undefined }
                const existing = JSON.parse(localStorage.getItem(key) || '[]')
                localStorage.setItem(key, JSON.stringify([record, ...existing.slice(0, 19)]))
                localStorage.setItem('ts360_records', JSON.stringify([record, ...existing.slice(0, 19)]))
                window.location.reload()
              }
            }} style={{ flexShrink: 0, padding: '8px 16px', background: '#D97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Save Now</button>
          </div>
        )}
        {rec && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: N }}>Input Completeness</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: G }}>{score}%</span>
              </div>
              <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: score + '%', height: '100%', background: 'linear-gradient(90deg,#059669,#34d399)', borderRadius: 4, transition: 'width 0.5s' }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: SL, flexShrink: 0 }}>
              Fill more fields for better accuracy — missing: revenue, withholding, deductions
            </div>
            <button onClick={() => {
              if (rec) {
                writeTaxYear(rec.biz?.year || 2025)
                writePersonalContext(normalizeF1040(rec.f1040 || {}))
                writeStep1State({
                  entities: isPassthroughEntity(rec.biz?.entityType)
                    ? [{ type: rec.biz?.entityType, k1: rec.k1Income || 0 }]
                    : [],
                  k1Total: rec.k1Income || 0,
                  isCoopPatron: !!rec.f1040?.isCoopPatron,
                })
                nav('/tax-return')
              } else {
                nav('/dashboard')
              }
            }} style={{ padding: '7px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Update Data →</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', borderRadius: 12, padding: 6, border: '1px solid #E2E8F0' }}>
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i)} style={{ flex: 1, padding: '10px 12px', background: activeTab === i ? N : 'transparent', color: activeTab === i ? '#fff' : SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '28px' }}>
          {activeTab === 0 && <RiskScan rec={rec} />}
          {activeTab === 1 && <TaxOptimization rec={rec} />}
          {activeTab === 2 && <IRSCompliance rec={rec} />}
          {activeTab === 3 && <ReportsTab rec={rec} onReport={() => setShowReport(true)} onSimulator={() => setShowSimulator(true)} onNarrative={() => setShowNarrative(true)} />}
        </div>

        <div style={{ marginTop: 24, padding: '14px 20px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12, color: SL, textAlign: 'center', lineHeight: 1.6 }}>
          ⚠️ TaxStat360 provides tax estimates and planning insights for informational purposes only. Not professional tax advice. Consult a licensed CPA or tax attorney before making filing or financial decisions.
        </div>
      </div>
    </div>
  )
}