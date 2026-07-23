// src/constants.js
// Single source of truth for PERMANENT constants across TaxStat360.
//
// ── Architecture rule ──────────────────────────────────────────────────────────
// This file  → permanent rates, ratios, structural values, and law-defined
//              thresholds that never change year-to-year (IRC rates, ERISA ages,
//              FICA structure, and statutory dollar amounts explicitly NOT
//              inflation-adjusted).
// taxCalc.js → year-specific dollar figures (brackets, thresholds, limits,
//              phase-outs) stored in the TAX_TABLES[year] object.
//
// Import from here — never hard-code these values in component or utility files.
// When a new tax year is released, only taxCalc.js TAX_TABLES needs updating.
// Add the new year to SUPPORTED_TAX_YEARS below — that one edit advances the
// dropdowns and the CURRENT_TAX_YEAR default simultaneously.
//
// ── ENTITY-TYPE REPRESENTATION (two vocabularies by design) ───────────────────
// 1. UI / input layer (Vocabulary A) — what the user picks and what gets stored:
//    'S Corporation' · 'Partnership / LLC' · 'Sole Proprietor / SMLLC' ·
//    'Real Estate (Schedule E)'
//    This is ENTITY_TYPES below (and PASSTHROUGH_ENTITY_TYPES = ENTITY_TYPES
//    minus C-Corp). It is the canonical set at the boundary.
//
// 2. Engine-internal canonical form (Vocabulary B) — what normalizeEntityType()
//    emits and what the tax engine keys on:
//    'S Corporation' · 'Partnership / MMLLC — Active' · 'Partnership / MMLLC —
//    Passive' · 'Sole Proprietor / Single-Member LLC' · 'Real Estate (Schedule E)'
//    The Active/Passive split exists ONLY in this layer because SE treatment
//    depends on it (§1402(a)(13)) and cannot be expressed in the single UI label.
//
//    normalizeEntityType() (utils/entityPredicates.js) is the one-way bridge A→B.
//    The engine calls it on every entity before any type test. Use the regex
//    predicates (isSCorpEntity, isCCorpEntity, isPassthroughEntity,
//    isRealEstateEntity) — they match EITHER vocabulary.
//    RULE: never test an entity type with exact-string .includes() against an
//    array in the OTHER layer's vocabulary.
//
// ── Historical audit notes ─────────────────────────────────────────────────────
// The RESOLVED() centralization notes that formerly appeared in this file header
// were moved to CHANGELOG.md (audit finding 10.4). See CHANGELOG.md for the
// full history of CC-01, CC-02, CC-03, F-M02, C-01, F-02, and related fixes.
//
// O6 FIX: Added PLAN_FEATURES map — one-line feature summary per plan tier.
// Consumed by Onboarding.jsx SignupScreen plan picker so users can choose their
// plan without leaving the signup page to consult the pricing table.
// Keep these strings short (under 60 chars) — they render at 11px in a constrained card.

// ─── API ─────────────────────────────────────────────────────────────────────
// Branded CloudFront URL — all components use this constant; do not hardcode the
// raw API Gateway URL (https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod)
// anywhere in the codebase. CloudFront / WAF rules apply uniformly only when
// requests route through app.taxstat360.com.
// D-06 (dead-code audit, Jul 2026): removed never-imported constants —
// IRS_MILEAGE_RATES (mileage feature never built), CATCHUP_AGE_* (retirement
// catch-up contributions are not modeled by the engine), FEATURE_CPA_EXPORT_PACK /
// FEATURE_IRS_SCHEDULE_MAP (flags nothing checked), ANNUAL_BILLING_MONTHS.
// If a feature lands that needs one, reintroduce it WITH its consumer in the
// same change — a constant without a consumer is a drift trap (see F-01, F-02).
export const API_BASE_URL = 'https://app.taxstat360.com'

// ─── CURRENT TAX YEAR ────────────────────────────────────────────────────────
// F-02 FIX: Single source of truth for the default tax year fallback.
// Previously, three files each hard-coded || 2025 independently:
// taxCalc.js, AIAnalysis.jsx, TaxReturn.jsx, CalculateTaxInner.jsx, Dashboard.jsx
// Risk: when TAX_TABLES gains a 2027 entry, any un-updated || 2025 literal silently
// uses the wrong year's brackets. Update this constant each December when the new
// year's TAX_TABLES entry is added to taxCalc.js.
//
// ⚠ UPDATE ANNUALLY: when you add TAX_TABLES[2027] to taxCalc.js, add 2027 to
// SUPPORTED_TAX_YEARS below — that single edit advances both the dropdowns and the
// default year. SUPPORTED_TAX_YEARS must mirror the years present in TAX_TABLES.
//
// C-15: SUPPORTED_TAX_YEARS is the single source of truth for selectable tax years.
// The Step-1 / Step-2 year dropdowns map over it, and CURRENT_TAX_YEAR (the latest
// supported year, used as the default + the engine-table fallback) is derived from it
// so the two can never drift apart.
export const SUPPORTED_TAX_YEARS = [2024, 2025, 2026]
export const CURRENT_TAX_YEAR = SUPPORTED_TAX_YEARS[SUPPORTED_TAX_YEARS.length - 1]
// FINDING-7 FIX: the tax-year dropdown defaulted to the LATEST supported year (2026)
// on every new session, because CURRENT_TAX_YEAR = SUPPORTED_TAX_YEARS[last] = 2026.
// During the 2025 filing season (Jan–Oct 2026) almost all users are planning for 2025 —
// their returns are not yet filed and they are making 2025 estimated payments.
// Defaulting to 2026 forces every new user to manually correct the year, which is
// confusing and causes wrong bracket/threshold figures to be displayed by default.
//
// DECISION (F8, Jul 2026 — product owner): default to the CURRENT planning year, not
// the most recently completed one. TaxStat360 is positioned as a real-time, year-round
// planning tool ("see what you're on track to owe right now, not in April"), so a new
// user should land on the year they are actively planning. DEFAULT_TAX_YEAR therefore
// tracks CURRENT_TAX_YEAR and advances automatically when a new year is appended to
// SUPPORTED_TAX_YEARS — no manual January edit required. Users preparing a prior-year
// return can still pick that year from the Tax Year dropdown (Step 1 / Step 2).
// CURRENT_TAX_YEAR remains the engine-table fallback in taxCalc.js getTable().
export const DEFAULT_TAX_YEAR = CURRENT_TAX_YEAR

