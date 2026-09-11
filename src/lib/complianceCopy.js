// src/lib/complianceCopy.js
//
// ─── CONSUMER-FACING COMPLIANCE COPY — SINGLE SOURCE OF TRUTH ────────────────
//
// Pre-launch audit remediation (Sep 2026), blockers B2 / B3 / B4 / B7.
// These strings are the ones a regulator, OPR, or a plaintiff's lawyer reads
// first. They live here — NOT inline in components — so the wording can never
// drift between Landing, About, Upgrade, Footer, and the signup flow, which is
// exactly how the contradictions the audit found came to exist.
//
// ⚠ EDIT HERE ONLY. Every one of these strings was chosen against a specific
// rule, cited inline. If you change one, re-read the citation first.
//
// (Companion to constants.js — DISCLAIMER_FULL / DISCLAIMER_SHORT / CTA_COPY_*
// already live there and are unchanged. This module holds only the strings the
// audit rewrote, so the remediation is reviewable as one file.)

// ─── B4 — NON-ENDORSEMENT ────────────────────────────────────────────────────
// 31 C.F.R. §10.30(a)(1) bars a practitioner's public communications from
// implying an employer/employee relationship with the IRS. 31 U.S.C. §333 bars
// using the IRS/Treasury name in a way that could convey the false impression
// that a communication is approved, endorsed, or authorized by the IRS — civil
// penalty up to $25,000 per violation ($100,000 for broadcast).
//
// The site leads with a former-Revenue-Agent credential and the headline "See
// What You're On Track to Owe the IRS," with no non-endorsement statement
// anywhere. This renders in the shared <Footer>, so it appears on every page.
//
// The closing sentence is deliberate: "enrolled to practice before the Internal
// Revenue Service" is one of the three descriptions §10.30(a)(1) expressly
// identifies as acceptable for an enrolled agent. Use it verbatim.
export const NON_ENDORSEMENT =
  'TaxStat360 LLC is not affiliated with, endorsed by, or approved by the Internal Revenue Service or the U.S. Department of the Treasury. References to prior IRS employment describe an individual’s past work history only and do not imply any current relationship with, influence over, or special access to the IRS. TaxStat360’s founder is an Enrolled Agent, enrolled to practice before the Internal Revenue Service.'

// ─── B3 — CREDENTIAL AS PROVENANCE, NOT AS ADVICE ────────────────────────────
// The audit's B3 finding: Terms §2 states the platform is "NOT a licensed tax
// advisor, CPA, enrolled agent, or law firm," while /about said the founder's
// career is "encoded into every calculation" and "built directly into the
// product." Both cannot be true in any way that helps.
//
// Under the FTC Policy Statement on Deception (1983) and Removatron Int'l Corp.
// v. FTC, 884 F.2d 1489 (1st Cir. 1989), a disclaimer may QUALIFY a truthful
// claim but cannot CURE a contradictory one — the net impression governs. And
// since T.D. 9668 (2014) eliminated the §10.35 covered-opinion disclaimer
// regime, Circular 230 works the same way: the standard is substantive conduct,
// not boilerplate.
//
// Resolution: keep the credential, drop the "her judgment is in the output"
// framing. The credential describes who designed the METHODOLOGY; the platform
// applies PUBLISHED rules. That claim is true, substantiable, and still sells.
//
// ⚠ Do NOT reintroduce: "encoded into every calculation", "built directly into
// the product", "one person's career", "what the IRS looks for", "where the
// real exposure sits", "exactly what triggers audits", "how returns are
// selected for audit", "how returns are scrutinized". Each of those is either
// a claim to non-public tax administration information or a representation
// that the output IS the practitioner's professional judgment.

export const CREDENTIAL_HEADLINE =
  'Built by an Enrolled Agent and Former IRS Revenue Agent'

export const CREDENTIAL_SHORT =
  'Enrolled Agent & Former IRS Revenue Agent'

// Home page — the "Built by" block.
export const CREDENTIAL_BODY =
  'TaxStat360’s calculation methodology was designed by a seasoned tax strategist — an Enrolled Agent enrolled to practice before the Internal Revenue Service, and a former IRS Revenue Agent. The platform applies published IRS rates, regulations, Internal Revenue Manual provisions, and case law to the figures you enter. It does not provide advice on your individual circumstances, and no professional relationship is created by your use of it.'

