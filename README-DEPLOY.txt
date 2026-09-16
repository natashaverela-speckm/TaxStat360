TaxStat360 — PAL-K1-CARRYFORWARD (prior-year suspended passive K-1 loss) — 16 Sep 2026
Applies to master after the seventh-pass commit. ONE commit, please.

  git apply --check PAL-K1-CARRYFORWARD.patch && git apply PAL-K1-CARRYFORWARD.patch
  git add -A && git commit -m "Prior-year suspended passive K-1 loss (Form 8582 line 2c)" && git push

Files (12; 1 new test):
  NEW src/lib/taxCalc-passive-k1-carryforward.test.js
  MOD src/lib/taxCalc.js, src/lib/aiAnalysisTaxMath.js
  MOD src/components/CalculateTaxInner.jsx, TaxReturn.jsx, Dashboard.jsx, AIAnalysis.jsx, Landing.jsx,
      seventh-pass-taxreturn.test.jsx
  MOD index.html, CHANGELOG.md, KNOWN_LIMITATIONS.md
Verified: 114 files / 1,710 tests green · eslint 0 errors (28 pre-existing warnings) · build OK.
