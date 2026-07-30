TaxStat360 — Post-Pass-5 Cleanup — Deploy Instructions
========================================================

Two files were touched. Here's exactly what to do with each.

1) DELETE this file from your repo — do not replace it, just remove it:

   src/TaxReturn.jsx   (the copy at the REPO ROOT, not the one in
                        src/components/ — that one is correct and
                        stays untouched)

   Why: it's an orphaned, unimported duplicate of
   src/components/TaxReturn.jsx dating back to April 19. Nothing
   imports it, and it's missing four rounds of later fixes (F12,
   F15, F16, C2). Confirmed safe to delete — full test suite (746
   tests), production build, and lint all still pass clean after
   removing it.

   Suggested commit message:
   "chore: remove orphaned duplicate src/TaxReturn.jsx"

2) REPLACE this file with the KNOWN_LIMITATIONS.md included in this
   zip (full contents, drop-in replacement — just overwrite the
   existing file at the repo root):

   KNOWN_LIMITATIONS.md

   Why: three entries (GP-QBI, QBI-AGG-DEFAULT, PARTNER-BASIS)
   described tax-modeling gaps that Pass 5 already fixed in code,
   but the doc was never updated to say so. Two are now marked
   fully RESOLVED; the third (PARTNER-BASIS) is marked resolved only
   for the §704(d) piece, since §465 at-risk and §469 passive limits
   genuinely remain unmodeled — the rewrite says that explicitly
   rather than overclaiming.

   Suggested commit message:
   "docs: mark GP-QBI, PARTNER-BASIS, QBI-AGG-DEFAULT resolved in
   KNOWN_LIMITATIONS.md"

Verification already run on this exact pair of changes (before and
after, on a clean clone of master @ bd33207):
  - Tests:  746 / 746 passing, no change
  - Build:  vite build succeeds, no change
  - Lint:   0 errors both before and after (warnings drop 30 -> 27,
            all three tied to the deleted file's own stale
            dependency arrays)

No other files need to change. Everything else audited from the
five closing reports (Pass 1-5) was verified already correctly
implemented on master — see the consolidated roadmap doc from
earlier in this conversation for the full audit trail.
