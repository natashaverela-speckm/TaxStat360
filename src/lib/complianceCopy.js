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
