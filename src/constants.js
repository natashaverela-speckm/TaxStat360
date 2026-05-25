// src/constants.js
// Single source of truth for PERMANENT constants across TaxStat360.
//
// Architecture rule:
//   This file  →  permanent rates, ratios, structural values, and law-defined thresholds
//                 that never change year-to-year (IRC rates, ERISA ages, FICA structure,
//                 and statutory dollar amounts that are explicitly NOT inflation-adjusted).
//   taxCalc.js →  year-specific dollar figures (brackets, thresholds, limits, phase-outs)
//                 stored in the TAX_TABLES[year] object.
//
// Import from here — never hard-code these values in individual component or utility files.
// When a new tax year is released, only taxCalc.js TAX_TABLES needs updating.
//
// ── Centralization audit (last updated with audit fix CC-M01/M02/M03) ────────
// RESOLVED (constants-centralization-01): AIAnalysis.jsx previously defined a local
//   SOLO_401K_DEFERRAL_LIMITS object { 2024: 23000, 2025: 23500, 2026: 24000 }.
//   Migrated to TAX_TABLES[year].retirement.solo401kDeferral in taxCalc.js.
//   AIAnalysis.jsx now reads getTable(year).retirement?.solo401kDeferral ?? 23500.
//   The stale-2026-value risk is eliminated — update TAX_TABLES when IRS announces COLA.
//
// RESOLVED (fix/constants-labels PR): Dashboard.jsx previously hardcoded SCORP_REASONABLE_COMP_RATIO_THRESHOLD
//   as a local const. Centralized here and Dashboard.jsx updated to import it in the same PR.
//   constants-centralization-03 complete.
//
// RESOLVED (F-M02): The 0% ownership falsy evaluation pattern was previously documented as
//   an "accepted trade-off." It has been fixed — see entityPredicates.js ownPct() helper.
//   All call sites in taxCalc.js, AIAnalysis.jsx, TaxReturn.jsx, and Dashboard.jsx updated.
//
// RESOLVED (C-01): Plan identifier "basic" stored in localStorage conflicted with "Starter"
//   displayed in the UI. PLAN_IDS and PLAN_DISPLAY_NAMES added below so all plan-identity
//   checks use a single constant instead of string literals. Settings.jsx and any plan-gate
//   code should normalise the legacy "basic" value using PLAN_DISPLAY_NAMES.
//
// ── Missing TAX_TABLES keys (needed for full centralization) ────────────────
// taxCalc.js TAX_TABLES[year] now includes a `retirement` object with:
//   sepIraMax         — §415(c) overall SEP-IRA limit
//   solo401kDeferral  — employee elective deferral limit
//   solo401kMax       — §415(c) overall Solo 401(k) limit (excl. catch-up)
//   catchUp401k       — standard catch-up age ≥ 50 (excl. 60–63)
//   catchUp401kSuper  — SECURE 2.0 enhanced catch-up ages 60–63
//   iraLimit          — Traditional / Roth IRA limit
//   catchUpIra        — IRA catch-up age ≥ 50 ($1,000; not inflation-adjusted)
// constants-centralization-02 complete.
//
// ── AMT exemptions and phase-out ranges ─────────────────────────────────────
// AMT_RATE_LOW and AMT_RATE_HIGH (permanent rates) are defined in this file.
// AMT exemption dollar amounts and phase-out ranges are inflation-adjusted annually
// and belong in AMT_TABLES[year] in taxCalc.js — they are NOT defined here.
// (e.g., 2024 exemptions: $85,700 single / $133,300 MFJ — add to TAX_TABLES.)

// ─── API ─────────────────────────────────────────────────────────────────────
// Branded CloudFront URL — all components use this constant; do not hardcode the
// raw API Gateway URL (https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod)
// anywhere in the codebase. CloudFront / WAF rules apply uniformly only when
// requests route through app.taxstat360.com.
export const API_BASE_URL = 'https://app.taxstat360.com'

// ─── FICA — IRC §3101 / §3111 ─────────────────────────────────────────────────
// Employee and employer shares are symmetric (each 6.2% SS + 1.45% Medicare).
// Social Security portion applies only up to TAX_TABLES[year].ssWageBase (taxCalc.js).
// Above ssWageBase only Medicare applies (combined 2.9%, uncapped).
// When advising on FICA savings, always reference ssWageBase:
//   - Rate is 15.3% (combined) on wages up to ssWageBase
//   - Rate is 2.9%  (Medicare only) on wages above ssWageBase
export const FICA_SS_RATE       = 0.062   // per side; combined 12.4% on SS-subject wages
export const FICA_MEDICARE_RATE = 0.0145  // per side; combined 2.9% uncapped

