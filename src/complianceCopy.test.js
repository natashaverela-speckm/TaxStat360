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
} from './lib/complianceCopy.js'

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
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

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
