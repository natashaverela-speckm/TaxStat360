/**
 * Browser-side text-PDF gate for Carryforward Wizard upload (Phase 2).
 * Option C (Phase 0): block SSN-bearing text PDFs; reject image-only / non-PDF.
 *
 * Pure gate decisions use ssnRedact.js. pdf.js is only used for text-layer extract.
 *
 * Worker is served from /pdf.worker.min.js (copied at build time as *.js).
 * *.mjs worker URLs SPA-fallback to index.html on S3/CloudFront (MIME text/html),
 * and disableWorker still dynamic-imports workerSrc as a "fake worker" — same failure.
 */
import './promiseWithResolversPolyfill.js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import {
  classifyTextLayer,
  countAlphanumeric,
  hasSsnLike,
  redactSsnInText,
  assertNoSsnRemaining,
} from './ssnRedact.js'

export const GATE_CODES = Object.freeze({
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  PDF_UNREADABLE: 'PDF_UNREADABLE',
  IMAGE_ONLY_PDF: 'IMAGE_ONLY_PDF',
  SSN_DETECTED: 'SSN_DETECTED',
})

/** User-facing copy — no SSN digits, no return text. */
export const GATE_MESSAGES = Object.freeze({
  [GATE_CODES.UNSUPPORTED_FILE_TYPE]:
    'Please upload a text PDF of last year’s Form 1040 (PDF only for now — images and scans are not supported yet).',
  [GATE_CODES.PDF_UNREADABLE]:
    'We could not read that PDF. Try a different export, or enter carryforwards manually.',
  [GATE_CODES.IMAGE_ONLY_PDF]:
    'This looks like a scanned or image-only PDF. Text-PDF upload only for now — enter amounts manually, or upload a PDF with a selectable text layer.',
  [GATE_CODES.SSN_DETECTED]:
    'This PDF still contains a Social Security number in its text. Remove or mask the SSN on the return (or upload a redacted copy), then try again. Nothing was uploaded.',
})

/** Built into dist/ via scripts/copy-pdf-worker.mjs (*.js → correct JS MIME on S3). */
export const PDF_WORKER_URL = '/pdf.worker.min.js'

let workerConfigured = false

function ensurePdfWorker() {
  if (workerConfigured) return
  workerConfigured = true
  // Allow tests (or hosts) to set workerSrc first — don't overwrite.
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = PDF_WORKER_URL
  }
}

/**
 * @param {File | { name?: string, type?: string }} file
 * @returns {boolean}
 */
export function isPdfFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type === 'application/pdf' || type === 'application/x-pdf') return true
  const name = String(file.name || '').toLowerCase()
  return name.endsWith('.pdf')
}

/** @param {ArrayBuffer | Uint8Array} data */
function toPdfBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  // Copy so Node Buffer is not passed through (pdf.js rejects Buffer).
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

/**
 * Extract concatenated text layer from PDF bytes (no OCR).
 * @param {ArrayBuffer | Uint8Array} data
 * @param {{ getDocument?: typeof getDocument }} [deps]
 * @returns {Promise<string>}
 */
export async function extractPdfPages(data, deps = {}) {
  ensurePdfWorker()
  const loader = deps.getDocument || getDocument
  const bytes = toPdfBytes(data)
  const loadingTask = loader({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const parts = []
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    parts.push(itemsToRows(content.items || []) + checkedBoxesNote(await safeAnnotations(page)))
  }
  return parts
}

/**
 * Rebuild a page as rows. Tax software draws every label first and every
 * amount afterwards, so pdf.js's reading order is "label label label … amount
 * amount amount" and a model matching them by position shifts every line.
 * Grouping items by their y coordinate puts each amount beside its label
 * ("7 Compensation of officers 7 287,500."), which is what the form looks like.
 * Rows are emitted top to bottom, items left to right; a wide gap inside a row
 * becomes a few spaces so columns stay readable.
 * @param {Array<{str?: string, transform?: number[], width?: number, height?: number}>} items
 */
export function itemsToRows(items) {
  const rows = []
  const placed = []
  for (const it of items) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue
    const t = Array.isArray(it.transform) && it.transform.length >= 6 ? it.transform : null
    if (!t) { placed.push({ x: Infinity, y: NaN, w: 0, h: 0, s: it.str }); continue }
    const h = Math.max(Math.abs(t[3]) || 0, Math.abs(it.height || 0), 1)
    placed.push({ x: t[4], y: t[5], w: it.width || 0, h, s: it.str })
  }
  // Items with no geometry keep their original order at the end.
  const loose = placed.filter(p => Number.isNaN(p.y))
  const geo = placed.filter(p => !Number.isNaN(p.y)).sort((a, b) => b.y - a.y || a.x - b.x)
  for (const p of geo) {
    const last = rows[rows.length - 1]
    // same row when the baselines are within ~45% of the taller item's height
    if (last && Math.abs(last.y - p.y) <= Math.max(last.h, p.h) * 0.45) { last.items.push(p); continue }
    rows.push({ y: p.y, h: p.h, items: [p] })
  }
  const lines = rows.map(r => {
    r.items.sort((a, b) => a.x - b.x)
    let out = ''
    let endX = null
    for (const p of r.items) {
      if (endX !== null) out += (p.x - endX > Math.max(8, p.h * 1.5)) ? '   ' : ' '
      out += p.s.trim()
      endX = p.x + (p.w || p.s.length * p.h * 0.5)
    }
    return out
  })
  if (loose.length) lines.push(loose.map(p => p.s.trim()).join(' '))
  return lines.join('\n')
}

