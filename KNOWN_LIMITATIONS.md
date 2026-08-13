# TaxStat360 — Known Limitations & Owner Decisions

This file is referenced from source comments (e.g. the SE-179 block in
`src/lib/taxCalc.js`) and was missing from the repository (audit F-08 — it was
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

**RATIFIED Jul 8 2026 (owner):** retained as a documented boundary. Exposure direction: conservative (overstates tax).


`calcTaxReturn()` does not net separately-stated §179 (box11_12) out of
SE-subject pass-through income (Sole Proprietor / active Partnership), so SE
tax is OVERSTATED for a filer whose K-1 separately states §179 — most relevant
to an active partner with Box 12 §179. Deliberately left as-is rather than
mirroring the nonSEk1 QBI-179 fix, because netting §179 here changes SE TAX
(what the taxpayer owes) and a correct fix must simultaneously: (a) not reduce
SE earnings where the law does not; (b) respect the §179(b)(3) business-income
limitation; and (c) treat a sole proprietor (§179 already inside Schedule C
net profit — box11_12 should be blank) differently from a partnership (§179
separately stated). See the inline block in `src/lib/taxCalc.js` (search "SE-179").

## LIMITATION 179-DOLLAR — RESOLVED Jul 8 2026 (owner-approved, T-3)

The §179(b)(1)/(b)(2) annual dollar limitation and investment phase-out are
now MODELED in `calc179Limitation()` (`src/lib/taxCalc.js`), with
`TAX_TABLES[year].sec179` entries transcribed from primary sources — 2024:
$1,220,000 / $3,050,000 (Rev. Proc. 2023-34); 2025: $2,500,000 / $4,000,000
(P.L. 119-21 §70306); 2026: $2,560,000 / $4,090,000 (Rev. Proc. 2025-32) —
and seven hand-computed SPEC tests (SPEC-179D-1..7). Order of operations:
dollar limit binds first, then the §179(b)(3) business-income limit.

RESIDUAL PROXY LIMITATION (accepted at approval): the app does not separately
collect total §179 property placed in service, so the ELECTED total stands in
for it in the §179(b)(2) phase-out computation. Because placed-in-service can
only be >= the election, the true reduction can only be larger — i.e. above
the phase-out threshold the modeled limit can OVERSTATE the allowance (and
understate tax) for a taxpayer who places more property in service than they
elect. Below the threshold the proxy is exact. Collecting placed-in-service
as a separate manifest field would eliminate the residual; queued as an
enhancement, not scheduled.

## LIMITATION SE-MFJ-WAGEBASE — SE tax Social Security wage-base coordination does not apply to MFJ

**Added Aug 2026 (fresh-eyes re-audit).** Exposure direction: conservative for one MFJ
sub-case (overstates tax), exact-correct for the other.

The Finding-4 fix (see `src/lib/taxCalc.js`, search "FINDING-4 FIX") nets a taxpayer's own W-2
wages against their own SE wage-base room, per IRC Section 1402(b) / the Form SE Part I
coordination worksheet. This is correct for a one-person return (single/HOH/QSS/MFS). For MFJ,
`w2` is a single COMBINED household figure (`TaxReturn.jsx`: one `w2Income` field, no spouse
attribution anywhere in the entity or income model), but Schedule SE is filed SEPARATELY per
spouse — one spouse's W-2 must never reduce the other spouse's SE wage-base room. Because this
app cannot tell which spouse earned which dollar, MFJ does not coordinate at all (falls back to
the pre-Finding-4 uncoordinated computation):

- **Dual-earner household** (one spouse's W-2, the other spouse's SE income): uncoordinated is
  the CORRECT answer, since the self-employed spouse's own W-2 is genuinely $0.
- **Single business owner filing jointly** (same person has both the W-2 and the SE income):
  uncoordinated OVERSTATES SE tax (the original Finding-4 problem), matching this app's
  established conservative-by-design posture for unmodeled spouse-attribution gaps (see
  PAL-MFS below).

Real fix requires collecting which spouse earned each W-2/SE income source — a schema and UI
change, not scheduled. Owner decision: ship a "spouse's own W-2" input split, or accept the
conservative default indefinitely.

**Investigated for a fix, not attempted — Aug 12 2026 (Audit Synthesis, Phase 2, "B5").**
Revisited as a candidate for this engagement's remaining schema-change batch (alongside B3/B4).
Unlike B4's SEHI split — which only needed to split ONE field (the premium amount) because the
two cap bases (`_scorpOfficerW2ForSEHI`, `_seEarnedForSEHI`) already existed separately in the
engine — a real SE-MFJ fix needs spouse-level attribution of the underlying INCOME itself: which
spouse earned each dollar of `w2Income` and which spouse owns each entity in Step 1. That
attribution does not exist anywhere in the app's data model today, for any field, not just this
one — it is a foundational gap (the same one PAL-MFS above is built around working within), not a
contained field split. A partial fix scoped to just this one calculation — e.g. asking "how much
of your combined W-2 was YOUR OWN" without also attributing entity ownership per spouse — would
be inconsistent with how the rest of the return treats a joint filing and could produce a
result that looks precise but is not, on a live SE-tax number. Deferred with this note rather
than attempted; same treatment as the B6 QBI wage-cap allocation gap above. No code changed.

## LIMITATION PAL-MFS — §469(i)(5) half-allowance for spouses living apart

**RATIFIED Jul 8 2026 (owner):** retained as a documented boundary. Exposure direction: conservative (overstates tax; the lived-apart $12,500 allowance is shown as $0).


`calc469iAllowance()` models MFS as $0 allowance at every MAGI level. The
statute grants a $12,500 half-allowance to an MFS filer who lived apart from
their spouse the entire year (§469(i)(5)(A)(ii)/(B)); the app does not collect
a lived-apart-all-year fact, so the conservative $0 default applies. This
matches the engine's behavior since before the M1 centralization.

## LIMITATION NOL-80 — 80% cap applied to all NOL carryforwards

**RATIFIED Jul 8 2026 (owner):** retained as a documented boundary. Exposure direction: conservative (overstates tax for pre-2018 vintage carryforwards entitled to 100%).


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

## LIMITATION CTC-ACTC — refundable Additional Child Tax Credit not modeled

**Added Aug 2026 (fresh-eyes re-audit). RESOLVED Aug 12/13 2026 (Phase 4, Audit Synthesis).**
Original exposure direction: CAN OVERSTATE the balance due for lower/moderate-income filers
with dependents.

`childCredit` (`taxCalc.js`, search "ctcRaw") was treated as wholly nonrefundable, capped at
`fedTax + additionalMedicare + niitAmount`. IRC Section 24(d)/(h)(5) makes up to
`TAX_TABLES[year].ctc.actcMaxPerChild` ($1,700/child, TY2024-2026, Rev. Proc. 2025-32 Section
4.05(2)) refundable as the Additional Child Tax Credit, limited to 15% of earned income over
$2,500.

**Fix:** a new `actc` figure is computed as
`Math.min(unusedCTC, numDependents * actcMaxPerChild, Math.round(0.15 * Math.max(0, earnedIncomeForACTC - 2500)))`,
where `unusedCTC = Math.max(0, ctcRaw - childCredit)` is the portion of the nonrefundable
credit that couldn't be used against tax liability, and `earnedIncomeForACTC` uses the
Section 32(c)(2) definition already established elsewhere in the engine for the SEHI cap base
(W-2 wages + net self-employment earnings, net of the deductible half of SE tax). Unlike
`childCredit`, `actc` is NOT subtracted from `totalTax` -- it is treated like a payment and
reduces `balance` directly, matching Form 1040's placement on Line 28 (Payments) rather than
among the Tax/Credits lines. New constants `ACTC_RATE` (0.15) and `ACTC_EARNED_INCOME_FLOOR`
($2,500, statutory and NOT inflation-adjusted) live in `constants.js`; the per-year cap lives
in `TAX_TABLES[year].ctc.actcMaxPerChild`. Covered by `taxCalc-actc.test.js` (7 SPEC/CHAR
tests, independently hand-derived from the statute, prove-it-fails verified).

The Section 26(a)(1) nonrefundable-credit-ceiling nuance noted in the original entry (technically
"regular tax + Section 55 AMT," not NIIT/Additional Medicare Tax) was left as-is -- out of scope
for this fix, unaffected by the ACTC addition, and still rarely material per the original note.

## LIMITATION 4797-NII — Form 4797 gain assumed to be investment income for NIIT

**Added Aug 2026 (fresh-eyes re-audit). RESOLVED Aug 12/13 2026 (Phase 4, Audit Synthesis).**
Original exposure direction: CAN OVERSTATE NIIT for a filer whose Section 4797 gain comes from
selling property used in a trade or business they materially participate in.

IRC Section 1411(c)(1)(A)(iii) / Treas. Reg. Section 1.1411-4(d)(4)(i) exclude gain on
disposition of property held in an active (materially-participated, non-trading) trade or
business from net investment income. `nii` (`taxCalc.js`) previously included the full
`f4797Inc` figure unconditionally, while the same input was correctly treated as BUSINESS gain
elsewhere for the Section 461(l) excess-business-loss offset (`eblBizCapGain`) -- there was no
material-participation flag to reconcile the two treatments.

**Fix:** a new opt-in attestation checkbox, "This gain is from an active business/rental I
materially participate in (excludes it from Net Investment Income Tax)," appears in
`TaxReturn.jsx` whenever the Form 4797 field holds a positive value (hidden for losses/zero,
since a §1231 loss creates no NII exposure either way). The underlying field,
`f4797MateriallyParticipated` (boolean, default `false` -- conservative, matches the app's
general posture for unmodeled facts), is added to the field manifest and flows into
`calcTaxReturn()`. When set, `f4797NetGain` is excluded from the `nii` calculation ONLY; AGI,
gross income, the preferential-rate gain figure, and the Section 461(l) EBL offset are all
unaffected -- this is a narrowly NII-scoped exclusion, not a change to how the gain is taxed
elsewhere. Covered by `taxCalc-4797-nii.test.js` (5 SPEC/CHAR tests, prove-it-fails verified).

## LIMITATION SALT-MAGI — §164(b)(7) MAGI addbacks not modeled

**RATIFIED Jul 8 2026 (owner):** retained as a documented boundary. Exposure direction: CAN UNDERSTATE tax for filers above the $505K MAGI phase-down threshold; ratified with that exposure stated — the affected population is thin for this product's audience and the exposure is bounded by the SALT deduction itself. Revisit if the user base shifts upmarket.


The OBBBA SALT phase-down uses MAGI = AGI; the §911/931/933 exclusion
addbacks are not modeled (see `getSaltCap()` in taxCalc.js).

## LIMITATION C-10-BASIS — §1366(d)/§704(d) loss suspended when no basis is entered

**Added Aug 12 2026 (Audit Synthesis, Phase 1); formalizes engine behavior live since
before Jul 23 2026 (Pass 1 functionality audit) — owner ratification of this entry
requested, not yet obtained.** Exposure direction: conservative (can overstate tax by
suspending a loss the shareholder/partner could legitimately deduct, until basis is
entered).

`calcTaxReturn()` accepts an `assumeZeroBasisOnLoss` flag (see the C-10 FIX block in
`src/lib/taxCalc.js`); the live app (`TaxReturn.jsx`, `CalculateTaxInner.jsx`) always
passes `true`. When an S-Corp or partnership entity shows a current-year LOSS and the
shareholder/partner has not entered stock/debt basis (S-Corp, Form 7203) or outside
basis (partnership, §704(d)), the engine conservatively treats basis as $0 and suspends
the full loss (carried forward, §1366(d)(2) / §704(d)) rather than deducting it against
other income. This is NOT a missing feature — basis entry is fully supported:

- Step 1 entity cards have a "Stock & Debt Basis (Form 7203)" section
  (`CalculateTaxInner.jsx`) with a same-screen badge (`basisBadge`, search "C-10")
  that reads e.g. *"§1366(d): enter stock basis — $X loss may be limited"* or, once
  basis is entered, *"§1366(d): $X of your $Y loss is suspended — basis insufficient"*
  or *"Full $X loss is deductible — within $Y basis."*
- Step 2 (`TaxReturn.jsx`) has a "Prior-Year S-Corp Suspended Loss Carryforward (Form
  7203 Part III)" field, and a portfolio-level "enter your basis" prompt
  (`assumedZeroBasisSuspended`) driven directly off the engine's own suspended-loss
  result, so the same-screen cue can never contradict the authoritative figure.

