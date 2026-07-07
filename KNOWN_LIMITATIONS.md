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

## LIMITATION 1211-1231-NETTING — capital losses do not net against §1231/f4797 gains

Added Jul 7, 2026 with the §1211(b) capital-loss limitation fix (audit F10 /
Pass-6 P6-1). The engine now nets short- and long-term capital pools per
Schedule D (including §1368 excess-distribution gains, which fold into the
LT/ST pools) and clamps the net loss at $3,000/$1,500-MFS with §1212(b)
character-retaining carryover. What it does NOT do: net capital losses against
modeled §1231/f4797 gains, which Schedule D line 11 would permit — the model
keeps §4797 gains in their own channel (the §1231(c) lookback and EBL offset
depend on it). Consequence when both exist in one year: the §1231 gain is
taxed in full while the capital loss is limited — the tool OVERSTATES tax,
never understates. Conservative by design. Fixing it requires routing net
§1231 gain through the Schedule D netting block, re-deriving the lookback
interaction, and SPEC tests; owner sign-off required.

Related engine note: the §461(l) business-gain offset (`eblOverallCapGainNI`)
deliberately consumes the RAW (pre-§1211) figures — it models gross
business-attributable gains, not the Schedule D result.

## LIMITATION SALT-MAGI — §164(b)(7) MAGI addbacks not modeled

The OBBBA SALT phase-down uses MAGI = AGI; the §911/931/933 exclusion
addbacks are not modeled (see `getSaltCap()` in taxCalc.js).

---

## OBS-1 — K-1 display vs engine — RESOLVED (Batch 7, Jul 2026)

All four TaxReturn display sites now use the engine k1Total rule (F-13):
charitable (box12_13) no longer nets out of displayed K-1 figures, so the
visible totals match what actually flows to the return. Displayed K-1 totals
change for records carrying separately-stated charitable.

## [historical] OBS-1 — TaxReturn K-1 display subtracts charitable; the engine does not

The engine k1Total rule (`sumK1FlowThrough`) nets only separately-stated §179
(box11_12) out of K-1 ordinary income — charitable (box12_13) is a Schedule A
item and is NOT netted (audit F-13). But four DISPLAY sites in TaxReturn.jsx
(per-entity K-1 rows, the "Total K-1" line, per-rental rows, and
step1RentalNetUI) also subtract box12_13, so the displayed K-1 total can
differ from the engine's k1Total when charitable is present. Preserved
verbatim through the M3 refactor. Owner decision: either the display adopts
the engine rule (recommended for consistency) or the divergence is labeled
in the UI.

## OBS-2 — Disconnect token inconsistency — RESOLVED (Batch 6, Jul 2026)

Both disconnect paths now clear the token from BOTH stores — a disconnected
accounting integration (QuickBooks/Xero/Wave/FreshBooks) retains no live
credential anywhere. The only observable change: a stale token can no longer
be silently reused within the same tab after a disconnect.

## OBS-3 — Two net-profit rules — RESOLVED (Batch 7, Jul 2026)

getEntityNetProfit() now delegates to the derivation rule whenever any pnl
data exists (comma-safe), falling back to the legacy top-level field only for
pre-pnl records. The AIAnalysis surfaces that previously showed $0 for
gross/expenses-only records now show the derived figure.

## [historical] OBS-3 — Two net-profit rules coexist

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

## OBS-4 — Dead session-key fallbacks — RESOLVED (M7, Jul 2026)

`ts360_loaded_record` and `ts360_connecting_entity` were read in
CalculateTaxInner but written nowhere in src/. The dead reads and their
accessors were removed in Batch 4 (M7); the live hydration paths (C-04
canonical Step-1 state; OAuth ?entity= URL param) are unchanged.

## OBS-5 — web3forms key ships in the client bundle

The owner-alert/contact-form key now has a single home
(`WEB3FORMS_ACCESS_KEY` in integrations.js, env-overridable via
VITE_WEB3FORMS_KEY) — but as a client-side app, whatever key is built ships
in the served JS bundle and is extractable. Consequence: a third party could
send submissions through the form endpoint (spam risk, not data risk — the
key only submits, it cannot read). Full fix requires a small server-side
relay (e.g. a Lambda that holds the key). Owner decision; low urgency.
Implementation spec (Batch 6): add `POST /alerts/form-relay` to the existing
API — accepts `{subject, email, plan, billing, status, detail}`, attaches the
web3forms key server-side, forwards to api.web3forms.com, CORS-restricted to
taxstat360.com, rate-limited (e.g. 5/min/IP). The frontend then calls the
relay and the key leaves the bundle entirely. Requires backend deployment
access — outside this repo.

## OBS-6 — Two divergent MoneyInput implementations (M8 canceled by owner)

The canonical `src/components/MoneyInput.jsx` migration target was deleted by
owner decision (Jul 2026), canceling audit module M8. Consequence, now
permanent status quo: the calculator (CalculateTaxInner.jsx ~62) and the
tax-return page (TaxReturn.jsx ~32) each render money fields with their OWN
implementation — differing in negative-number handling, comma live-formatting,
and error-prop support — so dollar-entry behavior can differ subtly between
the two screens. The deleted canonical file is recoverable from git history
(commit 4697de0^) if unification is ever revisited.

## OBS-7 — Reasonable-comp wording — RESOLVED (Batch 7, Jul 2026)

One message everywhere: the fully hedged wording now lives in
calcReasonableCompCore and both surfaces render it. The Dashboard card's
shorter recommendation-flavored variant is retired.

## [historical] OBS-7 — Reasonable-comp alert: one rule, two message wordings

D-10 single-sourced the NUMERIC rule (calcReasonableCompCore), so the return
page and the Dashboard scenario card can no longer disagree on WHEN the alert
fires. Their message texts remain different by preserved design: the engine's
is fully hedged ("informational flag, not a determination…"); the Dashboard
card's is shorter and reads closer to a recommendation. For an IRS
reclassification-risk warning, the engine's wording is the more defensible.
Owner decision: adopt one wording (recommend the engine's) or keep both.

## OBS-8 — Tooltip bottom-edge overflow — RESOLVED (Batch 6, Jul 2026)

The above/below flip now considers both edges: above when it fits (unchanged),
else below when that fits (unchanged), else the side with more room. Covered
by two new position tests.

## OBS-9 — Annual-savings figures — RESOLVED (Batch 7, Jul 2026)

Unified on Landing's ×2 formula (matches the "Save 2 months" badge): the
Upgrade page now shows $158/$298/$598 instead of $156/$300/$600.

## [historical] OBS-9 — Two different "annual savings" figures were already live

Landing advertises savings of monthly×2 (two free months: $158/$298/$598);
the Upgrade page computes (monthly−annualMonthly)×12 ($156/$300/$600 — a
rounding artifact of the ÷12 display price). Both pre-date the D-06 pricing
single-source and are preserved verbatim (and pinned by planPricing.test.js).
Owner decision: unify on one formula — Landing's ×2 matches the "Save 2
months" badge copy and is the cleaner marketing claim.

## Defect SIM-1 — What-If Simulator — RESOLVED (Batch 7, Jul 2026)

Repaired on the same scenario→engine translation the Dashboard Tracker uses.
Test-anchored invariant (whatif-simulator.test.js): every scenario figure
equals a direct calcTaxReturn() call on the same facts — the simulator IS the
engine. History: the original defect showed "$0 savings" and NaN rows for
every preset; Batch 1 replaced that with an honest "unavailable" notice;
this batch restores the feature.