async function safeAnnotations(page) {
  try { return await page.getAnnotations() } catch { return [] }
}

/**
 * Checkbox state is not part of a PDF's text layer: the model sees every label
 * ("Single", "Head of household", …) whether or not its box is checked. On a
 * fillable return the state lives in the form field, so the checked ones are
 * written out as "[checked: <label>]" after the page text. The label comes from
 * the field's tooltip (what IRS forms carry) or, failing that, its field name.
 */
export function checkedBoxesNote(annotations) {
  const out = []
  for (const a of annotations || []) {
    if (!a || a.subtype !== 'Widget' || !a.checkBox) continue
    const v = a.fieldValue
    const on = v != null && v !== 'Off' && v !== '' && v !== false
    if (!on) continue
    const label = String(a.alternativeText || a.fieldName || '').replace(/\s+/g, ' ').trim()
    if (label) out.push(`[checked: ${label.slice(0, 80)}]`)
  }
  return out.length ? ' ' + out.join(' ') : ''
}

export async function extractPdfTextLayer(data, deps = {}) {
  return (await extractPdfPages(data, deps)).join('\n')
}

// ── Page selection for long packages ────────────────────────────────────────
// A tax-software PDF bundles the state return, e-file forms and dozens of
// worksheets with the federal return. The review needs the federal forms. Pages
// are scored, kept in order, and the federal ones go first until the budget is
// spent; state-return pages are dropped when anything has to give.
export const TEXT_BUDGET_CHARS = 260_000

const FEDERAL_PAGE = /Carryover Worksheet|carryover to the \d{4} tax return|Form\s*1040\b|Schedule\s*(1|2|3|A|B|C|D|E|SE|K-1|K)\b|Form\s*(1120-?S?|1065|4562|8582|8995|2210|8829|7203|1125-E|8825|W-2|1099)\b|Individual Income Tax Return|Income Tax Return for an S Corporation|Return of Partnership Income|Corporation Income Tax Return|Depreciation and Amortization|Passive Activity Loss/i
const STATE_PAGE = /Department of Revenue|Franchise Tax Board|Department of Taxation|Comptroller|State of [A-Z][a-z]+ |\b(IT-201|IT-203|540|D-400|MI-1040|PA-40|IL-1040|NJ-1040|CT-1040|MA Form 1|Form 500|Form 502|Form IT-40|Form 40|Form 104|Form 1A|Form M1)\b|Resident Income Tax Return|Nonresident|Part-Year Resident|State Income Tax Return|state return/i
const NOISE_PAGE = /e-file|Electronic Filing|Form 8879|Form 8878|Client Copy|Filing Instructions|Transmittal|Engagement Letter|Invoice|Cover Sheet|Two-Year Comparison|Tax Summary|Comparison/i

export function scorePage(text) {
  const t = String(text || '')
  let s = 0
  if (FEDERAL_PAGE.test(t)) s += 2
  if (STATE_PAGE.test(t)) s -= 2
  if (NOISE_PAGE.test(t)) s -= 1
  return s
}

/** Keep pages in document order; when the package exceeds the budget, keep the
 *  federal pages first, then neutral pages, and drop state-return pages. */
