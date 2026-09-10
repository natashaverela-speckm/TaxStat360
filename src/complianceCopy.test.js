// src/complianceCopy.test.js
//
// AUDIT BLOCKERS B2 / B3 / B4 / B7 (Sep 2026) — CI-enforced copy invariants.
//
// These are not style checks. Each phrase below was removed for a cited reason,
// and each is the kind of line that gets re-added six months later by someone
// writing "better" marketing copy who has never read Circular 230. A grep in a
// PDF protects nothing; this file fails the build.
//
// If a test here fails, do NOT delete the assertion. Read the citation in
// src/lib/complianceCopy.js first, then decide.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  NON_ENDORSEMENT,
  FEATURE_PERSONAL_ESTIMATE,
  FEATURE_POSITION_DOCS,
  FEATURE_POSITION_DOCS_SHORT,
  POSITION_DOCS_LIMIT_NOTE,
  ROUTE_PERSONAL_ESTIMATE,
  EXPENSE_RATIO_DETAIL,
  EXPENSE_RATIO_ACTION,
} from './lib/complianceCopy.js'
// B5 — the clickwrap label copy and the recorded document versions live in
// constants.js, next to renewalDisclosure(), because they are consumer-facing
// legal copy and must never be hand-written at a call site.
import {
  TERMS_VERSION,
  PRIVACY_VERSION,
  LEGAL_CONSENT_PREFIX,
  LEGAL_CONSENT_SUFFIX,
} from './lib/constants.js'

const SRC = join(__dirname)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { walk(p, out); continue }
    if (!/\.(js|jsx)$/.test(name)) continue
    if (/\.test\.(js|jsx)$/.test(name)) continue
    out.push(p)
  }
  return out
}

const files = walk(SRC)
const rel = (p) => p.slice(SRC.length + 1)
const read = (p) => readFileSync(p, 'utf8')

// Strip comments — this file's own citations name the banned phrases, and so do
// the explanatory comments left at each fix site. Only shipped copy is checked.
//
// ⚠ ORDER MATTERS — line comments are stripped FIRST. Found Sep 2026 while adding
// the B5 guards below, and it had been silently defeating this whole file.
//
// A `//` line may legitimately contain the characters `/*`. Onboarding.jsx line 11
// reads: "restrict key to taxstat360.com/* in GCP." With block comments stripped
// first, that stray `/*` opened a comment that ran to the next real `*/` — 316
// lines later, inside a catch block — deleting 18,752 characters of SHIPPED CODE
// before any assertion ever saw it. That deleted region was the entire signup
// flow: the plan selector, the auto-renewal disclosure, the consent boxes and the
// registration call. In other words, the one file where a compliance regression
// would matter most was the file these guards could not see. App.jsx line 471
// ("/onboarding/*") had the same hole.
//
// Stripping line comments first removes the stray `/*` along with its line, and a
// `//` sitting inside a genuine block comment is removed harmlessly because the
// block goes next anyway. The `[^:]` guard keeps `https://` inside string
// literals intact. There is a self-test for this immediately below.
const stripComments = (code) =>
  code
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')

// complianceCopy.js is the sanctioned home for the replacement strings.
const SOURCE_OF_TRUTH = 'lib/complianceCopy.js'

function offenders(pattern) {
  const hits = []
  for (const f of files) {
    if (rel(f) === SOURCE_OF_TRUTH) continue
    if (pattern.test(stripComments(read(f)))) hits.push(rel(f))
  }
  return hits
}

