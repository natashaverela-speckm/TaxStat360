// scripts/assertLiveHeaders.mjs
//
// AUDIT H13 (second launch audit, Sep 2026) — ASSERT THE LIVE RESPONSE, NOT THE FILE.
//
// September's incident: extra indentation in customHttp.yml's folded CSP block left 12
// raw newlines in the header value, an HTTP header value cannot contain them, and
// CloudFront dropped the header entirely. Every other header applied normally. The unit
// test passed throughout, because it read the YAML file and never the response.
//
// H12 added a guard for that specific YAML trap. This is the general case: whatever the
// cause — a YAML mistake, a platform change, or a deploy through a pipeline that does
// not apply customHttp.yml at all — if the live response is missing a header, this
// fails. It is the only check that does not care WHY.
//
// ── FRESH-EYES F-15 (11 Sep 2026): ASSERT VALUES, NOT NAMES ─────────────────────────
//
// The first version checked that 13 directive NAMES appeared somewhere in the CSP string
// and applied a value assertion to two of them. A live policy reading
//   default-src *; script-src *; object-src *; base-uri *; frame-ancestors *; ...
// contained every required name, had no bare `https:` in img-src and no 'unsafe-inline'
// in script-src, and exited 0. The two value checks that did exist were evadable:
// `img-src 'self' https://*` slipped the regex because `https:` was followed by `/`.
// Referrer-Policy accepted `unsafe-url`; Permissions-Policy accepted any non-empty
// string; `style-src 'unsafe-inline'` was never examined. H13's premise — assert the live
// response — was right; the assertions just did not assert much.
//
// Now the CSP is PARSED into directive → source-set and two things are checked:
//   1. Structural invariants that must hold whatever the policy says (no wildcards, no
//      bare schemes in script/connect/form-action, 'none' where 'none' belongs, no
//      unsafe-* in script-src, and so on).
//   2. Equality with the policy customHttp.yml declares, when that file is readable —
//      the served policy must be the configured policy, directive for directive. A
//      served policy that is merely "valid" but not the one in the repo is a second
//      header source, which is the H13 finding all over again.
//
// The check also fetches /index.html, not only /. customHttp.yml gives /index.html its
// own pattern (Cache-Control); if the platform applies only the most specific pattern,
// that one document — the one where the CSP matters most — would lose every security
// header, and a fetch of / alone would not notice.
//
// And it fails CLOSED on the target: with no explicit URL it exits 2 rather than
// checking the production default. The deploy workflow's own comment said a green tick
// against a hardcoded URL "would then be reassurance you have not earned." A gate that
// can pass vacuously is worse than no gate, because the tick becomes citable.
//
// Usage:  node scripts/assertLiveHeaders.mjs <url>
//         SITE_URL=https://staging.example.com node scripts/assertLiveHeaders.mjs
// Exits 0 when every requirement holds on every fetched path, 1 on a failed
// requirement, 2 when no target was given.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const DEFAULT_URL = 'https://www.taxstat360.com/'
export const CHECK_PATHS = ['/', '/index.html']

// ── CSP parsing ────────────────────────────────────────────────────────────────

/** "default-src 'self'; img-src 'self' data:" → Map { 'default-src' → Set{"'self'"}, ... } */
export function parseCsp(value) {
  const out = new Map()
  for (const raw of String(value || '').split(';')) {
    const parts = raw.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) continue
    const [name, ...sources] = parts
    out.set(name.toLowerCase(), new Set(sources))
  }
  return out
}

/**
 * Read the CSP customHttp.yml declares, assembling the folded (>-) block the same way
 * YAML does for a correctly-indented block: continuation lines joined by single spaces.
 * Returns null when the file is not readable (the live check still runs its invariants).
 */