// ─── ADDITIONAL MEDICARE TAX — IRC §3101(b)(2) / §1401(b)(2) ─────────────────
// 0.9% surcharge on wages and SE income above the threshold.
// Employee-only — no employer match on this portion.
//
// Thresholds (statutory; NOT inflation-adjusted since ACA enactment — §3101(b)(2)):
//   §3101(b)(2)(A) — joint return → $250,000
//   §3101(b)(2)(B) — married filing separately → $125,000
//   §3101(b)(2)(C) — any other case (single, HOH) → $200,000
//
// Important: employer withholding triggers at $200,000 in wages regardless of filing
// status. The individual true-up (excess or credit) happens at filing. This differs from
// NIIT, which has NO withholding mechanism — both taxes share the same dollar values
// but have entirely different collection mechanics. Do not conflate them in calcTaxReturn
// or clients with investment income will underestimate their estimated payment obligations.
export const ADDITIONAL_MEDICARE_TAX_RATE             = 0.009   // IRC §3101(b)(2) / §1401(b)(2)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ    = 250000  // IRC §3101(b)(2)(A)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFS    = 125000  // IRC §3101(b)(2)(B)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE = 200000  // IRC §3101(b)(2)(C)

// ─── NET INVESTMENT INCOME TAX (NIIT) — IRC §1411 ────────────────────────────
// 3.8% on the lesser of:
//   (a) net investment income, OR
//   (b) the amount by which MAGI exceeds the applicable threshold.
//
// Thresholds (statutory; NOT inflation-adjusted since ACA enactment — §1411(b)):
//   §1411(b)(1) — joint return or surviving spouse → $250,000
//   §1411(b)(2) — married filing separately → ½ of §1411(b)(1) → $125,000
//     Note: the statute cross-references paragraph (1) rather than hardcoding $125,000.
//     The computed value is used here. If MFJ threshold ever changes, MFS = MFJ ÷ 2.
//   §1411(b)(3) — any other case (single, HOH, QSS) → $200,000
//
// Net investment income includes: passive K-1 income, rental income (for non-REPs),
// capital gains, qualified dividends, interest income.
// Does NOT include: active S-Corp K-1 income where the shareholder materially participates,
// wages, self-employment income, distributions from qualified retirement plans.
//
// No withholding mechanism — flows entirely through Form 8960 and estimated payments.
export const NIIT_RATE              = 0.038   // IRC §1411(a)
export const NIIT_THRESHOLD_MFJ     = 250000  // IRC §1411(b)(1) — joint return / surviving spouse
export const NIIT_THRESHOLD_MFS     = 125000  // IRC §1411(b)(2) — married filing separately (½ of MFJ)
export const NIIT_THRESHOLD_SINGLE  = 200000  // IRC §1411(b)(3) — single, HOH, and all other filers

// ─── SELF-EMPLOYMENT TAX DEDUCTION — IRC §164(f) ─────────────────────────────
// Above-the-line deduction equal to 50% of self-employment tax paid.
// Reduces AGI; applied on Schedule 1, Line 15 of Form 1040.
// Applies to sole proprietors and active partners only — S-Corp shareholder-employees
// pay FICA on W-2 wages (not SE tax) and do not use this deduction.
export const SE_TAX_DEDUCTION_RATE = 0.50  // IRC §164(f)

// ─── SE TAX NET EARNINGS FACTOR — IRC §1402(a)(12) ───────────────────────────
// Self-employment tax is computed on 92.35% of net self-employment income, not 100%.
// This reduction accounts for the employer-equivalent deduction (half of SE tax).
// Formula: net SE income × 0.9235 = SE earnings subject to tax
// Then: SE earnings × SE tax rate (15.3% up to SS wage base, 2.9% above) = SE tax owed.
//
// FICA on W-2 wages does NOT use this factor — FICA applies to 100% of wages.
// When computing S-Corp FICA savings vs. sole-prop SE tax on the same distributions,
// the comparison must use 0.9235 × distributions × SE rate (not distributions × FICA rate)
// to avoid overstating the S-Corp advantage.
// See: taxCalc.js ficaSavings calculation (TC-10 fix).
export const SE_NET_EARNINGS_FACTOR = 0.9235  // IRC §1402(a)(12)

