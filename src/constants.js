// src/constants.js
// Single source of truth for PERMANENT constants across TaxStat360.
//
// Architecture rule:
//   This file  →  permanent rates, ratios, and structural values (never change year-to-year)
//   taxCalc.js →  year-specific dollar figures (brackets, thresholds, limits, phase-outs)
//                 stored in the TAX_TABLES[year] object
//
// Import from here — never hard-code these values in individual component or utility files.
// When a new tax year is released, only taxCalc.js TAX_TABLES needs updating.

// ─── API ─────────────────────────────────────────────────────────────────────

export const API_BASE_URL = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'

// ─── FICA — IRC §3101 / §3111 ─────────────────────────────────────────────────
// Employee and employer shares are symmetric (each 6.2% SS + 1.45% Medicare).
// Social Security portion applies only up to TAX_TABLES[year].ssWageBase (taxCalc.js).
// Above ssWageBase only Medicare applies (combined 2.9%, uncapped).
// When advising on FICA savings, always reference ssWageBase:
//   - Rate is 15.3% (combined) on wages up to ssWageBase
//   - Rate is 2.9%  (Medicare only) on wages above ssWageBase
//   $176,100 for 2025 — see TAX_TABLES in taxCalc.js.
export const FICA_SS_RATE       = 0.062   // per side; combined 12.4% on SS-subject wages
export const FICA_MEDICARE_RATE = 0.0145  // per side; combined 2.9% uncapped

// Additional Medicare Tax — IRC §3101(b)(2) / §1401(b)(2)
// 0.9% surcharge on wages and SE income above the threshold.
// Employee-only — no employer match on this portion.
// Thresholds (not inflation-adjusted since ACA enactment):
//   $200,000 single / $250,000 MFJ / $125,000 MFS
// TAX_TABLES[year].additionalMedicareThreshold must store all three filing-status
// thresholds (single, mfj, mfs) — a single value is insufficient for MFS filers.
// Applied in calcTaxReturn.
export const ADDITIONAL_MEDICARE_TAX_RATE = 0.009

// Net Investment Income Tax (NIIT) — IRC §1411
// 3.8% on the lesser of net investment income OR the amount by which MAGI exceeds
// the threshold. Same thresholds as Additional Medicare Tax (not inflation-adjusted):
//   $200,000 single / $250,000 MFJ / $125,000 MFS
// Applies to passive K-1 income, rental income, capital gains, dividends, and interest.
// Does NOT apply to active S-Corp K-1 income where the shareholder materially participates.
// TAX_TABLES[year].niitThreshold must store all three filing-status thresholds.
export const NIIT_RATE = 0.038  // IRC §1411

// ─── SELF-EMPLOYMENT TAX DEDUCTION — IRC §164(f) ─────────────────────────────
// Above-the-line deduction equal to 50% of self-employment tax paid.
// Reduces AGI; applied on Schedule 1, Line 15 of Form 1040.
// Applies to sole proprietors and active partners only — S-Corp shareholder-employees
// pay FICA on W-2 wages (not SE tax) and do not use this deduction.
export const SE_TAX_DEDUCTION_RATE = 0.50  // IRC §164(f)

// ─── CORPORATE INCOME TAX — IRC §11 ──────────────────────────────────────────
// Flat 21% post-TCJA (P.L. 115-97, enacted 2017-12-22).
// Applies to C-Corps only; S-Corps, partnerships, and sole props are pass-through.
export const C_CORP_TAX_RATE = 0.21

// ─── ALTERNATIVE MINIMUM TAX (AMT) — IRC §55(b)(1) ───────────────────────────
// Two-rate structure on Alternative Minimum Taxable Income (AMTI) after exemption.
// The dollar threshold between AMT_RATE_LOW and AMT_RATE_HIGH is year-specific:
//   TAX_TABLES[year].amtRateThreshold ($220,700 for 2025, same for single and MFJ).
// AMT exemptions and phase-out ranges are also year-specific in TAX_TABLES[year].amt.
export const AMT_RATE_LOW  = 0.26  // IRC §55(b)(1)(A) — 26% on AMTI up to amtRateThreshold
export const AMT_RATE_HIGH = 0.28  // IRC §55(b)(1)(B) — 28% on AMTI above amtRateThreshold

