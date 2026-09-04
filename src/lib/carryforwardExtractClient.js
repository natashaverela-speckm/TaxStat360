/**
 * TaxStat360 client for shared extract-document (profile: tax-1040-carryforward).
 * Calls TaxStat360 API proxy — never posts tax PDFs to RepsRecord Evidence.
 */
import { apiFetch } from '../utils/apiClient.js'

/** Unwrap FastAPI detail string or { code, message } gate payload. */
function formatExtractError(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    if (typeof value.message === 'string' && value.message) return value.message
    if (typeof value.detail === 'string') return value.detail
    if (value.detail && typeof value.detail.message === 'string') return value.detail.message
  }
  return String(value)
}

/**
 * @param {File} file
 * @returns {Promise<{ ok: true, result: object } | { ok: false, error: string, code?: string }>}
 */
export async function extractTax1040Carryforward(file) {
  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'Choose a PDF of last year’s return.' }
  }
  const fd = new FormData()
  fd.append('profile', 'tax-1040-carryforward')
  fd.append('file', file, file.name || 'prior-year-1040.pdf')

  try {
    const body = await apiFetch('/extract/tax-1040-carryforward', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    if (!body || body.ok === false) {
      const detail = body && (body.detail || body.error || body.message)
      return {
        ok: false,
        error: formatExtractError(detail) || 'Extract failed.',
        code: detail && typeof detail === 'object' ? detail.code : undefined,
      }
    }
    return { ok: true, result: body }
  } catch (e) {
    const detail = e && e.body && (e.body.detail || e.body.error || e.body.message)
    const msg =
      formatExtractError(detail) ||
      (e && e.message) ||
      'Could not reach extract service.'
    return {
      ok: false,
      error: String(msg),
      code: detail && typeof detail === 'object' ? detail.code : undefined,
    }
  }
}