// /about — hero paragraph.
export const ABOUT_HERO_BODY =
  'TaxStat360 was built by a seasoned tax strategist — an Enrolled Agent enrolled to practice before the Internal Revenue Service, and a former IRS Revenue Agent. That career informed how the platform is designed: which rules matter to business owners, which figures drive the outcome, and where planning decisions are still reversible. The calculations themselves apply published federal tax authority — the Internal Revenue Code, Treasury Regulations, IRS revenue procedures, and case law that are available to every taxpayer.'

// /about — "The Expertise Behind It" intro.
export const ABOUT_EXPERTISE_INTRO =
  'TaxStat360’s methodology was designed by one practitioner: an Enrolled Agent and former IRS Revenue Agent whose work spans business tax across entity types — the published examination standards that govern these returns, how reporting requirements differ by structure, and how proactive planning legally lowers what you owe. The product applies those published rules; it does not substitute for advice on your own facts.'

// /about — "The Expertise Behind It" section heading (was "One Background.
// Built Into Every Calculation." — the "built into every calculation" framing
// is the B3 problem).
export const ABOUT_EXPERTISE_HEADING =
  'One Practitioner’s Methodology. Published Federal Rules.'

// /about — first expertise card (was: "what examiners look for, how returns are
// selected for audit, and where the real exposure sits").
//
// Audit selection methodology — DIF/UDIF scoring, campaign selection criteria —
// is non-public tax administration information. A former Revenue Agent
// representing that she knows "how returns are selected for audit" makes one of
// two claims and neither helps: either it is true (monetizing protected
// information, implicating IRC §6103 and post-employment conduct rules) or it
// is not (a misleading claim under §10.30(a)(1)).
export const ABOUT_CARD_EXAMINATION =
  'Built around the published examination standards that govern business, partnership, and corporate returns — the Internal Revenue Manual provisions, regulations, and case law that define what a supportable position looks like, all publicly available to every taxpayer.'

// ─── B7 — POSITION DOCUMENTATION, NOT NOTICE RESPONSES ───────────────────────
// 31 C.F.R. §10.2(a)(4) defines practice before the IRS to include
// "corresponding and communicating with the Internal Revenue Service on behalf
// of a taxpayer." Generating a taxpayer-specific letter responding to a real
// notice is that, and the parenthetical "(documentation — not representation)"
// was a label rather than a functional limit — one that also demonstrated the
// line had been identified and the feature shipped anyway.
//
// Note the SHIPPED feature (AIAnalysis.jsx, "Position Documentation") is already
// conservative and accurate. These strings bring the marketing DOWN to what the
// product actually does, rather than the reverse.
//
// ⚠ Do NOT reintroduce "IRS Notice-Response Templates" anywhere.
export const FEATURE_POSITION_DOCS =
  'Tax Position Documentation Package — assembles your figures, assumptions, and supporting schedules for your CPA or Enrolled Agent'

export const FEATURE_POSITION_DOCS_SHORT =
  'Tax Position Documentation Package'

// Rendered under the Enterprise tier card and beneath the comparison table.
export const POSITION_DOCS_LIMIT_NOTE =
  'TaxStat360 does not draft correspondence to the IRS, does not prepare responses to notices, and cannot represent you before the IRS. Only a person authorized under 31 C.F.R. §10.3 with a valid Form 2848 may represent you.'

// ─── B2 — "PERSONAL TAX RETURN" → "PERSONAL TAX LIABILITY ESTIMATE" ──────────
// Treas. Reg. §301.7216-1(b)(2)(i)(B) reaches a person "engaged in the business
// of providing auxiliary services in connection with the preparation of tax
// returns, including a person who develops software that is used to prepare or
// file a tax return."
//
// Every legal protection in the architecture — the §7216 non-applicability
// position, the Circular 230 non-practice position, and the footer disclaimer's
// "not a tax preparation or filing service" — rests on this NOT being return
// preparation. A paid feature named "Personal tax return" and a route at
// /tax-return assert the opposite. In an inquiry, the pricing page is exhibit one.
//
// The route moved to /personal-estimate (App.jsx keeps /tax-return as a
// permanent redirect so bookmarks and in-flight sessions never 404).
export const FEATURE_PERSONAL_ESTIMATE =
  'Personal tax liability estimate (W-2 + entity income)'

// In-app step label — was "Personal Return".
export const STEP_LABEL_PERSONAL_ESTIMATE = 'Personal Estimate'

