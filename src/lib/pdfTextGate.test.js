import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  GATE_CODES,
  GATE_MESSAGES,
  isPdfFile,
  gateTax1040PdfUpload,
  prepareTax1040TextForUpload,
  extractPdfTextLayer,
  selectReturnPages,
  scorePage,
  TEXT_BUDGET_CHARS,
} from './pdfTextGate.js'

const fixtureDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/text-pdf-gate',
)

function pdfFile(name, type = 'application/pdf') {
  const buf = readFileSync(join(fixtureDir, name))
  return new File([buf], name, { type })
}

describe('pdfTextGate (Phase 2)', () => {
  it('CHAR: isPdfFile accepts pdf type or .pdf name', () => {
    expect(isPdfFile({ name: 'a.pdf', type: '' })).toBe(true)
    expect(isPdfFile({ name: 'a.PDF', type: 'application/octet-stream' })).toBe(true)
    expect(isPdfFile({ name: 'a.png', type: 'image/png' })).toBe(false)
    expect(isPdfFile({ name: 'a.jpg', type: 'application/pdf' })).toBe(true)
  })

  it('CHAR: rejects non-PDF without calling extract', async () => {
    const extractText = vi.fn()
    const file = new File([new Uint8Array([1, 2, 3])], 'scan.png', { type: 'image/png' })
    const res = await gateTax1040PdfUpload(file, { extractText })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe(GATE_CODES.UNSUPPORTED_FILE_TYPE)
      expect(res.message).toBe(GATE_MESSAGES[GATE_CODES.UNSUPPORTED_FILE_TYPE])
    }
    expect(extractText).not.toHaveBeenCalled()
  })

  it('CHAR: image-only text layer → IMAGE_ONLY_PDF (no extract network)', async () => {
    const res = await gateTax1040PdfUpload(pdfFile('fixture-tax-1040-image-only.pdf'), {
      extractText: async () => '',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe(GATE_CODES.IMAGE_ONLY_PDF)
  })

  it('CHAR: SSN in text → SSN_DETECTED and does not allow upload', async () => {
    const body = `Social security number: 219-09-9999\nSSN (no dashes): 219099999\nAGI 142000`
    const res = await gateTax1040PdfUpload(pdfFile('fixture-tax-1040-text-with-ssn.pdf'), {
      extractText: async () => body,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe(GATE_CODES.SSN_DETECTED)
      expect(res.message).not.toMatch(/219/)
    }
  })

  it('CHAR: clean text → allow', async () => {
    const body = `SYNTHETIC FIXTURE Form 1040 EIN 12-3456789 Prior-year AGI 142000 federal tax 18750`
    const res = await gateTax1040PdfUpload(pdfFile('fixture-tax-1040-text-clean.pdf'), {
      extractText: async () => body,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.alnum).toBeGreaterThanOrEqual(40)
      expect(res.text).toContain('142000')
    }
  })

  it('CHAR: extract failure → PDF_UNREADABLE', async () => {
    const res = await gateTax1040PdfUpload(pdfFile('fixture-tax-1040-text-clean.pdf'), {
      extractText: async () => {
        throw new Error('boom')
      },
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe(GATE_CODES.PDF_UNREADABLE)
  })

  it('CHAR: pdf.js extracts text from clean fixture and SSN from ssn fixture', async () => {
    const { createRequire } = await import('node:module')
    const { pathToFileURL } = await import('node:url')
    const { GlobalWorkerOptions } = await import('pdfjs-dist')
    const require = createRequire(import.meta.url)
    // Node has no fetch for /pdf.worker.min.js — point at the package worker file.
    GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
    ).href

    const cleanBuf = readFileSync(join(fixtureDir, 'fixture-tax-1040-text-clean.pdf'))
    const ssnBuf = readFileSync(join(fixtureDir, 'fixture-tax-1040-text-with-ssn.pdf'))
    const imageBuf = readFileSync(join(fixtureDir, 'fixture-tax-1040-image-only.pdf'))

    const cleanText = await extractPdfTextLayer(cleanBuf)
    expect(cleanText).toMatch(/SYNTHETIC FIXTURE/i)
    expect(cleanText).toMatch(/12-3456789/)

    const ssnText = await extractPdfTextLayer(ssnBuf)
    expect(ssnText).toMatch(/219-09-9999/)

    const imageText = await extractPdfTextLayer(imageBuf)
    expect(imageText.replace(/\s+/g, '').length).toBeLessThan(40)

    const gatedClean = await gateTax1040PdfUpload(pdfFile('fixture-tax-1040-text-clean.pdf'))
    expect(gatedClean.ok).toBe(true)

    const gatedSsn = await gateTax1040PdfUpload(pdfFile('fixture-tax-1040-text-with-ssn.pdf'))
    expect(gatedSsn.ok).toBe(false)
    if (!gatedSsn.ok) expect(gatedSsn.code).toBe(GATE_CODES.SSN_DETECTED)

    const gatedImage = await gateTax1040PdfUpload(pdfFile('fixture-tax-1040-image-only.pdf'))
    expect(gatedImage.ok).toBe(false)
    if (!gatedImage.ok) expect(gatedImage.code).toBe(GATE_CODES.IMAGE_ONLY_PDF)
  }, 20_000)

  // PHASE 2 (Prior-Year Review): the masking path. Every real 1040 carries an SSN,
  // so the review masks it on the device and sends only the masked text.
  describe('prepareTax1040TextForUpload (review path)', () => {
    it('masks SSNs in the browser and returns clean text with a count', async () => {
      const body = `Social security number: 219-09-9999\nSpouse 219099998\nAGI 142000 wages 180000`
      const res = await prepareTax1040TextForUpload(pdfFile('fixture-tax-1040-text-with-ssn.pdf'), { extractText: async () => body })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.redactedCount).toBe(2)
        expect(res.text).not.toMatch(/219-09-9999|219099998/)
        expect(res.text).toContain('XXX-XX-XXXX')
        expect(res.text).toContain('142000')
      }
    })

    it('still refuses image-only and non-PDF files', async () => {
      const img = await prepareTax1040TextForUpload(pdfFile('fixture-tax-1040-image-only.pdf'), { extractText: async () => '   ' })
      expect(img.ok).toBe(false)
      if (!img.ok) expect(img.code).toBe(GATE_CODES.IMAGE_ONLY_PDF)
      const txt = await prepareTax1040TextForUpload(new File(['hi'], 'notes.txt', { type: 'text/plain' }))
      expect(txt.ok).toBe(false)
      if (!txt.ok) expect(txt.code).toBe(GATE_CODES.UNSUPPORTED_FILE_TYPE)
    })

    it('masks the SSN in the real ssn fixture via pdf.js', async () => {
      const res = await prepareTax1040TextForUpload(pdfFile('fixture-tax-1040-text-with-ssn.pdf'))
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.redactedCount).toBeGreaterThan(0)
        expect(res.text).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/)
      }
    })
  })

  describe('long packages: keep the federal pages, drop the state return', () => {
    const fed = (n) => `Form 1040 U.S. Individual Income Tax Return page ${n} ` + 'w'.repeat(40_000)
    const sched = (n) => `Schedule E Supplemental Income page ${n} ` + 'e'.repeat(40_000)
    const state = (n) => `State of California Franchise Tax Board Form 540 Resident Income Tax Return page ${n} ` + 's'.repeat(40_000)
    const noise = (n) => `Filing Instructions page ${n} ` + 'i'.repeat(40_000)
    const neutral = (n) => `Depreciation worksheet detail page ${n} ` + 'd'.repeat(40_000)

    it('scores pages', () => {
      expect(scorePage(fed(1))).toBe(2)
      expect(scorePage(state(1))).toBeLessThan(0)
      expect(scorePage(noise(1))).toBe(-1)
      expect(scorePage(neutral(1))).toBe(0)
    })

    it('under budget nothing is dropped and order is kept', () => {
      const r = selectReturnPages([fed(1), state(1), sched(1)], 1_000_000)
      expect(r.dropped).toBe(0)
      expect(r.text.indexOf('page 1 ')).toBeLessThan(r.text.indexOf('Schedule E'))
    })

    it('over budget: federal first, then neutral, state pages dropped, order preserved', () => {
      const pages = [fed(1), state(1), sched(2), state(2), neutral(3), noise(4), fed(5), state(3), state(4), state(5)]
      const r = selectReturnPages(pages, 5 * 40_100)
      expect(r.text).toMatch(/page 1 /)
      expect(r.text).toMatch(/Schedule E/)
      expect(r.text).toMatch(/page 5 /)
      expect(r.text).toMatch(/worksheet detail/)
      expect(r.text).not.toMatch(/Franchise Tax Board/)
      expect(r.dropped).toBeGreaterThanOrEqual(5)
      expect(r.text.length).toBeLessThanOrEqual(5 * 40_100)
      // document order survives the selection
      expect(r.text.indexOf('page 1 ')).toBeLessThan(r.text.indexOf('page 5 '))
    })

    it('prepare reports kept/dropped and stays under the budget on a 60-page package', async () => {
      const pages = []
      for (let i = 1; i <= 60; i += 1) pages.push(i <= 20 ? fed(i) : state(i))
      const res = await prepareTax1040TextForUpload(pdfFile('fixture-tax-1040-text-clean.pdf'), { extractText: async () => pages.join('\f') })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.text.length).toBeLessThanOrEqual(TEXT_BUDGET_CHARS)
        expect(res.dropped).toBeGreaterThan(0)
        expect(res.text).not.toMatch(/Franchise Tax Board/)
      }
    })
  })
})
