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
// Usage:  node scripts/assertLiveHeaders.mjs [url]
//         SITE_URL=https://staging.example.com node scripts/assertLiveHeaders.mjs
// Exits 0 when every requirement holds, 1 otherwise, printing what was actually served.

export const DEFAULT_URL = 'https://www.taxstat360.com/'

// Each rule is checked against the live response. `test` returns null on pass, or a
// string describing what was wrong.
export const HEADER_RULES = [
  {
    name: 'Content-Security-Policy',
    test: (v) => {
      if (!v) return 'absent — this is exactly the September failure mode'
      if (/[\r\n]/.test(v)) return 'contains a newline; a header value cannot, and CloudFront will drop it'
      const required = [
        'default-src', 'script-src', 'style-src', 'font-src', 'img-src', 'connect-src',
        'frame-src', 'worker-src', 'frame-ancestors', 'object-src', 'base-uri',
        'form-action', 'upgrade-insecure-requests',
      ]
      const missing = required.filter((d) => !v.includes(d))
      if (missing.length) return `missing directive(s): ${missing.join(', ')}`
      if (/img-src[^;]*\shttps:(\s|;|$)/.test(v)) return "img-src permits any https host (M8 regression)"
      if (/script-src[^;]*'unsafe-inline'/.test(v)) return "script-src allows 'unsafe-inline' (M-7 regression)"
      if (v.length < 200) return `suspiciously short (${v.length} chars)`
      return null
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
    test: (v) => (v ? null : 'absent'),
  },
  {
    name: 'Permissions-Policy',
    test: (v) => (v ? null : 'absent'),
  },
]

/**
 * Evaluate the rules against a header lookup function.
 * @param {(name: string) => string | null} getHeader
 * @returns {{ name: string, problem: string, value: string | null }[]} failures
 */
export function checkHeaders(getHeader) {
  const failures = []
  for (const rule of HEADER_RULES) {
    const value = getHeader(rule.name)
    const problem = rule.test(value)
    if (problem) failures.push({ name: rule.name, problem, value: value ?? null })
  }
  return failures
}

async function main() {
  const url = process.argv[2] || process.env.SITE_URL || DEFAULT_URL
  process.stdout.write(`Checking live security headers: ${url}\n`)

  let res
  try {
    res = await fetch(url, { method: 'GET', redirect: 'follow' })
  } catch (e) {
    process.stderr.write(`\nFAILED: could not reach ${url}\n  ${e.message}\n`)
    process.exit(1)
  }

  const failures = checkHeaders((n) => res.headers.get(n))

  if (!failures.length) {
    const csp = res.headers.get('Content-Security-Policy') || ''
    process.stdout.write(`OK — ${HEADER_RULES.length} header requirements met (CSP ${csp.length} chars).\n`)
    process.exit(0)
  }

  process.stderr.write(`\nFAILED: ${failures.length} header requirement(s) not met on the LIVE response.\n\n`)
  for (const f of failures) {
    process.stderr.write(`  ${f.name}: ${f.problem}\n`)
    if (f.value) process.stderr.write(`    served: ${f.value.slice(0, 160)}\n`)
  }
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
