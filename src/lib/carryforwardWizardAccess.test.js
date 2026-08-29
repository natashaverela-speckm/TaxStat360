import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../components/LockedFeature.jsx', () => ({
  canAccess: vi.fn(),
}))

import { canAccess } from '../components/LockedFeature.jsx'
import { canAccessCarryforwardWizard } from './carryforwardWizardAccess.js'
import { CARRYFORWARD_WIZARD_MIN_PLAN } from './carryforwardWizardConfig.js'

describe('canAccessCarryforwardWizard', () => {
  beforeEach(() => {
    vi.mocked(canAccess).mockReset()
  })

  it('CHAR: delegates to canAccess with CARRYFORWARD_WIZARD_MIN_PLAN', () => {
    vi.mocked(canAccess).mockReturnValue(true)
    expect(canAccessCarryforwardWizard()).toBe(true)
    expect(canAccess).toHaveBeenCalledWith(CARRYFORWARD_WIZARD_MIN_PLAN)
  })

  it('CHAR: returns false when plan is below professional', () => {
    vi.mocked(canAccess).mockReturnValue(false)
    expect(canAccessCarryforwardWizard()).toBe(false)
  })
})
