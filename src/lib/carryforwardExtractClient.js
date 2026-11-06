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

/**
 * PHASE 2 (Prior-Year Review): send the browser-masked text layer, never the PDF.
 * Pair with prepareTax1040TextForUpload() — the SSN is masked on the device and
 * the file itself is never transmitted. Same response contract as the file route.
 * @param {string} text  masked text layer from prepareTax1040TextForUpload
 * @returns {Promise<{ ok: true, result: { fields: object, confidence?: object, warnings?: string[], evidence?: object } } | { ok: false, error: string, code?: string }>}
 */
export async function extractTax1040ReviewText(text, profile = 'tax-1040-review', fixture = null) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'Choose a PDF of last year’s return.' }
  }
  try {
    const payload = { profile, text }
    if (fixture) payload.fixture = fixture   // dev stub hint only; the server ignores it when live
    const body = await apiFetch('/extract/tax-1040-text', { method: 'POST', body: payload, credentials: 'include' })
    if (!body || body.ok === false) {
      const detail = body && (body.detail || body.error || body.message)
      return { ok: false, error: formatExtractError(detail) || 'Extract failed.', code: detail && typeof detail === 'object' ? detail.code : undefined }
    }
    if (body.evidence && body.evidence.retained === true) {
      return { ok: false, error: 'Extract refused — tax documents must not be retained. Enter the figures manually.', code: 'EVIDENCE_RETAINED' }
    }
    return { ok: true, result: body }
  } catch (e) {
    const detail = e && e.body && (e.body.detail || e.body.error || e.body.message)
    return { ok: false, error: String(formatExtractError(detail) || (e && e.message) || 'Could not reach extract service.'), code: detail && typeof detail === 'object' ? detail.code : undefined }
  }
}

/**
 * PHASE 2 (Prior-Year Review): the wider profile. Same endpoint, same gates, same
 * delete-after-processing rule; the server returns the review field set plus a
 * per-field confidence map.
 * @param {File} file
 * @returns {Promise<{ ok: true, result: { fields: object, confidence?: object, warnings?: string[], evidence?: object } } | { ok: false, error: string, code?: string }>}
 */
export async function extractTax1040Review(file) {
  if (!file || !(file instanceof File)) {
    return { ok: false, error: 'Choose a PDF of last year\u2019s return.' }
  }
  const fd = new FormData()
  fd.append('profile', 'tax-1040-review')
  fd.append('file', file, file.name || 'prior-year-1040.pdf')
  try {
    const body = await apiFetch('/extract/tax-1040-carryforward', { method: 'POST', body: fd, credentials: 'include' })
    if (!body || body.ok === false) {
      const detail = body && (body.detail || body.error || body.message)
      return { ok: false, error: formatExtractError(detail) || 'Extract failed.', code: detail && typeof detail === 'object' ? detail.code : undefined }
    }
    if (body.evidence && body.evidence.retained === true) {
      // HITL contract: a payload that claims the PDF was kept is refused outright.
      return { ok: false, error: 'Extract refused \u2014 tax documents must not be retained. Enter the figures manually.', code: 'EVIDENCE_RETAINED' }
    }
    return { ok: true, result: body }
  } catch (e) {
    const detail = e && e.body && (e.body.detail || e.body.error || e.body.message)
    return { ok: false, error: String(formatExtractError(detail) || (e && e.message) || 'Could not reach extract service.'), code: detail && typeof detail === 'object' ? detail.code : undefined }
  }
}
