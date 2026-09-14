# TaxStat360 — R-1 / R-2 fix set (14 Sep 2026)

Full replacement files. Copy each one over the same path in the `master` branch
(base commit 88ecb24, "Add files via upload"), commit, and let Amplify build.

| Path | Status | What changed |
|---|---|---|
| `src/lib/taxCalc.js` | replace | R-1: Schedule SE block hoisted above the §469 section; one `calc469iMagi()` feeds both §469 branches (adds §707(c) GP, subtracts §164(f) ½-SE). R-2: new `w2OwnForSE` input; MFJ nets it (clamped to `w2`) against the SS wage base; `seWageBaseW2` / `w2OwnForSE` exposed on the result. |
| `src/components/TaxReturn.jsx` | replace | R-2: `w2OwnForSE` state, engine input (MFJ only), auto-save + saved-record persistence, the MFJ-only field under the W-2 grid, and a wage-base note on the SE Tax waterfall row. |
| `src/components/EntityCompareModal.jsx` | replace | R-2: `toEngineContext` carries `w2OwnForSE` (one line) so the Step-1 card, Aria and Dashboard summaries agree with Step 2. |
| `src/utils/fieldManifest.js` | replace | R-2: `w2OwnForSE` in the f1040 manifest (persists / normalizes / loads) and in `YTD_SCALE_ENGINE_FIELDS`. |
| `src/utils/sessionState.js` | replace | R-2: default + JSDoc for `w2OwnForSE`. |
| `src/lib/taxCalc-469-magi-audit.test.js` | **new** | 8 SPEC/CHAR tests for R-1. |
| `src/lib/taxCalc-se-wage-base-mfj-attribution.test.js` | **new** | 9 SPEC/CHAR tests for R-2. |
| `src/components/TaxReturn.test.jsx` | replace | +4 render tests (field visibility, engine wiring, SE-row note). |
| `src/utils/fieldManifest.test.js` | replace | YTD flow-list pin updated. |
| `KNOWN_LIMITATIONS.md` | replace | SE-MFJ-WAGEBASE narrowed to the residual (per-entity spouse attribution). |
| `CHANGELOG.md` | replace | Entry for this pass. |

Pre-deploy checks run on the exact content of these files against the 88ecb24 tree:
`vitest run` → 106 files / 1,566 tests passing (1,545 baseline + 21 new);
`eslint` → no new warnings (the 4 pre-existing ones in TaxReturn.jsx / EntityCompareModal.jsx are unchanged);
`vite build` → clean.

Behavior change summary
- R-1 changes any return with a passive rental loss AND either SE income or guaranteed
  payments. W-2-only and S-Corp-only returns are unchanged (pinned by test).
- R-2 changes nothing until an MFJ user fills the new field. Every existing record and every
  non-MFJ return computes byte-for-byte as before.

Post-deploy live check (same inputs as the fourth read):
  2025 single · partnership Box 1 $50,000 + GP $30,000 · W-2 $50,000 · active rental −$30,000
    → Rental allowed −$12,826 · §469 suspended $17,174 · AGI $111,522 · Total $25,336 (was $22,658)
  same with Box 1 $80,000, no GP → allowed −$12,826 · Total $24,016 (was $24,638)
  2025 MFJ · W-2 $200,000 · partnership $80,000 · new field = $200,000 → SE Tax $2,143 (was $11,304)
  same, new field blank → SE Tax $11,304 (unchanged)
