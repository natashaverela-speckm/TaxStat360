# TaxStat360 — Audit Remediation Round 3 (Jul 5, 2026)
## All repo-fixable open items: N-8 · N-9/N-9b · F-9 full AAA/E&P · 2210-lite · N-2 guard · hooks fix

Six drop-in replacement files in `src/`; review diff in `review/round3.patch`.
**Verification: 463/463 tests (10 new) · zero lint errors (hooks violation fixed) ·
`vite build` succeeds · baseline audit scenario unchanged ($52,814 / $53,764) ·
new provisions hand-verified (evidence per item).**

## N-8 — New §68 2/37 itemized limitation (OBBBA §70111) — IMPLEMENTED
`taxCalc.js`: for 2026+ effective itemizers, itemized deductions are reduced by 2/37 of
the lesser of (1) itemized deductions after all other limits (the SALT cap and
charitable floor apply first, matching "after all other limitations") or (2) taxable
income increased by those itemized deductions, over the 37%-bracket start (pulled from
the year's bracket table — $640,600 single / $768,700 MFJ for 2026).
**Spec decisions, documented in code:** (a) applied as a post-QBI taxable-income
addback — exact, because at any income where §68 can bind the §199A phase-in is
already complete and the 20%-of-TI overall cap could only loosen; §68 explicitly does
not apply to the §199A computation. (b) Disregarded for AMTI (historic §56(b)(1)(F)
treatment) — calcAMT receives the pre-limitation figure. Waterfall shows a "§68
Itemized Limitation (2/37)" addback line next to the deduction.
*Verified:* $800K wages / $100K itemized → reduction $5,405 (prong 1); $700K wages →
$3,211 (prong 2 binds); $0 below the bracket or on standard deduction.

## N-9 / N-9b — Charitable floor + §170(p) non-itemizer deduction — IMPLEMENTED
`taxCalc.js` + `TaxReturn.jsx` wiring (`charitableContr` now flows to the engine like
`saltAmount`): 2026+ itemizers lose the first 0.5% of AGI of charitable contributions
(engine exposes `charFloorDisallowed`; UI notes the 5-year carryforward, which a
single-year engine surfaces rather than tracks). Non-itemizers get the §170(p)
deduction — up to $1,000 / $2,000 MFJ-QSS — taken in addition to the standard
deduction, with a confirmation note. Same pre-NOL AGI proxy as the SALT phase-down,
documented. *Verified:* $200K AGI → $1,000 floored; $1,000/$2,000/$0-in-2025 §170(p).

## F-9 FULL — §1368(c) AAA/E&P three-tier distribution engine — IMPLEMENTED
`taxCalc.js` (basis map) + `CalculateTaxInner.jsx` (two new inputs replacing the
interim banner: Accumulated E&P and Beginning AAA, Form 1120-S Sch. M-2). Ordering per
Reg. §1.1368-2(a)(5): AAA is increased by current-year income before distributions;
losses come after. Tier 1 (AAA) → §1368(b) basis recovery/gain; Tier 2 → **dividend**
to the extent of accumulated E&P (§1368(c)(2)) — never reduces stock basis; Tier 3 →
§1368(b) treatment. Dividends flow to the 1040 as qualified dividends (§1(h)(11)) and
are included in NII (§1411(c)(1)(A)(i) — dividends are investment income regardless of
participation), preferential-rate stacked, AMT-aware. Zero E&P = byte-identical prior
behavior (regression-tested). A UI note flags that §1368(e)(3) elections are not
modeled. *Verified on audit facts:* EP $40K/AAA $0 → $35,000 dividend, $0 capital
gain, AGI $308,000 — all hand-exact; big-AAA case reproduces the original $25K gain.

## 2210-lite — §6654 per-installment schedule — IMPLEMENTED
`taxCalc.js` + `TaxReturn.jsx`: optional Q1–Q4 payment inputs; engine emits
`installmentSchedule` — cumulative required (25% per installment of the safe-harbor
minimum, §6654(d)(1)(A)), cumulative paid (withholding deemed paid evenly,
§6654(g)(1)), and per-quarter shortfalls, rendered as a table under the safe-harbor
line. Lump-sum-only entry is spread evenly and flagged "approximate." Penalty DOLLARS
are deliberately not computed (the §6621 rate floats quarterly); the note points
seasonal-income filers — the rental-heavy user base — to the §6654(d)(2)
annualized-income method (Form 2210 Schedule AI), which remains the one documented
follow-up (it requires period-by-period income the app doesn't collect).
*Verified:* $44,000 safe harbor + $5,000 Q1-only → shortfalls 6,000/17,000/28,000/39,000.

## N-2 repo-side — Aria verified-facts guard — IMPLEMENTED (mitigation, not the fix)
`Aria.jsx`: when a question matches a stale-prone topic (bonus depreciation, §179,
retirement limits, SALT, brackets/standard deduction), a pinned "VERIFIED FIGURES"
message renders ABOVE the model's reply, sourced from the same figures as the engine's
tables, explicitly telling the user to trust the pinned card if the chat answer
conflicts. **The backend fix is still owed** — the model will keep generating stale
prose; this guard makes the correct figure impossible to miss. Maintenance rule in
code: update the guard facts and TAX_TABLES together.

## Hooks fix — IMPLEMENTED
`AIAnalysis.jsx`: the conditional `useState` in the reports tab moved above the early
return. Lint: 0 errors repo-wide on the changed files (warnings pre-existing).

## Genuinely not fixable from this repo — final residual list
- **Aria backend** (model/prompt/RAG): the guard mitigates; the cure lives server-side.
- **State income tax modeling**: product decision, disclosed by banner.
- **Form 2210 Schedule AI math**: needs period-income inputs — spec'd as follow-up above.

## Deploy checklist
1. Commit six files; `npx vitest run` (expect 463/463); `vite build`.
2. Post-deploy smoke, in order: baseline scenario ($52,814 / $53,764 unchanged) →
   E&P probe (EP $40,000, AAA $0 on the S-corp: expect $35,000 qualified-dividend
   income, $0 excess-distribution gain, AGI $308,000) → $800K-wage itemizer (§68 line
   showing $5,405) → charitable $10,000 at $200K AGI itemizing (floor note, −$1,000) →
   standard-deduction charitable ($1,000 §170(p) note) → Q1-only $5,000 payment
   (installment table with growing shortfalls) → ask Aria the bonus-depreciation
   question (pinned VERIFIED FIGURES card above the reply).
3. Keep the dashboard regression record; add the E&P variant to it after smoke.
