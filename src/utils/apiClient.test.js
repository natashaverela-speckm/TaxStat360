// src/utils/apiClient.test.js
// Tests for the shared API client (audit F8). Uses a mocked global fetch.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { apiUrl, apiFetch, apiGet, apiPost, ApiError } from './apiClient.js'
import { API_BASE_URL } from '../constants.js'

vi.mock('./sessionState.js', () => ({
  readToken: vi.fn(() => null),
}))

import { readToken } from './sessionState.js'

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
})

describe('apiUrl', () => {
  it('joins a path to API_BASE_URL', () => {
    expect(apiUrl('/auth/me')).toBe(`${API_BASE_URL}/auth/me`)
  })
  it('adds a leading slash when missing', () => {
    expect(apiUrl('auth/me')).toBe(`${API_BASE_URL}/auth/me`)
  })
  it('leaves absolute URLs untouched', () => {
    expect(apiUrl('https://api.web3forms.com/submit')).toBe('https://api.web3forms.com/submit')
  })
})

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
    vi.mocked(readToken).mockReturnValue(null)
  })

  it('defaults API calls to credentials: include', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { ok: true }))
    await apiFetch('/auth/me')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE_URL}/auth/me`)
    expect(opts.method).toBe('GET')
    expect(opts.credentials).toBe('include')
    expect(opts.body).toBeUndefined()
  })

  it('attaches Authorization Bearer when ts360_token is stored', async () => {
    vi.mocked(readToken).mockReturnValue('signed-session-token')
    global.fetch.mockResolvedValue(jsonResponse(200, {}))
    await apiGet('/auth/me')
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer signed-session-token')
    expect(opts.credentials).toBe('include')
  })

  it('sends credentials: include when explicitly requested', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, {}))
    await apiFetch('/auth/mfa/status', { credentials: 'include' })
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.credentials).toBe('include')
  })

  it('JSON-encodes a plain-object body and sets Content-Type', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, {}))
    await apiPost('/auth/login', { email: 'a@b.com', password: 'x' })
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.body).toBe(JSON.stringify({ email: 'a@b.com', password: 'x' }))
  })

  it('returns parsed JSON on success', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { plan: 'pro' }))
    const data = await apiGet('/auth/me')
    expect(data).toEqual({ plan: 'pro' })
  })

  it('returns null for an empty body (e.g. 204)', async () => {
    global.fetch.mockResolvedValue(jsonResponse(204, undefined))
    const data = await apiPost('/auth/logout')
    expect(data).toBeNull()
  })

  it('throws ApiError with status and parsed body on non-ok', async () => {
    global.fetch.mockResolvedValue(jsonResponse(409, { detail: 'Email already registered' }))
    await expect(apiPost('/auth/register', { email: 'a@b.com' }))
      .rejects.toMatchObject({ name: 'ApiError', status: 409, body: { detail: 'Email already registered' } })
  })

  it('ApiError.message prefers body.detail', async () => {
    global.fetch.mockResolvedValue(jsonResponse(400, { detail: 'Bad token' }))
    try {
      await apiGet('/auth/verify-email')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect(e.message).toBe('Bad token')
    }
  })

  it('lets a network error propagate', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(apiGet('/auth/me')).rejects.toThrow('Failed to fetch')
  })

  it('raw:true returns the Response without ok-check or parsing', async () => {
    const res = jsonResponse(503, { detail: 'down' })
    global.fetch.mockResolvedValue(res)
    const out = await apiFetch('/aria', { raw: true })
    expect(out).toBe(res)
    expect(out.status).toBe(503)
  })

  it('passes through FormData / URLSearchParams without JSON-encoding', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, {}))
    const params = new URLSearchParams({ a: '1' })
    await apiFetch('/x', { method: 'POST', body: params })
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.body).toBe(params)
    expect(opts.headers['Content-Type']).toBeUndefined()
  })

  it('leaves third-party URLs on same-origin credentials without Bearer', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, {}))
    vi.mocked(readToken).mockReturnValue('signed-session-token')
    await apiFetch('https://api.web3forms.com/submit', { method: 'POST', body: { a: 1 } })
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.credentials).toBe('same-origin')
    expect(opts.headers.Authorization).toBeUndefined()
  })

  it('respects an explicit credentials override and custom headers', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, {}))
    await apiFetch('/auth/reset-password', {
      method: 'POST', body: { token: 't' }, credentials: 'omit', headers: { Accept: 'application/json' },
    })
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.credentials).toBe('omit')
    expect(opts.headers.Accept).toBe('application/json')
  })
})
