// src/constants.js
// Single source of truth for PERMANENT constants across TaxStat360.
//
// Architecture rule:
// This file → permanent rates, ratios, structural values, and law-defined thresholds
//             that never change year-to-year (IRC rates, ERISA ages, FICA structure,
//             and statutory dollar amounts that are explicitly NOT inflation-adjusted).
// taxCalc.js → year-specific dollar figures (brackets, thresholds, limits, phase-outs)
//             stored in the TAX_TABLES[year] object.
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
// RESOLVED (C-01): Plan identifier inconsistency — localStorage stored 'basic' while UI
//   displayed 'Starter'. PLAN_IDS and PLAN_DISPLAY_NAMES added below. All plan-gate checks
//   must use PLAN_IDS.STARTER (= 'basic') rather than inline string literals.
//   LockedFeature.jsx isPro() / isEnterprise() must be updated to compare against
//   PLAN_IDS.PROFESSIONAL and PLAN_IDS.ENTERPRISE respectively.
//
// ── Missing TAX_TABLES keys (needed for full centralization) ────────────────
// taxCalc.js TAX_TABLES[year] now includes a `retirement` object with:
//   sepIraMax       — §415(c) overall SEP-IRA limit
//   solo401kDeferral — employee elective deferral limit
//   solo401kMax     — §415(c) overall Solo 401(k) limit (excl. catch-up)
//   catchUp401k     — standard catch-up age ≥ 50 (excl. 60–63)
//   catchUp401kSuper — SECURE 2.0 enhanced catch-up ages 60–63
//   iraLimit        — Traditional / Roth IRA limit
//   catchUpIra      — IRA catch-up age ≥ 50 ($1,000; not inflation-adjusted)
// constants-centralization-02 complete.
//
// ── AMT exemptions and phase-out ranges ─────────────────────────────────────
// AMT_RATE_LOW and AMT_RATE_HIGH (permanent rates) are defined in this file.
// AMT exemption dollar amounts and phase-out ranges are inflation-adjusted annually
// and belong in AMT_TABLES[year] in taxCalc.js — they are NOT defined here.
// (e.g., 2024 exemptions: $85,700 single / $133,300 MFJ — add to TAX_TABLES.)
//
// ── AUDIT PASS 2 FIXES ───────────────────────────────────────────────────────
// O3 FIX: ENTITY_TYPES was the source of a cross-component mismatch.
//   Previous values:
//     'Sole Proprietor / Single-Member LLC' ← didn't match Tax Tracker's 'Sole Proprietor / SMLLC'
//     'Partnership / MMLLC — Active'        ← Tax Tracker uses 'Partnership / LLC'
//     'Partnership / MMLLC — Passive'       ← Tax Tracker uses 'Partnership / LLC'
//     'S Corporation'                        ← matched
//     'C Corporation'                        ← not supported in Tax Tracker; caused silent mis-routing
//     (no Real Estate entry)                 ← Tax Tracker supports 'Real Estate (Schedule E)'
//
//   CompareModal in CalculateTaxInner.jsx filters ENTITY_TYPES to build comparison scenarios.
//   The mismatch meant CompareModal passed unrecognized type strings to calcTaxReturn, which
//   fell back to Sole Prop behaviour silently — producing incorrect comparison figures.
//
//   ENTITY_TYPES now matches the Tax Tracker entity card <select> exactly (4 types).
//   C Corporation is removed (not supported for tax calculation). Real Estate is added.
//   SE_SUBJECT_TYPES and PASSTHROUGH_ENTITY_TYPES updated to use the same canonical strings.
//   Partnership active/passive distinction is handled at the entity level via entity.isREP /
//   entity.isActiveParticipant flags, not by separate type strings — removing the split
//   simplifies all consumers and eliminates the silent comparison mis-routing.
//
//   Downstream effects:
//     CompareModal (CalculateTaxInner.jsx): now iterates correct 4-type list. Real Estate
//     is filtered from SE and comparison scenarios automatically via SE_SUBJECT_TYPES.
//     entityPredicates.js: isPassthroughEntity, isSCorpEntity, isRealEstateEntity all
//     already use regex patterns — no change needed.
//     calcTaxReturn (taxCalc.js): driven by entity.type string matches in entityPredicates.
//     The regex patterns in entityPredicates already match the new canonical strings.
//
// O6 FIX: Added PLAN_FEATURES map — one-line feature summary per plan tier.
//   Consumed by Onboarding.jsx SignupScreen plan picker so users can choose their
//   plan without leaving the signup page to consult the pricing table.
//   Keep these strings short (under 60 chars) — they render at 11px in a constrained card.