// Route constants. Import these instead of hardcoding the path, so the next
// rename is one edit rather than nine.
export const ROUTE_PERSONAL_ESTIMATE = '/personal-estimate'
export const ROUTE_PERSONAL_ESTIMATE_LEGACY = '/tax-return'

// ─── B6 — META PIXEL ROUTE SCOPE ─────────────────────────────────────────────
// Privacy Policy §8 represents that the pixel "never runs inside the signed-in
// application." The loader in index.html had no path check, so once a visitor
// accepted cookies the pixel followed them into the app — making that sentence
// false. It also had nothing stopping it on /signup, which collects name and
// email: Meta's Automatic Advanced Matching scrapes form fields, hashes them,
// and transmits them with no developer code. That is the 2023 H&R Block /
// TaxAct / TaxSlayer fact pattern (§7216 criminal referrals; TaxAct settled
// related litigation for ~$23M).
//
// This is an ALLOWLIST, not a blocklist: a new route is excluded by default and
// has to be added here deliberately. Marketing pages only.
export const PIXEL_ALLOWED_PATHS = [
  '/',
  '/about',
  '/how-it-works',
  '/features',
  '/pricing',
  '/faq',
  '/contact',
  '/resources',
]

// /resources/:slug is allowed; every other prefix is not.
export const PIXEL_ALLOWED_PREFIXES = ['/resources/']

/**
 * True only for public marketing routes where the Meta pixel may run.
 * Deliberately excludes /signup, /login, /terms, /privacy, and every
 * authenticated route.
 *
 * @param {string} pathname window.location.pathname
 * @returns {boolean}
 */
export function isPixelAllowedPath(pathname) {
  if (typeof pathname !== 'string' || !pathname) return false
  const path = pathname.replace(/\/+$/, '') || '/'
  if (PIXEL_ALLOWED_PATHS.includes(path)) return true
  return PIXEL_ALLOWED_PREFIXES.some((p) => path.startsWith(p))
}

// ─── B4 (cont.) — THE EXPENSE-RATIO RISK FINDING ─────────────────────────────
// AUDIT (Sep 2026). The Audit Risk Scan's expense-ratio finding read:
//
//   "Expenses substantially exceeding gross receipts place the return in an IRS
//    examination profile for S-Corps and Schedule C filers. The IRS DIF scoring
//    system flags returns where expenses substantially exceed gross receipts in
//    the taxpayer's industry."
//
// Two problems, and the second is the serious one.
//
// First, the panel's own footer — three cards below — tells the user that these
// indicators "are not a prediction of audit selection or probability" and that
// "the IRS uses proprietary scoring and methods not publicly disclosed." The
// finding asserted exactly the knowledge the disclaimer denies having. A document
// that contradicts itself does not get the benefit of whichever half is favourable;
// a reader is entitled to rely on the specific claim over the general disclaimer.
//
// Second, and independently: DIF weightings are not public. Publication 556 tells
// taxpayers that a DIF score exists and rates "the potential for change, based on
// past IRS experience with similar returns" — it does not say what the formula
// looks at, and neither does anything else the Service publishes. So a statement
// that DIF flags a particular RATIO is either sourced from non-public tax
// administration information or it is invented. From an Enrolled Agent and former
// Revenue Agent, the first reading implicates IRC §6103 and the post-employment
// conduct rules; the second is a misleading representation under 31 C.F.R.
// §10.30(a)(1). There is no third reading, and no version of this sentence that is
// worth the exposure.
//
// The replacement below is strictly better for the user, which is the point: it
// drops the guess about how the return will be SELECTED and states the exposure
// that actually exists once a return is examined — the substantiation burden and
// the §183 limitation. Those are published, citable, and actionable.
//
// ⚠ Do NOT reintroduce DIF, UDIF, or any claim about what the IRS selects for
// examination. The CI guards in complianceCopy.test.js will fail the build.

export const EXPENSE_RATIO_TITLE_SUFFIX = 'Substantiation and §183 Exposure'

