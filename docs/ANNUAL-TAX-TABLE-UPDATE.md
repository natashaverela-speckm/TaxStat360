# Annual tax-table update

Every year-specific figure the engine uses lives in `TAX_TABLES` in
`src/lib/taxCalc.js`, keyed by tax year, with a `verifiedBy` line naming the IRS
and SSA releases the figures were transcribed from. `CURRENT_TAX_YEAR` is the last
entry of `SUPPORTED_TAX_YEARS` in `src/lib/constants.js`, so adding a year block
and appending the year to that list flips the whole app.

## Calendar

| When | Release | Figures |
|---|---|---|
| mid-May | Rev. Proc. (HSA inflation adjustments) | `hsa.selfOnly`, `hsa.family` |
| mid-October | SSA press release | `ssWageBase` |
| late October | Rev. Proc. (annual inflation adjustments, §1(f)) | `std`, `addlStdAged`, `brackets`, `ltcg`, `sec179`, `ebl`, `saltCap`, `qbi` thresholds, `amt`, `ctc` if indexed |
| early November | IRS Notice (retirement plan limits) | `retirement.*` |
| any time | enacted legislation | rules, not just numbers (see below) |

## Steps

1. Copy the latest year block in `TAX_TABLES` to the new year and replace every
   figure from the releases above. Update `verifiedBy` to name them.
2. Do the same for `AMT_TABLES` and the year-keyed thresholds that follow
   `TAX_TABLES` (QBI phase-in, EBL, SALT) if they are not derived.
3. Append the year to `SUPPORTED_TAX_YEARS`.
4. `npm run test`. `taxTables-completeness.test.js` fails on any missing figure or a
   missing/stale `verifiedBy`; `taxTables-ui-binding.test.js` fails if a screen
   hardcodes a number. Fix until green.
5. Open a PR titled `Tax tables: <year>` with the release citations in the body.

## Law changes

Inflation releases change numbers. Legislation changes rules. After any enacted
federal tax law touching §§ 1, 24, 63, 168(k), 179, 199A, 461(l), 469, 1202 or
1368, review:

- the engine rules in `src/lib/taxCalc.js` (bonus-depreciation dates, §179 cap
  resets, CTC amount, QBI mechanics, EBL thresholds, SALT cap and phase-down)
- the memo's law citations and conditions in `src/lib/priorYearReview.js`
  (`SECTIONS`, every `finding(...)` `basis` and `conditions`)
- the opportunity cards in `src/lib/opportunities.js`
- the year label shown on the Advanced return page (`TaxReturn.jsx`)

A scheduled task checks quarterly for enacted legislation and opens an issue
listing what to review; it changes nothing on its own.
