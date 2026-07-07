# TaxStat360 Changelog

Historical fix logs previously lived in file-level `// — Change log` comment
blocks inside each `.jsx` source file (BUG-01, L-02, C-06, UX-05, F-NEW-A,
PASS5, etc.). Those headers were the right instinct; future changes go here
instead so diffs stay clean and the history is searchable in one place.

The existing in-file headers in `TaxReturn.jsx`, `CalculateTaxInner.jsx`, and
`AIAnalysis.jsx` are preserved as-is — do not remove them. They serve as a
record of work that predates this changelog.


---

## [Restored] — July 6, 2026

This file was deleted on July 5, 2026 (commit ca9817e) while source comments in
`taxCalc.js` and `constants.js` still pointed to it (audit finding F-08). Restored
from git history (`git show ca9817e^:CHANGELOG.md`) with the entries below added.
`KNOWN_LIMITATIONS.md`, also referenced from `taxCalc.js` (SE-179 block), never
existed in repo history and will be created in refactor Module M7.

---

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