export function selectReturnPages(pages, budget = TEXT_BUDGET_CHARS) {
  const cleaned = (pages || []).map(p => String(p || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim())
  const total = cleaned.reduce((t, p) => t + p.length + 1, 0)
  if (total <= budget) return { text: cleaned.join('\n'), kept: cleaned.length, dropped: 0 }
  const scored = cleaned.map((p, i) => ({ i, p, s: scorePage(p) }))
  const keep = new Set()
  let used = 0
  for (const tier of [2, 1, 0, -1]) {
    for (const x of scored) {
      if (x.s < tier || keep.has(x.i)) continue
      if (tier === -1 && x.s < -1) continue
      if (used + x.p.length + 1 > budget) continue
      keep.add(x.i); used += x.p.length + 1
    }
    if (tier === 0) break   // state pages (−2) are never added once we are over budget
  }
  const text = scored.filter(x => keep.has(x.i)).map(x => x.p).join('\n')
  return { text, kept: keep.size, dropped: cleaned.length - keep.size }
}

/**
 * @typedef {{ ok: true, text: string, alnum: number }
 *   | { ok: false, code: string, message: string }} PdfGateResult
 */

/**
 * Gate a tax-1040 upload before any network send (Option C).
 *
 * @param {File} file
 * @param {{
 *   extractText?: (data: ArrayBuffer) => Promise<string>,
 *   getDocument?: typeof getDocument,
 * }} [deps] — inject extractText in unit tests to avoid pdf.js worker
 * @returns {Promise<PdfGateResult>}
 */
export async function gateTax1040PdfUpload(file, deps = {}) {
  if (!isPdfFile(file)) {
    return {
      ok: false,
      code: GATE_CODES.UNSUPPORTED_FILE_TYPE,
      message: GATE_MESSAGES[GATE_CODES.UNSUPPORTED_FILE_TYPE],
    }
  }

  let text = ''
  try {
    const buffer = await file.arrayBuffer()
    if (typeof deps.extractText === 'function') {
      text = await deps.extractText(buffer)
    } else {
      text = await extractPdfTextLayer(buffer, { getDocument: deps.getDocument })
    }
  } catch (err) {
    // Dev/ops signal only — never include PDF text or SSN in the message.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[pdfTextGate] PDF_UNREADABLE', err?.name || 'Error', err?.message || err)
    }
    return {
      ok: false,
      code: GATE_CODES.PDF_UNREADABLE,
      message: GATE_MESSAGES[GATE_CODES.PDF_UNREADABLE],
    }
  }

  if (classifyTextLayer(text) === 'image-only') {
    return {
      ok: false,
      code: GATE_CODES.IMAGE_ONLY_PDF,
      message: GATE_MESSAGES[GATE_CODES.IMAGE_ONLY_PDF],
    }
  }

  if (hasSsnLike(text)) {
    return {
      ok: false,
      code: GATE_CODES.SSN_DETECTED,
      message: GATE_MESSAGES[GATE_CODES.SSN_DETECTED],
    }
  }

  return {
    ok: true,
    text,
    alnum: countAlphanumeric(text),
  }
}

/**
 * PHASE 2 (Prior-Year Review): read the text layer and mask every SSN-like
 * string *in the browser*, so the PDF itself never leaves the device and the
 * masked text is all that is ever sent. Every real Form 1040 carries an SSN on
 * page 1, so a refuse-on-SSN gate would block the whole feature; masking here
 * is both the usable path and the stronger one. Still refuses non-PDFs,
 * image-only scans, and the rare case where an SSN survives masking.
 *
 * @param {File} file
 * @param {{ extractText?: (data: ArrayBuffer) => Promise<string>, getDocument?: typeof getDocument }} [deps]
 * @returns {Promise<{ ok: true, text: string, alnum: number, redactedCount: number }
 *   | { ok: false, code: string, message: string }>}
 */
export async function prepareTax1040TextForUpload(file, deps = {}) {
  if (!isPdfFile(file)) {
    return { ok: false, code: GATE_CODES.UNSUPPORTED_FILE_TYPE, message: GATE_MESSAGES[GATE_CODES.UNSUPPORTED_FILE_TYPE] }
  }
  let text = ''
  let pageInfo = { kept: 0, dropped: 0 }
  try {
    const buffer = await file.arrayBuffer()
    const pages = typeof deps.extractText === 'function'
      ? String(await deps.extractText(buffer)).split('\f')
      : await extractPdfPages(buffer, { getDocument: deps.getDocument })
    const sel = selectReturnPages(pages)
    text = sel.text
    pageInfo = { kept: sel.kept, dropped: sel.dropped }
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[pdfTextGate] PDF_UNREADABLE', err?.name || 'Error', err?.message || err)
    }
    return { ok: false, code: GATE_CODES.PDF_UNREADABLE, message: GATE_MESSAGES[GATE_CODES.PDF_UNREADABLE] }
  }
  if (classifyTextLayer(text) === 'image-only') {
    return { ok: false, code: GATE_CODES.IMAGE_ONLY_PDF, message: GATE_MESSAGES[GATE_CODES.IMAGE_ONLY_PDF] }
  }
  const masked = redactSsnInText(text)
  if (!assertNoSsnRemaining(masked.text)) {
    return { ok: false, code: GATE_CODES.SSN_DETECTED, message: GATE_MESSAGES[GATE_CODES.SSN_DETECTED] }
  }
  return { ok: true, text: masked.text, alnum: countAlphanumeric(masked.text), redactedCount: masked.redactedCount, ...pageInfo }
}
