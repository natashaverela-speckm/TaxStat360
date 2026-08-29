import { CARRYFORWARD_WIZARD_STEPS } from './carryforwardWizardConfig.js'
import { fmt, parseMoney } from '../utils/money.js'

/** @typedef {{ level: 'ok' | 'warn', message?: string }} SanityResult */

/** @typedef {{ stepId: string, label: string, message: string }} CarryforwardWarning */

const PREPARER_SUFFIX = 'Confirm with your preparer.'

function warn(message) {
  return { level: 'warn', message }
}

function ok() {
  return { level: 'ok' }
}

function isBlank(rawValue) {
  return rawValue === '' || rawValue === null || rawValue === undefined
}

function parseCarryforwardAmount(rawValue) {
  if (isBlank(rawValue)) return null
  const trimmed = String(rawValue).trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/[$,\s()]/g, '').replace(/^-/, '')
  if (!/\d/.test(digits)) return NaN
  return parseMoney(rawValue)
}

function priorYearAgiFromValues(allValues) {
  return parseMoney(allValues?.priorYearAGI ?? '')
}

function evaluateCrossFieldRule(step, amount, allValues) {
  const agi = priorYearAgiFromValues(allValues)

  switch (step.id) {
    case 'passive-activity-loss':
    case 'prior-unallowed-losses':
      if (agi > 0 && amount > agi * 2) {
        return warn(
          `This amount exceeds twice your prior-year AGI (${fmt(agi)}). ${PREPARER_SUFFIX}`,
        )
      }
      break
    case 'nol-carryforward':
      if (agi > 0 && amount > agi * 5) {
        return warn(
          `This NOL carryforward is more than five times your prior-year AGI (${fmt(agi)}). ${PREPARER_SUFFIX}`,
        )
      }
      break
    case 'qbi-carryforward':
      if (agi > 0 && amount > agi) {
        return warn(
          `This QBI carryforward exceeds your prior-year AGI (${fmt(agi)}). ${PREPARER_SUFFIX}`,
        )
      }
      break
    case 'prior-year-tax': {
      const tax = amount
      if (agi > 0 && tax > agi) {
        return warn(
          `Prior-year federal tax is higher than prior-year AGI (${fmt(agi)}). ${PREPARER_SUFFIX}`,
        )
      }
      break
    }
    default:
      break
  }

  return ok()
}

/**
 * Run sanity rules for a single wizard step.
 * @param {import('./carryforwardWizardConfig.js').CarryforwardWizardStep} step
 * @param {string} rawValue
 * @param {Record<string, string>} allValues
 * @returns {SanityResult}
 */
export function evaluateCarryforwardStepSanity(step, rawValue, allValues = {}) {
  if (step.informational || !step.fieldKey) return ok()
  if (isBlank(rawValue)) return ok()

  const amount = parseCarryforwardAmount(rawValue)
  if (Number.isNaN(amount)) {
    return warn(`This doesn't look like a valid dollar amount. ${PREPARER_SUFFIX}`)
  }

  if (step.sanity?.nonNegative && amount < 0) {
    return warn(`Enter a number ≥ 0. ${PREPARER_SUFFIX}`)
  }

  const warnAbove = step.sanity?.warnAbove
  if (warnAbove != null && amount > warnAbove) {
    return warn(
      `This amount is unusually large (above ${fmt(warnAbove)}). ${PREPARER_SUFFIX}`,
    )
  }

  return evaluateCrossFieldRule(step, amount, allValues)
}

/**
 * Collect warnings across all data-entry steps (for last-step review).
 * @param {Record<string, string>} allValues
 * @returns {CarryforwardWarning[]}
 */
export function collectCarryforwardWarnings(allValues = {}) {
  /** @type {CarryforwardWarning[]} */
  const warnings = []

  for (const step of CARRYFORWARD_WIZARD_STEPS) {
    if (step.informational || !step.fieldKey) continue
    const result = evaluateCarryforwardStepSanity(step, allValues[step.fieldKey], allValues)
    if (result.level === 'warn' && result.message) {
      warnings.push({ stepId: step.id, label: step.label, message: result.message })
    }
  }

  return warnings
}
