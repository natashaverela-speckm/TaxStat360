// @vitest-environment jsdom
// src/utils/briefingPin.test.jsx
//
// T-2 PIN (open since the Phase-1 ledger): the CPA Briefing's stated federal
// liability must equal THE ENGINE's figure on the same record. The original
// finding was a $200 (0.4%) delta between the briefing and the Tracker — two
// surfaces stating different liabilities is the disagreement class this
// entire engagement existed to kill. This test makes the agreement permanent:
// if the briefing's assembled math ever drifts from calcTaxReturn again, CI
// goes red before a CPA ever sees the discrepancy.

import { describe, it, expect, vi } from 'vitest'
vi.mock('../LockedFeature', () => ({ default: () => null, isPro: () => true }))
import { render } from '@testing-library/react'
import { BriefingModal } from '../AIAnalysis.jsx'
import { summarizeRecord } from './calcSelector.js'
import { fmt } from './money.js'

const rec = {
  name: 'T-2 pin fixture',
  taxYear: 2026,
  f1040: { filingStatus: 'single', taxYear: 2026, w2Income: 90000, interest: 1200 },
  entities: [{ name: 'Ops LLC', type: 'S Corporation', own: 100, k1: 120000, netProfit: 120000, officerW2: 60000 }],
  biz: { entityType: 'S Corporation' },
  // Faithful to what TaxReturn's buildRecord persists: the aggregate K-1 also
  // lives at the record top level — the briefing reads it there.
  k1Income: 120000,
  step2Computed: true,
  totalTax: 0,
}

describe('T-2 — the CPA briefing agrees with the engine, permanently', () => {
  it('the briefing text states the ENGINE income-tax figure (and SE tax) verbatim', () => {
    const engine = summarizeRecord(rec)
    expect(engine.ok).toBe(true)
    const { container } = render(<BriefingModal rec={rec} onClose={() => {}} />)
    const text = container.textContent
    expect(text).toContain(fmt(engine.fedTax))
    if (engine.seTax > 0) {
      expect(text).toContain(fmt(engine.seTax))
      expect(text, 'total = engine fedTax + seTax composition').toContain(fmt(engine.fedTax + engine.seTax))
    }
  })

  it("the false 'no officer W-2 compensation' claim is dead — per-entity comp is read", () => {
    const { container } = render(<BriefingModal rec={rec} onClose={() => {}} />)
    const text = container.textContent
    expect(text).not.toContain('no officer W-2 compensation on file')
    expect(text, 'the ratio point now cites the real $60,000').toContain(fmt(60000))
  })
})
