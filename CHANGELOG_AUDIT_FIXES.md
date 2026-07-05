# TaxStat360 — Audit Remediation Changelog (Jul 5, 2026)

Drop-in replacement files in `src/` (six files). Review diff in `review/audit-fixes.patch`.
**Verification: 444/444 tests pass · `vite build` succeeds · audit scenario reconciles
to the hand-prepared return to the dollar (evidence per fix below).**

## Files changed
| File | Findings |
|---|---|
| `src/taxCalc.js` | F-1, F-5, F-7, F-8, F-10, F-13, F-15, hardening fix, 2024 QSS typo |
| `src/CalculateTaxInner.jsx` | F-9, F-10 (UI), F-13, F-14 |
| `src/TaxReturn.jsx` | F-5 (label), F-7 (warning), F-11, F-13 (note), F-15 (banner) |
| `src/AIAnalysis.jsx` | F-2 (repo-side), F-3, F-8, F-12, F-16 |
| `src/taxCalc-engine.test.js` | Expectations updated to official law + 3 new §1250/collectibles tests |
| `src/EntityCompareModal.context.test.js` | Characterization updated to hardened engine contract |

## Fixes

**F-1 — Official 2026 rate tables** (`taxCalc.js` TAX_TABLES[2026].brackets/.ltcg).
All statuses transcribed from Rev. Proc. 2025-32 (single 50,400/105,700/201,775/256,225/640,600;
MFJ 100,800/211,400/403,550/512,450/768,700; MFS 35% cap 384,350; HOH 17,700/67,450/105,700/
201,750/256,200/640,600; LTCG 49,450–545,500 / 98,900–613,700 / 49,450–306,850 / 66,200–579,600).
*Verified:* audit scenario fedTax now $56,654 (was $56,500), matching the hand calc exactly.
Bonus: 2024 QSS bracket `.37` typo at the 35% cap corrected to `.35`.

