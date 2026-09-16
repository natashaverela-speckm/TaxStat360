TaxStat360 — SEVENTH PASS (independent fresh-eyes audit) — 16 Sep 2026
=====================================================================

Applies to master at commit c2ec130 ("timing hotfix" = the deployed site as of 16 Sep).

ONE COMMIT, please (the Amplify test gate runs `npm run test` before `npm run build`;
partial uploads fail it because new tests reference new files).

Option A — patch (cleanest):
    git checkout master && git pull
    git apply --check SEVENTH-PASS.patch      # must print nothing
    git apply SEVENTH-PASS.patch
    git add -A && git commit -m "Seventh pass — independent fresh-eyes audit" && git push

Option B — replacement files: copy every file in this folder (same relative paths) over the
repo, INCLUDING the 5 new files, then commit everything together:
    NEW  src/utils/rentalPortfolio.js
    NEW  src/utils/ccorpLayer.js
    NEW  src/lib/taxCalc-seventh-pass.test.js
    NEW  src/lib/seventh-pass-surfaces.test.js
    NEW  src/components/seventh-pass-taxreturn.test.jsx
    MOD  index.html, CHANGELOG.md, KNOWN_LIMITATIONS.md
    MOD  src/lib/taxCalc.js, constants.js, articles.js, aiAnalysisTaxMath.js, positionWorksheets.js
    MOD  src/components/TaxReturn.jsx, CalculateTaxInner.jsx, Dashboard.jsx, EntityCompareModal.jsx,
         AIAnalysis.jsx, Aria.jsx, Landing.jsx
    MOD  src/utils/calcSelector.js, fieldManifest.js
    MOD  tests: taxCalc.test.js, taxCalc-engine.test.js, taxCalc-ccorp-audit.test.js,
         taxCalc-amt-1250-collectibles.test.js, taxCalc-nii-loss-floor.test.js,
         taxCalc-reasonable-comp.test.js, positionWorksheets.test.js

Verified before packaging: 113 files / 1,699 tests green · eslint 0 errors (28 pre-existing
warnings, unchanged) · `npm run build` OK. Full findings list: CHANGELOG.md → "Seventh pass".
