// Guided Carryforward Wizard (Lean v1) — step definitions.
// Single source of truth for labels, helper text, explainers, and field mapping.

/** Spec §7 — shown on first/last wizard screen and placeholder. */
export const GLOBAL_DISCLAIMER =
  'Please check with your tax professional before relying on any numbers as accurate.'

/** Phase 3 applies plan gate; constant ready for LockedFeature integration. */
export const CARRYFORWARD_WIZARD_MIN_PLAN = 'professional'

/**
 * PDF prefill from prior-year Form 1040 (text PDF only).
 * Phase 5: enabled by default after browser+server SSN/image gates.
 * Rollback: set to `false`, or deploy with `VITE_CARRYFORWARD_PDF_PREFILL=false`.
 * Live tax AI still requires ZDR confirmation (gates alone do not authorize live provider).
 */
const _pdfPrefillEnv = import.meta.env?.VITE_CARRYFORWARD_PDF_PREFILL
export const CARRYFORWARD_PDF_PREFILL_ENABLED =
  _pdfPrefillEnv == null || String(_pdfPrefillEnv).trim() === ''
    ? true
    : String(_pdfPrefillEnv).toLowerCase() !== 'false'

/** Allowed keys inside step.sanity (Phase 5 consumes these). */
export const CARRYFORWARD_SANITY_KEYS = ['nonNegative', 'warnAbove']

// v1 planning defaults for warnAbove — replace when Natasha EA tie-out table is final.

/**
 * @typedef {Object} CarryforwardWizardStep
 * @property {string} id
 * @property {string} label
 * @property {string} helperText — where to find on prior-year return
 * @property {string} explainer — what this is and why it matters
 * @property {string} [fieldKey] — F1040_FIELD_MANIFEST key; omit when informational
 * @property {true} [informational]
 * @property {string} [guidanceNote] — guidance-only panel copy (informational steps)
 * @property {{ nonNegative?: true, warnAbove?: number }} [sanity]
 */

