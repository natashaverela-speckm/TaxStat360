import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../utils/apiClient.js', () => ({
  apiGet: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(status) {
      super(`status ${status}`)
      this.status = status
    }
  },
}))

vi.mock('../utils/sessionState.js', () => ({
  readPlan: vi.fn(() => 'professional'),
  writePlan: vi.fn(),
}))

vi.mock('../utils/sessionAuth.js', () => ({
  clearInvalidSession: vi.fn(),
}))

import { apiGet, ApiError } from '../utils/apiClient.js'
import { writePlan } from '../utils/sessionState.js'
import { clearInvalidSession } from '../utils/sessionAuth.js'
import { refreshPlanFromServer } from './LockedFeature.jsx'

describe('refreshPlanFromServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes plan from /auth/me on success', async () => {
    vi.mocked(apiGet).mockResolvedValue({ plan: 'enterprise' })
    const plan = await refreshPlanFromServer()
    expect(writePlan).toHaveBeenCalledWith('enterprise')
    expect(plan).toBe('professional')
  })

  it('clears session on 401 instead of trusting cached plan', async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiError(401))
    const plan = await refreshPlanFromServer()
    expect(clearInvalidSession).toHaveBeenCalled()
    expect(writePlan).not.toHaveBeenCalled()
    expect(plan).toBe('starter')
  })
})
