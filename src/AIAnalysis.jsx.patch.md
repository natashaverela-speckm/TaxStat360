# AIAnalysis.jsx — Targeted Patches (F-02 + F-10)
# Apply as exact find-and-replace in your editor.
# Run `npm run test` after applying. Full smoke test (AI Analysis tab with a loaded record) recommended.
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PATCH 1 — F-10: Add readBusinessInfo to the sessionState import (line 6)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FIND (exact string, line 6):
import { readPersonalContext, writePersonalContext, writeTaxYear, readTaxYear, readStep1State, writeStep1State, normalizeF1040 } from './utils/sessionState.js'
#
# REPLACE WITH:
import { readPersonalContext, writePersonalContext, writeTaxYear, readTaxYear, readStep1State, writeStep1State, normalizeF1040, readBusinessInfo } from './utils/sessionState.js'
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PATCH 2 — F-02: Add CURRENT_TAX_YEAR to constants import
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# AIAnalysis.jsx does NOT currently import from constants.js.
# Look at line 8-11 area for the existing import block and add a new import line.
# The import from entityPredicates.js is on line 10.
# Add this import AFTER the existing imports from utils/:
#
# ADD THIS LINE (after line 10, the entityPredicates import):
import { CURRENT_TAX_YEAR } from './constants.js'
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PATCH 3 — F-10: Replace the getOnboardingBizInfo function body (lines 252-257)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FIND (exact block, lines 249-258):
// O7 FIX: read onboarding business name/EIN/address from sessionStorage.
// Written by Onboarding.jsx BusinessScreen after the O7 patch.
// Falls back gracefully if not set (pre-patch sessions, skipped step).
function getOnboardingBizInfo() {
  return {
    bizName: sessionStorage.getItem('ts360_biz_name') || '',
    bizEin: sessionStorage.getItem('ts360_biz_ein') || '',
    bizAddress: sessionStorage.getItem('ts360_biz_address') || '',
  }
}
#
# REPLACE WITH:
// O7 FIX: read onboarding business name/EIN/address from sessionStorage.
// F-10 FIX: replaced direct sessionStorage.getItem('ts360_biz_*') calls with
// readBusinessInfo() from sessionState.js. Key strings are now centralized —
// if a key is renamed, only sessionState.js needs updating.
function getOnboardingBizInfo() {
  return readBusinessInfo()
}
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PATCH 4 — F-02: Replace || 2025 occurrences (lines ~302, ~394)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# There are 2 confirmed occurrences in AIAnalysis.jsx. Replace both:
#
# OCCURRENCE 1 (line ~302):
# FIND:
  const year = parseInt(b.year) || 2025
# REPLACE WITH:
  const year = parseInt(b.year) || CURRENT_TAX_YEAR
#
# OCCURRENCE 2 (line ~394, inside the QBI preview block):
# FIND:
    const _year = parseInt(b.year) || 2025
# REPLACE WITH:
    const _year = parseInt(b.year) || CURRENT_TAX_YEAR
#
# NOTE: The GitHub search confirmed exactly 6 matches for "|| 2025" in AIAnalysis.jsx.
# Lines 302 and 394 are both year-fallback patterns on b.year. If your editor's
# find shows additional occurrences, check each one — only replace where the
# context is a taxYear fallback (not a comparison to a specific historical year).
