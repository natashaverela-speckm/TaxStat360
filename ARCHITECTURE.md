# TaxStat360 — Architecture Invariants

This file is the authoritative reference for structural rules that must not be
broken when adding features or fixing bugs. Read before touching any file in src/.

---

## 1. Tax Calculation Layer

**Single source of truth for all tax math is `src/taxCalc.js`.**

- ALL tax formulas live in `src/taxCalc.js` only.
- ALL permanent rate constants (IRC rates, FICA structure, ERISA ages, statutory
  dollar amounts that do NOT inflate) live in `src/constants.js` only.
- Year-specific dollar figures (brackets, thresholds, standard deductions,
  phase-outs) live in `TAX_TABLES[year]`
  inside `taxCalc.js`. When a new tax year is released, update ONLY that object.
- `src/aiAnalysisTaxMath.js` imports FROM `taxCalc.js`. Never the reverse.
- Components call `calcTaxReturn()` for final federal tax liability.
  No component may compute a final tax number inline.
- `src/scenarioCompare.js` routes all three entity scenarios through
  `calcTaxReturn()` — not through any component.
- (M3, Jul 2026) The §179(b)(3) business-income limitation lives ONLY in
  `calc179Limitation()` (taxCalc.js); the flow-through k1Total rule lives ONLY
  in `sumK1FlowThrough()` (taxCalc.js); the P&L net-derivation rule
  (`netProfit ?? gross − expenses`) lives ONLY in `getEntityPnlNet()` /
  `getEntityPnlNetShare()` (utils/entityPredicates.js). Never re-inline any of
  them — `src/architecture-invariants.test.js` fails the build if you do.
- (D-10/D-11, Jul 2026) The S-Corp reasonable-comp numeric rule lives ONLY in
  `calcReasonableCompCore()` (taxCalc.js); session validity lives ONLY in
  `isValidSession()` (utils/sessionAuth.js).

**Consequence:** if you need a tax rate or threshold in a component,
import it from `constants.js` or via a getter from `taxCalc.js`.
Never hard-code it in JSX.

---

## 2. Constants File Split Rule

| File | Contains |
|------|----------|
| `src/constants.js` | Statutory / permanent values — IRC rates, FICA %, ERISA ages, SALT cap, mileage rates, company identity strings |
| `src/taxCalc.js` → `TAX_TABLES[year]` | Annual / inflation-adjusted values — standard deductions, brackets, §199A thresholds, NIIT/Medicare thresholds. (§179 DOLLAR limits are NOT modeled — see KNOWN_LIMITATIONS.md `179-DOLLAR`; only the §179(b)(3) income limitation exists, in `calc179Limitation()`) |
| `src/utils/integrations.js` | Third-party API keys and integration credential helpers — NOT tax constants |

Never add a year-specific dollar amount to `constants.js`.
Never add a credential or API key to `constants.js`.

---

## 3. Session State Contract

- All `sessionStorage` reads go through a reader in `src/utils/sessionState.js`.
- All `sessionStorage` writes go through a writer in `src/utils/sessionState.js`.
- EXCEPTION (M4, Jul 2026): `src/utils/integrations.js` is also sanctioned —
  the OAuth token deliberately lives in both stores, and its accessors
  (`readIntegrationToken` / `writeIntegrationToken` / `readIntegrationField` …)
  are the single audited home for ALL integration-field storage. Components
  must never call `localStorage.<op>(integrationKey(...))` directly either.
- Never call `sessionStorage.getItem` or `sessionStorage.setItem` directly
  in a component or any other utility file.
- Verification commands (each must return empty):
  ```
  grep -rn 'sessionStorage\.' src/ --include='*.jsx' --include='*.js' \
    | grep -v sessionState.js | grep -v integrations.js | grep -v '.test.'
  grep -rn 'Storage\..*integrationKey(' src/ --include='*.jsx' --include='*.js' \
    | grep -v integrations.js | grep -v '.test.'
  grep -rn 'netProfit ?? (nf(' src/ --include='*.jsx' --include='*.js' \
    | grep -v entityPredicates.js | grep -v '.test.'
  ```
- These invariants are CI-ENFORCED: `src/architecture-invariants.test.js` runs
  the same checks in the test suite, which gates both the GitHub Actions deploy
  and (since M4) the Amplify build. A violation fails the build — the greps
  above are for local convenience, not the enforcement mechanism.

