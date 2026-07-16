import { apiPost, ApiError } from './apiClient.js'

/**
 * Ask the server whether the signed-in account may use an Enterprise report tool.
 * Returns true on 200; false on 403 (caller should send the user to /upgrade).
 * Rethrows network / unexpected errors.
 */
export async function authorizeEnterpriseReport(path) {
  try {
    await apiPost(path, {})
    return true
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return false
    throw e
  }
}

export const CPA_BRIEFING_AUTHORIZE = '/reports/cpa-briefing/authorize'
export const POSITION_DOCS_AUTHORIZE = '/reports/position-docs/authorize'
