// src/lib/pnlUpload.js — "Upload your P&L (PDF)" on the Numbers screen.
//
// A profit-and-loss export from QuickBooks, Xero, Wave or FreshBooks is read in
// the browser (same path as the tax return: text layer only, SSN-masked, nothing
// stored), sent under the `pnl-summary` extract profile, and turned into the
// Numbers-screen inputs the engine already takes. Keys mirror PNL_FIELDS in
// app/tax_extract.py on the API. Pure; no DOM, no storage.
import { nf } from '../utils/money.js'
import { calcEmployerFICA } from './taxCalc.js'
import { tileByKey } from './simpleFlow.js'
import { CURRENT_TAX_YEAR } from './constants.js'

export const PNL_PROFILE = 'pnl-summary'
export const ADVANCED_HIDDEN = String(import.meta.env?.VITE_ADVANCED_HIDDEN ?? 'true') !== 'false'

export const PNL_FIELD_KEYS = Object.freeze([
  'periodLabel', 'periodYear', 'totalIncome', 'costOfGoodsSold', 'grossProfit', 'totalExpenses',
  'officerCompensation', 'wagesOther', 'payrollTaxes', 'depreciation', 'rentExpense', 'interestExpense', 'netIncome',
])

/** Coerce the extract payload: money → numbers (null → 0), period label → string. */
export function normalizePnl(raw = {}) {
  const out = {}
  for (const k of PNL_FIELD_KEYS) {
    const v = raw[k]
    if (k === 'periodLabel') out[k] = v == null ? '' : String(v).trim()
    else if (k === 'periodYear') out[k] = v == null || v === '' ? 0 : (parseInt(v, 10) || 0)
    else out[k] = v == null || v === '' ? 0 : nf(v)
  }
  return out
}

/** Does the report look like a P&L at all (an income line and an expense or net line)? */
export function looksLikePnl(p) {
  return nf(p.totalIncome) > 0 && (nf(p.totalExpenses) > 0 || p.netIncome !== 0)
}

/**
 * Map a P&L onto the Numbers-screen inputs for a tile.
 *
 * Business tiles: "what the business spent (not counting your own pay)" is the
 * report's total expenses less the officer's pay and the employer payroll tax on
 * it, because the engine adds both back from the salary field. Cost of goods
 * sold counts as spending. The rental tile splits depreciation out, as its own
 * field asks.
 *
 * @returns {{ revenue: string, expenses: string, officerSalary: string, depreciation: string, period: string, notes: string[] }}
 */
export function pnlToNumbers(pIn, tileKey, taxYear = CURRENT_TAX_YEAR) {
  const p = normalizePnl(pIn)
  const tile = tileByKey(tileKey) || tileByKey('scorp')
  const isRental = tile.fields.includes('rent')
  const isSCorp = tile.key === 'scorp'
  const notes = []
  const income = Math.max(0, nf(p.totalIncome))
  const cogs = Math.max(0, nf(p.costOfGoodsSold))
  const total = Math.max(0, nf(p.totalExpenses))
  const dep = Math.max(0, nf(p.depreciation))

  if (isRental) {
    return {
      revenue: String(Math.round(income)),
      expenses: String(Math.round(Math.max(0, total + cogs - dep))),
      officerSalary: '',
      depreciation: dep ? String(Math.round(dep)) : '',
      period: p.periodLabel,
      notes,
    }
  }

  const officer = isSCorp ? Math.max(0, nf(p.officerCompensation)) : 0
  if (isSCorp && !officer) notes.push('No officer-salary line was found on the P&L; type what you paid yourself on payroll.')
  // Employer payroll tax on the officer's pay is inside total expenses; the engine
  // recomputes it from the salary field, so take it out to avoid counting it twice.
  const officerFica = officer ? Math.min(Math.max(0, nf(p.payrollTaxes)), calcEmployerFICA(officer, taxYear)) : 0
  if (!isSCorp && nf(p.officerCompensation) > 0) notes.push('The P&L shows an owner-salary line; for this business type it stays inside expenses.')
  const expenses = Math.max(0, total + cogs - officer - officerFica)
  return {
    revenue: String(Math.round(income)),
    expenses: String(Math.round(expenses)),
    officerSalary: isSCorp ? String(Math.round(officer)) : '',
    depreciation: '',
    period: p.periodLabel,
    notes,
  }
}
