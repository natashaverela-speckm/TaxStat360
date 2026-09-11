// src/utils/sessionState-export-credentials.test.js
//
// AUDIT M1 (second launch audit, Sep 2026) — "EXPORT THIS DEVICE'S DATA" WROTE A LIVE
// SESSION TOKEN AND THE 2FA-SKIP RECORD TO A FILE DESCRIBED AS "SESSION PREFERENCES".
//
// exportAllDeviceData() swept localStorage by prefix, so everything starting with
// ts360_ went into the download — including ts360_token (the bearer credential) and
// ts360_trusted_device (the record that skips MFA, see H6). A user who forwards that
// file to support, a CPA or a bookkeeper has handed over a working login.
//
// The fix is a pattern, not the two-key denylist the finding proposed, for two reasons:
//   1. Provider OAuth tokens (ts360_quickbooks_token, ts360_xero_token,
//      ts360_xero_refresh, ts360_wave_token, ts360_freshbooks_token) are no longer
//      written — they moved server-side — but a returning user's browser can still hold
//      values from before that migration, and a prefix sweep exports them happily.
//   2. A prefix sweep opts every FUTURE key in by default. For an export, the safe
//      default is the opposite.

import { describe, it, expect } from 'vitest'
import { isExportableKey } from './sessionState.js'

// Every ts360_* key in the codebase at the time of the fix, so the two lists below are
// exhaustive rather than illustrative.
const MUST_BE_EXCLUDED = [
  'ts360_token',              // live bearer credential
  'ts360_trusted_device',     // MFA bypass record (H6)
  'ts360_session',            // legacy session record
  'ts360_session_owner',      // H3's ownership stamp
  'ts360_session_start',
  'ts360_logged_in',
  'ts360_quickbooks_token',   // legacy provider credentials — no longer written, but
  'ts360_xero_token',         // a returning user's browser can still hold them
  'ts360_xero_refresh',
  'ts360_wave_token',
  'ts360_freshbooks_token',
]

const MUST_BE_INCLUDED = [
  'ts360_entities', 'ts360_entities_raw', 'ts360_step1_entities', 'ts360_step1_draft',
  'ts360_f1040', 'ts360_k1', 'ts360_records', 'ts360_records_default', 'ts360_taxyear',
  'ts360_biz_name', 'ts360_biz_ein', 'ts360_biz_address', 'ts360_entityType',
  'ts360_email', 'ts360_userName', 'ts360_plan', 'ts360_billing',
  'ts360_active_record_id', 'ts360_active_record_name', 'ts360_isCoopPatron',
  'ts360_idle_timeout_mins', 'ts360_disclaimer_seen', 'ts360_cookie_consent',
  'ts360_dismissed_risks', 'ts360_email_verified', 'ts360_mfa_enabled',
  'ts360_login_history', 'ts360_first_run', 'ts360_dirty',
  'plan', 'userName',
]

describe('M1 — credentials never enter the export', () => {
  for (const key of MUST_BE_EXCLUDED) {
    it(`excludes ${key}`, () => {
      expect(isExportableKey(key)).toBe(false)
    })
  }
})

describe('M1 — the export still contains the user\'s actual data', () => {
  // The failure mode in the other direction: a denylist so broad it guts the feature.
  // These are the keys a data export exists to deliver.
  for (const key of MUST_BE_INCLUDED) {
    it(`includes ${key}`, () => {
      expect(isExportableKey(key)).toBe(true)
    })
  }
})

describe('M1 — the pattern generalises to keys that do not exist yet', () => {
  it('catches a future credential key by shape', () => {
    for (const key of [
      'ts360_api_token', 'ts360_refresh_token', 'ts360_client_secret',
      'ts360_auth_header', 'ts360_password_hash', 'ts360_stripe_secret',
      'ts360_plaid_token', 'ts360_session_id',
    ]) {
      expect(isExportableKey(key), `${key} should be excluded`).toBe(false)
    }
  })

  it('does not exclude ordinary data keys that merely look similar', () => {
    // Guard against the pattern over-reaching: these are data, not credentials.
    for (const key of [
      'ts360_tokenizer_pref', 'ts360_sessions_completed', 'ts360_refreshed_at_display',
    ]) {
      expect(isExportableKey(key), `${key} should be included`).toBe(true)
    }
  })

  it('rejects keys outside the app namespace entirely', () => {
    for (const key of ['', null, undefined, 'other_app_token', 'randomKey']) {
      expect(isExportableKey(key)).toBe(false)
    }
  })
})

describe('M1 — the download tells the user what is NOT in it', () => {
  it('the notice says credentials are excluded', () => {
    // eslint-disable-next-line no-undef
    const { readFileSync } = require('node:fs')
    const settings = readFileSync(new URL('../components/Settings.jsx', import.meta.url), 'utf8')
    expect(settings).toMatch(/Security credentials[^']*deliberately excluded/)
    expect(settings).not.toMatch(/Tax records, session preferences, and account metadata are included/)
  })
})
