/**
 * TaxStat360 client for shared extract-document (profile: tax-1040-carryforward).
 * Calls TaxStat360 API proxy — never posts tax PDFs to RepsRecord Evidence.
 */
import { apiFetch } from '../utils/apiClient.js'

/**
 * @param {File} file
 * @returns {Promise<{ ok: true, result: object } | { ok: false, error: string }>}
 */
export async function extractTax1040Carryforward(file) {
  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'Choose a PDF or image of last year’s return.' }
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
      return {
        ok: false,
        error: (body && (body.error || body.detail || body.message)) || 'Extract failed.',
      }
    }
    return { ok: true, result: body }
  } catch (e) {
    const msg =
      (e && e.body && (e.body.detail || e.body.error || e.body.message)) ||
      (e && e.message) ||
      'Could not reach extract service.'
    return { ok: false, error: String(msg) }
  }
}
