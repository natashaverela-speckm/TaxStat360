// src/utils/accountApi.js
// Calls for the permanent account-deletion endpoints on app.taxstat360.com.
// Both use the session cookie (credentials: 'include'), exactly like recordsApi.js.

import { apiDelete } from './apiClient.js'

/**
 * Permanently delete the signed-in user's own account.
 * Backend cancels Stripe, erases the user + all tax records, writes an audit
 * entry, and clears the session cookie. Resolves to the server's result object;
 * throws ApiError on failure (e.g. a Stripe error leaves the account intact).
 */
export async function deleteOwnAccount() {
  return apiDelete('/account', { credentials: 'include' })
}

/**
 * Admin-only: permanently delete a specified user by email.
 * 403 if the caller is not an admin; 400 if an admin targets their own account.
 * @param {string} email
 */
export async function adminDeleteUser(email) {
  return apiDelete(`/admin/users/${encodeURIComponent((email || '').trim())}`, {
    credentials: 'include',
  })
}
