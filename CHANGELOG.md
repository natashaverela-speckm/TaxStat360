# TaxStat360 Changelog

Historical fix logs previously lived in file-level `// — Change log` comment
blocks inside each `.jsx` source file (BUG-01, L-02, C-06, UX-05, F-NEW-A,
PASS5, etc.). Those headers were the right instinct; future changes go here
instead so diffs stay clean and the history is searchable in one place.

The existing in-file headers in `TaxReturn.jsx`, `CalculateTaxInner.jsx`, and
`AIAnalysis.jsx` are preserved as-is — do not remove them. They serve as a
record of work that predates this changelog.


---

## Seventh pass — independent fresh-eyes audit (engine F-1–F-9, wiring H-1–H-4 / M-1–M-8, copy A/B) — September 16, 2026

Three reviewers who had not seen the prior passes each took one surface — the engine (with
a hand-built reference calculator), the UI wiring (Step 1 → Step 2 → saved record → Dashboard
→ simulator → compare modal), and the copy / parameters / citations. Every finding below was
reproduced against master before it was fixed; the reproductions became the SPEC tests.

### Fixed — engine (`src/lib/taxCalc.js`; tests in `taxCalc-seventh-pass.test.js`, +29)
- **F-1 (HIGH) — Form 6251 Part III, line for line.** `calcAMT` positioned the 0% / 15%
  capital-gain bands against the AMT ordinary base (line 17). The form takes lines 19 / 27 —
  the amount taxed at ordinary rates on the REGULAR return (Schedule D Tax Worksheet line 21 /
  QDCGTW line 5) — so the AMT exemption can never manufacture 0%-band room the regular return
  never had. 2025 single, W-2 $75,750 + LTCG $100,000 + ISO bargain element $50,000: engine AMT
  $70; Form 6251 $1,675. Two smaller corrections fall out of following the form: collectibles
  gain is not in line 13 and is taxed inside line 17 at 26%/28% (no 28% line exists), and the
  ceiling is line 39 (all-AMT-rate on line 12), not the regular-bracket increment. New helper
  `calcSchDOrdinaryLine21()`; `calcAMT` accepts `regularOrdinaryTaxable`; the old
  `calcPreferentialTax(..., { amt: true })` mode is removed. Four pinned CHAR/SPEC values that
  encoded the old stacking were re-derived from the form (`taxCalc-engine`, `taxCalc-ccorp-audit`,
  `taxCalc-amt-1250-collectibles`).
- **F-2 (HIGH) — passive K-1 LOSS suspended under §469.** A limited partner's / passive
  shareholder's K-1 loss was deducted in full (2025 single, W-2 $200,000 + LP K-1 −$50,000:
  AGI $150,000, §469 says $200,000). It is now allowed only against net passive rental income
  (Form 8582 line 2b vs. 1a) and the remainder is suspended: added back to AGI, excluded from
  the §469(i) MAGI, the §461(l) figure and the current-year QBI base, backed out of rental NII
  (Reg. §1.1411-4(g)(8)). New outputs `passiveK1LossSuspended`, `passiveK1LossAbsorbedByRental`;
  Step 2 shows a "§469 Passive K-1 Loss Suspended" row and callout. Still open: a prior-year
  suspended K-1 loss input (KNOWN_LIMITATIONS → PAL-K1-CARRYFORWARD).
- **F-3 (MED) — Form 8582 line 1c.** The prior-year unallowed rental loss was applied only
  against a PROFITABLE rental; in a loss year it was ignored. It now joins line 1d before the
  §469(i) allowance is measured (2025 MFJ, W-2 $90,000, rental −$10,000 + prior PAL $10,000:
  $20,000 allowed, AGI $70,000 — was $80,000). The per-property branch had never consumed the
  carryforward at all while reporting it "applied"; both branches now do (nonpassive REP
  portfolio: §469(f)(1)(A)). `palCarryforwardApplied` / `Remaining` are derived after the
  branches (current-year loss deemed allowed first).
- **F-4 (MED) — §199A SSTB haircut base.** `_calcQBI` measured the phase-in haircut on the
  SSTB's GROSS share; it is the SSTB's QBI — net of §179 and (for an SE business) of the
  ½-SE / SEHI / retirement deductions attributable to it (the same `qbiShareAdjusted` the
  per-business allocation already used). 2025 HOH, SSTB Schedule C $260,000: $11,881 → $12,601.
- **F-5 (MED) — Schedule D line 11.** The long-term slice of a net §1231 gain now joins the LT
  pool before the §1211(b) limit (2026 single, W-2 $100,000, LT carryforward $20,000, STCG
  $5,000, §1231 $8,000: AGI $105,000 → $97,000; LT carryover $12,000 → $4,000). The §1231(c)
  ordinary slice stays ordinary; `f4797Inc` still feeds §461(l) unchanged; NII reads the netted
  result. Closes LIMITATION 1211-1231-NETTING.
- **F-6 (LOW) — §1402(b)(2).** No SE tax when net earnings from self-employment (the 92.35%
  figure) are under $400 (Schedule SE line 4c). New constant `SE_MIN_NET_EARNINGS`.
- **F-7 (LOW) — Capital Loss Carryover Worksheet.** The §1211(b) allowance counts as used only
  to the extent it reduced POSITIVE taxable income (2025 single, W-2 $10,000, STCL −$10,000:
  carryover $7,000 → $10,000).
- **F-8 (LOW) — §55(d)(3) MFS add-back.** AMTI increased by the lesser of 25% of the excess over
  the full-phase-out point or the MFS exemption (2024 MFS, AMTI $1,000,000: TMT $286,358).
- **F-9 (LOW) — input hardening.** `w2`, `k1Total`, `intInc`, `divInc`, `qualDiv`, `taxableSS`,
  `iraIncome` are coerced with the comma-safe `nf()` up front (a "100,000" string produced NaN
  through the whole return); W-2 floored at 0. The field manifest's `float` normalization is
  now comma-safe too (`parseFloat("5,000")` was 5).
- **M-2 — §162(l)(5)(A).** The SEHI cap read the entity's §199A W-2 total (`box17V_wages`, all
  employees) before the shareholder's OWN salary; a $60,000-salary shareholder of a $300,000-
  payroll company deducted a $70,000 premium in full. Own salary first; the §199A figure only
  as a last fallback.
- **H-1 — §469(i) active participation.** The retired top-level Step-2 flag (restored as TRUE
  by `normalizeF1040` on every record load) was overriding an UNCHECKED rental card and granting
  the $25,000 allowance. The top-level flag now governs only the retired Step-2 lump; Step-1
  rental cards carry their own attestation. `Dashboard` single-entity card and both save paths
  carry `biz.isActiveParticipant` / `biz.isREP`.

### Fixed — wiring (tests in `seventh-pass-surfaces.test.js`, +14; `seventh-pass-taxreturn.test.jsx`, +7)
- **H-2 — installment boxes credited and persisted.** Q1–Q4 fed only the §6654 timing schedule;
  a filer who typed them and left the total blank saw a balance due equal to the whole
  liability. The engine now credits the LARGER of the lump and the box sum
  (`estimatedPaymentsCredited`); the boxes are in the field manifest, the auto-save payload, the
  saved record and `toEngineContext`. Caption under the boxes says so.
- **H-3 — saved record shape.** `TaxReturn.buildRecord.f1040` dropped `mortgageInt` /
  `charitableContr` / `medicalAmt`, `f4797MateriallyParticipated`, the installment boxes and
  the year, and stored the RAW itemized lump (blank whenever the sub-fields are used) — an
  itemizer reloaded onto the standard deduction. It now mirrors the auto-save payload
  field-for-field and stores the engine-ready itemized figure.
- **H-4 — C-Corp layer on every surface.** The shared selector (Dashboard record cards,
  Step-1 provisional card, Aria grounding, AIAnalysis gating) had no corporate layer — it taxed
  the officer salary only. New `utils/ccorpLayer.js` (`ccorpLayerForReturn`,
  `mergeCcorpIntoResult`) is used by `TaxReturn`, `toEngineContext` and `calcSelector`;
  summary keys `ccorpCorpTax`, `ccorpDividends`.
- **M-1 — sticky REP.** `TaxReturn` seeded `isREP` once from the saved flag it had itself
  written, so unchecking REP on the card never reached the engine. REP status (and the
  election, §469(c)(7)(B) hours, at-risk override and prior PAL — **M-3 / M-4**) are now derived
  from the rental cards on every render by the new `utils/rentalPortfolio.js`, on every surface
  (`toEngineContext` previously never carried the hours and read prior PAL / election only from
  the Step-2 copy).
- **M-5 — simulator base** backs the S-Corp employer payroll tax out of `operatingExpenses`
  (it was re-derived from the salary and deducted twice: baseline K-1 $184,700 vs. Tracker
  $192,350).
- **M-6 — compare modal base** adds the employer payroll tax back with the salary, so the
  S-Corp scenario at the same salary reproduces the Tracker K-1.
- **M-7 — YTD mode.** The C-Corp layer is computed on ANNUALIZED profit / salary (the 21% was
  computed on raw YTD profit under an annualized headline); the Step-2 waterfall's income rows
  (capital gains, §1231, interest & dividends) show the annualized entries so the column foots.
- **M-8 — S-Corp ⇄ C-Corp type change** with the P&L panel closed re-derives the employer
  payroll tax for the new type (0 for a C-Corp, whose layer deducts it itself) and moves the
  difference through `totalExpenses` / `netProfit`; `passiveShareholder` is cleared when the
  type leaves S-Corp.

### Fixed — copy, parameters, citations
- **A-1** §448(c) gross-receipts threshold indexed per year (`SEC163J_GROSS_RECEIPTS_THRESHOLD_BY_YEAR`:
  $30M / $31M / $32M; Rev. Proc. 2023-34 / 2024-40 / 2025-32) — was a single $29M (TY2023).
- **A-2–A-8** §199A thresholds / phase-in ranges, SEP / Solo 401(k) maxima and §1211(b) figures
  in tips bound to the year tables instead of literals.
- **B-8** "Watson v. Commissioner" → *David E. Watson, P.C. v. United States*, 668 F.3d 1008
  (8th Cir. 2012), everywhere (engine message, compare modal, position worksheet, AI cards,
  constants comments, guard tests).
- **B-1** QBI loss carryforward is a single pooled amount apportioned next year (Reg.
  §1.199A-1(d)(2)(iii)(B)), not per-entity. **B-2** Form 7203 / Reg. §1.1367-1(f) ordering.
  **B-3** 100% bonus depreciation keys off property ACQUIRED after Jan 19, 2025. **B-4**
  Schedule C line references. **B-5** Form 8582 line 1c / 2c. **B-6** ISO adjustment is Form
  6251 line 2i. **B-7** collectibles field: net GAIN only. **B-9/B-10** audit-selection framing
  replaced with "commonly cited compliance risk factors" (AIAnalysis, articles). **B-11/B-12**
  §469(c)(7)(B) tests (both prongs, "in which you materially participate", either spouse alone;
  §1.469-9(g) election). **B-17** REP status alone does not exclude rental income from NIIT
  (§1411(c)(1)(A)(i); Reg. §1.1411-4(g)(7)). **B-18** Solo 401(k) adoption vs. deferral-election
  timing. **B-21** reasonable-comp banner softened to "a ratio screen, not a determination".
  **B-22** Form 7203 Part III column (b). **B-23** SALT cap shown halved for MFS. **B-24**
  §1368(c)(2) E&P dividends are qualified dividends that do not reduce basis. **B-26** Form 8582
  is required only with a passive loss, a prior-year unallowed loss or a §469(i) claim.
  **B-20 / B-25** FAQ ("What does TaxStat360 not calculate?", `Landing.jsx` + `index.html`
  JSON-LD, byte-identical): a K-1 §179 entry IS checked against the dollar cap, phase-out and
  business-income limit (the depreciation field is not); a passive K-1 LOSS is now suspended
  under §469 except to the extent of passive rental income; a prior-year suspended K-1 loss is
  not yet an input.

### Added — prior-year suspended passive K-1 loss (PAL-K1-CARRYFORWARD), same day
- Step 1: a Partnership / LLC card with "Limited partner" checked, and an S-Corp card with
  "Passive shareholder" checked, gain "Unallowed passive loss from prior years — this activity
  (Form 8582)" (`entity.priorPAL`, the field the rental cards already use for line 1c).
- Engine: the carryforward joins the Form 8582 line-2 pool (`priorK1PAL`; line 2d =
  current share − carryforward) and is allowed against this year's passive K-1 income and
  passive rental income before anything is suspended. Because it is not part of `k1Total`,
  the allowed slice is DEDUCTED (`priorK1PALApplied`) and the unabsorbed slice suspended again
  (`priorK1PALRemaining`, inside the total `passiveK1LossSuspended`; the current-year slice is
  `passiveK1LossSuspendedCurrent`). One net figure, `passiveK1AgiAdjustment`
  (= suspended − carryforward), replaces the F-2 add-back in AGI, the §469(i) MAGI, §461(l) and
  the QBI base. NII reads the netted passive income (Reg. §1.1411-4(g)(8)).
- Step 2: "Prior-Year Passive K-1 Loss Allowed (§469(b))" row; the suspended row now shows
  this year's slice; the callout states the total carried to next year. Saved record
  (`biz.priorPAL`), Dashboard card and simulator carry it. FAQ / JSON-LD updated.
- Not modeled: the §469(g) full release on disposition of the entire interest.
- Tests: `taxCalc-passive-k1-carryforward.test.js` (+10, hand-derived from Form 8582), +1 in
  `seventh-pass-taxreturn.test.jsx`.

### Verified correct, no change
- All TAX_TABLES parameters for 2024–2026 (brackets, standard deductions, LTCG breakpoints,
  AMT exemptions / phase-outs, §199A thresholds, SS wage base, retirement limits, §179, SALT,
  §461(l), CTC) against Rev. Proc. 2023-34 / 2024-40 / 2025-32, Notice 2025-67 and P.L. 119-21.

---

## Sixth pass — open items from the fifth read (quarterly timing, passive S-Corp, citations) — September 15, 2026

### Changed — estimated-payment recommendation now respects the calendar (`taxCalc.js`, `TaxReturn.jsx`, `Dashboard.jsx`, `calcSelector.js`)
- New optional engine input `asOfDate`. When supplied (every live surface passes today), the
  safe-harbor shortfall and the full balance are each spread over the §6654(c)(2) installment
  dates still AHEAD for the selected tax year (Apr 15 / Jun 15 / Sep 15 / Jan 15); when every
  date has passed the whole amount is shown as due now. Omitted ⇒ legacy ÷ 4, byte-for-byte
  (all existing tests unchanged). New outputs: `installmentsRemaining`, `installmentsPassed`,
  `nextDueDate`, `balancePerInstallment`; `safeHarborQuarterly` and `quarterlyRecommended` now
  use the remaining count.
- Step 2 "Quarterly Estimates" card: headline is "To cover the full estimated balance — per
  remaining installment (n of 4 left)"; the **safe-harbor minimum** is its own line (per
  remaining installment, or "already met"); passed due dates are struck through and the next
  one is bolded. Dashboard card label reads "/each · n left" (or "due now").
- Tests: `taxCalc-installment-timing.test.js` (+10).

- **Hotfix (16 Sep 2026, seen live):** the date was passed as the UTC `YYYY-MM-DD`, and the
  engine parsed it with `new Date(str)` (UTC midnight → US-local getters give the previous
  day), so on Sep 16 the card said "2 of 4 left" beside "next: Jan 15, 2027". Engine now
  parses `YYYY-MM-DD` as a timezone-free calendar day (Date objects in the caller's local
  calendar); callers pass `localCalendarDate()` (new, `utils/money.js`); the card's "next"
  label uses the same local-day, inclusive rule. Tests run green under UTC, New York,
  Los Angeles and Auckland (+4 in `taxCalc-installment-timing.test.js`).

### Added — S-Corp passive-shareholder attestation (NIIT-SCORP-PASSIVE)
- Step 1 S-Corp cards gain "Passive shareholder — I do NOT materially participate (§469(h))".
  New shared predicate `isPassiveK1Entity()` (`entityPredicates.js`) covers both a
  limited-partner partnership and an attested passive S-Corp; used by the engine's passive
  pool (NIIT §1411(c)(2)(A), §469(d)(1) netting, §199A(i) active-floor gate). Carried into the
  saved record (`biz.passiveShareholder`, also `biz.limitedPartner`), the Dashboard card and
  the What-If simulator. Default unchecked = nonpassive. FAQ / JSON-LD "What does TaxStat360
  not calculate?" now states that a passive K-1 LOSS is still not suspended.
  Tests: +4 in `taxCalc-fifth-read-passive-k1.test.js`.

### Fixed — citation
- "Treas. Reg. §1.199A-3(b)(1)(ii)(A)" for the §179-reduces-QBI rule was wrong ((b)(1)(ii) is
  guaranteed payments for the use of capital; the regulation never names §179). Replaced in
  all seven occurrences (Step 1 help ×2, §199A article, engine/AI comments, test header) with
  "Treas. Reg. §1.199A-3(b)(1)(vi), (b)(2)(i); Form 8995 instructions".