// The component prepends the taxpayer's own figures; this is the legal explanation.
export const EXPENSE_RATIO_DETAIL =
  'Deductions exceeding gross receipts are not improper in themselves — new businesses and capital-heavy years produce real losses. What the ratio does is put weight on substantiation. Under IRC §162 a deduction must be ordinary and necessary, and under IRC §6001 and Treas. Reg. §1.6001-1(a) you must keep records sufficient to establish it, with the burden of proof on the taxpayer. Travel, meals, gifts, and listed property carry the stricter rule of IRC §274(d), which requires the amount, time, place, and business purpose to be documented and does not permit estimation. Where an activity reports losses year after year, IRC §183 can limit deductions to the income the activity produces unless it is engaged in for profit; §183(d) presumes a profit motive where the activity is profitable in 3 of 5 consecutive tax years (2 of 7 for horse activities). This is an assessment of how thoroughly the position would need to be documented, not a prediction of examination — the IRS does not publish its return-selection criteria.'

export const EXPENSE_RATIO_ACTION =
  'Before filing: (1) Confirm every deduction is ordinary and necessary under IRC §162 and traceable to a business purpose. (2) Check that contemporaneous records exist for each category — the §274(d) categories (travel, meals, gifts, vehicles and other listed property) need amount, date, place, and business purpose, and cannot be reconstructed by estimate after the fact. (3) Review the largest categories individually against the books. (4) Confirm no personal expense was included, and that capital expenditures were capitalized under IRC §263(a) rather than deducted currently. (5) If the activity has reported losses in several consecutive years, work through the nine profit-motive factors in Treas. Reg. §1.183-2(b) with your CPA or Enrolled Agent before filing.'

// ─── M5 / M6 / M12 (second launch audit, Sep 2026) ───────────────────────────
//
// Three findings, one root cause: a single promise hand-written in three or four
// places, with at least one copy false. The same cause as B2/B3/B4 above, which is
// why the remedy is the same — one string here, imported everywhere, guarded in CI.

// ── M6 — WHERE CANCELLATION ACTUALLY LIVES ───────────────────────────────────
// The mandated renewal disclosure (constants.js renewalDisclosure) said "Cancel any
// time in Settings → Billing". Settings has no Billing section: the heading is
// SUBSCRIPTION and the control under it reads "Cancel subscription". Terms §4 already
// named the path correctly, so the product shipped three names for one route — and the
// wrong one sat inside the Cal. Bus. & Prof. Code §17602(a)(1) affirmative-consent
// disclosure, the one place a wrong path is not a typo but a defective disclosure.
//
// Verified against Settings.jsx: heading "Subscription" (:416), control
// "Cancel subscription" (:446, :462).
export const CANCEL_PATH = 'Settings → Subscription → Cancel subscription'

// ── M5 — WHAT ACCOUNT DELETION DOES ──────────────────────────────────────────
// Four documents carried three different deletion promises, two of them opposed:
//   Terms §10      "retained for 30 days before permanent deletion" + "after the
//                   30-day period we cannot recover it" — which implies that BEFORE
//                   30 days it CAN be recovered.
//   Settings modal "permanently deletes ... erases all ... This cannot be undone."
// Both describe the same action (DELETE /account). Both cannot be true.
//
// RESOLVED 11 Sep 2026 by reading the backend (TaxStat360-api, app/main.py). The
// wording below now states the actual behaviour rather than the earlier version that
// was drafted to be true under either implementation.
//
//   DELETE /account (:1821) -> _perform_account_deletion (:910), which:
//     1. tears down the Stripe customer/subscription,
//     2. hard-deletes every user record (_delete_all_user_records),
//     3. hard-deletes the user row (_delete_user_record),
//     4. writes an audit row: action, actor, target email, timestamp, IP, status.
//   The endpoint then clears the session cookie immediately (:1827).
//
// There is NO soft-delete flag, no deleted_at column, no retention window and no
// restore path anywhere in that file. So the Settings modal's "cannot be undone" was
// TRUE, and Terms §10's 30-day recovery window was FALSE — the opposite of the
// cautious guess a reader might have made.
//
// Deliberately NOT claimed here: anything about backups. Whether DynamoDB
// point-in-time recovery is enabled is an AWS configuration fact, not visible in the
// application code, and PITR can retain up to 35 days — so the earlier "residual
// copies, including backups, are purged within 30 days" is removed rather than left
// as an unverifiable promise. What IS disclosed is the audit row, because it is real,
// it contains the email address, and it survives the deletion by design.
//
// Privacy §5's "we process deletion requests within 30 days" (for emailed requests)
// and Settings' "respond within 45 days" (CCPA §1798.130(a)(2) statutory response
// window) are different clocks and remain correct.
export const ACCOUNT_DELETION_STATEMENT =
  'Deleting your account is immediate and permanent. We cancel your subscription and ' +
  'delete your saved tax records, entities and personal information from our systems ' +
  'straight away, and your session ends at once. There is no recovery window and no ' +
  'way for us to restore a deleted account. We keep one compliance record of the ' +
  'deletion itself — your email address, the date and time, and the originating IP. ' +
  // FRESH-EYES (11 Sep 2026): Terms §3 says a cancellation keeps access to the end of the
  // paid period; deletion ends it now. Two documented behaviours for "cancel" — say which
  // one this is, and point at the other.
  'Deleting cancels immediately, not at the end of your billing period: any time you have ' +
  'already paid for is forfeited and is not refunded. To keep access until your period ends, ' +
  'use ' + CANCEL_PATH + ' instead.'

