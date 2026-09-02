import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  contextValueToWizardInput,
  loadWizardValuesFromContext,
  buildWizardContextUpdates,
  saveWizardValuesToContext,
} from './carryforwardWizardPersistence.js'
import { buildInitialWizardValues } from './carryforwardWizardConfig.js'

const readPersonalContext = vi.fn()
const writePersonalContext = vi.fn()
const writeDirtyFlag = vi.fn()

vi.mock('../utils/sessionState.js', () => ({
  readPersonalContext: (...args) => readPersonalContext(...args),
  writePersonalContext: (...args) => writePersonalContext(...args),
  writeDirtyFlag: (...args) => writeDirtyFlag(...args),
}))

beforeEach(() => {
  readPersonalContext.mockReset()
  writePersonalContext.mockReset()
  writeDirtyFlag.mockReset()
})

describe('contextValueToWizardInput', () => {
  it('CHAR: maps 0 and missing to empty string', () => {
    expect(contextValueToWizardInput(0)).toBe('')
    expect(contextValueToWizardInput('')).toBe('')
    expect(contextValueToWizardInput(null)).toBe('')
  })

  it('CHAR: maps nonzero numbers to input string', () => {
    expect(contextValueToWizardInput(5000)).toBe('5000')
    expect(contextValueToWizardInput('1200')).toBe('1200')
  })
})

describe('loadWizardValuesFromContext', () => {
  it('CHAR: prefills nolCarryforward from context', () => {
    const values = loadWizardValuesFromContext({ nolCarryforward: 5000 })
    expect(values.nolCarryforward).toBe('5000')
  })

  it('CHAR: prefills priorYearQBILoss from priorYearLosses alias', () => {
    const values = loadWizardValuesFromContext({ priorYearLosses: 1200 })
    expect(values.priorYearQBILoss).toBe('1200')
  })

  it('CHAR: prefills priorPassiveLossCarryforward from legacy priorSuspendedLoss context', () => {
    const values = loadWizardValuesFromContext({ priorSuspendedLoss: 9000 })
    expect(values.priorPassiveLossCarryforward).toBe('9000')
  })

  it('CHAR: starts empty when context has no carryforward values', () => {
    const values = loadWizardValuesFromContext({})
    expect(values).toEqual(buildInitialWizardValues())
  })
})

describe('buildWizardContextUpdates', () => {
  it('CHAR: includes only non-empty wizard fields', () => {
    const updates = buildWizardContextUpdates({
      ...buildInitialWizardValues(),
      nolCarryforward: '7500',
    })
    expect(updates).toEqual({ nolCarryforward: 7500 })
  })

  it('CHAR: writes both QBI keys when priorYearQBILoss entered', () => {
    const updates = buildWizardContextUpdates({
      ...buildInitialWizardValues(),
      priorYearQBILoss: '3000',
    })
    expect(updates.priorYearQBILoss).toBe(3000)
    expect(updates.priorYearLosses).toBe(3000)
  })

  it('CHAR: skips empty strings so existing values are not overwritten', () => {
    const updates = buildWizardContextUpdates(buildInitialWizardValues())
    expect(updates).toEqual({})
  })
})

describe('saveWizardValuesToContext', () => {
  it('CHAR: merges updates without dropping unrelated context fields', () => {
    readPersonalContext.mockReturnValue({ w2Income: 80000, nolCarryforward: 0 })
    const saved = saveWizardValuesToContext({
      ...buildInitialWizardValues(),
      nolCarryforward: '5000',
    })
    expect(saved).toBe(true)
    expect(writePersonalContext).toHaveBeenCalledWith({
      w2Income: 80000,
      nolCarryforward: 5000,
    })
    expect(writeDirtyFlag).toHaveBeenCalledWith(true)
  })

  it('CHAR: returns false and does not write when all fields empty', () => {
    readPersonalContext.mockReturnValue({ w2Income: 80000 })
    const saved = saveWizardValuesToContext(buildInitialWizardValues())
    expect(saved).toBe(false)
    expect(writePersonalContext).not.toHaveBeenCalled()
    expect(writeDirtyFlag).not.toHaveBeenCalled()
  })
})
