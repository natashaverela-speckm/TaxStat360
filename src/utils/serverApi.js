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
  // ─── AUDIT DATA-LOSS FIX, REVISED (verification finding, July 2026) ────────
  // Empirically established against the live backend during verification:
  //   • PUT /records REQUIRES a single JSON object (an array is rejected with
  //     "Record must be a JSON object").
  //   • PUT upserts by record id — a controlled probe confirmed siblings are
  //     preserved (PUT of record B left record A intact).
  // An earlier revision of this function merged and PUT the full array on the
  // theory that the backend stored the payload as the user's entire record set;
  // the array rejection and the probe disproved that. HOWEVER, a real incident
  // remains unexplained: during verification, a save coincided with the loss of
  // ALL sibling records server-side. The mechanism was not reproducible from
  // the client and is suspected to be backend-side (review the /records Lambda
  // and its storage writes). Until that is found, this function wears a
  // seatbelt:
  //   1. Snapshot the server list BEFORE the upsert.
  //   2. PUT the single record (the contract the backend implements).
  //   3. Re-fetch and DIFF: any sibling present before but missing after is
  //      immediately re-PUT from the snapshot (self-heal), with a loud
  //      console.error so the incident is visible in monitoring.
  // The snapshot/diff adds two GETs per save — cheap insurance for data whose
  // loss is unrecoverable. Remove once the backend cause is found and fixed.
  let before = []
  try {
    const fetched = await fetchRecordsFromServer()
    before = Array.isArray(fetched) ? fetched : []
  } catch (e) { /* snapshot unavailable — proceed; upsert is still per-id */ }

  const saved = await apiFetch('/records', {
    method: 'PUT',
    credentials: 'include',
    body: record,
  })

  if (before.length > 1) {
    try {
      const fetchedAfter = await fetchRecordsFromServer()
      const after = Array.isArray(fetchedAfter) ? fetchedAfter : []
      const afterIds = new Set(after.map(r => String(r && r.id)))
      const lost = before.filter(r =>
        r && String(r.id) !== String(record.id) && !afterIds.has(String(r.id)))
      for (const missing of lost) {
        console.error('[records] sibling record lost during save — self-healing restore', missing.id, missing.name || '')
        try {
          await apiFetch('/records', { method: 'PUT', credentials: 'include', body: missing })
        } catch (e2) {
          console.error('[records] self-heal re-PUT failed for', missing.id, e2)
        }
      }
    } catch (e) { /* post-verify unavailable — nothing destructive was issued */ }
  }
  return saved
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
