import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteOwnAccount, adminDeleteUser } from './accountApi.js'

function mockFetchOnce(body = { ok: true }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(body),
  })
}

describe('accountApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deleteOwnAccount calls DELETE /account with the session cookie', async () => {
    mockFetchOnce({ ok: true, deleted: 'me@example.com' })
    const res = await deleteOwnAccount()
    expect(res).toEqual({ ok: true, deleted: 'me@example.com' })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('https://app.taxstat360.com/account')
    expect(opts.method).toBe('DELETE')
    expect(opts.credentials).toBe('include')
  })

  it('adminDeleteUser URL-encodes the email and targets the admin route', async () => {
    mockFetchOnce({ ok: true, deleted: 'a+b@example.com' })
    await adminDeleteUser('a+b@example.com')
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe(
      'https://app.taxstat360.com/admin/users/' + encodeURIComponent('a+b@example.com')
    )
    expect(opts.method).toBe('DELETE')
    expect(opts.credentials).toBe('include')
  })
})
