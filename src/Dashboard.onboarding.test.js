// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { onboardingKeyFor } from './Dashboard.jsx'

describe('onboardingKeyFor', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('includes the normalized email in the key', () => {
    expect(onboardingKeyFor('User@Example.com')).toBe('ts360_onboarding_v1_user@example.com')
  })

  it('uses an empty suffix when email is missing', () => {
    expect(onboardingKeyFor('')).toBe('ts360_onboarding_v1_')
  })

  it('read and write use the same key for a signed-in user', () => {
    const email = 'fresh-signup@example.com'
    const key = onboardingKeyFor(email)
    expect(localStorage.getItem(key)).toBeNull()
    localStorage.setItem(key, '1')
    expect(localStorage.getItem(onboardingKeyFor(email))).toBe('1')
  })
})