// ─── API ─────────────────────────────────────────────────────────────────────
// Branded CloudFront URL — all components use this constant; do not hardcode the
// raw API Gateway URL (https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod)
// anywhere in the codebase. CloudFront / WAF rules apply uniformly only when
// requests route through app.taxstat360.com.
export const API_BASE_URL = 'https://app.taxstat360.com'

// ─── CURRENT TAX YEAR ────────────────────────────────────────────────────────
// F-02 FIX: Single source of truth for the default tax year fallback.
// Previously, three files each hard-coded || 2025 independently:
//   taxCalc.js, AIAnalysis.jsx, TaxReturn.jsx, CalculateTaxInner.jsx, Dashboard.jsx
// Risk: when TAX_TABLES gains a 2027 entry, any un-updated || 2025 literal silently
// uses the wrong year's brackets. Update this constant each December when the new
// year's TAX_TABLES entry is added to taxCalc.js.
//
// ⚠ UPDATE ANNUALLY: change to 2027 when adding TAX_TABLES[2027] to taxCalc.js.
export const CURRENT_TAX_YEAR = 2026

// ─── SUBSCRIPTION PLAN IDENTIFIERS ──────────────────────────────────────────
// C-01 FIX: Canonical plan IDs stored in localStorage['plan'] by the auth Lambda.
// ALL plan-gate checks must use these constants — never inline string literals.
//
// Storage → display name mapping:
//   PLAN_IDS.STARTER      = 'basic'      ← what the auth Lambda writes to localStorage
//   PLAN_IDS.PROFESSIONAL = 'pro'
//   PLAN_IDS.ENTERPRISE   = 'enterprise'
//
// LockedFeature.jsx isPro() must compare: localStorage.getItem('plan') === PLAN_IDS.PROFESSIONAL
// Settings.jsx plan display must use: PLAN_DISPLAY_NAMES[localStorage.getItem('plan') || 'basic']
//
// ⚠ Do NOT change the string VALUES — they must match what the Lambda writes.
// Only rename the JavaScript identifiers (STARTER, PROFESSIONAL, ENTERPRISE) if needed.
export const PLAN_IDS = {
  STARTER: 'basic',       // Free-tier / Starter plan
  PROFESSIONAL: 'pro',    // Professional plan ($149/mo)
  ENTERPRISE: 'enterprise', // Enterprise plan ($299/mo)
}

// Human-readable display names keyed by the storage value.
// Usage: PLAN_DISPLAY_NAMES[localStorage.getItem('plan')] ?? 'Starter'
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
  basic: '1 entity · core tax tracker · quarterly estimates',
  pro: '3 entities · AI analysis · CPA Export tools',
  enterprise: 'Unlimited entities · multi-user · priority support',
}