// C-32:7.1 — single source of truth for the Step-3 ("AI Analysis & Reporting") label.
// Previously the step-3 breadcrumb read "AI Analysis" in Steps 1–2 but "AI Analysis &
// Reporting" on the Step-3 page / nav buttons / route title, so the label changed
// mid-flow. All in-app references now use this constant.
export const STEP3_LABEL = 'AI Analysis & Reporting'

// ─── CANONICAL FEATURE NAMES — single source of truth (audit Categories 8/9) ──
// TERMINOLOGY FIX 9.3/9.4: Three surfaces used three different names for the same
// features. Defining canonical names here so pricing page, nav tabs, and internal
// descriptions always match. Import these — never inline the feature name strings.
//
// Audit Risk: pricing page said "Audit Risk Indicators"; app tab said "Risk Scan"
// → canonical: FEATURE_AUDIT_RISK_SCAN (used in tab label AND pricing copy)
// What-If Simulator: pricing said "What-If Tax Scenario Simulator"; tab label said
// "Tax Optimization"; tab desc said "What-If Tax Simulator"
//   → canonical: FEATURE_WHATIF_SIMULATOR (used in tab label AND pricing copy)
export const FEATURE_AUDIT_RISK_SCAN   = 'Audit Risk Scan'
export const FEATURE_WHATIF_SIMULATOR  = 'Tax Savings Opportunities'
// ─── FINANCIAL LINE LABELS — single source of truth (audit Categories B/C/D/F) —
// Same rationale as STEP3_LABEL above: these P&L / summary labels were inline// literals in CalculateTaxInner, AIAnalysis, Dashboard, and TaxReturn and drifted
// across screens ("Gross Revenue" vs "Gross Receipts", "Officer Salary" vs "Officer
// Compensation", "Net Profit" vs "Net Business Income", the federal-tax headline).
// Centralizing them here makes the same concept read the same everywhere and makes a
// label change a one-line edit. Change a label HERE — never re-inline it in a component.
//
// `*Field` forms carry the parenthetical helper shown next to the input; the plain
// forms are the short labels used in summaries / exports / the simulator.
// NOTE: `totalExpenses` is the GRAND TOTAL (operating + officer comp + depreciation +
// advertising + other) and is deliberately distinct from `operatingExpenses` (the
// editable operating subset) — they are different figures, not synonyms.
export const FINANCIAL_LABELS = {
  grossReceipts:            'Gross Receipts',
  // TERMINOLOGY FIX 1.1: "Gross Receipts (Total Revenue)" conflated two distinct concepts.
  // "Gross receipts" is the IRS/IRC term (Form 1120-S Line 1a; Schedule C Line 1).
  // "Revenue" is a GAAP/accounting term. They are not interchangeable. Use the IRS term.
  // The field label is kept short here; entity-specific form citations live in the tooltips.
  grossReceiptsField:       'Gross Receipts',
  operatingExpenses:        'Operating Expenses',
  operatingExpensesField:   'Operating Expenses (excl. Officer Compensation, Depreciation, Advertising)',
  totalExpenses:            'Total Expenses',
  officerCompensation:      'Officer Compensation',
  officerCompensationField: 'Officer Compensation (W-2)',
  netBusinessIncome:        'Net Business Income',
  netRentalIncome:          'Net Rental Income',
  estFederalIncomeTax:      'EST. FEDERAL INCOME TAX',
  estTotalFederalTax:       'EST. TOTAL FEDERAL TAX',
  // TERMINOLOGY FIX for Schedule C / real estate — separate citation per form
  grossReceiptsFieldScheduleC:  'Gross Receipts (Schedule C, Line 1)',
  grossRentsReceivedField:      'Gross Rents Received (Schedule E, Line 3)',
  // TERMINOLOGY FIX 3.1: "Other Deductions" → "Other Operating Expenses" in entity P&L forms.
  // Items entered here are operating expenses that reduce gross income on the entity return,
  // not "deductions" in the IRC sense (which reduce taxable income on the personal return).
  otherOperatingExpenses:       'Other Operating Expenses',
}

