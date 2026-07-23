// RENAMED (M6, audit F-07) from taxCalc-c10.test.js — files are named by SUBJECT
// (what the tests protect), not by remediation ticket. Ticket history: C-10.
// Subject: §1366(d)/§704(d) basis loss limitation and the conservative
// assumeZeroBasisOnLoss default.
import { describe, it, expect } from 'vitest'
import { calcTaxReturn } from './taxCalc.js'

// =============================================================================
// C-10 — §1366(d)/§704(d) conservative basis default (assumeZeroBasisOnLoss)
//
// Regression guard for the audit's #1 finding: an S-Corp/partnership LOSS with
// no stock/debt basis entered was deducting in full against other income (no
// limitation, no message). The engine now suspends such a loss when the live
// app passes assumeZeroBasisOnLoss:true, while the engine default (no flag) is
// unchanged so the existing EBL/QBI unit tests keep their prior behavior.
// =============================================================================

const sCorpLoss = (stockBasis) => ({
  name: 'Test S-Corp', type: 'S Corporation', own: '100',
  pnl: { grossRevenue: '0', totalExpenses: '382397', netProfit: '-382397', officerSalary: '0' },
  box11_12: '', box12_13: '',
  stockBasis, debtBasis: '', distributions: '',
})

const base = (entities, flag) => calcTaxReturn({
  taxYear: 2026, status: 'mfj', dependents: 0,
  entities, w2: 500000, k1Total: -382397, w2Withheld: 0, estPaid: 0,
  ...(flag !== undefined ? { assumeZeroBasisOnLoss: flag } : {}),
})

describe('C-10 engine default (no flag): blank-basis loss still flows (preserves prior behavior)', () => {
  it('CHAR: blank basis, no flag → nothing suspended, loss offsets W-2 (legacy default frozen)', () => {
    const r = base([sCorpLoss('')], undefined)
    expect(r.totalSuspendedLoss).toBe(0)
    expect(r.agi).toBe(117603) // 500,000 - 382,397
  })
})

describe('C-10 conservative default (assumeZeroBasisOnLoss:true)', () => {
  it('SPEC: §1366(d)(1) — blank basis under conservative flag → full loss suspended, no W-2 offset', () => {
    const r = base([sCorpLoss('')], true)
    expect(r.totalSuspendedLoss).toBe(382397)
    expect(r.agi).toBe(500000)
    expect(r.entityBasisResults[0].basisAssumedZero).toBe(true)
  })

  it('CHAR: basis "0" entered → full loss suspended, basisAssumedZero flag is false', () => {
    const r = base([sCorpLoss('0')], true)
    expect(r.totalSuspendedLoss).toBe(382397)
    expect(r.agi).toBe(500000)
    expect(r.entityBasisResults[0].basisAssumedZero).toBe(false)
  })

  it('SPEC: §1366(d)(1) — loss allowed only to basis (50,000), remainder suspended', () => {
    const r = base([sCorpLoss('50000')], true)
    expect(r.totalSuspendedLoss).toBe(332397)
    expect(r.agi).toBe(450000) // 500,000 - 50,000 allowed
    expect(r.entityBasisResults[0].basisAssumedZero).toBe(false)
  })

  it('SPEC: §1366(d)(1) — ample basis → full loss allowed', () => {
    const r = base([sCorpLoss('500000')], true)
    expect(r.totalSuspendedLoss).toBe(0)
    expect(r.agi).toBe(117603)
  })

  it('CHAR: profitable S-Corp is untouched by the flag', () => {
    const profit = { name: 'P', type: 'S Corporation', own: '100',
      pnl: { grossRevenue: '300000', totalExpenses: '0', netProfit: '300000', officerSalary: '0' },
      box11_12: '', box12_13: '', stockBasis: '', debtBasis: '', distributions: '' }
    const r = calcTaxReturn({ taxYear: 2026, status: 'mfj', dependents: 0,
      entities: [profit], w2: 0, k1Total: 300000, assumeZeroBasisOnLoss: true })
    expect(r.totalSuspendedLoss).toBe(0)
  })

  it('SPEC: §704(d) — Partnership loss with blank basis is likewise suspended', () => {
    const partnerLoss = { name: 'PS', type: 'Partnership / MMLLC — Active', own: '100',
      pnl: { grossRevenue: '0', totalExpenses: '100000', netProfit: '-100000', officerSalary: '0' },
      box11_12: '', box12_13: '', stockBasis: '', debtBasis: '', distributions: '' }
    const r = calcTaxReturn({ taxYear: 2026, status: 'mfj', dependents: 0,
      entities: [partnerLoss], w2: 300000, k1Total: -100000, assumeZeroBasisOnLoss: true })
    expect(r.totalSuspendedLoss).toBe(100000)
    expect(r.agi).toBe(300000)
  })
})
