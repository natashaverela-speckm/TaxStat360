/**
 * Pure SSN detect / redact helpers for the TaxStat360 text-PDF gate.
 * Twin of taxstat360-api/app/ssn_redact.py — keep behavior in sync .
 *
 * Never log raw match.value outside tests. samplesMasked are already masked.
 */

/** @typedef {{ start: number, end: number, kind: 'dashed' | 'spaced' | 'undashed', value: string }} SsnMatch */

/** Alphanumeric count threshold for “text PDF” vs image-only. */
export const TEXT_PDF_ALNUM_THRESHOLD = 40

/** Replacement used by redactSsnInText (also treated as already-masked). */
export const SSN_REDACTION_MASK = 'XXX-XX-XXXX'

const DASHED_RE = /\b\d{3}-\d{2}-\d{4}\b/g
const SPACED_RE = /\b\d{3}\s\d{2}\s\d{4}\b/g
const UNDASHED_RE = /\b\d{9}\b/g
const EIN_RE = /^\d{2}-\d{7}$/

const SSN_CONTEXT_RE = /\b(ssn|social\s+security(\s+number)?)\b/i
/** Chars before a candidate undashed match to search for SSN labels. */
const CONTEXT_WINDOW = 80

/**
 * @param {string | null | undefined} text
 * @returns {number}
 */
export function countAlphanumeric(text) {
  if (text == null || text === '') return 0
  let n = 0
  for (const ch of String(text)) {
    if (/[A-Za-z0-9]/.test(ch)) n += 1
  }
  return n
}

/**
 * @param {string | null | undefined} text
 * @param {number} [threshold]
 * @returns {'text' | 'image-only'}
 */
export function classifyTextLayer(text, threshold = TEXT_PDF_ALNUM_THRESHOLD) {
  return countAlphanumeric(text) >= threshold ? 'text' : 'image-only'
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function looksAlreadyMasked(value) {
  const v = String(value).trim()
  if (/^X{3}-X{2}-X{4}$/i.test(v)) return true
  if (/^\*{3}-\*{2}-\*{4}$/.test(v)) return true
  if (/^#{3}-#{2}-#{4}$/.test(v)) return true
  if (/^X{9}$/i.test(v) || /^\*{9}$/.test(v) || /^#{9}$/.test(v)) return true
  return false
}

/**
 * @param {string} text
 * @param {number} start
 * @returns {boolean}
 */
function hasSsnContextNear(text, start) {
  const from = Math.max(0, start - CONTEXT_WINDOW)
  const window = text.slice(from, start)
  return SSN_CONTEXT_RE.test(window)
}

/**
 * @param {string | null | undefined} text
 * @returns {SsnMatch[]}
 */
export function detectSsnLike(text) {
  if (text == null || text === '') return []
  const src = String(text)
  /** @type {SsnMatch[]} */
  const matches = []

  for (const re of [DASHED_RE, SPACED_RE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src)) !== null) {
      const value = m[0]
      if (EIN_RE.test(value) || looksAlreadyMasked(value)) continue
      matches.push({
        start: m.index,
        end: m.index + value.length,
        kind: re === DASHED_RE ? 'dashed' : 'spaced',
        value,
      })
    }
  }

  UNDASHED_RE.lastIndex = 0
  let um
  while ((um = UNDASHED_RE.exec(src)) !== null) {
    const value = um[0]
    if (looksAlreadyMasked(value)) continue
    if (!hasSsnContextNear(src, um.index)) continue
    matches.push({
      start: um.index,
      end: um.index + value.length,
      kind: 'undashed',
      value,
    })
  }

  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  // Drop overlaps (keep earlier / longer).
  /** @type {SsnMatch[]} */
  const deduped = []
  let lastEnd = -1
  for (const hit of matches) {
    if (hit.start < lastEnd) continue
    deduped.push(hit)
    lastEnd = hit.end
  }
  return deduped
}

/**
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function hasSsnLike(text) {
  return detectSsnLike(text).length > 0
}

/**
 * @param {string | null | undefined} text
 * @returns {{ text: string, redactedCount: number, samplesMasked: string[] }}
 */
export function redactSsnInText(text) {
  const src = text == null ? '' : String(text)
  const hits = detectSsnLike(src)
  if (hits.length === 0) {
    return { text: src, redactedCount: 0, samplesMasked: [] }
  }

  let out = src
  /** @type {string[]} */
  const samplesMasked = []
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i]
    out = out.slice(0, hit.start) + SSN_REDACTION_MASK + out.slice(hit.end)
    samplesMasked.push(SSN_REDACTION_MASK)
  }
  samplesMasked.reverse()

  return {
    text: out,
    redactedCount: hits.length,
    samplesMasked,
  }
}

/**
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function assertNoSsnRemaining(text) {
  return !hasSsnLike(text)
}
