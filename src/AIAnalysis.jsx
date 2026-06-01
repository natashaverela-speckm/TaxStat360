import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { calcQBI, QBI_THRESHOLDS, getStdDed, getMarginalRate, calcFederalTax, SALT_CAPS, getTable } from './taxCalc'
import LockedFeature, { isPro, isEnterprise } from './LockedFeature'
import DismissibleNotice from './components/DismissibleNotice'
import { readPersonalContext, writePersonalContext, writeTaxYear, readTaxYear, readStep1State, writeStep1State, normalizeF1040 } from './utils/sessionState.js'
import { signOut } from './utils/signOut'
import { NAVY as N, BLUE as B, SLATE as SL, GREEN as G, RED as R, PURPLE as P, ORANGE as O } from './theme'
import { fmt, pct } from './utils/formatMoney'
import { isPassthroughEntity, isSCorpEntity, isCCorpEntity, isScheduleCType, ownPct, getEntityNetProfit } from './utils/entityPredicates'
import BrandLogo from './BrandLogo'


// ── Helpers ──────────────────────────────────────────────────────────────────

function getTotalW2(rec) {
  if (!rec) return 0
  const f = rec.f1040 || {}
  const additionalW2 = parseFloat(String(f.w2Income || '').replace(/,/g, '')) || 0
  const entities = Array.isArray(rec.entities) ? rec.entities : []
  const totalOfficerSalary = entities.reduce(
    (s, e) => s + (parseFloat(e?.pnl?.officerSalary) || 0),
    0,
  )
  return additionalW2 + totalOfficerSalary
}

function getEntityIncomeSplit(rec) {
  const entities = Array.isArray(rec?.entities) ? rec.entities : []
  const sCorp = entities
    .filter(e => !isScheduleCType(e?.type) && !isCCorpEntity(e?.type))
    .reduce((s, e) => s + Math.round(getEntityNetProfit(e) * ownPct(e?.own) / 100), 0)
  const scheduleC = entities
    .filter(e => isScheduleCType(e?.type))
    .reduce((s, e) => s + Math.round(getEntityNetProfit(e) * ownPct(e?.own) / 100), 0)
  return { sCorp, scheduleC }
}