export function readConfiguredCsp(ymlPath) {
  let yml
  try { yml = readFileSync(ymlPath, 'utf8') } catch { return null }
  const lines = yml.split('\n')
  const keyIdx = lines.findIndex((l) => /^\s*- key:\s*Content-Security-Policy\s*$/.test(l))
  if (keyIdx < 0) return null
  const valIdx = lines.findIndex((l, i) => i > keyIdx && /^\s*value:\s*>-\s*$/.test(l))
  if (valIdx < 0) return null
  const body = []
  for (let i = valIdx + 1; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) break
    if (/^\s*(-\s|#)/.test(l) && body.length) break
    if (/^\s*- key:/.test(l)) break
    body.push(l.trim())
  }
  return body.join(' ')
}

const isSchemeOnly = (s) => /^[a-z][a-z0-9+.-]*:$/i.test(s)            // https:  data:  blob:
const isWildcardHost = (s) => s === '*' || /^(https?:\/\/)?\*/.test(s) // *  https://*  *.example.com
const isKeyword = (s) => /^'.*'$/.test(s)

/**
 * Invariants every acceptable policy must satisfy, independent of the configured one.
 * Returns an array of problem strings (empty = pass).
 */
export function cspInvariantProblems(csp) {
  const p = []
  const required = [
    'default-src', 'script-src', 'style-src', 'font-src', 'img-src', 'connect-src',
    'frame-src', 'worker-src', 'frame-ancestors', 'object-src', 'base-uri',
    'form-action', 'upgrade-insecure-requests',
  ]
  for (const d of required) if (!csp.has(d)) p.push(`missing directive: ${d}`)
  if (p.length) return p

  const eq = (d, want) => {
    const have = [...csp.get(d)].sort().join(' ')
    if (have !== want) p.push(`${d} must be exactly \`${want}\`, got \`${have}\``)
  }
  eq('default-src', "'self'")
  eq('object-src', "'none'")
  eq('frame-ancestors', "'none'")
  eq('base-uri', "'self'")

  const script = csp.get('script-src')
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'strict-dynamic'"]) {
    if (script.has(bad)) p.push(`script-src allows ${bad}`)
  }
  for (const d of ['script-src', 'connect-src', 'form-action', 'frame-src', 'img-src', 'font-src', 'style-src', 'worker-src']) {
    for (const s of csp.get(d)) {
      if (isWildcardHost(s)) p.push(`${d} permits a wildcard host: ${s}`)
      if (isSchemeOnly(s) && !['data:', 'blob:'].includes(s)) p.push(`${d} permits any ${s.slice(0, -1)} host (${s})`)
      if (['data:', 'blob:'].includes(s) && ['script-src', 'connect-src', 'form-action', 'frame-src'].includes(d)) {
        p.push(`${d} permits ${s}`)
      }
      if (!isKeyword(s) && !isSchemeOnly(s) && !/^(https|wss):\/\//.test(s)) {
        p.push(`${d} lists a non-https source: ${s}`)
      }
    }
  }
  return p
}

/**
 * Directive-for-directive comparison with the configured policy.
 * Returns an array of problem strings (empty = identical).
 */
export function cspDiffProblems(served, configured) {
  const p = []
  const names = new Set([...served.keys(), ...configured.keys()])
  for (const d of [...names].sort()) {
    const a = served.get(d), b = configured.get(d)
    if (!a) { p.push(`${d}: configured but not served`); continue }
    if (!b) { p.push(`${d}: served but not configured (second header source?)`); continue }
    const extra = [...a].filter((s) => !b.has(s))
    const missing = [...b].filter((s) => !a.has(s))
    if (extra.length) p.push(`${d}: served with source(s) not in customHttp.yml: ${extra.join(' ')}`)
    if (missing.length) p.push(`${d}: configured source(s) not served: ${missing.join(' ')}`)
  }
  return p
}

// ── rules ──────────────────────────────────────────────────────────────────────

const REFERRER_OK = new Set(['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'])
const PERMISSIONS_MUST_MENTION = ['camera', 'microphone', 'geolocation']

/**
 * Each rule is checked against the live response. `test` returns null on pass, or a
 * string describing what was wrong. `configuredCsp` (optional) enables the equality
 * check against customHttp.yml.
 */