// ─── SUBSCRIPTION PLAN IDENTIFIERS ──────────────────────────────────────────
// C-01 FIX: Canonical plan IDs stored in localStorage['ts360_plan'] by the auth Lambda.
// ALL plan-gate checks must use these constants — never inline string literals.
//
// Storage → display name mapping:
//   PLAN_IDS.STARTER      = 'basic'      ← what the auth Lambda writes to localStorage
//   PLAN_IDS.PROFESSIONAL = 'pro'
//   PLAN_IDS.ENTERPRISE   = 'enterprise'
//
// LockedFeature.jsx isPro() must compare: readPlan() === PLAN_IDS.PROFESSIONAL
// Settings.jsx plan display must use: PLAN_DISPLAY_NAMES[readPlan() || 'basic']
//
// ⚠ Do NOT change the string VALUES — they must match what the Lambda writes.
// Only rename the JavaScript identifiers (STARTER, PROFESSIONAL, ENTERPRISE) if needed.
export const PLAN_IDS = {
  STARTER: 'basic',       // Free-tier / Starter plan
  PROFESSIONAL: 'pro',    // Professional plan ($149/mo)
  ENTERPRISE: 'enterprise', // Enterprise plan ($299/mo)
}

// Human-readable display names keyed by the storage value.
// Usage: PLAN_DISPLAY_NAMES[readPlan()] ?? 'Starter'
export const PLAN_DISPLAY_NAMES = {
  basic: 'Starter',
  pro: 'Professional',
  enterprise: 'Enterprise',
}

// O6 FIX: One-line feature summary per plan — consumed by Onboarding.jsx SignupScreen
// plan picker so users understand what each tier includes without leaving the signup page.
// Keep each string under ~60 characters (renders at 11px in a 150px-wide card column).
// Update these whenever plan features change; they are display copy, not functional gates.
export const PLAN_FEATURES = {
  basic: '1 business + 3 rentals · core tax tracker · quarterly estimates',
  starter: '1 business + 3 rentals · core tax tracker · quarterly estimates',
  pro: '3 business entities · AI analysis · CPA Export tools',
  professional: '3 business entities · AI analysis · CPA Export tools',
  // AUDIT F-9 (Jul 2026): "multi-user" was advertised HERE and nowhere else in the
  // product — no seats, no team management, nothing. A $299/mo customer who subscribed
  // for team access had a clean refund claim and a bad first support ticket. Removed.
  // If multi-user is ever built, put it back — and add it to the pricing table and the
  // comparison grid in the same commit, so the three never drift again.
  enterprise: 'Unlimited entities · consolidated multi-entity view · priority support',
}

// Per-plan entity caps — business vs Schedule E rentals are counted separately.
// Keys match LockedFeature.getUserPlan() (starter / professional / enterprise).
export const PLAN_ENTITY_LIMITS = {
  starter:      { business: 1, realEstate: 3 },
  professional: { business: 3, realEstate: Number.POSITIVE_INFINITY },
  enterprise:   { business: Number.POSITIVE_INFINITY, realEstate: Number.POSITIVE_INFINITY },
}

// ─── FICA — IRC §3101 / §3111 ─────────────────────────────────────────────────
// Employee and employer shares are symmetric (each 6.2% SS + 1.45% Medicare).
// Social Security portion applies only up to TAX_TABLES[year].ssWageBase (taxCalc.js).
// Above ssWageBase only Medicare applies (combined 2.9%, uncapped).
// When advising on FICA savings, always reference ssWageBase:
//   - Rate is 15.3% (combined) on wages up to ssWageBase
//   - Rate is 2.9% (Medicare only) on wages above ssWageBase
export const FICA_SS_RATE = 0.062        // IRC §3101(a) / §3111(a) — 6.2% per side
export const FICA_MEDICARE_RATE = 0.0145 // IRC §3101(b) / §3111(b) — 1.45% per side

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
export const ADDITIONAL_MEDICARE_TAX_RATE = 0.009          // IRC §3101(b)(2) / §1401(b)(2)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ = 250000  // IRC §3101(b)(2)(A)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFS = 125000  // IRC §3101(b)(2)(B)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE = 200000 // IRC §3101(b)(2)(C)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_HOH = 200000 // IRC §3101(b)(2)(C) — head of household (any other case)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_QSS = 250000 // preserves prior tax-table value for qualifying surviving spouse

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
export const NIIT_RATE = 0.038              // IRC §1411(a)
export const NIIT_THRESHOLD_MFJ = 250000    // IRC §1411(b)(1) — joint return / surviving spouse
export const NIIT_THRESHOLD_MFS = 125000    // IRC §1411(b)(2) — married filing separately (½ of MFJ)
export const NIIT_THRESHOLD_SINGLE = 200000 // IRC §1411(b)(3) — single, HOH, and all other filers
export const NIIT_THRESHOLD_HOH = 200000    // IRC §1411(b)(3) — head of household (grouped with single)
export const NIIT_THRESHOLD_QSS = 250000    // IRC §1411(b)(1) — qualifying surviving spouse (grouped with joint return)

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