// A guard on the guard. If stripComments() over-matches, every assertion in this
// file starts passing for the wrong reason — silently, and exactly when it matters.
describe('stripComments — the guard that protects the guards', () => {
  it('does not swallow code after a `/*` that appears inside a line comment', () => {
    const sample = [
      '// restrict key to example.com/* in GCP.',
      'const KEEP_ME = 1',
      '/* a real block comment */',
      'const ALSO_KEEP_ME = 2',
    ].join('\n')
    const out = stripComments(sample)
    expect(out).toMatch(/KEEP_ME/)
    expect(out).toMatch(/ALSO_KEEP_ME/)
    expect(out).not.toMatch(/a real block comment/)
  })

  it('leaves URLs in string literals alone', () => {
    expect(stripComments("const u = 'https://app.taxstat360.com'")).toMatch(/app\.taxstat360\.com/)
  })

  it('never deletes a top-level declaration from any scanned file', () => {
    // A byte-ratio floor is the wrong instrument here — this codebase is heavily
    // annotated and constants.js is legitimately ~80% comment. What actually
    // characterises the bug is CODE disappearing, so assert on code directly:
    // every top-level declaration in the raw file must survive the strip. That is
    // exactly what failed before — `const [termsOk...` and the /auth/register call
    // vanished while the file still looked plausibly sized.
    const declRe = /^export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)|^(?:const|function|class)\s+([A-Za-z_$][\w$]*)/gm
    for (const f of files) {
      const raw = read(f)
      const stripped = stripComments(raw)
      let m
      declRe.lastIndex = 0
      while ((m = declRe.exec(raw))) {
        const name = m[1] || m[2]
        expect.soft(stripped, `${rel(f)}: stripComments() deleted declaration "${name}"`)
          .toContain(name)
      }
    }
  })
})

describe('B4 — no claims to non-public IRS audit-selection knowledge', () => {
  // 31 C.F.R. §10.30(a)(1) (misleading claims; no implied IRS relationship) and
  // 31 U.S.C. §333 (no implied IRS endorsement). Audit selection methodology —
  // DIF/UDIF scoring, campaign criteria — is not public. An EA and former Revenue
  // Agent asserting she knows it is either a disclosure problem or a false claim.
  const BANNED = [
    /what triggers audits/i,
    /triggers an audit/i,
    /how returns are selected for audit/i,
    /selected for audit/i,
    /how returns are scrutinized/i,
    /what examiners look for/i,
    /where the real exposure sits/i,
    /spent years inside the IRS/i,
    // Added Sep 2026 after the Audit Risk Scan was found asserting that the DIF
    // system flags a particular expense-to-receipts ratio — three cards above its
    // own disclaimer that IRS scoring methods "are not publicly disclosed."
    // Publication 556 confirms a DIF score EXISTS; nothing published says what it
    // weighs. Claiming to know is either §6103 information or invention.
    /DIF scor/i,
    /\bUDIF\b/,
    /discriminant (inventory )?function/i,
    /examination profile/i,
    /flags returns where/i,
    /the IRS (targets|selects|flags) returns/i,
  ]
  for (const rx of BANNED) {
    it(`no shipped copy matches ${rx}`, () => {
      expect(offenders(rx)).toEqual([])
    })
  }
})

describe('B3 — the credential describes provenance, not authorship of advice', () => {
  // Terms §2 states the platform is "NOT a licensed tax advisor, CPA, enrolled
  // agent, or law firm." Marketing that says the founder's judgment IS the output
  // contradicts that, and under the FTC net-impression standard (Removatron, 884
  // F.2d 1489) a disclaimer cannot cure a contradictory claim.
  const BANNED = [
    /encoded into every calculation/i,
    /built directly into the product/i,
    /built into every calculation/i,
    /one person's career/i,
    /one person’s career/i,
  ]
  for (const rx of BANNED) {
    it(`no shipped copy matches ${rx}`, () => {
      expect(offenders(rx)).toEqual([])
    })
  }
})

describe('B7 — no IRS notice-response drafting is advertised', () => {
  // 31 C.F.R. §10.2(a)(4): "corresponding and communicating with the Internal
  // Revenue Service on behalf of a taxpayer" is practice before the IRS.
  it('the phrase "Notice-Response Templates" appears nowhere', () => {
    expect(offenders(/notice[-\s]?response/i)).toEqual([])
  })

  it('the Enterprise tier advertises the documentation package instead', () => {
    const landing = read(join(SRC, 'components/Landing.jsx'))
    expect(landing).toContain('FEATURE_POSITION_DOCS')
    expect(FEATURE_POSITION_DOCS).toMatch(/Tax Position Documentation Package/)
  })

  it('the limit is stated on the pricing page, not only in the Terms', () => {
    const landing = read(join(SRC, 'components/Landing.jsx'))
    expect(landing).toContain('POSITION_DOCS_LIMIT_NOTE')
    expect(POSITION_DOCS_LIMIT_NOTE).toMatch(/does not draft correspondence to the IRS/)
    expect(POSITION_DOCS_LIMIT_NOTE).toMatch(/cannot represent you before the IRS/)
    expect(POSITION_DOCS_LIMIT_NOTE).toMatch(/2848/)
  })

  it('the tier card and the comparison table use the same label', () => {
    expect(FEATURE_POSITION_DOCS.startsWith(FEATURE_POSITION_DOCS_SHORT)).toBe(true)
  })
})

