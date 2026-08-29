import { describe, it, expect } from 'vitest'
import {
  evaluateCarryforwardStepSanity,
  collectCarryforwardWarnings,
} from './carryforwardSanity.js'
import { CARRYFORWARD_WIZARD_STEPS } from './carryforwardWizardConfig.js'
import { buildInitialWizardValues } from './carryforwardWizardConfig.js'

const FORBIDDEN_COPY = /(you should|you must|must claim|deduct)/i
const PREPARER_COPY = /Confirm with your preparer/i

function stepById(id) {
  const step = CARRYFORWARD_WIZARD_STEPS.find((s) => s.id === id)
  if (!step) throw new Error(`missing step ${id}`)
  return step
}

function assertPreparerCopy(message) {
  expect(message).toMatch(PREPARER_COPY)
  expect(message).not.toMatch(FORBIDDEN_COPY)
}

describe('evaluateCarryforwardStepSanity', () => {
  it('CHAR: blank value returns ok', () => {
    const step = stepById('passive-activity-loss')
    expect(evaluateCarryforwardStepSanity(step, '', {})).toEqual({ level: 'ok' })
  })

  it('CHAR: zero returns ok', () => {
    const step = stepById('passive-activity-loss')
    expect(evaluateCarryforwardStepSanity(step, '0', {})).toEqual({ level: 'ok' })
  })

  it('CHAR: huge PAL exceeds warnAbove', () => {
    const step = stepById('passive-activity-loss')
    const result = evaluateCarryforwardStepSanity(step, '2000000', {})
    expect(result.level).toBe('warn')
    assertPreparerCopy(result.message)
    expect(result.message).toMatch(/unusually large/i)
  })

  it('CHAR: PAL above 2x AGI triggers cross-field warn', () => {
    const step = stepById('passive-activity-loss')
    const result = evaluateCarryforwardStepSanity(step, '300000', { priorYearAGI: '100000' })
    expect(result.level).toBe('warn')
    assertPreparerCopy(result.message)
    expect(result.message).toMatch(/twice your prior-year AGI/i)
  })

  it('CHAR: PAL below 2x AGI and warnAbove returns ok', () => {
    const step = stepById('passive-activity-loss')
    const result = evaluateCarryforwardStepSanity(step, '150000', { priorYearAGI: '100000' })
    expect(result.level).toBe('ok')
  })

  it('CHAR: prior-year tax above AGI warns', () => {
    const step = stepById('prior-year-tax')
    const result = evaluateCarryforwardStepSanity(step, '200000', { priorYearAGI: '150000' })
    expect(result.level).toBe('warn')
    assertPreparerCopy(result.message)
  })

  it('CHAR: unparseable input warns', () => {
    const step = stepById('nol-carryforward')
    const result = evaluateCarryforwardStepSanity(step, 'abc', {})
    expect(result.level).toBe('warn')
    assertPreparerCopy(result.message)
    expect(result.message).toMatch(/valid dollar amount/i)
  })

  it('CHAR: informational steps always ok', () => {
    const step = stepById('at-risk-carryforward')
    expect(evaluateCarryforwardStepSanity(step, '999999', {})).toEqual({ level: 'ok' })
  })
})

describe('collectCarryforwardWarnings', () => {
  it('CHAR: returns multiple warnings when several steps fail', () => {
    const values = {
      ...buildInitialWizardValues(),
      priorPassiveLossCarryforward: '2000000',
      nolCarryforward: '6000000',
    }
    const warnings = collectCarryforwardWarnings(values)
    expect(warnings.length).toBeGreaterThanOrEqual(2)
    for (const w of warnings) {
      assertPreparerCopy(w.message)
    }
  })

  it('CHAR: empty values produce no warnings', () => {
    expect(collectCarryforwardWarnings(buildInitialWizardValues())).toEqual([])
  })
})

describe('carryforward sanity copy guard', () => {
  const triggerCases = [
    { id: 'passive-activity-loss', value: '2000000', values: {} },
    { id: 'passive-activity-loss', value: '300000', values: { priorYearAGI: '100000' } },
    { id: 'nol-carryforward', value: '600000', values: { priorYearAGI: '100000' } },
    { id: 'qbi-carryforward', value: '200000', values: { priorYearAGI: '100000' } },
    { id: 'prior-year-tax', value: '200000', values: { priorYearAGI: '150000' } },
    { id: 'nol-carryforward', value: 'abc', values: {} },
  ]

  for (const { id, value, values } of triggerCases) {
    it(`CHAR: ${id} warning copy is preparer-framed`, () => {
      const step = stepById(id)
      const result = evaluateCarryforwardStepSanity(step, value, values)
      expect(result.level).toBe('warn')
      assertPreparerCopy(result.message)
    })
  }
})