// ─── NET OPERATING LOSS — IRC §172(a)(2) (TCJA / OBBBA) ─────────────────────
// Post-2017 NOL carryforwards are limited to 80% of taxable income before the
// NOL deduction. The pre-2018 unlimited carryback / unlimited carryforward rules
// do NOT apply to NOLs arising in 2018 or later.
// OBBBA (P.L. 119-21) retained the TCJA 80% cap for post-2017 NOLs.
// TaxStat360 applies this cap to all entered NOL carryforwards as a conservative
// planning default — if the user has a confirmed pre-2018 NOL they should note that
// their actual deductible amount may be slightly higher.
// Referenced in calcTaxReturn; centralised here so future rate changes require one edit.
export const NOL_CARRYFORWARD_CAP_RATE = 0.80  // IRC §172(a)(2)

// ─── PASSIVE ACTIVITY LOSS — IRC §469(i) ─────────────────────────────────────
// §469(i) active-participation special allowance: up to $25,000 in rental losses
// can offset non-passive income for non-REP active participants. This allowance
// phases out at 50 cents per dollar of AGI above $100,000, and is $0 for MFS filers
// and above $150,000 AGI for all other filing statuses.
//
// Phase-out mechanics (§469(i)(3)(A)):
//   Reduction = PAL_PHASE_OUT_RATE × max(0, AGI − PAL_PHASE_OUT_START)
//   Allowance = max(0, PAL_SPECIAL_ALLOWANCE_BASE − Reduction)
//   Allowance is fully eliminated when AGI ≥ PAL_PHASE_OUT_END.
//
// Thresholds: NOT inflation-adjusted — these are statutory dollar amounts in §469(i)(3)(A).
// MFS filers: $0 allowance regardless of AGI — §469(i)(4).
//
// Usage: REP (Real Estate Professional) status bypasses §469(i) entirely —
//   REPs deduct unlimited rental losses against ordinary income if they materially
//   participate (§469(c)(7)). PAL_* constants only apply to non-REP active participants.
export const PAL_SPECIAL_ALLOWANCE_BASE = 25000   // §469(i)(2) — max allowance
export const PAL_PHASE_OUT_START        = 100000  // §469(i)(3)(A) — phase-out begins here
export const PAL_PHASE_OUT_END          = 150000  // §469(i)(3)(A) — allowance = $0 at this AGI
export const PAL_PHASE_OUT_RATE         = 0.50    // §469(i)(3)(A) — 50 cents per dollar of excess

// ─── S-CORP REASONABLE COMPENSATION — IRC §3121; Rev. Rul. 74-44 ─────────────
// The IRS requires S-Corp shareholder-employees to receive reasonable compensation
// (W-2 salary) for services rendered before taking K-1 distributions.
// TaxStat360 uses a 40% ratio as a planning heuristic: if officer salary is less than
// 40% of total S-Corp compensation (salary + K-1 distributions), an alert is surfaced.
//
// IMPORTANT — this is a scrutiny signal, NOT a safe harbor or statutory floor:
//   Rev. Rul. 74-44:  IRS authority to recharacterize distributions as wages.
//   Watson v. Comm'r, 668 F.3d 1008 (8th Cir. 2012): affirmed recharacterization
//     where officer took $24K salary on ~$200K total compensation (12% ratio — extreme case).
//   Spicer Accounting, Inc. v. United States, 918 F.2d 90 (9th Cir. 1990): established
//     that reasonable compensation is based on services performed, supporting ratio analysis.
//
// The 40% figure is an industry-practice heuristic derived from IRS enforcement patterns.
// It is not found in any statute or regulation. "Reasonable compensation" is a facts-and-
// circumstances determination — a salary could be reasonable at 35% or unreasonable at 55%.
// This constant drives a planning alert only; users should confirm with their CPA.
//
// Formerly hardcoded in Dashboard.jsx. Centralized here per constants-centralization-03.
export const SCORP_REASONABLE_COMP_RATIO_THRESHOLD = 0.40  // IRS scrutiny heuristic; see above

// ─── CORPORATE INCOME TAX — IRC §11 ──────────────────────────────────────────
// Flat 21% post-TCJA (P.L. 115-97, enacted 2017-12-22).
// Applies to C-Corps only; S-Corps, partnerships, and sole props are pass-through.
export const C_CORP_TAX_RATE = 0.21

