// src/utils/serverApi.js
//
// All server-side API calls that require the session cookie.
// Replaces: utils/accountApi.js + utils/recordsApi.js (merged June 2026).
//
// ── RECORDS (used by sessionState.js) ──────────────────────────────────────
//   fetchRecordsFromServer()
//   upsertRecordOnServer(record)
//   deleteRecordOnServer(recordId)
//   migrateLocalRecordsToServer(localRecords)
//
// ── ACCOUNT (used by Settings.jsx, Admin.jsx) ───────────────────────────────
//   deleteOwnAccount()
//   adminDeleteUser(email)
//
// All calls use credentials: 'include' so the session cookie is forwarded.
// Errors propagate as ApiError (thrown by apiClient.js) — callers handle them.

import { apiFetch, apiDelete } from './apiClient.js'

// ── Records ──────────────────────────────────────────────────────────────────

/**
 * Fetch all saved tax records for the signed-in user.
 * @returns {Promise<Array>}
 */
export async function fetchRecordsFromServer() {
  const data = await apiFetch('/records', { credentials: 'include' })
  return Array.isArray(data) ? data : []
}

/**
 * Create or update a tax record on the server (PUT — upsert by record.id).
 * @param {object} record
 * @returns {Promise<object>}
 */
export async function upsertRecordOnServer(record) {
  // ─── AUDIT DATA-LOSS FIX (verification finding, July 2026) ─────────────────
  // Client/server contract mismatch: this client was migrated to single-record
  // upserts, but the deployed PUT /records backend stores the payload as the
  // user's ENTIRE record set (the previous client PUT the full array). The first
  // single-record PUT therefore REPLACED the whole store and destroyed every
  // sibling record. Until the backend implements keyed per-record upserts, the
  // client must speak the contract the backend actually implements:
  //   1. GET the current server list.
  //   2. Merge this record into it by id (replace-or-prepend).
  //   3. PUT the ENTIRE merged array.
  // If the pre-merge GET fails we THROW rather than PUT — a blind PUT of one
  // record is exactly the destructive write this fix exists to prevent; the
  // caller (syncRecordToServer) already treats a throw as "cache locally".
  // TODO(backend): once PUT /records/:id keyed upserts exist server-side,
  // restore the single-record PUT and delete this merge step.
  let serverList
  try {
    const fetched = await fetchRecordsFromServer()
    serverList = Array.isArray(fetched) ? fetched : (fetched ? [fetched] : [])
  } catch (e) {
    throw new Error('records pre-merge fetch failed — aborting PUT to avoid clobbering sibling records: ' + (e && e.message))
  }
  const idx = serverList.findIndex(r => r && String(r.id) === String(record.id))
  const merged = idx >= 0
    ? serverList.map((r, i) => (i === idx ? record : r))
    : [record, ...serverList]
  await apiFetch('/records', {
    method: 'PUT',
    credentials: 'include',
    body: merged,
  })
  return record
}

/**
 * Permanently delete a single tax record by ID.
 * @param {string} recordId
 * @returns {Promise<void>}
 */
export async function deleteRecordOnServer(recordId) {
  return apiFetch(`/records/${recordId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
}

/**
 * One-time migration: upload local records to the server after M2 launch.
 * Guarded by a per-user localStorage flag so it runs at most once.
 * @param {Array} localRecords
 * @returns {Promise<void>}
 */
export async function migrateLocalRecordsToServer(localRecords) {
  const email = localStorage.getItem('ts360_email') || ''
  if (!email) return
  const flag = 'ts360_migrated_records_server_' + email
  if (localStorage.getItem(flag)) return
  const list = Array.isArray(localRecords) ? localRecords : []
  for (const rec of list) {
    if (rec && rec.id != null) {
      try {
        await upsertRecordOnServer(rec)
      } catch (e) {
        // Non-fatal: skip records that fail to migrate
      }
    }
  }
  localStorage.setItem(flag, '1')
}

// ── Account ──────────────────────────────────────────────────────────────────

/**
 * Permanently delete the signed-in user's own account.
 * Backend cancels Stripe, erases the user + all tax records, writes an audit
 * entry, and clears the session cookie. Resolves to the server's result object;
 * throws ApiError on failure (e.g. a Stripe error leaves the account intact).
 * @returns {Promise<object>}
 */
export async function deleteOwnAccount() {
  return apiDelete('/account', { credentials: 'include' })
}

/**
 * Admin-only: permanently delete a specified user by email.
 * Throws 403 if the caller is not an admin; 400 if an admin targets themselves.
 * @param {string} email
 * @returns {Promise<object>}
 */
export async function adminDeleteUser(email) {
  return apiDelete(`/admin/users/${encodeURIComponent((email || '').trim())}`, {
    credentials: 'include',
  })
}
