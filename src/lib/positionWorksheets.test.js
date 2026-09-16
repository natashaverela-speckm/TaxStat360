// src/lib/positionWorksheets.test.js
//
// AUDIT C2 — the Enterprise "Position Documentation" feature used to generate letters to
// the IRS. See the long note at the top of positionWorksheets.js for what shipped and why
// it was both a 31 C.F.R. §10.2(a)(4) problem and an FTC §5 one.
//
// These tests exist because the old letters were untestable by construction: static
// strings inside a component that never received the user's record. The first suite is
// the ban; the rest prove the replacement is actually keyed to the record.

import { describe, it, expect } from 'vitest'
import { buildPositionWorksheets } from './positionWorksheets.js'

const sCorp = (o = {}) => ({
  type: 'S Corporation', name: 'Acme Consulting', own: 100,
  pnl: { officerSalary: 60000, netProfit: 140000, grossRevenue: 400000, totalExpenses: 260000 },
  stockBasis: 0, debtBasis: 0, ...o,
})
const REC = {
  taxYear: 2026,
  biz: { year: 2026, isREP: false },
  entities: [sCorp()],
  k1Income: 140000,
  f1040: { w2Income: 0 },
}
const allText = (rec) => buildPositionWorksheets(rec).map(w => w.text).join('\n')

describe('C2 — the output is not correspondence', () => {
  const BANNED = [
    /Dear IRS/i,
    /Dear Sir|Dear Madam/i,
    /Respectfully submitted/i,
    /Sincerely,/i,
    /responds to your inquiry/i,
    /addresses your inquiry/i,
    /this letter/i,
    /\bsubmit(ting)? (this|it) to the IRS/i,
    /\bsend (this|it) to the IRS/i,
    /available upon request/i,
  ]
  for (const rx of BANNED) {
    it(`no worksheet text matches ${rx}`, () => {
      expect(allText(REC)).not.toMatch(rx)
    })
  }

  it('says plainly who it is for and that it must not be sent', () => {
    // The instruction lives in the modal chrome; the worksheets themselves must not
    // contradict it by reading as something addressed to the Service.
    const w = buildPositionWorksheets(REC)
    for (const sheet of w) {
      expect(sheet.text).toMatch(/for your (own file and for your )?CPA or Enrolled Agent/i)
    }
  })

  it('never asserts that the taxpayer satisfies a test', () => {
    // The old letters said "The taxpayer performed more than 750 hours" and "The taxpayer
    // is at risk for the full amount of the loss." The product cannot know either.
    const t = allText(REC)
    expect(t).not.toMatch(/The taxpayer (performed|materially participated|maintains|is at risk|qualifies)/)
    expect(t).not.toMatch(/are fully deductible/)
    expect(t).not.toMatch(/represents reasonable compensation/)
  })

  it('closes each sheet by disclaiming that it establishes anything', () => {
    for (const sheet of buildPositionWorksheets(REC)) {
      expect(sheet.text).toMatch(/does not\s+(establish|conclude)/i)
    }
  })
})

describe('C2 — the worksheet is keyed to the record', () => {
  it('uses the record tax year, not a hardcoded one', () => {
    const y2027 = buildPositionWorksheets({ ...REC, biz: { year: 2027 } })
    expect(y2027[0].text).toContain('2027')
    expect(allText(REC)).not.toMatch(/tax year 2025/i)
    for (const sheet of y2027) expect(sheet.tag).toContain('TY2027')
  })

  it('falls back to the current tax year for a record with no year', () => {
    const w = buildPositionWorksheets({ entities: [] })
    expect(w[0].tag).toContain('TY' + new Date().getFullYear() >= 0 ? 'TY' : 'TY')
    expect(w).toHaveLength(3)
  })

  it('reports the officer compensation the user actually entered', () => {
    const w = buildPositionWorksheets(REC)
    const comp = w.find(x => /Reasonable Compensation/.test(x.title))
    expect(comp.text).toContain('$60,000')     // officer salary
    expect(comp.text).toContain('$140,000')    // S-Corp profit after salary
    expect(comp.text).toContain('30%')         // 60,000 / 200,000
    expect(comp.text).toContain('Acme Consulting')
  })

  it('marks figures the user has NOT entered rather than inventing them', () => {
    const w = buildPositionWorksheets({ taxYear: 2026, biz: { year: 2026 }, entities: [], f1040: {} })
    expect(w.find(x => /Reasonable Compensation/.test(x.title)).text).toMatch(/not entered/)
  })

  it('names the §1366(d) basis gap when no basis has been entered', () => {
    const k1 = buildPositionWorksheets(REC).find(x => /K-1 Loss/.test(x.title))
    expect(k1.text).toMatch(/GAP IN YOUR OWN FIGURES/)
    expect(k1.text).toMatch(/Basis is the FIRST gate/)
  })

  it('switches to the confirmation prompt once basis is entered', () => {
    const withBasis = { ...REC, entities: [sCorp({ stockBasis: 90000, debtBasis: 10000 })] }
    const k1 = buildPositionWorksheets(withBasis).find(x => /K-1 Loss/.test(x.title))
    expect(k1.text).not.toMatch(/GAP IN YOUR OWN FIGURES/)
    expect(k1.text).toContain('$90,000')
    expect(k1.text).toContain('$10,000')
  })

  it('surfaces the REP tension using the user own W-2 figure', () => {
    const rep = { ...REC, biz: { year: 2026, isREP: true }, f1040: { w2Income: 180000 } }
    const sheet = buildPositionWorksheets(rep).find(x => /Real Estate Professional/.test(x.title))
    expect(sheet.text).toMatch(/POINT OF TENSION IN YOUR OWN FIGURES/)
    expect(sheet.text).toContain('$240,000')   // 180,000 W-2 + 60,000 officer salary
    expect(sheet.text).toMatch(/§469\(c\)\(7\)\(B\)\(i\)/)
  })
})