// ─── ALTERNATIVE MINIMUM TAX (AMT) — IRC §55(b)(1) ───────────────────────────
// Two-rate structure on Alternative Minimum Taxable Income (AMTI) after exemption.
// The dollar inflection threshold between AMT_RATE_LOW and AMT_RATE_HIGH is
// year-specific — see AMT_TABLES[year].bracket26_28 in taxCalc.js.
// AMT exemptions and phase-out ranges are inflation-adjusted annually and belong
// in TAX_TABLES[year] in taxCalc.js — they are NOT defined here.
//   (2024 reference values: exemption $85,700 single / $133,300 MFJ;
//    phase-out start $609,350 single / $1,218,700 MFJ — add to TAX_TABLES.)
export const AMT_RATE_LOW  = 0.26  // IRC §55(b)(1)(A) — 26% on AMTI up to bracket26_28
export const AMT_RATE_HIGH = 0.28  // IRC §55(b)(1)(B) — 28% on AMTI above bracket26_28

// ─── LONG-TERM CAPITAL GAINS & QUALIFIED DIVIDENDS — IRC §1(h) ───────────────
// Three permanent rate tiers; income thresholds are year-specific (TAX_TABLES[year].ltcg).
// Rates apply to net long-term capital gains and qualified dividends; they stack on top of
// ordinary income (i.e., the applicable rate depends on where LTCG falls in the stack).
export const LTCG_RATE_LOW  = 0.00  // IRC §1(h)(1)(B) — 0%  tier
export const LTCG_RATE_MID  = 0.15  // IRC §1(h)(1)(C) — 15% tier
export const LTCG_RATE_HIGH = 0.20  // IRC §1(h)(1)(D) — 20% tier

// Unrecaptured Section 1250 gain — IRC §1(h)(1)(D) / §1(h)(7)
// Depreciation recapture on real property sold at a gain.
// Taxed at max 25% (the taxpayer pays the lesser of 25% or their ordinary bracket rate;
// 25% is used as the conservative planning ceiling for mid/high-income filers).
export const UNRECAPTURED_1250_MAX_RATE = 0.25  // IRC §1(h)(1)(D), §1(h)(7)

// Collectibles gain — IRC §1(h)(4)
// Coins, art, antiques, gems, stamps — held more than 1 year.
// Taxed at max 28% (same ceiling applies: lesser of 28% or ordinary bracket rate).
export const COLLECTIBLES_MAX_RATE = 0.28  // IRC §1(h)(4)

// ─── §199A QUALIFIED BUSINESS INCOME (QBI) DEDUCTION ─────────────────────────
// IRC §199A; Treas. Reg. §1.199A-1 through §1.199A-6
//
// Step 1 — Tentative deduction per entity:
//   QBI_DEDUCTION_RATE × qualified business income (20% of QBI)
//
// Step 2 — W-2 wage / UBIA limitation (applies when taxable income > threshold):
//   Income threshold: TAX_TABLES[year].qbi.threshold
//   When fully phased in, per-entity combined QBI amount = LESSER of Step 1 OR:
//     GREATER of:
//       W2_WAGE_LIMIT_RATE × W-2 wages paid by the business    [50% of W-2]
//       W2_WAGE_ALT_RATE × W-2 wages + UBIA_RATE × UBIA        [25% W-2 + 2.5% UBIA]
//   IRC §199A(b)(2); Treas. Reg. §1.199A-1(d)(2)
//
// Step 3 — Overall taxable income cap (final ceiling, applied after Step 2):
//   QBI_DEDUCTION_RATE × (taxable income − net capital gains)
//   IRC §199A(a)(2). This cap applies even when W-2 wages are high — last constraint.
//
// Step 4 — SSTB limitation: phases out at high income per TAX_TABLES[year].
//
// §199A(i) OBBBA minimum deduction (tax years beginning after 12/31/2025):
//   If active QBI ≥ $1,000, deduction = GREATER of regular calc or $400.
//   Dollar amounts are year-specific and in QBI_MIN_DEDUCTION / QBI_MIN_THRESHOLD (taxCalc.js).
export const QBI_DEDUCTION_RATE = 0.20   // IRC §199A(a)           — 20% of QBI
export const W2_WAGE_LIMIT_RATE = 0.50   // IRC §199A(b)(2)(A)     — 50% of W-2 wages
export const W2_WAGE_ALT_RATE   = 0.25   // IRC §199A(b)(2)(B)(i)  — 25% of W-2 wages
export const UBIA_RATE          = 0.025  // IRC §199A(b)(2)(B)(ii) — 2.5% of UBIA
                                         //   UBIA = Unadjusted Basis Immediately After Acquisition
                                         //   (the original cost basis of qualified property, not reduced
                                         //    by depreciation — IRC §199A(b)(6)(B))

