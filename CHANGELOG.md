# TaxStat360 Changelog

Historical fix logs previously lived in file-level `// — Change log` comment
blocks inside each `.jsx` source file (BUG-01, L-02, C-06, UX-05, F-NEW-A,
PASS5, etc.). Those headers were the right instinct; future changes go here
instead so diffs stay clean and the history is searchable in one place.

The existing in-file headers in `TaxReturn.jsx`, `CalculateTaxInner.jsx`, and
`AIAnalysis.jsx` are preserved as-is — do not remove them. They serve as a
record of work that predates this changelog.

---

## [Unreleased] — Post-Deploy Verification Fixes, July 2026

Found during the formal post-deploy verification of the July 2026 audit fixes.

### Fixed
- **F2 (second root cause)** `src/EntityCompareModal.jsx` — COMPARE-PC fixed the
  lazy-getter personalContext, but the modal still fed the engine the SESSION
  vocabulary (filingStatus/w2Income/interest…) where calcTaxReturn expects the
  ENGINE vocabulary (status/w2/intInc…), so every scenario totalTax was null →
  rendered "$0". New toEngineContext() translator mirrors TaxReturn.jsx's
  authoritative calcInput mapping (incl. other-entity officer W-2, Box 17K, and
  YTD annualization). Regression tests: src/EntityCompareModal.context.test.js
- **F3 (residual, load path)** `src/utils/sessionState.js` — normalizeF1040's
  whitelist dropped ytdMode/ytdMonth (and stGain, unrecap1250, collectiblesGain,
  nonrecap1231, isActiveParticipant, rentalAggregationElection, prior-year and
  suspended-loss fields, itemized detail fields) on record rehydration, so a
  saved YTD projection reverted to full-year on reload even though the server
  record carried the fields. Whitelist extended; regression tests:
  src/utils/normalizeF1040.audit.test.js
- **DATA-LOSS (new verification finding — Blocker), REVISED** `src/utils/serverApi.js` —
  a live probe established the backend PUT /records is a keyed per-id upsert
  that REJECTS arrays ("Record must be a JSON object") and preserves siblings.
  The earlier merged-array revision was therefore wrong and is reverted. The
  real incident — all sibling records lost server-side coincident with a save —
  remains unexplained from the client and is suspected backend-side (REVIEW THE
  /records LAMBDA). Seatbelt shipped: upsertRecordOnServer snapshots the server
  list before the single-object PUT, re-fetches after, and self-heals by
  re-PUTting any sibling that disappeared, with loud console.error logging.

---

## [Unreleased] — Functionality Audit Fixes, July 2026

Fixes from the July 3, 2026 live functionality audit (findings F5–F16; numbering
follows the audit report). Findings F1–F4, F7, and F15 from that audit were
already fixed in this repo but absent from the deployed build — deploying this
revision resolves them with no further code change.

### Fixed
- **F5 / F6 / FLOW** (owner decision) `src/Onboarding.jsx`,
  `src/components/WelcomeTourScreen.jsx`, `src/App.jsx` — the post-signup setup
  funnel (EntityScreen → BusinessScreen → ImportScreen) is removed entirely.
  After the welcome tour, users land on the Dashboard and either load a saved
  record card or start a new calculation; entity types (all five, incl.
  C Corporation per F12) and the accounting connectors live in the Tax Tracker.
  Old /onboarding/entity|business|import URLs redirect to /dashboard.
  Business name / EIN / address are no longer collected at onboarding, which
  moots the F5 edit-surface question and the F6 input-validation fix; the
  first-run Tracker banner flag now sets on tour completion for new signups
- **F6** `src/AIAnalysis.jsx` — `getOnboardingBizInfo()` sanitizes the stored
  EIN at the single read point so legacy malformed values never print on the
  CPA Briefing / Export cover
- **F8** `src/TaxReturn.jsx` — Qualifying Dependents clamped to 0–20 on typed
  input (min/max attributes only constrained the spinner; typed "10000"
  generated an unbounded CTC that silently zeroed the liability)
