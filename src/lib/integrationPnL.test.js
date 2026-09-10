// src/lib/integrationPnL.test.js
//
// AUDIT (Sep 2026) — a FAILED integration sync was recorded as a successful one.
//
// fetchEntityPnL passes raw:true to apiFetch, which by design skips the ok-check
// and hands back the Response. The old code never looked at the status; it decided
// success from the body alone with `if (d && !d.error)`. FastAPI errors are shaped
// {detail}, not {error}, so an error response satisfied that test, and its
// undefined `revenue` also slipped past an "empty" guard that compared === 0. The
// app wrote undefined revenue/expenses/netProfit into the entity, cleared the
// failure flag, stamped a fresh syncedAt, and renamed the entity — reporting a
// successful sync that had not happened.
//
// Live evidence, 2026-09-10: /integrations/status reported freshbooks
// connected:true while /integrations/freshbooks/data returned HTTP 502
// {"detail":"freshbooks report failed"} for 2024, 2025 and 2026.
//
// The first suite below is that exact response. If it ever returns kind 'ok'
// again, the app is fabricating financial data.

import { describe, it, expect } from 'vitest'
import {
  interpretProviderPnL,
  providerLabel,
  IMPLAUSIBLE_EXPENSE_RATIO,
} from './integrationPnL.js'

const call = (over = {}) => interpretProviderPnL({
  ok: true, status: 200, provider: 'freshbooks', taxYear: 2026, body: {}, ...over,
})

describe('the live failure this was found by', () => {
  it('HTTP 502 {detail} is an error, not a P&L', () => {
    const v = call({ ok: false, status: 502, body: { detail: 'freshbooks report failed' } })
    expect(v.kind).toBe('error')
    expect(v.pnl).toBeUndefined()
  })

  it('tells the user their figures were not touched', () => {
    const v = call({ ok: false, status: 502, body: { detail: 'freshbooks report failed' } })
    expect(v.message).toMatch(/left unchanged/i)
  })

  it('surfaces the status and the server reason so the fault is diagnosable', () => {
    const v = call({ ok: false, status: 502, body: { detail: 'freshbooks report failed' } })
    expect(v.message).toContain('HTTP 502')
    expect(v.message).toContain('freshbooks report failed')
  })
})

describe('error shapes', () => {
  it('rejects {detail} — the shape that defeated the old check', () => {
    expect(call({ ok: false, status: 500, body: { detail: 'boom' } }).kind).toBe('error')
  })

  it('rejects {error}', () => {
    expect(call({ ok: false, status: 400, body: { error: 'bad request' } }).kind).toBe('error')
  })

  it('rejects an error body even when the status is somehow 200', () => {
    // Defence in depth: some handlers return 200 with an error payload.
    expect(call({ ok: true, status: 200, body: { detail: 'token expired' } }).kind).toBe('error')
    expect(call({ ok: true, status: 200, body: { error: 'token expired' } }).kind).toBe('error')
  })

  it('rejects a non-ok status even when the body looks like a P&L', () => {
    const v = call({ ok: false, status: 503, body: { revenue: 100, expenses: 50, net_profit: 50 } })
    expect(v.kind).toBe('error')
  })

  it('rejects a body that did not parse', () => {
    expect(call({ ok: true, status: 200, body: null }).kind).toBe('error')
  })
})

describe('the payload must carry real numbers', () => {
  it('rejects undefined revenue — the exact value the old code wrote', () => {
    const v = call({ body: { net_profit: 0 } })
    expect(v.kind).toBe('error')
    expect(v.message).toMatch(/could not be read/i)
  })

  it('rejects null, NaN, and numeric strings rather than coercing them', () => {
    expect(call({ body: { revenue: null, expenses: 10 } }).kind).toBe('error')
    expect(call({ body: { revenue: NaN, expenses: 10 } }).kind).toBe('error')
    expect(call({ body: { revenue: '5000', expenses: 10 } }).kind).toBe('error')
    expect(call({ body: { revenue: 10, expenses: undefined } }).kind).toBe('error')
  })

  it('never returns a pnl on any error path', () => {
    for (const body of [null, {}, { detail: 'x' }, { revenue: '1', expenses: 2 }]) {
      expect(call({ body }).pnl).toBeUndefined()
    }
  })
})

describe('a genuinely empty year', () => {
  it('is distinguished from a failure', () => {
    const v = call({ body: { revenue: 0, expenses: 0, net_profit: 0 } })
    expect(v.kind).toBe('empty')
    expect(v.message).toMatch(/returned no P&L for 2026/)
  })

  it('treats a missing net_profit alongside zero revenue and expenses as empty', () => {
    expect(call({ body: { revenue: 0, expenses: 0 } }).kind).toBe('empty')
  })

  it('a zero-revenue year WITH expenses is not empty — it is a real loss year', () => {
    const v = call({ body: { revenue: 0, expenses: 8000, net_profit: -8000 } })
    expect(v.kind).toBe('ok')
    expect(v.pnl.totalExpenses).toBe(8000)
  })
})

