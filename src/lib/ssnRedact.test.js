import { describe, it, expect } from 'vitest'
import {
  TEXT_PDF_ALNUM_THRESHOLD,
  SSN_REDACTION_MASK,
  countAlphanumeric,
  classifyTextLayer,
  detectSsnLike,
  hasSsnLike,
  redactSsnInText,
  assertNoSsnRemaining,
} from './ssnRedact.js'

/** Same bodies as fixtures/text-pdf-gate/generate_fixtures.py (Phase 0). */
const CLEAN_BODY = `SYNTHETIC FIXTURE — NOT A REAL TAX RETURN
Form 1040 U.S. Individual Income Tax Return (test)
Name: Test Taxpayer
EIN for Schedule C example: 12-3456789
Prior-year AGI (line 11): 142000
Prior-year federal tax (line 24): 18750
Form 8582 unallowed loss: 12500
Schedule D short-term capital loss carryover: 1500
Schedule D long-term capital loss carryover: 8000
Form 8995 QBI loss carryforward: 4500
NOL carryforward: none
`

const SSN_BODY = `SYNTHETIC FIXTURE — NOT A REAL TAX RETURN
Form 1040 U.S. Individual Income Tax Return (test)
Name: Test Taxpayer
Social security number: 219-09-9999
SSN (no dashes): 219099999
EIN for Schedule C example: 12-3456789
Prior-year AGI (line 11): 142000
Prior-year federal tax (line 24): 18750
Form 8582 unallowed loss: 12500
`

describe('ssnRedact (Phase 1)', () => {
  it('CHAR: text-layer threshold classifies clean vs empty', () => {
    expect(TEXT_PDF_ALNUM_THRESHOLD).toBe(40)
    expect(classifyTextLayer(CLEAN_BODY)).toBe('text')
    expect(classifyTextLayer('')).toBe('image-only')
    expect(classifyTextLayer('abc')).toBe('image-only')
    expect(countAlphanumeric(CLEAN_BODY)).toBeGreaterThanOrEqual(40)
  })

  it('CHAR: dashed SSN is detected', () => {
    const hits = detectSsnLike('SSN 219-09-9999 on form')
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('dashed')
    expect(hits[0].value).toBe('219-09-9999')
    expect(hasSsnLike('SSN 219-09-9999 on form')).toBe(true)
  })

  it('CHAR: spaced SSN is detected', () => {
    const hits = detectSsnLike('Social Security Number 219 09 9999')
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('spaced')
  })

  it('CHAR: undashed 9-digit needs SSN context', () => {
    expect(detectSsnLike('Account 219099999 balance')).toHaveLength(0)
    const hits = detectSsnLike('Social security number: 219099999')
    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe('undashed')
  })

  it('CHAR: EIN 12-3456789 is not an SSN', () => {
    expect(detectSsnLike('EIN for Schedule C example: 12-3456789')).toHaveLength(0)
    expect(hasSsnLike(CLEAN_BODY)).toBe(false)
  })

  it('CHAR: already-masked forms are ignored', () => {
    expect(detectSsnLike('SSN XXX-XX-XXXX')).toHaveLength(0)
    expect(detectSsnLike('SSN ***-**-****')).toHaveLength(0)
    expect(detectSsnLike('SSN ###-##-####')).toHaveLength(0)
  })

  it('CHAR: fixture SSN body detects dashed + undashed; redact clears both', () => {
    const hits = detectSsnLike(SSN_BODY)
    expect(hits.length).toBeGreaterThanOrEqual(2)
    expect(hits.some((h) => h.kind === 'dashed')).toBe(true)
    expect(hits.some((h) => h.kind === 'undashed')).toBe(true)

    const redacted = redactSsnInText(SSN_BODY)
    expect(redacted.redactedCount).toBe(hits.length)
    expect(redacted.text).not.toContain('219-09-9999')
    expect(redacted.text).not.toContain('219099999')
    expect(redacted.samplesMasked.every((s) => s === SSN_REDACTION_MASK)).toBe(true)
    expect(assertNoSsnRemaining(redacted.text)).toBe(true)
    expect(hasSsnLike(redacted.text)).toBe(false)
  })

  it('CHAR: clean fixture body needs no redaction', () => {
    const redacted = redactSsnInText(CLEAN_BODY)
    expect(redacted.redactedCount).toBe(0)
    expect(redacted.text).toBe(CLEAN_BODY)
    expect(assertNoSsnRemaining(CLEAN_BODY)).toBe(true)
  })

  it('CHAR: samplesMasked never includes raw SSN digits from the source match', () => {
    const redacted = redactSsnInText('Social security number: 219-09-9999')
    expect(redacted.samplesMasked.join('')).not.toMatch(/\d/)
  })
})
