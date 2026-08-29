import {
  hasSkippedCarryforwardFlowOffer as readFlowOfferSkipped,
  markCarryforwardFlowOfferSkipped as writeFlowOfferSkipped,
} from './sessionState.js'

/** Per-user carryforward wizard completion flag — compute when the user is known. */
export function carryforwardWizardKeyFor(email = '') {
  return `ts360_carryforward_wizard_v1_${String(email || '').trim().toLowerCase()}`
}

export function carryforwardPromptKeyFor(email = '') {
  return `ts360_carryforward_prompt_dismissed_v1_${String(email || '').trim().toLowerCase()}`
}

/** Same key as sessionState — kept here for tests; storage access is only in sessionState. */
export const CARRYFORWARD_FLOW_OFFER_SKIP_KEY = 'ts360_carryforward_flow_offer_skipped_v1'

export function hasSkippedCarryforwardFlowOffer() {
  return readFlowOfferSkipped()
}

export function markCarryforwardFlowOfferSkipped() {
  return writeFlowOfferSkipped()
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
  // No email yet (local QA / edge session): still offer — completion persists once email exists.
  if (!email) return true
  if (hasCompletedCarryforwardWizard(email)) return false
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

/**
 * Dashboard prompt for users who have not finished the wizard.
 * Not rental-only — the guide covers PAL, capital-loss CO, NOL, QBI, safe harbor, etc.
 */
export function shouldShowCarryforwardDashboardPrompt(email, _entities = []) {
  if (!needsCarryforwardWizard(email)) return false
  if (hasDismissedCarryforwardDashboardPrompt(email)) return false
  return true
}