---

## Fifth read — external calculation audit (F-1 to F-5, copy) — September 15, 2026

An independent reviewer (EA-led) read the deployed bundle's engine end to end, rebuilt a
reference calculator from Rev. Proc. 2024-40 / 2025-32 and P.L. 119-21, and ran seven live
scenarios (Sch C; S-Corp with officer comp; S-Corp + Sch C; §199A phase-in with per-entity
wage limits; capital-gain stacking; NIIT on gains; AMT on an ISO exercise). All seven matched
to the dollar and every 2024–2026 parameter checked out. Three substantive gaps were found,
all in the passive-activity / joint-return corners, plus copy issues.

### Fixed — engine (`taxCalc.js`)
- **F-1 — NIIT omitted passive K-1 income.** A limited-partner / non-material-participation
  LLC share (the `limitedPartner` attestation → `Partnership / MMLLC — Passive`) is income from
  a passive trade or business and therefore NII — IRC §1411(c)(1)(A)(ii), §1411(c)(2)(A).
  New `passiveK1Net` / `passiveK1Income` pool (share − §179; floored at $0) feeds the NII base
  as `passiveK1NII`. Live repro: single 2026, $300k passive K-1, AGI $592k — no NIIT shown;
  now $11,400. Direction: was UNDERstating.
- **F-2 — passive K-1 income did not absorb passive rental losses before the §469(i)
  allowance.** §469(d)(1) nets aggregate passive income against aggregate passive losses first
  (Form 8582 Part I); the $25k allowance was applied to the rental loss alone. Both §469
  branches now route through `applyPassiveNetting()`; the absorbed slice
  (`passiveLossAbsorbedByK1`) is excluded from NII. Live repro: $20k passive K-1 + $30k
  active-participation rental loss at $115k MAGI suspended $12,705; now $0 (AGI $85,410).
- **F-4 — QSS treated as a joint return** for three "in the case of a joint return"
  provisions: §24(h)(3) CTC phase-out ($200,000, not $400,000 — Schedule 8812 line 9),
  §170(p) non-itemizer charitable ($1,000, not $2,000), §461(l)(3) EBL threshold (individual
  amount in the 2024/2025/2026 tables). Brackets, standard deduction, AMT, LTCG, NIIT and
  Additional Medicare for QSS were already correct and are unchanged.
- **F-5 — §199A(i) $400 floor was applied BEFORE the (a)(2) 20%-of-taxable-income cap.**
  The statute applies it to "the deduction allowed under subsection (a)", i.e. after the cap.
  `calcQBI` re-applies the floor after the ceiling (still held to taxable income). Only bites
  with taxable income under ~$2,000. `taxCalc.test.js` CHAR test updated to the SPEC result.
- Engine output adds `passiveK1Income`, `passiveK1NII`, `passiveLossAbsorbedByK1`.
- Tests: `taxCalc-fifth-read-passive-k1.test.js` (+19).

### Fixed — MFJ Schedule SE attribution default (F-3)
- The R-2 `w2OwnForSE` field defaulted to $0, so an S-Corp owner's officer salary (which flows
  from Step 1 with "do not re-enter in Step 2") never consumed their own wage base when they
  also had Schedule C / active-partnership income: SE tax overstated by up to 12.4% of the wage
  base, and the "SE tax savings vs. sole proprietorship" card showed $27,178 (MFJ) vs. $15,629
  (Single) on identical facts. New `utils/w2OwnForSE.js` (`resolveW2OwnForSE`,
  `officerW2Total`): blank ⇒ the owner's own S-Corp / C-Corp officer salary; a typed amount
  always wins (how a household whose S-Corp belongs to the other spouse opts out). Applied at
  every engine call site: `TaxReturn.jsx`, `Dashboard.jsx`, `aiAnalysisTaxMath.js` (simulator
  uses the SIMULATED salary), `EntityCompareModal.jsx` + `scenarioCompare.js` (the compared
  entity's scenario salary is the owner's W-2). Field caption + InfoTip reworded. Live repro:
  MFJ 2026, $100k officer W-2 + $100k Sch C → $13,156 SE tax (was $14,130); total $69,492.
  Tests: `utils/w2OwnForSE.test.js` (+8).

### Fixed — copy
- `CalculateTaxInner.jsx`: reasonable-comp banner said a 63% salary was "within the 35–45%
  range" — now says above/within correctly; bonus-depreciation InfoTip gave 40% as "the prior
  rate" for everything on/before Jan 19 2025 (60% for 2024, 80% for 2023 — 2024 is a
  selectable year); "2026 SSTB phase-out range (estimated)" → Rev. Proc. 2025-32 (final);
  limited-partner InfoTip now states the NIIT and §469 netting treatment.
- `TaxReturn.jsx`: dependents InfoTip said "$2,000–$2,200 (2025–2026)" — 2025 and 2026 are
  both $2,200; $2,000 is 2024. Phase-out wording names QSS explicitly.
