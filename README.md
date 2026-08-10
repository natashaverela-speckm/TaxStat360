# TaxStat360

A React + Vite web app that estimates federal income tax across entity types
(sole proprietor, S-Corp, partnership/LLC, C-Corp) and surfaces planning and
audit-risk guidance based on the result.

## Where things live

This repo follows a strict separation between tax math, UI, and shared
utilities — see **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full, CI-enforced
rules before touching anything under `src/`. In short:

- `src/lib/` — the tax engine (`taxCalc.js`), statutory constants
  (`constants.js`), and related calculation modules. This is the single
  source of truth for all tax formulas and rates.
- `src/components/` — UI screens and components. Components call into
  `src/lib/` for any tax number; they never compute one inline.
- `src/utils/` — cross-cutting helpers (API client, session storage gateway,
  entity/field helpers) shared across components.

Two other docs are part of the same contract:

- **[KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)** — deliberate modeling
  simplifications and owner-ratified decisions, with exposure direction
  stated for each.
- **[CHANGELOG.md](./CHANGELOG.md)** — the history of audits, fixes, and the
  reasoning behind them. Check here before assuming something is a bug —
  it may be a documented, deliberate trade-off.

## Getting started

```bash
npm install
npm run dev        # start the local dev server (Vite)
```

## Testing

```bash
npm test           # run the full vitest suite once
npm run test:watch # watch mode
```

The suite includes `src/architecture-invariants.test.js`, which scans
production source for regressions of specific past issues (duplicated tax
formulas, direct `sessionStorage` access outside the sanctioned gateway, bare
`catch` blocks, etc.) and fails the build if one reappears. This runs in CI
on every push — see `ARCHITECTURE.md` §3 and §7 for what it checks and why.

## Building

```bash
npm run build      # production build via Vite
npm run preview    # preview the production build locally
npm run lint       # ESLint
```

## Before you change tax logic

Read `ARCHITECTURE.md` §1 and §6 first. Every function in
`src/lib/taxCalc.js` is expected to have a corresponding test file
(`taxCalc-*.test.js`), and every tax-relevant code path should carry a
comment naming the IRC section or Treasury guidance it implements. Tests are
labeled `SPEC` (value independently verified against an IRS/Treasury source)
or `CHAR` (pins current behavior as a refactor guard, not proof of
correctness) — see ARCHITECTURE.md §6 for the convention.
