// src/architecture-invariants.test.js
//
// M4 (audit F-04 / F-06, Jul 2026) — ARCHITECTURE.md invariants, CI-enforced.
//
// ARCHITECTURE.md §3 ships verification greps that "must return empty" — but a
// grep in a doc only protects the codebase when someone remembers to run it.
// This file runs the same checks as tests, so BOTH deploy paths (GitHub Actions
// and, once amplify.yml gains the test step, Amplify) refuse to ship a
// violation. The July 6 incident showed why: invariants that aren't executed
// on every push eventually regress.
//
// Each check scans production source only (test files excluded — tests may
// legitimately exercise storage directly).

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname)

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { walk(p, out); continue }
    if (!/\.(jsx?|)$/.test(name) || !/\.(js|jsx)$/.test(name)) continue
    if (/\.test\.(js|jsx)$/.test(name)) continue
    out.push(p)
  }
  return out
}

const files = walk(SRC)
const read = (p) => readFileSync(p, 'utf8')
const rel = (p) => p.slice(SRC.length + 1)

// Strip line comments and block comments so prose mentioning an API name
// doesn't false-positive. Crude but sufficient for these patterns.
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function violations(pattern, allowFiles) {
  const hits = []
  for (const f of files) {
    const r = rel(f)
    if (allowFiles.some((a) => r === a)) continue
    const code = stripComments(read(f))
    if (pattern.test(code)) hits.push(r)
  }
  return hits
}

describe('ARCHITECTURE invariants (CI-enforced)', () => {

  it('§3 — no direct sessionStorage access outside sessionState.js / integrations.js', () => {
    // integrations.js is sanctioned: the OAuth token deliberately lives in both
    // stores (see its header), and its accessors are the single audited home.
    expect(violations(/sessionStorage\s*\.\s*(getItem|setItem|removeItem|clear)/,
      ['utils/sessionState.js', 'utils/integrations.js'])).toEqual([])
  })

  it('§3 (M4 extension) — no raw integration-field storage outside integrations.js', () => {
    // localStorage.<op>(integrationKey(...)) must not reappear in components;
    // readIntegrationField / writeIntegrationField / token helpers are the API.
    expect(violations(/localStorage\s*\.\s*(getItem|setItem|removeItem)\s*\(\s*integrationKey\s*\(/,
      ['utils/integrations.js'])).toEqual([])
  })

  it('§1 (M3 extension) — the P&L net-derivation rule exists only in entityPredicates.js', () => {
    // The 11 inline copies of `netProfit ?? (nf(gross) - nf(expenses))` were the
    // audit\u2019s highest-count duplication (F-04). getEntityPnlNet is the only home.
    expect(violations(/netProfit\s*\?\?\s*\(\s*nf\(/,
      ['utils/entityPredicates.js'])).toEqual([])
  })

  it('§1 — components do not hardcode the §469(i)/§172 statutory figures (M1 regression guard)', () => {
    // The literals that shadowed PAL_*/NOL constants must not creep back into
    // component code. The engine and constants files are the sanctioned homes.
    expect(violations(/25000\s*-\s*Math\.max\(0,\s*\(?\s*\w+\s*-\s*100000\s*\)?\s*\*\s*0?\.5/,
      ['taxCalc.js', 'constants.js'])).toEqual([])
  })

  it('§7 (M5) — no bare silent catches: every swallowed error carries a justification', () => {
    // The error-handling convention (ARCHITECTURE §7, audit F-10): a catch may
    // swallow only with an explanatory comment; otherwise it must surface, log,
    // or re-throw. This regex flags `catch {}` / `catch (e) {}` bodies that are
    // empty AFTER comment-stripping is NOT applied — i.e. truly bare, no comment.
    // NOTE: this check runs on RAW source (comments count as justification), so
    // it uses its own scan instead of the stripped-source helper above.
    const bare = /catch\s*(\([^)]*\))?\s*\{\s*\}/
    // M7 closed the Onboarding.jsx allowance — the convention now holds with
    // ZERO exceptions across production source.
    const allow = []
    const hits = []
    for (const f of files) {
      const r = rel(f)
      if (allow.some((a) => r === a)) continue
      if (bare.test(read(f))) hits.push(r)
    }
    expect(hits).toEqual([])
  })
})
