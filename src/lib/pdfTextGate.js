/**
 * Browser-side text-PDF gate for Carryforward Wizard upload (Phase 2).
 * Option C (Phase 0): block SSN-bearing text PDFs; reject image-only / non-PDF.
 *
 * Pure gate decisions use ssnRedact.js. pdf.js is only used for text-layer extract.
 */
import './promiseWithResolversPolyfill.js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  classifyTextLayer,
  countAlphanumeric,
  hasSsnLike,
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

let workerConfigured = false

function ensurePdfWorker() {
  if (workerConfigured) return
  // Allow tests (or hosts) to set workerSrc first — don't overwrite.
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = pdfWorkerSrc
  }
  workerConfigured = true
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
export async function extractPdfTextLayer(data, deps = {}) {
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
    const line = (content.items || [])
      .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
      .join(' ')
    parts.push(line)
  }
  return parts.join('\n')
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
  } catch {
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