describe('B2 — the product estimates liability; it does not prepare returns', () => {
  // Treas. Reg. §301.7216-1(b)(2)(i)(B). The footer disclaimer's "not a tax
  // preparation or filing service" is contradicted by a feature named "Personal
  // tax return" sold on every tier, and by the route it lived at.
  it('no shipped copy sells a "Personal tax return" feature', () => {
    expect(offenders(/Personal tax return \(W-2/i)).toEqual([])
  })

  it('the canonical route is /personal-estimate', () => {
    expect(ROUTE_PERSONAL_ESTIMATE).toBe('/personal-estimate')
    const app = read(join(SRC, 'components/App.jsx'))
    expect(app).toMatch(/path="\/personal-estimate"/)
    expect(app).toMatch(/'\/personal-estimate':\s*'Personal Tax Estimate \| TaxStat360'/)
  })

  it('/tax-return still resolves — as a redirect, never as a live route', () => {
    const app = read(join(SRC, 'components/App.jsx'))
    // Bookmarks and in-flight sessions must not 404 ...
    expect(app).toMatch(/path="\/tax-return"\s+element=\{<Navigate to="\/personal-estimate" replace \/>\}/)
    // ... but nothing may render the page at the old path.
    expect(app).not.toMatch(/path="\/tax-return"\s+element=\{<AuthedWithTour>/)
  })

  it('nothing navigates to the legacy path directly', () => {
    expect(offenders(/navigate\(\s*'\/tax-return'/)).toEqual([])
  })

  it('the tier label is identical in Landing and Upgrade', () => {
    const landing = read(join(SRC, 'components/Landing.jsx'))
    const upgrade = read(join(SRC, 'components/Upgrade.jsx'))
    expect(landing).toContain('FEATURE_PERSONAL_ESTIMATE')
    expect(upgrade).toContain('FEATURE_PERSONAL_ESTIMATE')
    expect(FEATURE_PERSONAL_ESTIMATE).toMatch(/estimate/i)
    expect(FEATURE_PERSONAL_ESTIMATE).not.toMatch(/tax return/i)
  })
})

describe('B4 — the IRS non-endorsement statement ships on every page', () => {
  it('the shared Footer renders it', () => {
    const footer = read(join(SRC, 'components/Footer.jsx'))
    expect(footer).toContain('NON_ENDORSEMENT')
  })

  it('it disclaims affiliation, endorsement, and approval', () => {
    expect(NON_ENDORSEMENT).toMatch(/not affiliated with, endorsed by, or approved by/i)
    expect(NON_ENDORSEMENT).toMatch(/Internal Revenue Service/)
    expect(NON_ENDORSEMENT).toMatch(/Department of the Treasury/)
  })

  it('it uses the §10.30(a)(1)-sanctioned description of an enrolled agent', () => {
    // "enrolled to practice before the Internal Revenue Service" is one of the
    // three descriptions Circular 230 expressly permits. Keep it verbatim.
    expect(NON_ENDORSEMENT).toMatch(/enrolled to practice before the Internal Revenue Service/)
  })

  it('no page reintroduces its own inline footer that would skip it', () => {
    // The Footer consolidation is what guarantees site-wide coverage.
    expect(offenders(/<footer[\s>]/)).toEqual(['components/Footer.jsx'])
  })
})

// ─── AUDIT HIGH FINDINGS — BATCH A (Sep 2026) ────────────────────────────────
// Same rationale as the blocker guards above: these phrases were removed for cited
// reasons and are exactly the kind of line that comes back in the next copy pass.

describe('H6 — the product is on-demand, not real-time', () => {
  // The FAQ states plainly: "Your numbers reflect the data from your last sync."
  // Marketing that says "every single day" / "real-time" / "updated as your income
  // and expenses change" describes continuous auto-sync, which does not exist.
  // Under the FTC net-impression standard a truthful disclosure buried in a
  // collapsed accordion does not cure a contradicting headline.
  it('no shipped copy claims the estimate updates every single day', () => {
    expect(offenders(/every single day/i)).toEqual([])
  })

  it('no shipped copy calls the platform real-time', () => {
    expect(offenders(/real-time|realtime/i)).toEqual([])
  })

  it('the FAQ still discloses that figures reflect the last sync', () => {
    const landing = read(join(SRC, 'components/Landing.jsx'))
    expect(landing).toMatch(/reflect the data from your last sync/i)
  })
})

describe('H7 — no social proof from a product without customers', () => {
  // FTC Act §5 + the 1984 Substantiation Policy Statement: a reasonable basis must
  // exist WHEN THE CLAIM IS MADE. "Join business owners who [achieve Y]" asserts a
  // body of existing users obtaining that result. Fla. Stat. §501.204(2) imports the
  // §5 standard into FDUTPA, and §501.2105 fee-shifts — so this is a private claim.
  it('the CTA does not imply an existing customer base', () => {
    expect(offenders(/Join business owners who/i)).toEqual([])
  })

  it('no unsubstantiated efficacy claim that the product lowers tax', () => {
    // The product calculates; it does not reduce anything, and it is federal-only.
    expect(offenders(/keep more of what they earn/i)).toEqual([])
  })
})

describe('H8 — security is described honestly, not guaranteed', () => {
  // Cf. In re Zoom Video Communications (FTC 2020): "bank-level" / encryption claims
  // that outran the implementation were charged as deceptive. "Absolutely" is an
  // unqualified guarantee no system supports.
  it('the security FAQ does not open with an absolute guarantee', () => {
    const landing = read(join(SRC, 'components/Landing.jsx'))
    const faq = landing.slice(landing.indexOf('Is my financial data secure?'))
    expect(faq.slice(0, 400)).not.toMatch(/a: 'Absolutely\./)
  })

  it('the security answer states what is actually deployed', () => {
    const landing = read(join(SRC, 'components/Landing.jsx'))
    expect(landing).toMatch(/AES-256 at rest and TLS 1\.2\+ in transit/)
    expect(landing).toMatch(/No system can guarantee absolute security/)
  })

  it('the FAQPage JSON-LD mirrors the on-page answer', () => {
    // A stale structured-data copy republishes the claim to search engines and
    // creates a rich-result mismatch. These two must move together.
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8')
    expect(html).not.toMatch(/"text": "Absolutely\./)
    expect(html).toMatch(/No system can guarantee absolute security/)
  })
})

describe('H10 — the device export is not presented as a CCPA response', () => {
  // exportAllDeviceData() reads localStorage only. A right of access under CCPA
  // reaches what the BUSINESS holds server-side, so offering a browser dump as the
  // statutory response is itself a compliance problem.
  it('Settings does not describe the local export as a CCPA request', () => {
    const s = read(join(SRC, 'components/Settings.jsx'))
    const block = s.slice(s.indexOf('handleDataExport'))
    expect(s).not.toMatch(/You can request this at any time under CCPA/)
    expect(block).toBeTruthy()
  })

  it('Settings points to a real channel for access and deletion requests', () => {
    const s = read(join(SRC, 'components/Settings.jsx'))
    expect(s).toMatch(/support@taxstat360\.com\?subject=Privacy%20request/)
    expect(s).toMatch(/respond within 45 days/)
  })
})

// ─── AUDIT H9 / H11 (Sep 2026) ───────────────────────────────────────────────
describe('H9 — cancellation is findable, online, and unobstructed', () => {
  // ROSCA 15 U.S.C. §8403(3) requires "simple mechanisms" to stop recurring
  // charges. Cal. Bus. & Prof. Code §17602(c) requires that a consumer who
  // enrolled online can cancel online, in the same medium, without steps that
  // obstruct or delay. Settings promised "Cancel anytime" and offered only
  // "Upgrade Plan" and "Manage Billing" — a path the user cannot find is
  // obstruction in practice.
  it('Settings renders a control that says cancel', () => {
    const s = read(join(SRC, 'components/Settings.jsx'))
    expect(s).toMatch(/Cancel subscription/)
    expect(s).toMatch(/openBillingPortal/)
  })

  it('the cancel path carries no retention interstitial', () => {
    // A "wait, here's 50% off" screen the user must dismiss is the paradigm
    // case §17602(c) targets. If one is ever added, this fails.
    const s = stripComments(read(join(SRC, 'components/Settings.jsx')))
    const block = s.slice(s.indexOf('Cancel subscription')).slice(0, 2000)
    // Our own copy promises "without being routed through a retention offer",
    // so match only an OFFER being made, not the sentence disclaiming one.
    expect(block).not.toMatch(/\b(?:\d+%\s*off|special offer|before you go|stay with us|are you sure)\b/i)
    expect(block).toMatch(/no phone call and no retention offer/i)
  })

  it('the portal URL has ONE definition', () => {
    // It was duplicated in Settings.jsx and Upgrade.jsx, and it is the only
    // cancellation path the product has.
    // constants.js is the sanctioned home; nowhere else may hardcode it.
    expect(offenders(/https:\/\/billing\.stripe\.com\/p\/login\//).filter(f => f !== 'lib/constants.js')).toEqual([])
    const c = readFileSync(join(SRC, 'lib/constants.js'), 'utf8')
    expect(c).toMatch(/export const STRIPE_PORTAL_URL/)
  })

  it('the copy tells the user about the emailed sign-in code', () => {
    // A surprise step reads as a dark pattern even when it is just Stripe.
    const s = read(join(SRC, 'components/Settings.jsx'))
    expect(s).toMatch(/one-time sign-in\s*\n?\s*code/)
  })
})

describe('H11 — the Terms carry the clauses a consumer agreement needs', () => {
  // Comments stripped: the section below quotes the removed wording in order to
  // explain why it was removed, exactly as the blocker guards above do.
  const terms = () => stripComments(read(join(SRC, 'components/Terms.jsx')))

  it('has an express class action waiver', () => {
    // Stolt-Nielsen v. AnimalFeeds, 559 U.S. 662 (2010): silence probably does
    // not authorize class arbitration — but an auto-renewing consumer
    // subscription is the most class-attractive structure there is.
    const t = terms()
    expect(t).toMatch(/Class action waiver/i)
    expect(t).toMatch(/not as a plaintiff or class member/i)
  })

  it('designates AAA CONSUMER rules, not Commercial', () => {
    const t = terms()
    expect(t).toMatch(/Consumer Arbitration Rules/)
    expect(t).not.toMatch(/Commercial Arbitration Rules/)
  })

  it('gives the consumer an opt-out, small claims, and a nearby forum', () => {
    const t = terms()
    expect(t).toMatch(/within 30 days of first accepting these Terms/i)
    expect(t).toMatch(/small-claims court/i)
    expect(t).toMatch(/never required to travel to Florida/i)
  })

  it('disclaims merchantability by name (Fla. Stat. §672.316(2))', () => {
    // The exclusion must MENTION merchantability and be conspicuous, or the
    // implied warranty is not excluded at all.
    const t = terms()
    expect(t).toMatch(/merchantability/i)
    expect(t).toMatch(/fitness for a particular purpose/i)
    expect(t).toMatch(/non-infringement/i)
  })

  it('has indemnification in both directions', () => {
    const t = terms()
    expect(t).toMatch(/indemnify, and hold harmless TaxStat360/i)
    expect(t).toMatch(/hold you harmless/i)
  })

  it('has a survival clause naming the sections that must outlive termination', () => {
    // Tax harm is latent; without this the cap and disclaimers arguably die
    // with the account.
    expect(terms()).toMatch(/survive any termination or expiration/i)
  })

  it('caps liability from the EVENT, not from the claim, with a floor', () => {
    const t = terms()
    expect(t).toMatch(/preceding the event giving rise to the claim/i)
    expect(t).toMatch(/one hundred United States dollars/i)
    expect(t).toMatch(/failed of its essential purpose/i)
  })

  it('permits amendment, and does not let silence change renewal terms', () => {
    const t = terms()
    expect(t).toMatch(/30 days.{0,20}notice/i)
    expect(t).toMatch(/requires your affirmative consent/i)
  })

  it('has severability, entire agreement, and E-SIGN consent', () => {
    const t = terms()
    expect(t).toMatch(/Severability/i)
    expect(t).toMatch(/Entire agreement/i)
    expect(t).toMatch(/E-SIGN Act, 15 U\.S\.C\. §7001\(c\)/)
  })

  it('no longer claims the signup page shows the charge before the card field', () => {
    // AUDIT B5: that was a factual claim about our own flow. Until the signup
    // consent block ships, the Terms must not assert it — otherwise the contract
    // carries the violation and supplies evidence of it.
    expect(terms()).not.toMatch(/shown on the signup page before you enter\s*\n?\s*any payment information/)
  })

  it('surfaces the arbitration provision at the top, not only in section 11', () => {
    const t = terms()
    const head = t.slice(0, t.indexOf('1. Description of Service'))
    expect(head).toMatch(/individual arbitration/i)
    expect(head).toMatch(/opt out/i)
  })
})

// ─── B5 — CLICKWRAP ASSENT AT SIGNUP ─────────────────────────────────────────
// The signup page used to show the Terms and Privacy links as a passive sentence
// above the submit button. Against a consumer that is browsewrap, and browsewrap
// is the form courts decline to enforce (Nguyen v. Barnes & Noble, 763 F.3d 1171
// (9th Cir. 2014)). Every protective clause in the rewritten Terms — arbitration,
// class action waiver, warranty disclaimer, liability cap, indemnity — is only
// worth what the assent record is worth.
//
// These tests read the Onboarding source rather than rendering it, for the same
// reason the copy guards above do: the failure mode being defended against is
// someone quietly deleting the checkbox to lift trial conversion, and a source
// assertion catches that even if the component is refactored past the point where
// a render test still finds the element.
describe('B5 — signup requires affirmative assent to the Terms', () => {
  const onboarding = () => stripComments(read(join(SRC, 'components/Onboarding.jsx')))

  it('has a Terms consent checkbox that starts unchecked', () => {
    const o = onboarding()
    expect(o).toMatch(/const \[termsOk,\s*setTermsOk\]\s*=\s*useState\(false\)/)
    expect(o).toMatch(/id="signup-terms-consent"/)
    expect(o).toMatch(/type="checkbox"[\s\S]{0,120}checked=\{termsOk\}/)
  })

  it('never pre-checks either consent box', () => {
    // A pre-ticked box is not assent — it is the defect Cal. Bus. & Prof. Code
    // §17602 and the FTC negative-option rule exist to stop.
    const o = onboarding()
    expect(o).toMatch(/useState\(false\)[\s\S]{0,400}const \[termsOk/)
    expect(o).not.toMatch(/useState\(true\)[\s\S]{0,40}(renewOk|termsOk)/)
    expect(o).not.toMatch(/checked=\{true\}/)
  })

  it('gates the submit button on BOTH consents', () => {
    const o = onboarding()
    expect(o).toMatch(/disabled=\{loading\|\|!renewOk\|\|!termsOk\}/)
  })

  it('re-checks both consents inside submit(), not only via the disabled attribute', () => {
    // `disabled` is a UI affordance, not a control. The account must not be
    // creatable by removing an attribute in devtools.
    const o = onboarding()
    const body = o.slice(o.indexOf('async function submit'), o.indexOf('/auth/register'))
    expect(body).toMatch(/if\(!renewOk\)\{setErr\(/)
    expect(body).toMatch(/if\(!termsOk\)\{setErr\(/)
  })

  it('keeps the auto-renewal consent separate from the Terms consent', () => {
    // §17602(a)(1) wants consent to the RENEWAL terms specifically. One merged
    // "I agree to everything" box would re-create the defect.
    const o = onboarding()
    expect(o).toMatch(/checked=\{renewOk\}/)
    expect(o).toMatch(/checked=\{termsOk\}/)
    expect(o).not.toMatch(/checked=\{renewOk\s*&&\s*termsOk\}/)
    expect(o).not.toMatch(/setRenewOk\(e\.target\.checked\)[\s\S]{0,80}setTermsOk\(e\.target\.checked\)/)
  })

  it('no longer relies on the passive browsewrap sentence', () => {
    expect(onboarding()).not.toMatch(/By creating an account you agree to our/)
  })

  it('links both documents from inside the consent label', () => {
    const o = onboarding()
    const label = o.slice(o.indexOf('signup-terms-consent'), o.indexOf('type="submit"'))
    expect(label).toMatch(/href="\/terms"/)
    expect(label).toMatch(/href="\/privacy"/)
  })

  it('calls out arbitration and the class action waiver in the consent label', () => {
    // Conspicuous notice is the other half of enforceable assent. A user told
    // plainly what they are agreeing to has a far weaker unconscionability
    // argument than one who had to find Section 11 on their own.
    expect(LEGAL_CONSENT_SUFFIX).toMatch(/binding arbitration/i)
    expect(LEGAL_CONSENT_SUFFIX).toMatch(/class action waiver/i)
    expect(LEGAL_CONSENT_PREFIX).toMatch(/read and agree/i)
  })

  it('records which documents were accepted, and when', () => {
    const o = onboarding()
    expect(o).toMatch(/terms_version:\s*TERMS_VERSION/)
    expect(o).toMatch(/privacy_version:\s*PRIVACY_VERSION/)
    expect(o).toMatch(/terms_accepted_at:\s*acceptedAt/)
    expect(o).toMatch(/const acceptedAt=new Date\(\)\.toISOString\(\)/)
  })

  it('pins the recorded versions to the dates the documents actually render', () => {
    // If these drift, the account record names a document the user never saw.
    const termsSrc = readFileSync(join(SRC, 'components/Terms.jsx'), 'utf8')
    const privacySrc = readFileSync(join(SRC, 'components/Privacy.jsx'), 'utf8')
    expect(TERMS_VERSION).toBe('2026-09-10')
    expect(termsSrc).toMatch(/Last updated: September 10, 2026/)
    expect(PRIVACY_VERSION).toBe('2026-07-13')
    expect(privacySrc).toMatch(/Last updated: July 13, 2026/)
  })

  it('makes the agreements reachable from step 1, before any data is entered', () => {
    const o = onboarding()
    const stepOne = o.slice(o.indexOf('{step===1 &&'), o.indexOf('{step===2 &&'))
    expect(stepOne).toMatch(/href="\/terms"/)
    expect(stepOne).toMatch(/href="\/privacy"/)
  })

  it('tells the user which box is still empty', () => {
    // A greyed-out button with no explanation is indistinguishable from a broken
    // form, and this one sits at the end of a funnel that costs money to fill.
    const o = onboarding()
    expect(o).toMatch(/Tick both boxes above to continue/)
    expect(o).toMatch(/Tick the automatic renewal box above to continue/)
    expect(o).toMatch(/Tick the Terms of Service box above to continue/)
  })
})

// ─── B4 (cont.) — THE EXPENSE-RATIO FINDING ──────────────────────────────────
// The replacement copy has to do two things the old copy did not: stay inside
// published sources, and agree with the disclaimer rendered in the same panel.
describe('B4 — the expense-ratio finding cites published law, not audit selection', () => {
  const aiAnalysis = () => stripComments(read(join(SRC, 'components/AIAnalysis.jsx')))

  it('grounds the finding in the substantiation rules', () => {
    expect(EXPENSE_RATIO_DETAIL).toMatch(/IRC §162/)
    expect(EXPENSE_RATIO_DETAIL).toMatch(/IRC §6001/)
    expect(EXPENSE_RATIO_DETAIL).toMatch(/Treas\. Reg\. §1\.6001-1\(a\)/)
    expect(EXPENSE_RATIO_DETAIL).toMatch(/IRC §274\(d\)/)
  })

  it('explains the §183 limitation and its statutory presumption', () => {
    expect(EXPENSE_RATIO_DETAIL).toMatch(/IRC §183/)
    expect(EXPENSE_RATIO_DETAIL).toMatch(/3 of 5 consecutive tax years/)
    expect(EXPENSE_RATIO_DETAIL).toMatch(/2 of 7 for horse activities/)
  })

  it('says plainly that it is not predicting examination', () => {
    // This sentence is what reconciles the finding with the panel disclaimer.
    expect(EXPENSE_RATIO_DETAIL).toMatch(/not a prediction of examination/i)
    expect(EXPENSE_RATIO_DETAIL).toMatch(/does not publish its return-selection criteria/i)
  })

  it('does not claim a loss is improper in itself', () => {
    // A real business can and does run at a loss. Saying otherwise would be both
    // wrong and alarming to exactly the early-stage owner this product serves.
    expect(EXPENSE_RATIO_DETAIL).toMatch(/not improper in themselves/i)
  })

  it('gives an action list that is actually actionable', () => {
    expect(EXPENSE_RATIO_ACTION).toMatch(/§263\(a\)/)
    expect(EXPENSE_RATIO_ACTION).toMatch(/Treas\. Reg\. §1\.183-2\(b\)/)
    expect(EXPENSE_RATIO_ACTION).toMatch(/cannot be reconstructed by estimate/i)
  })

  it('the component renders the sanctioned copy instead of its own', () => {
    const a = aiAnalysis()
    expect(a).toMatch(/EXPENSE_RATIO_TITLE_SUFFIX/)
    expect(a).toMatch(/\$\{EXPENSE_RATIO_DETAIL\}/)
    expect(a).toMatch(/action: EXPENSE_RATIO_ACTION/)
  })

  it('the old assertions are gone from shipped copy', () => {
    const a = aiAnalysis()
    expect(a).not.toMatch(/DIF scoring system/)
    expect(a).not.toMatch(/place the return in an IRS examination profile/)
    expect(a).not.toMatch(/Common IRS Scrutiny Pattern/)
  })

  it('the panel disclaimer that the finding must agree with is still rendered', () => {
    const a = aiAnalysis()
    expect(a).toMatch(/not a prediction of audit selection or probability/i)
    expect(a).toMatch(/proprietary scoring and methods not publicly disclosed/i)
  })
})

// ─── SYNCED P&L — A FAILED SYNC MUST NOT LOOK LIKE A SUCCESSFUL ONE ──────────
// The behaviour itself is covered by lib/integrationPnL.test.js, which exercises
// the real decision function. What is guarded HERE is the wiring: that the
// component still delegates to it and has not drifted back to deciding success
// from the response body. That drift is what produced the original defect.
describe('integration sync — the component delegates to the tested interpreter', () => {
  const calc = () => stripComments(read(join(SRC, 'components/CalculateTaxInner.jsx')))
  const syncFn = () => {
    const c = calc()
    const start = c.indexOf('async function fetchEntityPnL')
    return c.slice(start, c.indexOf('const handleManualSync', start))
  }

  it('passes the HTTP status to the interpreter, not just the body', () => {
    const s = syncFn()
    expect(s).toMatch(/const res = await apiFetch\(url, \{ raw: true \}\)/)
    expect(s).toMatch(/ok: res\.ok, status: res\.status, body/)
  })

  it('no longer decides success from the body alone', () => {
    // `if (d && !d.error)` is the exact test that let a FastAPI {detail} error
    // through as a P&L. It must never come back.
    const s = syncFn()
    expect(s).not.toMatch(/if \(d && !d\.error\)/)
    expect(s).not.toMatch(/\.then\(r => r\.json\(\)\)/)
  })

  it('leaves the user figures untouched and stamps no syncedAt on failure', () => {
    const s = syncFn()
    const failure = s.slice(s.indexOf("verdict.kind === 'error'"), s.indexOf('const pnl ='))
    expect(failure).toMatch(/writeIntegrationField\(pid, 'failed', 'true'\)/)
    expect(failure).toMatch(/return/)
    expect(failure).not.toMatch(/syncedAt/)
  })

  it('takes the P&L from the interpreter rather than rebuilding it inline', () => {
    const s = syncFn()
    expect(s).toMatch(/const pnl = verdict\.pnl/)
    expect(s).not.toMatch(/grossRevenue:\s*d\.revenue/)
  })

  it('surfaces the interpreter warning without blocking the sync', () => {
    const s = syncFn()
    expect(s).toMatch(/if \(verdict\.warning\)/)
    const afterWarning = s.slice(s.indexOf('verdict.warning'))
    expect(afterWarning).toMatch(/const pnl = verdict\.pnl/)
  })
})