// ─── CAPITAL-LOSS LIMITATION — IRC §1211(b) / §1212(b) ──────────────────────
// AUDIT F10 / PASS-6 P6-1 FIX (Jul 2026): noncorporate taxpayers may deduct net
// capital losses against ordinary income only up to $3,000 per year — $1,500 for
// a married individual filing a separate return (§1211(b), flush language). The
// excess carries forward indefinitely under §1212(b), retaining its short/long
// character. These dollar amounts are STATUTORY and NOT inflation-indexed
// (unchanged since 1978; unchanged by OBBBA) — they are fixed constants, not
// TAX_TABLES entries. Consumed by calcTaxReturn's Schedule D netting block; any
// UI surface displaying the limit must import these, never a literal.
export const CAP_LOSS_ORDINARY_LIMIT     = 3000  // IRC §1211(b)(1)
export const CAP_LOSS_ORDINARY_LIMIT_MFS = 1500  // IRC §1211(b) (married filing separately)

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
// REPs deduct unlimited rental losses against ordinary income if they materially
// participate (§469(c)(7)). PAL_* constants only apply to non-REP active participants.
//
// M1 (audit F-01, Jul 2026): these constants are now the LIVE values consumed by
// calc469iAllowance() in taxCalc.js — the single implementation used by both engine
// PAL branches and the AIAnalysis "$25,000 Rental-Loss Allowance" strategy card.
// (They were previously exported but unused while raw literals did the work.)
// PAL_PHASE_OUT_END is derived documentation (START + BASE/RATE); its consistency
// with the other three is asserted in taxCalc-pal.test.js so it can never drift.
export const PAL_SPECIAL_ALLOWANCE_BASE = 25000   // §469(i)(2) — max allowance
export const PAL_PHASE_OUT_START = 100000          // §469(i)(3)(A) — phase-out begins here
export const PAL_PHASE_OUT_END = 150000            // §469(i)(3)(A) — allowance = $0 at this AGI
export const PAL_PHASE_OUT_RATE = 0.50             // §469(i)(3)(A) — 50 cents per dollar of excess

// ─── S-CORP REASONABLE COMPENSATION — IRC §3121; Rev. Rul. 74-44 ─────────────
// The IRS requires S-Corp shareholder-employees to receive reasonable compensation
// (W-2 salary) for services rendered before taking K-1 distributions.
// TaxStat360 uses a 40% ratio as a planning heuristic: if officer salary is less than
// 40% of total S-Corp compensation (salary + K-1 distributions), an alert is surfaced.
//
// IMPORTANT — this is a scrutiny signal, NOT a safe harbor or statutory floor:
//   Rev. Rul. 74-44: IRS authority to recharacterize distributions as wages.
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
export const SCORP_REASONABLE_COMP_RATIO_THRESHOLD = 0.40  // Rev. Rul. 74-44 / Watson (8th Cir. 2012)
// D-10 (dead-code audit, Jul 2026): the $20,000 total-compensation floor below which
// the reasonable-comp alert stays silent — previously a magic number duplicated in
// taxCalc.js and Dashboard.jsx. Heuristic (noise floor), not a statutory figure.
export const SCORP_REASONABLE_COMP_MIN_TOTAL = 20000

// ─── S-CORP GROSS-RECEIPTS SALARY TEST — Rev. Rul. 74-44 / Watson (8th Cir. 2012) ──
// Flags when officer salary falls below 30% of gross receipts — the revenue-to-salary
// ratio scrutinized in Watson v. Comm'r, 668 F.3d 1008 (8th Cir. 2012), where the
// shareholder's salary was roughly 12% of total receipts. This threshold is a planning
// heuristic, not a statutory floor or safe harbor. It exists alongside
// SCORP_REASONABLE_COMP_RATIO_THRESHOLD (the salary-to-total-compensation ratio test)
// as a SECOND advisory signal: the IRS may examine both the ratio of salary to total
// compensation AND the ratio of salary to gross receipts when evaluating reasonable
// compensation. Rev. Rul. 74-44; Treas. Reg. §1.162-7.
//
// ⚠ This is a PLANNING HEURISTIC — not a statutory threshold. Advise clients to
// document the basis for their compensation level (services rendered, comparable wages,
// role, and hours) rather than targeting any specific percentage.
export const SCORP_REVENUE_SALARY_THRESHOLD = 0.30  // Rev. Rul. 74-44 / Watson (8th Cir. 2012) — revenue ratio signal


// ─── S-CORP DEFAULT OFFICER SALARY FRACTION — Rev. Rul. 74-44 / BLS p25 ─────
// F-05 FIX: Previously defined locally in scenarioCompare.js as a file-local const.
// Centralized here so any future module that needs the same heuristic (e.g., an AI
// insight about reasonable compensation) imports from one source instead of re-inventing
// a potentially different value.
//
// This is the default fallback fraction used to estimate officer salary in the
// entity comparison modal when the user has not explicitly entered one.
// The 30% figure aligns with the BLS p25 benchmark for owner-operator compensation
// as a fraction of gross profit and is cited in the Issue #45 design doc.
//
// Source: Rev. Rul. 74-44 (IRS authority to recharacterize); BLS Occupational Employment
// Statistics, 25th percentile compensation as a fraction of small-business gross profit.
// The BLS p25 lookup was scoped for a future PR — this constant is the planning fallback.
//
// ⚠ This is a PLANNING HEURISTIC, not a statutory floor. See also:
// SCORP_REASONABLE_COMP_RATIO_THRESHOLD (40%) which drives the alert threshold.
export const DEFAULT_OFFICER_SALARY_FRACTION = 0.30  // Rev. Rul. 74-44 / BLS p25 methodology

