// Server-backed saved records. Session cookie required.
import { apiFetch } from './apiClient.js'

export async function fetchRecordsFromServer() {
  const data = await apiFetch('/records', { credentials: 'include' })
  return Array.isArray(data) ? data : []
}

export async function upsertRecordOnServer(record) {
  return apiFetch('/records', {
    method: 'PUT',
    credentials: 'include',
    body: record,
  })
}

export async function deleteRecordOnServer(recordId) {
  return apiFetch(`/records/${recordId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
}

/** One-time: upload local records to server after M2 launch. */
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
        console.warn('records migrate skip', rec.id, e)
      }
    }
  }
  localStorage.setItem(flag, '1')
}
