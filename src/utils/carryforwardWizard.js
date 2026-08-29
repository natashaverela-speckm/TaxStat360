import { isRealEstateEntity } from './entityPredicates.js'

/** Per-user carryforward wizard completion flag — compute when the user is known. */
export function carryforwardWizardKeyFor(email = '') {
  return `ts360_carryforward_wizard_v1_${String(email || '').trim().toLowerCase()}`
}

export function carryforwardPromptKeyFor(email = '') {
  return `ts360_carryforward_prompt_dismissed_v1_${String(email || '').trim().toLowerCase()}`
}

// test seam: exported for tests only — not a production API.
export function hasCompletedCarryforwardWizard(email) {
  if (!email) return false
  try {
    return localStorage.getItem(carryforwardWizardKeyFor(email)) === '1'
  } catch {
    return false
  }
}

export function markCarryforwardWizardComplete(email) {
  if (!email) return
  try {
    localStorage.setItem(carryforwardWizardKeyFor(email), '1')
  } catch (_) {
    // persistence failure → wizard may prompt again next session
  }
}

/** True when the carryforward wizard should be offered (Phase 6 prompt). */
export function needsCarryforwardWizard(email) {
  if (!email || hasCompletedCarryforwardWizard(email)) return false
  return true
}

export function hasDismissedCarryforwardDashboardPrompt(email) {
  if (!email) return false
  try {
    return localStorage.getItem(carryforwardPromptKeyFor(email)) === '1'
  } catch {
    return false
  }
}

export function dismissCarryforwardDashboardPrompt(email) {
  if (!email) return
  try {
    localStorage.setItem(carryforwardPromptKeyFor(email), '1')
  } catch (_) {
    // persistence failure → prompt may reappear next session
  }
}

/** One-time Dashboard prompt for rental users who have not finished the wizard. */
export function shouldShowCarryforwardDashboardPrompt(email, entities = []) {
  if (!needsCarryforwardWizard(email)) return false
  if (hasDismissedCarryforwardDashboardPrompt(email)) return false
  if (!Array.isArray(entities) || entities.length === 0) return false
  return entities.some((e) => e && isRealEstateEntity(e.type))
}