// ─── §199A QUALIFIED BUSINESS INCOME (QBI) DEDUCTION ─────────────────────────
// IRC §199A; Treas. Reg. §1.199A-1 through §1.199A-6
//
// Step 1 — Tentative deduction:
//   QBI_DEDUCTION_RATE × qualified business income (20% of QBI)
//
// Step 2 — Overall taxable income cap (applies regardless of W-2 wages):
//   Deduction cannot exceed 20% of (taxable income − net capital gains).
//   IRC §199A(a)(2). This cap applies even when W-2 wages are high.
//   Compute this ceiling before applying the W-2 wage limitation below.
//
// Step 3 — W-2 wage / UBIA limitation (applies when taxable income > threshold):
//   Income threshold: TAX_TABLES[year].qbi.threshold
//   - Below threshold → full Step 1 deduction; no W-2 wage test required.
//   - Above threshold → limitation phases in proportionally over
//     TAX_TABLES[year].qbi.phaseInRange, then applies fully.
//   When fully phased in, deduction = LESSER of Step 1 (capped by Step 2) OR:
//     GREATER of:
//       W2_WAGE_LIMIT_RATE × W-2 wages paid by the business    [50% of W-2]
//       W2_WAGE_ALT_RATE × W-2 wages + UBIA_RATE × UBIA        [25% W-2 + 2.5% UBIA]
//
// Step 4 — SSTB limitation:
//   Specified service trades or businesses (SSTBs) lose the deduction entirely
//   above the threshold. Phase-out range: TAX_TABLES[year].qbi.sstbPhaseOutStart
//   through TAX_TABLES[year].qbi.sstbPhaseOutEnd.
//
// Year-specific figures in TAX_TABLES[year].qbi:
//   threshold, phaseInRange, sstbPhaseOutStart, sstbPhaseOutEnd

export const QBI_DEDUCTION_RATE = 0.20   // IRC §199A(a)           — 20% of QBI
export const W2_WAGE_LIMIT_RATE = 0.50   // IRC §199A(b)(2)(A)     — 50% of W-2 wages
export const W2_WAGE_ALT_RATE   = 0.25   // IRC §199A(b)(2)(B)(i)  — 25% of W-2 wages
export const UBIA_RATE          = 0.025  // IRC §199A(b)(2)(B)(ii) — 2.5% of UBIA

// ─── RETIREMENT PLANS ─────────────────────────────────────────────────────────
// Contribution RATES are permanent (defined here).
// Dollar LIMITS are year-specific (defined in TAX_TABLES[year].retirement in taxCalc.js):
//   sepIraMax          — §415(c) overall SEP-IRA limit ($70,000 for 2025)
//   solo401kDeferral   — employee elective deferral ($23,500 for 2025)
//   solo401kMax        — §415(c) overall Solo 401(k) limit ($70,000 for 2025, excl. catch-up)
//   catchUp401k        — standard catch-up age ≥ 50, excl. 60–63 ($7,500 for 2025)
//   catchUp401kSuper   — SECURE 2.0 enhanced catch-up ages 60–63 ($11,250 for 2025)
//                        IRC §414(v)(2)(E) as amended by SECURE 2.0 Act §109
//                        Always check client age band — material planning difference.
//   iraLimit           — Traditional / Roth IRA limit ($7,000 for 2025)
//   catchUpIra         — IRA catch-up age ≥ 50 ($1,000 for 2025, not inflation-adjusted)

