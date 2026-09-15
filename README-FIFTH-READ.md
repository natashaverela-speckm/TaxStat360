# Fifth read — external calculation audit fixes (15 Sep 2026)

Drop-in replacement files for `natashaverela-speckm/TaxStat360` @ master `3c0520b`.
Every file here is the COMPLETE file — copy each one over the same path in the repo.
`FIFTH-READ.patch` is the same change as a unified diff (`git apply FIFTH-READ.patch`
from the repo root works against that commit) if you prefer to review line-by-line.

## Files (13 replaced, 2 new)
| Path | Change |
|---|---|
| `src/lib/taxCalc.js` | F-1 NIIT on passive K-1 · F-2 §469(d)(1) netting · F-4 QSS thresholds (§170(p), CTC, §461(l)) · F-5 §199A(i) floor after TI cap |
| `src/lib/constants.js` | Comment-only: CTC threshold notes (QSS uses $200,000) |
| `src/lib/articles.js` | §199A guide: K-1 charitable, SSTB phase-in wording, de minimis rule · Salary article: Additional Medicare threshold |
| `src/lib/scenarioCompare.js` | F-3: compared entity's scenario salary attributed on MFJ |
| `src/lib/aiAnalysisTaxMath.js` | F-3: simulator default attribution = simulated officer salary |
| `src/lib/taxCalc.test.js` | CHAR test for the §199A(i) floor updated to the statutory result |
| `src/lib/taxCalc-fifth-read-passive-k1.test.js` | **NEW** — 19 spec tests (F-1, F-2, F-4, F-5) incl. the audit's live repros |
| `src/utils/w2OwnForSE.js` | **NEW** — `resolveW2OwnForSE`, `officerW2Total` (F-3 shared resolver) |
| `src/utils/w2OwnForSE.test.js` | **NEW** — 8 tests incl. the $13,156 / $15,629 repros |
| `src/components/TaxReturn.jsx` | F-3 default + caption/InfoTip · dependents InfoTip copy |
| `src/components/Dashboard.jsx` | F-3 default |
| `src/components/EntityCompareModal.jsx` | F-3 default (typed attribution handled per entity) |
| `src/components/CalculateTaxInner.jsx` | Reasonable-comp banner wording · bonus-depreciation tip · "(estimated)" · limited-partner tip |
| `KNOWN_LIMITATIONS.md` | SE-MFJ-WAGEBASE narrowed · PASSIVE-PARTNER status · new NIIT-SCORP-PASSIVE |
| `CHANGELOG.md` | Fifth-read entry |

## Verification performed on this exact set
- `npm ci` → `npx vitest run`: **108 files, 1,623 tests, all passing** (baseline was 106 / 1,596).
- `npx eslint` on every changed file: 0 errors; the 8 warnings are pre-existing (identical on master).
- `npm run build` (Vite 7): succeeds.

## Deploy checklist
1. Copy files (or `git apply FIFTH-READ.patch`), commit on a branch, open PR to master.
2. CI runs `npm test` — expect 1,623 passing.
3. After deploy, spot-check on production:
   - Single 2026, S-Corp K-1 $192,350 + officer W-2 $100k + limited-partner K-1 $300k → **NIIT $11,400** line appears.
   - Single 2026, S-Corp K-1 $35,410 + officer W-2 $60k + limited-partner K-1 $20k + rental −$30k (active) → **no suspended loss**, AGI $85,410.
   - MFJ 2026, S-Corp officer W-2 $100k + Sch C $100k, attribution field blank → **SE tax $13,156**, savings card **$15,629**.
   - QSS 2026, 2 dependents, W-2 $300k → CTC $0 (phase-out from $200k).
4. Owner follow-ups not in this set: quarterly "recommended" installment logic; confirm the two pinpoint citations noted in CHANGELOG.