describe('a healthy sync', () => {
  const body = {
    revenue: 300000, expenses: 180000, net_profit: 120000,
    officer_salary: 60000, categories: { rent: 24000 },
  }

  it('maps the provider fields onto the entity P&L shape', () => {
    const v = call({ body })
    expect(v.kind).toBe('ok')
    expect(v.pnl).toMatchObject({
      grossRevenue: 300000,
      totalExpenses: 180000,
      netProfit: 120000,
      officerSalary: 60000,
      categories: { rent: 24000 },
    })
  })

  it('records employerPayrollTax as 0 — provider books already include it', () => {
    // AUDIT H1: double-deducting employer FICA on the synced path is the failure
    // mode this explicit 0 exists to prevent. See the note in the module.
    expect(call({ body }).pnl.employerPayrollTax).toBe(0)
  })

  it('raises no warning on consistent, plausible figures', () => {
    expect(call({ body }).warning).toBeNull()
  })

  it('defaults a missing officer salary and categories safely', () => {
    const v = call({ body: { revenue: 1000, expenses: 400, net_profit: 600 } })
    expect(v.pnl.officerSalary).toBe(0)
    expect(v.pnl.categories).toEqual({})
  })
})

describe('reconciliation — the three figures must come from one report', () => {
  it('warns when net_profit does not equal revenue minus expenses', () => {
    const v = call({ body: { revenue: 300000, expenses: 180000, net_profit: 5000 } })
    expect(v.kind).toBe('ok')
    expect(v.warning).toMatch(/do not add up/i)
  })

  it('names all four figures so the user can check them against the books', () => {
    const v = call({ body: { revenue: 300000, expenses: 180000, net_profit: 5000 } })
    expect(v.warning).toContain('$300,000')
    expect(v.warning).toContain('$180,000')
    expect(v.warning).toContain('$120,000') // derived
    expect(v.warning).toContain('$5,000')   // reported
  })

  it('still applies the sync — a warning is not a refusal', () => {
    const v = call({ body: { revenue: 300000, expenses: 180000, net_profit: 5000 } })
    expect(v.pnl.grossRevenue).toBe(300000)
  })

  it('tolerates rounding', () => {
    expect(call({ body: { revenue: 1000, expenses: 400, net_profit: 599.6 } }).warning).toBeNull()
  })

  it('tolerates half a percent on a large book', () => {
    // derived 1,000,000; reported off by 4,000 (0.4%)
    expect(call({ body: { revenue: 3000000, expenses: 2000000, net_profit: 1004000 } }).warning).toBeNull()
  })

  it('does not tolerate a 1% drift on a large book', () => {
    expect(call({ body: { revenue: 3000000, expenses: 2000000, net_profit: 1010000 } }).warning)
      .toMatch(/do not add up/i)
  })

  it('derives net_profit when the provider omits it, and does not warn', () => {
    const v = call({ body: { revenue: 1000, expenses: 400 } })
    expect(v.kind).toBe('ok')
    expect(v.warning).toBeNull()
  })
})

describe('plausibility — the FreshBooks figures that started this', () => {
  // $7,642 revenue against $487,335 expenses, officer salary $0.
  const observed = { revenue: 7642, expenses: 487335, net_profit: 7642 - 487335, officer_salary: 0 }

  it('warns rather than accepting it silently', () => {
    const v = call({ body: observed })
    expect(v.kind).toBe('ok')
    expect(v.warning).toMatch(/wrong date range or account mapping/i)
  })

  it('states the loss in plain figures', () => {
    const v = call({ body: observed })
    expect(v.warning).toContain('$487,335')
    expect(v.warning).toContain('$7,642')
    expect(v.warning).toContain('$479,693') // |7,642 - 487,335|
  })

  it('says the figures can legitimately be correct', () => {
    // The user's own books are the authority. The warning must not accuse.
    expect(call({ body: observed }).warning).toMatch(/can be correct/i)
  })

  it('applies the sync anyway', () => {
    expect(call({ body: observed }).pnl.grossRevenue).toBe(7642)
  })

  it('does not fire on an ordinary thin-margin year', () => {
    expect(call({ body: { revenue: 200000, expenses: 195000, net_profit: 5000 } }).warning).toBeNull()
  })

  it('does not fire exactly at the ratio, only past it', () => {
    const rev = 100000
    const atRatio = rev * IMPLAUSIBLE_EXPENSE_RATIO
    expect(call({ body: { revenue: rev, expenses: atRatio, net_profit: rev - atRatio } }).warning).toBeNull()
    expect(call({ body: { revenue: rev, expenses: atRatio + 1, net_profit: rev - atRatio - 1 } }).warning)
      .toMatch(/wrong date range/i)
  })

  it('reconciliation takes precedence — the inconsistency is the better clue', () => {
    // Both conditions true: report the one that identifies a mapping fault.
    const v = call({ body: { revenue: 1000, expenses: 90000, net_profit: 12345 } })
    expect(v.warning).toMatch(/do not add up/i)
  })
})

describe('providerLabel', () => {
  it('capitalises a provider id', () => {
    expect(providerLabel('freshbooks')).toBe('Freshbooks')
    expect(providerLabel('quickbooks')).toBe('Quickbooks')
  })

  it('never renders "undefined" at the user', () => {
    expect(providerLabel(undefined)).toBe('Provider')
    expect(providerLabel('')).toBe('Provider')
    expect(providerLabel(null)).toBe('Provider')
  })
})