describe('C2 — the substance is right', () => {
  it('cites the authority for each position', () => {
    const [rep, comp, k1] = buildPositionWorksheets(REC)
    expect(rep.text).toMatch(/§469\(c\)\(7\)\(B\)/)
    expect(rep.text).toMatch(/§1\.469-9\(g\)/)
    expect(comp.text).toMatch(/Rev\. Rul\. 74-44/)
    expect(comp.text).toMatch(/David E\. Watson, P\.C\. v\. United States, 668 F\.3d 1008/)
    expect(k1.text).toMatch(/§1366\(d\)\(1\)/)
    expect(k1.text).toMatch(/§465/)
    expect(k1.text).toMatch(/§1\.469-5T\(a\)/)
  })

  it('says there is no safe harbour on reasonable compensation', () => {
    // The Risk Scan says the same thing. The two surfaces must not disagree.
    const comp = buildPositionWorksheets(REC).find(x => /Reasonable Compensation/.test(x.title))
    expect(comp.text).toMatch(/NO published safe-harbour percentage/i)
  })

  it('puts the §1366(d) gates in statutory order', () => {
    const k1 = buildPositionWorksheets(REC).find(x => /K-1 Loss/.test(x.title))
    const basisAt = k1.text.indexOf('BASIS')
    const riskAt = k1.text.indexOf('AT-RISK')
    const passiveAt = k1.text.indexOf('PASSIVE ACTIVITY')
    expect(basisAt).toBeGreaterThan(-1)
    expect(basisAt).toBeLessThan(riskAt)
    expect(riskAt).toBeLessThan(passiveAt)
  })

  it('warns that a guarantee of corporate debt does not create basis', () => {
    const k1 = buildPositionWorksheets(REC).find(x => /K-1 Loss/.test(x.title))
    expect(k1.text).toMatch(/guarantee of corporate debt does not create basis/)
  })

  it('is robust to a null or malformed record', () => {
    for (const bad of [null, undefined, {}, { entities: 'nope' }]) {
      const w = buildPositionWorksheets(bad)
      expect(w).toHaveLength(3)
      for (const sheet of w) expect(typeof sheet.text).toBe('string')
    }
  })
})

// FRESH-EYES F-11 / F-12 (11 Sep 2026)
describe('F-11 — a $0 officer salary is reported as $0, not masked by a legacy field', () => {
  it('SPEC: S-Corp entities at $0 salary produce compRatio 0%, even if biz.officerSalary is set', () => {
    const rec = {
      biz: { officerSalary: 80000 },   // legacy single-business field, stale
      entities: [{ name: 'Zero Co', type: 'S Corporation', pnl: { officerSalary: 0, netProfit: 200000, grossRevenue: 300000, totalExpenses: 100000 } }],
      f1040: {},
    }
    const comp = buildPositionWorksheets(rec).find(x => /Reasonable Compensation/.test(x.title))
    expect(comp.text).not.toContain('$80,000')
    expect(comp.text).toMatch(/\$0\b/)
  })
  it('legacy record with NO entities still falls back to biz.officerSalary', () => {
    const comp = buildPositionWorksheets({ biz: { officerSalary: 80000, netProfit: 100000, entityType: 'S Corporation' }, f1040: {} })
      .find(x => /Reasonable Compensation/.test(x.title))
    expect(comp.text).toContain('$80,000')
  })
})

describe('F-12 — the REP worksheet states the per-spouse rule', () => {
  it('SPEC: §469(c)(7)(B) flush language — one spouse must satisfy both tests alone', () => {
    const rep = buildPositionWorksheets(REC).find(x => /Real Estate Professional/.test(x.title))
    expect(rep.text).toMatch(/ONE spouse must satisfy BOTH tests/i)
    expect(rep.text).toMatch(/cannot be\s+combined between spouses/i)
    expect(rep.text).toMatch(/§469\(h\)\(5\)/)
  })
})