// ─── RETIREMENT PLANS ─────────────────────────────────────────────────────────
// Contribution RATES are permanent (defined here).
// Dollar LIMITS are year-specific and live in TAX_TABLES[year].retirement (taxCalc.js).

// ── SEP-IRA — IRC §408(k); §402(h) ───────────────────────────────────────────
// Employer-only contribution. For S-Corp shareholder-employees:
//   - Contribution base = W-2 officer compensation ONLY
//   - K-1 distributions do NOT count as compensation — IRC §402(h)(2)(A)
//   - S-Corp makes the contribution at the entity level (deductible on Form 1120-S)
//   - Max contribution = lesser of (SEP_IRA_RATE × W-2) OR dollar limit in TAX_TABLES
//   - Deadline: entity tax filing date including extensions
//     → S-Corp (Form 1120-S): September 15 (NOT October 15 — see LBL-I01 audit fix)
//     → Sole Prop (Form 1040): October 15
export const SEP_IRA_RATE = 0.25   // 25% of W-2 compensation — IRC §402(h)(2)(A)

// ── Solo 401(k) — IRC §401(k); §415(c); §404(a)(3) ───────────────────────────
// Employer profit-sharing contribution rate (same as SEP-IRA).
// Employee elective deferral limit is year-specific → TAX_TABLES[year].retirement.solo401kDeferral.
// Combined total capped at TAX_TABLES[year].retirement.solo401kMax (§415(c) overall limit).
export const SOLO_401K_EMPLOYER_RATE = 0.25  // 25% of W-2 compensation — IRC §404(a)(3)

// ── Retirement plan catch-up eligibility ages — SECURE 2.0 Act §109 ──────────
// These are law-defined structural ages, not year-specific dollar limits.
// IRC §414(v)(2)(E) as amended by SECURE 2.0 (P.L. 117-328, enacted 2022-12-29).
// Standard catch-up: age ≥ 50 in the tax year.
// Super catch-up:    ages 60–63 in the tax year; reverts to standard at age 64.
//   At age 64+: catch-up returns to standard $7,500 (2025) — the super catch-up
//   window is ONLY ages 60, 61, 62, 63 (inclusive). This is a common planning error.
// Dollar amounts are year-specific → TAX_TABLES[year].retirement.catchUp401k/catchUp401kSuper.
export const CATCHUP_AGE_STANDARD    = 50  // IRC §414(v)(1) — standard catch-up start age
export const CATCHUP_AGE_SUPER_START = 60  // SECURE 2.0 §109 — enhanced catch-up window start
export const CATCHUP_AGE_SUPER_END   = 63  // SECURE 2.0 §109 — enhanced catch-up window end (inclusive)

// ─── ENTITY TYPES ─────────────────────────────────────────────────────────────
// Display labels — used in dropdowns and entity cards.
// Partnership / MMLLC is split into Active and Passive per IRC §1402(a)(13):
//   limited partners' distributive shares are excluded from SE tax (passive variant).
//   Only Active (general partners / material participants) are SE-subject.
export const ENTITY_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / MMLLC — Active',
  'Partnership / MMLLC — Passive',
  'S Corporation',
  'C Corporation',
]

// Pass-through entities: K-1 income flows to the owner's personal 1040.
// Both Active and Passive partnership variants are pass-through (file Form 1065).
export const PASSTHROUGH_ENTITY_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / MMLLC — Active',
  'Partnership / MMLLC — Passive',
  'S Corporation',
]

// SE-subject entity types: drive SE tax calculation in calcTaxReturn.
// S-Corp distributions are NOT SE-subject (officer W-2 salary is FICA-taxed instead).
// Per IRC §1402(a)(13), passive partners/members excluded — Active variant only is SE-subject.
export const SE_SUBJECT_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / MMLLC — Active',
]

// ─── ACCOUNTING SOFTWARE INTEGRATIONS ─────────────────────────────────────────
// abbr values are displayed as badge text on integration logo tiles (Landing.jsx, Onboarding.jsx).
// LBL-01 fix: Xero corrected from 'XE' → 'X' (XE is the currency converter XE.com, not Xero).
//             Wave corrected from 'WV' → 'W' (WV is non-standard; Wave's own mark uses 'W').
export const INTEGRATIONS = [
  { id: 'quickbooks', name: 'QuickBooks', color: '#2CA01C', bg: '#F0FBF0', abbr: 'QB' },
  { id: 'xero',       name: 'Xero',       color: '#13B5EA', bg: '#EFF9FF', abbr: 'X'  },
  { id: 'wave',       name: 'Wave',       color: '#2C6ECB', bg: '#EFF4FF', abbr: 'W'  },
  { id: 'freshbooks', name: 'FreshBooks', color: '#1a9c3e', bg: '#F0FBF4', abbr: 'FB' },
]