- `articles.js` (§199A guide): K-1 charitable contributions do NOT reduce QBI (the article
  contradicted the app's own — correct — Step 1 help); SSTB "cliff" wording replaced with the
  ratable phase-in; the de minimis rule (Reg. §1.199A-5(c)(1)) described correctly — no
  "allocation of the non-SSTB portion". (Salary article): Additional Medicare threshold is
  $250k MFJ / $125k MFS / $200k otherwise; $200k is the withholding trigger.
- `constants.js`: CTC threshold comments corrected (QSS uses the $200,000 amount).

### Fixed — stale `limitedPartner` flag (follow-up, same day)
- Re-typing a Partnership / LLC card to Sole Proprietor left the §1402(a)(13) attestation on
  the record, and the SE-savings heading's `/partner|mmllc|llc/` test matched "SMLLC", so the
  card said "S-Corp K-1 and limited-partner business income" for a sole prop (math was
  unaffected — the engine's normalizeEntityType resolved the type correctly). Fixes:
  `isLimitedPartnerEligibleType` moved to `utils/entityPredicates.js` (re-exported from
  `aiAnalysisTaxMath.js`) and used by the engine's passive routing, the TaxReturn heading,
  and CalculateTaxInner's type-change handler, which now clears the flag when the new type
  cannot carry it. Tests: `utils/entityPredicates-limited-partner.test.js` (+5).
- Same trap in the What-If Simulator (`AIAnalysis.jsx` SimulatorModal): the sole-prop label
  matched `/llc/`, so a sole prop plus any entity with a stale flag simulated with NO SE tax.
  Now uses `isLimitedPartnerEligibleType` for both the entity-type test and the flag scan.

### Fixed — engine, §199A per-business allocation (full-pass follow-up, same day)
- Above the phase-in ceiling with aggregation NOT elected, `_calcQBI` splits the pooled 20%
  figure across businesses by their share of positive QBI and applies each business's own
  wage/UBIA cap. The split used each SE-subject entity's GROSS share while the pooled figure
  (`qbiBasis`) had already netted the ½-SE / SEHI / SEP deductions (Reg. §1.199A-3(b)(1)(vi)),
  so a Schedule C or active partnership took too large a slice — and when it was then
  wage-limited to $0, the S-Corp lost deduction it was entitled to on its own. Live: single
  2026, S-Corp K-1 $192,350 ($100k wages) + Sch C $100k → QBI $37,604 shown; per business
  $38,470 (tax overstated $208–$303 depending on bracket; conservative direction). Fix:
  `calcTaxReturn` attaches `qbiShareAdjusted` (share × seK1AfterAdjustments / seNetIncome) to
  SE-subject entities; `_calcQBI` prefers it when present. `taxCalc-qbi-aggregation.test.js`
  CHAR ($78,320) promoted to SPEC ($80,000 — the S-Corp's own 20% × $400k). Tests: +3 in
  `taxCalc-fifth-read-passive-k1.test.js`.

### Documented
- `KNOWN_LIMITATIONS.md`: SE-MFJ-WAGEBASE narrowed again; PASSIVE-PARTNER status updated
  (items 1, 3 done; passive K-1 LOSS suspension remains open); new NIIT-SCORP-PASSIVE.

### Not changed (audit items left for owner decision)
- "Recommended per quarter" is `max(balance/4, safe-harbor shortfall/4)` against all four due
  dates regardless of today's date — consider remaining-installment logic and a separately
  labeled safe-harbor minimum.
- Two pinpoint citations the reviewer could not match: "Treas. Reg. §1.199A-3(b)(1)(ii)(A)"
  for §179 (the deductions-attributable rule is usually cited as §1.199A-3(b)(1)(vi)) and
  "IRS Notice 2026-11" (removed from the bonus-depreciation tip; the §168(k)(6) statutory
  cite is used instead).

---

## Third pass — simulator attribution, waterfall footing, compare-modal tax year (P-1 to P-12) — September 14, 2026

A second blind checker hand-computed twelve NEW scenarios (T1–T12: YTD annualization, SSTB
phase-in, §170(p), HOH with refundable ACTC, two S-Corps + suspended rental, REP aggregation,
§1366(d) release, §704(d) partnership loss, 2024 MFS itemizer, capital-loss carryforward
netting, 2026 Sch C with SEP/HSA/§6654, §1231 loss). All twelve reconciled to Step 2 to the
dollar on the deployed bundle (T7 after the documented QBI-loss entry). A second adversarial
reviewer read the day's diffs and returned seven findings; the live run surfaced five more
presentation / wiring defects. No engine tax-arithmetic defect was found in this pass.

### Fixed — engine (`taxCalc.js`)
- **P-3 — `_scaleNumeric` parsed with `parseFloat`**: a comma-formatted string reaching the
  YTD scaler ("15,000") annualized to $30 instead of $30,000. Now parses through `nf()`
  like every other engine read. Test: `taxCalc-469-magi-audit.test.js`.
- **P-8 — `seNetLossAllowed` exposed** (≤ 0): the net Schedule C / partnership loss after
  §704(d)/§1366(d) basis limits, for the waterfall (display only; SE tax unchanged).
  Test: `taxCalc-k1direct-ownership.test.js`.
- Stale comments corrected: the §469(i) "pre-estimate" note (retired since the second pass)
  and the AMT-mode backstop description (it is the regular-schedule "all ordinary" cap).

### Fixed — What-If Simulator (`aiAnalysisTaxMath.js`)
- **P-1 — MFJ Schedule SE attribution double-counted officer salary**: Step 2 enters
  `w2OwnForSE` against personal W-2 + officer W-2, so the saved figure already carries the
  salary; the simulator added it again (room understated → SE tax understated). Now only a
  salary CHANGE moves the attribution, one-for-one. Tests: `whatif-simulator.test.js` (+5).

### Fixed — Step 2 waterfall and labels (`TaxReturn.jsx`)
- **P-2 — §170(p) non-itemizer charitable row** (2026+): AGI − standard deduction did not
  foot to taxable income by up to $2,000 (live T3).
- **P-5 — "Est. Tax Liability" over a refund**: with no payments entered and a refundable
  ACTC, the summary card and the last waterfall row labelled a $3,400 refund as a liability
  (live T4). A negative balance is now "Estimated Refund" regardless of payments entered.
- **P-6 — §1212(b) carryforward applied row**: the prior-year capital-loss inputs existed
  but never appeared in the waterfall (W-2 60,000 + ST 10,000 − LT 4,000 above AGI 64,000,
  live T10).
- **P-8 — net Schedule C / partnership LOSS row** (allowed, after basis limits): W-2 100,000
  sat directly above AGI 85,000 (live T8). The basis banner now cites §704(d) for a
  partnership instead of "§1366(d) … S-Corp losses".
- **P-7 — §1366(d) release and §199A**: the released loss is not netted out of QBI
  automatically; the released-loss row and the field tooltip now say so and point to the
  Prior-Year QBI Loss Carryforward entry (Reg. §1.199A-3(b)(1)(iv)). Owner decision pending
  on auto-netting (see report).
- **P-9 — tax year persisted** in `writePersonalContext` (was omitted; the record carried
  the manifest default year).

### Fixed — Compare Entity Structures ran on the wrong year (`CalculateTaxInner.jsx`, `calcSelector.js`)
- **P-9 — the modal's `personalContext` now carries the app-wide tax year**. Because the
  Step 2 writer never persisted `taxYear`, `readPersonalContext().taxYear` was always the
  manifest default (2026): a 2025 Schedule C $100,000 single baseline compared at $22,365
  (2026 tables) against $22,629 on Step 2. Step 1's save path stamps the year too, and
  `calcSelector._recordPersonalContext` now prefers the record-level year over
  `f1040.taxYear` (the reverse of N-1, which trusted the unreliable field). Tests:
  `EntityCompareModal.context.test.js`, `TaxReturn.test.jsx`, `calcSelector-taxyear-audit.test.js`.

### API (`TaxStat360-api`)
- **P-10 — Aria rule 7 carve-out** now names rules 8 AND 9 (rule 9 cites §163(j), §531,
  §541, §168(k), §179). Test: `test_aria_system.py`.
- **P-11 — `scripts/smoke_check.sh`**: `BASE_URL=` accepted (the usage line advertised
  it); trailing slash stripped; one FAIL line when the edge is unreachable (was six); HSTS
  max-age compared numerically (≥ 31536000, so a two-year value passes); a `000` curl
  result (no HTTP answer) now FAILS instead of printing "ok".

Suite: 106 files / 1,596 tests; lint 0 errors (28 pre-existing warnings); build clean.
API: 152 passed / 7 skipped.

---

## Fresh-eyes pass — Schedule D Tax Worksheet, §469 MAGI completeness, R-4 regression (F-1 to F-9) — September 14, 2026

A blind checker hand-computed twelve new scenarios (2024–2026; single/HOH/MFJ/MFS; Sch C,
S-Corp with SEHI and excess distributions, limited partner + GP, part-owned C-Corp,
rental income, itemizer with §68, §1250, capital-loss carryovers); an adversarial reviewer
read every diff from the 14 Sep fixes. Eleven of twelve scenarios matched Step 2 to the
dollar (two after applying the app's documented SEHI conventions). One engine defect and
one regression in the day's own work were found and are fixed here.

### Fixed — engine
- **F-1 — unrecaptured §1250 gain and collectibles taxed at FLAT 25% / 28%** (`taxCalc.js`
  `calcPreferentialTax`). The July "AUDIT F-5" change replaced the Schedule D Tax Worksheet
  stacking with flat rates plus an all-ordinary backstop. The worksheet (lines 19–21, 35–40)
  taxes those gains at the taxpayer's ORDINARY rate up to the top of the 24% bracket and at
  25% / 28% only above it — the rates are ceilings (§1(h)(1)(E), §1(h)(4)). Live: single,
  W-2 $150,000, LTCG $80,000 incl. $50,000 §1250 → $42,067 of income tax where the worksheet
  gives $41,567. A landlord in the 22% bracket was overcharged 3 points on every dollar of
  depreciation recapture. Regular tax now follows the worksheet line for line; Form 6251
  Part III (AMT) keeps the flat layers (no AMT rate below 26%). Three tests that pinned the
  flat rate were re-derived from the worksheet.
- **F-2 — R-4 regression: synced entities lost the §1366(d)/§704(d) basis limitation**
  (`entityPredicates.js`). The first R-4 change made `getEntityK1Share()` ignore an explicit
  `k1` on a synced entity — but that `k1` is how the engine's `entitiesLimited` hands the
  basis-limited loss to every SE/QBI base. Reverted to honoring `k1` always; only a stale
  `k1DirectMode` is ignored for a synced entity, and the sync path still strips both.
- **F-3 — §469(i) MAGI completeness** (`taxCalc.js`). The SEHI and §461(l) blocks are hoisted
  above the §469 section so the MAGI uses the engine's FINAL §162(l) deduction (split fields
  and the earned-income cap honored — a $20,000 premium in the "other business" box used to
  fall out of the MAGI entirely), the §1372 S-Corp wage gross-up, and the excess-business-loss
  addback, all of which reach AGI.
- **F-4 — guaranteed payments now annualize in YTD mode** (`fieldManifest.js`): the one
  entity flow that was left unscaled.
- **F-5 — MFJ attribution reaches the Dashboard tracker and the What-If simulator**
  (`Dashboard.jsx`, `aiAnalysisTaxMath.js`), so they agree with Step 2 when `w2OwnForSE` is set;
  the advisory `ficaSavings` uses the same wage-base attribution as the SE tax it is compared to.

### Fixed — presentation
- **F-6 — §68 row placement / final taxable income** (`TaxReturn.jsx`): the engine applies
  the 2/37 addback after §199A and taxes `taxableIncome`; the waterfall showed the pre-§68
  figure (live: $844,500 shown, tax computed on $847,500). Row moved, final line corrected.
- **F-7 — §1368(b)(2) excess-distribution gain had no waterfall row** (`TaxReturn.jsx`).
- **F-8 — compare-modal caption** for a synced entity carrying a stale direct-entry flag.

### Verified live, no change
- S1 2024 Sch C + LTCG + CTC $37,212 · S3 2025 MFJ dual-earner $17,349 · S4 2026 §199A
  phase-in $66,360 · S5 §1368(b)(2) $14,689 · S6 MFS §1211/§1212 $37,382 · S7 2026 itemizer
  with SALT floor, charitable floor, §68 $241,590 · S8 passive rental income + NIIT $49,763 ·
  S9 2024 limited partner + GP $5,023 · S11 §221/HSA/SEP $19,208 · S12 40% C-Corp owner
  $30,619 personal + $22,749 corporate share · S2 HOH S-Corp + SEHI $23,448 under the
  documented gross-up and QBI conventions. S10 fixed above.

### Tests
- `taxCalc-prelaunch-audit.test.js`: §1250/collectibles case re-derived (24,767) + S10 SPEC.
- `taxCalc-engine.test.js`, `taxCalc-amt-1250-collectibles.test.js`: worksheet-derived pins.
- `taxCalc-469-magi-audit.test.js` (+3), `taxCalc-k1direct-ownership.test.js` (rewritten R-4
  cases + end-to-end basis limitation), `TaxReturn.test.jsx` (+2), `fieldManifest.test.js`.
- Suite: 106 files / 1,581 tests passing.

---

## Fourth read, second pass — synced-entity ownership share and waterfall captions (R-4, R-6, R-7) — September 14, 2026

### Fixed
- **R-4 — a synced entity ignored its Ownership %** (`CalculateTaxInner.jsx`,
  `entityPredicates.js`). The accounting-software sync spread the previous entity object
  and replaced only `pnl`, so a `k1DirectMode: true` left by the "Have a K-1? Enter Box 1
  directly" toggle, or an explicit `k1` override written by a loaded record, survived the
  sync — and `getEntityK1Share()` treats both as "already the owner's share" and never
  scales. Verified live: a FreshBooks S-Corp at 50% flowed 100% of its −$481,660 loss into
  Step 2 ($441,660 suspended against $40,000 of basis instead of $200,830). The sync path now
  strips both, and the resolver ignores them whenever `connectedId` is set (defence in depth).
  Manual K-1-direct entities keep the Finding-2 contract.
- **R-6 — NOL row printed below AGI** (`TaxReturn.jsx`). The §172 deduction is inside the
  engine's AGI (Schedule 1, line 8a) but rendered after the standard deduction, so the
  column did not foot (AGI $27,470 − $15,750 − $46,878 ≠ $11,720). Now "NOL Deduction (§172)"
  sits with the above-the-line rows, with the 80% cap and the carryforward in its note.
- **R-7 — captions** (`TaxReturn.jsx`). The §1231 row said "taxed at long-term capital-gains
  rates" even when §1231(c) recharacterized part of the gain as ordinary; it now names the
  ordinary slice and the remaining LTCG. The SE-income row names the §707(c) guaranteed
  payments it contains. The "Prior §1231 losses" tooltip rendered a literal `\n\n`.

### Not changed — R-3 withdrawn
- The fourth read questioned whether a Qualifying Surviving Spouse should get the joint
  §199A threshold. The Form 8995 and 8995-A instructions say "$394,600 if married filing
  jointly, and $197,300 for all other returns" — a QSS return is "all other". The engine's
  existing fallback to the single threshold is correct; no change.

### Tests
- `taxCalc-k1direct-ownership.test.js` (+5): synced entity scales at 50% despite a leftover
  `k1DirectMode` / `k1`; manual K-1-direct contract preserved; end-to-end §1366(d) on the share.
- `TaxReturn.test.jsx` (+3): NOL row placement and note; §1231(c) caption; GP note.
- Suite: 106 files / 1,574 tests passing.

---

## Fourth read — §469(i) MAGI and MFJ Schedule SE attribution (R-1, R-2) — September 14, 2026

Independent re-check of the three pre-launch reports against the production bundle
(`index-DNJ4rrLZ.js`): every 2024–2026 table constant matched the Revenue Procedures and
14 of 16 hand-computed scenarios matched Step 2 to the dollar, including the paths the
12 Sep launch check did not re-test (MFS AMT exemption, AMT/ISO, §1231(c), guaranteed
payments, NOL 80%). The two that did not are fixed here; both sit in how the return is
assembled, not in the rate tables.

### Fixed
- **R-1 — §469(i) modified AGI omitted guaranteed payments and the ½-SE deduction**
  (`taxCalc.js`). Both §469 branches measured the $25,000 allowance phase-out on
  W-2 + K-1 Box 1 (+ investment income − HSA/SEP/SEHI). §707(c) guaranteed payments are
  ordinary gross income and nothing in §469(i)(3)(F) excludes them; the §164(f) deduction
  is taken into account (Form 8582, line 7 instructions). Verified live: a general partner
  with Box 1 $50,000 + GP $30,000 + W-2 $50,000 and a −$30,000 active rental was allowed
  the full $25,000 (MAGI measured at $100,000) where $12,826 was available (true MAGI
  $124,348) — tax understated $2,678. With the GP folded into Box 1 the same return was
  allowed $10,000 (½-SE not subtracted) — tax overstated $622. The Schedule SE block is
  hoisted above the §469 section and one `calc469iMagi()` helper now feeds both branches.
- **R-2 — married-filing-jointly never coordinated SE tax with the W-2 wage base**
  (`taxCalc.js`, `TaxReturn.jsx`, `fieldManifest.js`, `EntityCompareModal.jsx`,
  `sessionState.js`). LIMITATION SE-MFJ-WAGEBASE refused to net any W-2 against the
  §1402(b) wage base for a joint return because the household W-2 carried no spouse
  attribution. New MFJ-only Step 2 field `w2OwnForSE` — "of the W-2 wages above, the
  amount YOU earned (the spouse with the self-employment income)" — supplies it; the
  engine nets that amount (clamped to the household total). Blank/0 reproduces the prior
  conservative computation byte-for-byte, so existing records and dual-earner households
  are unchanged. Verified live: MFJ W-2 $200,000 + $80,000 partnership SE income showed
  $11,304 of SE tax; a single/HOH/QSS filer with identical inputs showed $2,143. The SE
  Tax waterfall row now states which W-2 dollars were netted against the wage base.

### Tests
- `taxCalc-469-magi-audit.test.js` (new, SPEC): GP in MAGI, ½-SE in MAGI, Schedule C
  ½-SE, both §469 branches, W-2-only regression (unchanged), YTD scaling.
- `taxCalc-se-wage-base-mfj-attribution.test.js` (new, SPEC): attributed W-2
  coordinates for MFJ and matches the single-filer figure; blank keeps the conservative
  figure; clamp to household total; non-MFJ ignores the field; result fields.
- `TaxReturn.test.jsx` (+4): MFJ field visibility, engine wiring, SE-row note.
- `fieldManifest.test.js`: YTD flow list pin updated for `w2OwnForSE`.
- Suite: 106 files / 1,566 tests passing (1,545 baseline + 21 new).

---

## Launch check follow-ups (N-1, N-3, N-4, N-5, N-6) — September 12, 2026

Independent re-check of the 11–12 Sep closing/closeout reports against the live site:
13 hand-computed scenarios (2024–2026 tables, Single/MFS/MFJ, Sch C, part-owned
C-Corp, S-Corp basis + §1366(d)(2) release, §221, CTC, NIIT, §199A phase-in, OBBBA
SALT phase-down) all matched Step 2 to the dollar. Nothing in the engine changed.
The findings below are in what SURROUNDS the engine.

### Fixed
- **N-1 — live-session summaries ignored the selected tax year** (`calcSelector.js`,
  `CalculateTaxInner.jsx`). `selectTaxSummary()` took the year from
  `readPersonalContext().taxYear`, but TaxReturn's auto-save never writes `taxYear` into
  `ts360_f1040`, so that field was always `defaultTaxYear()` (2026). The year selectors
  write `ts360_taxyear`. Every consumer of the façade — the Step-1 provisional card,
  Aria's COMPUTED RETURN block, AIAnalysis gating — therefore computed on 2026 tables
  while Step 2 (which reads `readTaxYear()` directly) computed on the selected year.
  Verified live: 2024 selected → Step 2 $16,041, Step-1 card $15,370 (the 2026 figure).
  The selector now reads `readTaxYear()`, and the Step-1 card/badge take `taxYear` as a
  memo dependency so a year change recomputes. `summarizeRecord()` had the sibling
  defect for saved records (year lives at `rec.taxYear` / `rec.biz.year`, not in
  `f1040`); it now resolves the record-level year when `f1040.taxYear` is absent.
- **N-4 — Tax Waterfall did not foot** (`TaxReturn.jsx`). A released §1366(d)(2)
  carryover (`priorSuspendedLossApplied`), the HSA deduction and the §221 student-loan
  deduction all reduced AGI with no row. Three rows added above AGI, hidden at $0.
- **N-6 — Additional Medicare Tax rendered twice** (`TaxReturn.jsx`). The AUDIT N-3 row
  and the C-10 row both drew; Total Tax was not double-counted but the waterfall read as
  if it were. One row remains (C-10, which also shows $0 near the threshold); its note
  now names the $125,000 MFS threshold instead of $200,000 for an MFS return.
- **N-5 — qualified dividends above ordinary dividends vanished silently**
  (`TaxReturn.jsx`). The L-1 clamp (line 3a ≤ 3b) is correct; a filer whose 1099-DIV is
  all qualified and who fills only Box 1b now sees an inline warning at the field.
- **N-3 — Aria explained a correct figure wrongly** (`Aria.jsx`, `calcSelector.js`).
  Asked why an itemized deduction was $43,900 on $60,000 SALT + $20,000 mortgage
  interest, Aria quoted the flat $40,400 cap and guessed at §68; the engine had applied
  the §70120 phase-down (cap $23,900 at $560,000 MAGI). The COMPUTED RETURN block now
  carries the limitation lines (deduction used, SALT entered/allowed/cap that bound,
  charitable floor, §68 reduction, above-the-line adjustments, suspended and released
  losses) — all existing engine outputs added to `_SUMMARY_KEYS` — and grounding rule 11
  makes those lines the only permitted explanation of a figure.

- **UX — Step 2 nav row collided / overflowed** (`TaxReturn.jsx`, `CalculateTaxInner.jsx`).
  The four-step breadcrumb plus five buttons needed ~1,230px on one row, but `#root` is a
  fixed 1,126px column, so "AI Analysis" ran into "← Business" and Settings sat behind
  horizontal scroll at every width. "← Business" removed (duplicate of the Entities
  breadcrumb link); hard gap between the groups; below 1,180px the AI button uses its
  short label; below 960px inactive breadcrumb steps collapse to their numbered circles
  (still buttons, names in title/aria-label) and Sign Out (also on Settings, already
  omitted on mobile) is dropped. Verified by screenshot at 700/820/960/1000/1180/1440.
  Step 1 nav given the same inter-group gap.

### Tests
- `src/utils/calcSelector-taxyear-audit.test.js` (new, 9): SPEC figures for 2024/2025/
  2026 on the same return through the live selector and through `summarizeRecord`;
  the 2026 MFJ SALT phase-down case ($23,900) exposed through the summary keys.
- `src/components/TaxReturn.test.jsx` (+5): released-loss row and note, HSA/§221 rows,
  single Additional Medicare row, MFS threshold note, qualified-dividend warning.
- Suite: 104 files, 1,545 tests passing; `vite build` clean.

### Not changed (deliberate)
- The backend `ARIA_SYSTEM` prompt (see closeout §4 — frontend rules reach the model).
- Engine (`taxCalc.js`) and tables: verified, untouched.

---

## Phase 1 documentation + process sync (Audit Synthesis) — August 13, 2026

Reconciliation pass: two disclosure items and a documentation item shipped to `master`
without the CHANGELOG entry this repo's own convention requires, and this repo had no
branch/PR workflow despite `.github/workflows/deploy.yml` already gating tests+build on
every push. This entry backfills the missing history and closes the process gap.

### Added (documentation backfill — code already live, not new in this pass)
- **`KNOWN_LIMITATIONS.md`** — addenda to `163J-NOT-MODELED` and `DEP-UNVALIDATED`
  confirming the disclosure UI described in each entry is now live in
  `CalculateTaxInner.jsx` (`SEC163J_GROSS_RECEIPTS_THRESHOLD_APPROX` /
  `SEC163J_DISCLOSURE_TRIGGER_RATIO` and `DEPRECIATION_WARNING_RATIO` /
  `DEPRECIATION_WARNING_MIN_RECEIPTS_FLOOR`, both in `constants.js`). Also records an
  independent re-verification of the §163(j)/§448(c) gross-receipts threshold against
  Rev. Proc. 2025-32 §4.30 ($30M/$31M/$32M for 2024/2025/2026) — the existing $29M
  constant is a deliberately conservative round-number floor that fires the warning
  earlier than the true threshold would require, not later; no change made since the
  under-approximation cannot cause a filer who should see the warning to miss it.
- **`src/components/CalculateTaxInner.dep163j-warnings.test.jsx`** (new) — the §163(j)
  and depreciation soft-warning disclosures had no test coverage before this pass. 6
  tests: each warning renders above its trigger threshold and stays absent below it,
  independently for both disclosures, plus a floor-value case for the depreciation
  warning's minimum-receipts comparison base.

### Added (new in this pass)
- **`.github/PULL_REQUEST_TEMPLATE.md`** — checklist mirrors the verification bar
  `deploy.yml` already enforces (tests, lint, build) plus the two checks CI cannot run
  for you: a KNOWN_LIMITATIONS.md/CHANGELOG.md entry for any LIMITATION change, and
  confirmation that a tax-figure change carries a SPEC/CHAR test with prove-it-fails
  verification. Directly targets the failure mode behind three separate incidents this
  year (Pass 1's wrong-path deploy + orphaned duplicates; Pass 3's missing-constants.js
  broken build; Pass 5's stray CHANGELOG.textClipping file) — all three were "Add files
  via upload" commits straight to `master` with no review step in between.
- **`package.json`** — added a `prepare` script that copies
  `scripts/pre-push-master-block.sh` into `.git/hooks/pre-push` on `npm install`
  (already present as a manual-install script; was never wired up to run
  automatically). Wrapped in a try/catch so it's a silent no-op in CI or any checkout
  without a `.git` directory — it only matters for a real local clone, which is what
  a branch/PR workflow requires in the first place.

### Not in this repo (tracked, action required elsewhere)
- **Branch protection** ("Require a pull request before merging" on `master`) is a
  GitHub repository setting, not a file — cannot be set from a commit. Needs to be
  turned on in Settings → Branches for the pre-push hook and PR template above to
  actually gate anything, rather than just being available to whoever remembers to
  use them.
- **`WEB3FORMS_ACCESS_KEY` / `VITE_WEB3FORMS_KEY` / `VITE_GMAPS_KEY`** — confirmed dead
  in code (see the Phase 4 housekeeping entry below); removing the values themselves
  from the Amplify console env vars is an owner action outside this repo.

### Verified, not changed
- Full suite: 857/857 passing + 6 new (863/863). `npx eslint .`: 0 errors. `vite build`:
  succeeds. No existing test's assertions or fixtures were touched.

---

## Phase 1 — C-10-BASIS: block Continue/Save until basis is entered (Audit Synthesis) — August 13, 2026

Owner decision on the `C-10-BASIS` entry in `KNOWN_LIMITATIONS.md`: declined to ratify
the existing silent $0-basis-suspends-the-loss default as permanent. Requested instead
that Step 1 block the user from continuing until basis is entered (or explicitly
confirmed at $0), with a pop-up explaining how to determine it.

### Added
- **`src/utils/entityPredicates.js`** — `isBasisLimitableEntityType(type)` (extracted
  from an inline regex previously duplicated in `taxCalc.js`) and
  `entityLossNeedsBasisEntry(entity)`: true when an entity is S-Corp/partnership, shows
  a current-year loss via `getEntityK1Share()` (the engine's own resolver), and has no
  stock basis / capital contribution / basis-restoring income item entered. Pure,
  exported, unit-testable independent of the component tree.
- **`src/components/CalculateTaxInner.jsx`** — Step 1's Continue-to-Step-2 and Save
  actions are now blocked (mirrors the existing unnamed-entity gate) while any entity
  satisfies `entityLossNeedsBasisEntry`, with a footer link ("enter basis to continue")
  that expands and scrolls to the first such entity. A second link ("How do I find my
  basis?") opens the new `BasisHelpModal` — a read-only explainer covering Form 7203
  stock/debt basis for S-Corps and outside basis (§704(d)) for partnerships, and stating
  plainly that entering $0 is a valid, honest answer if the user doesn't know their
  basis (which itself satisfies the gate — it's a real basis entry, not a bypass).
- **`src/utils/entityPredicates.test.js`** — 13 new tests for `entityLossNeedsBasisEntry`
  and `isBasisLimitableEntityType`: entity-type gating, loss-sign boundary (exactly $0
  is not a loss), all three basis-entry paths (stock basis incl. explicit $0, capital
  contribution, basis-restoring income), and the null/undefined-entity case. Prove-it-
  fails verified: temporarily changed the loss-sign check from `< 0` to `<= 0`, confirmed
  the "$0 K-1 is not a loss" test failed, restored, confirmed green again.

### Changed
- **`src/lib/taxCalc.js`** — `isLimitable` (inside the basis-limitation entity map) now
  calls the shared `isBasisLimitableEntityType()` instead of its own inline copy of the
  same regex. No behavior change (identical pattern); removes one of the two duplicate
  copies this predicate had before this pass.

### Not changed
- `assumeZeroBasisOnLoss=true` in `calcTaxReturn()` — the engine's own conservative
  default is UNCHANGED and remains as defense-in-depth for any record that reaches the
  engine without passing through the new UI gate (e.g. a loaded/imported record predating
  this change). This pass is a UI policy change, not a tax-calculation change.

### Verified
- Full suite: 876/876 (prior) + 13 new = 889/889 passing. `npx eslint .`: 0 errors, 21
  warnings (unchanged baseline). `vite build`: succeeds.

---

## Phase 4 — 4797-NII and CTC-ACTC (Audit Synthesis) — August 12/13, 2026

Two owner-approved roadmap items ("Both", per Phase 4 scoping): a refundable Additional
Child Tax Credit and an NII exclusion for materially-participated Form 4797 gains. Resolves
the `LIMITATION CTC-ACTC` and `LIMITATION 4797-NII` entries in `KNOWN_LIMITATIONS.md` (see
there for full statutory detail and exposure history).

### Added
- **`src/lib/taxCalc.js` / `src/lib/constants.js`** — refundable Additional Child Tax Credit
  (IRC §24(h)(5)). New `actc` output: `Math.min(unusedCTC, numDependents * actcMaxPerChild,
  15% of earned income over $2,500)`, where `unusedCTC` is the portion of the nonrefundable
  Child Tax Credit that exceeded tax liability, and earned income uses the §32(c)(2)
  definition (W-2 wages + net SE earnings, net of deductible SE tax) already established
  elsewhere in the engine for the SEHI cap base. Placed on `balance` like a payment (Form
  1040 Line 28), not subtracted from `totalTax`. New constants `ACTC_RATE` (0.15),
  `ACTC_EARNED_INCOME_FLOOR` ($2,500, statutory, not inflation-adjusted), and
  `ACTC_MAX_PER_CHILD_FALLBACK` ($1,700); the authoritative per-year cap lives in
  `TAX_TABLES[year].ctc.actcMaxPerChild` (confirmed $1,700 unchanged for TY2024-2026, Rev.
  Proc. 2025-32 §4.05(2)).
- **`src/lib/taxCalc.js`** — Form 4797 material-participation NII exclusion (IRC
  §1411(c)(1)(A)(iii) / Treas. Reg. §1.1411-4(d)(4)(i)). New opt-in attestation field
  `f4797MateriallyParticipated` (boolean, default `false`); when set, the Form 4797 gain is
  excluded from the `nii` calculation only — AGI, gross income, the preferential-rate gain
  figure, and the §461(l) excess-business-loss offset are unaffected.
- **`src/utils/fieldManifest.js`** — `f4797MateriallyParticipated` added to the session
  field manifest (boolean, default `false`).
- **`src/components/TaxReturn.jsx`** — checkbox "This gain is from an active business/rental
  I materially participate in (excludes it from Net Investment Income Tax)," shown only when
  the Form 4797 field holds a positive value (a §1231 loss has no NII exposure either way).
  New breakdown row "Additional Child Tax Credit (Refundable)," shown only when `actc > 0`,
  placed alongside the withholding/payments rows (not the nonrefundable Child Tax Credit row
  above it, which reduces Total Tax rather than balance). The existing "Estimated Refund" UI
  branch already handled negative balances correctly — no new refund-scenario screen needed.
- **`src/lib/taxCalc-actc.test.js`** (new, 7 tests) and **`src/lib/taxCalc-4797-nii.test.js`**
  (new, 5 tests) — SPEC/CHAR coverage for both features, independently hand-derived from
  statute rather than the engine's own output. Both suites prove-it-fails verified (each
  differentiating assertion confirmed to fail when its corresponding engine logic is broken,
  with unrelated tests unaffected) before delivery. Full regression suite: 857/857 passing.

---

## Phase 4 housekeeping (Audit Synthesis) — August 12, 2026

Roadmap-scoped cleanup items, no user-facing behavior change.

### Changed
- **`package.json` / `package-lock.json`** — Vite upgraded 6.4.3 → 7.3.6;
  `@vitejs/plugin-react` upgraded to 5.2.0 (the 6.x line requires Vite 8 — installing
  `@latest` silently jumps to a Vite-8-only build; pinned to the Vite-7-compatible line
  instead). Verified in an isolated sandbox with a REAL `npm install` (not the symlinked
  `node_modules` workaround used for iterative testing elsewhere in this engagement):
  `npm run build` succeeds (852.58 kB main bundle, same warning profile as before),
  `npm run dev` boots clean with no console warnings, and the full test suite passes
  847/847 (64/64 files) — notably including `windowOpenNoopener.test.js`, which fails
  under the symlinked-`node_modules` sandbox workaround (a known, previously-diagnosed
  sandbox artifact, not a real bug) but passes clean under a real install, on both Vite
  6 and Vite 7. Amplify's `preBuild` phase already runs `nvm install 22` (`amplify.yml`),
  which satisfies Vite 7's Node 20.19+/22.12+ requirement with no build-pipeline change
  needed. `engines.node` tightened from `>=20` to `>=20.19` to match.
- **`src/lib/taxCalc.js`** — removed the dangling `hasMultiEntityTypes` computation
  flagged in the Module E cleanup (Aug 2026) as "worth a future tidy-up": `_calcQBI`'s
  `opts` destructure stopped reading this binding when the §1.199A-4 aggregation gate
  switched to entity count, but the top-level computation and pass-through survived as
  dead code (confirmed via `grep` — no other reference anywhere in the file, and ESLint
  reports zero unused-binding warnings after removal). No behavior change; 845/845 tests
  still pass.

### Investigated, no code change
- **WEB3FORMS key rotation** — already resolved by an earlier pass (see KNOWN_LIMITATIONS.md
  `[historical] OBS-5`): the web3forms access key no longer ships in the client bundle, and
  web3forms itself has been retired from the live submission path. What remains is pure
  account/infra hygiene requiring owner action outside this codebase: rotate or deactivate
  the key at web3forms.com, and delete the now-inert `WEB3FORMS_ACCESS_KEY` / `VITE_WEB3FORMS_KEY`
  environment variables from the EC2 service and Amplify console respectively (see
  `CLEANUP_RUNBOOK.md`).
- **`VITE_GMAPS_KEY`** — confirmed fully dead: zero remaining `import.meta.env.VITE_GMAPS_KEY`
  reads and zero `google.maps`/`maps.googleapis` references anywhere in `src/`. The
  address-autocomplete feature that used it lived on a component deleted in an earlier
  audit flow revision (`Onboarding.jsx` comment, line ~97). Nothing to remove in code —
  the only remaining artifact is the unused `VITE_GMAPS_KEY` value in the Amplify console
  env vars, an owner action (AWS console access required).

---

## Cosmetic wording sweep (Round 5) — August 11, 2026

Round 4's post-deploy regression review (fresh clone + full verification, no code regressions
found) flagged that the same circular "% of total officer compensation" wording fixed in
`CalculateTaxInner.jsx` (Round 4, Finding 7) still appeared verbatim in two other user-facing
surfaces not touched by that round. Same fix applied for consistency: renamed "officer
compensation" to "S-Corp compensation" and confirmed/clarified the "(salary + K-1 income)" or
"(salary + distributions)" parenthetical in each. Text-only change; no calculation, test
behavior, or data flow affected.

### Fixed
- **`src/components/AIAnalysis.jsx`** (line ~603, "No Officer Compensation" finding action
  text) — "35–45% of total officer compensation (salary + K-1 income)" → "35–45% of your total
  S-Corp compensation (salary + K-1 income)".
- **`src/components/AIAnalysis.jsx`** (line ~1091, S-Corp salary-vs-distribution opportunity
  `howTo` text) — "35–45% of total officer compensation (salary ÷ (salary + K-1 income))" →
  "35–45% of your total S-Corp compensation (salary + K-1 income)" (also dropped the embedded
  ratio-formula aside, which was confusing alongside the "%" figure already stating the ratio).
- **`src/lib/articles.js`** (line ~75, "The 35/65 Rule of Thumb" knowledge-base article) —
  "{SCORP_REASONABLE_COMP_GUIDELINE_RANGE} of total officer compensation (salary +
  distributions)" → "{SCORP_REASONABLE_COMP_GUIDELINE_RANGE} of your total S-Corp compensation
  (salary + distributions)".

### Verified correct, not changed
- Plain "% of total compensation" ratio statements (no "officer" in the phrase — e.g.,
  "salary is 23% of total compensation" in `src/lib/articles.js` lines 96, 112, 305,
  `src/utils/topLevers.js` line 45, and `src/components/AIAnalysis.jsx` line 606) are not the
  same circular pattern: they state a computed ratio (`ratioPct`) against a plainly-named
  denominator, without self-referentially calling that denominator "officer compensation." Left
  as-is.

---

## Pre-launch fresh-eyes audit remediation (Round 4) — August 11, 2026

Independent pre-launch audit (fresh eyes, no memory of prior findings) live-tested the deployed
app across S-Corp, Individual/1040, and Real Estate scope, with extra scrutiny on the recently
modified §199A QBI / SEHI interaction. Findings labeled `EXT-N` continuing the numbering from the
prior rounds. Two of the audit's flagged items (§1368(c) AAA/E&P "ordering broken", combined QBI
total "not reconcilable") did NOT reproduce against the actual engine or a clean test entity —
verified false positives caused by the audit agent testing against a reused entity with
unrelated leftover K-1 income data; see the Round 4 findings map for the verification detail.
The remaining items were real and are fixed below.

### Fixed
- **`src/components/CalculateTaxInner.jsx`** (EXT-8, Finding 2 — MATERIAL) — the "BUG-B FIX"
  P&L live-bind effect reset `box17V_wages` (the §199A K-1-statement W-2 wage figure) to `''`
  whenever ANY P&L field changed (its effect deps include revenue, expenses, depreciation,
  advertising, other deductions — not just officer salary), as long as officer comp was nonzero.
  `box17V_wages` is never auto-populated to mirror officer salary anywhere in this codebase — it
  only ever holds a deliberately-entered or imported figure — so the "staleness cleanup" premise
  was wrong, and the actual effect was silently discarding real data (a company's TOTAL W-2
  payroll, routinely larger than just the officer's own salary) on unrelated edits. Understated
  the §199A(b)(2) wage-limited QBI deduction for any S-Corp with employees beyond the
  shareholder-officer. Fix: removed the destructive reset entirely; 2 new regression tests in
  `CalculateTaxInner.test.jsx`, prove-it-fails verified.
- **`src/components/CalculateTaxInner.jsx`** (EXT-8, Finding 4) — the rental "Sold or exchanged
  this property?" disclosure told users ordinary §1245/§1250 recapture goes in the "Capital
  Gains (Form 4797)" field, directly contradicting that field's own tooltip in `TaxReturn.jsx`
  ("Do NOT enter ordinary depreciation recapture here"). Reworded so both agree: that field is
  for the NET §1231 gain/loss only. §1245 ordinary recapture has no dedicated field in this app;
  the disclosure now says so explicitly rather than pointing to an incorrect field. Documented as
  `KNOWN_LIMITATIONS.md` → `1245-ORDINARY-RECAPTURE`.
- **`src/components/TaxReturn.jsx`** (EXT-10, Finding 5) — added a double-count warning to the
  SEHI premium field: nothing previously flagged that the same premium could already be inside
  Step 1's business net income (manual entry or an accounting-software sync), in which case
  entering it again in Step 2 deducts it twice.
- **`src/components/TaxReturn.jsx`** (EXT-11, Finding 6) — the Tax Waterfall never showed the
  EXT-1 SEHI wage grossup as its own line, so the displayed income rows didn't visibly sum to
  the displayed AGI (the bottom-line number was always correct; the audit trail wasn't). Added
  a dedicated "SEHI Wage Grossup (S-Corp, IRC §1372)" row.
- **`src/components/CalculateTaxInner.jsx`** (EXT-9, Finding 7) — the "Officer Compensation
  Looks Reasonable" banner said salary was some percentage "of total officer compensation" —
  self-referential as written (salary IS that figure). Reworded to "of your total S-Corp
  compensation (salary + K-1 income)", matching every other reasonable-comp disclosure in the app.
- **`KNOWN_LIMITATIONS.md`** — added `1245-ORDINARY-RECAPTURE`.

### Verified correct, not changed
- AMT exemption/phase-out for 2026 (Finding 8): exemption $90,100/$140,200, phase-out threshold
  $500,000/$1,000,000, 50% phase-out rate — confirmed against Rev. Proc. 2025-32 via independent
  web research; matches `TAX_TABLES[2026].amt` exactly.
- §469(i) $25,000 active-participation allowance phase-out (Finding 9): single-source-of-truth
  `calc469iAllowance()` matches the statute exactly ($25,000 base, phases out 50¢/$1 of MAGI over
  $100,000); already numerically verified in the Round 2 fresh-eyes pass at $120,000 MAGI
  ($15,000 allowed).

## External tax-accuracy audit remediation — August 11, 2026

Independent external audit (S-Corp, Individual/1040, Real Estate/Schedule E modules, TY2026)
conducted by live-testing purpose-built edge-case scenarios against the deployed app, not a
source-code review. Full report delivered separately; this entry covers the fixes made in this
repository in response to it. Findings numbered per that report; labeled `EXT-N` in code/comments
to avoid colliding with this repo's own internal `F-N`/`D-N`/`M-N` audit identifiers.

### Fixed
- **`src/lib/taxCalc.js`** (EXT-1, Finding 1 — MATERIAL) — >2% S-Corp shareholder self-employed
  health insurance premiums were deducted from AGI (`selfEmpHealthDed`, F-7's §162(l)(5)(A) cap)
  with NO corresponding wage inclusion anywhere in the engine. IRC §1372 / Rev. Rul. 91-26 require
  the premium to first be included in Box 1 W-2 wages before the offsetting Schedule 1, Line 17
  deduction — the two are supposed to net to zero AGI effect. Live test: a $12,000 SEHI entry
  reduced AGI (and tax) by the full $12,000 with no offsetting income. Fixed by introducing
  `sehiScorpWageGrossUp` — the lesser of the allowed deduction and the S-corp officer W-2 base
  (`_scorpOfficerW2ForSEHI`, already computed for the F-7 cap) — added to `grossIncomeBeforeNOL`.
  Deliberately does NOT touch `totalW2ForFICA` / `additionalMedicare`, which continue reading the
  raw `w2`: S-corp SEHI is exempt from FICA/Medicare tax (Notice 2008-1), so grossing up the
  income-tax-side wage figure while leaving the FICA-side figure untouched is required, not
  optional. Sole-prop/partner SEHI (never "wages" to begin with) is unaffected — `sehiScorpWageGrossUp`
  is 0 with no S-corp officer wage base to gross up against.
- **`src/lib/taxCalc-sehi-scorp-grossup.test.js`** (new) — 4 SPEC tests: full coverage by the
  S-corp wage base nets AGI to the no-SEHI baseline; the grossup never leaks into FICA wages or
  Additional Medicare Tax; a premium exceeding the officer wage base grosses up only to the
  (also §162(l)(5)(A)-capped) allowed deduction; sole-prop SEHI is unaffected (grossup = 0).
- **`src/components/TaxReturn.jsx`** (EXT-1 UX + Finding 3) — the SEHI tooltip and the
  `sehiClamped` warning banner both described the wage-inclusion requirement in a way the
  calculation didn't actually enforce; reworded to reflect the automatic grossup above. Separately
  (Finding 3), the tooltip's earned-income cap sentence previously said the deduction "cannot
  exceed your net self-employment income" for ALL filer types — wrong for S-corp shareholders, who
  have no SE income from the S-corp; their §162(l)(2)(A) cap is W-2 wages from that S-corp, not net
  SE income. Split the sentence by entity type.
- **`src/components/CalculateTaxInner.jsx`** (Finding 4) — the per-entity Depreciation tooltip
  led with "For 2025 the §168(k) bonus rate is 40%..." regardless of the selected tax year (the
  underlying rule is placed-in-service-date-based, not filing-year-based, so it was substantively
  correct for 2026 too, but the framing risked users on a 2026 return second-guessing a correct
  100% entry). Reworded to state the permanent 100% rate first and the year-agnostic 1/19/2025
  cutover, rather than leading with "For 2025."
- **`src/components/CalculateTaxInner.jsx`** (Finding 5) — added a "Sold or exchanged this
  property?" disclosure to the Real Estate entity card pointing users to Form 8824 for §1031
  like-kind exchanges and to the correct existing Step 2 fields (Capital Gains/Form 4797,
  Unrecaptured §1250 Gain) for recognized gain and recapture — none of which this rental-income
  card computes on its own.
- **`src/components/CalculateTaxInner.jsx`** (Finding 2) — added a §1374 built-in-gains-tax
  disclosure warning, keyed off `entity.accumulatedEP > 0` (the existing signal that an S-corp has
  C-corp history, already used for §1368(c) AAA/E&P ordering). Disclosure only; BIG tax itself is
  not computed. See `KNOWN_LIMITATIONS.md` "BIG-1374" for the residual gap (the trigger only fires
  when E&P was retained at conversion) and what full support would require.
- **`KNOWN_LIMITATIONS.md`** — three new entries: `BIG-1374` (Finding 2, §1374 not modeled),
  `121-HOME-SALE` (Finding 6, §121 principal-residence exclusion out of scope — no code change,
  scope boundary recorded per the audit's recommendation), `DEP-UNVALIDATED` (Finding 7, no
  statutory cap check on the manual P&L depreciation entry — distinct from the already-modeled
  `179-DOLLAR` business-income limitation on the separately-stated K-1 §179 box).

### Verified, not changed
- Full suite: 817/817 tests passing (813 pre-existing + 4 new EXT-1 SPEC tests). `npx eslint .`
  and `vite build` both clean — see this pass's verification notes.
- Findings 2, 6, 7 deliberately NOT given full computational fixes in this pass — each requires
  either new data collection (BIG tax: S-election date, NUBIG; §121: home-sale entry point) or
  owner sign-off on a scope decision, consistent with this repo's own `KNOWN_LIMITATIONS.md`
  process ("Changing one requires the owner's sign-off, SPEC tests, and a CHANGELOG entry").


---

## Post-deploy regression review — August 10, 2026 (same-day follow-up #2)

Owner-requested review of both prior same-day passes (the consistency audit fixes and
the test-labeling tail closure) for regressions, accuracy issues, or new bugs before
trusting the deploy. Found one real, live bug; everything else checked out clean.

### Fixed
- **`src/components/TaxReturn.jsx`** — the Module A SALT-cap-joiner fix (see the first
  entry below) shipped with a broken "and": `.join(', ').replace(/, ([^,]*)$/, ', and $1')`
  assumed the last list item was comma-free, but every SALT cap figure here is
  `>= $10,000` and `toLocaleString()` gives each one its own thousands-separator comma
  (e.g. "$40,400") — so `[^,]*` could never reach the string's true end and the regex
  silently never matched. Net effect: the tooltip read "...for 2025, $40,400 for 2026"
  with the "and" missing, live in production. This was a WORDING regression only — the
  dollar figures themselves (from `SALT_CAPS`) were correct and unchanged throughout;
  no tax math was affected. Fixed by replacing the regex with an Oxford-comma-safe
  array joiner (`joinWithAnd`) that operates on the list of parts, not the
  already-joined, comma-containing string — immune to this class of bug regardless of
  how large the dollar figures get.
- **`src/components/TaxReturn.test.jsx`** — added a regression test asserting the exact
  joined SALT-cap wording (`"...2025, and $40,000 for 2026"`, not a bare comma). This
  is also a gap-closure: none of the 812 tests passing at the time Module A shipped
  actually rendered and asserted on this tooltip's text, which is why the bug reached
  production despite a clean test run. The new test expands the itemized-deductions
  accordion (`useItemized: true`) and the "Above-the-Line Deductions & Adjustments"
  `CollapsibleSection` (both required just to mount the field — neither is the bug
  itself) before asserting on `container.textContent`.

### Verified, not changed (full review of both prior passes)
- **Module B (MoneyInput rename)** — re-audited call-site counts (23 `Step1MoneyInput`
  in CalculateTaxInner.jsx, 33 `Step2MoneyInput` in TaxReturn.jsx, matching the original
  tag counts exactly) and confirmed zero leftover `SharedMoneyInput` references and
  zero un-renamed bare `<MoneyInput` call sites. Clean.
- **Module E (dead-code removal)** — confirmed `hasMultiEntityTypes` is still computed
  and passed by `calcTaxReturn()` (taxCalc.js ~1655) even though `_calcQBI` no longer
  reads it; this is inert (JS destructuring silently ignores extra object properties)
  and was already inert before the cleanup — not a regression, though the upstream
  computation is itself now a minor dangling leftover worth a future tidy-up. All 5
  removed bindings reconfirmed genuinely unused with no call sites anywhere.
- **Module C + tail (89 + 14 CHAR labels)** — diffed all 14 affected files line-by-line;
  confirmed every changed line is either an `it(...)` label or a comment, confirmed
  test counts are unchanged per file (no `it()` blocks merged, split, or lost), and
  confirmed no double-labeling (`CHAR: CHAR:` etc.) anywhere.
- **New CI guard** (`architecture-invariants.test.js`, SALT-cap literal-fallback check)
  — confirmed it correctly flags the original bug pattern
  (`SALT_CAPS[2024] || 10000`) and does not false-positive on the sanctioned
  `SALT_CAPS[taxYear] ?? SALT_CAPS[CURRENT_TAX_YEAR]` pattern already in `taxCalc.js`.
- **ARCHITECTURE.md, CHANGELOG.md** — backtick-balance and Pandoc render checks both
  clean; no broken Markdown.
- Full suite: 813/813 tests passing (812 + 1 new regression test). `npx eslint .`:
  0 errors, 21 warnings (unchanged, all pre-existing). `vite build`: succeeds.

---

## Test-labeling tail closure — August 10, 2026 (same-day follow-up)

Closes the M6b tail left open by the code consistency audit's Module C (below):
5 `taxCalc-*.test.js` files that were already mostly labeled (so out of scope for
that batch's "fully-0-labeled files" list) had a combined 14 stragglers.

### Fixed
- **`src/lib/taxCalc.test.js`** (144/149 → 149/149) — 5 tests added after the
  original M6b mass-label pass, so they postdated it and were missed.
- **`src/lib/taxCalc-se-wage-base-coordination.test.js`** (2/7 → 7/7),
  **`src/lib/taxCalc-k1direct-ownership.test.js`** (4/6 → 6/6) — mechanical
  `CHAR:` backfill.
- **`src/lib/taxCalc-reasonable-comp.test.js`** (8/9 → 9/9) — the 1 remaining test
  used a non-standard `SPEC-note:` prefix; normalized to `CHAR:` since the test
  itself says it "guards the constants relationship rather than a legal value" —
  exactly the CHAR definition, and the opposite of what a `SPEC` label claims.
- **`src/lib/taxCalc-amt-preferential.test.js`** (3/4 → 4/4) — same story with a
  non-standard `GUARD:` prefix, normalized to `CHAR:`.
- **`ARCHITECTURE.md`** §6 — M6b marked CLOSED; every `taxCalc-*.test.js` file is
  now 100% labeled. Also corrects an arithmetic error in the prior entry (it said
  "19 assertions... unlabeled"; the actual count was 14).

None promoted to `SPEC:` in this pass — that remains a per-test, independently-
verified judgment call for a future pass, not something a mechanical backfill
should do.

### Verified, not changed
- Full suite: 812/812 tests passing (no new tests added, only labels changed).
- `npx eslint .`: 0 errors, 21 warnings (unchanged from the prior pass).

---

## Code consistency audit follow-up — August 10, 2026

Owner-commissioned code consistency audit (naming, architecture, duplication, state,
error handling, documentation, tests, configuration, dead code — tax-law accuracy and
UX explicitly out of scope). Full report delivered separately; below are the fixes
landed from that pass (Modules A, B, C, E; Module D is this file's sibling edit to
ARCHITECTURE.md; Module F — a possible future session-state access-layer refactor —
was scoped but not implemented).

### Fixed
- **`src/components/TaxReturn.jsx`** (Module A) — the SALT-cap `InfoTip` hardcoded
  `SALT_CAPS[2024] || 10000` / `SALT_CAPS[2025] || 40000` / `SALT_CAPS[2026] || 40400`
  as literal fallbacks for three hand-picked years, duplicating TAX_TABLES and never
  growing when `SUPPORTED_TAX_YEARS` gains a year — the one active violation found of
  ARCHITECTURE.md §1's "never retype a tax figure as prose in a component" rule. Now
  derives `saltCapsSummary` from `SALT_CAPS`/`SUPPORTED_TAX_YEARS` only, no literals.
  `src/architecture-invariants.test.js` gained a matching CI guard.
- **`src/components/CalculateTaxInner.jsx`, `src/components/TaxReturn.jsx`** (Module B)
  — both files declared a local component literally named `MoneyInput`, forcing the
  shared `src/components/MoneyInput.jsx` import to be aliased as `SharedMoneyInput` to
  avoid colliding with it. (On inspection, both locals are thin styling adapters that
  already delegate all formatting/parsing logic to the shared core per the D-12/D-13
  consolidation — this was a naming collision, not a re-duplicated implementation.)
  Renamed to `Step1MoneyInput` / `Step2MoneyInput`; the shared import now keeps its
  natural name, `MoneyInput`.
- **9 `taxCalc-*.test.js` files** (Module C) — backfilled `CHAR:` labels onto all 89
  previously-unlabeled or partially-labeled tests (sec179, qbi-wage-limit, pal,
  a6-optin, guaranteed-payments, qbi-aggregation, partnership-basis, se-partnership,
  qbi-min400), per ARCHITECTURE.md §6's "new tests MUST be labeled" — these were the
  files sitting at 0 (or near-0) labeled out of the `taxCalc-*` family. None promoted
  to `SPEC:` in this pass; that requires independently re-verifying each expected
  value against its cited authority. `taxCalc-pal.test.js` and `taxCalc-sec179.test.js`
  also had a redundant pre-existing trailing `(CHAR)` marker removed now that the
  `CHAR:` prefix is in place. A further 19 stragglers remain across
  `taxCalc.test.js`, `taxCalc-se-wage-base-coordination.test.js`,
  `taxCalc-k1direct-ownership.test.js`, `taxCalc-reasonable-comp.test.js`, and
  `taxCalc-amt-preferential.test.js` — not in scope for this pass, tracked in
  ARCHITECTURE.md §6.
- **`src/lib/taxCalc.js`, `src/components/Dashboard.jsx`,
  `src/lib/scenarioCompare.test.js`, `src/utils/calcGuard.test.js`** (Module E) —
  removed 5 ESLint-flagged unused bindings (`hasMultiEntityTypes`, `pct`,
  `setConnectedApp` (and its unused getter), `setXeroLoading`, `best`, `beforeEach`).
  No behavior change; `npm run lint` warning count 27 → 21.

### Verified, not changed
- Full suite: 812/812 tests passing (811 pre-existing + 1 new CI guard from Module A).
- `npx eslint .`: 0 errors both before and after (21 warnings remaining, all
  pre-existing React-hooks-dependency and fast-refresh notices unrelated to this pass).
- No commented-out code or leftover dead patches found anywhere in `src/` — nothing to
  clean up there.

---

## Independent audit follow-up — July 31, 2026

Owner-commissioned independent launch-readiness review (public site + in-app, logged in as
admin). Full report delivered separately; below are the fixes landed from that pass.

### Fixed
- **`src/components/Landing.jsx`** — the "Is my financial data secure?" FAQ answer said data
  is "never sold or shared with third parties," which contradicted `Privacy.jsx`'s own
  disclosures (Stripe, AWS, the read-only accounting integrations, and Anthropic's Claude API
  for AI features all receive data as needed to run the product). Reworded to match
  `Privacy.jsx`'s precision: never sold, never shared for advertising/marketing, shared only
  with the service providers that power the product.
- **`src/components/TaxReturn.jsx`**, **`src/components/Dashboard.jsx`** — "Effective rate" was
  shown with no stated basis. `effRateLabel()` (`utils/money.js`) computes tax ÷ AGI, not
  tax ÷ taxable income — both are legitimate definitions, but leaving it unstated invites the
  reader to assume whichever one they're used to. Added an `InfoTip` next to the label in both
  locations explaining the AGI basis, with matching copy so the explanation is identical
  wherever the stat appears (this card, the Dashboard summary tile, and the AI Analysis header,
  which renders the same Dashboard tile).

### Investigated, not fixable from this repo
- **AUTH-SESSION** (see `KNOWN_LIMITATIONS.md`) — reproduced a login bug live against production:
  `POST /auth/login` returns 200, the immediate `GET /auth/me` returns 401, user is bounced back
  to `/login` with "session expired." Frontend `credentials: 'include'` handling in
  `apiClient.js` and `Onboarding.jsx` is correct; likely cause is a `Set-Cookie` on the login
  response missing `SameSite=None; Secure` for the `www.taxstat360.com` → `app.taxstat360.com`
  cross-origin request, or a CORS `Access-Control-Allow-Origin`/`-Credentials` misconfiguration.
  That's issued by the auth backend (`taxstat360-api`, per the "set by login Lambda" comment in
  `App.jsx` — a separate repo, not this one). See `KNOWN_LIMITATIONS.md` → AUTH-SESSION for the
  specific things to check there, including a working `access_token` bearer-token fallback that
  may already sidestep the cookie issue if the backend reliably returns one.

### Already fixed, pending deploy
- **AUDIT-1 / AUDIT-1B** (`CalculateTaxInner.jsx`) — confirmed already committed at HEAD: the
  reasonable-compensation advisory box reserves layout space via `minHeight` so it can't shift
  the Advertising/Other Operating Expenses fields when it appears mid-entry. This was
  independently reproduced as still-broken on the *live production* site during this review —
  worth confirming production is actually running current `master`, since the source fix
  predates this audit.

---

## [Restored] — July 6, 2026

This file was deleted on July 5, 2026 (commit ca9817e) while source comments in
`taxCalc.js` and `constants.js` still pointed to it (audit finding F-08). Restored
from git history (`git show ca9817e^:CHANGELOG.md`) with the entries below added.
`KNOWN_LIMITATIONS.md`, also referenced from `taxCalc.js` (SE-179 block), never
existed in repo history and will be created in refactor Module M7.

---

## Consistency pass — July 9, 2026

Owner-requested sweep for code consistency across the app. Audit found ZERO
value drift (identical palette values everywhere, no stray tax math, no
console.logs) — the findings were duplication, now consolidated:

- Palette: the CC-M01 theme migration FINISHED. Nine holdout files (Terms,
  Privacy, Settings, ResourcesHub, About, Landing, BrandLogo, Nav, Aria)
  declared local N/B/SL hex constants identical to src/theme.js; all now
  import from the theme (aliased, so every usage site is untouched — zero
  visual change). Invariant: no local palette declarations remain.
- Aria's money format unified: her private formatter rendered negatives as
  "-$500" while every other surface uses fmt()'s accounting-style "($500)".
  Aria now imports fmt from utils/money.js. OWNER-VISIBLE (minor): negative
  amounts in Aria chat responses now render in parentheses like the rest of
  the app.
- ACCEPTED AS-IS, with reasons recorded: (1) the three form-relay fetch()
  sites (Settings/Landing/Onboarding) keep their bespoke best-effort
  semantics rather than rerouting a live-tested email path through apiClient;
  (2) auth-key clearing (App) and MFA device-trust storage (Onboarding) stay
  explicit rather than hidden behind indirection; (3) Settings' data-export
  iterates raw localStorage by design; (4) a handful of $-in-template-string
  formats inside engine note text read naturally and stay.
- Suite steady at 610; build and lint clean.

## Phase 4, batch 5: D-3 explicit sync + T-4 ratifications — July 8, 2026

The engagement's final two decisions, executed. Owner chose (A) Explicit sync
for save semantics and ratified all four remaining registered limitations.

- D-3 (A) — no more silent overwrite (the F13 finding): with a record loaded,
  "Save This Record" / "Save & Analyze" now open a choice dialog — Update
  "<name>", or Save as new record (with optional name) — instead of silently
  upserting in place. With no record loaded, saving is unchanged.
  `src/TaxReturn.jsx` (buildRecord gains forceNew/newName; both save handlers
  route through the dialog; doSave unifies the two paths).
- D-3 unsaved-changes guard (the F14 finding), scoped to where loss actually
  occurs: both steps persist per keystroke, so the destructive actions are
  loading a record / starting a new calculation over dirty work, and closing
  the tab. New session dirty flag (`src/utils/sessionState.js`), set by both
  steps' persist paths, cleared on save and on load; `src/Dashboard.jsx`
  confirms before loadRecord / startNewCalc / preset-start when dirty;
  `src/TaxReturn.jsx` adds a beforeunload guard.
- `src/CalculateTaxInner.jsx` — dirty wiring on the two Step-1 persist sites;
  save clears it.
- `src/TaxReturn.test.jsx` — 2 new contract tests: Save-with-active-record
  opens the dialog and does NOT call syncRecordToServer until the user
  chooses; Save-with-no-record stays direct. Suite 608 → 610.
- T-4 — all four remaining registered limitations RATIFIED by the owner in
  KNOWN_LIMITATIONS.md with exposure directions stated: SE-179, PAL-MFS,
  NOL-80 (conservative), and SALT-MAGI (the one understate-direction
  boundary, ratified with a revisit trigger recorded).

With this batch, every decision and every tracked item of the consolidated
remediation plan is either shipped or deliberately, documentedly deferred.

## Phase 4, batch 4: §179 dollar limitation modeled (T-3, owner-approved) — July 8, 2026

The last registered limitation that could UNDERSTATE tax, now closed.

- `src/taxCalc.js` — calc179Limitation() models §179(b)(1)/(b)(2): the annual
  dollar cap, reduced dollar-for-dollar by property placed in service above
  the phase-out threshold, binding BEFORE the §179(b)(3) business-income
  limit. New TAX_TABLES[year].sec179 entries, each cited: 2024 $1,220,000 /
  $3,050,000 (Rev. Proc. 2023-34); 2025 $2,500,000 / $4,000,000 (P.L. 119-21
  §70306, the OBBBA statutory reset); 2026 $2,560,000 / $4,090,000
  (Rev. Proc. 2025-32, §179(b)(6) indexing). Callers thread taxYear
  (`src/AIAnalysis.jsx`).
- `src/taxCalc-sec179.test.js` — seven hand-computed SPEC tests
  (SPEC-179D-1..7): cap bite, partial and full phase-out, dollar-vs-income
  limit interaction, both prior-year tables, and an under-cap regression
  pinning the pre-T-3 contract exactly. One test fixture was corrected during
  the build after the engine (correctly) rejected my hand-math — k1NonPassive
  arrives net of §179 by documented contract.
- `KNOWN_LIMITATIONS.md` — 179-DOLLAR flipped to RESOLVED with the accepted
  residual documented: elected total proxies placed-in-service in the
  phase-out; above the threshold the true limit can be lower than modeled.
  Suite 601 → 608.

## Phase 4, batch 3: T-2 closed + record-operation audit trail — July 8, 2026

Two ledger items closed, one of which turned out to be far bigger than its
ticket said.

- T-2 (open since the Phase-1 ledger as "a $200 briefing/Tracker delta"):
  writing the long-owed equality pin EXPOSED the real defect — on
  multi-entity records the CPA Briefing assembled its own figures from the
  legacy single-entity rec.biz shape, ignoring per-entity officer W-2
  entirely. Pin fixture: briefing said $33,662 where the engine computes
  $19,262 (a $14,400 disagreement), AND asserted "no officer W-2 compensation
  on file" against an entity carrying $60,000 — a false audit-risk claim in a
  document built to hand to a CPA. FIX: the briefing's stated federal
  position is now the ENGINE's via summarizeRecord (the fourth application of
  the R-2 cure: AIAnalysis cards → Step 1 → dashboard → briefing), with the
  local math retained solely as guard-rejection fallback; officer comp reads
  per-entity with the legacy field as fallback. `src/AIAnalysis.jsx`
  (BriefingModal exported for testability); NEW
  `src/utils/briefingPin.test.jsx` — 2 tests: engine-figure verbatim
  embedding + composition, and the false-claim regression fence. Suite
  599 → 601.
- Backend (taxstat360-api): record-operation audit trail — the observability
  gap the Jul-8 forensics drill exposed (record deletions left NO audit
  entry; a "where did my records go?" cost an hour instead of one lookup).
  Deleting a record now writes a `record.delete` row carrying the recordId
  AND record name; a 409 identity mismatch writes `identity.mismatch` (the
  D-1 signature deserves a permanent trail). NEW tests/test_records_audit.py
  (3 tests); backend suite 53 → 56.

## Phase 4 housekeeping, batch 2: the two UX-audit remainders (F7 + F16) — July 8, 2026

Unblocked by recovering the UX audit's exact backlog text from the engagement
transcript (no document hunt needed). Ships combined with batch 1.

- UX F7 remainder — `src/CalculateTaxInner.jsx`: the long inline §469
  explainer (the always-visible statutory wall in the rental status card) is
  now progressively disclosed: a one-sentence plain-English summary ("Can
  this property's losses offset your other income this year? …") with the
  full §469(c)(7)(B)/§1.469-9(g)/§469(i) walkthrough behind a native
  <details> — keyboard and screen-reader accessible for free. The
  role="alert" REP hours-test warnings are deliberately NOT collapsed:
  active compliance warnings stay visible.
- UX F16 remainder — type-scale sweep across all four app pages
  (Dashboard, CalculateTaxInner, TaxReturn, AIAnalysis), applying the
  audit's definition-of-done ("no body text below 13px") mechanically:
  every style carrying lineHeight (the body-text signature — paragraphs,
  descriptions, explainers) raised to fontSize 13 (~60 sites); every bare
  fontSize 10 raised to 11 (24 sites — the uppercase tracked micro-labels,
  which are labels, not body). Chips/badges/metadata at 11–12px are
  deliberately unchanged per the DoD's own wording.
- Suite steady at 599; build and lint clean.

## Phase 4 housekeeping, batch 1: MoneyInput consolidation (D-12/D-13) — July 8, 2026

The three MoneyInput implementations become one core plus two page adapters.

- `src/components/MoneyInput.jsx` — now the single home of the formatting/
  caret state machine (the logic that must never fork). Superset props for
  the adapters: nonNegative (typing strip + blur clamp), onError (Step 2's
  invalid-blur message), onClick, coerceEmptyBlurToZero (Step 2's
  nf('')===0 semantics: an empty field normalizes to '0' on blur).
- `src/TaxReturn.jsx` / `src/CalculateTaxInner.jsx` — the 70–90-line local
  components replaced by ~20-line adapters preserving each page's exact
  contract: base styling (9/11 vs 10/12 padding, Step 2's zIndex overlay
  guard), blur policies, and flag names (nonNegative vs allowNegative).
  −~130 lines of duplicated caret logic.
- ONE deliberate micro-unification, on the record: a lone '-' at blur now
  clears everywhere (Step 1 previously left it in place — strictly worse UX,
  pinned by no test, worth zero flags).
- Fidelity proof: the full 599-test suite — including the TaxReturn and
  Step-1 suites that drive these inputs heavily — passes unchanged; build
  and lint clean.

## Phase 3.4: mobile-check fixes (owner device pass, B1 + D1) — July 8, 2026

The owner's real-device checklist returned 11/13 PASS; the two failures are
fixed here. (C3/E1 were instruction ambiguities, not defects — both behaviors
are pinned by unit tests and A3 verified F15 on-device.)

- B1 — `src/App.jsx`: the app-wide fixed legal footer (zIndex 50) and Step 1's
  fixed action bar (zIndex 70) occupied the same bottom strip; on phones the
  wrapped disclaimer text poked out from under the bar mid-sentence. The
  AuthFooter is now route-aware: on /calculate-tax it renders in normal flow
  at the end of the document with 92px clearance (the full disclaimer scrolls
  into view above the bar); every other page keeps the fixed strip unchanged.
- D1 — `src/AIAnalysis.jsx`, two layouts that never learned about phones:
  the tool cards' fixed icon+button columns squeezed descriptions to one word
  per line (now flexWrap + a real 240px flex-basis on the text column, button
  wraps below); and the simulator's fixed 1fr/1fr panel pair forced
  min-content wider than the modal, clipping the entity panel off the left
  edge (now auto-fit minmax(260px,1fr) — panels stack under ~560px; the delta
  inputs likewise). Chips row already wrapped; it was clipped with the modal.
- Suite steady at 599; build and lint clean. NOTE: this CHANGELOG upload also
  delivers the Phase 3.3 entry, which had missed its batch.

## Phase 3.3: semantic-structure pass + F15 loss-year label — July 8, 2026

The accessibility items from the roadmap's UX backlog, scoped to the
unambiguous wins (zero visual change except the F15 wording):

- `src/App.jsx` — "Skip to main content" link: visually hidden until keyboard
  focus, first element inside the router, targets each page's landmark.
- `src/CalculateTaxInner.jsx` / `src/TaxReturn.jsx` — the content containers
  are now semantic `<main id="main-content">` elements (the Step-1 sticky
  action footer remains a sibling of main, correctly outside it).
  `src/Dashboard.jsx` already had a `<main>`; it gains the skip-link id and
  the page's missing h1 (visually hidden — the design has no on-screen title,
  but assistive tech now gets a proper outline; "My Saved Records" remains a
  correct h2).
- UX F15 — `effRateLabel(totalTax, agi)` added to `src/utils/money.js` as the
  single source of the effective-rate display wording: non-positive AGI
  renders "n/a (loss year)" — never a bare "—" or a false "0.0%" — applied at
  all three surfaces (Dashboard card cell, TaxReturn header badge, TaxReturn
  summary line). New `src/utils/money.test.js` pins it.
- DEFERRED with reasons: the "§469 explainer collapse" backlog item — the
  candidate blocks are role="alert" compliance warnings that must not
  collapse; needs the UX audit's precise target before touching. The
  type-scale item likewise awaits the audit's exact prescription. Both remain
  on the tracker.
- Suite: 598 → 599; build clean; lint at baseline (a transient +2 from dead
  imports was caught and pruned during the pass).

## Phase 3.2: top savings levers on dashboard record cards — July 8, 2026

Each saved record's card now answers "why come back?" before it is opened:
up to two engine-verified levers, ranked compliance → savings → information,
plus current-law engine figures in the summary strip.

- `src/utils/topLevers.js` (NEW) — lever detection with a hard rule inherited
  from the audits: this module computes NO tax figures. Every lever embeds a
  field the engine already emitted via summarizeRecord (Phase 2.2):
  reasonable-comp trigger (alert, ranked first — audit risk outranks money),
  realized S-Corp SE/FICA savings (worded as "is saving", per the verified
  engine semantics — the hypothetical "could save" election pitch remains
  AIAnalysis's, via its shared single-source estimator), balance due +
  §6654 quarterly plan, §1212(b) carryover banked, §469 suspended losses.
  Capped at 2 per card; never throws on malformed legacy records.
- `src/Dashboard.jsx` — the lever chips render under each card's summary
  strip (amber/green/slate by tone). F24 UPGRADE riding along: the strip's
  liability, effective rate, and quarterly figures are now the ENGINE's
  current-law numbers when the record summarizes cleanly (the same cure R-2
  applied to AIAnalysis and 3.1 applied to Step 1) — so a record saved before
  a tax fix (e.g. §1211(b)) shows the corrected figure on the card, matching
  Load & Continue; F24's approxIncome rate remains the guard-rejection
  fallback. OWNER-VISIBLE: cards for pre-fix records may show different
  (correct) numbers than before this deploy.
- `src/utils/calcSelector.js` — hardening found by the lever tests: entities
  that are not an array (malformed legacy record) now yield { ok:false }
  instead of throwing while building the engine input.
- `src/utils/topLevers.test.js` (NEW) — 6 tests: ranking (compliance first),
  engine-figure embedding verbatim, realized-not-pitch wording, §1212(b)
  carryover lever, cap, never-throws, and the summarizeRecord equality
  INVARIANT. Suite: 592 → 598; build and lint clean.

## Phase 3.1: live provisional federal estimate on Step 1 — July 8, 2026

The first Phase-3 payoff item: as a user enters entities on Step 1, the
footer now shows their provisional federal liability, live per keystroke —
computed by THE ENGINE via selectTaxSummary() (Phase 2.2), so the figure is
Step 2's figure by construction.

- `src/CalculateTaxInner.jsx` — new exported Step1EstimateBadge (house
  pattern: testable standalone like ManualEntryPanel) rendered in the footer
  next to the existing "flowing to your return" figure. Display contract:
  a blank form shows the neutral "full federal estimate in Step 2" pointer
  (empty is NOT a loss year — F15's principle applied both ways, a
  distinction the tests caught during development); a genuine loss year gets
  words ("loss year — no regular federal tax on these figures"), never a bare
  $0 or dash; otherwise "provisional federal estimate $X (Y% of AGI)" with
  aria-live="polite" for screen readers. HISTORY NOTE: this footer previously
  showed flowing income only, under a comment forbidding "a provisional tax
  number from a second code path"; that constraint dissolved when the
  selector became the engine's own code path, and the comment now records
  both the old rule and why it retired.
- `src/CalculateTaxInner.test.jsx` — 4 new tests, led by the engine-equality
  INVARIANT (badge dollar figure === selectTaxSummary().totalTax verbatim);
  plus loss-year wording, empty-form neutrality, and entities-raise-the-
  estimate. The file's EntityCompareModal mock became a partial mock
  (importOriginal) so toEngineContext stays real. Suite: 588 → 592; build
  and lint clean.

## Phase 2.5 (M8 disposition): MoneyInput decision + simulator gap — July 8, 2026

OWNER DECISION (Jul 8, on the record): live thousands-separator formatting —
commas appearing as you type — is the product standard for money fields; the
M8 cancellation is superseded by this decision, implemented as follows.

Census: Steps 1 and 2 (54 fields) already had live formatting via two
near-identical local components (the tracked D-12/D-13 duplication). The one
user-visible gap was the What-If Simulator's four delta inputs in AIAnalysis
(plain type="number", no commas). The compare modal's officer-comp control is
a slider with a formatted readout — no gap.

- `src/components/MoneyInput.jsx` (NEW) — the canonical shared component,
  based on the proven Step-1 implementation: live commas, caret preservation
  via comma-count delta + requestAnimationFrame (cursor-teleporting is the
  bug class that parked the original M8 attempt), raw-string onChange (nf()
  consumers unaffected), allowNegative flag, blur normalization,
  type="text" + inputMode="decimal".
- `src/AIAnalysis.jsx` — the four simulator delta inputs adopt MoneyInput
  (negatives remain valid: deltas model cuts as well as raises). Styling
  unchanged.
- `src/components/MoneyInput.test.jsx` (NEW) — 6 tests pinning the contract,
  including the caret regression fence (mid-number edit, caret shift equals
  comma delta) with browser-faithful rAF-after-commit ordering.
- The two legacy local copies re-point to the shared component during the
  Phase-4 D-12/D-13 housekeeping — deliberately untouched now so the 54
  working fields carry zero regression risk. Suite: 582 → 588; build and
  lint clean.

## Phase 2.4: build-toolchain upgrade — July 8, 2026

Dedicated upgrade session per the remediation plan (the 5 outstanding
npm-audit findings — 1 critical, 1 high, 3 moderate — all lived in the dev
toolchain).

- vite 5.4 → 6.4.3, vitest 2.1 → 3.2.7, jsdom 25 → 26.1.0,
  @vitejs/plugin-react 4.3.1 → 4.7.0. `npm audit`: 0 vulnerabilities.
- ZERO source or config changes required: all 582 tests, the production
  build, and lint (0 errors / 24-warning baseline) pass untouched on the new
  majors — the per-file `@vitest-environment jsdom` pragma pattern and the
  vitest.config.js shape carry over as-is.
- Files changed: package.json and package-lock.json only. Deliberately
  conservative target (vite 6 line, not 7) so the Amplify build image's Node
  requirement stays comfortably satisfied; the vite-7 hop can ride a future
  session once the build image's Node version is confirmed.

## Phase 2.2c-r1 (OBS-5 revision): alert relay sends via SES — July 7, 2026 (backend-only)

Live verification of 2.2c found two defects, both fixed the same day:
(1) web3forms rejects server-side submissions on the free plan — the Batch-6
relay spec was untestable-as-written against the vendor's actual policy; and
(2) the r0 relay surfaced that rejection as HTTP 200 {"success": false} — a
silent failure (the Landing form showed "sent" while nothing sent).

- Backend `app/main.py` — the relay now sends the email itself via SES (same
  transport and verified sender as the reset/verify emails): no third party,
  no key anywhere, destination env-overridable (ALERT_TO_EMAIL, default
  support@taxstat360.com), Reply-To = submitter, send failure = loud 502.
  Whitelist/caps/subject/5-min limit unchanged.
- `tests/test_form_relay.py` rewritten for the SES contract (Source,
  Destination, Reply-To presence/absence, cap enforcement inside the body,
  loud-502, 429). Backend suite steady at 53.
- NO frontend changes — call sites already post to the relay. KNOWN_LIMITATIONS
  OBS-5 note amended. The WEB3FORMS_ACCESS_KEY service env var is now inert;
  the web3forms account can be deactivated instead of rotated.

## Phase 2.2c (OBS-5): form-key relay — July 7, 2026 (frontend half; backend in taxstat360-api)

The web3forms access key no longer ships in the served bundle. Implemented
per the spec KNOWN_LIMITATIONS carried since Batch 6.

- Backend (taxstat360-api): POST /alerts/form-relay — server-held key,
  8-field whitelist with 4,000-char caps, subject required, client-supplied
  access_key ignored, 10s upstream timeout (the Stripe-hang lesson), 503 when
  unconfigured (owner alerts must fail LOUDLY — the D-03 signup-failure
  alerts route through here), 5/min/IP rate limit. New
  tests/test_form_relay.py: 5 tests incl. the explicit 429 pin; backend suite
  48 → 53.
- `src/utils/integrations.js` — WEB3FORMS_ACCESS_KEY removed (tombstone
  comment points at the relay and the owner follow-ups).
- `src/Landing.jsx` (contact form; res.ok semantics and the mailto fallback
  unchanged), `src/Settings.jsx` (deletion notice), `src/Onboarding.jsx`
  (both signup-failure alerts) — all post to the relay. Onboarding is the
  protected flow file: exactly 3 lines changed (1 import + the 2 alert fetch
  targets); Stripe logic untouched, diff proof in the deployment notes.
- KNOWN_LIMITATIONS.md — OBS-5 marked RESOLVED with the historical block
  preserved. Frontend suite unchanged at 582/582; build and lint clean.
- OWNER ACTIONS: set WEB3FORMS_ACCESS_KEY in the EC2 service environment
  before/with the backend deploy; rotate the key in the web3forms dashboard
  (old value is in git history and prior bundles); delete VITE_WEB3FORMS_KEY
  from the Amplify console.

## Phase 2.2b: the 409 identity guard — July 7, 2026 (frontend half; backend in taxstat360-api)

Permanent countermeasure to the D-1 incident (root-caused Jul 7: a session
identity flip mid-save mis-filed records under a different account partition —
nothing was deleted, but from the client it was indistinguishable from
sibling destruction).

- `src/utils/serverApi.js` — every records call now pins which account this
  page believes it is operating on (the same ts360_email the record buckets
  key on): X-Expected-User header on GET/DELETE, an expectedUser body field on
  PUT (including the self-heal re-PUTs). The backend compares the pin against
  the session and returns 409 on mismatch, so any future identity flip is a
  loud, harmless error the moment it happens — before a single byte lands in
  the wrong partition. Absent email ⇒ no pin (backward compatible).
- Backend counterpart (taxstat360-api `app/main.py` + new
  `tests/test_records_identity_guard.py`, 43 → 48 backend tests): the
  _check_expected_user gate on all three /records handlers; the pin is popped
  before persisting (writtenBySession/-Ip remain the write forensics).
- Frontend suite unchanged at 582/582; lint at baseline.

Together with the retained snapshot/diff self-heal, PITR, and Streams, the
July-3 failure class is now: prevented (409), attributed (Streams +
writtenBy*), and recoverable (PITR) — defense in depth on all three axes.

## Phase 2.2: the shared calculation selector — July 7, 2026

One read-only façade over the tax engine, extending the single-source
discipline from tax RULES to figure CONSUMPTION. Cures Pass-6 review finding
R-2 (AIAnalysis computed its own AGI/income by summing record fields — no
§1211(b) clamp, no PAL machinery, no adjustments — mis-gating AGI-dependent
strategy cards, worst in loss years).

- `src/utils/calcSelector.js` (NEW) — summarizeRecord(rec) and
  selectTaxSummary() (live session). Owns NO tax math and NO translation:
  reuses toEngineContext (audit F2) with entityIdx −1 for the whole-return
  aggregation, adds only the fields the compare modal doesn't carry
  (charitableContr, §1212(b) carryforwards), validates through the M2 guard
  ({ ok:false, error } instead of throwing into a card), returns a frozen
  summary. Phase-3 consumers (Step-1 footer, dashboard levers) plug in here.
- `src/AIAnalysis.jsx` — both local aggregations (totalIncome, agi) and the
  card marginal rate now prefer engine-true figures, with the old local sums
  retained solely as guard-rejection fallbacks. Loss-year example: engine AGI
  197,000 vs the retired formula's 120,000. Deliberate boundary: legacy-only
  `otherIncome` no longer inflates cards the return never modeled (OBS-1/3
  principle — display agrees with the engine).
- LATENT BUG FIX (found by the selector's invariant tests, predates Phase 2.1):
  the load path (writePersonalContext ∘ normalizeF1040) manufactured ltGain:0
  because normalize deliberately omits ltGain — and every SESSION reader
  (`ltGain ?? capitalGains`) then preferred the stored 0 over the real
  capitalGains, silently dropping LT gains from the entity-compare modal and
  What-If Simulator on freshly loaded records (TaxReturn survived via its own
  capitalGains-first seeding). Fixed at the source: `src/utils/fieldManifest.js`
  gains writeFallbacks (ltGain←capitalGains), so the stored blob is
  self-consistent; explicit ltGain still wins. Pinned in fieldManifest.test.js.
- `src/utils/calcSelector.test.js` (NEW) — 7 tests: the SIM-1-style
  engine-equality invariant, whole-return aggregation, frozen summary, the
  R-2 numeric contrast (197,000 vs 120,000), §1212(b) carryforward flow,
  session/record parity, and guard-miss typing. Suite: 574 → 582, all
  passing; lint at baseline (0 errors / 24 warnings).

## Phase 2.1 (audit V2 / Pass-6 P6-2): the shared field manifest — July 7, 2026

The persisted personal-context contract previously lived in five hand-synced
lists (writePersonalContext parameters + payload, readPersonalContext
extraction, normalizeF1040 coercion table, and the engine's YTD annualization
lists) — the bug family behind three of the last four functionality defects
(F3's three strips, A4-1). It now lives in exactly one place.

- `src/utils/fieldManifest.js` (NEW) — F1040_FIELD_MANIFEST: one descriptor per
  field carrying kind, defaults, legacy-name fallbacks, and the deliberately
  preserved quirks (divergent ytdMonth defaults; ltGain's normalize omission —
  documented, with the reason emitting it would zero loaded LT gains); plus
  buildPersonalContextPayload / extractPersonalContext / normalizeF1040Fields,
  and the A4-1/A4-2 YTD lists moved verbatim (YTD_SCALE_ENGINE_FIELDS /
  YTD_SCALE_ENTITY_FIELDS).
- `src/utils/sessionState.js` — writePersonalContext / readPersonalContext /
  normalizeF1040 are now thin delegates (−199 lines of triplicated contract);
  public API, storage shape, and every pinned behavior unchanged.
- `src/taxCalc.js` — imports the YTD lists from the manifest; local copies
  removed.
- `src/TaxReturn.jsx` — first manifest-native fields shipped end-to-end:
  §1212(b) capital-loss carryforward inputs (ST/LT, Capital Gains section,
  tooltips citing §1211(b)/§1212(b)), wired into the engine calcInput, the
  session payload, and saved records. Completes the F10/P6-1 fix's deferred
  persistence.
- `src/utils/fieldManifest.test.js` (NEW) — 14 tests GENERATED from the
  manifest: every field round-trips automatically the moment it exists;
  coercion modes, legacy migrations, quirks, engine-list membership, and the
  carryforward end-to-end are pinned. Suite: 560 → 574, all passing; lint at
  baseline (0 errors / 24 warnings).

Adding a persisted field is now: one manifest entry (+ one YTD-list string if
the engine annualizes it) — with tests that exist by construction.

## Pass-6 review follow-up R-1: §1211(b) waterfall reconciliation — July 7, 2026

Display-only follow-up to the Pass-6 1.2 engine fix, closing the one
regression that fix introduced: in a loss year, the waterfall's raw
entered-loss rows (−$80,000) no longer reconciled to the AGI the engine
computes (loss capped at −$3,000), and the §1212(b) carryover the engine now
outputs was displayed nowhere.

- `src/TaxReturn.jsx` — new "Capital Loss Limited (§1211(b))" addback row,
  mirroring the F-FUNC-06 §461(l) reconciliation pattern: shown only when the
  engine reports `capLossCarryoverTotal > 0`, valued at the carryover (exact
  while the §1212(b) carryforward inputs have no UI — Phase-2 field manifest),
  with a note stating the applicable limit (imported
  `CAP_LOSS_ORDINARY_LIMIT` / `_MFS` from constants.js per the M1 no-literals
  rule) and the carryover's character retention. Also: the "Capital Gains &
  Investment Income" section now defaults OPEN when populated with LOSSES
  (`ltGain`/`stGain`/`form4797` checks changed from `> 0` to `!== 0`) — a
  loss-year record previously loaded with its own populated section collapsed.
- `src/TaxReturn.test.jsx` — two wiring tests: the row + note render exactly
  when the engine reports a carryover, and the row is absent otherwise (the
  amounts themselves are SPEC-pinned in taxCalc-1211-capital-loss.test.js).
  Suite: 558 → 560, all passing; lint at baseline (0 errors / 24 warnings).

Computed liability was correct throughout — this batch is presentation
reconciliation only.

## Pass-6 remediation, Phase 1.2 (audit F10 / P6-1): §1211(b) capital-loss limitation — July 7, 2026

The one material tax defect confirmed by the sixth (verification) pass. Net
capital losses previously flowed into gross income unclamped — an $80,000 LTCG
loss on a $200,000 W-2 understated fedTax by $18,444, the under-quarterlies +
§6654-penalty direction for the product's investor base.

- `src/constants.js` — new statutory constants `CAP_LOSS_ORDINARY_LIMIT`
  ($3,000, IRC §1211(b)(1)) and `CAP_LOSS_ORDINARY_LIMIT_MFS` ($1,500),
  single-sourced per the M1 pattern (unindexed; not TAX_TABLES entries).
- `src/taxCalc.js` — Schedule D netting block after the gain assembly: ST/LT
  pools net internally (new engine-ready inputs `capLossCarryforwardST/LT`
  join their pool), opposite signs cross-absorb, combined net loss clamps at
  the §1211(b) limit; §1212(b) carryover retains character (ST absorbed
  first). Downstream consumers repointed: both `preRentalAGI` branches,
  `grossIncomeBeforeNOL`, NIIT's net-gain term, and every preferential-rate
  consumer (`prefIncome`, `totalPrefIncome`, `_ltcgClamped`, the calcAMT
  ltGain param) now see the netted LT figure — which also corrects the
  pre-existing over-carve of the preferential bucket in mixed
  ST-loss/LT-gain years. `eblOverallCapGainNI` deliberately unchanged (see
  KNOWN_LIMITATIONS 1211-1231-NETTING, registered with this change). New
  outputs for display surfaces: `capitalGainNetIncluded`,
  `capLossCarryoverST/LT/Total`.
- `src/taxCalc-1211-capital-loss.test.js` — 10 new SPEC tests, hand-computed
  against the Rev. Proc. 2025-32 tables: the $18,444 headline case, MFS
  $1,500, under-limit full deduction, statutory boundary, §1212(b)
  character split, mixed-year preferential correction, carryforward-input
  netting, gains-side hand-exact regression, §1411 MAGI/NIIT interaction,
  and the A4-style YTD round-trip. Suite: 548 → 558, all passing.
- UI persistence of the carryforward inputs deliberately deferred to the
  Phase-2 shared field manifest (adding a persisted field currently touches
  five hand-synced lists — see Pass-6 finding P6-2).

## Batch 7 (Decision queue: SIM-1, D-03, disclaimer, OBS-1/3/7/9) — July 7, 2026

Customer-visible batch — every change below was individually approved.

### Fixed — SIM-1: the What-If Simulator works again
- computeSimulatorScenario rebuilt on the SAME scenario→engine translation the
  Dashboard Tracker uses; deltas are increments on the P&L; C-Corp scenarios
  include the corporate layer. Invariant tests prove every scenario figure
  equals a direct engine call (whatif-simulator.test.js, 7 tests). The Batch-1
  "temporarily unavailable" notice is retired; guard-on-corrupt-data behavior
  is preserved.

### Added — D-03: payment-recovery banner
- Dashboard shows a non-dismissible "finish setting up your subscription"
  banner (CTA → /upgrade) whenever the signup-time Stripe failure flag is set;
  a successful upgrade clears it. Closes the loop on a flag that was written
  but never read — customers with failed payments were previously never
  prompted in-app.

### Added — federal-scope disclosure on the Tax Return page
- Dashboard's dismissible "Federal estimates only" banner extracted to a shared
  component and now also renders on the return page, where the liability
  figure is read. One dismissal covers both pages.

### Changed — displayed figures (each an approved owner decision)
- OBS-1: TaxReturn's K-1 displays adopt the engine rule — charitable
  (box12_13) no longer nets out of displayed K-1 totals.
- OBS-3: one net-profit rule — getEntityNetProfit delegates to the derivation
  rule when pnl data exists (comma-safe), legacy top-level fallback preserved;
  AIAnalysis no longer shows $0 for gross/expenses-only records.
- OBS-7: one reasonable-comp message everywhere — the fully hedged wording,
  now produced by calcReasonableCompCore.
- OBS-9: Upgrade adopts Landing's ×2 annual-savings figure ($298, not $300).

### Tests
- 538 → 548 (+7 simulator invariants, +3 net-profit unification).

---

## Batch 6 (Housekeeping: pricing single-source, OBS-2/OBS-8, M6b) — July 7, 2026

### Changed — pricing single-source (audit D-06, resolved)
- PLAN_PRICING in constants.js now derives every displayed price from the
  PRICE_*_MONTHLY constants (annual-effective monthly = ×10÷12 rounded; annual
  total = ×10; Landing savings = ×2). Landing (cards + comparison table),
  Onboarding (plan picker), and Upgrade all render from it. Display-freeze
  tests (planPricing.test.js) pin today's exact strings — provably
  display-identical now, and any future price change fails tests first.
- SURFACED, preserved verbatim (new OBS-9): Landing and Upgrade were already
  showing DIFFERENT "annual savings" figures ($298 vs $300 for Professional).

### Fixed — OBS-2 (integration disconnect) and OBS-8 (tooltip)
- Both disconnect paths clear the OAuth token from both stores; no stale
  credential survives a disconnect.
- Tooltips near the bottom edge no longer overflow the viewport. Two new
  position tests; the two pre-existing position tests pass unchanged.

### Changed — M6b: legacy suite labels
- All 242 tests in taxCalc.test.js and taxCalc-engine.test.js carry mechanical
  CHAR labels (the always-true floor claim). Deliberately NO mass SPEC
  promotion — SPEC asserts independent verification against the cited
  authority; promote per-test as values are re-verified.

### Documented
- OBS-5 server-relay spec in KNOWN_LIMITATIONS (needs backend access).

### Tests
- 530 → 538 (+6 pricing display-freeze, +2 tooltip edge cases).

---

## Batch 5 (Dead-code & duplication audit remediation) — July 7, 2026

Structural batch; zero customer-visible changes except one deliberate,
conservative auth tightening (below).

### Removed — dead code (audit D-04…D-09)
- Write-only connected-app label mechanism (3 sessionState accessors + 3 call
  sites; the value was never displayed anywhere).
- Dead accessors: readIsCoopPatron/writeIsCoopPatron, writeOnboardingEntityType;
  INVALID_SESSION_KEYS de-exported (internal-only).
- Dead constants: IRS_MILEAGE_RATES, CATCHUP_AGE_* ×3, FEATURE_* flags ×2,
  ANNUAL_BILLING_MONTHS. PRICE_*_MONTHLY kept but prominently flagged: they do
  NOT drive displayed prices (owner decision pending).
- 43 dead variables/imports across 11 files, including two entire dead
  functions (Dashboard buildRecs, withRetry) and a cascade of three feeders
  exposed by the sweep. Write-only React state silenced without removing
  setters (re-render behavior preserved). Lint: 65 → 24 warnings (remainder =
  pre-existing hook-dependency notices, deliberately untouched).

### Changed — duplication fixes (audit D-10, D-11)
- S-Corp reasonable-comp rule single-sourced: `calcReasonableCompCore()` in
  taxCalc.js (floor now the named constant SCORP_REASONABLE_COMP_MIN_TOTAL);
  engine alert and Dashboard scenario card both consume it — they can no
  longer drift on when the alert fires. Message wordings preserved verbatim
  per surface (their pre-existing divergence is OBS-7). 9 new tests, values
  hand-computed from the original formulas.
- Session validity single-sourced: isValidSession()/AUTH_KEYS/
  SESSION_MAX_AGE_MS moved verbatim from App.jsx to utils/sessionAuth.js.
  Onboarding's same-named-but-different local check now composes the canonical
  one (renamed hasActiveRegisteredSession). DELIBERATE TIGHTENING: the
  verify-email continue path now honors session expiry — an aged-out session
  re-authenticates instead of sliding through. Conservative direction for auth.

### Documented
- OBS-6 (MoneyInput divergence — M8 canceled by owner; canonical file
  recoverable from history), OBS-7 (reasonable-comp wording), OBS-8 (tooltip
  bottom-edge overflow, latent), test-seam annotations on 4 exports.

### Tests
- 521 → 530 (+9 reasonable-comp). All pre-existing tests pass unmodified.

---

## Batch 4 (Audit Module M7 — housekeeping) — July 6, 2026

### Changed — credentials & endpoints (audit F-09)
- web3forms access key: four hardcoded copies → single `WEB3FORMS_ACCESS_KEY`
  in integrations.js (env-overridable via VITE_WEB3FORMS_KEY). Honest scope:
  the key still ships in the client bundle — full containment needs a server
  relay (new OBS-5). Mailchimp subscribe URL likewise centralized.
- Onboarding's 4 remaining bare catches justified (all fire-and-forget:
  owner-alert emails ×2, marketing-list add, device-trust write — none may
  block a signup). The architecture-invariants bare-catch check now runs with
  ZERO exceptions.

### Removed — dead code (audit OBS-4, resolved)
- The ts360_loaded_record hydration branch and ts360_connecting_entity session
  fallback in CalculateTaxInner (readers with no writers anywhere in src/),
  plus their sessionState accessors. Live hydration paths unchanged.

### Fixed — encoding (audit F-12)
- 751 mojibake sequences repaired (Â§→§, â€"→—, …): taxCalc.js comments (746)
  and Admin.jsx (5 — four were VISIBLE admin-page strings: "Deletingâ¦" etc.).
  Verified comment/UI-string-only: zero code tokens changed; full suite green.

### Changed — dependencies
- `npm audit fix` (non-breaking only): 11 → 5 vulnerabilities; form-data (HIGH,
  CRLF injection) and ws (HIGH, memory disclosure) among those resolved.
  package-lock.json updated. Remaining 5 (incl. vitest CRITICAL, vite HIGH) are
  dev-tooling issues requiring semver-MAJOR upgrades — they do not ship in the
  customer bundle; queued as a dedicated tooling-upgrade task.

### Documented
- Aria's fmtUSD is NOT a fmt() duplicate (prose-friendly "-$500" vs accounting
  "($500)") — kept deliberately, annotated. VITE_GMAPS_KEY has no remaining
  code use and can be deleted from Amplify env vars (owner console action).

---

## Batch 3 (Audit Modules M5 + M6) — July 6, 2026

Internal-quality batch: zero customer-visible changes, zero flow files touched.

### Changed — M5: error-handling convention (audit F-10)
- New ARCHITECTURE §7: every catch must surface, log, swallow-with-justification,
  or re-throw; tax-math paths never swallow. Bare silent catches are now
  CI-forbidden via a fifth architecture-invariants check.
- 20 previously bare catch sites annotated with their justification; two upgraded
  to log (AIAnalysis live-context fallback — a silent downgrade to stale data was
  undiagnosable from support tickets; sessionState deleteRecord purge — a silently
  failed user-initiated delete). Logging additions only; no behavior changes.
- Onboarding.jsx's 4 legacy bare swallows are deferred to M7 (which edits those
  exact lines for the credential move) so hygiene batches never touch the signup
  flow; the CI check carries an explicit TODO(M7) allowance.

### Changed — M6: test hygiene (audit F-07)
- Ticket-named test files renamed by subject (history preserved in headers):
  taxCalc-c10 → taxCalc-basis-loss-limit; taxCalc-c11c12 → taxCalc-basis-waterfall;
  taxCalc-f3f5 → taxCalc-1231-lookback; taxCalc-qbi179 → taxCalc-qbi-sec179.
- All 27 tests in those files carry SPEC:/CHAR: labels in the test name, with IRC
  and Treasury Regulation citations on every SPEC (§1366(d), §704(d), §1368(b),
  Reg. §1.1368-1(e), Form 7203, §469(c)(7)(B), §1231(a)(2)/(c), §199A,
  Reg. §1.199A-3(b)).
- ARCHITECTURE §6 codifies both rules; the two 2024-era suites (taxCalc.test.js,
  taxCalc-engine.test.js — 242 tests) are grandfathered pending M6b to keep this
  diff reviewable.

### Tests
- 520 → 521 (+1 invariants check). Renames verified by vitest discovery: same
  26 files, same assertions, subject-named.

---

## Batch 2 (Audit Modules M3 + M4) — July 6, 2026

### Changed — M3: §179 + net-profit centralization (audit F-03, F-04)
- **§179(b)(3) business-income limitation** extracted VERBATIM from
  AIAnalysis.jsx into the engine: `calc179Limitation()` in `taxCalc.js`, with
  IRC citations and the F-13 charitable add-back explained at the definition.
  The §179(b)(1)/(b)(2) dollar limit remains unmodeled — ARCHITECTURE §2 no
  longer implies otherwise (see KNOWN_LIMITATIONS.md `179-DOLLAR`).
- **Flow-through k1Total rule** (`sumK1FlowThrough()` in `taxCalc.js`): the
  three verbatim reduce() copies in CalculateTaxInner (two persist paths + the
  "flowing to your return" badge) now call one function — the badge can no
  longer drift from the persisted figure.
- **P&L net-derivation rule** (`getEntityPnlNet` / `getEntityPnlNetShare` in
  `entityPredicates.js`): all 11 inline copies of
  `nf(netProfit ?? (nf(gross) − nf(expenses)))` across TaxReturn,
  CalculateTaxInner, and AIAnalysis replaced. Display sites that additionally
  subtract charitable keep that behavior verbatim (see OBS-1).
- Discovery documented, not "fixed": `getEntityNetProfit()` (stored-value rule)
  and the derivation rule are NOT interchangeable — see OBS-3 in
  KNOWN_LIMITATIONS.md. No call site changed rules in this batch.

### Changed — M4: storage contract restored (audit F-06)
- ARCHITECTURE §3 verification grep returns EMPTY for the first time: every
  sessionStorage access now goes through `sessionState.js`, and every
  integration-field storage access through new accessors in `integrations.js`
  (token dual-store semantics preserved exactly; the legacy disconnect
  inconsistency is preserved and documented as OBS-2).
- New sessionState accessors: `readStep1Entities`, `readLoadedRecordRaw` /
  `readConnectingEntityRaw` (dead fallbacks — no writers; OBS-4, removal
  queued M7), `write/read/clearNewRegistration`, `clearAllSessionState`.
- Onboarding.jsx: exactly three one-line accessor swaps + one import line.
  The Stripe subscribe block is untouched (verified by full diff).

### Added — enforcement & docs
- `src/architecture-invariants.test.js`: the ARCHITECTURE greps now run as
  tests, gating BOTH deploy paths. (It caught a missed raw call in App.jsx:51
  during its own first run.)
- `amplify.yml`: `npm run test` added to preBuild — closes the July 6 incident
  gap; Amplify can no longer deploy a build that fails the suite.
- `KNOWN_LIMITATIONS.md` created (referenced from taxCalc.js but never
  committed): SE-179, 179-DOLLAR, PAL-MFS, NOL-80, SALT-MAGI limitations and
  OBS-1…OBS-4 owner decisions.

### Tests
- 500 → 520 (+20): §179 characterization suite hand-computed from the original
  inline formulas (`taxCalc-sec179.test.js`, 16) + 4 CI-enforced architecture
  invariants. Zero pre-existing tests modified; lint 0 errors, warning count
  unchanged from pre-batch baseline.

---

## Batch 1 Hotfix — July 6, 2026 (evening)

### Fixed
- **Path mix-up in Batch 1 deployment** — the updated calculation guard was
  uploaded to `src/calcGuard.js` instead of `src/utils/calcGuard.js`, so every
  call site resolved the OLD guard, which rejects the engine's `status` field.
  Effect on the Amplify-hosted site (deployments ~1303–1308, roughly 4:05 PM to
  8:40 PM): the Step 2 calculator, Dashboard Tax Tracker, and Compare Entity
  Types modal showed "couldn't calculate" error banners instead of figures.
  Login, signup, Stripe subscription, and onboarding were unaffected throughout
  (the tax engine is not in those paths), and no user was shown incorrect tax
  amounts — the new error-banner design failed honest rather than wrong.
  Fix: guard files moved to `src/utils/`, strays deleted (commits 3f04298,
  c61340e, c7f4b1b → Amplify deployment 1309). Verified post-fix: 500/500 tests.

### Process note
- Amplify builds every master push without running the test suite; the broken
  states auto-deployed even though `npm run test` fails on them (the GitHub
  Actions S3 path correctly blocks on tests). Planned follow-up: add
  `npm run test` to `amplify.yml` preBuild so both deploy paths share the gate.

---

## Batch 1 (Audit Modules M1 + M2) — July 6, 2026

### Changed — M1: tax-constant unification (audit F-01, F-02, F-15)
- **§469(i) $25,000 active-participation allowance** now has a single
  implementation: `calc469iAllowance()` in `taxCalc.js`, consumed by both engine
  PAL branches (single-pool and per-property) and the AIAnalysis "$25,000
  Rental-Loss Allowance" strategy card. Previously three divergent copies.
- **NOL 80% cap (IRC §172(a)(2))** — engine literal `0.80` replaced by the
  previously dead `NOL_CARRYFORWARD_CAP_RATE` constant.
- `PAL_*` constants in `constants.js` are now live values; `PAL_PHASE_OUT_END`
  consistency is asserted in `taxCalc-pal.test.js`. `LTCG_RATE_LOW` annotated as
  documentation-only (0% tier is implicit in `calcPreferentialTax`).
- **Intentional display correction:** the strategy card previously ignored
  filing status and could show MFS filers an allowance the engine computes as $0
  (§469(i)(5)(B)); the card now matches the filed return and is suppressed for
  MFS. All other statuses numerically identical. Filed-return math unchanged —
  all 474 pre-existing tests pass unmodified.

### Changed — M2: calculation guard wired (audit F-05; ARCHITECTURE §5)
- `validateCalcInputs()` now precedes every `calcTaxReturn()` /
  `resolveQbiDeduction()` call: TaxReturn, Dashboard (both paths),
  scenarioCompare, and inside the two `aiAnalysisTaxMath.js` entry points.
- Guard accepts engine vocabulary (`status`) alongside `filingStatus`, and
  rejects any top-level NaN/Infinity numeric field.
- TaxReturn's bare `catch { return null }` removed: invalid inputs show a
  visible error banner; unexpected errors re-throw to the ErrorBoundary.
- Fresh-user regression tests freeze the post-signup default input shapes as
  guard-passing, permanently protecting the onboarding → first-render path.

### Surfaced (not yet fixed) — defect SIM-1
- The What-If Simulator has been passing the engine a packed object it cannot
  read; every preset computed "$0 savings" and detail rows rendered NaN. The
  guard now rejects that call shape and the modal shows an honest
  "temporarily unavailable" notice. Functional repair is a separate,
  test-anchored batch because it changes customer-visible dollar figures.

### Tests
- 474 → 500 (+26): SPEC-labeled §469(i)/§172 anchors (`taxCalc-pal.test.js`),
  guard alias/NaN coverage, SIM-1 rejection, fresh-user path protection.

---

## [Unreleased] — Post-Deploy Verification Fixes, July 2026

Found during the formal post-deploy verification of the July 2026 audit fixes.

### Fixed
- **F2 (second root cause)** `src/EntityCompareModal.jsx` — COMPARE-PC fixed the
  lazy-getter personalContext, but the modal still fed the engine the SESSION
  vocabulary (filingStatus/w2Income/interest…) where calcTaxReturn expects the
  ENGINE vocabulary (status/w2/intInc…), so every scenario totalTax was null →
  rendered "$0". New toEngineContext() translator mirrors TaxReturn.jsx's
  authoritative calcInput mapping (incl. other-entity officer W-2, Box 17K, and
  YTD annualization). Regression tests: src/EntityCompareModal.context.test.js
- **F3 (residual, load path)** `src/utils/sessionState.js` — normalizeF1040's
  whitelist dropped ytdMode/ytdMonth (and stGain, unrecap1250, collectiblesGain,
  nonrecap1231, isActiveParticipant, rentalAggregationElection, prior-year and
  suspended-loss fields, itemized detail fields) on record rehydration, so a
  saved YTD projection reverted to full-year on reload even though the server
  record carried the fields. Whitelist extended; regression tests:
  src/utils/normalizeF1040.audit.test.js
- **DATA-LOSS (new verification finding — Blocker), REVISED** `src/utils/serverApi.js` —
  a live probe established the backend PUT /records is a keyed per-id upsert
  that REJECTS arrays ("Record must be a JSON object") and preserves siblings.
  The earlier merged-array revision was therefore wrong and is reverted. The
  real incident — all sibling records lost server-side coincident with a save —
  remains unexplained from the client and is suspected backend-side (REVIEW THE
  /records LAMBDA). Seatbelt shipped: upsertRecordOnServer snapshots the server
  list before the single-object PUT, re-fetches after, and self-heals by
  re-PUTting any sibling that disappeared, with loud console.error logging.

---

## [Unreleased] — Functionality Audit Fixes, July 2026

Fixes from the July 3, 2026 live functionality audit (findings F5–F16; numbering
follows the audit report). Findings F1–F4, F7, and F15 from that audit were
already fixed in this repo but absent from the deployed build — deploying this
revision resolves them with no further code change.

### Fixed
- **F5 / F6 / FLOW** (owner decision) `src/Onboarding.jsx`,
  `src/components/WelcomeTourScreen.jsx`, `src/App.jsx` — the post-signup setup
  funnel (EntityScreen → BusinessScreen → ImportScreen) is removed entirely.
  After the welcome tour, users land on the Dashboard and either load a saved
  record card or start a new calculation; entity types (all five, incl.
  C Corporation per F12) and the accounting connectors live in the Tax Tracker.
  Old /onboarding/entity|business|import URLs redirect to /dashboard.
  Business name / EIN / address are no longer collected at onboarding, which
  moots the F5 edit-surface question and the F6 input-validation fix; the
  first-run Tracker banner flag now sets on tour completion for new signups
- **F6** `src/AIAnalysis.jsx` — `getOnboardingBizInfo()` sanitizes the stored
  EIN at the single read point so legacy malformed values never print on the
  CPA Briefing / Export cover
- **F8** `src/TaxReturn.jsx` — Qualifying Dependents clamped to 0–20 on typed
  input (min/max attributes only constrained the spinner; typed "10000"
  generated an unbounded CTC that silently zeroed the liability)
- **F9** `src/CalculateTaxInner.jsx` — local `MoneyInput` gains `allowNegative`
  (default true); all six P&L-modal fields (gross receipts/rents, operating
  expenses, depreciation, officer compensation, advertising, other) opt out.
  K-1 Box 1 direct entry keeps negatives — losses are legitimate there
- **F11** `src/TaxReturn.jsx` — waterfall terminal row no longer renders
  "Estimated Refund −$X"; magnitude is always positive, label + accent carry
  the direction
- **F12** `src/CalculateTaxInner.jsx` — C Corporation added to the Add Entity
  picker (was only reachable via the entity card's type dropdown)
- **F16** `src/Aria.jsx` — `renderAriaText()` converts `**bold**` spans to
  `<strong>` via React elements (no `dangerouslySetInnerHTML`)

### Deferred (owner decision required — see audit report)
- **F10** capital-loss §1211(b) $3,000 limit + carryforward — tax-engine rule
  change; belongs to the tax-accuracy pass
- **F13** save semantics (snapshot vs. overwrite of the active record)
- **F14** unsaved-changes prompt on in-app navigation

---

## [Unreleased] — Audit Sprint, June 2026

### Added
- `ARCHITECTURE.md` — authoritative structural invariants document (audit F-04/F-07)
- `CHANGELOG.md` — this file; replaces in-file change logs going forward (audit F-07)
- `src/utils/integrations.js` — `integrationKey()` extracted from `constants.js` (audit F-09)
- `src/utils/calcGuard.js` — `validateCalcInputs()` and `CalcInputError` (audit F-06)
- `src/utils/calcGuard.test.js` — unit tests for calc input guard (audit F-06)
- Round-trip tests added to `src/utils/sessionState.test.js` (audit F-05)

### Fixed
- **F-01** `src/aiAnalysisTaxMath.test-helpers.js` — stale path comment corrected;
  TEST INFRASTRUCTURE ONLY banner added
- **F-05** `src/utils/sessionState.js` — migration-completeness note added;
  direct `sessionStorage` call grep verified clean
- **F-06** `src/AIAnalysis.jsx`, `src/TaxReturn.jsx` — `validateCalcInputs()` guard
  wired before every `calcTaxReturn()` / `resolveQbiDeduction()` call site;
  `CalcInputError` surfaces visible error state in UI
- **F-06** `src/components/ErrorBoundary.jsx` — catches `CalcInputError` with
  user-friendly "return to Step 1" message
- **F-07** `src/taxCalc.js` — JSDoc IRC / Treasury Regulation citations added above
  `calcQBI`, `calcAMT`, `calcFederalTax`, `calcPreferentialTax`, `calcNIIT`,
  `calcFICAOnWages`, `getStdDed`
- **F-07** `src/aiAnalysisTaxMath.js` — JSDoc citations added above
  `resolveQbiDeduction`, `taxableIncomeBeforeQBI`, `niitApplies`,
  `additionalMedicareApplies`
- **F-08** `src/AIAnalysis-qbi.characterization.test.js` — CHAR / SPEC annotations
  added to all test cases; highest-risk §199A threshold case hand-verified
- **F-09** `src/constants.js` — `integrationKey()` removed; pointer comment added
- **F-10** `src/utils/migrateLegacyKeys.js` — 90-day decommission lifecycle note
  added; removal criteria documented
- **F-10** `src/main.jsx` — lifecycle comment expanded above `migrateLegacyKeys()` call

### Deferred (separate PRs)
- **F-02** `CalculateTaxInner.jsx` extraction → `CalculateTaxInner.logic.js`
- **F-03** `AIAnalysis.jsx` logic layer → `AIAnalysis.logic.js`
- **F-08** Full spec-test conversion (after F-03 complete)

---

## Prior History

For changes before this changelog, see the `// — Change log` and
`// — AUDIT REPORT FIXES` comment blocks inside:
- `src/TaxReturn.jsx` (lines 7–35)
- `src/CalculateTaxInner.jsx` (lines 6–35)
- Git commit history: `git log --oneline src/`
