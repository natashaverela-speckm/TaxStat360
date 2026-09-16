# Installment-timing hotfix (16 Sep 2026)

Live symptom: Step 2 card read "2 of 4 left" next to "next: Jan 15, 2027" on Sep 16.
Cause: today was passed as the UTC YYYY-MM-DD and parsed with new Date(str) → UTC midnight,
which US-local getters shift back one day. Fix: timezone-free calendar-date parsing in the
engine; callers pass the LOCAL calendar date (new localCalendarDate() in utils/money.js);
the "next" label uses the same inclusive local-day rule.

UPLOAD ALL of these in ONE commit (or `git apply TIMING-HOTFIX.patch` from the repo root):
  src/lib/taxCalc.js
  src/lib/taxCalc-installment-timing.test.js
  src/utils/money.js            ← NEW export; TaxReturn/Dashboard/calcSelector import it,
  src/utils/calcSelector.js        so a components-only upload will FAIL the build again
  src/components/TaxReturn.jsx
  src/components/Dashboard.jsx
  CHANGELOG.md, KNOWN_LIMITATIONS.md   (docs — these two were still missing from master)

Verified: 110 files / 1,649 tests passing under UTC, New York, Los Angeles and Auckland; lint 0 errors; build OK.
Post-deploy (Sep 16): any 2026 record with a balance → "1 of 4 left", figure = full balance, "next: Jan 15, 2027".
