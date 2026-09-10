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
