# TaxStat360 Changelog

Historical fix logs previously lived in file-level `// — Change log` comment
blocks inside each `.jsx` source file (BUG-01, L-02, C-06, UX-05, F-NEW-A,
PASS5, etc.). Those headers were the right instinct; future changes go here
instead so diffs stay clean and the history is searchable in one place.

The existing in-file headers in `TaxReturn.jsx`, `CalculateTaxInner.jsx`, and
`AIAnalysis.jsx` are preserved as-is — do not remove them. They serve as a
record of work that predates this changelog.

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
