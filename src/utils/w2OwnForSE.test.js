// FIFTH READ F-3 (external calc audit, 15 Sep 2026) — SPEC tests for the MFJ Schedule SE
// wage-base attribution default. See utils/w2OwnForSE.js for the rule and the live repro.

import { describe, it, expect } from 'vitest'
import { resolveW2OwnForSE, officerW2Total } from './w2OwnForSE.js'
import { calcTaxReturn } from '../lib/taxCalc.js'

const scorp = (k1, officerW2) => ({
  type: 'S Corporation', k1, own: 100, officerW2, pnl: { officerSalary: officerW2, netProfit: k1 },
})
const schedC = (net) => ({ type: 'Sole Proprietor / SMLLC', k1: net, own: 100, netProfit: net })

describe('resolveW2OwnForSE', () => {
  it('non-MFJ statuses always resolve to 0 (the engine ignores the field)', () => {
    for (const status of ['single', 'hoh', 'mfs', 'qss']) {
      expect(resolveW2OwnForSE({ status, entered: '', officerW2: 100000 })).toBe(0)
      expect(resolveW2OwnForSE({ status, entered: 50000, officerW2: 100000 })).toBe(0)
    }
  })
  it('MFJ, blank entry ⇒ the owner\'s own Step-1 officer salary', () => {
    expect(resolveW2OwnForSE({ status: 'mfj', entered: '', officerW2: 100000 })).toBe(100000)
    expect(resolveW2OwnForSE({ status: 'mfj', entered: 0, officerW2: 100000 })).toBe(100000)
    expect(resolveW2OwnForSE({ status: 'MFJ', entered: undefined, officerW2: 100000 })).toBe(100000)
  })
  it('MFJ, typed amount always wins (including a smaller one — the spouse owns the S-Corp case)', () => {
    expect(resolveW2OwnForSE({ status: 'mfj', entered: '40,000', officerW2: 100000 })).toBe(40000)
    expect(resolveW2OwnForSE({ status: 'mfj', entered: 250000, officerW2: 100000 })).toBe(250000)
  })
  it('MFJ, blank entry and no officer salary ⇒ 0 (prior conservative behavior)', () => {
    expect(resolveW2OwnForSE({ status: 'mfj', entered: '', officerW2: 0 })).toBe(0)
  })
  it('officerW2Total sums S-Corp / C-Corp officer salary only', () => {
    expect(officerW2Total([scorp(50000, 80000), { type: 'C Corporation', officerW2: 20000 }, schedC(30000), null])).toBe(100000)
    expect(officerW2Total([])).toBe(0)
    expect(officerW2Total(undefined)).toBe(0)
  })
})

describe('F-3 end-to-end — audit repro through the engine', () => {
  // 2026 · MFJ · S-Corp officer W-2 $100,000 + Schedule C $100,000.
  // Unattributed (old default): SE tax $14,130 (full $184,500 base). Attributed: $13,156.
  const entities = [scorp(192350, 100000), schedC(100000)]
  const run = (w2OwnForSE) => calcTaxReturn({
    taxYear: 2026, status: 'mfj', dependents: 0, w2Withheld: 0, estPaid: 0,
    entities, w2: 100000, k1Total: 192350 + 100000, w2OwnForSE,
  })
  it('with the resolved default, SE tax is coordinated on the $84,500 of remaining wage base', () => {
    const r = run(resolveW2OwnForSE({ status: 'mfj', entered: '', officerW2: officerW2Total(entities) }))
    expect(r.seWageBaseW2).toBe(100000)
    expect(r.ssWageBaseRoom).toBe(84500)
    expect(r.seTax).toBe(13156)
    expect(r.totalTax).toBe(69492)
  })
  it('the "SE tax savings vs. sole proprietorship" figure now matches the Single-filer figure for identical facts', () => {
    const mfj = run(resolveW2OwnForSE({ status: 'mfj', entered: '', officerW2: officerW2Total(entities) }))
    const single = calcTaxReturn({
      taxYear: 2026, status: 'single', entities, w2: 100000, k1Total: 192350 + 100000,
    })
    expect(mfj.ficaSavings).toBe(single.ficaSavings)
    expect(mfj.ficaSavings).toBe(15629)
  })
  it('CONTROL: the engine\'s own default (0) is unchanged — callers must resolve', () => {
    expect(run(0).seTax).toBe(14130)
  })
})

describe('OCT-4 ONCE-OVER L-2 (Oct 2026) — the spouse field changes the unattributed default', () => {
  it('SPEC: spouse wages entered ⇒ the owner\'s default attribution is officer salary + own other-employer W-2', () => {
    expect(resolveW2OwnForSE({ status: 'mfj', entered: '', officerW2: 100000, otherW2: 500000, spouseW2: 300000 })).toBe(600000)
    // No spouse figure ⇒ the legacy conservative default (officer salary only) is unchanged.
    expect(resolveW2OwnForSE({ status: 'mfj', entered: '', officerW2: 100000, otherW2: 500000, spouseW2: 0 })).toBe(100000)
    // A typed attribution still wins; non-MFJ is still 0.
    expect(resolveW2OwnForSE({ status: 'mfj', entered: 250000, officerW2: 100000, otherW2: 500000, spouseW2: 300000 })).toBe(250000)
    expect(resolveW2OwnForSE({ status: 'single', entered: '', officerW2: 100000, otherW2: 500000, spouseW2: 300000 })).toBe(0)
  })
})
