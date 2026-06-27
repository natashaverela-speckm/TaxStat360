/** Per-user onboarding tour flag — compute when the user is known, not at module load. */
export function onboardingKeyFor(email = '') {
  return `ts360_onboarding_v1_${String(email || '').trim().toLowerCase()}`
}

export function hasCompletedOnboardingTour(email) {
  if (!email) return false
  try {
    return localStorage.getItem(onboardingKeyFor(email)) === '1'
  } catch {
    return false
  }
}

export function markOnboardingTourComplete(email) {
  if (!email) return
  try {
    localStorage.setItem(onboardingKeyFor(email), '1')
  } catch (_) {}
}

/** True when the welcome tour must be shown before app/onboarding setup routes. */
export function needsOnboardingTour(email) {
  if (!email || hasCompletedOnboardingTour(email)) return false
  return true
}
