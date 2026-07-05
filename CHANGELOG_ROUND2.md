# TaxStat360 — Audit Remediation Round 2 (Jul 5, 2026)
## N-1 SALT cap + phase-down · N-3/N-4/N-5/N-6 cosmetics

Five drop-in replacement files in `src/`; review diff in `review/salt-and-cosmetics.patch`.
**Verification: 453/453 tests pass (9 new SALT assertions) · `vite build` succeeds ·
audit-scenario reconciliation exact (evidence below).**

## N-1 — SALT cap + OBBBA phase-down (Material) — FIXED
`src/taxCalc.js`: new per-year `saltPhaseDown` params and exported `getSaltCap(year,
status, magi)`; the itemized computation now backs out disallowed SALT (the `saltAmount`
component is capped; mortgage/charitable/medical are untouched); calcAMT receives the
post-cap SALT so the AMT addback equals what was actually deducted; results expose
`saltEntered / saltAllowed / saltCapApplied / saltDisallowed`.

Parameters (verified against P.L. 119-21 §70120 / IRC §164(b)(6)-(b)(7), multiple
concordant secondary sources incl. Thomson Reuters): 2026 cap **$40,400** ($20,200 MFS);
phase-down at 30% of MAGI over **$505,000** ($252,500 MFS); floor **$10,000** ($5,000
MFS). 2025: $40,000 / $500,000. 2024: flat $10,000, no phase-down. MAGI is modeled as
AGI (the §164(b)(7) addbacks — §911/931/933 exclusions — are outside this app's scope);
a pre-NOL AGI proxy breaks the NOL circularity, erring conservatively only for NOL
filers inside the phase-down band (documented in code).

`src/TaxReturn.jsx`: warning renders when SALT is limited, citing the authority and the
2026 figures, and pointing pass-through owners toward the **PTET entity-level election**
— the standard planning answer for S-corp owners squeezed by the cap. The field's
InfoTip (which already *claimed* "TaxStat360 applies the cap" while the engine didn't —
doc/code drift noted for the record) now also describes the phase-down.

**Verification on the audit facts** (single, 2026, $60,000 SALT + $5,000 mortgage,
SEHI $12,000): itemized **$45,400** (was $65,000 uncapped live) → taxable income falls
back into the §199A phase-in band → QBI recomputes to **$34,835** (hand-exact) → fedTax
**$42,612** (hand-exact). Phase-down case: MAGI $555,000 → cap $25,400 ✓; floor and MFS
halving covered by unit tests.

## Cosmetics — FIXED
- **N-3** (`TaxReturn.jsx`): Additional Medicare Tax now has its own waterfall line
  (§3101(b)(2)); previously included in Total Tax but invisible.
- **N-4** (`EntityCompareModal.jsx`): "Net profit share" caption now shows the
  officer-salary add-back it was already (correctly) computing.
- **N-5** (`EntityCompareModal.jsx`): reasonable-comp banner re-cited to §162(a)(1),
  Reg. §1.162-7, Rev. Rul. 74-44 (with §3121 retained for the wage-reclassification
  point); heuristic wording made internally consistent and anchored to Watson.
- **N-6** (`AIAnalysis.jsx`): the payments-risk quarterly figure is now labeled — engine
  figure when the record carries one, otherwise explicitly "rough… income tax only —
  complete Step 2 for the exact figure."

## NEW findings flagged during this work — NOT implemented (need a spec decision)
Research for N-1 surfaced two adjacent 2026 itemized-deduction provisions the app lacks.
Both live in the same code path; I deliberately did not fold them into this diff because
each has an interaction question that deserves a decision rather than a guess:

- **N-8 — OBBBA 2/37 itemized-deduction limitation (new §68 replacement, §70111).**
  For 37%-bracket filers, itemized deductions are reduced by 2/37 of the lesser of total
  itemized deductions or the taxable-income excess over the 37% threshold. Materially
  overstates deductions for top-bracket itemizers today. Open spec question: ordering
  against the QBI deduction in this engine's pipeline.
- **N-9 — 0.5%-of-AGI floor on itemized charitable contributions (2026+).**
  Requires passing the charitable component to the engine the way `saltAmount` is passed
  today (the engine currently receives only the itemized total), so it's a wiring change,
  not a one-liner.

Both matter for the same high-income S-corp-owner population the SALT phase-down hits.
Recommend scheduling as the next engine work item.

## Deploy checklist
1. Commit the five files; `npx vitest run` (expect 453/453) and `vite build`.
2. Post-deploy smoke: audit scenario + itemized ($60,000 SALT / $5,000 mortgage) →
   itemized $45,400, QBI $34,835, fedTax $42,612, SALT warning visible.
   High-MAGI check: add $255,000 other-employer W-2 → cap should read $25,400-ish and
   shrink as income rises.
3. Unchanged and still owed elsewhere: Aria backend (N-2 — still answers 20% bonus for
   2026), Form 2210/annualization, full §1368(c) AAA engine, state modeling, the
   pre-existing React hooks error in the reports tab.