// ─── FICA — IRC §3101 / §3111 ─────────────────────────────────────────────────
// Employee and employer shares are symmetric (each 6.2% SS + 1.45% Medicare).
// Social Security portion applies only up to TAX_TABLES[year].ssWageBase (taxCalc.js).
// Above ssWageBase only Medicare applies (combined 2.9%, uncapped).
// When advising on FICA savings, always reference ssWageBase:
//   - Rate is 15.3% (combined) on wages up to ssWageBase
//   - Rate is 2.9% (Medicare only) on wages above ssWageBase
export const FICA_SS_RATE = 0.062         // per side; combined 12.4% on SS-subject wages
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
export const ADDITIONAL_MEDICARE_TAX_RATE = 0.009          // IRC §3101(b)(2) / §1401(b)(2)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFJ = 250000  // IRC §3101(b)(2)(A)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_MFS = 125000  // IRC §3101(b)(2)(B)
export const ADDITIONAL_MEDICARE_TAX_THRESHOLD_SINGLE = 200000 // IRC §3101(b)(2)(C)

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
// REPs deduct unlimited rental losses against ordinary income if they materially
// participate (§469(c)(7)). PAL_* constants only apply to non-REP active participants.
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
export const SCORP_REASONABLE_COMP_RATIO_THRESHOLD = 0.40  // IRS scrutiny heuristic; see above

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

// ─── ALTERNATIVE MINIMUM TAX (AMT) — IRC §55(b)(1) ───────────────────────────
// Two-rate structure on Alternative Minimum Taxable Income (AMTI) after exemption.
// The dollar inflection threshold between AMT_RATE_LOW and AMT_RATE_HIGH is
// year-specific — see AMT_TABLES[year].bracket26_28 in taxCalc.js.
// AMT exemptions and phase-out ranges are inflation-adjusted annually and belong
// in TAX_TABLES[year] in taxCalc.js — they are NOT defined here.
// (2024 reference values: exemption $85,700 single / $133,300 MFJ;
// phase-out start $609,350 single / $1,218,700 MFJ — add to TAX_TABLES.)
export const AMT_RATE_LOW = 0.26   // IRC §55(b)(1)(A) — 26% on AMTI up to bracket26_28
export const AMT_RATE_HIGH = 0.28  // IRC §55(b)(1)(B) — 28% on AMTI above bracket26_28

// ─── LONG-TERM CAPITAL GAINS & QUALIFIED DIVIDENDS — IRC §1(h) ───────────────
// Three permanent rate tiers; income thresholds are year-specific (TAX_TABLES[year].ltcg).
// Rates apply to net long-term capital gains and qualified dividends; they stack on top of
// ordinary income (i.e., the applicable rate depends on where LTCG falls in the stack).
export const LTCG_RATE_LOW = 0.00   // IRC §1(h)(1)(B) — 0% tier
export const LTCG_RATE_MID = 0.15   // IRC §1(h)(1)(C) — 15% tier
export const LTCG_RATE_HIGH = 0.20  // IRC §1(h)(1)(D) — 20% tier

// Unrecaptured Section 1250 gain — IRC §1(h)(1)(D) / §1(h)(7)
// Depreciation recapture on real property sold at a gain.
// Taxed at max 25% (the taxpayer pays the lesser of 25% or their ordinary bracket rate;
// 25% is used as the conservative planning ceiling for mid/high-income filers).
// F-03 FIX: This constant existed but was NOT imported or used in calcPreferentialTax.
// Lines ~323-324 of taxCalc.js used raw 0.25 and 0.28 literals instead. Fixed in taxCalc.js.
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
export const CATCHUP_AGE_STANDARD = 50      // IRC §414(v)(1) — standard catch-up start age
export const CATCHUP_AGE_SUPER_START = 60   // SECURE 2.0 §109 — enhanced catch-up window start
export const CATCHUP_AGE_SUPER_END = 63     // SECURE 2.0 §109 — enhanced catch-up window end (inclusive)

