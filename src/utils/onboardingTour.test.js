// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  onboardingKeyFor,
  hasCompletedOnboardingTour,
  markOnboardingTourComplete,
  needsOnboardingTour,
} from './onboardingTour.js'

describe('onboardingTour', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('onboardingKeyFor', () => {
    it('includes the normalized email in the key', () => {
      expect(onboardingKeyFor('User@Example.com')).toBe('ts360_onboarding_v1_user@example.com')
    })

    it('uses an empty suffix when email is missing', () => {
      expect(onboardingKeyFor('')).toBe('ts360_onboarding_v1_')
    })
  })

  describe('needsOnboardingTour', () => {
    it('returns true for a new user without saved records', () => {
      expect(needsOnboardingTour('fresh@example.com')).toBe(true)
    })

    it('returns false after the tour is marked complete', () => {
      markOnboardingTourComplete('fresh@example.com')
      expect(needsOnboardingTour('fresh@example.com')).toBe(false)
      expect(hasCompletedOnboardingTour('fresh@example.com')).toBe(true)
    })

    it('uses separate keys per email', () => {
      markOnboardingTourComplete('user-a@example.com')
      expect(needsOnboardingTour('user-a@example.com')).toBe(false)
      expect(needsOnboardingTour('user-b@example.com')).toBe(true)
    })
  })
})