// ─── CORPORATE INCOME TAX — IRC §11 ──────────────────────────────────────────
// Flat 21% post-TCJA (P.L. 115-97, enacted 2017-12-22).
// Applies to C-Corps only; S-Corps, partnerships, and sole props are pass-through.
export const C_CORP_TAX_RATE = 0.21

// ─── CHILD TAX CREDIT — IRC §24 ─────────────────────────────────
// Per-child credit amount lives in the year tables (taxCalc.js → ctc.perChild).
// §24(b)(2)/(h)(3): the credit is reduced by $50 for each $1,000 (or fraction) of
// modified AGI above these thresholds. Statutory under TCJA (P.L. 115-97); NOT
// inflation-adjusted.
export const CTC_PHASEOUT_THRESHOLD_MFJ = 400000   // §24(h)(3) — joint return / surviving spouse
export const CTC_PHASEOUT_THRESHOLD_OTHER = 200000 // §24(h)(3) — single, HOH, MFS, all other filers
export const CTC_PHASEOUT_STEP = 1000              // §24(b)(2) — excess measured per $1,000
export const CTC_PHASEOUT_REDUCTION_PER_STEP = 50  // §24(b)(2) — $50 reduction per $1,000 step
// IRC §24(h)(2) base child tax credit. SAFETY FALLBACK ONLY — the authoritative
// per-year amount lives in TAX_TABLES[year].ctc.perChild; this is used only if a
// year's table is somehow missing the field, so it can never silently drift.
export const CTC_CREDIT_PER_CHILD_FALLBACK = 2000

// ─── ALTERNATIVE MINIMUM TAX (AMT) — IRC §55(b)(1) ───────────────────────────
// Two-rate structure on Alternative Minimum Taxable Income (AMTI) after exemption.
// The dollar inflection threshold between AMT_RATE_LOW and AMT_RATE_HIGH is
// year-specific — see TAX_TABLES[year].amt.bracket26_28 in taxCalc.js.
// AMT exemptions and phase-out ranges are inflation-adjusted annually and live in
// TAX_TABLES[year].amt in taxCalc.js — they are NOT defined here.
// (2024 reference values: exemption $85,700 single / $133,300 MFJ;
// phase-out start $609,350 single / $1,218,700 MFJ.)
export const AMT_RATE_LOW = 0.26   // IRC §55(b)(1)(A) — 26% on AMTI up to bracket26_28
export const AMT_RATE_HIGH = 0.28  // IRC §55(b)(1)(B) — 28% on AMTI above bracket26_28

// ─── LONG-TERM CAPITAL GAINS & QUALIFIED DIVIDENDS — IRC §1(h) ───────────────
// Three permanent rate tiers; income thresholds are year-specific (TAX_TABLES[year].ltcg).
// Rates apply to net long-term capital gains and qualified dividends; they stack on top of
// ordinary income (i.e., the applicable rate depends on where LTCG falls in the stack).
// LTCG_RATE_LOW is intentionally documentation-only (audit F-15): the engine
// implements the 0% tier implicitly — the 0%-bracket slice of adjusted net capital
// gain is simply never taxed in calcPreferentialTax(). Kept so the three-tier
// statutory structure of §1(h)(1)(B)–(D) reads completely in one place.
export const LTCG_RATE_LOW = 0.00   // IRC §1(h)(1)(B) — 0% tier
export const LTCG_RATE_MID = 0.15   // IRC §1(h)(1)(C) — 15% tier
export const LTCG_RATE_HIGH = 0.20  // IRC §1(h)(1)(D) — 20% tier

// Unrecaptured Section 1250 gain — IRC §1(h)(1)(E) (25% rate) / §1(h)(6) (definition)
// Depreciation recapture on real property sold at a gain.
// Taxed at max 25% (the taxpayer pays the lesser of 25% or their ordinary bracket rate;
// 25% is used as the conservative planning ceiling for mid/high-income filers).
// F-03 FIX: This constant existed but was NOT imported or used in calcPreferentialTax.
// Lines ~323-324 of taxCalc.js used raw 0.25 and 0.28 literals instead. Fixed in taxCalc.js.
export const UNRECAPTURED_1250_MAX_RATE = 0.25  // IRC §1(h)(1)(E), §1(h)(6)

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
//       W2_WAGE_LIMIT_RATE × W-2 wages paid by the business [50% of W-2]
//       W2_WAGE_ALT_RATE  × W-2 wages + UBIA_RATE × UBIA [25% W-2 + 2.5% UBIA]
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
//
// ⚠ C-02 / F-02 note: empty-string pnl fields (netProfit = '') produce NaN via parseFloat.
// NaN fails all numeric comparisons silently (NaN < threshold === false), which caused
// _applyMinQBI to apply the $400 OBBBA floor when QBI was actually zero.
// Fix applied in taxCalc.js: nv() normalization at calcQBI entry + Number.isFinite guard
// in _applyMinQBI. All entity income lookups now use nv() instead of raw parseFloat().
export const QBI_DEDUCTION_RATE = 0.20   // IRC §199A(a) — 20% of QBI
export const W2_WAGE_LIMIT_RATE = 0.50   // IRC §199A(b)(2)(A) — 50% of W-2 wages
export const W2_WAGE_ALT_RATE = 0.25     // IRC §199A(b)(2)(B)(i) — 25% of W-2 wages
export const UBIA_RATE = 0.025           // IRC §199A(b)(2)(B)(ii) — 2.5% of UBIA
// UBIA = Unadjusted Basis Immediately After Acquisition
//        (the original cost basis of qualified property, not reduced
//        by depreciation — IRC §199A(b)(6)(B))

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
export const SEP_IRA_RATE = 0.25  // 25% of W-2 compensation — IRC §402(h)(2)(A)

