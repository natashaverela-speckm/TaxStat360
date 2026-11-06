import { describe, it, expect } from 'vitest'
import { normalizePnl, looksLikePnl, pnlToNumbers, pnlTotals, PNL_FIELD_KEYS } from './pnlUpload.js'

const QBO = { periodLabel: 'January 1 - October 31, 2026', periodYear: 2026, totalIncome: '300,000.00', costOfGoodsSold: null, grossProfit: 300000, totalExpenses: 186120, officerCompensation: 80000, wagesOther: null, payrollTaxes: 6120, depreciation: 4000, rentExpense: 24000, interestExpense: null, netIncome: 113880 }

describe('P&L upload', () => {
  it('normalizes money strings and nulls; keeps the period label', () => {
    const p = normalizePnl(QBO)
    expect(p.totalIncome).toBe(300000)
    expect(p.costOfGoodsSold).toBe(0)
    expect(p.periodLabel).toBe('January 1 - October 31, 2026')
    for (const k of PNL_FIELD_KEYS) expect(k in p).toBe(true)
  })

  it('recognizes a P&L and rejects a report with no income line', () => {
    expect(looksLikePnl(normalizePnl(QBO))).toBe(true)
    expect(looksLikePnl(normalizePnl({ totalIncome: null, totalExpenses: null, netIncome: 0 }))).toBe(false)
  })

  it('S-Corp tile: officer pay and its employer payroll tax come out of spending; depreciation stays in', () => {
    const n = pnlToNumbers(QBO, 'scorp', 2026)
    expect(n.revenue).toBe('300000')
    expect(n.officerSalary).toBe('80000')
    expect(Number(n.expenses)).toBe(186120 - 80000 - 6120)
    expect(n.depreciation).toBe('')
    expect(n.notes).toEqual([])
  })

  it('sole-prop tile: everything is spending; an owner-salary line is noted, not removed', () => {
    const n = pnlToNumbers(QBO, 'soleprop', 2026)
    expect(Number(n.expenses)).toBe(186120)
    expect(n.officerSalary).toBe('')
    expect(n.notes[0]).toMatch(/owner-salary line/)
  })

  it('rental tile: depreciation is its own field and comes out of expenses', () => {
    const n = pnlToNumbers(QBO, 'rental', 2026)
    expect(n.revenue).toBe('300000')
    expect(Number(n.expenses)).toBe(186120 - 4000)
    expect(n.depreciation).toBe('4000')
  })

  it('S-Corp with no officer line asks for it', () => {
    const n = pnlToNumbers({ ...QBO, officerCompensation: null, payrollTaxes: null }, 'scorp', 2026)
    expect(n.officerSalary).toBe('0')
    expect(n.notes[0]).toMatch(/No officer-salary line/)
  })

  // Natasha's QuickBooks export, Jan 1 – Nov 6, 2026: Other Income and Other Expenses below the operating line.
  const QBO_OTHER = { periodLabel: 'January 1-November 6, 2026', periodYear: 2026, totalIncome: 212932.50, costOfGoodsSold: null, grossProfit: 212932.50,
    totalExpenses: 247698.22, officerCompensation: null, wagesOther: null, payrollTaxes: null, depreciation: null, rentExpense: null, interestExpense: null,
    otherIncome: 13551.41, otherExpenses: 20146.17, netOperatingIncome: -34765.72, netIncome: -41360.48 }

  it('other income and other expenses count, and the totals tie to Net Income', () => {
    const t = pnlTotals(QBO_OTHER)
    expect(Math.round(t.income)).toBe(226484)
    expect(Math.round(t.spending)).toBe(267844)
    expect(t.tied).toBe(true)
    const n = pnlToNumbers(QBO_OTHER, 'scorp', 2026)
    expect(n.revenue).toBe('226484')
    expect(n.expenses).toBe('267844')
  })

  it('when a section was missed, spending is set from Net Income and the member is told', () => {
    const t = pnlTotals({ ...QBO_OTHER, otherExpenses: null })
    expect(t.tied).toBe(false)
    expect(Math.round(t.spending)).toBe(267844)
    expect(t.notes[0]).toMatch(/did not add up to its Net Income/)
  })
})