// ─── SUBSCRIPTION PLAN IDENTIFIERS ───────────────────────────────────────────
// C-01 FIX: localStorage was storing plan as 'basic' while the UI showed
// 'Starter Plan'. This discrepancy meant any code checking plan === 'starter'
// would silently fail while 'basic' passed (or vice versa).
//
// ALL plan-identity comparisons throughout the codebase MUST use PLAN_IDS
// constants — never bare string literals. The legacy 'basic' alias in
// PLAN_DISPLAY_NAMES lets Settings.jsx / Upgrade.jsx normalise the stored
// value without a migration script.
//
// To read plan safely:
//   import { PLAN_IDS, PLAN_DISPLAY_NAMES } from './constants.js'
//   const raw  = localStorage.getItem('plan') || ''
//   const plan = raw === 'basic' ? PLAN_IDS.STARTER : raw   // normalise legacy value
//   const name = PLAN_DISPLAY_NAMES[plan] ?? 'Starter'
//
// To write plan (from API response):
//   localStorage.setItem('plan', PLAN_IDS.STARTER)          // NOT 'basic' / 'Starter'
export const PLAN_IDS = {
  STARTER:      'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE:   'enterprise',
}

// Human-readable display labels — used in Settings.jsx plan badge, Upgrade.jsx headings,
// and any UI that names the current plan tier.
// The 'basic' key is a legacy alias for the pre-C-01 stored value. Treat it as Starter.
export const PLAN_DISPLAY_NAMES = {
  starter:      'Starter',
  professional: 'Professional',
  enterprise:   'Enterprise',
  basic:        'Starter',   // legacy alias — stored before C-01 fix; normalise on read
}

// ─── SUBSCRIPTION PRICING ─────────────────────────────────────────────────────
// Monthly base prices — displayed on Landing.jsx pricing section and Upgrade.jsx.
// Annual pricing = monthly × ANNUAL_BILLING_MONTHS (10 months billed, 2 months free).
// Upgrade.jsx must reference these constants; no hardcoded pricing values in components.
//
// To change pricing: update these constants only. Upgrade.jsx and Landing.jsx will
// reflect the change automatically on next build.
export const PRICE_STARTER_MONTHLY      = 79   // USD/month
export const PRICE_PROFESSIONAL_MONTHLY = 149  // USD/month
export const PRICE_ENTERPRISE_MONTHLY   = 299  // USD/month
export const ANNUAL_BILLING_MONTHS      = 10   // months charged on annual plan (2 months free)
export const ANNUAL_DISCOUNT_LABEL      = 'Save 2 months'  // display copy — update if discount changes

// ─── IRS STANDARD MILEAGE RATES ───────────────────────────────────────────────
// Published annually by IRS in late November / December for the following calendar year.
// Sources: IRS Notice 2024-08 (2024 rate), IRS Notice 2025-05 (2025 rate).
//
// Usage: AIAnalysis.jsx reads getTable(year)?.mileageRate from TAX_TABLES in taxCalc.js.
// taxCalc.js TAX_TABLES[year] should include a mileageRate key for each year.
// This map is a fallback reference and the authoritative source for updating TAX_TABLES.
//
// Audit finding T-06: mileageRate key was absent from TAX_TABLES, so AIAnalysis.jsx
// was silently falling back to the hardcoded inline value (0.70 for 2025+).
// Fix: add mileageRate to each year in TAX_TABLES in taxCalc.js.
//
// ⚠ ANNUAL UPDATE REQUIRED: verify 2026 rate against IRS.gov/newsroom each December.
// If the 2026 rate has changed from 0.70, update taxCalc.js TAX_TABLES[2026].mileageRate
// and the 2026 entry in this map simultaneously.
export const IRS_MILEAGE_RATES = {
  2024: 0.67,  // IRS Notice 2024-08 — 67¢/mile for business use
  2025: 0.70,  // IRS Notice 2025-05 — 70¢/mile for business use (5¢ increase from 2024)
  2026: 0.70,  // ⚠ ESTIMATED — verify at IRS.gov when 2026 Notice is published
}
