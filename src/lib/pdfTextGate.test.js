import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  GATE_CODES,
  GATE_MESSAGES,
  isPdfFile,
  gateTax1040PdfUpload,
  extractPdfTextLayer,
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
})