// Sole proprietors contribute on NET self-employment income, which already bears SE tax.
// The statutory 25%-of-compensation limit becomes an effective ~20% of net profit because
// the contribution base is net of the deductible half of SE tax and of the contribution
// itself: 0.25 / (1 + 0.25) = 0.20 exactly. AIAnalysis uses this for the sole-prop estimate
// so the figure is not hardcoded inline. S-Corp owners use SEP_IRA_RATE (25%) on W-2 salary.
export const SEP_IRA_SOLE_PROP_EFFECTIVE_RATE = 0.20  // 0.25 / 1.25 — net-of-SE-tax effective rate

// ── Solo 401(k) — IRC §401(k); §415(c); §404(a)(3) ───────────────────────────
// Employer profit-sharing contribution rate (same as SEP-IRA).
// Employee elective deferral limit is year-specific → TAX_TABLES[year].retirement.solo401kDeferral.
// Combined total capped at TAX_TABLES[year].retirement.solo401kMax (§415(c) overall limit).
export const SOLO_401K_EMPLOYER_RATE = 0.25  // 25% of W-2 compensation — IRC §404(a)(3)

// ── Retirement plan catch-up eligibility ages — SECURE 2.0 Act §109 ──────────
// These are law-defined structural ages, not year-specific dollar limits.
// IRC §414(v)(2)(E) as amended by SECURE 2.0 (P.L. 117-328, enacted 2022-12-29).
// Standard catch-up: age ≥ 50 in the tax year.
// Super catch-up: ages 60–63 in the tax year; reverts to standard at age 64.
//   At age 64+: catch-up returns to standard $7,500 (2025) — the super catch-up
//   window is ONLY ages 60, 61, 62, 63 (inclusive). This is a common planning error.
// Dollar amounts are year-specific → TAX_TABLES[year].retirement.catchUp401k/catchUp401kSuper.

// ─── ENTITY TYPES ─────────────────────────────────────────────────────────────
// UI / input vocabulary (Vocabulary A — "layer 1" in the representation note above).
// These are the exact <select> options in the Tax Tracker (CalculateTaxInner.jsx) and
// the Onboarding EntityScreen. This is the canonical set at the boundary: what the user
// picks and what gets persisted. The engine does NOT key on these strings directly — it
// keys on the engine-internal form produced by normalizeEntityType(); see SE_SUBJECT_TYPES.
//
// C Corporation IS supported (audit F6 / Module 4 resolved: build out, not remove). It is
// the one non-pass-through type here — it appears in ENTITY_TYPES (a selectable structure)
// but NOT in PASSTHROUGH_ENTITY_TYPES below, and its income is computed via the entity-level
// model in taxCalc.js (calcCCorpCorporateLayer / calcCCorpReturn), never through the
// pass-through K-1 path.
//
// ⚠ When adding a new entity type: update this array, the Tax Tracker <select>, the
// Onboarding EntityScreen, AND the entityPredicates.js regex patterns / normalizeEntityType
// together. The entityPredicates guard test asserts every value here round-trips and is
// classified consistently — run it after any change here.
export const ENTITY_TYPES = [
  'S Corporation',
  'C Corporation',
  'Partnership / LLC',
  'Sole Proprietor / SMLLC',
  'Real Estate (Schedule E)',
]

// All pass-through entity types (all supported types minus C-Corp,
// pass-through, C-Corp excluded). This is a REFERENCE list in the layer-1 vocabulary.
// Do NOT use it for runtime gating against a value that may already be normalized to the
// engine form — that mismatch is exactly the bug Module 1 fixed in Dashboard.jsx. For
// "is this routed through the personal return / engine?", normalize first and use the
// regex predicate isPassthroughEntity() (or, for "anything but a C-Corp", !isCCorpEntity()).
export const PASSTHROUGH_ENTITY_TYPES = [
  'S Corporation',
  'Partnership / LLC',
  'Sole Proprietor / SMLLC',
  'Real Estate (Schedule E)',
]

// SE-subject entity types — ENGINE-INTERNAL form (Vocabulary B / layer 2), i.e. the
// strings normalizeEntityType() emits, NOT the ENTITY_TYPES UI labels. This is deliberate
// and correct: calcTaxReturn normalizes every entity (taxCalc.js) before testing
// SE_SUBJECT_TYPES.includes(e.type), so this array is only ever compared against
// normalized values. Do not "align" these to the ENTITY_TYPES labels — doing so would
// break the engine, which keys on the layer-2 strings.
//   • Sole Proprietor / Single-Member LLC → always SE-subject (Schedule C).
//   • Partnership / MMLLC — Active → SE-subject; — Passive → NOT (so the passive variant
//     is intentionally absent here). The Active/Passive split lives in layer 2 precisely
//     because the single UI 'Partnership / LLC' label cannot carry it; §1402(a)(13).
//   • S-Corp (officer W-2 is FICA-taxed instead) and Real Estate (passive rental) are
//     intentionally NOT SE-subject and therefore absent.
// The entityPredicates guard test pins this classification so it cannot silently drift.
export const SE_SUBJECT_TYPES = [
  'Sole Proprietor / Single-Member LLC',
  'Partnership / MMLLC — Active',
]

