// src/windowOpenNoopener.test.js
//
// L-7 (fresh-pass audit, Aug 2026) — every window.open() call in the codebase
// must pass 'noopener' as the third argument. Both existing calls open a
// hardcoded, trusted Stripe URL (so risk was always low), but best practice is
// to never leave a new tab with an opener reference back to this page.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC_DIR = new URL('./', import.meta.url)

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('window.open() calls always pass noopener (re-audit, L-7)', () => {
  const files = walk(path.dirname(new URL(SRC_DIR).pathname))
  const offenders = []
  let callCount = 0

  for (const file of files) {
    if (file.endsWith('.test.js') || file.endsWith('.test.jsx')) continue
    const text = fs.readFileSync(file, 'utf8')
    const matches = text.match(/window\.open\([^)]*\)/g) || []
    for (const call of matches) {
      callCount += 1
      if (!/noopener/.test(call)) {
        offenders.push(`${path.relative(path.dirname(new URL(SRC_DIR).pathname), file)}: ${call}`)
      }
    }
  }

  it('found at least the two known window.open() call sites', () => {
    expect(callCount).toBeGreaterThanOrEqual(2)
  })

  it('no window.open() call is missing noopener', () => {
    expect(offenders).toEqual([])
  })
})