function Logo() {
  return <BrandLogo size={34} />
}

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
    if (k1 !== 0 || parseFloat(f1040.w2Income) > 0 || getEntityNetProfit(ent) > 0) {
      return {
        type: 'personal-return',
        _unsaved: true,
        _source: 'live',
        k1Income: k1,
        entities: liveState.entities || [],
        biz: { entityType: ent.type || ent.name || 'Unknown', year: taxyear, ownershipPct: ent.own || '100', grossRevenue: String(getEntityNetProfit(ent) > 0 ? getEntityNetProfit(ent) : 0) },
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
    const entNetProfit   = getEntityNetProfit(ent)
    const entOfficerSal  = parseFloat(ent?.pnl?.officerSalary) || 0
    if (k1 !== 0 || parseFloat(f1040.w2Income) > 0 || entNetProfit > 0) {
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
          grossRevenue: String(parseFloat(ent?.pnl?.grossRevenue) || 0),
          operatingExpenses: String(parseFloat(ent?.pnl?.totalExpenses) || 0),
          officerSalary: String(entOfficerSal),
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
  const hasK1Data = Math.abs(parseFloat(rec?.k1Income || 0)) > 0
  if (parseFloat(b.grossRevenue) > 0 || hasK1Data) s += 15
  if (b.entityType) s += 10
  if (f.filingStatus) s += 10
  if (getTotalW2(rec) > 0) s += 10
  if (parseFloat(b.officerSalary) > 0) s += 5
  if (parseFloat(b.operatingExpenses) > 0 || hasK1Data) s += 5
  if (parseFloat(b.depreciation) > 0) s += 5
  if (parseFloat(f.estPaid) > 0) s += 10
  return Math.min(s, 98)
}

function missingFields(rec) {
  if (!rec) return ['all fields']
  const b = rec.biz || {}, f = rec.f1040 || {}
  const missing = []
  const hasK1Data = Math.abs(parseFloat(rec?.k1Income || 0)) > 0
  if (!(parseFloat(b.grossRevenue) > 0) && !hasK1Data) missing.push('revenue')
  if (!(getTotalW2(rec) > 0)) missing.push('W-2 / withholding')
  if (!(parseFloat(f.estPaid) > 0)) missing.push('est. payments')
  if (!(parseFloat(b.operatingExpenses) > 0) && !hasK1Data) missing.push('expenses')
  if (!(parseFloat(b.depreciation) > 0)) missing.push('depreciation')
  return missing
}

function NoData() {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', background: '#F8FAFC', borderRadius: 14, border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: N, marginBottom: 8 }}>No data yet</div>
      <div style={{ fontSize: 13, color: SL, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 20px' }}>
        Complete Step 1 (business info) and Step 2 (personal return) in the Tax Tracker to see your AI analysis.
      </div>
      <button onClick={() => window.location.href = '/calculate-tax'}
        style={{ padding: '10px 24px', background: B, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        Go to Calculator →
      </button>
    </div>
  )
}


// ── TAB 1: Risk Scan ─────────────────────────────────────────────────────────
function RiskScan({ rec }) {
  if (!rec) return <NoData />
  const b = rec.biz || {}, f = rec.f1040 || {}
  const revenue = parseFloat(b.grossRevenue) || 0
  const grossRevenueTax = (Array.isArray(rec.entities) ? rec.entities : []).reduce((s, e) => s + (parseFloat(e?.pnl?.grossRevenue) || 0), 0)
  const k1ForGuard = parseFloat(rec?.k1Income) || 0
  const w2ForGuard = parseFloat(rec?.f1040?.w2Income) || 0
  const hasIncome = grossRevenueTax > 0 || k1ForGuard > 0 || w2ForGuard > 0
  const officerSal = parseFloat(b.officerSalary) || 0
  const k1 = parseFloat(rec.k1Income) || 0
  const w2 = getTotalW2(rec)
  const estPay = parseFloat(f.estPaid) || 0
  const dep = parseFloat(b.depreciation || 0) || 0
  const rentalIncome = parseFloat(b.rentalIncome || 0) || parseFloat(f.rentalIncome || 0) || 0
  const isREP = !!(b.isREP || f.isREP || rec.isREP)

  const rentalExpenses = parseFloat(String(f.rentalExpenses || '').replace(/,/g, '')) || 0
  const capitalGainsIncome = (parseFloat(String(f.capitalGains || '').replace(/,/g, '')) || 0) + (parseFloat(String(f.ltCapGains || '').replace(/,/g, '')) || 0)
  const interestIncome = parseFloat(String(f.interest || '').replace(/,/g, '')) || 0
  const dividendIncome = parseFloat(String(f.dividends || '').replace(/,/g, '')) || 0
  const rentalNet = Math.max(0, rentalIncome - rentalExpenses)
  const otherInc = parseFloat(String(f.otherIncome || '').replace(/,/g, '')) || 0
  const totalIncome = k1 + w2 + capitalGainsIncome + interestIncome + dividendIncome + rentalNet + otherInc

  const year = parseInt(b.year) || 2025
  const filing = f.filingStatus || 'single'
  const _taxableBeforeQBI_rough = Math.max(0, totalIncome - getStdDed(year, filing))
  const { deduction: _qbiRough, aggregationApplied: _qbiAggregated, aggregationDisclosure: _qbiAggDisclosure } = isPassthroughEntity(b.entityType) && k1 > 0
    ? calcQBI(k1, _taxableBeforeQBI_rough, 0, { status: filing, taxYear: year, entityQbiData: rec.entities || [] })
    : { deduction: 0, aggregationApplied: false, aggregationDisclosure: null }
  const _taxable = Math.max(0, _taxableBeforeQBI_rough - _qbiRough)
  const roughTax = calcFederalTax(_taxable, year, filing)
  const _marginalRate = getMarginalRate(_taxable, year, filing)
  const today = new Date()
  const isPastYear = year < today.getFullYear()

  const qDeadlines = [
    {month:4,day:15,label:'April 15'},
    {month:6,day:15,label:'June 15'},
    {month:9,day:15,label:'September 15'},
    {month:1,day:15,label:'January 15',nextYear:true}
  ]
  const nextDeadline = qDeadlines.find(d => {
    const dl = new Date(today.getFullYear() + (d.nextYear ? 1 : 0), d.month-1, d.day)
    return dl > today
  }) || qDeadlines[0]
  const deadlines = { get month(){ return nextDeadline.label } }
  const month = 'month'

  const accurateQuarterly = (rec?.quarterly > 0) ? rec.quarterly : Math.round(roughTax / 4)

  const findings = []

  const sCorpEntities = (Array.isArray(rec.entities) ? rec.entities : []).filter(e => isSCorpEntity(e?.type))
  if (sCorpEntities.length > 0) {
    sCorpEntities.forEach(e => {
      const entityName = e.name || 'S-Corp'
      const eK1 = Math.round(getEntityNetProfit(e) * ownPct(e?.own) / 100)
      const eOfficerSal = parseFloat(e.pnl?.officerSalary) || 0
      if (eOfficerSal === 0 && eK1 > 20000) {
        findings.push({ level: 'high', icon: '🚨', title: `No Officer Salary — ${entityName} (Audit Risk)`,
          detail: `${entityName} shows ${fmt(eK1)} in K-1 income but no officer salary recorded. Tax practitioners and case law (Watson v. Commissioner, 668 F.3d 1008) flag zero salary as one of the top S-Corp audit triggers. The IRS applies a facts-and-circumstances test — there is no published safe harbor percentage.`,
          action: `Set ${entityName}'s officer salary on Step 1. A common practitioner starting point is 35–45% of total S-Corp compensation. The correct amount depends on your role, hours, industry, and comparable pay — discuss with your CPA.` })
      } else if (eOfficerSal > 0 && eK1 > 30000 && eOfficerSal < eK1 * 0.35) {
        findings.push({ level: 'medium', icon: '⚠️', title: `Officer Salary May Be Too Low — ${entityName}`,
          detail: `${entityName} shows ${fmt(eOfficerSal)} in officer compensation versus ${fmt(eK1)} in K-1 income (${((eOfficerSal/(eOfficerSal+eK1))*100).toFixed(1)}% of total S-Corp compensation). Tax practitioners commonly recommend a salary-to-total-compensation ratio of 35–45%, based on case law including Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012). The IRS applies a facts-and-circumstances test — there is no published safe harbor percentage.`,
          action: `Consider increasing ${entityName}'s officer salary to bring it within the 35–45% practitioner-recommended range. The correct amount depends on your role, hours, industry, and comparable pay — discuss with your CPA.` })
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
        action: 'Set a reasonable W-2 officer salary for the services you perform. There is no IRS safe-harbor percentage — reasonable compensation is a facts-and-circumstances determination — but a common practitioner starting point is 35–45% of total officer compensation (salary + distributions). The salary is deductible to the S-Corp and reduces self-employment tax exposure.' })
    } else if (ownerComp > 0 && k1 > 30000 && ownerComp < k1 * 0.35) {
      findings.push({ level: 'medium', icon: '⚠️', title: 'Officer Salary May Be Too Low',
        detail: `Reported owner compensation is ${fmt(ownerComp)} versus K-1 income of ${fmt(k1)} (${((ownerComp/(ownerComp+k1))*100).toFixed(1)}% of total compensation). Tax practitioners commonly recommend a salary-to-total-compensation ratio of 35–45%, based on case law including Watson v. Commissioner. The IRS applies a facts-and-circumstances test — there is no published safe harbor.`,
        action: `Consider increasing your salary to bring it within the 35–45% practitioner-recommended range. The correct amount depends on your role, hours, industry, and comparable pay — discuss with your CPA.` })
    } else if (ownerComp > 0) {
      findings.push({ level: 'good', icon: '✅', title: 'Officer Salary Recorded',
        detail: `Owner compensation of ${fmt(ownerComp)} is on file. Ensure payroll taxes (FICA) are being withheld and remitted quarterly.`,
        action: null })
    }
  }

  if (k1 > 5000 && estPay === 0) {
    findings.push({ level: 'high', icon: '🚨', title: 'No Estimated Tax Payments — Penalty Risk',
      detail: `With ${fmt(k1)} in K-1 income, you are likely required to make quarterly estimated payments. Failure to pay results in IRS underpayment penalties, charged at the federal short-term rate plus 3% (IRC §6621) and reset quarterly by the IRS (recently in the 6–8% range).`,
      action: `Estimated quarterly payment: approx. ${fmt(accurateQuarterly)}. Due dates: April 15, June 15, September 15, January 15.` })
  } else if (estPay > 0) {
    findings.push({ level: 'good', icon: '✅', title: 'Estimated Payments Recorded',
      detail: `${fmt(estPay)} in estimated payments on file. Next quarterly deadline: ${deadlines[month]}.`,
      action: null })
  }

  if (revenue > 50000 && dep === 0) {
    findings.push({ level: 'medium', icon: '⚠️', title: 'No Depreciation Recorded',
      detail: 'Businesses with equipment, vehicles, computers, or property can deduct depreciation — often reducing taxable income significantly.',
      action: `If you own any business assets, enter depreciation under Section 179 (full first-year deduction) or MACRS. A $20,000 asset could reduce your tax by ${fmt(Math.round(20000 * _marginalRate))}+ at your ${pct(_marginalRate * 100)} marginal rate.` })
  }

  if (k1 < 0 && isPassthroughEntity(b.entityType)) {
    const qbiLoss = Math.abs(k1)
    findings.push({
      level: 'info', icon: '📋', title: 'QBI Loss Generated — Track Your Carryforward',
      detail: `Your ${fmt(qbiLoss)} business loss generates a §199A QBI loss carryforward. When your business returns to profitability, this carryforward will reduce (or eliminate) your §199A deduction base for that year — potentially increasing your future tax liability if not planned for.`,
      action: `Next year, enter ${fmt(qbiLoss)} (as a positive number) in the "Prior Year QBI Loss Carryforward" field in Step 2. This ensures your future QBI deduction is correctly calculated per IRC §199A(c)(2). Also confirm with your CPA that your S Corp stock and debt basis is sufficient to deduct the loss in the current year (Form 7203).`,
    })
  }

  if (isPassthroughEntity(b.entityType) && k1 > 10000) {
    const _year = parseInt(b.year) || 2025
    const _filing = f.filingStatus || 'single'
    const _taxableBeforeQBI = Math.max(0, k1 + w2 - getStdDed(_year, _filing))
    const { deduction: qbi, limitApplied: _limitApplied, caps: _caps, aggregationApplied: _agg, aggregationDisclosure: _aggDisc } = calcQBI(k1, _taxableBeforeQBI, 0, { status: _filing, taxYear: _year, entityQbiData: rec.entities || [] })
    const _t = QBI_THRESHOLDS[_year] || QBI_THRESHOLDS[2025]
    const _qbiGap = _caps ? Math.max(0, Math.round(_caps.qbi - qbi)) : 0
    const _limitPrefix = _limitApplied === 'wage' ? `Your deduction is currently reduced by ${fmt(_qbiGap)} due to the §199A(b)(2) wage/UBIA limit — increasing W-2 wages paid by the entity (Box 17V) or qualified property (UBIA, Box 17W) could recapture it. `
                       : _limitApplied === 'income' ? `Your deduction is currently reduced by ${fmt(_qbiGap)} due to the overall taxable-income limit (20% of taxable income less net capital gain). `
                       : _limitApplied === 'min400' ? `Your deduction is set to the §199A(i) OBBBA minimum of ${fmt(qbi)} — without this floor, your regular calc would have been lower. `
                       : ''
    const _aggNote = _agg && _aggDisc ? ` ⚠ Aggregation assumed: ${_aggDisc}` : ''
    findings.push({ level: 'good', icon: '✅', title: `QBI Deduction Applied — ${fmt(qbi)} Deduction`,
      detail: `The Qualified Business Income deduction (IRC §199A) is applied to your K-1 income, reducing your taxable income by ${fmt(qbi)} — worth roughly ${fmt(Math.round(qbi * _marginalRate))} in federal tax at your ${(_marginalRate * 100).toFixed(0)}% marginal rate.`,
      action: `${_limitPrefix}QBI phases in W-2 wage / UBIA limits above ${fmt(_t.single)} (single) or ${fmt(_t.mfj)} (MFJ) in ${_year}.${_aggNote}` })
  }

  if (isCCorpEntity(b.entityType) && revenue > 0) {
    findings.push({ level: 'medium', icon: '💡', title: 'C-Corp Double Taxation',
      detail: 'C-Corp profits are taxed at 21% at the entity level. Dividends distributed to you are then taxed again at qualified dividend rates (0–20%) on your personal return.',
      action: 'Consider whether an S-Corp election would eliminate entity-level tax. An S-Corp with the same income passes profits directly to your personal return, avoiding the 21% corporate tax.' })
  }

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

  if (isPastYear) {
    findings.push({ level: 'info', icon: '📅', title: `${year} Quarterly Deadlines — All Past Due`,
      detail: `All four ${year} quarterly estimated tax deadlines have passed (Apr 15, Jun 15, Sep 15 ${year}, Jan 15 ${year + 1}). If you missed payments, the IRS underpayment penalty (IRC §6654) applies at the current federal short-term rate + 3%.`,
      action: estPay > 0
        ? `You recorded ${fmt(estPay)} in payments for ${year}. Compare this to your total tax liability to see if a penalty applies.`
        : `If you had quarterly payment obligations for ${year} and did not pay, file Form 2210 with your ${year} return to calculate the penalty.` })
  } else {
    findings.push({ level: 'info', icon: '📅', title: `Next Quarterly Deadline: ${deadlines[month]}`,
      detail: 'IRS Form 1040-ES quarterly estimated tax payment due date.',
      action: estPay > 0
        ? `Your recorded payments total ${fmt(estPay)}. Verify this covers 90% of current year tax or 100% of prior year tax to avoid penalties.`
        : 'If you have self-employment or business income, you likely owe quarterly payments. Underpayment incurs penalties at the current IRS rate.' })
  }

  const _suspendedLoss = Math.round(parseFloat(rec.totalSuspendedLoss || 0))
  if (_suspendedLoss > 0) {
    const _suspEntities = Array.isArray(rec.entityBasisResults)
      ? rec.entityBasisResults.filter(r => r.suspended > 0)
      : []
    findings.push({
      level: 'high',
      icon: '🚨',
      title: `S-Corp Loss Suspended — ${fmt(_suspendedLoss)} Not Deductible This Year (IRC §1366(d))`,
      detail: `Your S-Corp K-1 loss exceeds your combined stock and debt basis. Under IRC §1366(d)(1), the deductible loss is limited to adjusted stock basis plus indebtedness basis. The suspended ${fmt(_suspendedLoss)} is NOT included in your current-year tax calculation — it carries forward and becomes deductible when you restore sufficient basis.` +
        (_suspEntities.length > 0
          ? '\n\n' + _suspEntities.map(r =>
              `• ${r.name || r.type}: gross loss ${fmt(Math.abs(r.k1Gross))} | allowed ${fmt(Math.abs(r.k1Allowed))} | suspended ${fmt(r.suspended)}` +
              (r.totalBasis != null ? ` (basis: ${fmt(r.totalBasis)})` : '')
            ).join('\n')
          : ''),
      action: `To restore basis and unlock suspended losses: (1) Make additional capital contributions — increases stock basis per IRC §1367(a)(1)(A). (2) Loan money personally to the S-Corp — creates debt basis per §1367(b)(2)(A); must be a bona fide loan with documentation. (3) In a profitable future year suspended losses release automatically. File Form 7203 each year you have an S-Corp loss or distribution. Discuss basis restoration strategy with your CPA.`,
    })
  }

  if (isREP) {
    const _entitySalary = (Array.isArray(rec.entities) ? rec.entities : [])
      .reduce((s, e) => s + (parseFloat(e?.pnl?.officerSalary) || 0), 0)
    const _nonREW2 = Math.max(0, w2 - _entitySalary)
    if (_nonREW2 > 75000) {
      findings.push({
        level: 'high',
        icon: '🚨',
        title: `REP Status With ${fmt(_nonREW2)} in Outside Employment — High Audit Risk`,
        detail: `You have Real Estate Professional status selected alongside ${fmt(_nonREW2)} in W-2 income from non-real-estate employment. IRC §469(c)(7)(B) requires MORE THAN 50% of ALL personal services during the year to be in real property trades or businesses where you materially participate. With significant outside employment, you would need to document more real estate hours than all other work combined. The IRS actively targets this combination — it is one of the most frequently challenged positions in the pass-through entity / real estate space.`,
        action: `If you qualify: (1) Maintain contemporaneous daily time logs for ALL activities — not a year-end reconstruction. Logs must show date, property, activity, and hours. (2) You must exceed 750 hours in real property trades/businesses AND >50% of total working time must be in real estate. (3) A §469(c)(7)(A) grouping election can simplify material participation tracking across multiple properties. If you cannot document the 50% test, uncheck REP — rental losses become passive and offset only passive income. Discuss documentation requirements with your CPA.`,
      })
    }
  }

  const _totEntRev = (Array.isArray(rec.entities) ? rec.entities : [])
    .reduce((s, e) => s + (parseFloat(e?.pnl?.grossRevenue) || 0), 0)
  const _totEntExp = (Array.isArray(rec.entities) ? rec.entities : [])
    .reduce((s, e) => s + (parseFloat(e?.pnl?.totalExpenses) || 0), 0)
  if (_totEntRev > 10000 && _totEntExp > _totEntRev * 1.40) {
    const _ratio = Math.round((_totEntExp / _totEntRev) * 100)
    findings.push({
      level: 'high',
      icon: '🚨',
      title: `Deductions Exceed Revenue by ${_ratio - 100}% — Common IRS Scrutiny Pattern`,
      detail: `Total entity expenses (${fmt(_totEntExp)}) are ${_ratio}% of gross revenue (${fmt(_totEntRev)}). Deductions substantially exceeding revenue place the return in an IRS examination profile for S-Corps and Schedule C filers. The IRS DIF scoring system flags returns where expenses substantially exceed revenue in the taxpayer's industry. Every deduction must be substantiated with receipts, contracts, and documented business purpose if audited.`,
      action: `Before filing: (1) Verify all deductions are ordinary and necessary under IRC §162. (2) Ensure receipts and written business purpose exist for each expense category. (3) Review high-ratio categories (vehicle, travel, home office, meals) individually. (4) Confirm no personal expenses were included. (5) If deductions exceed revenue by >50%, discuss with your CPA before filing.`,
    })
  }

  const _mileageDeduction = parseFloat(b.mileageDeduction || b.vehicleMileage || 0) || 0
  const _vehicleExpenses  = parseFloat(b.vehicleExpenses || 0) || 0
  const _totRevForVehicle = _totEntRev > 0 ? _totEntRev : revenue
  if (_totRevForVehicle > 15000 && _mileageDeduction === 0 && _vehicleExpenses === 0 && dep === 0) {
    const _stdMileRate = getTable(year)?.mileageRate ?? (year >= 2025 ? 0.70 : 0.67)
    // AUDIT FIX (display): format to preserve the half-cent (72.5¢). The prior
    // toFixed(0) rounded 72.5 → 73. Strips a trailing .0 so whole rates stay clean.
    const _stdMileCents = (_stdMileRate * 100).toFixed(1).replace(/\.0$/, '')
    findings.push({
      level: 'info',
      icon: '🚗',
      title: 'Vehicle / Mileage Deduction — Review Before Filing',
      detail: `No vehicle or mileage deduction is recorded. If you drive for business purposes — client visits, supply runs, business banking, attending professional education, or travel between job sites — you may be entitled to a vehicle deduction. The IRS standard mileage rate for ${year} is ${_stdMileCents}¢ per business mile. Personal commuting (home ↔ regular office) is never deductible.`,
      action: `Two methods to choose from (must select one method per vehicle and generally stick with it):\n\n① Standard Mileage Rate — multiply business miles by the IRS rate (${_stdMileCents}¢/mile for ${year}). Simple. Requires a mileage log.\n\n② Actual Expense Method — deduct actual costs (gas, insurance, registration, repairs, depreciation) × business-use percentage. Can yield a larger deduction for high-cost or high-depreciation vehicles.\n\nRequirements: maintain a contemporaneous mileage log showing date, destination, business purpose, and miles for each trip. Apps like MileIQ, Everlance, or a simple spreadsheet work. The IRS requires contemporaneous records — reconstructed logs are regularly disallowed on audit.`,
    })
  }

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
        <p style={{ fontSize: 13, color: SL, margin: '0 0 8px' }}>Based on your saved record. These findings are specific to your situation.</p>
        {/* TC-04 FIX: Explicitly frame findings as patterns of scrutiny, not audit probability.
            The IRS uses proprietary DIF scoring and undisclosed methods to select returns —
            no third-party tool can predict audit selection. */}
        <p style={{ fontSize: 11, color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
          These indicators reflect common patterns associated with IRS scrutiny — they are not a prediction of audit selection or probability. The IRS uses proprietary scoring and methods not publicly disclosed. Consult a licensed tax professional before making any filing decisions.
        </p>
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
  const totalOfficerSalary = Math.max(
    sCorpEntities.reduce((s, e) => s + (parseFloat(e?.pnl?.officerSalary) || 0), 0),
    parseFloat(b.officerSalary) || 0
  )
  const sCorpK1 = sCorpEntities.reduce((s, e) => s + Math.max(0, getEntityNetProfit(e)), 0)
  const k1 = parseFloat(rec.k1Income) || 0
  const w2 = getTotalW2(rec)
  const estPay = parseFloat(f.estPaid) || 0
  const year = parseInt(b.year) || 2025
  const isPassthrough = isPassthroughEntity(b.entityType)
  const isSCorpOwner = sCorpEntities.length > 0 || isSCorpEntity(b.entityType)
  const filing = f.filingStatus || 'single'
  const stdDed = getStdDed(year, filing)

  const entityTypes = Array.isArray(rec?.entities) && rec.entities.length > 0
    ? [...new Set(rec.entities.map(e => e?.type).filter(Boolean))]
    : [b.entityType || 'business']
  const entitySubtitle = entityTypes.length > 1 ? entityTypes.join(' + ') : entityTypes[0] || 'business'

  const capitalGainsIncome = (parseFloat(String(f.capitalGains || '').replace(/,/g, '')) || 0) + (parseFloat(String(f.ltCapGains || '').replace(/,/g, '')) || 0)
  const interestIncome = parseFloat(String(f.interest || '').replace(/,/g, '')) || 0
  const dividendIncome = parseFloat(String(f.dividends || '').replace(/,/g, '')) || 0
  const rentalNet = Math.max(0, (parseFloat(String(f.rentalIncome || '').replace(/,/g, '')) || parseFloat(String(b.rentalIncome || '').replace(/,/g, '')) || 0) - (parseFloat(String(f.rentalExpenses || '').replace(/,/g, '')) || 0))
  const otherInc = parseFloat(String(f.otherIncome || '').replace(/,/g, '')) || 0
  const agi = Math.max(0, k1 + w2 + capitalGainsIncome + interestIncome + dividendIncome + rentalNet + otherInc)

  const _taxableBeforeQBI_opt = Math.max(0, agi - stdDed)
  const { deduction: _qbiOpt } = isPassthroughEntity(b.entityType) && k1 > 0
    ? calcQBI(k1, _taxableBeforeQBI_opt, 0, { status: filing, taxYear: year, entityQbiData: rec.entities || [] })
    : { deduction: 0 }
  const taxable = Math.max(0, _taxableBeforeQBI_opt - _qbiOpt)
  const marginalRate = getMarginalRate(taxable, year, filing)

  const grossRevenueTax = (Array.isArray(rec.entities) ? rec.entities : []).reduce((s, e) => s + (parseFloat(e?.pnl?.grossRevenue) || 0), 0)
  const k1ForGuard = parseFloat(rec?.k1Income) || 0
  const w2ForGuard = parseFloat(rec?.f1040?.w2Income) || 0
  const hasIncome = grossRevenueTax > 0 || k1ForGuard > 0 || w2ForGuard > 0
  if (!hasIncome) return (
    <div style={{ textAlign: 'center', padding: '48px 24px', background: '#F8FAFC', borderRadius: 14, border: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: N, marginBottom: 8 }}>Enter your revenue to see your savings</div>
      <div style={{ fontSize: 13, color: SL, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 20px' }}>Tax-saving estimates are calibrated to your actual income and tax bracket. Add your business revenue in Step 1 and your personal info in Step 2 to see opportunities specific to your situation.</div>
      <button onClick={() => window.location.href = '/calculate-tax'} style={{ padding: '10px 24px', background: B, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Go to Calculator →</button>
    </div>
  )

  const opportunities = []

  const sepBase = isSCorpOwner ? totalOfficerSalary : k1
  const sepRate = isSCorpOwner ? 0.25 : 0.20
  const maxSEP = Math.min(70000, Math.round(sepBase * sepRate))

  const solo401kDeferral = getTable(year)?.retirement?.solo401kDeferral ?? 23500
  const maxSolo401kEmployer = Math.round(sepBase * (isSCorpOwner ? 0.25 : 0.20))
  const maxSolo401k = Math.min(70000, maxSolo401kEmployer + solo401kDeferral)

  if (isPassthrough) {
    if (isSCorpOwner && totalOfficerSalary === 0) {
      opportunities.push({
        icon: '🏦', title: 'SEP-IRA / Solo 401(k) — Set Officer Salary First',
        priority: 'high', saving: null,
        detail: `S-Corp owners can only contribute to a SEP-IRA or Solo 401(k) based on their officer W-2 salary — not K-1 distributions (IRC §402(h); IRS Pub. 560). With $0 officer salary recorded, your current allowable contribution is $0.`,
        howTo: `Set a reasonable officer salary on Step 1 first. Once salary is recorded, you can contribute up to 25% of that salary (max $70,000 in ${year}). Example: a ${fmt(Math.round(k1 * 0.40))} salary would allow a ${fmt(Math.round(Math.min(70000, k1 * 0.40 * 0.25)))} SEP-IRA contribution — saving approx. ${fmt(Math.round(Math.min(70000, k1 * 0.40 * 0.25) * marginalRate))} in federal tax.`
      })
    } else if (maxSEP > 0) {
      const sepTaxSaved = Math.round(maxSEP * marginalRate)
      const sepDetail = isSCorpOwner
        ? `SEP-IRA contributions are employer-only, based on your W-2 officer salary (not K-1 distributions — IRC §402(h)). At ${fmt(totalOfficerSalary)} officer salary, the max SEP-IRA contribution is 25% × ${fmt(totalOfficerSalary)} = ${fmt(maxSEP)} (max $70,000). The S-Corp makes the contribution at the entity level, deductible on Form 1120-S.`
        : `You can contribute up to ${fmt(maxSEP)} (~20% of net self-employment income after SE tax deduction, max $70,000) to a SEP-IRA. This reduces your AGI dollar-for-dollar.`

      const sepDeadline = isSCorpOwner
        ? 'your S-Corp\'s tax return due date including extensions — typically September 15 for S-Corporations (Form 1120-S). Note: October 15 (the individual return extension) does NOT extend the S-Corp\'s SEP-IRA funding deadline.'
        : 'your individual return due date including extensions — typically October 15.'

      opportunities.push({
        icon: '🏦', title: 'SEP-IRA', priority: 'high',
        saving: sepTaxSaved,
        detail: sepDetail,
        howTo: `At your marginal rate of ${pct(marginalRate * 100)}, a max contribution saves approx. ${fmt(sepTaxSaved)} in federal tax. Open at any major brokerage (Fidelity, Schwab, Vanguard). Deadline: ${sepDeadline}`
      })

      if (isSCorpOwner) {
        const solo401kTaxSaved = Math.round(maxSolo401k * marginalRate)
        opportunities.push({
          icon: '💰', title: 'Solo 401(k) — Higher Contribution than SEP-IRA',
          priority: 'high',
          saving: solo401kTaxSaved,
          detail: `Unlike a SEP-IRA (employer contributions only), a Solo 401(k) has two components that stack:\n• Employee elective deferral: up to ${fmt(solo401kDeferral)} (${year} limit, pre-tax or Roth — IRC §401(k))\n• Employer profit-sharing: 25% of your officer W-2 salary = ${fmt(maxSolo401kEmployer)}\n• Combined total: ${fmt(maxSolo401k)} — vs. ${fmt(maxSEP)} under a SEP-IRA alone.\nBoth contributions flow from your S-Corp but are made separately.`,
          howTo: `At your ${pct(marginalRate * 100)} marginal rate, the max Solo 401(k) saves approx. ${fmt(solo401kTaxSaved)} — roughly ${fmt(solo401kTaxSaved - Math.round(maxSEP * marginalRate))} more than a SEP-IRA alone. Requires a plan document established before December 31 of the plan year. Employee deferral comes from your W-2 payroll (must be elected before December 31); employer contribution due by September 15 (S-Corp extension deadline). Available at Fidelity, Schwab, or Vanguard.`
        })
      }
    }
  }

  if (revenue > 30000 && dep === 0) {
    opportunities.push({
      icon: '🏗️', title: 'Section 179 Equipment Deduction', priority: 'medium',
      saving: null,
      detail: 'Section 179 lets you deduct the full cost of qualifying equipment, vehicles, and business property in the year of purchase (up to $2.5M in 2025 under the One Big Beautiful Bill Act; phase-out begins above $4M of qualifying purchases). Bonus depreciation is 100% for property placed in service after January 19, 2025.',
      howTo: 'If you purchased any computers, phones, furniture, vehicles, or equipment for the business this year — even partially — enter the cost under Depreciation. The deduction can be substantial.'
    })
  }

  const homeOfficeHowTo = isSCorpOwner
    ? 'The space must be used exclusively for business. Calculate your home office percentage (office sq ft ÷ total home sq ft) and apply to rent/mortgage interest, utilities, and insurance. For S-Corp owners, the correct method is an accountable plan reimbursement — the S-Corp pays you back for the business-use portion of home expenses, deducts the payment as a business expense, and the reimbursement is excluded from your W-2 income (IRC §62(a)(2)(A); Treas. Reg. §1.62-2). Do NOT use Schedule C — that form is for sole proprietors only. S-Corp shareholders who are also W-2 employees cannot deduct unreimbursed employee business expenses under current law (TCJA §67(g)).'
    : /partnership|mmllc/i.test(b.entityType || '')
    ? 'The space must be used exclusively for business. Calculate your home office percentage (office sq ft ÷ total home sq ft) and apply to rent/mortgage interest, utilities, and insurance. Partners may deduct unreimbursed partnership expenses (UPE) directly on Schedule E Part II, or the partnership can reimburse through an accountable plan — which is deductible at the entity level and excluded from the partner\'s income.'
    : 'The space must be used exclusively for business. Calculate your home office percentage (office sq ft ÷ total home sq ft) and apply to rent/mortgage interest, utilities, and insurance. Claim on Schedule C using Form 8829 (actual expense method) or the simplified method ($5/sq ft, up to 300 sq ft).'

  opportunities.push({
    icon: '🏠', title: 'Home Office Deduction', priority: 'medium',
    saving: null,
    detail: 'If you use a portion of your home exclusively and regularly for business, you can deduct either $5 per sq ft (simplified, up to 300 sq ft = $1,500 max) or actual expenses proportional to office size.',
    howTo: homeOfficeHowTo
  })

  if (sCorpEntities.length > 0 && totalOfficerSalary > 0 && sCorpK1 > 50000) {
    const seTaxSaved = Math.round((sCorpK1 - totalOfficerSalary) * 0.0765 * 2)
    if (seTaxSaved > 1000) {
      opportunities.push({
        icon: '💼', title: 'S-Corp Salary vs. Distribution Split', priority: 'high',
        saving: seTaxSaved,
        detail: `Your S-Corp structure saves FICA taxes on ${fmt(sCorpK1 - totalOfficerSalary)} in K-1 distributions above your officer salary. The FICA rate is 15.3% on wages up to the Social Security wage base ($176,100 for 2025) and drops to 2.9% Medicare-only above that threshold — K-1 distributions avoid both components entirely, regardless of where you fall relative to the wage base.`,
        howTo: `Estimated FICA savings from K-1 vs. W-2 structure: ~${fmt(seTaxSaved)} (at the 15.3% combined rate; may be lower if your combined officer salary already exceeds the $176,100 SS wage base, since the SS portion no longer applies above that threshold). Maintain documentation showing salary is reasonable for your role. Avoid setting salary unreasonably low — there is no IRS safe-harbor percentage, but practitioners commonly target 35–45% of total officer compensation (salary + distributions) and document that it is reasonable for the role.`
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
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Specific strategies based on your {entitySubtitle} structure and {year} tax year. Estimated savings at your {pct(marginalRate * 100)} marginal rate.</p>
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
                <p style={{ fontSize: 13, color: SL, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{o.detail}</p>
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
        Estimates based on inputs entered. Consult a licensed tax professional before implementing any strategy.
      </div>
    </div>
  )
}


// ── TAB 3: IRS Schedule Map ──────────────────────────────────────────────────
function IRSCompliance({ rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const k1 = parseFloat(rec?.k1Income) || 0
  const w2 = getTotalW2(rec)
  const entity = b.entityType || 'Unknown'
  const year = parseInt(b.year) || 2025
  const today = new Date()

  const { sCorp: sCorpK1Amount, scheduleC: scheduleCAmount } = getEntityIncomeSplit(rec)
  const hasScheduleC = scheduleCAmount !== 0 || isScheduleCType(entity)
  const hasSCorpK1 = sCorpK1Amount !== 0 || isSCorpEntity(entity)

  const schedules = []

  schedules.push({ form: 'Form 1040', title: 'U.S. Individual Income Tax Return', status: 'required', detail: 'Your main personal tax return. All income sources flow here — W-2, K-1, Schedule E, Schedule C.', deadline: `April 15, ${year + 1}` })

  if (isSCorpEntity(entity) || hasSCorpK1) {
    schedules.push({ form: 'Form 1120-S', title: 'S-Corporation Tax Return', status: 'required', detail: `Your S-Corp files its own informational return showing income, deductions, and K-1 allocations to shareholders.`, deadline: `March 15, ${year + 1}` })
    schedules.push({ form: 'Schedule K-1 (1120-S)', title: 'Shareholder Share of Income', status: 'required', detail: `Your ${fmt(sCorpK1Amount || k1)} share of S-Corp ordinary business income (Box 1) flows to your personal return via this form. Your K-1 figures are reported on Schedule E, Part II — keep your K-1 as supporting documentation. The IRS does not require you to physically attach it to your 1040.`, deadline: `Issued with Form 1120-S` })
    schedules.push({ form: 'Schedule E (Part II)', title: 'Supplemental Income — S-Corp K-1', status: 'required', detail: 'Reports your K-1 income on your personal return. Passive vs. active participation rules apply.', deadline: 'Filed with Form 1040' })
  }
  if (/partnership|multi.?member|mmllc/i.test(entity || '')) {
    schedules.push({ form: 'Form 1065', title: 'Partnership Return', status: 'required', detail: 'Partnership or multi-member LLC files this informational return. Issues K-1s to each partner/member.', deadline: `March 15, ${year + 1}` })
    schedules.push({ form: 'Schedule K-1 (1065)', title: 'Partner Share of Income', status: 'required', detail: 'Your distributive share of partnership income, deductions, and credits. Reported on Schedule E, Part II — keep your K-1 as supporting documentation; the IRS does not require attaching it to your 1040.', deadline: 'Issued with Form 1065' })
  }

  if (isScheduleCType(entity) || hasScheduleC) {
    schedules.push({ form: 'Schedule C', title: 'Profit or Loss from Business (Sole Proprietor)', status: 'required', detail: `Reports your sole proprietor / SMLLC net profit of ${fmt(scheduleCAmount || k1)} directly on Form 1040. Revenue, expenses, and net profit are calculated here — the result flows to Form 1040 Line 8 via Schedule 1.`, deadline: 'Filed with Form 1040' })
    schedules.push({ form: 'Schedule SE', title: 'Self-Employment Tax', status: 'required', detail: 'Calculates 15.3% SE tax on net self-employment income from Schedule C (applied to 92.35% of net profit). Half of the SE tax is deductible as an above-the-line deduction on Schedule 1, Line 15.', deadline: 'Filed with Form 1040' })
  }

  if (isPassthroughEntity(entity) && k1 > 0) {
    const _filing = f.filingStatus || 'single'
    const _taxableBeforeQBI = Math.max(0, k1 + w2 - getStdDed(year, _filing))
    const { deduction: _qbi, limitApplied: _limitApplied, caps: _caps, aggregationApplied: _agg } = calcQBI(k1, _taxableBeforeQBI, 0, { status: _filing, taxYear: year, entityQbiData: rec.entities || [] })
    const _qbiGap = _caps ? Math.max(0, Math.round(_caps.qbi - _qbi)) : 0
    const _qbiThresholds = QBI_THRESHOLDS[year] || QBI_THRESHOLDS[2025]
    const _qbiThreshold = _qbiThresholds[_filing] || _qbiThresholds.single
    const _isCoopPatron = !!f.isCoopPatron
    const _useForm8995A = _taxableBeforeQBI > _qbiThreshold || _isCoopPatron
    const _entitiesArr = Array.isArray(rec.entities) ? rec.entities : []
    const _hasSSTB = _entitiesArr.some(e => !!(e && (e.box17V_sstb || e.sstb)))
    const _currentYearQbiLoss = _entitiesArr.some(e => {
      const np = parseFloat(e?.netProfit ?? e?.pnl?.netProfit ?? 0) || 0
      const own = ownPct(e?.own)
      return (np * own / 100) < 0
    }) || k1 < 0
    const _priorQbiLoss = (parseFloat(f.priorQBILossCO || f.priorYearLosses || 0) || 0) > 0
    const _formNum = _useForm8995A ? 'Form 8995-A' : 'Form 8995'
    const _formTitle = _useForm8995A ? 'QBI Deduction — Detailed Computation (IRC §199A)' : 'QBI Deduction (IRC §199A)'
    const _sstbNote = (_useForm8995A && _hasSSTB && _taxableBeforeQBI > _qbiThreshold) ? ' SSTB activity detected at or above the income threshold — see Form 8995-A Schedule A for the §199A(d)(3) phase-in / phase-out of the QBI deduction for specified service trades or businesses.' : ''
    const _lossNote = (_useForm8995A && (_currentYearQbiLoss || _priorQbiLoss)) ? ' QBI loss detected — see Form 8995-A Schedule C for loss netting across qualified businesses and the §199A(c)(2) carryforward of negative QBI to subsequent years.' : ''
    const _coopNote = (_isCoopPatron && _useForm8995A) ? ' Co-op patron status flagged — see Form 8995-A Schedule D for the §199A(g)(2) patron reduction (lesser of 9% of QBI allocable to qualified payments or 50% of allocable W-2 wages); not currently calculated by this tool.' : ''
    const _aggNote = _agg ? ' ⚠ QBI aggregation across entities assumed (Reg. §1.199A-4 election). Confirm formal election on this form.' : ''
    schedules.push({ form: _formNum, title: _formTitle, status: 'required', detail: `Your Qualified Business Income deduction of ~${fmt(_qbi)}${_limitApplied === 'wage' ? ` (limited by W-2 wage/UBIA cap; reducing your deduction by ${fmt(_qbiGap)})` : _limitApplied === 'income' ? ` (capped by 20% of taxable income; reducing your deduction by ${fmt(_qbiGap)})` : _limitApplied === 'min400' ? ` (set to §199A(i) OBBBA minimum of ${fmt(_qbi)})` : ''} is reported here. Reduces taxable income without reducing AGI.${_sstbNote}${_lossNote}${_coopNote}${_aggNote}`, deadline: 'Filed with Form 1040' })
  }

  if (w2 > 0) {
    schedules.push({ form: 'W-2 / Form W-2', title: 'Wages and Withholding', status: 'required', detail: `Your ${fmt(w2)} in W-2 wages are reported on Line 1a of Form 1040. Federal withholding reduces your tax liability.`, deadline: 'Issued by employer Jan 31' })
  }

  if (parseFloat(f.estPaid) > 0) {
    schedules.push({ form: 'Form 1040-ES', title: 'Quarterly Estimated Tax Payments', status: 'active', detail: `${fmt(parseFloat(f.estPaid))} in estimated payments recorded. These reduce your balance due at filing.`, deadline: 'Q1: Apr 15 | Q2: Jun 15 | Q3: Sep 15 | Q4: Jan 15' })
  }

  const schedule1Detail = hasScheduleC
    ? `Schedule 1 consolidates your Schedule C net profit (${fmt(scheduleCAmount || k1)}), above-the-line deductions (½ SE tax, retirement contributions, self-employed health insurance), and any other adjustments. Part I additional income flows to Form 1040 Line 8; Part II deductions flow to Line 10.`
    : 'Schedule 1 consolidates above-the-line deductions (retirement plan contributions, self-employed health insurance, student loan interest) and other income adjustments. Part II deductions flow to Form 1040 Line 10. Note: S-Corp K-1 income flows to Schedule E Part II, not Schedule 1.'
  schedules.push({ form: 'Schedule 1', title: 'Additional Income and Adjustments', status: 'required', detail: schedule1Detail, deadline: 'Filed with Form 1040' })

  schedules.push({
    form: 'Schedule 2',
    title: 'Additional Taxes',
    status: 'required',
    detail: isSCorpEntity(entity)
      ? 'Carries Additional Medicare Tax (0.9%, Form 8959) and Net Investment Income Tax (3.8%, Form 8960) to Form 1040 Line 17. Note: SE tax does NOT apply to S-Corp K-1 income — IRC §1402(a)(2).'
      : 'Carries SE tax, Additional Medicare Tax, and Net Investment Income Tax to Form 1040 Line 17.',
    deadline: 'Filed with Form 1040',
  })

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

  const _niitInterest = parseFloat(String(f.interest || '').replace(/,/g, '')) || 0
  const _niitDividends = parseFloat(String(f.dividends || '').replace(/,/g, '')) || 0
  const _niitCapGains = _stGain + _ltGain
  const _niitRentalNet = _isREP ? 0 : Math.max(0, _rentalIncomeSch - (parseFloat(String(f.rentalExpenses || '').replace(/,/g, '')) || 0))
  const _netInvestmentIncome = _niitInterest + _niitDividends + _niitCapGains + _niitRentalNet
  const _niitMagi = k1 + w2 + _netInvestmentIncome
  const _niitThreshold = (f.filingStatus === 'mfj' || f.filingStatus === 'qss') ? 250000 : (f.filingStatus === 'mfs' ? 125000 : 200000)
  if (_niitMagi > _niitThreshold && _netInvestmentIncome > 0) {
    schedules.push({ form: 'Form 8960', title: 'Net Investment Income Tax (3.8%)', status: 'required', detail: `MAGI of ${fmt(_niitMagi)} exceeds the ${fmt(_niitThreshold)} NIIT threshold. Applies 3.8% to the lesser of net investment income (${fmt(_netInvestmentIncome)}) or MAGI above the threshold. Note: active K-1 and W-2 income are excluded from net investment income per IRC §1411(c)(1)(A)(ii).`, deadline: 'Filed with Form 1040' })
  }

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
    { date: `Jun 15, ${year + 1}`, event: 'Q2 estimated tax payment due' },
    { date: `Sep 15, ${year + 1}`, event: 'Q3 estimated tax payment due' },
    { date: `Jan 15, ${year + 2}`, event: 'Q4 estimated tax payment due' },
  ].map(d => ({
    ...d,
    isPast: new Date(d.date) < today,
    daysAway: Math.ceil((new Date(d.date) - today) / 86400000),
  }))

  const entityArticle = /^[aeiou]/i.test(entity) || /^s[\s-]/i.test(entity) ? 'an' : 'a'

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Your IRS Filing Map</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Forms and schedules required for {entityArticle} {entity} filing {year} taxes. Based on your saved record.</p>
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
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', opacity: d.isPast ? 0.4 : 1 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', minWidth: 110, flexShrink: 0, textDecoration: d.isPast ? 'line-through' : 'none' }}>
                {d.date}{d.isPast ? ' (PAST)' : ''}
              </span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', textDecoration: d.isPast ? 'line-through' : 'none' }}>
                {d.event}{!d.isPast && d.daysAway >= 0 && d.daysAway <= 60 ? ` — ${d.daysAway} days` : ''}
              </span>
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
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>LAST SAVED CALCULATION{rec.savedAt ? ` — ${rec.savedAt}` : ''}</div>
            {[
              ['Entity Type', b.entityType],['Tax Year', String(b.year || '')],
              ['Gross Revenue', b.grossRevenue ? '$' + parseFloat(b.grossRevenue).toLocaleString() : ''],
              ['Total Expenses', b.operatingExpenses ? '$' + parseFloat(b.operatingExpenses).toLocaleString() : ''],
              ['Officer Salary', b.officerSalary ? '$' + parseFloat(b.officerSalary).toLocaleString() : ''],
              ['K-1 Ordinary Income (Box 1)', rec.k1Income ? '$' + parseFloat(rec.k1Income).toLocaleString() : '$0'],
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
            ['Form 8995', 'QBI deduction — up to 20% of qualified business income. Full deduction below $197,300 single / $394,600 MFJ (2025); W-2 wage / UBIA limit applies above (IRC §199A(b)(2)).'],
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
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>For planning purposes only. Consult a licensed tax professional before filing.</div>
      </div>
    </Modal>
  )
}

function BriefingModal({ onClose, rec }) {
  const [copied, setCopied] = useState(false)
  if (!rec) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: '28px 32px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 4 }}>CPA PLANNING BRIEFING</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 12px' }}>No calculation found</h2>
          <p style={{ fontSize: 13, color: SL, lineHeight: 1.6 }}>Enter your business and personal figures in the Tax Tracker first, then come back to generate your CPA briefing.</p>
          <button onClick={onClose} style={{ marginTop: 16, padding: '10px 20px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Close</button>
        </div>
      </Modal>
    )
  }

  const b = rec.biz || {}, f = rec.f1040 || {}
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const year = parseInt(b.year) || 2025
  const filing = f.filingStatus || 'single'
  const filingLabel = ({ single: 'Single', mfj: 'Married Filing Jointly', mfs: 'Married Filing Separately', hoh: 'Head of Household', qss: 'Qualifying Surviving Spouse' })[filing] || filing
  const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0

  // Inputs (mirror the Risk Scan tab's derivation so figures match what the user already sees)
  const k1 = num(rec.k1Income)
  const w2 = getTotalW2(rec)
  const officerSal = num(b.officerSalary)
  const estPay = num(f.estPaid)
  const rentalIncome = num(b.rentalIncome) || num(f.rentalIncome)
  const rentalExpenses = num(f.rentalExpenses)
  const rentalNet = Math.max(0, rentalIncome - rentalExpenses)
  const capitalGains = num(f.capitalGains) + num(f.ltCapGains)
  const interest = num(f.interest)
  const dividends = num(f.dividends)
  const otherInc = num(f.otherIncome)
  const totalIncome = k1 + w2 + capitalGains + interest + dividends + rentalNet + otherInc

  const stdDed = getStdDed(year, filing)
  const taxableBeforeQBI = Math.max(0, totalIncome - stdDed)
  const qbi = (isPassthroughEntity(b.entityType) && k1 > 0)
    ? ((calcQBI(k1, taxableBeforeQBI, 0, { status: filing, taxYear: year, entityQbiData: rec.entities || [] }) || {}).deduction || 0)
    : 0
  const taxable = Math.max(0, taxableBeforeQBI - qbi)
  const fedTax = calcFederalTax(taxable, year, filing)
  const marginalRate = getMarginalRate(taxable, year, filing)
  // Self-employment tax estimate — only sole props / active partnerships are SE-subject (IRC §1401).
  const seSubject = isScheduleCType(b.entityType) || /partner/i.test(b.entityType || '')
  const ssWageBase = (getTable(year) || {}).ssWageBase || 176100
  const seBase = seSubject ? Math.max(0, k1) * 0.9235 : 0
  const seTax = seSubject ? Math.round(Math.min(seBase, ssWageBase) * 0.124 + seBase * 0.029) : 0
  const totalFedTax = fedTax + seTax
  const effectiveRate = totalIncome > 0 ? totalFedTax / totalIncome : 0
  const quarterly = (rec.quarterly > 0) ? rec.quarterly : Math.round(totalFedTax / 4)

  const entities = (Array.isArray(rec.entities) ? rec.entities : []).filter(Boolean)

  // Data-driven planning discussion points
  const points = []
  if (isSCorpEntity(b.entityType) && officerSal > 0 && k1 > 0) {
    const ratio = officerSal / (officerSal + k1)
    points.push(`Officer compensation is ${fmt(officerSal)} against ${fmt(k1)} of K-1 distributions — a ${pct(ratio * 100)} salary-to-total-compensation ratio. Practitioners commonly target 35–45% (Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012)); the IRS applies a facts-and-circumstances test with no published safe harbor. ${ratio < 0.35 ? 'Review whether the salary adequately reflects the services rendered.' : 'Document the basis for the salary level — role, hours, and comparable pay.'}`)
  } else if (isSCorpEntity(b.entityType) && officerSal === 0 && k1 > 0) {
    points.push(`This S-Corp shows ${fmt(k1)} of K-1 income but no officer W-2 salary on file. Shareholder-employees performing services must take reasonable W-2 compensation (Rev. Rul. 74-44) — determine an appropriate salary and ensure FICA is withheld.`)
  }
  if (isScheduleCType(b.entityType) || /partner/i.test(b.entityType || '')) {
    points.push(`Net earnings from this ${isScheduleCType(b.entityType) ? 'sole proprietorship / SMLLC' : 'partnership / LLC'} are subject to self-employment tax (IRC §1401) in addition to income tax. One-half of SE tax is deductible above the line (§164(f)).`)
  }
  if (qbi > 0) {
    points.push(`A §199A QBI deduction of approximately ${fmt(qbi)} is reflected — worth roughly ${fmt(Math.round(qbi * marginalRate))} at the ${pct(marginalRate * 100)} marginal rate. Above the ${year} income threshold the W-2 wage / UBIA limit (§199A(b)(2)) can reduce it; confirm entity W-2 wages and qualified property.`)
  } else if (isPassthroughEntity(b.entityType) && k1 > 0) {
    points.push(`Review §199A QBI eligibility for the pass-through income, including SSTB status and the W-2 wage / UBIA limitations that apply above the ${year} income threshold.`)
  }
  if (totalIncome > 0) {
    points.push(estPay > 0
      ? `${fmt(estPay)} in estimated payments is on file. Confirm the remaining quarterly installments meet a §6654 safe harbor (90% of current-year tax, or 100%/110% of prior-year tax).`
      : `No estimated payments are on file. With ${fmt(totalIncome)} of income, quarterly estimates are likely required — approximately ${fmt(quarterly)} per quarter (due Apr 15, Jun 15, Sep 15, Jan 15) — to avoid §6654 underpayment penalties.`)
  }
  const gather = []
  if (!(num(b.depreciation) > 0)) gather.push('depreciation / §179 on business assets')
  if (estPay === 0) gather.push('estimated payments made year-to-date')
  if (gather.length) points.push(`To complete the picture before filing, gather: ${gather.join('; ')}.`)
  if (points.length === 0) points.push('No significant planning flags surfaced from the data entered. Review the figures below with your CPA to confirm completeness.')

  const sign = (v) => (v < 0 ? '−' + fmt(Math.abs(v)) : fmt(v))
  const incomeRows = [
    ['Gross revenue', num(b.grossRevenue)],
    ['Total expenses', num(b.operatingExpenses)],
    ['Officer W-2 salary', officerSal],
    ['K-1 ordinary income (Box 1)', k1],
    ['W-2 wages', w2],
    ['Rental net', rentalNet],
    ['Interest & dividends', interest + dividends],
  ].filter(([, v]) => v && v !== 0)

  const plain = [
    'CPA PLANNING BRIEFING — TaxStat360',
    `Prepared ${now} · Tax year ${year} · ${filingLabel}`,
    'Planning summary for discussion — not a tax return, not for filing.',
    '',
    'ENTITY STRUCTURE',
    ...(entities.length
      ? entities.map(e => `  - ${e.type || 'Entity'} (${ownPct(e.own)}%): net ${fmt(getEntityNetProfit(e))}${num(e?.pnl?.officerSalary) > 0 ? `, officer salary ${fmt(num(e.pnl.officerSalary))}` : ''}`)
      : [`  - ${b.entityType || 'Unknown'} (${b.ownershipPct || '100'}%)`]),
    '',
    'INCOME & BUSINESS SUMMARY',
    ...incomeRows.map(([l, v]) => `  ${l}: ${fmt(v)}`),
    '',
    'ESTIMATED FEDERAL POSITION (planning estimate)',
    `  Total income (est.): ${fmt(totalIncome)}`,
    `  Standard deduction (${filingLabel}): -${fmt(stdDed)}`,
    ...(qbi > 0 ? [`  §199A QBI deduction (est.): -${fmt(qbi)}`] : []),
    `  Taxable income (est.): ${fmt(taxable)}`,
    `  Estimated federal income tax: ${fmt(fedTax)}`,
    ...(seTax > 0 ? [`  Estimated self-employment tax: ${fmt(seTax)}`, `  Estimated total federal tax: ${fmt(totalFedTax)}`] : []),
    `  Estimated effective rate: ${pct(effectiveRate * 100)}`,
    `  Estimated quarterly payment: ${fmt(quarterly)}`,
    '',
    'PLANNING DISCUSSION POINTS',
    ...points.map((p, i) => `  ${i + 1}. ${p}`),
    '',
    'Figures are auto-generated from data entered in TaxStat360 and are estimates for planning discussion only — not professional tax advice and not for filing. Verify with a licensed CPA, EA, or tax attorney.',
  ].join('\n')

  const handleCopy = () => { navigator.clipboard.writeText(plain).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }

  const cellL = { color: SL, fontSize: 13 }
  const cellR = { fontWeight: 600, color: N, fontSize: 13 }
  const sectionTitle = { fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', margin: '0 0 10px' }

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 4 }}>CPA PLANNING BRIEFING</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>Briefing for CPA Discussion</h2>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>Prepared {now} · Tax year {year} · {filingLabel} · TaxStat360</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCopy} style={{ padding: '8px 16px', background: copied ? G : B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{copied ? '✓ Copied' : '📋 Copy'}</button>
            <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>🖨 Print</button>
            <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        <DismissibleNotice storageKey="tx360.cpaBriefingBanner.dismissed">
          This briefing is auto-generated from the figures you entered. It is an estimate to guide a planning conversation — not a tax return, not tax advice, and not for filing. Verify with your CPA.
        </DismissibleNotice>

        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', margin: '14px 0', border: '1px solid #E2E8F0' }}>
          <div style={sectionTitle}>ENTITY STRUCTURE</div>
          {entities.length ? entities.map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
              <span style={cellL}>{e.type || 'Entity'} · {ownPct(e.own)}%</span>
              <span style={cellR}>net {fmt(getEntityNetProfit(e))}{num(e?.pnl?.officerSalary) > 0 ? ` · salary ${fmt(num(e.pnl.officerSalary))}` : ''}</span>
            </div>
          )) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
              <span style={cellL}>{b.entityType || 'Unknown'}</span><span style={cellR}>{b.ownershipPct || '100'}% ownership</span>
            </div>
          )}
        </div>

        {incomeRows.length > 0 && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 14, border: '1px solid #E2E8F0' }}>
            <div style={sectionTitle}>INCOME &amp; BUSINESS SUMMARY</div>
            {incomeRows.map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                <span style={cellL}>{l}</span><span style={cellR}>{fmt(v)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ ...sectionTitle, color: '#1D4ED8' }}>ESTIMATED FEDERAL POSITION</div>
          {[
            ['Total income (est.)', sign(totalIncome)],
            [`Standard deduction (${filingLabel})`, sign(-stdDed)],
            ...(qbi > 0 ? [['§199A QBI deduction (est.)', sign(-qbi)]] : []),
            ['Taxable income (est.)', fmt(taxable)],
            ['Estimated federal income tax', fmt(fedTax)],
            ...(seTax > 0 ? [['Estimated self-employment tax', fmt(seTax)], ['Estimated total federal tax', fmt(totalFedTax)]] : []),
            ['Estimated effective rate', pct(effectiveRate * 100)],
            ['Estimated quarterly payment', fmt(quarterly)],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #DBEAFE', fontSize: 13 }}>
              <span style={{ color: '#475569' }}>{l}</span><span style={{ fontWeight: 700, color: N }}>{v}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: SL, marginTop: 8 }}>Estimate based on entered figures; see the Tax Tracker for the full calculation.</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>PLANNING DISCUSSION POINTS</div>
          {points.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13, lineHeight: 1.6, color: N }}>
              <span style={{ fontWeight: 800, color: P, flexShrink: 0 }}>{i + 1}.</span><span>{p}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: SL, textAlign: 'center', lineHeight: 1.6 }}>
          Auto-generated from your TaxStat360 data · Planning estimate only — not professional tax advice and not for filing. Consult a licensed tax professional before filing.
        </div>
      </div>
    </Modal>
  )
}

function SimulatorModal({ onClose, rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const taxYear = parseInt(b.year) || 2025
  const filing  = f.filingStatus || 'single'
  const ownerPct = ownPct(b.ownershipPct) / 100
  const entity  = b.entityType || 'Unknown'

  const base = {
    grossRevenue:      parseFloat(b.grossRevenue)      || 0,
    cogs:              parseFloat(b.cogs)               || 0,
    // AUDIT FIX (simulator double-count): b.operatingExpenses is the saved
    // pnl.totalExpenses = pure opex + officer salary + depreciation +
    // advertising + other. Those are tracked as separate adjustable lines
    // below, so strip them back out here to recover PURE operating expenses;
    // otherwise calcScenario subtracts them twice and understates K-1 income.
    operatingExpenses: Math.max(0, (parseFloat(b.operatingExpenses) || 0)
                       - (parseFloat(b.officerSalary) || 0)
                       - (parseFloat(b.depreciation) || 0)
                       - (parseFloat((b.pnl || {}).advertising) || 0)
                       - (parseFloat((b.pnl || {}).otherDeductions) || 0)),
    officerSalary:     parseFloat(b.officerSalary)      || 0,
    depreciation:      parseFloat(b.depreciation)       || 0,
    advertising:       parseFloat((b.pnl || {}).advertising)     || 0,
    otherDeductions:   parseFloat((b.pnl || {}).otherDeductions) || 0,
    w2Income:          getTotalW2(rec)                  || 0,
    estPaid:           parseFloat(f.estPaid)  || 0,
  }

  const [delta, setDelta] = useState({
    grossRevenue: 0, operatingExpenses: 0, officerSalary: 0,
    depreciation: 0, advertising: 0, otherDeductions: 0, w2Income: 0,
  })
  const [activeScenario, setActiveScenario] = useState(null)

  const applyPreset = (id) => {
    setActiveScenario(id)
    const netProfit = base.grossRevenue - base.cogs - base.operatingExpenses - base.officerSalary
    const presets = {
      adv15:   { advertising: 15000 },
      adv30:   { advertising: 30000 },
      equip20: { depreciation: 20000 },
      equip50: { depreciation: 50000 },
      sep:     { otherDeductions: Math.min(70000, Math.round(base.officerSalary > 0 ? base.officerSalary * 0.25 : netProfit * ownerPct * 0.20)) },
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

  const simFmt = n => '$' + Math.abs(Math.round(n)).toLocaleString()
  const chg = (base, scen) => {
    const diff = scen - base
    if (diff === 0) return null
    return <span style={{fontSize:11,fontWeight:700,color:diff>0?'#DC2626':'#059669',marginLeft:6}}>{diff>0?'↑+'+simFmt(diff):'↓'+simFmt(Math.abs(diff))}</span>
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
        <span style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{simFmt(scenVal)}</span>
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
                  <span style={{fontSize:15,fontWeight:800,color:scenario.netBizIncome>=0?'#059669':'#DC2626'}}>{simFmt(scenario.netBizIncome)}</span>
                  {chg(baseline.netBizIncome, scenario.netBizIncome)}
                </div>
              </div>
              <div style={{background:'#EFF6FF',borderRadius:8,padding:'8px 12px',marginTop:6}}>
                <div style={{fontSize:11,color:'#1D4ED8',fontWeight:700,marginBottom:2}}>K-1 TO YOUR 1040</div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:13,color:'#1D4ED8'}}>Your share ({b.ownershipPct||100}%)</span>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <span style={{fontSize:16,fontWeight:800,color:'#1D4ED8'}}>{simFmt(scenario.k1)}</span>
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
                    <div style={{fontSize:11,color:'#94A3B8',textDecoration:'line-through'}}>{simFmt(baseline.fedTax)} before</div>
                    <div style={{fontSize:22,fontWeight:800,color:taxSaving>0?'#059669':'#DC2626'}}>{simFmt(scenario.fedTax)}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'#64748B',marginBottom:2}}>{taxSaving>0?'YOU SAVE':'ADDITIONAL TAX'}</div>
                    <div style={{fontSize:26,fontWeight:800,color:taxSaving>0?'#059669':'#DC2626'}}>
                      {taxSaving>=0?'':'+'}{ taxSaving>0 ? simFmt(taxSaving) : simFmt(Math.abs(taxSaving)) }
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
          Uses {taxYear} federal brackets · {filing.toUpperCase()} · ${stdDed.toLocaleString()} std deduction · Does not include state tax, FICA, or AMT · Consult a licensed tax professional before implementing.
        </div>
      </div>
    </Modal>
  )
}

function NarrativeModal({ onClose }) {
  const [selected, setSelected] = useState(0)
  const [copied, setCopied] = useState(false)
  const narratives = [
    { title: 'Real Estate Professional Status', tag: 'REP · IRC §469(c)(7)', color: P, text: `Dear IRS Representative,\n\nThis letter responds to your inquiry regarding the taxpayer's Real Estate Professional (REP) classification under IRC Section 469(c)(7) for tax year 2025.\n\nThe taxpayer qualifies as a Real Estate Professional based on the following:\n\n1. MORE THAN 50% OF PERSONAL SERVICES\nThe taxpayer performed more than 50% of all personal services in real property trades or businesses in which they materially participated.\n\n2. MORE THAN 750 HOURS\nThe taxpayer performed more than 750 hours of services during the year satisfying the statutory threshold under IRC §469(c)(7)(B).\n\n3. MATERIAL PARTICIPATION\nThe taxpayer materially participated in each rental activity meeting the 500-hour test under Treas. Reg. §1.469-5T(a)(1).\n\nAs a result, rental real estate losses are treated as non-passive and are fully deductible pursuant to IRC §469(c)(7)(A).\n\nRespectfully submitted,` },
    { title: 'S-Corp Reasonable Compensation', tag: 'Officer Salary · Rev. Rul. 74-44', color: R, text: `Dear IRS Representative,\n\nThis letter addresses your inquiry regarding officer compensation paid through the taxpayer's S-Corporation for tax year 2025.\n\nThe officer salary represents reasonable compensation based on:\n\n1. INDUSTRY BENCHMARKS — Compensation was determined by reference to comparable salaries consistent with Rev. Rul. 74-44.\n\n2. DUTIES AND RESPONSIBILITIES — The officer-shareholder performs substantial services including business development, client management, and financial oversight.\n\n3. CORPORATE PROFITABILITY — The compensation represents a reasonable percentage of gross revenues consistent with industry norms.\n\nThe S-Corporation maintains complete payroll records and W-2 forms.\n\nRespectfully submitted,` },
    { title: 'K-1 Loss Deductibility', tag: 'Schedule E · IRC §1366(d)', color: '#0891b2', text: `Dear IRS Representative,\n\nThis letter responds to your inquiry regarding Schedule E losses reported from the taxpayer's S-Corporation K-1 for tax year 2025.\n\nThe K-1 losses are fully deductible for the following reasons:\n\n1. SHAREHOLDER BASIS — The taxpayer maintains sufficient stock basis under IRC §1366(d). Form 7203 is attached.\n\n2. AT-RISK RULES — The taxpayer is at risk for the full amount of the loss under IRC §465.\n\n3. MATERIAL PARTICIPATION — The taxpayer satisfies material participation standards under Treas. Reg. §1.469-5T.\n\nComplete corporate returns (Form 1120-S) and K-1 schedules are available upon request.\n\nRespectfully submitted,` },
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

// ── TAB 4: Reports & Tools ────────────────────────────────────────────────────
// C-01 FIX: Standardize all three action buttons to the primary navy (N) palette.
// Previously: Generate Report = B (blue), Open Simulator = G (green), View Templates = P (purple).
// Three different accent colors on one page with no semantic differentiation confused
// the hierarchy. All three are equal-priority primary actions — one color is correct.
// Navy (N) is the app's primary action color (used on "Save This Record", nav buttons, etc.)
function ReportsTab({ rec, onReport, onSimulator, onNarrative, onBriefing }) {
  const tools = [
    { icon: '📋', title: 'CPA Export Pack', desc: 'A print-ready PDF with your financials, K-1 summary, risk alerts, and IRS schedule mapping. Hand this to your accountant instead of explaining everything from scratch.', btn: 'Generate Report', color: N, action: onReport, available: true },
    { icon: '🎯', title: 'What-If Tax Simulator', desc: 'Model a financial decision before making it. Try different salary levels, add a deduction, or max a retirement account — see the estimated dollar impact on your projected tax.', btn: 'Open Simulator', color: N, action: onSimulator, available: true },
    { icon: '📑', title: 'CPA Briefing', desc: 'An auto-generated planning summary of your tax position — entity structure, estimated federal liability, QBI, reasonable-comp and SE-tax notes, and quarterly estimates — organized as discussion points for your CPA. A planning summary, not a tax return; not for filing.', btn: 'Generate Briefing', color: N, action: onBriefing, available: isEnterprise(), requiredPlan: 'enterprise' },
    { icon: '🛡️', title: 'Position Documentation', desc: 'Generates a written summary of the positions taken on your return with supporting documentation references. Useful for your CPA, your records, or as starting material for a professional response. Not a substitute for representation by a CPA, EA, or tax attorney.', btn: 'View Templates', color: N, action: onNarrative, available: isEnterprise(), requiredPlan: 'enterprise' },
  ]
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Reports & Tools</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Four tools built for your CPA relationship and IRS preparedness.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tools.map(t => {
          const card = (
            <div key={t.title} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px', display: 'flex', gap: 20, alignItems: 'center' }}>
              <div style={{ fontSize: 48, flexShrink: 0 }}>{t.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: N, fontSize: 16, marginBottom: 6 }}>{t.title}</div>
                <div style={{ fontSize: 13, color: SL, lineHeight: 1.6 }}>{t.desc}</div>
              </div>
              <button onClick={t.action} style={{ padding: '12px 24px', background: t.available ? t.color : '#94A3B8', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: t.available ? 'pointer' : 'default', flexShrink: 0 }}>{t.btn}</button>
            </div>
          )
          if (!t.available && t.requiredPlan) {
            return (
              <LockedFeature key={t.title} requiredPlan={t.requiredPlan} label={t.title} minHeight={100}>
                {card}
              </LockedFeature>
            )
          }
          return card
        })}
      </div>
    </div>
  )
}


// ── Main Export ───────────────────────────────────────────────────────────────
export default function AIAnalysis() {
  const navigate = useNavigate()
  const location = useLocation()
  const liveState = location.state || null
  const [activeTab, setActiveTab] = useState('risk')
  const [showReport, setShowReport] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [showNarrative, setShowNarrative] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)

  const rec = getRecord(liveState)
  const score = completeness(rec)
  const missing = missingFields(rec)

  // ── Plan gate ── AI Analysis is a Professional+ feature ──────────────────────
  if (!isPro()) {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1.5px dashed #cbd5e1', padding: '48px 36px', maxWidth: 480, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F1F3D', margin: '0 0 10px' }}>AI Analysis & Reporting — Professional Feature</h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
            AI Risk Scan, Tax Optimization, IRS Schedule Map, and CPA Export Pack are included on the <strong>Professional</strong> and <strong>Enterprise</strong> plans.
          </p>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '16px', marginBottom: 24, textAlign: 'left' }}>
            {['🚨 Officer salary & audit risk flags', '💡 Tax-saving strategy finder', '📋 IRS filing schedule map', '📄 One-click CPA export pack'].map(f => (
              <div key={f} style={{ fontSize: 13, color: '#374151', padding: '4px 0', display: 'flex', gap: 8 }}>{f}</div>
            ))}
          </div>
          <button onClick={() => navigate('/upgrade')} style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' }}>
            Upgrade to Professional →
          </button>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer', marginTop: 12 }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'risk',       label: '🔍 Risk Scan' },
    { id: 'optimize',   label: '💡 Tax Optimization' },
    { id: 'compliance', label: '📋 IRS Schedule Map' },
    { id: 'reports',    label: '📄 Reports & Tools' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
            <Logo />
          </div>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {[
              { label: 'Dashboard',    path: '/dashboard' },
              { label: 'Tax Tracker', path: '/calculate-tax' },
              { label: 'AI Analysis & Reporting', path: '/ai-analysis' },
              { label: 'Settings',    path: '/settings' },
            ].map(link => (
              <button key={link.path} onClick={() => navigate(link.path)} style={{
                padding: '8px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                background: location.pathname === link.path ? '#EFF6FF' : 'transparent',
                color: location.pathname === link.path ? B : SL,
                fontWeight: location.pathname === link.path ? 700 : 500,
              }}>{link.label}</button>
            ))}
            <button onClick={() => signOut(navigate)} style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: 'transparent', color: SL, fontSize: 13, cursor: 'pointer' }}>
              Sign Out
            </button>
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: N, margin: '0 0 6px' }}>AI Analysis & Reporting</h1>
            <p style={{ fontSize: 14, color: SL, margin: 0 }}>
              {rec?._unsaved
                ? 'Analyzing your current session data'
                : rec?.savedAt
                  ? `Based on record saved ${rec.savedAt}`
                  : 'Complete Step 1 & Step 2 to see your analysis'}
            </p>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '0.5px', marginBottom: 6 }}>INPUT COMPLETENESS</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: score >= 80 ? G : score >= 50 ? O : R, lineHeight: 1 }}>{score}%</div>
            {missing.length > 0 && (
              <div style={{ fontSize: 11, color: SL, marginTop: 6, maxWidth: 160 }}>
                Missing: {missing.slice(0, 2).join(', ')}{missing.length > 2 ? ` +${missing.length - 2} more` : ''}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#fff', padding: 4, borderRadius: 10, border: '1px solid #E2E8F0' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              flex: 1, padding: '10px 8px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, transition: 'all 0.15s',
              background: activeTab === t.id ? N : 'transparent',
              color: activeTab === t.id ? '#fff' : SL,
              fontWeight: activeTab === t.id ? 700 : 500,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: '24px' }}>
          {activeTab === 'risk'       && <RiskScan rec={rec} />}
          {activeTab === 'optimize'   && <TaxOptimization rec={rec} />}
          {activeTab === 'compliance' && <IRSCompliance rec={rec} />}
          {activeTab === 'reports'    && (
            <ReportsTab
              rec={rec}
              onReport={() => setShowReport(true)}
              onSimulator={() => setShowSimulator(true)}
              onNarrative={() => setShowNarrative(true)}
              onBriefing={() => setShowBriefing(true)}
            />
          )}
        </div>
      </div>

      {showReport    && <ReportModal    rec={rec} onClose={() => setShowReport(false)} />}
      {showSimulator && <SimulatorModal rec={rec} onClose={() => setShowSimulator(false)} />}
      {showNarrative && <NarrativeModal           onClose={() => setShowNarrative(false)} />}
      {showBriefing  && <BriefingModal    rec={rec} onClose={() => setShowBriefing(false)} />}
    </div>
  )
}
