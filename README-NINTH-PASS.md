# Ninth pass — replacement files (September 22, 2026)

Full replacement files for the pre-launch final review findings (N-1 … N-12), the two
open legal-review copy items (L-7, L-8) and the Resources article corrections. Every file
here is complete — copy each one over the same path in your checkout, or apply
`ninth-pass.patch` with `git apply ninth-pass.patch` from the repo root.

Verified on this tree: `npm test` 118 files / 1,756 tests green (1,733 before + 23 new);
`npm run lint` 0 errors (28 pre-existing warnings, unchanged); `npm run build` clean.

## Files (15 replaced, 2 new)

| Path | Findings |
|---|---|
| `src/lib/taxCalc.js` | N-1 excess SS credit · N-2 SSTB carryforward · N-5 plan/HSA ceilings · N-7 §6654(e) exemptions · N-11 SE-savings K-1 |
| `src/components/TaxReturn.jsx` | N-1 payments note · N-5 selectors · N-6 basis labels · N-7 notices + safe-harbor wording · N-10 MFJ caption · new fields wired |
| `src/components/CalculateTaxInner.jsx` | N-3 K-1 mode gating + type-change reset · N-4 passive attestations in K-1 mode · N-9 compare-modal target + picker |
| `src/components/EntityCompareModal.jsx` | new engine inputs in `toEngineContext` |
| `src/utils/fieldManifest.js` | persistence for `priorYearTaxEntered`, `retirementPlanType`, `hsaCoverage`, `hsaCatchUp55` |
| `src/utils/calcSelector.js` | new engine outputs on the read list (Dashboard / Aria / AI Analysis) |
| `src/components/Aria.jsx` | grounding lines for the excess-SS credit and the §6654(e) exemptions |
| `src/lib/carryforwardWizardConfig.js` | N-8 form-line corrections (Schedule 1 line 8a; Form 6198 line 5 − 21; Form 2210 line 8) |
| `src/components/CarryforwardWizard.jsx` | N-12 "RepsRecord Evidence" wording |
| `src/components/About.jsx` | N-12 accuracy-claim wording |
| `src/components/Footer.jsx` | L-7 trademark attribution line |
| `src/components/Terms.jsx` | L-8 U.S.-only territorial scope (§5); "Last updated" → Sep 22, 2026 |
| `src/lib/constants.js` | `TERMS_VERSION` → `2026-09-22` (drives the re-acceptance prompt) |
| `src/lib/articles.js` | Resources article corrections (all five articles) |
| `CHANGELOG.md` | ninth-pass entry |
| `src/lib/taxCalc-ninth-pass.test.js` | **new** — 15 engine SPEC tests from the live repros |
| `src/components/ninth-pass-step1.test.jsx` | **new** — 8 Step-1 tests (N-3, N-4, N-9) |

## Two things to decide before deploying

1. **`TERMS_VERSION` bump.** Adding the territorial-scope sentence to the Terms is the kind of
   change your own §13 treats as material (30 days' notice). Pre-launch, with no paying
   subscribers, bumping the version and letting the re-acceptance gate handle it is fine; if
   anyone has already accepted the September 11 Terms, keep the bump but send the notice.
2. **Defaults for the new selectors.** The retirement plan type defaults to Solo 401(k) and the
   HSA to family coverage + age-55 catch-up — i.e. exactly the ceilings the site applied before,
   so no saved record changes until the user picks the narrower option. If you would rather
   default to SEP-IRA (more common for this audience), change `'solo401k'` to `'sep'` in the
   `retirementPlanType` manifest entry, the `TaxReturn.jsx` state seed, and the engine default —
   the tests in `taxCalc-ninth-pass.test.js` pin the current defaults and would need the same
   flip.

## Not included (feature work, not a fix)

- OBBBA senior deduction (§70103, 2025–2028): still unmodelled; needs an age-65 checkbox per
  spouse. `hsaCatchUp55` is the first age-related input and is the natural place to build from.
