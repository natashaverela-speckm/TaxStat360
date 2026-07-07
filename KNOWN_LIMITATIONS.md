# TaxStat360 — Known Limitations & Owner Decisions

This file is referenced from source comments (e.g. the SE-179 block in
`src/taxCalc.js`) and was missing from the repository (audit F-08 — it was
never committed; the CHANGELOG.md sibling was deleted Jul 5 and has been
restored from git history). Reconstructed July 6, 2026 as part of audit
Batch 2 (M3 + M4).

Two kinds of entries live here:

- **LIMITATION** — a deliberate modeling simplification in the tax engine.
  Do not "fix" one casually: each has tax consequences and an explicit
  rationale. Changing one requires the owner's sign-off, SPEC tests, and a
  CHANGELOG entry.
- **OBS (observation)** — a pre-existing internal inconsistency preserved
  verbatim during structural refactors, awaiting an owner decision because
  reconciling it changes user-visible behavior.

---

## LIMITATION SE-179 — SE tax computed on pre-§179 pass-through income

`calcTaxReturn()` does not net separately-stated §179 (box11_12) out of
SE-subject pass-through income (Sole Proprietor / active Partnership), so SE
tax is OVERSTATED for a filer whose K-1 separately states §179 — most relevant
to an active partner with Box 12 §179. Deliberately left as-is rather than
mirroring the nonSEk1 QBI-179 fix, because netting §179 here changes SE TAX
(what the taxpayer owes) and a correct fix must simultaneously: (a) not reduce
SE earnings where the law does not; (b) respect the §179(b)(3) business-income
limitation; and (c) treat a sole proprietor (§179 already inside Schedule C
net profit — box11_12 should be blank) differently from a partnership (§179
separately stated). See the inline block in `src/taxCalc.js` (search "SE-179").

## LIMITATION 179-DOLLAR — §179(b)(1)/(b)(2) dollar limit not modeled

`calc179Limitation()` in `src/taxCalc.js` implements ONLY the §179(b)(3)
business-income limitation (with the §179(b)(3)(B) carryover). The annual
dollar limitation and the investment (phase-out) limitation are NOT modeled;
a user entering §179 above the statutory dollar cap will not see it limited.
ARCHITECTURE.md §2 previously implied §179 dollar limits lived in
`TAX_TABLES[year]`; that table entry does not exist, and the doc now points
here instead (audit F-03 reconciliation). Adding the dollar limit is a tax-
behavior change: it needs `TAX_TABLES[year].sec179` entries transcribed from
the Rev. Proc., SPEC tests, and owner sign-off.

## LIMITATION PAL-MFS — §469(i)(5) half-allowance for spouses living apart

`calc469iAllowance()` models MFS as $0 allowance at every MAGI level. The
statute grants a $12,500 half-allowance to an MFS filer who lived apart from
their spouse the entire year (§469(i)(5)(A)(ii)/(B)); the app does not collect
a lived-apart-all-year fact, so the conservative $0 default applies. This
matches the engine's behavior since before the M1 centralization.

## LIMITATION NOL-80 — 80% cap applied to all NOL carryforwards

The §172(a)(2) 80%-of-taxable-income cap is applied to ALL entered NOL
carryforwards as a conservative planning default. A confirmed pre-2018 NOL is
not subject to the cap; such a filer's actual deductible amount may be
slightly higher than shown. (See `NOL_CARRYFORWARD_CAP_RATE` in constants.js.)

## LIMITATION SALT-MAGI — §164(b)(7) MAGI addbacks not modeled

The OBBBA SALT phase-down uses MAGI = AGI; the §911/931/933 exclusion
addbacks are not modeled (see `getSaltCap()` in taxCalc.js).

---

## OBS-1 — TaxReturn K-1 display subtracts charitable; the engine does not

The engine k1Total rule (`sumK1FlowThrough`) nets only separately-stated §179
(box11_12) out of K-1 ordinary income — charitable (box12_13) is a Schedule A
item and is NOT netted (audit F-13). But four DISPLAY sites in TaxReturn.jsx
(per-entity K-1 rows, the "Total K-1" line, per-rental rows, and
step1RentalNetUI) also subtract box12_13, so the displayed K-1 total can
differ from the engine's k1Total when charitable is present. Preserved
verbatim through the M3 refactor. Owner decision: either the display adopts
the engine rule (recommended for consistency) or the divergence is labeled
in the UI.

## OBS-2 — Two disconnect paths clear the integration token differently

One disconnect path clears both the localStorage and sessionStorage token
copies; a second (legacy) path clears only localStorage, leaving a session
copy that keeps a stale token usable within the current tab. Preserved
verbatim through the M4 refactor (see `src/utils/integrations.js` header).
Owner decision: unify on clearing both (recommended — a disconnected
integration should not retain a live token anywhere).

## OBS-3 — Two net-profit rules coexist

`getEntityNetProfit()` reads a stored value (pnl.netProfit, legacy
e.netProfit fallback; parseFloat) and never derives from gross/expenses.
`getEntityPnlNet()` (M3) uses the stored value else DERIVES grossRevenue −
totalExpenses (comma-safe nf). For a record whose pnl has gross/expenses but
no stored netProfit, surfaces using the former show $0 while surfaces using
the latter show the derived figure. Both rules pre-date the refactor; M3 only
removed the 11 duplicated copies of the second. Owner decision: unify on the
derivation rule (recommended) — this changes displayed figures on the
AIAnalysis surfaces that use `getEntityNetProfit()` for records lacking a
stored net.

## OBS-4 — Dead session-key fallbacks (readers with no writers)

`ts360_loaded_record` and `ts360_connecting_entity` are read in
CalculateTaxInner via sessionState accessors, but nothing in src/ writes
either key — the writing flows were removed in earlier refactors. The reads
are inert fallbacks preserved for safety; removal is queued as audit
module M7.

## Defect SIM-1 — What-If Simulator awaiting functional repair

The simulator's engine calls pass a packed object the engine cannot read;
since Batch 1 the modal shows an honest "temporarily unavailable" notice
instead of NaN rows / "$0 savings". The repair (rebuilding the scenario math
on engine vocabulary, test-anchored) is a separate approved batch because it
changes customer-visible dollar figures.
