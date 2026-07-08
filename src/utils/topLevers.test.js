// src/utils/topLevers.test.js
//
// PHASE 3.2 — dashboard lever detection. The load-bearing rule: every lever
// figure IS an engine output (summarizeRecord field) — these tests assert the
// lever text embeds the engine's own numbers, plus ranking and caps.

import { describe, it, expect } from 'vitest'
import { topLeversForRecord } from './topLevers.js'
import { summarizeRecord } from './calcSelector.js'
import { fmt } from './money.js'

const scorpLowSalary = {
  f1040: { filingStatus: 'single', taxYear: 2026, w2Income: 0 },
  entities: [{ name: 'Ops', type: 'S Corporation', own: 100, k1: 200000, netProfit: 200000, officerW2: 20000 }],
}

const lossYearWithCarryover = {
  f1040: { filingStatus: 'single', taxYear: 2026, w2Income: 200000, capitalGains: -80000 },
  entities: [],
}

describe('topLeversForRecord — engine-figure embedding and ranking', () => {
  it('compliance outranks savings: a triggered reasonable-comp alert is lever #1', () => {
    const { summary, levers } = topLeversForRecord(scorpLowSalary)
    expect(summary.ok).toBe(true)
    expect(summary.reasonableCompAlert?.triggered).toBe(true)
    expect(levers[0].id).toBe('reasonable-comp')
    expect(levers[0].tone).toBe('alert')
  })

  it("the FICA lever embeds the engine's ficaSavings verbatim and is worded as REALIZED savings", () => {
    const { summary, levers } = topLeversForRecord(scorpLowSalary)
    expect(summary.ficaSavings).toBeGreaterThan(500)
    const fica = levers.find(l => l.id === 'scorp-fica')
    expect(fica).toBeTruthy()
    expect(fica.text).toContain(fmt(summary.ficaSavings))
    expect(fica.text).toContain('is saving')       // realized, not a pitch
    expect(fica.text).not.toContain('could save')
  })

  it('a loss year with §1212(b) carryover surfaces the carryover lever with the engine figure', () => {
    const { summary, levers } = topLeversForRecord(lossYearWithCarryover, 5)
    expect(summary.capLossCarryoverTotal).toBe(77000)
    const co = levers.find(l => l.id === 'caploss-carryover')
    expect(co).toBeTruthy()
    expect(co.text).toContain(fmt(77000))
    expect(co.tone).toBe('info')
  })

  it('caps at the requested max, in rank order', () => {
    const { levers } = topLeversForRecord(scorpLowSalary, 2)
    expect(levers.length).toBeLessThanOrEqual(2)
    expect(levers[0].id).toBe('reasonable-comp')
  })

  it('never throws on malformed records — empty levers instead', () => {
    const { summary, levers } = topLeversForRecord({ f1040: null, entities: 'nonsense' })
    expect(Array.isArray(levers)).toBe(true)
    if (!summary.ok) expect(levers).toEqual([])
  })

  it('INVARIANT: lever figures equal a direct summarizeRecord of the same record', () => {
    const direct = summarizeRecord(scorpLowSalary)
    const { summary } = topLeversForRecord(scorpLowSalary)
    expect(summary.ficaSavings).toBe(direct.ficaSavings)
    expect(summary.totalTax).toBe(direct.totalTax)
  })
})
