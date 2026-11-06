// src/lib/opportunities.js
//
// PHASE 1 (simple flow, Nov 2026): the Tax-Saving Opportunities builder, lifted
// verbatim out of AIAnalysis.jsx's TaxOptimization tab so the SAME list can be
// rendered on the new result screen and reused by the prior-year memo without
// mounting the analysis component. This module owns NO tax math: every figure
// comes from calcSelector (engine-true) or the pure helpers in aiAnalysisTaxMath.
// ARCHITECTURE §1 / §4: imports flow lib → lib only; nothing here imports a
// component.
//
// Contract: PURE. buildOpportunities(rec) → frozen
//   { hasIncome, opportunities: [{icon,title,priority,saving,detail,howTo}], marginalRate, year, entitySubtitle }
// Cards are sorted high → medium → low (stable), exactly as the tab sorted them.

import { getMarginalRate, getTable } from './taxCalc.js'
import {
  resolveQbiDeduction,
  taxableIncomeBeforeQBI,
  scorpSeTaxSavingsEstimate,
  seEligibleK1FromEntities,
  hasLimitedPartnerInterest,
  computeRetirementContributionRoom,
  computePassiveLossAllowance,
  recEntityRevenue,
  recOperatingRevenue,
} from './aiAnalysisTaxMath.js'
import {
  CURRENT_TAX_YEAR,
  SEP_IRA_RATE, SEP_IRA_SOLE_PROP_EFFECTIVE_RATE,
  SCORP_REASONABLE_COMP_RATIO_THRESHOLD,
} from './constants.js'
import { summarizeRecord } from '../utils/calcSelector.js'
import { fmt, pct, nf } from '../utils/money.js'
import { isPassthroughEntity, isSCorpEntity, isCCorpEntity, isScheduleCType, isRealEstateEntity, getEntityNetProfit, getEntityK1Share } from '../utils/entityPredicates.js'

// ── Record helpers (moved from AIAnalysis.jsx; the component imports them back) ──

export function getTotalW2(rec) {
  if (!rec) return 0
  const f = rec.f1040 || {}
  const additionalW2 = nf(f.w2Income)
  const entities = Array.isArray(rec.entities) ? rec.entities : []
  const totalOfficerSalary = entities.reduce(
    (s, e) => s + (nf(e?.pnl?.officerSalary)),
    0,
  )
  return additionalW2 + totalOfficerSalary
}

export function getEntityIncomeSplit(rec) {
  const entities = Array.isArray(rec?.entities) ? rec.entities : []
  // FINDING-2/11 FIX (independent audit, Aug 2026): use the single-source K-1
  // resolver so a K-1-direct-entry entity (already-allocated Box 1) is not
  // re-scaled by Ownership % a second time here.
  const shareOf = (e) => getEntityK1Share(e)
  const sCorp = entities
    .filter(e => isSCorpEntity(e?.type))
    .reduce((s, e) => s + shareOf(e), 0)
  const partnership = entities
    .filter(e => !isSCorpEntity(e?.type) && !isScheduleCType(e?.type) && !isCCorpEntity(e?.type) && !isRealEstateEntity(e?.type))
    .reduce((s, e) => s + shareOf(e), 0)
  const realEstate = entities
    .filter(e => isRealEstateEntity(e?.type))
    .reduce((s, e) => s + shareOf(e), 0)
  const scheduleC = entities
    .filter(e => isScheduleCType(e?.type))
    .reduce((s, e) => s + shareOf(e), 0)
  return { sCorp, partnership, realEstate, scheduleC }
}

export function recEntityType(rec) {
  const fromBiz = rec?.biz?.entityType
  if (fromBiz && fromBiz !== 'Unknown') return fromBiz
  const ents = Array.isArray(rec?.entities) ? rec.entities : []
  const fromEntity = ents.find(e => e && e.type)?.type
  return fromEntity || fromBiz || ''
}

