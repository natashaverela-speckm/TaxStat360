import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./apiClient.js', () => ({
  apiPost: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(status, body, message) {
      super(message || `status ${status}`)
      this.status = status
      this.body = body
    }
  },
}))

import { apiPost, ApiError } from './apiClient.js'
import { authorizeEnterpriseReport, CPA_BRIEFING_AUTHORIZE } from './enterpriseGates.js'

describe('authorizeEnterpriseReport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when the server allows the feature', async () => {
    vi.mocked(apiPost).mockResolvedValue({ ok: true })
    await expect(authorizeEnterpriseReport(CPA_BRIEFING_AUTHORIZE)).resolves.toBe(true)
    expect(apiPost).toHaveBeenCalledWith(CPA_BRIEFING_AUTHORIZE, {})
  })

  it('returns false on 403 (not Enterprise)', async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError(403, { detail: 'Enterprise plan required' }))
    await expect(authorizeEnterpriseReport(CPA_BRIEFING_AUTHORIZE)).resolves.toBe(false)
  })

  it('rethrows non-403 errors', async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError(500, null, 'boom'))
    await expect(authorizeEnterpriseReport(CPA_BRIEFING_AUTHORIZE)).rejects.toMatchObject({ status: 500 })
  })
})
