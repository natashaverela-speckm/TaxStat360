// src/utils/migrateLegacyKeys.js
//
// One-time migration of legacy, non-namespaced localStorage keys onto the
// canonical `ts360_` prefix (consistency audit C-4).
//
// ── LIFECYCLE ────────────────────────────────────────────────────────────────
// This file is safe to remove once all active users have loaded the app
// at least once after this code was first deployed.
//
// Why it is safe: the migration is idempotent. On subsequent runs the old
// keys are already absent, so the loop is a no-op. The guard flag
// (ts360_migrated_keys_v1) means the loop is skipped entirely after the
// first successful run, adding < 1ms overhead.
//
// Suggested removal window: 90 days after the deploy that introduced this file.
// Removal steps:
//   1. Confirm >= 90 days have passed since deploy.
//   2. Delete this file.
//   3. Remove the import and migrateLegacyKeys() call from src/main.jsx (lines 6 + 10).
//   4. Open a PR titled "Remove migrateLegacyKeys — migration window elapsed".
//
// Tracking: open a GitHub issue titled "Remove migrateLegacyKeys" with a
// due date set to 90 days after first deploy, and assign it before merging.
//
// ── WHY ──────────────────────────────────────────────────────────────────────
// Most of the app's localStorage keys are already `ts360_`-prefixed, but a
// handful of older keys were written bare (`plan`, `entityType`, `userName`,
// `billing`, `pendingEmail`). Bare keys risk colliding with other scripts on
// the same origin and are easy to miss when clearing state. This migration
// renames them in place so the prefix is uniform everywhere.
//
// ── SAFETY / why this won't log anyone out or reset their plan ───────────────
//   – It runs ONCE at app startup (from main.jsx), BEFORE any component reads
//     these keys, so the first post-deploy load already sees the new keys.
//   – It is NON-DESTRUCTIVE: it copies old → new only when the new key is absent,
//     so it never clobbers a fresher namespaced value, then removes the old key.
//   – It is IDEMPOTENT even if the guard flag is lost: the "new key absent" check
//     plus the remove-old step make any re-run a no-op. The flag is purely an
//     optimization to skip the loop after the first successful run.
//   – All write sites are updated to the new keys in the same change, so bare keys
//     are never re-created after this runs.

const LEGACY_KEY_MAP = {
  plan:        'ts360_plan',
  entityType:  'ts360_entityType',
  userName:    'ts360_userName',
  billing:     'ts360_billing',
  pendingEmail:'ts360_pendingEmail',
}

const MIGRATION_FLAG = 'ts360_migrated_keys_v1'

export function migrateLegacyKeys() {
  if (localStorage.getItem(MIGRATION_FLAG)) return

  for (const [oldKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
    const oldValue = localStorage.getItem(oldKey)
    if (oldValue !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, oldValue)
    }
    if (oldValue !== null) {
      localStorage.removeItem(oldKey)
    }
  }

  localStorage.setItem(MIGRATION_FLAG, '1')
}