export function recDepreciation(rec) {
  if (!rec) return 0
  // FIX (dep-179): Section 179 expensing IS depreciation for the purpose of the
  // "No Depreciation Recorded" / "Vehicle — Review Before Filing" risk cards.
  // Previously this counted only pnl.depreciation (MACRS/bonus). A filer who took
  // §179 in the K-1 Box 11 field (box11_12) but left the depreciation field blank
  // — e.g. a 100%-business-use vehicle expensed under §179 — registered as zero,
  // so the scan falsely told them they had "no depreciation" and "no vehicle
  // deduction." Count box11_12 (§179) alongside MACRS/bonus depreciation.
  const numFrom = nf // unified onto canonical parser (audit D-1)
  const fromEntities = (Array.isArray(rec.entities) ? rec.entities : [])
    .reduce((s, e) => s + numFrom(e?.pnl?.depreciation) + numFrom(e?.box11_12), 0)
  if (fromEntities > 0) return fromEntities
  return numFrom(rec.biz?.depreciation) + numFrom(rec.biz?.section179)
}

/** Record-shaped input: { biz, f1040, entities, k1Income, seTax }. Same shape the
 *  AI Analysis tab and the Dashboard cards consume. */
export function buildOpportunities(rec) {
  if (!rec) return Object.freeze({ hasIncome: false, opportunities: [], marginalRate: 0, year: CURRENT_TAX_YEAR, entitySubtitle: 'business' })
  const b = rec.biz || {}, f = rec.f1040 || {}
  // F-FUNC-04: revenue and entity structure fall back to the per-entity data so the
  // Optimization tab reflects the same figures the Risk Scan and Schedule Map use.
  const entityType = recEntityType(rec)
  const revenue = recEntityRevenue(rec)
  const dep = recDepreciation(rec)
  const sCorpEntities = (Array.isArray(rec.entities) ? rec.entities : []).filter(e => isSCorpEntity(e?.type))
  const totalOfficerSalary = Math.max(
    sCorpEntities.reduce((s, e) => s + (nf(e?.pnl?.officerSalary)), 0),
    nf(b.officerSalary)
  )
  const sCorpK1 = sCorpEntities.reduce((s, e) => s + Math.max(0, getEntityNetProfit(e)), 0)
  const k1 = nf(rec.k1Income)
  const w2 = getTotalW2(rec)
  const year = parseInt(b.year) || CURRENT_TAX_YEAR
  const isPassthrough = isPassthroughEntity(entityType)
  const isSCorpOwner = sCorpEntities.length > 0 || isSCorpEntity(entityType)
  const filing = f.filingStatus || 'single'

  // UX audit F8: a raw 'Unknown' placeholder (the fallback used when an entity's
  // structure can't be resolved) was leaking into the user-facing copy as
  // "strategies based on your Unknown structure". Filter it out so the subtitle
  // gracefully falls back to the friendly default ("business") below.
  const isRealType = (t) => {
    const s = (t == null ? '' : String(t)).trim()
    return s !== '' && s.toLowerCase() !== 'unknown'
  }
  const entityTypes = Array.isArray(rec?.entities) && rec.entities.length > 0
    ? [...new Set(rec.entities.map(e => e?.type).filter(isRealType))]
    : [isRealType(entityType) ? entityType : null].filter(Boolean)
  const entitySubtitle = entityTypes.length > 1 ? entityTypes.join(' + ') : entityTypes[0] || 'business'

  const capitalGainsIncome = (nf(f.capitalGains ) || 0) + (nf(f.ltCapGains ) || 0)
  const interestIncome = nf(f.interest ) || 0
  const dividendIncome = nf(f.dividends ) || 0
  const rentalNet = Math.max(0, (nf(f.rentalIncome ) || nf(b.rentalIncome ) || 0) - (nf(f.rentalExpenses ) || 0))
  const otherInc = nf(f.otherIncome ) || 0
  // PHASE 2.2 (R-2): engine-true AGI for card gating. The old Math.max(0, sum)
  // had no §1211(b) clamp and no adjustments — a loss-year investor's §469(i)
  // phase-out (and every AGI-gated card) ran against the wrong figure.
  const _sum2 = summarizeRecord(rec)
  const agi = _sum2.ok
    ? _sum2.agi
    : Math.max(0, k1 + w2 + capitalGainsIncome + interestIncome + dividendIncome + rentalNet + otherInc)

  const _taxableBeforeQBI_opt = taxableIncomeBeforeQBI(agi, year, filing)
  const { deduction: _qbiOpt } = resolveQbiDeduction({
    k1,
    taxableBeforeQBI: _taxableBeforeQBI_opt,
    entityType: b.entityType,
    filing,
    taxYear: year,
    entities: rec.entities || [],
  })
  const taxable = Math.max(0, _taxableBeforeQBI_opt - _qbiOpt)
  // PHASE 2.2 (R-2): the engine already computed the true marginal rate on the
  // true ordinary taxable income — use it when available.
  const marginalRate = _sum2.ok && _sum2.marginalRate
    ? _sum2.marginalRate
    : getMarginalRate(taxable, year, filing)

  const grossRevenueTax = (Array.isArray(rec.entities) ? rec.entities : []).reduce((s, e) => s + (nf(e?.pnl?.grossRevenue)), 0)
  const k1ForGuard = nf(rec?.k1Income)
  const w2ForGuard = nf(rec?.f1040?.w2Income)
  const hasIncome = grossRevenueTax > 0 || k1ForGuard > 0 || w2ForGuard > 0
  if (!hasIncome) return Object.freeze({ hasIncome: false, opportunities: [], marginalRate, year, entitySubtitle })

  const opportunities = []

  // ── UX AUDIT F6 (Jul 2026) — entity-aware relevance ─────────────────────────
  // The audit ran this tab against a rental-only profile (Real Estate (Schedule E)
  // + W-2) — the product's core real-estate-investor audience — and got Home
  // Office framed around Schedule C and an S-Corp-caveat-heavy "Hire Your
  // Children" card, while the rental levers sat at the bottom of the list.
  // Three changes:
  //   (1) hasBusinessEntity gates the operating-business cards (home office,
  //       family payroll) so a bare rental portfolio never sees them;
  //   (2) a §469(i) active-participation card appears when the record shows a
  //       net rental loss and a rental card is missing both §469 status flags;
  //   (3) the finished list is sorted high → medium → low so the rental cards
  //       (high priority) lead for investors instead of trailing the page.
  const _allEntities = Array.isArray(rec?.entities) ? rec.entities : []
  const hasRealEstate = _allEntities.some(e => isRealEstateEntity(e?.type))
  const hasBusinessEntity =
    _allEntities.some(e => isRealType(e?.type) && !isRealEstateEntity(e?.type)) ||
    (isRealType(entityType) && !isRealEstateEntity(entityType)) ||
    k1 !== 0
  const { realEstate: reNetShare } = getEntityIncomeSplit(rec)


  // A1 FIX: for a sole proprietor the SEP/Solo-401(k) base is net earnings from
  // self-employment (net profit − ½ SE tax), not raw K-1/net profit. See
  // selfEmployedRetirementBase() above. S-Corp owners still use W-2 officer salary.
  // Finding 1 follow-up (Jul 2026 audit): base the SEP/Solo-401(k) room on the
  // SE-ELIGIBLE K-1 (excludes a limited partner's §1402(a)(13) share), not the raw
  // K-1 total — otherwise the card recommends a contribution on SE-exempt income.
  const seEligibleK1 = seEligibleK1FromEntities(rec.entities)
  const hasLimitedPartnerK1 = hasLimitedPartnerInterest(rec.entities)
  // §415(c) overall limits are year-specific and read from the centralized table
  // inside computeRetirementContributionRoom (never hardcoded).
  const {
    sepIraMax, maxSEP, solo401kDeferral, maxSolo401kEmployer, maxSolo401k,
  } = computeRetirementContributionRoom({
    isSCorpOwner,
    totalOfficerSalary,
    seEligibleK1,
    seTax: _sum2.ok ? _sum2.seTax : nf(rec.seTax),
    year,
  })

  if (isPassthrough) {
    if (isSCorpOwner && totalOfficerSalary === 0) {
      opportunities.push({
        icon: '🏦', title: 'SEP-IRA / Solo 401(k) — Set Officer Compensation First',
        priority: 'high', saving: null,
        detail: `S-Corp owners can only contribute to a SEP-IRA or Solo 401(k) based on their officer W-2 compensation — not K-1 income (IRC §402(h); IRS Pub. 560). With $0 officer compensation recorded, your current allowable contribution is $0.`,
        howTo: `Set reasonable officer compensation on Step 1 first. Once salary is recorded, you can contribute up to ${Math.round(SEP_IRA_RATE * 100)}% of that salary (max ${fmt(sepIraMax)} in ${year}). Example: a ${fmt(Math.round(k1 * SCORP_REASONABLE_COMP_RATIO_THRESHOLD))} salary would allow a ${fmt(Math.round(Math.min(sepIraMax, k1 * SCORP_REASONABLE_COMP_RATIO_THRESHOLD * SEP_IRA_RATE)))} SEP-IRA contribution — saving approx. ${fmt(Math.round(Math.min(sepIraMax, k1 * SCORP_REASONABLE_COMP_RATIO_THRESHOLD * SEP_IRA_RATE) * marginalRate))} in federal tax.`
      })
    } else if (maxSEP > 0) {
      const sepTaxSaved = Math.round(maxSEP * marginalRate)
      const sepIraPlainLead = `In plain terms: this lets you set aside part of this year's business profit into a retirement account before tax is calculated on it — the money isn't taxed now, which lowers what you owe today. `
      const sepDetail = isSCorpOwner
        ? sepIraPlainLead + `SEP-IRA contributions are employer-only, based on your W-2 officer compensation (not K-1 income — IRC §402(h)). At ${fmt(totalOfficerSalary)} officer compensation, the max SEP-IRA contribution is ${Math.round(SEP_IRA_RATE * 100)}% × ${fmt(totalOfficerSalary)} = ${fmt(maxSEP)} (max ${fmt(sepIraMax)}). The S-Corp makes the contribution at the entity level, deductible on Form 1120-S.`
        : sepIraPlainLead + `You can contribute up to ${fmt(maxSEP)} (~${Math.round(SEP_IRA_SOLE_PROP_EFFECTIVE_RATE * 100)}% of net self-employment income after SE tax deduction, max ${fmt(sepIraMax)}) to a SEP-IRA. This reduces your AGI dollar-for-dollar.`

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
          detail: `Unlike a SEP-IRA (employer contributions only), a Solo 401(k) has two components that stack:\n• Employee elective deferral: up to ${fmt(solo401kDeferral)} (${year} limit, pre-tax or Roth — IRC §401(k))\n• Employer profit-sharing: 25% of your officer W-2 compensation = ${fmt(maxSolo401kEmployer)}\n• Combined total: ${fmt(maxSolo401k)} — vs. ${fmt(maxSEP)} under a SEP-IRA alone.\nBoth contributions flow from your S-Corp but are made separately.`,
          howTo: `At your ${pct(marginalRate * 100)} marginal rate, the max Solo 401(k) saves approx. ${fmt(solo401kTaxSaved)} — roughly ${fmt(solo401kTaxSaved - Math.round(maxSEP * marginalRate))} more than a SEP-IRA alone. Deadlines: to make the EMPLOYEE deferral you need the plan document in place and a written deferral election on file by December 31 of the plan year, and the deferral has to run through your W-2 payroll. The EMPLOYER profit-sharing side is more forgiving — under SECURE Act §201 (IRC §401(b)(2)) a plan adopted after year-end, up to the S-Corp's return due date including extensions (September 15), is treated as adopted on the last day of the tax year for that contribution. Available at Fidelity, Schwab, or Vanguard.`
        })
      }
    } else if (hasLimitedPartnerK1 && k1 > 0) {
      // Finding 1 follow-up: a limited partner's K-1 produces $0 SE earnings
      // (§1402(a)(13)), so maxSEP is 0 and the contribution card above is skipped.
      // Explain WHY rather than let it vanish — a silently missing strategy is how
      // the original inconsistency (a SEP recommended on SE-exempt income) hid.
      opportunities.push({
        icon: '🏦', title: 'SEP-IRA — Limited-Partner Income Doesn’t Create Room',
        priority: 'medium', saving: null,
        detail: `Your K-1 is from a limited-partner interest, whose distributive share is excluded from net earnings from self-employment under IRC §1402(a)(13). SEP-IRA and Solo 401(k) employer contributions are based on self-employment earnings, so this income supports $0 of contribution room on its own.`,
        howTo: `If you also have self-employment income — a Schedule C business, or a general-partner / materially-participating LLC interest that DOES pay SE tax — that income can fund a SEP-IRA (up to ${Math.round(SEP_IRA_SOLE_PROP_EFFECTIVE_RATE * 100)}% of its net SE earnings, max ${fmt(sepIraMax)} in ${year}). A limited-partner share alone cannot. Confirm your partner classification with a licensed tax professional before contributing.`
      })
    }
  }

  // FRESH-EYES F-10 (11 Sep 2026): §179(d)(1) requires property used in the active conduct
  // of a trade or business. Gross rents and C-Corp receipts must not open this prompt.
  if (recOperatingRevenue(rec) > 30000 && dep === 0) {
    const _s179 = getTable(year)?.sec179 || {}
    const _fmtM = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : fmt(n)
    const _sec179Cap = _s179.cap ? _fmtM(_s179.cap) : 'the annual limit'
    const _sec179PhaseOut = _s179.phaseOutStart ? _fmtM(_s179.phaseOutStart) : 'the phase-out threshold'
    opportunities.push({
      icon: '🏗️', title: '§179 Equipment Deduction', priority: 'medium',
      saving: null,
      // AUDIT H4 (Sep 2026): these figures were hardcoded to 2025 ($2.5M / $4M) and
      // rendered even when the user had selected 2026 — while the ENGINE
      // (calc179Limitation) was correctly using the 2026 table. The card and the
      // math disagreed. Read the same year-keyed table the engine reads.
      detail: `§179 lets you deduct the full cost of qualifying equipment, vehicles, and business property in the year of purchase (up to ${_sec179Cap} for ${year} under the One Big Beautiful Bill Act; the deduction phases out dollar-for-dollar once qualifying purchases exceed ${_sec179PhaseOut}). Separately, §168(k) bonus depreciation is 100% for qualified property ACQUIRED after January 19, 2025 and placed in service after that date (OBBBA §70301); property acquired on or before that date stays on the TCJA phase-down for its placed-in-service year.`,
      howTo: 'If you purchased any computers, phones, furniture, vehicles, or equipment for the business this year — even partially — enter the cost under Depreciation. The deduction can be substantial.'
    })
  }

  // AUDIT H5 (Sep 2026): this was a ternary on isSCorpOwner, which the caller sets true
  // if ANY entity is an S-Corp. A filer with an S-Corp AND a Schedule C was therefore
  // shown S-Corp accountable-plan guidance ending 'Do NOT use Schedule C' — while
  // holding a Schedule C the instruction was actively wrong for. The method genuinely
  // differs by entity, and a multi-entity owner needs BOTH, so describe each structure
  // actually present instead of picking one and hiding the rest.
  const _hoTypes = [
    ...(Array.isArray(rec?.entities) ? rec.entities.map(e => e?.type) : []),
    entityType,
  ].filter(isRealType)
  const _hoHasSCorp  = _hoTypes.some(isSCorpEntity) || isSCorpOwner
  const _hoHasSchedC = _hoTypes.some(isScheduleCType)
  const _hoHasPship  = _hoTypes.some(t => /partner|mmllc/i.test(t || '')) || /partnership|mmllc/i.test(b.entityType || '')
  const _hoParts = [
    _hoHasSCorp  ? 'For S-Corp owners, the correct method is an accountable plan reimbursement — the S-Corp pays you back for the business-use portion of home expenses, deducts the payment as a business expense, and the reimbursement is excluded from your W-2 income (IRC §62(a)(2)(A); Treas. Reg. §1.62-2). S-Corp shareholders who are also W-2 employees cannot deduct unreimbursed employee business expenses under current law (IRC §67(g), added by the TCJA and made permanent by OBBBA §70110).' : null,
    _hoHasPship  ? "Partners may deduct unreimbursed partnership expenses (UPE) directly on Schedule E Part II, or the partnership can reimburse through an accountable plan — which is deductible at the entity level and excluded from the partner\\'s income." : null,
    _hoHasSchedC ? 'Sole proprietors and single-member LLCs claim it on Schedule C using Form 8829 (actual expense method) or the simplified method ($5/sq ft, up to 300 sq ft).' : null,
  ].filter(Boolean)
  // Nothing resolved (unknown structure): fall back to the Schedule C wording, which is
  // the most common case and the least likely to mislead.
  const homeOfficeHowTo = 'The space must be used exclusively for business. Calculate your home office percentage (office sq ft ÷ total home sq ft) and apply to rent/mortgage interest, utilities, and insurance. '
    + (_hoParts.length ? _hoParts.join(' ') : 'Sole proprietors and single-member LLCs claim it on Schedule C using Form 8829 (actual expense method) or the simplified method ($5/sq ft, up to 300 sq ft).')
    + (_hoParts.length > 1 ? ' You hold more than one structure — each has its own method, so apply the one that matches the entity whose space you are claiming.' : '')


  // F6: only meaningful for an operating business — a directly-held rental
  // (Schedule E) has no home-office deduction path, so rental-only profiles
  // shouldn't be told to file Form 8829.
  if (hasBusinessEntity) opportunities.push({
    icon: '🏠', title: 'Home Office Deduction', priority: 'medium',
    saving: null,
    detail: 'If you use a portion of your home exclusively and regularly for business, you may be able to benefit from home-office expenses. The method depends on your entity type — see "How to apply" below for what applies to your structure.',
    howTo: homeOfficeHowTo
  })

  if (sCorpEntities.length > 0 && totalOfficerSalary > 0 && sCorpK1 > 50000) {
    // pnl.netProfit (hence sCorpK1) is ALREADY net of officer salary across every entry
    // path — manual P&L folds officer salary into totalExpenses, and synced P&L is stored
    // after salary (see EntityCompareModal / TaxReturn / Dashboard). So sCorpK1 IS the K-1
    // ordinary income that escapes SE tax. The helper mirrors the engine's ficaSavings
    // (92.35% §1402(a)(12) factor + SS wage-base cap from the owner's FICA-subject wages),
    // so this figure matches the filed-return panel — critically, it no longer overstates
    // for a high-W-2 owner whose wages already consume the Social Security wage base.
    const seTaxSaved = scorpSeTaxSavingsEstimate({
      k1Income: sCorpK1,
      ficaSubjectWages: w2,                    // getTotalW2(rec): personal W-2 + officer salary
      ssWageBase: getTable(year).ssWageBase,
    })
    if (seTaxSaved > 1000) {
      opportunities.push({
        icon: '💼', title: 'S-Corp Salary vs. Distribution Split', priority: 'high',
        saving: seTaxSaved,
        detail: `Your S-Corp structure means your share of the business's ordinary income reported on the K-1 is not subject to self-employment tax — only your W-2 officer wages are. That treatment applies to the K-1 income whether or not you distribute it; it is not a benefit of taking distributions. FICA is 15.3% on wages up to the Social Security wage base (${fmt(getTable(year).ssWageBase)} for ${year}) and 2.9% Medicare-only above it. Versus operating as a sole proprietor — who owes SE tax on all net earnings — this saves roughly ${fmt(seTaxSaved)} on your ${fmt(sCorpK1)} of K-1 income (the profit remaining after your officer wages).`,
        howTo: `Estimated SE-tax savings vs. a sole proprietorship: ~${fmt(seTaxSaved)}. This figure already reflects the 92.35% net-earnings factor (IRC §1402(a)(12)) and the Social Security wage-base cap — because your W-2 wages count toward that ${fmt(getTable(year).ssWageBase)} cap, only the 2.9% Medicare portion applies to K-1 income once your wages use it up, so the savings is smaller for higher earners. The savings comes from the S-Corp structure, not from maximizing distributions — pay yourself reasonable W-2 compensation FIRST and keep documentation showing it is reasonable for your role. There is no IRS safe-harbor percentage; practitioners commonly use 35–45% of your total S-Corp compensation (salary + K-1 income) only as a rough starting point. Setting salary too low to enlarge the untaxed portion is the position hardest to defend under Rev. Rul. 74-44.`
      })
    }
  }

  opportunities.push({
    icon: '🏥', title: 'Health Savings Account (HSA)', priority: 'medium',
    // AUDIT: was hardcoded to the 2025 limit ($4,300), so the badge read ~$1,376 while the
    // body below (year-bound) read $1,408 for 2026 — two numbers for one item. Same source now.
    saving: Math.round((getTable(year)?.hsa?.selfOnly) * marginalRate),
    // AUDIT F-8 FIX: limits now read from TAX_TABLES[year].hsa (were hardcoded 2025
    // figures shown in every tax year).
    detail: `If you have a High-Deductible Health Plan (HDHP), you can contribute up to ${fmt(getTable(year)?.hsa?.selfOnly)} (self-only) or ${fmt(getTable(year)?.hsa?.family)} (family) to an HSA for ${year}. Contributions are tax-deductible and grow tax-free.`,
    howTo: `At your rate of ${pct(marginalRate * 100)}, a max self-only HSA contribution saves approx. ${fmt(Math.round((getTable(year)?.hsa?.selfOnly) * marginalRate))}. Funds roll over each year and can be invested. Withdrawals for qualified medical expenses are always tax-free.`
  })

  if (isSCorpEntity(b.entityType) && revenue > 0) {
    opportunities.push({
      icon: '🏡', title: 'Augusta Rule — IRC §280A(g)', priority: 'low',
      saving: null,
      detail: 'You can rent your personal home to your S-Corp for up to 14 days per year. The rental income is tax-free to you personally, and the rental payment is a deductible business expense for the S-Corp.',
      howTo: 'Document business meetings, shareholder meetings, or strategy sessions held at your home. Pay fair market rent (research comparable event venue rates in your area). Keep written agreements. Maximum benefit: fair market rate × 14 days, deductible to the S-Corp.'
    })
  }

  // F6: family payroll requires an operating business with bona fide work —
  // not applicable to a passive rental portfolio, so gate it the same way.
  if (hasBusinessEntity) opportunities.push({
    icon: '👨‍👩‍👧', title: 'Hire Your Children', priority: 'medium',
    saving: null,
    detail: 'Hiring your children for legitimate work at reasonable wages can shift income to their (usually lower) brackets. IMPORTANT for S-Corp owners: the FICA exemption for a child under 18 (IRC §3121(b)(3)(A)) applies ONLY to a parent\u2019s sole proprietorship or a partnership where each partner is the child\u2019s parent — it NEVER applies to a corporation, including your S-Corp. Wages your S-Corp pays your child are fully subject to FICA and must run through payroll with a W-2 for bona fide services at a reasonable rate.',
    howTo: 'Ask Aria or see IRS.gov family-employee rules.'
  })

  // F6: §469(i) $25,000 active-participation allowance — shown when the record
  // has a net rental loss and at least one rental card is missing both §469
  // status flags (isREP / isActiveParticipant), i.e. the loss is currently
  // suspended by default when a checkbox might unlock up to $25K of it.
  // Allowance phases out 50¢ per $1 of MAGI between $100K and $150K (AGI is
  // used as the MAGI proxy here, consistent with the engine's simplified model).
  //
  // M1 (audit F-01, Jul 2026): the formula is no longer re-implemented here — it now
  // calls calc469iAllowance() in taxCalc.js, the same code path the engine uses on the
  // filed return. INTENTIONAL BEHAVIOR CORRECTION: the prior inline copy ignored filing
  // status, so an MFS filer could be shown an allowance the engine (correctly, per
  // §469(i)(5)(B)) computes as $0. The card is now suppressed for MFS, matching the
  // return. All other filing statuses are numerically identical to the prior copy.
  if (hasRealEstate && reNetShare < 0) {
    const _unflaggedRentals = _allEntities.filter(e =>
      isRealEstateEntity(e?.type) && !e?.isREP && !e?.isActiveParticipant)
    const { allowance: _allowance, usable: _usable } = computePassiveLossAllowance({ agi, filing, reNetShare })
    if (_unflaggedRentals.length > 0 && _usable > 0) {
      opportunities.push({
        icon: '🔓', title: 'Unlock the $25,000 Rental-Loss Allowance — §469(i)', priority: 'high',
        saving: Math.round(_usable * marginalRate),
        detail: `Your record shows a net rental loss of ${fmt(Math.abs(reNetShare))}, but at least one rental card has neither §469 status box checked — so the engine treats the loss as passive and suspends it on Form 8582 instead of deducting it. If you actively participate (bona fide management decisions: approving tenants, setting rents, approving expenses — a much lower bar than Real Estate Professional status), up to $25,000 of rental losses can offset your other income. At your AGI of ${fmt(agi)}, your available allowance is ${fmt(Math.round(_allowance))}${_allowance < 25000 ? ' (reduced by the $100K–$150K MAGI phase-out)' : ''}, of which ${fmt(Math.round(_usable))} is usable against this year's loss.`,
        howTo: `If you genuinely make the management decisions on the property, check "Active Participant — §469(i) $25,000 allowance" on the rental card in Step 1. At your ${pct(marginalRate * 100)} marginal rate, the usable ${fmt(Math.round(_usable))} saves approx. ${fmt(Math.round(_usable * marginalRate))} in federal tax this year. Only claim it if it's true — keep notes showing your management role.`
      })
    }
  }


  if (hasRealEstate) {
    opportunities.push({
      icon: '🏢', title: 'Bonus Depreciation', priority: 'high',
      saving: null,
      detail: 'In plain terms: this can let you deduct a large chunk of a rental property\u2019s value in year one instead of spreading it over decades, which can significantly cut this year\u2019s tax bill \u2014 though unlocking the full amount usually requires a paid cost segregation study. ' + 'OBBBA (P.L. 119-21 §70301) made 100% bonus depreciation PERMANENT under IRC §168(k) for qualified property acquired after January 19, 2025 — the old TCJA phase-down (80%/60%/40%) no longer applies to new acquisitions. For rental real estate, a cost segregation study reclassifies part of the building into 5-, 7-, and 15-year property that qualifies for a full 100% first-year depreciation deduction. The building itself stays on 27.5-year (residential) or 39-year (commercial) straight-line MACRS. Caution: bonus depreciation creates §1245/§1250 recapture exposure on sale, and the resulting loss is still subject to the §469 passive activity rules — see \u201CTrack Your Real Estate Hours\u201D below.',
      howTo: 'Get a cost segregation study on properties placed in service after Jan 19, 2025 (typically worthwhile above ~$300K of building basis). Enter the resulting first-year depreciation in the rental\u2019s Depreciation field in Step 1. Verify your §469 status on the same card — without REPS or the short-term-rental exception, the loss is suspended on Form 8582, not deducted.'
    })

    opportunities.push({
      icon: '⏱️', title: 'Track Your Real Estate Hours', priority: 'high',
      saving: null,
      // AUDIT F-12 FIX: hour-tracking alone unlocks nothing. State the actual tests
      // (same framing as the REP audit-response letter template in this file).
      detail: 'In plain terms: rental losses don\u2019t automatically offset your other income \u2014 the IRS only allows that if you can prove, with real contemporaneous records, that real estate is close to a full-time job for you (or your rentals qualify as short-term rentals). ' + 'Rental losses can offset your other income only if you qualify as a Real Estate Professional — BOTH §469(c)(7)(B) tests: (1) more than 750 hours of service during the year in real property trades or businesses in which you materially participate, AND (2) more than half of all the personal services you perform in trades or businesses in those same real property trades or businesses — plus material participation in each rental (or the §1.469-9(g) aggregation election covering your whole portfolio). Alternative path: short-term rentals with average guest stays of 7 days or less are not §469(c)(2) rental activities (Reg. §1.469-1T(e)(3)(ii)(A)), so material participation alone (e.g., the 100-hour-and-most-participation or 500-hour tests, Reg. §1.469-5T) makes those losses nonpassive without REPS. Contemporaneous hour logs are what survive exam — reconstruct-after-the-fact records routinely fail in Tax Court. Coupled with 100% bonus depreciation, either path can be a powerful planning tool.',
      howTo: 'Keep a contemporaneous log (date, property, activity, hours). Set REP status and material participation / the aggregation election on each rental card in Step 1 — the engine only treats losses as nonpassive when those flags are set and the hours tests are met.'
    })
  }

  // F6: high-impact levers first. Array.prototype.sort is stable, so cards keep
  // their authoring order within each band — for a rental-heavy profile the
  // §469(i) / bonus-depreciation / hours cards now lead instead of trailing.
  const _priorityRank = { high: 0, medium: 1, low: 2 }
  opportunities.sort((a, b) => (_priorityRank[a.priority] ?? 3) - (_priorityRank[b.priority] ?? 3))
  return Object.freeze({ hasIncome: true, opportunities, marginalRate, year, entitySubtitle })
}