// ─── ACCOUNTING SOFTWARE INTEGRATIONS ─────────────────────────────────────────
// abbr values are displayed as badge text on integration logo tiles (Landing.jsx, Onboarding.jsx).
// LBL-01 fix: Xero corrected from 'XE' → 'X' (XE is the currency converter XE.com, not Xero).
// Wave corrected from 'WV' → 'W' (WV is non-standard; Wave's own mark uses 'W').
export const INTEGRATIONS = [
  { id: 'quickbooks', name: 'QuickBooks', color: '#2CA01C', bg: '#F0FBF0', abbr: 'QB' },
  { id: 'xero',       name: 'Xero',       color: '#13B5EA', bg: '#EFF9FF', abbr: 'X'  },
  { id: 'wave',       name: 'Wave',       color: '#2C6ECB', bg: '#EFF4FF', abbr: 'W'  },
  { id: 'freshbooks', name: 'FreshBooks', color: '#1a9c3e', bg: '#F0FBF4', abbr: 'FB' },
]

// Per-integration localStorage/sessionStorage keys follow the shape
// `ts360_<providerId>_<field>`. The field suffix constants lived here (audit E-2)
// alongside integrationKey(), which has been moved to src/utils/integrations.js
// (audit F-09, June 2026). Import integrationKey() from there — never from this file.
// Credential helpers are environment-specific; tax constants are not.

// ─── SUBSCRIPTION PRICING ─────────────────────────────────────────────────────
// Monthly base prices — displayed on Landing.jsx pricing section and Upgrade.jsx.
// Annual pricing: 10 months billed, 2 months free (the ANNUAL_BILLING_MONTHS constant
// that encoded this was removed in D-06 — nothing imported it; this comment is the record).
// Upgrade.jsx must reference these constants; no hardcoded pricing values in components.
//
// To change pricing: update these constants only. Upgrade.jsx and Landing.jsx will
// reflect the change automatically on next build.
// D-06 RESOLVED (Batch 6, Jul 2026): these are now the SINGLE SOURCE for every
// price customers see. PLAN_PRICING below derives the annual-effective monthly
// (10 months billed ÷ 12), the annual total (×10), and the marketing savings
// figure (×2 — two free months) from them; Landing, Onboarding, and Upgrade all
// render from PLAN_PRICING. Change a price HERE and every surface follows.
// A display-freeze test (src/planPricing.test.js) pins today's exact rendered
// strings — it will fail loudly (on purpose) when a price changes, so a price
// change is always a conscious, test-acknowledged act.
export const PRICE_STARTER_MONTHLY = 79       // USD/month
export const PRICE_PROFESSIONAL_MONTHLY = 149 // USD/month
export const PRICE_ENTERPRISE_MONTHLY = 299   // USD/month
export const ANNUAL_DISCOUNT_LABEL = 'Save 2 months'  // display copy — update if discount changes

// Derived per-plan pricing (D-06 single source; see note above PRICE_*).
// NOTE (OBS-9, KNOWN_LIMITATIONS.md): two different "annual savings" formulas
// were ALREADY live before this change — Landing shows monthly×2 (two free
// months: $158/$298/$598) while Upgrade computes (monthly−annualMonthly)×12
// ($156/$300/$600, a rounding artifact of the ÷12). Both are preserved verbatim
// here and at the sites; unifying is an owner display decision.
const _plan = (monthly) => ({
  monthly,
  annualMonthly: Math.round(monthly * 10 / 12),   // 10 months billed, shown per-month
  annualTotal:   monthly * 10,
  annualSavings: monthly * 2,                      // Landing's formula (two free months)
})
export const PLAN_PRICING = {
  starter:      _plan(PRICE_STARTER_MONTHLY),
  professional: _plan(PRICE_PROFESSIONAL_MONTHLY),
  enterprise:   _plan(PRICE_ENTERPRISE_MONTHLY),
}
export const fmtPlanPrice = (n) => '$' + n.toLocaleString('en-US')

// ─── AUTO-RENEWAL DISCLOSURE (FTC negative-option / ROSCA · California ARL) ──────
// AUDIT F-8 (Jul 2026): the word "renew" appeared ZERO times on the signup page, the
// landing page, and the Terms of Service — while the signup form collected a card for a
// trial that auto-bills. Every charge statement was framed NEGATIVELY ("no charge for 7
// days", "you will not be charged until…"), which implies a future charge but never
// states one.
//
// The FTC negative-option rule and California's ARL both expect, BEFORE billing
// information is collected: (a) that it renews automatically, (b) the amount, (c) the
// frequency, (d) the date of the first charge, and (e) how to cancel — plus affirmative
// consent to those specific terms, separate from the general ToS acceptance.
//
// TRIAL_DAYS is the single source of truth; renewalDisclosure() builds the sentence.
// Do not hand-write this copy anywhere — import it.
export const TRIAL_DAYS = 7

/** The date the trial ends, given a start date (defaults to now). */
export const trialEndDate = (from = new Date()) =>
  new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

