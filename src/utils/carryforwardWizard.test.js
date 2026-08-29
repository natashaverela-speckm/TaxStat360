// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  carryforwardWizardKeyFor,
  carryforwardPromptKeyFor,
  hasCompletedCarryforwardWizard,
  markCarryforwardWizardComplete,
  needsCarryforwardWizard,
  hasDismissedCarryforwardDashboardPrompt,
  dismissCarryforwardDashboardPrompt,
  shouldShowCarryforwardDashboardPrompt,
} from './carryforwardWizard.js'

describe('carryforwardWizard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('carryforwardWizardKeyFor', () => {
    it('includes the normalized email in the key', () => {
      expect(carryforwardWizardKeyFor('User@Example.com')).toBe(
        'ts360_carryforward_wizard_v1_user@example.com',
      )
    })

    it('uses an empty suffix when email is missing', () => {
      expect(carryforwardWizardKeyFor('')).toBe('ts360_carryforward_wizard_v1_')
    })
  })

  describe('needsCarryforwardWizard', () => {
    it('returns false when email is missing', () => {
      expect(needsCarryforwardWizard('')).toBe(false)
    })

    it('returns true for a user who has not completed the wizard', () => {
      expect(needsCarryforwardWizard('fresh@example.com')).toBe(true)
    })

    it('returns false after the wizard is marked complete', () => {
      markCarryforwardWizardComplete('fresh@example.com')
      expect(needsCarryforwardWizard('fresh@example.com')).toBe(false)
      expect(hasCompletedCarryforwardWizard('fresh@example.com')).toBe(true)
    })

    it('uses separate keys per email', () => {
      markCarryforwardWizardComplete('user-a@example.com')
      expect(needsCarryforwardWizard('user-a@example.com')).toBe(false)
      expect(needsCarryforwardWizard('user-b@example.com')).toBe(true)
    })
  })

  describe('carryforwardPromptKeyFor', () => {
    it('includes the normalized email in the prompt dismiss key', () => {
      expect(carryforwardPromptKeyFor('User@Example.com')).toBe(
        'ts360_carryforward_prompt_dismissed_v1_user@example.com',
      )
    })
  })

  describe('shouldShowCarryforwardDashboardPrompt', () => {
    const rentalEntities = [{ type: 'Rental Real Estate', pnl: {} }]

    it('returns true for incomplete user with rental entity and no dismiss', () => {
      expect(shouldShowCarryforwardDashboardPrompt('fresh@example.com', rentalEntities)).toBe(true)
    })

    it('returns false after wizard is completed', () => {
      markCarryforwardWizardComplete('fresh@example.com')
      expect(shouldShowCarryforwardDashboardPrompt('fresh@example.com', rentalEntities)).toBe(false)
    })

    it('returns false after prompt is dismissed', () => {
      dismissCarryforwardDashboardPrompt('fresh@example.com')
      expect(hasDismissedCarryforwardDashboardPrompt('fresh@example.com')).toBe(true)
      expect(shouldShowCarryforwardDashboardPrompt('fresh@example.com', rentalEntities)).toBe(false)
    })

    it('returns false without rental entities', () => {
      expect(shouldShowCarryforwardDashboardPrompt('fresh@example.com', [])).toBe(false)
    })

    it('uses separate dismiss keys per email', () => {
      dismissCarryforwardDashboardPrompt('user-a@example.com')
      expect(shouldShowCarryforwardDashboardPrompt('user-a@example.com', rentalEntities)).toBe(false)
      expect(shouldShowCarryforwardDashboardPrompt('user-b@example.com', rentalEntities)).toBe(true)
    })
  })
})
