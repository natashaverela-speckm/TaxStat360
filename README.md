# Fifth read — follow-up: stale limitedPartner flag (15 Sep 2026)

Full replacement files (copy over the same paths) for master as of the fifth-read deploy.
`FIFTH-READ-FOLLOWUP.patch` is the same change as a unified diff.

| Path | Change |
|---|---|
| `src/utils/entityPredicates.js` | `isLimitedPartnerEligibleType` now lives here (shared, no import cycle) |
| `src/utils/entityPredicates-limited-partner.test.js` | **NEW** — 5 tests (predicate, engine with stale flag, UI predicate) |
| `src/lib/aiAnalysisTaxMath.js` | Re-exports the predicate (callers unchanged) |
| `src/lib/taxCalc.js` | Passive routing uses the predicate instead of `/partner\|mmllc\|llc/` |
| `src/components/TaxReturn.jsx` | SE-savings heading uses the predicate (no more "limited-partner" for a sole prop) |
| `src/components/CalculateTaxInner.jsx` | Entity type change clears `limitedPartner` when the new type cannot carry it |
| `CHANGELOG.md` | Entry appended to the fifth-read section |

Verified: 109 test files / 1,628 tests passing · eslint 0 errors (8 pre-existing warnings) · `npm run build` OK.
Post-deploy check: Step 1, add a Partnership, tick "Limited partner", change type to Sole Proprietor →
Step 2 SE-savings card heading should read "Your … of S-Corp K-1 …" (no "limited-partner"), SE tax unchanged.
