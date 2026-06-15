# Changelog — TaxStat360 tax engine

Historical fix log for `src/taxCalc.js`, moved out of the source header (audit F9) so the
file's top comment documents current behavior and the export map only. Newest entries first.
Going forward, record engine changes here (and in commit messages), not in source comments.

## Pre-existing engine fixes (migrated from the taxCalc.js header)

──────────────────────────────
calcQBI / calcTaxReturn now accept an OPTIONAL `strictWageCap` flag (default
false). When true, a business with no W-2 wages and no UBIA above the §199A
threshold is capped to $0 (the real §199A(b)(2) wage/UBIA limit) instead of the
existing "no wage data entered → full 20%" convenience default. ONLY the entity-
structure comparison (CalculateTaxInner.jsx → CompareModal) sets this flag;
TaxReturn.jsx and AIAnalysis.jsx never pass it, so filed-return results are
unchanged. IRC §199A(b)(2).

──────────────────────────────────────────────────
F6 ENGINE FIX (§469 rental treatment — §1.469-9(g) aggregation election):
  All rentals default to PASSIVE (§469(a)); a net loss is limited to the §469(i)
  $25k active-participation allowance and otherwise suspended. A real estate
  professional (§469(c)(7)) makes the whole rental portfolio NONPASSIVE by
  AFFIRMATIVELY making the §1.469-9(g) aggregation election (rentalAggregationElection
  === true) — i.e. aggregating participation/hours across all properties so the
  combined activity meets material participation. REP status ALONE is not enough and
  is never assumed (DECISION 2): a REP without the election keeps passive treatment,
  so a returning REP may see losses suspended until they elect (surfaced by a one-time
  migration prompt in TaxReturn.jsx). perPropertyRegimeActive routes any REP through
  the election-governed branch so the election actually controls the result rather
  than falling to the legacy "REP ⇒ all nonpassive" path. The engine still honors an
  explicit per-entity materiallyParticipates flag or step2RentalMaterialParticipation
  if a caller supplies one (forward-compatible), but the UI exposes a single control:
  the aggregation election. Non-REP callers with no flags keep the prior legacy path.
  New return fields: rentalAggregationElectionApplied, rentalNonpassiveNet,
  rentalPassiveNet. IRC §469(a),(c)(2),(c)(7),(h),(i) · Treas. Reg. §1.469-9(g).

F5 ENGINE FIX (reasonable-comp advisory framing — Treas. Reg. §1.162-7):
  reasonableCompAlert.message reframed as an informational flag rather than a
  determination. It now leads with that framing, cites §1.162-7 (the value-of-
  services standard that actually governs reasonable compensation), and demotes the
  35–45% salary-to-total band to a rough, non-binding benchmark ("not a fixed ratio
  or a legal threshold"). Trigger logic and the {triggered, ratio, message} contract
  are unchanged; the message still contains the salary amount, "35–45%", and the
  Watson v. Commissioner citation that AIAnalysis.jsx and the test suite rely on.

TAX-10 FIX (seEarningsSubject formula):
seEarningsSubject was computed as seNetIncome * (1 - FICA_SS_RATE - FICA_MEDICARE_RATE).
This produces 0.9235 coincidentally (0.062 + 0.0145 = 0.0765; 1 - 0.0765 = 0.9235)
but is semantically wrong — the 92.35% factor is the statutory IRC §1402(a)(12)
net earnings factor, not derived from FICA rates. If FICA rates ever change
(e.g. temporary payroll tax relief legislation), this formula would silently produce
an incorrect result. SE_NET_EARNINGS_FACTOR = 0.9235 already exists in constants.js
and is already used correctly in ficaSavings. Now used here too for consistency.

TAX-08 / F-07 FIX (quarterlyRecommended safe harbor floor):
quarterlyRecommended was computed as balance / 4 before the safe harbor figures
were calculated. This could show a lower quarterly amount than the IRC §6654 safe
harbor requires, leading users to underpay and incur penalties. Fix: moved
quarterlyRecommended to after the safe harbor calculations and uses
Math.max(balance/4, safeHarborQuarterly) so it never falls below the safe harbor.

F-M02 (0% ownership falsy bug):
All instances of (parseFloat(e.own) || 100) / 100 replaced with ownPct(e.own) / 100.

F-M03 (retirement plan limits in TAX_TABLES):
TAX_TABLES[year] now includes a retirement object with year-specific dollar limits.

F-04 (§469 prior passive loss carryforward):
calcTaxReturn now accepts priorPassiveLossCarryforward (Form 8582, Line 3).

F-C02 (QBI aggregation disclosure):
calcQBI now accepts opts.hasMultiEntityTypes and returns aggregationApplied /
aggregationDisclosure.

F-C05 (stale AI Analysis data):
calcTaxReturn return object now includes calculatedAt (Date.now()).

F-H03 (income display split — Schedule C vs Schedule E):
calcTaxReturn return now includes scheduleEK1Income, scheduleCSEIncome,
entityIncomeBreakdown.

AUDIT FIX (fix/tax-engine-accuracy):
TAX-01: reasonableCompAlert added to calcTaxReturn return.
TAX-04: niit return format changed to { applies, amount, explanation } object.
TAX-06: federalOnly: true added to return.

PASS4B-01 (AMT 2026 MFS bracket typo): 'mhs' → 'mfs' fixed.
PASS4B-02 (§1366(d) / §704(d) shareholder basis limitation): implemented.
EBL-FIX (§461(l) non-REP passive exclusion): eblBiz excludes non-REP rental.
T-01 FIX (ficaSavings 92.35% SE tax factor): seEarningsOnDist uses SE_NET_EARNINGS_FACTOR.
T-06 FIX (mileageRate added to TAX_TABLES).

MED-FLOOR (IRC §213(a) medical 7.5%-of-AGI floor):
calcTaxReturn now accepts an OPTIONAL `medicalExpenses` input (raw, pre-floor).
When provided, only the portion above 7.5% of AGI (figured before the itemized
deduction) is added to the itemized total; the result object exposes
`deductibleMedical` so the UI can display the floored amount. When omitted, the
itemized total is unchanged, so all existing callers and tests are unaffected.

PASS4B-02b-fix (§1368 income-entity distribution gap): stockBasis/debtBasis spread
into the non-limiting push so the §1368 loop resolves basis for income entities.

PASS4B-02b (§1368(b)(2) S-Corp distribution capital gain): excess distributions
over remaining stock basis are long-term capital gain, threaded via _ltGain.

#11 FIX (§461(l)(3)(B) capital-gain inclusion limit): business capital gains in the
EBL base capped at lesser of business CGNI or overall CGNI.

#12 FIX (§199A rental QBI for REP): REP rentals contribute full net (income AND
loss) to the QBI base.

AMT-FIX (§56(b)(1)(E) / §199A(f)(2)): QBI deduction is NOT added back for AMT; the
standard deduction IS added back for non-itemizers.

F-05 ENGINE FIX (§199A(c)(2) per-entity QBI loss carryforward): per-entity
qbiLossCarryforward subtracted before aggregation.

F-01 ENGINE FIX (§1366(d)(2) prior-year suspended loss carryforward): released
prior-year suspended loss added to adjustedK1Total.

YTD-FIX (year-to-date annualization consistency): _annualizeIfYTD() scales every
income/expense flow once, up front, then resets ytdFactor to 1.