export const ACCOUNT_DELETION_EXPORT_WARNING =
  'Export your data before deleting. Once it is gone we cannot get it back for you.'

// ── M12 — ENCRYPTION IN TRANSIT AND AT REST ──────────────────────────────────
// The first audit removed the marketing term "bank-level" from the Landing FAQ, citing
// In re Zoom Video Communications (FTC 2020), where "bank-level" claims that outran the
// implementation were charged as deceptive — but it pinned only that one string. The
// Privacy Policy still said "bank-level", and said TLS 1.3 where Landing and the
// index.html JSON-LD both say TLS 1.2+.
//
// "TLS 1.2+" is the version to standardise on, and not as a hedge: it is true whether
// the minimum negotiated version is 1.2 or 1.3, whereas a bare "TLS 1.3" is false the
// moment a 1.2 connection is accepted — which is the default on CloudFront's standard
// security policies. The weaker-sounding claim is the one that is certainly accurate.
export const ENCRYPTION_STATEMENT =
  'We encrypt your data with AES-256 at rest and TLS 1.2+ in transit. All accounting ' +
  'connections use read-only OAuth tokens.'

// ── FRESH-EYES P-3 — NO MODEL TRAINING ───────────────────────────────────────
// Terms §6 carried a specific, unusually strong promise: no training, no
// fine-tuning, no evaluation, ours or a third party's. The Privacy Policy's
// "How We Use Your Information" list meanwhile ended with "Improve our platform
// features and performance" — the generic bucket every policy uses to cover
// exactly the activity §6 had just ruled out. Nothing in the code contradicted
// §6; the exposure was that the two documents, read together, let a reader argue
// the broad clause swallowed the narrow one.
//
// The promise now lives here and is rendered in BOTH documents, so it cannot
// drift the way "bank-level" and "TLS 1.3" drifted (see M12 above). Keep it a
// single constant. If a feedback mechanism is ever added that forwards user
// content to a model provider, this sentence is the first thing to revisit —
// see the Anthropic caveat comment above Privacy §4.
// ── FRESH-EYES AI-4 — the audit-framing prohibition sent to Aria ─────────────
// M4 bans "audit risk", "red flag", "audit trigger" and "what the IRS looks for"
// from shipped copy, because they frame a tax position as an exercise in avoiding
// attention rather than in being defensible. That test scans .js/.jsx/.html with
// comments stripped — it cannot see model output, and the adversarial run caught
// Aria using "audit risk" twice in a single answer (prompt C1).
//
// The fix is a rule in Aria's grounding prompt, but the rule has to NAME the
// phrases to forbid them, and naming them inside Aria.jsx would trip M4 against
// that file. This module is offenders()' single exemption (SOURCE_OF_TRUTH in
// complianceCopy.test.js), and it exists for precisely this: the sanctioned home
// for a banned string that something legitimately needs to carry.
//
// Keep this here. Inlining it into Aria.jsx turns the guard red.
export const ARIA_NO_AUDIT_FRAMING_RULE =
  '10. Never frame a tax position in terms of audit risk, audit triggers, red ' +
  'flags, or what the IRS looks for, and never use those phrases. Reasonable ' +
  'compensation is about the value of the services actually performed, not about ' +
  'avoiding attention. If asked for the lowest defensible salary, or how to avoid ' +
  'notice, decline the framing and explain the actual standard.'

export const NO_MODEL_TRAINING_STATEMENT =
  'We do not use your financial data, tax figures, or AI assistant conversations ' +
  'to train, fine-tune, or evaluate any machine learning model, ours or a third ' +
  'party’s.'