export function buildHeaderRules({ configuredCsp = null } = {}) {
  const configured = configuredCsp ? parseCsp(configuredCsp) : null
  return [
    {
      name: 'Content-Security-Policy',
      test: (v) => {
        if (!v) return 'absent — this is exactly the September failure mode'
        if (/[\r\n]/.test(v)) return 'contains a newline; a header value cannot, and CloudFront will drop it'
        const csp = parseCsp(v)
        const problems = cspInvariantProblems(csp)
        if (configured && !problems.length) problems.push(...cspDiffProblems(csp, configured))
        return problems.length ? problems.join('; ') : null
      },
    },
    {
      name: 'X-Frame-Options',
      // amplify.yml used to set SAMEORIGIN here while customHttp.yml set DENY. If this
      // ever reads SAMEORIGIN again, the second header source is back.
      test: (v) => (v && v.toUpperCase() === 'DENY' ? null : `expected DENY, got ${v || 'absent'}`),
    },
    {
      name: 'Strict-Transport-Security',
      test: (v) => {
        if (!v) return 'absent'
        const m = v.match(/max-age=(\d+)/)
        if (!m || Number(m[1]) < 31536000) return `max-age too low or missing: ${v}`
        return null
      },
    },
    {
      name: 'X-Content-Type-Options',
      test: (v) => (v && v.toLowerCase() === 'nosniff' ? null : `expected nosniff, got ${v || 'absent'}`),
    },
    {
      name: 'Referrer-Policy',
      test: (v) => {
        if (!v) return 'absent'
        const vals = v.toLowerCase().split(',').map((s) => s.trim())
        return vals.every((x) => REFERRER_OK.has(x)) ? null : `leaks the referrer: ${v}`
      },
    },
    {
      name: 'Permissions-Policy',
      test: (v) => {
        if (!v) return 'absent'
        const missing = PERMISSIONS_MUST_MENTION.filter((f) => !new RegExp(`\\b${f}\\s*=`).test(v))
        return missing.length ? `does not restrict: ${missing.join(', ')}` : null
      },
    },
  ]
}

/** Default rule set: invariants only (no configured-policy comparison). */
export const HEADER_RULES = buildHeaderRules()

/**
 * Evaluate rules against a header lookup function.
 * @param {(name: string) => string | null} getHeader
 * @param {ReturnType<typeof buildHeaderRules>} [rules]
 * @returns {{ name: string, problem: string, value: string | null }[]} failures
 */
export function checkHeaders(getHeader, rules = HEADER_RULES) {
  const failures = []
  for (const rule of rules) {
    const value = getHeader(rule.name)
    const problem = rule.test(value)
    if (problem) failures.push({ name: rule.name, problem, value: value ?? null })
  }
  return failures
}

// ── CLI ────────────────────────────────────────────────────────────────────────

async function main() {
  const target = process.argv[2] || process.env.SITE_URL
  if (!target) {
    process.stderr.write(
      'FAILED (exit 2): no target. Pass the URL this pipeline actually deployed to, as an\n' +
      'argument or SITE_URL. The check will not fall back to the production default —\n' +
      'a green tick against a site this job did not deploy proves nothing.\n' +
      `(The production default, for a MANUAL run, is ${DEFAULT_URL})\n`
    )
    process.exit(2)
  }
  const base = target.replace(/\/+$/, '')
  const here = dirname(fileURLToPath(import.meta.url))
  const configuredCsp = readConfiguredCsp(join(here, '..', 'customHttp.yml'))
  const rules = buildHeaderRules({ configuredCsp })
  process.stdout.write(`Checking live security headers at ${base} (${CHECK_PATHS.join(', ')})` +
    (configuredCsp ? ' against customHttp.yml\n' : ' — customHttp.yml not readable, invariants only\n'))

  let anyFail = false
  for (const path of CHECK_PATHS) {
    const url = base + path
    let res
    try {
      res = await fetch(url, { method: 'GET', redirect: 'follow' })
    } catch (e) {
      process.stderr.write(`\nFAILED: could not reach ${url}\n  ${e.message}\n`)
      process.exit(1)
    }
    const failures = checkHeaders((n) => res.headers.get(n), rules)
    if (!failures.length) {
      process.stdout.write(`  ${path}: OK — ${rules.length} header requirements met\n`)
      continue
    }
    anyFail = true
    process.stderr.write(`\n  ${path}: FAILED — ${failures.length} requirement(s) not met on the LIVE response\n`)
    for (const f of failures) {
      process.stderr.write(`    ${f.name}: ${f.problem}\n`)
      if (f.value) process.stderr.write(`      served: ${f.value.slice(0, 200)}\n`)
    }
  }
  if (!anyFail) process.exit(0)
  process.stderr.write(
    '\nIf this appeared after a deploy, check WHICH pipeline ran. customHttp.yml is an\n' +
    'Amplify Hosting file and has no effect on a plain S3-origin CloudFront distribution\n' +
    '(see .github/workflows/deploy.yml). That path needs a CloudFront response-headers\n' +
    'policy to serve these headers at all.\n'
  )
  process.exit(1)
}

// Only run when invoked directly, so the module can be imported by tests.
if (process.argv[1] && process.argv[1].endsWith('assertLiveHeaders.mjs')) main()