// ─── ENTITY TYPES ─────────────────────────────────────────────────────────────
// O3 FIX: Canonical entity type strings — must match the Tax Tracker entity card
// <select> options in CalculateTaxInner.jsx exactly. All consumers (CompareModal,
// onboarding EntityScreen, entityPredicates.js regex patterns, calcTaxReturn) derive
// their entity classification from these strings.
//
// Previous list had five values including 'C Corporation' (unsupported in Tax Tracker),
// split 'Partnership / MMLLC — Active' / 'Partnership / MMLLC — Passive' (not matching
// the Tax Tracker's single 'Partnership / LLC' option), and lacked 'Real Estate (Schedule E)'.
// The mismatch caused CompareModal to pass unrecognized type strings to calcTaxReturn,
// which fell back to Sole Prop behaviour silently — producing wrong comparison figures.
//
// The Active/Passive partnership distinction is now handled via entity-level flags
// (entity.isREP, entity.isActiveParticipant) rather than separate type strings.
// entityPredicates.js regex patterns match all four canonical strings correctly.
// C Corporation is removed from this list — it is not supported for tax calculation.
// Real Estate (Schedule E) is added — it is a primary use case for the target audience
// and was already supported by the Tax Tracker but absent from this constant.
//
// ⚠ When adding a new entity type: update this array AND the Tax Tracker <select>
// options AND the entityPredicates.js pattern functions simultaneously. These three
// must stay in sync — this constant is the reference source.
export const ENTITY_TYPES = [
  'S Corporation',
  'Partnership / LLC',
  'Sole Proprietor / SMLLC',
  'Real Estate (Schedule E)',
]

// Pass-through entities: K-1 income flows to the owner's personal 1040.
// All four supported entity types are pass-through. C-Corp (double-taxation)
// is not supported and therefore not listed.
// O3 FIX: updated to use canonical strings matching ENTITY_TYPES above.
export const PASSTHROUGH_ENTITY_TYPES = [
  'S Corporation',
  'Partnership / LLC',
  'Sole Proprietor / SMLLC',
  'Real Estate (Schedule E)',
]

// SE-subject entity types: drive SE tax calculation in calcTaxReturn.
// S-Corp distributions are NOT SE-subject (officer W-2 salary is FICA-taxed instead).
// Real Estate is NOT SE-subject (rental income is passive; SE tax does not apply).
// Partnership / LLC: SE tax applies to general partners / active members who materially
// participate. This is handled at runtime by entity.isActiveParticipant flag in
// calcTaxReturn — the type string alone does not determine SE treatment for partnerships.
// The type is included here so Sole Prop is correctly identified as always SE-subject.
// O3 FIX: updated to use canonical strings. 'Partnership / MMLLC — Active' removed;
// partnership SE treatment is applied conditionally in calcTaxReturn via entity flags.
export const SE_SUBJECT_TYPES = [
  'Sole Proprietor / SMLLC',
  'Partnership / LLC',  // SE applies only when entity.isActiveParticipant — checked at runtime
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

// ─── SUBSCRIPTION PRICING ─────────────────────────────────────────────────────
// Monthly base prices — displayed on Landing.jsx pricing section and Upgrade.jsx.
// Annual pricing = monthly × ANNUAL_BILLING_MONTHS (10 months billed, 2 months free).
// Upgrade.jsx must reference these constants; no hardcoded pricing values in components.
//
// To change pricing: update these constants only. Upgrade.jsx and Landing.jsx will
// reflect the change automatically on next build.
export const PRICE_STARTER_MONTHLY = 79       // USD/month
export const PRICE_PROFESSIONAL_MONTHLY = 149 // USD/month
export const PRICE_ENTERPRISE_MONTHLY = 299   // USD/month
export const ANNUAL_BILLING_MONTHS = 10        // months charged on annual plan (2 months free)
export const ANNUAL_DISCOUNT_LABEL = 'Save 2 months'  // display copy — update if discount changes

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
  2024: 0.67,   // IRS Notice 2024-08 — 67¢/mile for business use
  2025: 0.70,   // IRS Notice 2025-05 — 70¢/mile for business use (5¢ increase from 2024)
  2026: 0.725,  // IRS Notice 2026-10 (Dec 29, 2025) — 72.5¢/mile for business use (up 2.5¢ from 2025)
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
export const CTA_COPY_FULL = 'No charge during your 7-day trial · Card required · Cancel in one click'
export const CTA_COPY_SHORT = 'No charge for 7 days · Card required · Cancel in one click'