- **F9** `src/CalculateTaxInner.jsx` — local `MoneyInput` gains `allowNegative`
  (default true); all six P&L-modal fields (gross receipts/rents, operating
  expenses, depreciation, officer compensation, advertising, other) opt out.
  K-1 Box 1 direct entry keeps negatives — losses are legitimate there
- **F11** `src/TaxReturn.jsx` — waterfall terminal row no longer renders
  "Estimated Refund −$X"; magnitude is always positive, label + accent carry
  the direction
- **F12** `src/CalculateTaxInner.jsx` — C Corporation added to the Add Entity
  picker (was only reachable via the entity card's type dropdown)
- **F16** `src/Aria.jsx` — `renderAriaText()` converts `**bold**` spans to
  `<strong>` via React elements (no `dangerouslySetInnerHTML`)

### Deferred (owner decision required — see audit report)
- **F10** capital-loss §1211(b) $3,000 limit + carryforward — tax-engine rule
  change; belongs to the tax-accuracy pass
- **F13** save semantics (snapshot vs. overwrite of the active record)
- **F14** unsaved-changes prompt on in-app navigation

---

## [Unreleased] — Audit Sprint, June 2026

### Added
- `ARCHITECTURE.md` — authoritative structural invariants document (audit F-04/F-07)
- `CHANGELOG.md` — this file; replaces in-file change logs going forward (audit F-07)
- `src/utils/integrations.js` — `integrationKey()` extracted from `constants.js` (audit F-09)
- `src/utils/calcGuard.js` — `validateCalcInputs()` and `CalcInputError` (audit F-06)
- `src/utils/calcGuard.test.js` — unit tests for calc input guard (audit F-06)
- Round-trip tests added to `src/utils/sessionState.test.js` (audit F-05)

### Fixed
- **F-01** `src/aiAnalysisTaxMath.test-helpers.js` — stale path comment corrected;
  TEST INFRASTRUCTURE ONLY banner added
- **F-05** `src/utils/sessionState.js` — migration-completeness note added;
  direct `sessionStorage` call grep verified clean
- **F-06** `src/AIAnalysis.jsx`, `src/TaxReturn.jsx` — `validateCalcInputs()` guard
  wired before every `calcTaxReturn()` / `resolveQbiDeduction()` call site;
  `CalcInputError` surfaces visible error state in UI
- **F-06** `src/components/ErrorBoundary.jsx` — catches `CalcInputError` with
  user-friendly "return to Step 1" message
- **F-07** `src/taxCalc.js` — JSDoc IRC / Treasury Regulation citations added above
  `calcQBI`, `calcAMT`, `calcFederalTax`, `calcPreferentialTax`, `calcNIIT`,
  `calcFICAOnWages`, `getStdDed`
- **F-07** `src/aiAnalysisTaxMath.js` — JSDoc citations added above
  `resolveQbiDeduction`, `taxableIncomeBeforeQBI`, `niitApplies`,
  `additionalMedicareApplies`
- **F-08** `src/AIAnalysis-qbi.characterization.test.js` — CHAR / SPEC annotations
  added to all test cases; highest-risk §199A threshold case hand-verified
- **F-09** `src/constants.js` — `integrationKey()` removed; pointer comment added
- **F-10** `src/utils/migrateLegacyKeys.js` — 90-day decommission lifecycle note
  added; removal criteria documented
- **F-10** `src/main.jsx` — lifecycle comment expanded above `migrateLegacyKeys()` call

### Deferred (separate PRs)
- **F-02** `CalculateTaxInner.jsx` extraction → `CalculateTaxInner.logic.js`
- **F-03** `AIAnalysis.jsx` logic layer → `AIAnalysis.logic.js`
- **F-08** Full spec-test conversion (after F-03 complete)

---

## Prior History

For changes before this changelog, see the `// — Change log` and
`// — AUDIT REPORT FIXES` comment blocks inside:
- `src/TaxReturn.jsx` (lines 7–35)
- `src/CalculateTaxInner.jsx` (lines 6–35)
- Git commit history: `git log --oneline src/`