// ── SEP-IRA — IRC §408(k); §402(h) ───────────────────────────────────────────
// Employer-only contribution. For S-Corp shareholder-employees:
//   - Contribution base = W-2 officer compensation ONLY
//   - K-1 distributions do NOT count as compensation — IRC §402(h)(2)(A)
//   - S-Corp makes the contribution at the entity level (deductible on Form 1120-S)
//   - Max contribution = lesser of (SEP_IRA_RATE × W-2) OR TAX_TABLES[year].retirement.sepIraMax
//   - No employee elective deferral component (employer contribution only)
//   - Deadline: entity tax filing date including extensions (typically Oct 15)
export const SEP_IRA_RATE = 0.25   // 25% of W-2 compensation — IRC §402(h)(2)(A)

// ── Solo 401(k) — IRC §401(k); §415(c); §404(a)(3) ───────────────────────────
// Two distinct components that STACK (total capped at §415(c) overall limit):
//
//   Component 1 — Employee elective deferral (pre-tax or Roth):
//     Standard limit:   TAX_TABLES[year].retirement.solo401kDeferral ($23,500 for 2025)
//     Catch-up ≥ 50 (excl. 60–63): TAX_TABLES[year].retirement.catchUp401k ($7,500 for 2025)
//     Catch-up 60–63 (SECURE 2.0): TAX_TABLES[year].retirement.catchUp401kSuper ($11,250 for 2025)
//     Source: employee's own compensation (reduces W-2 Box 1 if pre-tax)
//
//   Component 2 — Employer profit-sharing contribution:
//     Rate: SOLO_401K_EMPLOYER_RATE × W-2 compensation (same 25% as SEP-IRA)
//     Source: S-Corp pays at entity level, deductible on Form 1120-S
//
//   Total combined limit: TAX_TABLES[year].retirement.solo401kMax ($70,000 for 2025, excl. catch-up)
//
// KEY PLANNING DIFFERENCE vs. SEP-IRA:
//   At moderate W-2 salaries, Solo 401(k) allows significantly higher contributions
//   because the employee deferral is additive (not limited by the 25% rate).
//   Example at $80,000 W-2:
//     SEP-IRA:             25% × $80,000 = $20,000 max
//     Solo 401(k):         $23,500 (deferral) + $20,000 (employer) = $43,500 max
//     Solo 401(k) age 60–63: $23,500 + $11,250 (super catch-up) + $20,000 = $54,750 max
//   Always model both and present the higher-contribution option.
export const SOLO_401K_EMPLOYER_RATE = 0.25  // 25% of W-2 compensation — IRC §404(a)(3)

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
export const INTEGRATIONS = [
  { id: 'quickbooks', name: 'QuickBooks', color: '#2CA01C', bg: '#F0FBF0', abbr: 'QB' },
  { id: 'xero',       name: 'Xero',       color: '#13B5EA', bg: '#EFF9FF', abbr: 'XE' },
  { id: 'wave',       name: 'Wave',       color: '#2C6ECB', bg: '#EFF4FF', abbr: 'WV' },
  { id: 'freshbooks', name: 'FreshBooks', color: '#1a9c3e', bg: '#F0FBF4', abbr: 'FB' },
]

// ─── OWNERSHIP PERCENTAGE FALLBACK ────────────────────────────────────────────
// Throughout the codebase, entity ownership is parsed as:
//   (parseInt(e.own) || 100) / 100
// This pattern defaults to 100% for any missing or invalid value (NaN from '', undefined,
// null, or non-numeric input), which is the correct behavior for the most common user
// scenario (sole owner = 100% automatically when the field is blank).
//
// Known limitation: explicit '0' ownership is also treated as 100% because 0 is falsy
// in JavaScript and triggers the || fallback. This is an accepted trade-off — a 0%
// ownership stake (silent partner with no income allocation) is not a realistic scenario
// for TaxStat360's target users (business owners and real estate investors who are
// active majority owners). If 0% ownership becomes a real use case, replace the
// || fallback with Number.isFinite() at all 11 call sites across 4 files:
//   CalculateTaxInner.jsx (5 sites), TaxReturn.jsx (1), AIAnalysis.jsx (2), taxCalc.js (1)
// and add 3 sites from the officer salary reduce calls that use the same pattern.
// Tracked as F-07-followup-A in the audit followup list.
