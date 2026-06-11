// src/utils/apiClient.js
// Single source of truth for TaxStat360 API calls (audit F8). Previously every component
// hand-rolled fetch + error handling, diverging on base URL, credentials, JSON encoding,
// ok-checking, and how failures surfaced. This wrapper owns all of that so callers express
// intent (path + method + body) and get back parsed JSON or a typed ApiError.
//
// Design notes:
//   • Faithful SUPERSET of the existing call patterns, so adoption is behavior-preserving:
//       - credentials default to 'include' (the dominant pattern) but can be overridden.
//       - plain-object bodies are JSON-encoded and get Content-Type: application/json;
//         FormData / URLSearchParams pass through untouched.
//       - custom headers and an AbortSignal are supported.
//       - raw:true returns the Response untouched, for callers that branch on specific
//         status codes (e.g. Aria's 401/403/5xx handling) — they keep full control.
//   • On a non-ok response, apiFetch throws ApiError carrying .status and the parsed .body,
//     so a caller can still do: catch (e) { if (e.status === 409) … e.body?.detail }.
//   • Absolute URLs (third-party endpoints like web3forms / Mailchimp) are intentionally
//     NOT rewritten — but those calls should use fetch directly, not this client.
//
// This module performs no navigation and stores nothing; auth side-effects (token/localStorage)
// stay in the calling component, exactly as before.

import { API_BASE_URL } from '../constants.js'

export class ApiError extends Error {
  constructor(status, body, message) {
    super(message || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Resolve a path to a full URL. Absolute URLs are returned unchanged. */
export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

const hasHeader = (headers, name) =>
  Object.keys(headers).some(h => h.toLowerCase() === name.toLowerCase())

/**
 * Core request helper.
 * @param {string} path  Path (joined to API_BASE_URL) or an absolute URL.
 * @param {object} [options]
 * @param {string}  [options.method='GET']
 * @param {*}       [options.body]            Object → JSON; FormData/URLSearchParams pass through.
 * @param {object}  [options.headers={}]
 * @param {string}  [options.credentials='include']
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.raw=false]       true → return the raw Response (no ok-check/parse).
 * @returns {Promise<any>} parsed JSON (or null for an empty body), or the Response if raw.
 * @throws {ApiError} on a non-ok response when raw is false.
 */
export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    credentials = 'include',
    signal,
    raw = false,
  } = options

  const finalHeaders = { ...headers }
  let finalBody = body
  const isPlainObject =
    body !== undefined && body !== null && typeof body === 'object' &&
    !(body instanceof FormData) && !(body instanceof URLSearchParams)
  if (isPlainObject) {
    finalBody = JSON.stringify(body)
    if (!hasHeader(finalHeaders, 'content-type')) {
      finalHeaders['Content-Type'] = 'application/json'
    }
  }

  const res = await fetch(apiUrl(path), {
    method,
    credentials,
    headers: finalHeaders,
    ...(finalBody !== undefined ? { body: finalBody } : {}),
    ...(signal ? { signal } : {}),
  })

  if (raw) return res

  if (!res.ok) {
    const errBody = await res.json().catch(() => null)
    const message = (errBody && (errBody.detail || errBody.message)) || `Request failed (${res.status})`
    throw new ApiError(res.status, errBody, message)
  }

  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/** GET helper. */
export const apiGet = (path, opts = {}) => apiFetch(path, { ...opts, method: 'GET' })

/** POST helper. Pass a plain object for `body` to send JSON. */
export const apiPost = (path, body, opts = {}) => apiFetch(path, { ...opts, method: 'POST', body })