/** Formatted trial-end date, e.g. "July 19, 2026". */
export const trialEndLabel = (from = new Date()) =>
  trialEndDate(from).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

/**
 * The affirmative auto-renewal sentence shown immediately above the card field.
 * plan: 'starter' | 'professional' | 'enterprise'   billing: 'monthly' | 'annual'
 */
export function renewalDisclosure(plan, billing, from = new Date()) {
  const p = PLAN_PRICING[plan] || PLAN_PRICING.starter
  const isAnnual = billing === 'annual'
  const amount = fmtPlanPrice(isAnnual ? p.annualTotal : p.monthly)
  const cadence = isAnnual ? 'every 12 months' : 'every month'
  return 'Your ' + TRIAL_DAYS + '-day free trial ends on ' + trialEndLabel(from) +
    '. On that date your card will be charged ' + amount + ', and then ' + amount + ' ' +
    cadence + ', automatically, until you cancel. Cancel any time in Settings \u2192 Billing.'
}


// ─── COMPANY IDENTITY / NAP — footer + local SEO ─────────────────────────────
// Single source of truth for the footer's name / address / contact line, consumed by
// the shared <Footer> component (src/Footer.jsx). Audit fix (Pass 5, "Footer is
// implemented at least three different ways"): the NAP previously appeared only on the
// Landing/About footers and was absent from Privacy/Terms. Keeping it identical
// site-wide is a local-SEO signal — do not hardcode the address in individual pages.
export const COMPANY_LEGAL_NAME = 'TaxStat360 LLC'
export const COMPANY_ADDRESS = '3065 Daniels Road, Winter Garden, FL 34787'
export const SUPPORT_EMAIL = 'support@taxstat360.com'

// ─── CANONICAL DISCLAIMER — single source of truth ───────────────────────────
// Audit fix (Pass 5, "Disclaimer wording varies"): the site carried at least three
// disclaimer strings — the Landing/About footer (full), the Privacy/Terms footer
// (shorter; dropped the "not a tax preparation or filing service" and "federal tax
// only" clauses), and the inline boxes on About / pricing. These two constants are now
// the ONLY disclaimer text. <Footer> and every disclaimer box must import from here so
// the wording can never drift again.
// DISCLAIMER_FULL  — footers and standalone disclaimer boxes
// DISCLAIMER_SHORT — tight inline spots (e.g. the pricing-section banner)
// NOTE: this is consumer-facing legal copy. Edit it HERE only; it is owner-approved text.
export const DISCLAIMER_FULL = 'TaxStat360 is a tax planning and estimation tool — not a tax preparation or filing service. Calculations cover federal tax only (state taxes are not included) and are for planning purposes only. This is not professional tax, legal, or financial advice. Consult a licensed tax professional before making any filing or financial decisions.'
export const DISCLAIMER_SHORT = 'Planning and estimation tool — not tax preparation or filing. Federal tax only. Not professional tax advice.'

// ─── MARKETING CTA COPY ───────────────────────────────────────────────────────
// #4 FIX: single source of truth for the trial CTA label + microcopy. Previously
// hand-written per page (Landing, About, Nav, Terms, ResourcesHub) and it drifted —
// ResourcesHub said "Card for verification only," contradicting the auto-billing in the
// Terms and creating an FTC negative-option (ROSCA) disclosure risk. Import these
// everywhere; never hardcode the trial line.
//
// ⚠ Do NOT soften CTA_COPY_* to "card for verification only." The card IS the billing
// instrument: billing begins automatically when the 7-day trial ends, so the accurate,
// FTC-friendly framing is "Card required" + "No charge during the trial" + "Cancel ...".
// CTA_COPY_FULL  — used in the Landing hero
// CTA_COPY_SHORT — used in pricing, bottom CTA, About, and ResourcesHub
export const CTA_LABEL = 'Start Free 7-Day Trial'
// AUDIT F-8b (Jul 2026): was "Cancel in one click" — untrue by either route. Cancelling
// via Settings → Manage Billing is two clicks; the only genuine one-click path is Delete
// Account, which requires typing "DELETE" and erases every saved tax record. Misdescribing
// the cancellation mechanism is precisely what the FTC click-to-cancel rule polices, and
// the claim bought nothing. This wording is true and just as reassuring.
export const CTA_COPY_FULL = 'No charge during your 7-day trial · Card required · Cancel anytime in Settings'
export const CTA_COPY_SHORT = 'No charge for 7 days · Card required · Cancel anytime in Settings'


// ── Federal-tax headline label (audit re-review, Jul 2026) ────────────────────
// The Step-2 results headline and the Dashboard record card render result.totalTax.
// For S-Corp / C-Corp that figure IS federal income tax (SE tax = 0; employee FICA is
// withheld and shown separately), so "EST. FEDERAL INCOME TAX" is correct. For Sole
// Proprietors / Partnerships the SAME figure INCLUDES self-employment tax, so the
// income-tax label is inaccurate and contradicts the waterfall's own "Federal Income
// Tax" line. Choose the label from whether SE tax is part of the number.
export function federalTaxHeadlineLabel(seTax) {
  return (Number(seTax) || 0) > 0
    ? FINANCIAL_LABELS.estTotalFederalTax
    : FINANCIAL_LABELS.estFederalIncomeTax
}
