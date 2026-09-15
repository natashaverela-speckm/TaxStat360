# §199A per-business allocation fix (full pass, 15 Sep 2026)

Apply AFTER the simulator fix (SIMULATOR-FIX.patch) — the patch is generated against that state.
Full replacement files: src/lib/taxCalc.js · src/lib/taxCalc-fifth-read-passive-k1.test.js ·
src/lib/taxCalc-qbi-aggregation.test.js · CHANGELOG.md

Verified: 109 files / 1,631 tests passing · eslint 0 errors · build OK.
Post-deploy check: Single 2026, S-Corp $400k receipts / $100k expenses / $100k officer comp + Sole Prop $150k / $50k
→ §199A line **−$38,470** (was −$37,604), total **$97,846** (was $98,149).
