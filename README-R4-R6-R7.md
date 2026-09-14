# TaxStat360 — R-4 / R-6 / R-7 fix set (14 Sep 2026, second pass)

Full replacement files, built on top of the R-1/R-2 set you deployed (bundle index-deUFBB4C.js).
Copy each over the same path on `master`, commit, let Amplify build.

| Path | Status | What changed |
|---|---|---|
| `src/components/CalculateTaxInner.jsx` | replace | R-4: the accounting-software sync now strips a stale `k1DirectMode` / `k1` from the entity it updates, so a synced P&L is always scaled by Ownership %. |
| `src/utils/entityPredicates.js` | replace | R-4: `getEntityK1Share()` ignores the two "already the owner's share" shortcuts whenever `connectedId` is set (defence in depth). |
| `src/components/TaxReturn.jsx` | replace | R-6: "NOL Deduction (§172)" moved above AGI with the 80%-cap note (waterfall foots). R-7: §1231 caption names the §1231(c) ordinary slice; SE-income row names guaranteed payments; "Prior §1231 losses" tooltip no longer shows a literal `\n\n`. |
| `src/lib/taxCalc-k1direct-ownership.test.js` | replace | +5 tests for R-4. |
| `src/components/TaxReturn.test.jsx` | replace | +3 render tests for R-6 / R-7 (on top of the +4 from the R-2 set). |
| `CHANGELOG.md` | replace | Entry for this pass, including the R-3 withdrawal. |

Checks on the exact content of these files: `vitest run` → 106 files / 1,574 tests passing;
`eslint` → no new warnings (7 pre-existing); `vite build` → clean.

R-3 (QSS §199A threshold) — WITHDRAWN, no change: Form 8995 / 8995-A instructions read
"$394,600 if married filing jointly, and $197,300 for all other returns". The engine already
does that.

Not in this set (outside the repo): the API host's nginx version string (`server_tokens off`
in the EC2 nginx config) and `includeSubDomains` on HSTS — both minor. The 2026 mid-year
mileage figure (76¢ from 1 Jul 2026, "Announcement") is a table value I could not verify
against a source; please confirm before relying on it.

Post-deploy live check:
  • Sync (or re-sync) an entity, set Ownership % to 50 → the card and Step 2 show half the net.
  • Step 2 with an NOL carryforward → "NOL Deduction (§172)" appears above AGI; AGI − deduction = taxable income before §199A.
  • §1231 gain $50,000 with prior losses $20,000 → caption reads "$20,000 recharacterized as ORDINARY income under §1231(c); the remaining $30,000 is long-term capital gain".
