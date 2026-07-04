// @vitest-environment jsdom
// AUDIT F3 RESIDUAL REGRESSION TEST — the load-path strip.
// The save path writes ytdMode/ytdMonth (and the other fields below) onto the
// record's f1040, but normalizeF1040's whitelist dropped them on rehydration,
// so a saved YTD projection silently reverted to full-year on reload.
import { describe, it, expect } from 'vitest'
import { normalizeF1040 } from './sessionState.js'

describe('normalizeF1040 preserves save-path fields (AUDIT F3 residual)', () => {
  it('round-trips YTD state', () => {
    const n = normalizeF1040({ ytdMode: true, ytdMonth: 3, filingStatus: 'single' })
    expect(n.ytdMode).toBe(true)
    expect(n.ytdMonth).toBe(3)
  })
  it('defaults YTD off for legacy records', () => {
    const n = normalizeF1040({ filingStatus: 'single' })
    expect(n.ytdMode).toBe(false)
  })
  it('round-trips the previously-stripped numeric fields', () => {
    const n = normalizeF1040({
      stGain: '5000', unrecap1250: '1000', collectiblesGain: '200',
      nonrecap1231: '300', priorYearTax: '30000', priorYearAGI: '250000',
      priorSuspendedLoss: '80000', priorPassiveLossCarryforward: '16000',
      mortgageInt: '12000', charitableContr: '4000', medicalAmt: '1500',
    })
    expect(n.stGain).toBe(5000)
    expect(n.priorYearTax).toBe(30000)
    expect(n.priorYearAGI).toBe(250000)
    expect(n.priorSuspendedLoss).toBe(80000)
    expect(n.priorPassiveLossCarryforward).toBe(16000)
  })
  it('round-trips the boolean/election fields', () => {
    const n = normalizeF1040({ isActiveParticipant: false, rentalAggregationElection: true })
    expect(n.isActiveParticipant).toBe(false)
    expect(n.rentalAggregationElection).toBe(true)
  })
})

// AUDIT F3 RESIDUAL — full session round-trip through BOTH remaining whitelists
// (writePersonalContext strip + readPersonalContext strip). The record-side
// whitelist (normalizeF1040) is covered above; this pins the session side.
import { writePersonalContext, readPersonalContext } from './sessionState.js'

describe('writePersonalContext → readPersonalContext round-trip (AUDIT F3 residual)', () => {
  it('round-trips YTD state through sessionStorage', () => {
    writePersonalContext({ filingStatus: 'single', ytdMode: true, ytdMonth: 3 })
    const ctx = readPersonalContext()
    expect(ctx.ytdMode).toBe(true)
    expect(ctx.ytdMonth).toBe(3)
  })
  it('round-trips the previously-stripped fields', () => {
    writePersonalContext({
      filingStatus: 'single', stGain: 5000, ltGain: 40000, qualDividends: 1200,
      unrecap1250: 800, collectiblesGain: 300, nonrecap1231: 250,
      isActiveParticipant: false, rentalAggregationElection: true,
      priorPassiveLossCarryforward: 16000, priorYearTax: 30000, priorYearAGI: 250000,
      priorYearLosses: 4000, mortgageInt: 12000, charitableContr: 4000, medicalAmt: 1500,
    })
    const ctx = readPersonalContext()
    expect(ctx.stGain).toBe(5000)
    expect(ctx.ltGain).toBe(40000)
    expect(ctx.qualDividends).toBe(1200)
    expect(ctx.isActiveParticipant).toBe(false)
    expect(ctx.rentalAggregationElection).toBe(true)
    expect(ctx.priorYearTax).toBe(30000)
    expect(ctx.priorYearAGI).toBe(250000)
    expect(ctx.priorPassiveLossCarryforward).toBe(16000)
  })
  it('defaults stay safe for legacy sessionStorage payloads', () => {
    sessionStorage.setItem('ts360_f1040', JSON.stringify({ filingStatus: 'mfj', w2Income: 100 }))
    const ctx = readPersonalContext()
    expect(ctx.ytdMode).toBe(false)
    expect(ctx.isActiveParticipant).toBe(true)
    expect(ctx.filingStatus).toBe('mfj')
  })
})
