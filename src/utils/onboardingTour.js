/** Per-user onboarding tour flag — compute when the user is known, not at module load. */
export function onboardingKeyFor(email = '') {
  return `ts360_onboarding_v1_${String(email || '').trim().toLowerCase()}`
}

// test seam (D-08): exported for tests only — not a production API.
export function hasCompletedOnboardingTour(email) {
  if (!email) return false
  try {
    return localStorage.getItem(onboardingKeyFor(email)) === '1'
  } catch {
    // M5 (audit F-10): unreadable storage → treat as tour-not-done; worst case a
    // returning user sees the welcome tour once more.
    return false
  }
}

export function markOnboardingTourComplete(email) {
  if (!email) return
  try {
    localStorage.setItem(onboardingKeyFor(email), '1')
  } catch (_) {
    // M5: persistence failure means the tour may show again next session — harmless.
  }
}

/** True when the welcome tour must be shown before app/onboarding setup routes. */
export function needsOnboardingTour(email) {
  if (!email || hasCompletedOnboardingTour(email)) return false
  return true
}
