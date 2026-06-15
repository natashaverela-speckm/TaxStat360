// src/utils/migrateLegacyKeys.js
//
// One-time migration of legacy, non-namespaced localStorage keys onto the
// canonical `ts360_` prefix (consistency audit C-4).
//
// WHY: Most of the app's localStorage keys are already `ts360_`-prefixed, but a
// handful of older keys were written bare (`plan`, `entityType`, `userName`,
// `billing`, `pendingEmail`). Bare keys risk colliding with other scripts on the
// same origin and are easy to miss when clearing state. This migration renames
// them in place so the prefix is uniform everywhere.
//
// SAFETY / why this won't log anyone out or reset their plan:
//   - It runs ONCE at app startup (from main.jsx), BEFORE any component reads
//     these keys, so the first post-deploy load already sees the new keys.
//   - It is NON-DESTRUCTIVE: it copies old -> new only when the new key is absent,
//     so it never clobbers a fresher namespaced value, then removes the old key.
//   - It is IDEMPOTENT even if the guard flag is lost: the "new key absent" check
//     plus the remove-old step make any re-run a no-op. The flag is purely an
//     optimization to skip the loop after the first successful run.
//   - All write sites are updated to the new keys in the same change, so bare keys
//     are never re-created after this runs.

const LEGACY_KEY_MAP = {
  plan: 'ts360_plan',
  entityType: 'ts360_entityType',
  userName: 'ts360_userName',
  billing: 'ts360_billing',
  pendingEmail: 'ts360_pendingEmail',
}

const MIGRATION_FLAG = 'ts360_migrated_keys_v1'

export function migrateLegacyKeys() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return

    for (const [oldKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
      const oldVal = localStorage.getItem(oldKey)
      if (oldVal == null) continue // nothing stored under the bare key
      // Only seed the new key if it isn't already set (don't overwrite newer state).
      if (localStorage.getItem(newKey) == null) {
        localStorage.setItem(newKey, oldVal)
      }
      localStorage.removeItem(oldKey) // retire the bare key
    }

    localStorage.setItem(MIGRATION_FLAG, '1')
  } catch {
    // localStorage unavailable (private mode, storage disabled, SSR) — skip silently.
    // Reads fall back to their existing defaults; nothing breaks.
  }
}