---

## 4. Import Chain (must not be reversed)

```
constants.js
    ↓
taxCalc.js  ←  aiAnalysisTaxMath.js  ←  AIAnalysis.jsx
    ↓                                        ↓
TaxReturn.jsx                         scenarioCompare.js
CalculateTaxInner.jsx
```

`taxCalc.js` must never import from a component or from `aiAnalysisTaxMath.js`.

---

## 5. Calculation Guard

All calls to `calcTaxReturn()` and `resolveQbiDeduction()` must be preceded by
`validateCalcInputs()` from `src/utils/calcGuard.js`.  
Catch `CalcInputError` at the call site and surface a visible error state —
never let a NaN result reach the user silently.

---

## 6. Test Contracts

- Every function in `taxCalc.js` must have tests in a `taxCalc-*.test.js` file.
- A change to `TAX_TABLES[year]` requires a corresponding test update for that year.
- Tests labelled `// CHAR` freeze current behaviour (characterisation tests).
- Tests labelled `// SPEC: <citation>` have expected values independently verified
  from an IRS publication or Treasury Regulation. Only SPEC tests prove correctness.
- (M6, Jul 2026) The label lives in the TEST NAME: `it('SPEC: §1366(d)(1) — …')` /
  `it('CHAR: …')`, so vitest output and CI logs carry the epistemic status of every
  assertion. CHAR = freezes current behavior (refactor protection, not proof).
- (M6) Test FILES are named by SUBJECT, never by remediation ticket
  (`taxCalc-basis-waterfall.test.js`, not `taxCalc-c11c12.test.js`). Ticket history
  belongs in the file header. Renamed in M6: c10 → basis-loss-limit,
  c11c12 → basis-waterfall, f3f5 → 1231-lookback, qbi179 → qbi-sec179.
- GRANDFATHERED: the two pre-convention suites `taxCalc.test.js` (137) and
  `taxCalc-engine.test.js` (105) predate the labeling rule; labeling 242 legacy
  tests is queued as M6b so the diff stays reviewable. New tests MUST be labeled.
- Test-helper files (e.g. `aiAnalysisTaxMath.test-helpers.js`) must never be
  imported by production code. Import path: test files only.

---

## 7. Error-Handling Convention (M5, audit F-10)

Every `catch` block must produce exactly one of these outcomes:

1. **Surface** — set visible error state (`setErr`, `calcError` banner) or map an
   `ApiError` to a user-facing message.
2. **Log** — `console.error`/`console.warn` with a component-prefixed message and
   the caught error, when the failure is recoverable but worth a support trace.
3. **Swallow with justification** — a fallback return/default IS permitted for
   storage reads, JSON parses, and best-effort side writes, but the block MUST
   carry a comment explaining why silence is the correct behavior.
4. **Re-throw** — anything unexpected in a calculation path re-throws to the
   route ErrorBoundary (see §5; TaxReturn's useMemo is the model).

Hard rules:
- Bare `catch {}` / `catch (e) {}` with an empty, comment-free body is forbidden —
  CI-enforced by `src/architecture-invariants.test.js` (Onboarding.jsx carries a
  temporary allowance until M7 touches those lines; see the test for the TODO).
- Tax-math paths NEVER swallow: guard rejections surface as banners (§5), and
  engine exceptions re-throw. A silent `$0`/blank render caused by a swallowed
  error is indistinguishable from a real liability figure to the user — in a tax
  product that is the worst failure mode available.

---

## 8. Annual Update Checklist

When a new tax year's figures are released (typically October–December):

1. Add `TAX_TABLES[newYear]` entry in `src/taxCalc.js`.
2. Add `newYear` to `SUPPORTED_TAX_YEARS` in `src/constants.js`.
3. Update `IRS_MILEAGE_RATES[newYear]` in `src/constants.js`.
4. Run all `taxCalc-*.test.js` suites — add test cases for the new year.
5. Update `CURRENT_TAX_YEAR` default in `src/constants.js` only after
   the new year begins (January 1).

Do NOT update `CURRENT_TAX_YEAR` before January 1 — use the year dropdown
for testing pre-release year figures.