**F-5 — Unrecaptured §1250 / collectibles** (`taxCalc.js` calcPreferentialTax rewrite).
Slices now taxed flat 25%/28% per §1(h)(1)(E)/(h)(4) after the 0/15/20 stack, with the
Schedule D Tax Worksheet all-ordinary backstop; slices clamped to ≤ ltcg (matches the
engine's existing caller pre-clamp); UI label now states slice-of-LTCG semantics.
*Verified:* +$50K §1250 slice on audit facts now yields $12,500 (35% bracket) / correctly
backstopped in low brackets; 3 new unit tests with worked math.

**F-7 — §162(l)(5)(A) earned-income cap on SEHI** (`taxCalc.js` + TaxReturn warning).
Deduction capped at S-corp officer W-2 wages + net SE earnings (less ½ SE tax and SE
retirement); result exposes `sehiEntered/sehiLimit/sehiClamped`; UI warns on clamp and
cites Notice 2008-1 Box-1 requirement. *Verified:* $70,000 entered vs $60,000 wages →
deduction $60,000, clamped=true.

**F-8 — 2026 retirement & HSA limits** (`taxCalc.js` tables + AIAnalysis card).
Notice 2025-67: deferral $24,500; §415(c) $72,000; catch-up $8,000; IRA $7,500/$1,100.
HSA now in TAX_TABLES per year (2026 $4,400/$8,750, Rev. Proc. 2025-19); card reads the
selected year instead of hardcoded 2025 figures.

**F-9 — E&P/AAA interim banner** (`CalculateTaxInner.jsx`). Visible warning on the
distributions field: §1368(c) dividend ordering not modeled. Full AAA engine remains a
tracked follow-up feature (needs product decisions on inputs).

**F-10 — §1368 gain holding period** (`taxCalc.js` + entity checkbox). Per-entity
`stockHeldShortTerm` flag routes excess-distribution gain to short-term (ordinary rates)
per §1222. *Verified:* flag on → $25,000 taxed ordinary, fedTax $61,134 (exact hand calc).

**F-13 — K-1 charitable contributions (severity-upgraded finding)** (`taxCalc.js` 3 sites
+ both CalculateTaxInner reducers + helper text). box12_13 no longer nets against ordinary
K-1 income or QBI (Form 8995 instructions 2021–present; §199A(c)(1)); §179 (box11_12)
still nets per Reg. §1.199A-3(b)(1)(ii)(A). Engine exposes `k1CharitableTotal`; UI directs
it to Schedule A without auto-adding (avoids double count). Helper text corrected.

**F-11 — §6654 presentation** (`TaxReturn.jsx`). Citations corrected to (d)(1)(C)(i)
(MFS amount per (C)(ii)); "pay by" gap message now states per-installment accrual and
the §6654(d)(2) annualized-income option (relevant for seasonal rental income).
Form 2210 per-installment computation remains a follow-up feature.

**F-12 / F-14 — REPS copy** (`AIAnalysis.jsx` card, `CalculateTaxInner.jsx` card).
Both now state the two §469(c)(7)(B) tests (>750 hrs AND >50% of personal services) plus
material participation / §1.469-9(g) election, and the 7-day short-term-rental exception
(Reg. §1.469-1T(e)(3)(ii)(A)) — the correct alternative path for STR investors.

**F-15 — NIIT §1411(c)(4) disclosure** (`taxCalc.js` flag + `TaxReturn.jsx` banner).
NIIT still conservatively includes §1368(b)(2) stock gain; a banner now surfaces the
material-participation exclusion position instead of silently taxing it.

**F-3 (repo-side) — AI Analysis income base** (`AIAnalysis.jsx`). Analysis layer rebuilds
its K-1 aggregate from entities EXCLUDING real-estate entities (no more suspended passive
losses netted into "K-1 income"); the engine-facing k1Total contract is unchanged.

**F-2 (repo-side) — Bonus depreciation card** (`AIAnalysis.jsx`). Card now carries
OBBBA-correct content (100% permanent, §168(k) as amended by P.L. 119-21 §70301, post-
1/19/2025 acquisitions, recapture + §469 caveats) instead of deferring to Aria. **The Aria
backend itself is NOT in this repo and still answers with 2023 law — that fix is still
owed in the backend service.**

**F-16 — Hire-your-children card** (`AIAnalysis.jsx`). Now states the §3121(b)(3)(A)
FICA exemption never applies to a corporation, including the user's S-corp.

**Hardening (new, found during verification)** (`taxCalc.js`). `status` now defaults to
'single' in calcTaxReturn, and calcAMT gained per-status fallbacks for exemption/
phaseoutStart — previously any caller omitting `status` produced amt=NaN → totalTax=NaN
(latent on pristine HEAD; confirmed by bisect). Characterization test updated to the new
contract: untranslated context is finite-but-wrong, so translation is still required.

## Not fixed (out of repo / out of scope — still owed)
- **F-2 backend**: Aria's model/prompt (not in this repository).
- **F-4 / F-6**: already correct in this repo — deploy resolves them (meta-finding M-0).
- **F-9 full AAA engine**, **F-11 Form 2210/annualization math**: follow-up features.
- Pre-existing `react-hooks/rules-of-hooks` error in AIAnalysis.jsx reports tab
  (conditional useState after early return) — pre-dates this work; not touched to avoid
  behavior risk in a 2,200-line component. Recommend a separate fix.

## Deploy checklist
1. Commit these six files; run `npx vitest run` (expect 444/444) and `vite build`.
2. Deploy; then re-run the live audit scenario (S-corp $225K K-1 / $60K W-2 / $10K basis /
   $260K distributions / rental −$71,212 / single / 2026). Expected: AGI $310,000;
   fedTax $56,654; NIIT $950; totalTax $57,604; PAL suspended $71,212; ISO $150K →
   AMT $30,378.
3. Confirm F-4/F-6 live behaviors cleared by the deploy alone.