/** @type {CarryforwardWizardStep[]} */
export const CARRYFORWARD_WIZARD_STEPS = [
  {
    id: 'prior-unallowed-passive-loss',
    label: 'Prior-year unallowed passive loss carryforward',
    helperText:
      "Find it in the 'Unallowed Loss' column of last year's Form 8582 worksheets (Worksheet 5 or 6, or Part VII on newer forms). This is the suspended passive loss that carries onto Form 8582 lines 1c/2c (rental real estate) or 3c (other passive activities).",
    explainer:
      'Passive activity losses from rental real estate or other passive activities may be suspended under IRC §469 until you have passive income or meet an exception (for example, Real Estate Professional status under §469(c)(7)). The suspended amount carries forward and affects how much prior loss can offset current-year income in your planning estimate.',
    fieldKey: 'priorPassiveLossCarryforward',
    sanity: { nonNegative: true, warnAbove: 1_000_000 },
  },
  {
    id: 'capital-loss-st',
    label: 'Capital loss carryforward — short-term',
    helperText:
      "Use the Schedule D carryover worksheet from last year's return for the short-term capital loss carryforward.",
    explainer:
      'Short-term capital losses that exceeded gains last year carry forward under IRC §1212(b). They can offset future capital gains and, after gains are exhausted, up to $3,000 of other income per year ($1,500 if married filing separately).',
    fieldKey: 'capLossCarryforwardST',
    sanity: { nonNegative: true, warnAbove: 500_000 },
  },
  {
    id: 'capital-loss-lt',
    label: 'Capital loss carryforward — long-term',
    helperText:
      "Use the Schedule D carryover worksheet from last year's return for the long-term capital loss carryforward.",
    explainer:
      'Long-term capital losses that exceeded gains last year carry forward separately from short-term losses under IRC §1212(b). Enter the long-term carryover amount shown on your Schedule D carryover worksheet.',
    fieldKey: 'capLossCarryforwardLT',
    sanity: { nonNegative: true, warnAbove: 500_000 },
  },
  {
    id: 'nol-carryforward',
    label: 'NOL carryforward',
    helperText:
      "Look at the NOL Carryover Schedule (an informal statement/worksheet at the back of last year's return, often titled 'NOL Carryover Schedule' or 'Statement of Net Operating Loss Carryforward'). Any NOL used last year appears on Schedule 1, Part II, Line 22 (labeled 'NOL'); the remaining unused balance is what you carry forward.",
    explainer:
      "Post-2017 NOL carryforwards are limited to 80% of taxable income per IRC §172(a)(2) (TCJA; retained by OBBBA). Enter your total available NOL carryforward — TaxStat360 applies the 80% cap automatically.",
    fieldKey: 'nolCarryforward',
    sanity: { nonNegative: true, warnAbove: 5_000_000 },
  },
  {
    id: 'at-risk-carryforward',
    label: 'At-risk carryforwards',
    helperText:
      "Review Form 6198 from last year's return for amounts still at risk or suspended due to the at-risk rules. For each activity on last year's Form 6198, subtract Line 21 (deductible loss) from Line 11 (current-year loss) — the leftover is that activity's at-risk carryforward.",
    explainer:
      'The at-risk rules under IRC §465 limit deductible losses to the amount you have at risk in the activity. Amounts disallowed under these rules carry forward. TaxStat360 does not yet store a dedicated at-risk balance on the personal return — enter per-activity amounts on each entity screen after confirming with your preparer.',
    informational: true,
    guidanceNote:
      'Guidance only — there is no amount field on this step. For each activity on last year\'s Form 6198, subtract Line 21 (deductible loss) from Line 11 (current-year loss). Enter that carryforward on that activity\'s business, rental, or K-1 input screen in Step 1 (Entities).',
  },
  {
    id: 'qbi-carryforward',
    label: 'QBI / §199A carryforward',
    helperText:
      "For a single business, use Form 8995 line 3 from last year's return. For multiple entities, use each entity's §199A panel in Step 1.",
    explainer:
      "If your business generated a net QBI loss last year, that loss reduces your §199A QBI deduction in the CURRENT year (IRC §199A(c)(2)). For a single entity: enter the absolute value of last year's QBI loss here. For multiple entities: enter the per-entity carryforward in each entity's §199A panel in Step 1 (Form 8995 line 3). Per-entity tracking is required by Treas. Reg. §1.199A-1(d)(2)(iii). When per-entity values are entered, this pooled field is ignored.",
    fieldKey: 'priorYearQBILoss',
    sanity: { nonNegative: true, warnAbove: 500_000 },
  },
  {
    id: 'depreciation-continuity',
    label: 'Depreciation continuity',
    helperText:
      "Review last year's Schedule E, Form 4562, and asset/disposition schedules for accumulated depreciation and whether depreciation was taken consistently.",
    explainer:
      'Continuity of depreciation affects current-year deductions and potential recapture on disposition (for example, unrecaptured §1250 gain on real property). TaxStat360 does not yet store a dedicated depreciation-continuity balance — confirm accumulated depreciation and recapture exposure with your preparer before relying on sale or disposition projections.',
    informational: true,
    guidanceNote:
      'Guidance only — there is no amount field on this step. Review last year\'s Schedule E, Form 4562, and asset schedules with your preparer to confirm accumulated depreciation and recapture exposure. Enter current-year depreciation in each entity\'s Depreciation field (Step 1: Entities); for a sale or exchange, use that entity\'s disposition and recapture fields.',
  },
  {
    id: 'prior-year-tax',
    label: 'Prior-year federal tax (safe harbor)',
    helperText:
      "Enter the total federal income tax from line 24 of last year's Form 1040 (used for estimated-tax safe harbor).",
    explainer:
      'Prior-year federal income tax is used to compute the 100% / 110% safe harbor for current-year estimated payments under IRC §6654. Enter the federal income tax from line 24 of your prior-year Form 1040 — not state or local tax.',
    fieldKey: 'priorYearTax',
    sanity: { nonNegative: true },
  },
  {
    id: 'prior-year-agi',
    label: 'Prior-year AGI (safe harbor)',
    helperText:
      "Enter adjusted gross income from line 11 of last year's Form 1040.",
    explainer:
      'Prior-year adjusted gross income (AGI) from line 11 of Form 1040 determines whether the 110% safe harbor applies (generally when prior-year AGI exceeded $150,000). Used together with prior-year tax for quarterly estimated payment planning.',
    fieldKey: 'priorYearAGI',
    sanity: { nonNegative: true, warnAbove: 50_000_000 },
  },
]

/** Manifest keys referenced by data-entry steps (excludes informational). */
export function getCarryforwardWizardFieldKeys() {
  return CARRYFORWARD_WIZARD_STEPS
    .filter((s) => !s.informational && s.fieldKey)
    .map((s) => s.fieldKey)
}

/** Empty string values for every data-entry step (Phase 2 local state init). */
export function buildInitialWizardValues() {
  return Object.fromEntries(getCarryforwardWizardFieldKeys().map((key) => [key, '']))
}