What remains undocumented until now: unlike every other conservative-default engine
behavior (SE-179, PAL-MFS, NOL-80, SALT-MAGI above; SEHI-MIXED-SOURCE, 163J-NOT-MODELED
below), this one had no LIMITATION entry in this file despite being flagged twice —
first by the Jul 23 2026 functionality audit ("recorded here so it is not missed in a
later accuracy pass"), and again not picked up by the Aug 11 2026 tax-accuracy
engagement's closing report. This entry closes that documentation gap.

**Owner decision — August 13, 2026: NOT ratified as-is. Revisit approved and shipped
same day (Phase 1, Audit Synthesis).** Owner declined to ratify the silent $0-basis
default as permanent, on the grounds that a user could reach a final tax number without
ever being told their loss was suspended pending basis. New behavior, shipped in this
pass: **Step 1's Continue and Save actions are now BLOCKED** for any S-Corp/partnership
entity showing a current-year loss with no basis entered (`entityLossNeedsBasisEntry()`,
`src/utils/entityPredicates.js`), alongside a new "How do I find my basis?" help modal
(`BasisHelpModal`, `CalculateTaxInner.jsx`) explaining Form 7203 stock/debt basis
(S-Corp) and outside basis (partnership, §704(d)), and offering "enter $0 if you
genuinely don't know" as an explicit, honest way to unblock — which is itself a basis
entry (`stockBasis: 0` satisfies `hasBasisInput`), not a bypass.

The underlying engine math is UNCHANGED: `assumeZeroBasisOnLoss=true` remains in
`calcTaxReturn()` as defense-in-depth for any record that reaches the engine without
passing through this new UI gate (e.g. a loaded/imported record). This is a UI-layer
policy change, not a tax-calculation change — the $0-basis-suspends-the-loss MATH was
already correct and stays correct; what changed is that a user can no longer reach a
final number without confronting that fact first. Covered by 13 new unit tests
(`entityPredicates.test.js`) for the gating predicate itself; prove-it-fails verified
(temporarily broke the loss-sign check, confirmed the exact-$0 test failed, restored).

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

## OBS-5 — form key in the client bundle — RESOLVED (Phase 2.2c, revised r1, Jul 2026)

Resolved MORE completely than the Batch-6 spec imagined: there is no form key
anywhere anymore. The original r0 relay held the web3forms key server-side per
the spec; live testing revealed web3forms rejects server-side submissions on
the free plan ("Pro plan is required"), and r0's error handling passed that
rejection through as HTTP 200 {"success": false} — a silent failure, caught
the same day. Revision r1: POST /alerts/form-relay now sends the email ITSELF
via SES (the transport the reset/verification emails already use, same
verified sender), destination env-overridable via ALERT_TO_EMAIL (default
support@taxstat360.com), Reply-To carries the submitter's address, and any send
failure is a loud 502. Field whitelist/caps, subject requirement, and the
5/min/IP limit are unchanged and pinned in tests/test_form_relay.py (backend
53 tests). web3forms is retired entirely; the WEB3FORMS_ACCESS_KEY service
env var is inert and can be removed at leisure; the old public key's
web3forms account can simply be deactivated.

## [historical] OBS-5 — web3forms key ships in the client bundle

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

**Ratified — Aug 12 2026 (Audit Synthesis, Phase 2, owner decision).** Reviewed
during Module F scoping and left as permanent, accepted debt rather than
revived. Rationale: Pass 4's own investigation already confirmed both local
components are thin styling adapters that delegate all parsing/formatting
logic to the shared core — this is a styling duplication, not a functional
one, so the risk this creates is already low. Migrating ~94 call sites across
the app's two largest components for a purely cosmetic consolidation, on a
live tax product, was judged not worth the testing surface it would add. No
code changed. Still recoverable per the note above if this calculus changes.

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

## OBS-10 — Module F: entities-persistence write duplication in CalculateTaxInner.jsx — PARTIALLY RESOLVED (Aug 12 2026, Audit Synthesis Phase 2)

Pass 4 (code consistency audit) scoped "Module F" as extracting a shared hook
over common session-state reads across TaxReturn.jsx, CalculateTaxInner.jsx,
and AIAnalysis.jsx, and deferred it as "not urgent, consider only when these
files are next touched for other reasons." When actually scoped for
implementation, the three files turned out not to share one duplicated
pattern: TaxReturn.jsx has a single auto-save effect over its form fields;
AIAnalysis.jsx never writes these keys, only re-reads them fresh in several
functions (apparently intentional — it wants current data, not cached state);
only CalculateTaxInner.jsx had real, narrow duplication — the literal body of
`writeStep1Entities(next)` (a "light" working-copy sync) and, separately, the
literal body of `writeStep1State(...) + writeDirtyFlag(true)` (a "full"
canonical write) were each repeated verbatim across multiple entity-mutation
call sites, including one (`updateEntity`) with a documented race-condition
fix (BUG-A) requiring a synchronous inline write ahead of the debounced
`persistStep1` effect.

**What shipped:** two local helpers in CalculateTaxInner.jsx,
`persistEntitiesWorkingCopy()` and `persistCanonicalStep1()` (search "Module
F" in that file), each holding one of those two previously-repeated bodies.
Every call site's existing decision about WHEN and WHETHER to persist is
unchanged — this only removes literal code duplication, not any timing or
conditional logic. One incidental improvement: `persistStep1` previously
opened with a `writeStep1Entities(entities)` call that was already fully
redundant with `writeStep1State`'s own entitiesRaw side effect three lines
later (both wrote the same value to the same key) — folding it into the
shared helper removed that redundant write rather than just deduplicating
source text.

**What did NOT ship, and why:** a single hook spanning all three files, as
Pass 4's original scoping implied. TaxReturn.jsx's auto-save effect and
AIAnalysis.jsx's live-read pattern are shaped differently from
CalculateTaxInner.jsx's mutation-then-persist pattern and from each other;
forcing them into one shared abstraction would mean re-deriving sequencing
that several past bug fixes (BUG-A among them) depend on, on the app's three
largest and most calculation-critical components, for a benefit smaller than
the original scoping description implied. Owner decision (Aug 12 2026):
proceed with the narrow fix only. TaxReturn.jsx and AIAnalysis.jsx were not
touched by this pass.

## Defect SIM-1 — What-If Simulator — RESOLVED (Batch 7, Jul 2026)

Repaired on the same scenario→engine translation the Dashboard Tracker uses.
Test-anchored invariant (whatif-simulator.test.js): every scenario figure
equals a direct calcTaxReturn() call on the same facts — the simulator IS the
engine. History: the original defect showed "$0 savings" and NaN rows for
every preset; Batch 1 replaced that with an honest "unavailable" notice;
this batch restores the feature.

## LIMITATION BIG-1374 — §1374 built-in gains tax not modeled

**Added Aug 2026 (external accuracy audit, Finding 2).** Exposure direction: CAN UNDERSTATE
tax for a former C-corp within its 5-year §1374 recognition period that disposes of an asset
with built-in gain.

No field, computation, or asset-level recognition-period tracking exists anywhere in the S-Corp
entity flow for §1374 built-in gains (BIG) tax. A C-corp that elects S status must track any net
unrealized built-in gain (NUBIG) as of the conversion date; gain recognized on a disposition
within the recognition period (5 years, PATH Act) is taxed at the corporate level at 21% before
flowing through to shareholders — entirely outside what this engine computes.

`CalculateTaxInner.jsx` now shows a disclosure warning (search "EXT-2") whenever the entity
carries accumulated C-corp E&P (`entity.accumulatedEP > 0` — the only existing signal in the
data model that an S-corp has C-corp history), directing the user to confirm §1374 exposure with
their CPA. This is a disclosure only, not a fix: it does not compute BIG tax, does not know the
S-election date, and does not know whether the specific disposition is asset-level built-in-gain
property. A former C-corp with NO retained E&P at conversion (fully distributed before
electing S status) would carry this exposure with no accumulated E&P to trigger the warning —
a real gap in the disclosure trigger itself, not just the underlying calculation.

Full support requires: (1) an S-election date field, (2) a NUBIG-at-conversion figure, (3)
asset-level recognition tracking across the 5-year window, and (4) the corporate-level 21% tax
computation feeding into the shareholder-level K-1. Owner decision: build BIG tax support, or
formally accept this as an out-of-scope entity type (former C-corps within 5 years of S-election)
and strengthen the disclosure trigger to fire on any S-corp entity regardless of accumulated E&P
(e.g., a "was this ever a C-corp?" checkbox, independent of the E&P figure).

**Trigger gap closed — Aug 12 2026 (Audit Synthesis, Phase 2).** Implemented the exact fix this
entry recommended: a "was this ever a C corporation (or did it acquire one)?" checkbox
(`entity.wasFormerCCorp`) alongside the E&P/AAA fields, independent of the E&P dollar figure. The
disclosure now fires on `accumulatedEP > 0 OR wasFormerCCorp === true`. This closes the disclosure
gap for a fully-distributed former C-corp; it remains a disclosure only — BIG tax computation
itself (items 1-4 above) is still not modeled and is unchanged in scope.

## LIMITATION 121-HOME-SALE — §121 principal residence exclusion — lightweight calculator added, not wired into the engine

**Added Aug 2026 (external accuracy audit, Finding 6).** Exposure direction: N/A — feature not
present, not a miscalculation of a feature that exists.

There is no home-sale entry point anywhere in the app (the "Real Estate" entity type is scoped
to Schedule E rental activity only — see `isRealEstateEntity()` in `src/utils/entityPredicates.js`).
Gain on sale of a principal residence excludable up to $250,000 (single) / $500,000 (MFJ) under
IRC §121, including the post-2008 "nonqualified use" allocation for a residence with any rental
history (§121(b)(5)), is out of scope. This matches the product's stated focus ("built for
business owners", not a full 1040 replacement) and is not believed to require a code change —
recorded here per the external audit's recommendation to make the scope boundary explicit and
owner-ratified rather than implicit. Owner decision: confirm this boundary, or add a lightweight
home-sale entry point alongside Schedule E.

**Resolved (lightweight) — Aug 12 2026 (Phase 3, Audit Synthesis).** Owner decision: add a
lightweight entry point. `calcSection121Exclusion()` (`src/lib/taxCalc.js`, single source of
truth per ARCHITECTURE.md §1) computes amount realized, gain, the statutory §121(b)(1)-(2)
exclusion ($250,000 / $500,000 via the new `SEC121_EXCLUSION_SINGLE` / `SEC121_EXCLUSION_MFJ`
constants), and taxable excess, gated on a user-attested ownership-and-use-test checkbox.
Surfaced as a new "Home Sale Calculator (§121)" tool in AIAnalysis.jsx's Reports & Tools tab
(`Section121Modal`) — a fifth standalone tool alongside the What-If Simulator, same
"doesn't touch your saved record or feed the tax engine" posture (confirmed: no
`calcTaxReturn()` input references this calculator's output).

**What this does NOT do, by design:** it does not compute the §121(b)(5) nonqualified-use
allocation (gain must be pro-rated between qualified and nonqualified use periods since Jan 1,
2009 for a residence ever rented or used for business) — that requires exact date-range tracking
this lightweight tool doesn't collect. When the user checks "this home was ever rented or used
for business," the modal shows a prominent disclosure that the computed excludable amount may
overstate what's actually allowed and directs them to a preparer for the exact allocation. It
also does not separately verify the ownership-and-use test per spouse for MFJ's $500,000 ceiling
(IRC §121(b)(2)(A) requires both spouses to individually qualify) — a single attestation
checkbox covers the household. 9 SPEC + 1 CHAR tests (`taxCalc-section121.test.js`), including a
pin confirming the calculator's output never appears on `calcTaxReturn()`'s return object;
prove-it-fails verified (broke the MFJ-vs-single cap branch, confirmed the 2 dedicated
differentiating tests fail while the other 8 still pass, restored).

## LIMITATION DEP-UNVALIDATED — manual depreciation entry has no statutory cap check

**Added Aug 2026 (external accuracy audit, Finding 7).** Exposure direction: CAN UNDERSTATE tax
if a user enters a depreciation figure that already reflects an over-the-statutory-cap §179
election or an implausible bonus-depreciation amount.

The per-entity "Depreciation — total deduction this year" field (`CalculateTaxInner.jsx`, P&L
manual entry) is a single lump-sum figure the engine trusts as entered — by design (see the
tooltip: "TaxStat360 uses this figure as entered and does not calculate bonus depreciation for
you"), and NOT the same thing as the §179(b)(3) business-income limitation that
`calc179Limitation()` already applies to the separately-stated K-1 §179 box (see
`179-DOLLAR`, resolved, above). No validation exists anywhere against the §179(b)(1)/(b)(2)
annual dollar cap ($2,560,000 / $4,090,000 phase-out for 2026, `TAX_TABLES[year].sec179`) for
the aggregate P&L depreciation figure itself, since the engine has no way to know how much of a
manually-entered lump sum is a §179 election vs. MACRS vs. bonus depreciation.

This is a disclosed, reasonable design choice for a tool whose depreciation figure is meant to
be pre-computed by the user or their accountant — full validation would require collecting
placed-in-service dates, asset classes, and election details well beyond this product's current
scope. Recorded here (external audit's recommendation) rather than acted on: given the product's
stated non-accountant audience, a future soft warning (not a hard block) when entered
depreciation is large relative to gross receipts could reduce silent overstatement risk without
attempting in-app §179/bonus computation. Owner decision; not scheduled.

**Soft warning added — August 13, 2026 (Phase 1, Audit Synthesis).** Implemented the
exact recommendation above: a non-blocking, dismissable-by-editing advisory
(`CalculateTaxInner.jsx`, gated on `DEPRECIATION_WARNING_RATIO` / `DEPRECIATION_WARNING_MIN_RECEIPTS_FLOOR`
in `constants.js`) now renders under the Depreciation field whenever entered depreciation exceeds
50% of this entity's own gross receipts (with a $100,000 floor so a low/zero-revenue entity still
gets a sane comparison base, rather than firing on every nonzero depreciation entry). Purely
advisory — role="alert" text only, never a hard block, no change to any calculation. This code
shipped without an accompanying CHANGELOG.md entry or test coverage; both are backfilled in this
pass (see CHANGELOG.md "Phase 1 documentation sync" and the new
`CalculateTaxInner.dep163j-warnings.test.jsx`). The underlying statutory-cap validation this
entry describes remains out of scope — still a disclosure, not a computation.

## LIMITATION SEHI-MIXED-SOURCE — combined SEHI entry not attributed when both S-corp and independent SE income are present

**Added Aug 2026 (independent fresh-eyes re-audit, Finding 1 regression fix); UI warning added
same pass after a second independent review flagged the silent gap below.** Exposure direction:
CAN MISSTATE TAX IN EITHER DIRECTION for a taxpayer with both an S-corp and separate SE-earned
income (sole prop / active partnership) in the same return — understating it if the combined SEHI
entry is actually all S-corp-paid (the fallback under-attributes to wages), or overstating it if
the entry is actually all paid by the other business (the fallback over-attributes to wages).
Magnitude is bounded by the smaller of the two business's earned-income legs.

The EXT-1 fix (`src/lib/taxCalc.js`, search "EXT-1 FOLLOW-UP FIX") now correctly grosses up W-2
wages by the FULL >2%-shareholder health premium — not just the capped deduction — whenever the
S-corp officer wage base is the entire `sehiLimit` (i.e. no independent SE-earned income is also
present for this taxpayer). This closes the material AGI-understatement bug the re-audit found
(premium exceeding officer wages was silently dropped from income).

When a taxpayer has BOTH an S-corp (officer W-2) AND separate SE-earned income (sole prop /
active partnership) in the same return, `selfEmpHealthIns` is a single combined field with no
way to attribute which dollars are S-corp-sourced (wage-includible) vs. sole-prop/partner-sourced
(never wages). The engine falls back to the pre-follow-up-fix formula (grossup capped at the
lesser of the allowed deduction and the officer wage base) in that mixed case — a conservative,
previously-reviewed fallback, not a new behavior; mixed-source filers are no worse off than before
this pass. `sehiMixedSourceFallback` is now returned from `calcTaxReturn()` and surfaced as a
banner in `TaxReturn.jsx` (independent of `sehiClamped`, which does not reliably fire in this
case) telling the user TaxStat360 could not attribute the entry and to confirm the wage inclusion
with their preparer. A full fix requires splitting the SEHI input into an S-corp leg and a
sole-prop/partner leg; a schema and UI change, not scheduled. Owner decision.

**Round 3 (Aug 2026) — RESOLVED for QBI, same ambiguity gate/fallback extended.** A second
independent reviewer flagged that the same S-corp SEHI attribution question also reaches §199A:
(a) Treas. Reg. §1.199A-3(b)(1)(vi) requires QBI to be reduced by the SEHI deduction attributable
to the business — the sole-prop/partner leg was already netted, but the S-corp leg (`nonSEk1`)
never was, overstating QBI; (b) IRS Notice 2018-64 (read with Notice 2008-1) treats a >2%
shareholder's SEHI as W-2 wages for the §199A(b)(4) wage limitation too, so leaving the QBI wage
base un-grossed-up understated the wage cap — the opposite exposure direction from (a) and from
the original AGI bug. Both are now fixed in `src/lib/taxCalc.js` (search "EXT-7"), gated by the
SAME unambiguous-single-source condition as the EXT-1-FOLLOW-UP wage grossup. The mixed-source
case (both an S-corp and independent SE income present) still falls back to leaving QBI
unadjusted — same limitation, not newly introduced, and consistent with the wage-grossup
fallback above. **This means the original QBI-overstatement exposure (item 1) is NOT resolved
for mixed-source filers** — a >2% shareholder with both an S-corp and separate SE-earned income
still gets no SEHI-driven QBI reduction, same as before this round. 5 SPEC tests
(`taxCalc-sehi-qbi-attribution.test.js`, including a dedicated case confirming the QBI
reduction uses the CAPPED §162(l) deduction while the wage bump uses the FULL uncapped
premium — these are deliberately different amounts); prove-it-fails verified (reverted both
changes, confirmed the 2 dedicated tests fail, the 2 unrelated tests still pass, restored).

**Follow-up flagged, not fixed (pre-existing, not introduced by Round 3):** when 2+ QBI-eligible
entities exist and §1.199A-4 aggregation is not elected, `_calcQBI`'s per-business wage-cap
allocation loop weights each entity by its raw K1 share, not by the aggregate adjustments baked
into `qbiBasis` (this was already true for `rentalQbiContribution`, `effectiveQBILossCO`, and
`guaranteedPaymentsTotal` before this round, and now also for the new SEHI reduction). In a
non-aggregated household with an unambiguous-SEHI S-corp plus another QBI-eligible entity, the
SEHI haircut could be misallocated between entities even though the aggregate total deduction
stays correct. Untested by the current suite; candidate for a future pass.

**RESOLVED for split-entry filers — Aug 12 2026 (Audit Synthesis, Phase 2, "B4").** The schema
and UI change flagged above as "not scheduled" (last paragraph of the original Aug 2026 entry)
is now built: `selfEmpHealthInsScorp` and `selfEmpHealthInsOther` are two new optional fields
(`src/utils/fieldManifest.js`), surfaced in `TaxReturn.jsx` as an inline split prompt that
appears only when the return has both an S-corp with officer wages and independent SE-earned
income present (`sehiMixedSourceUI`). When a filer fills these in, `sehiSplitEngaged` is true in
`src/lib/taxCalc.js` and every downstream formula uses the EXACT entered split instead of the
heuristic: each leg is capped independently against its OWN §162(l)(2)(A) earned-income base
(S-corp officer wages / other-business SE earnings) rather than pooled against the combined
`sehiLimit` — which is actually the more correct reading of §162(l), since the statute caps each
plan's premium by the earned income of the trade/business under which THAT plan is established,
not a shared pool across two unrelated businesses. The full S-corp-paid amount grosses up W-2
wages unconditionally (no ambiguity to fall back on), and the QBI reduction (`scorpSEHIQbiReduction`)
nets the S-corp-attributable deduction out of `nonSEk1ForQBI` unconditionally too. `sehiMixedSourceFallback`
returns `false` once split fields are engaged, so the warning banner no longer fires for that record.

**Still open — mixed-source filers who leave the split fields blank.** The split is opt-in: a
filer who has both businesses but does not fill in the two new fields (both stay 0) still hits
`sehiSplitEngaged === false`, and every formula falls back to the ORIGINAL Aug 2026 heuristic
described above, unchanged — same conservative pooled-cap approximation, same
`sehiMixedSourceFallback` banner, same QBI non-adjustment. This is a deliberate backward-compatible
default (a blank/unmigrated field must not silently change a previously-calculated liability);
it does mean the underlying ambiguity is only closed for filers who actively use the new fields,
not automatically for everyone with a mixed-source return. Test coverage:
`taxCalc-sehi-split.test.js` — per-leg capping (S-corp leg capped at officer wages independent of
the other leg's cap; other leg capped at SE earnings independent of the S-corp leg), full
wage-grossup on the entered S-corp amount even when it exceeds officer wages, QBI reduction using
the split S-corp leg, and a "split fields left blank falls back exactly to pre-B4 behavior" pin
test; prove-it-fails verified (reverted the `sehiSplitEngaged` branch, confirmed the split-specific
tests fail while the legacy fallback tests still pass, restored).

**Scoped for a fix, not attempted — Aug 12 2026 (Audit Synthesis, Phase 2).** Investigated as a
candidate for this engagement's remaining QBI item. The gap is deeper than the paragraph above
implies: correctly weighting the wage cap by each entity's fully-adjusted QBI contribution would
require a PER-ENTITY breakdown of `rentalQbiContribution`, `effectiveQBILossCO`, the SEHI
reduction, and `guaranteedPaymentsTotal` — but `rentalQbiContribution` specifically is computed as
a single portfolio-level pool (`combinedRentalNet` / `rentalNetAfterCF` in `taxCalc.js`'s §469
block), not per-property, because the passive-activity-loss allowance and the §469(c)(7)/§1.469-9(g)
REP-aggregation election both operate at the portfolio level by statute. There is no existing
per-entity decomposition to thread through — a correct fix means designing new allocation
methodology (e.g., a defensible pro-rata attribution of the portfolio-level PAL result back to
individual rentals) from scratch, not rewiring existing values. That is real design work
warranting its own dedicated pass with new SPEC tests and independent review, not a rider on
another engagement. Re-confirming the practical impact while deferring: this affects only the
displayed PER-ENTITY split of the QBI deduction in a specific multi-entity, non-aggregated
household; the AGGREGATE deduction total is unaffected either way (see the code's own
`Σ allocated == scaledQbiComponent` invariant). No user's estimated tax liability changes because
of this gap. Owner decision: schedule as its own future engagement, or accept indefinitely.

## LIMITATION 1245-ORDINARY-RECAPTURE — no dedicated field for §1245 ordinary depreciation recapture

**Added Aug 2026 (pre-launch fresh-eyes audit, Finding 4).** Exposure direction: user error risk
(contradictory guidance could cause omission or miscategorization), not a computation error —
the engine doesn't compute this figure at all today, by design.

The rental "Sold or exchanged this property?" disclosure (`CalculateTaxInner.jsx`) used to tell
users that "ordinary §1245/§1250 recapture" belongs in the "Capital Gains (Form 4797)" field —
directly contradicting that field's own tooltip (`TaxReturn.jsx`), which correctly states §1245
recapture is ordinary income and does not belong there. Reworded (EXT-8) so both agree: the
"Capital Gains (Form 4797)" field is for the NET §1231 gain/loss only (ordinary recapture already
backed out, per §1231(a)(3)(A)(i)), and "Unrecaptured §1250 Gain" is for the depreciation-
attributable portion of a real-property gain specifically.

§1245 recapture itself (personal property component of a disposition — most relevant to a
furnished rental's appliances/furniture, since the building itself is §1250 real property) has NO
dedicated field anywhere in the app. Rather than guess at an incorrect routing (e.g., silently
folding it into ongoing rental net income, which would distort the passive-activity figure a
different way), the disclosure now tells the user to add it as ordinary income outside this tool
or confirm treatment with their preparer. A full fix requires a dedicated ordinary-recapture input
that flows to Schedule 1 ordinary income without touching the rental's ongoing passive-income
figure — a schema and engine change, not scheduled. Owner decision.

**Ratified — Aug 12 2026 (Phase 3, Audit Synthesis).** Owner decision: keep disclosure-only.
The current EXT-8 wording is accurate and low-risk (it correctly tells the user where NOT to
put this figure and directs them to their preparer); a dedicated field is not worth the schema/
engine change at this time. Revisit if users report this as a recurring pain point. No code
changed.

## LIMITATION 163J-NOT-MODELED — §163(j) business interest expense limitation not modeled

**Added Aug 2026 (independent fresh-eyes re-audit, Finding 2).** Exposure direction: CAN
UNDERSTATE tax for an entity subject to the limitation that nonetheless deducts its full
business interest expense.

No field exists anywhere in the app (entity level or personal level) for business interest
expense or the §163(j) adjusted-taxable-income-based 30% limitation. For entities with average
annual gross receipts over the indexed threshold (~$29M for 2026), business interest deductions
in excess of business interest income plus 30% of ATI are disallowed and carried forward
(real estate and certain other trades can elect out, at the cost of ADS depreciation). Any
business interest a user enters as part of a lump-sum expense figure flows through fully
deducted, with no limitation or carryforward computed. Most small/mid-size filers this product
targets fall under the gross-receipts threshold and are unaffected, but the app has no
disclosure alerting a larger filer that the limitation isn't applied. Recommended: at minimum,
add a disclosure (mirroring the §1031/§1374 hand-off pattern) when an entity's revenue suggests
it may exceed the threshold; a full worksheet is a larger scope decision. Owner decision; not
scheduled.

**Disclosure added — August 13, 2026 (Phase 1, Audit Synthesis).** Implemented the exact
recommendation above: a non-blocking advisory (`CalculateTaxInner.jsx`, gated on
`SEC163J_GROSS_RECEIPTS_THRESHOLD_APPROX` / `SEC163J_DISCLOSURE_TRIGGER_RATIO` in `constants.js`)
now renders when an entity's entered gross receipts exceed 75% of an approximate $29,000,000
threshold. This does not compute the limitation, does not carry any figure forward, and does not
gate on the true 3-year-average §448(c) test (the app only collects current-year gross receipts) —
disclosure only, same posture as `BIG-1374`. Independently re-verified during this pass: the actual
Rev. Proc. 2025-32 §4.30 §448(c) average-gross-receipts threshold is $30,000,000 for 2024,
$31,000,000 for 2025, and $32,000,000 for 2026 — the constant's $29,000,000 predates that
confirmation and is a deliberately conservative round-number floor, not a per-year figure. Because
the trigger fires at 75% of $29,000,000 (≈$21.75M) — below every year's true threshold — this
under-approximation makes the warning fire earlier/more often than strictly necessary, not later;
it cannot cause a filer who should see the warning to miss it. If this disclosure is ever promoted
to a real computation, `SEC163J_GROSS_RECEIPTS_THRESHOLD_APPROX` should be replaced with true
per-year `TAX_TABLES[year].sec163jGrossReceiptsThreshold` entries at that time. This code shipped
without an accompanying CHANGELOG.md entry or test coverage; both are backfilled in this pass.

## PASSIVE-PARTNER — passive / limited partnership interests are not modeled

**Scope:** TaxStat360 models *active* partnership interests only. The entity picker offers
"Partnership / LLC", which `normalizeEntityType()` maps to `Partnership / MMLLC — Active`.

The engine vocabulary already distinguishes a passive variant
(`Partnership / MMLLC — Passive`), and `SE_SUBJECT_TYPES` deliberately omits it, so a passive
partner would correctly owe **no SE tax** (IRC §1402(a)(13)). The §199A(i) $400-minimum gate
also now excludes passive-partner QBI (`_passiveK1Qbi` in `calcTaxReturn`).

**Why it is not exposed in the UI:** the §469 passive-activity-loss machinery
(`palAdjustedRental` / `passiveRentalNet` / `calc469iAllowance`) is **rental-scoped**. If the
passive-partner type were made selectable today, a passive partnership *loss* would flow
through as fully deductible against non-passive income instead of being suspended under §469 —
a worse error than the one the type would fix. NIIT treatment of passive K-1 income would also
need review.

**To support passive partners properly, all of the following are required:**
1. Make the passive variant selectable in `ENTITY_TYPES` / the entity picker.
2. Suspend passive K-1 losses under §469 (extend the PAL machinery beyond rentals) with
   carryforward tracking.
3. Confirm NIIT treatment — passive K-1 income IS net investment income (§1411).
4. Keep the SE-tax exemption and the §199A(i) floor exclusion (both already in place).

Until then, a limited partner who does not materially participate is outside the tool's
supported scope.


## AUTH-SESSION — login succeeds but /auth/me returns 401 (independent review, Jul 31 2026)

**Not fixable from this repository.** Reproduced live against the deployed app: `POST
app.taxstat360.com/auth/login` returns 200, and the very next `GET app.taxstat360.com/auth/me`
(fired by `RequireAuth` in `src/App.jsx` immediately after login) returns 401 — every time,
5/5 attempts. The UI shows "Your session expired and you were signed out" and bounces back to
`/login`, which blocks every sign-in until the affected user closes the tab and retries (it
resolved without a discernible client-side cause on a later attempt in the same session).

**Frontend code is not the cause.** `src/utils/apiClient.js` already sends
`credentials: 'include'` on same-origin-labeled calls to `API_BASE_URL` (the auto-upgrade from
`'same-origin'` to `'include'` for `isOurApi` requests), and `Onboarding.jsx`'s login submit
handler passes `credentials: 'include'` explicitly on the login POST itself. Both call sites
are correct for a cross-origin (`www.taxstat360.com` → `app.taxstat360.com`) credentialed
request.

**Most likely root cause — backend / infrastructure, not in this repo:** a `Set-Cookie` header
on the `/auth/login` response missing `SameSite=None; Secure` (or an incompatible `Domain`
attribute). `www.taxstat360.com` and `app.taxstat360.com` are different origins; from the
browser's perspective a fetch from one to the other is cross-site for cookie purposes. A
`Set-Cookie` without `SameSite=None; Secure` is silently dropped by the browser on that
follow-up request, which is exactly the symptom observed (cookie appears to "not exist" one
request later). This is set by whatever issues the auth cookie — `App.jsx`'s comment says
"set by login Lambda" — which is not part of this frontend repository.

**Secondary path worth checking first, since it needs no cookie fix:** `Onboarding.jsx`'s
`finishLogin()` already writes `data.access_token` (if present in the login response) to
`ts360_token`, and `apiClient.js` attaches it as `Authorization: Bearer <token>` on every
`API_BASE_URL` call automatically. If the backend's `/auth/login` response reliably includes
`access_token`, this bearer-token path authenticates independently of cookies and the SameSite
issue above becomes moot for `/auth/me` (though other endpoints may still depend on the cookie).
Confirm whether `access_token` is present in the live login response body — if it's missing or
empty for some accounts/environments, that is a second, independent bug to fix on the backend.

**What to check on the backend / infra side:**
1. Inspect the actual `Set-Cookie` header returned by `POST /auth/login` in production —
   confirm `SameSite=None; Secure` is present (not `Lax`/`Strict`/omitted).
2. Confirm `Domain` on that cookie is either unset (defaults to `app.taxstat360.com`, which
   matches every API call site in this repo) or explicitly `.taxstat360.com` if it's meant to
   be shared with `www.taxstat360.com` directly — either is workable, but it must be
   intentional and consistent with what `/auth/me` expects.
3. Confirm `Access-Control-Allow-Credentials: true` and an exact-origin (not wildcard)
   `Access-Control-Allow-Origin: https://www.taxstat360.com` on both the login and `/auth/me`
   responses — a wildcard `*` origin is incompatible with credentialed requests and browsers
   will refuse to expose/send cookies against it.
4. Confirm the login response body includes `access_token` consistently (see above) as a
   working fallback while the cookie configuration is fixed.
