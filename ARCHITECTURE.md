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
  §179 limits, bonus depreciation %, phase-outs) live in `TAX_TABLES[year]`
  inside `taxCalc.js`. When a new tax year is released, update ONLY that object.
- `src/aiAnalysisTaxMath.js` imports FROM `taxCalc.js`. Never the reverse.
- Components call `calcTaxReturn()` for final federal tax liability.
  No component may compute a final tax number inline.
- `src/scenarioCompare.js` routes all three entity scenarios through
  `calcTaxReturn()` — not through any component.

**Consequence:** if you need a tax rate or threshold in a component,
import it from `constants.js` or via a getter from `taxCalc.js`.
Never hard-code it in JSX.

---

## 2. Constants File Split Rule

| File | Contains |
|------|----------|
| `src/constants.js` | Statutory / permanent values — IRC rates, FICA %, ERISA ages, SALT cap, mileage rates, company identity strings |
| `src/taxCalc.js` → `TAX_TABLES[year]` | Annual / inflation-adjusted values — standard deductions, brackets, §199A thresholds, §179 limits, NIIT/Medicare thresholds |
| `src/utils/integrations.js` | Third-party API keys and integration credential helpers — NOT tax constants |

Never add a year-specific dollar amount to `constants.js`.
Never add a credential or API key to `constants.js`.

---

## 3. Session State Contract

- All `sessionStorage` reads go through a reader in `src/utils/sessionState.js`.
- All `sessionStorage` writes go through a writer in `src/utils/sessionState.js`.
- Never call `sessionStorage.getItem` or `sessionStorage.setItem` directly
  in a component or utility file.
- Verification command (must return empty):
  ```
  grep -rn 'sessionStorage\.' src/ --include='*.jsx' --include='*.js' \
    | grep -v sessionState.js
  ```

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
- Test-helper files (e.g. `aiAnalysisTaxMath.test-helpers.js`) must never be
  imported by production code. Import path: test files only.

---

## 7. Annual Update Checklist

When a new tax year's figures are released (typically October–December):

1. Add `TAX_TABLES[newYear]` entry in `src/taxCalc.js`.
2. Add `newYear` to `SUPPORTED_TAX_YEARS` in `src/constants.js`.
3. Update `IRS_MILEAGE_RATES[newYear]` in `src/constants.js`.
4. Run all `taxCalc-*.test.js` suites — add test cases for the new year.
5. Update `CURRENT_TAX_YEAR` default in `src/constants.js` only after
   the new year begins (January 1).

Do NOT update `CURRENT_TAX_YEAR` before January 1 — use the year dropdown
for testing pre-release year figures.
