// src/lib/integrationPnL.js
//
// Interprets the response from GET /integrations/{provider}/data.
//
// ─── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
// AUDIT (Sep 2026): a FAILED sync was being recorded as a successful one.
//
// fetchEntityPnL in CalculateTaxInner.jsx calls apiFetch with raw:true, which by
// design skips apiFetch's ok-check and hands back the Response so the caller can
// branch on status itself. The caller never did. It went straight to r.json() and
// decided success from the body alone:
//
//     const d = await apiFetch(url, { raw: true }).then(r => r.json())
//     if (d && !d.error) { ...treat as a P&L... }
//
// The API signals failure in two shapes. Some handlers return {error, status};
// FastAPI's HTTPException returns {detail}. A {detail} body has no `.error` key,
// so `!d.error` was true and an error response took the SUCCESS branch. Its
// `d.revenue` was `undefined`, so the "empty" guard (which compared === 0) missed
// it too. The app then wrote grossRevenue/totalExpenses/netProfit as undefined
// into the entity, cleared the failure flag, stamped a fresh syncedAt, and renamed
// the entity "<Provider> Business" — reporting a successful sync that never
// happened.
//
// Verified live on 2026-09-10 against production: /integrations/status reported
// freshbooks connected:true while /integrations/freshbooks/data returned HTTP 502
// {"detail":"freshbooks report failed"} for 2024, 2025 and 2026 — and the UI still
// showed a successful sync timestamp with no failure flag.
//
// The logic lives here, as a pure function, rather than inline in the component,
// because inline it was unreachable from the test harness: fetchEntityPnL is an
// inner function of a component that needs the whole router and session tree to
// mount. A bug that silently fabricates financial data deserves tests that run
// against the real decision, not against a copy of it.

import { nf, fmt } from '../utils/money.js'

/** True only for a real, finite JS number. Strings and NaN are rejected. */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** "freshbooks" → "Freshbooks" */
export function providerLabel(pid) {
  const s = String(pid || '').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Provider'
}

// Expenses running past revenue by more than half is legitimate in a startup or a
// heavy capital year — and is also the signature of a wrong date range or a wrong
// account mapping. High enough not to fire on ordinary thin margins.
export const IMPLAUSIBLE_EXPENSE_RATIO = 1.5

// net_profit is allowed to drift from revenue − expenses by a dollar of rounding,
// or half a percent on larger books, before the three figures are called
// inconsistent.
export const RECONCILE_ABS_TOLERANCE = 1
export const RECONCILE_REL_TOLERANCE = 0.005

/**
 * Decide what a provider P&L response means.
 *
 * @param {object}  args
 * @param {boolean} args.ok        Response.ok
 * @param {number}  [args.status]  HTTP status
 * @param {*}       [args.body]    parsed JSON body (null if it did not parse)
 * @param {string}  args.provider  provider id, e.g. 'freshbooks'
 * @param {*}       args.taxYear   the year requested
 * @returns {{kind:'error'|'empty'|'ok', message?:string, pnl?:object, warning?:string|null}}
 *   kind 'error' → do not touch the user's figures.
 *   kind 'empty' → the provider genuinely has no P&L for that year.
 *   kind 'ok'    → pnl is safe to write; `warning` is non-null when the figures
 *                  are internally inconsistent or implausible and the user should
 *                  verify them before relying on the estimate.
 */
export function interpretProviderPnL({ ok, status, body, provider, taxYear }) {
  const label = providerLabel(provider)
  const d = body

  // 1. Transport / server failure. Check the STATUS, and understand both error
  //    shapes — this is the branch the old code fell straight through.
  const serverMsg = (d && (d.detail || d.error || d.message)) || ''
  if (!ok || !d || d.error || d.detail) {
    const httpPart = status ? ` (HTTP ${status})` : ''
    const because = serverMsg ? ` — ${String(serverMsg).slice(0, 120)}` : ''
    return {
      kind: 'error',
      message: `${label} sync failed${httpPart}${because}. Your figures were left unchanged. Try Sync now, reconnect ${label}, or enter figures manually.`,
    }
  }

  // 2. The payload must carry real numbers. undefined, null, a numeric string or
  //    NaN all stop here rather than being coerced to 0 downstream, where a silent
  //    zero would be indistinguishable from a legitimately empty year.
  if (!isNum(d.revenue) || !isNum(d.expenses)) {
    return {
      kind: 'error',
      message: `${label} returned a P&L that could not be read for ${taxYear}. Your figures were left unchanged. Try Sync now, or enter figures manually.`,
    }
  }

  // 3. A genuinely empty year.
  if (d.revenue === 0 && d.expenses === 0 && (d.net_profit === 0 || d.net_profit == null)) {
    return {
      kind: 'empty',
      message: `${label} connected but returned no P&L for ${taxYear}. Try another tax year, Sync now, or enter figures manually.`,
    }
  }

  const revenue = d.revenue
  const expenses = d.expenses
  const reportedNet = isNum(d.net_profit) ? d.net_profit : revenue - expenses
  const derivedNet = revenue - expenses

  // 4. Reconciliation. If net_profit does not equal revenue minus expenses, the
  //    three figures did not come from one consistent report. That is a mapping
  //    fault, not a business result.
  const tolerance = Math.max(RECONCILE_ABS_TOLERANCE, Math.abs(derivedNet) * RECONCILE_REL_TOLERANCE)
  const reconciles = Math.abs(reportedNet - derivedNet) <= tolerance

  // 5. Plausibility. Occasioned by a FreshBooks sync reporting $7,642 of revenue
  //    against $487,335 of expenses with $0 officer salary — a $479,692 loss the
  //    app accepted without comment and carried into the tax calculation.
  const implausible = revenue > 0 && expenses > revenue * IMPLAUSIBLE_EXPENSE_RATIO

  let warning = null
  if (!reconciles) {
    warning = `${label} returned figures that do not add up for ${taxYear}: ${fmt(revenue)} revenue minus ${fmt(expenses)} expenses is ${fmt(derivedNet)}, but it reported net profit of ${fmt(reportedNet)}. Verify the P&L in ${label} before relying on this estimate.`
  } else if (implausible) {
    warning = `${label} reported ${fmt(expenses)} of expenses against ${fmt(revenue)} of revenue for ${taxYear} — a loss of ${fmt(Math.abs(derivedNet))}. That can be correct, but it is also what a wrong date range or account mapping looks like. Check the P&L in ${label} before relying on this estimate.`
  }

  return {
    kind: 'ok',
    warning,
    pnl: {
      grossRevenue: revenue,
      totalExpenses: expenses,
      netProfit: d.net_profit,
      officerSalary: nf(d.officer_salary),
      // AUDIT H1 NOTE (Sep 2026): the synced path deliberately does NOT add
      // employerPayrollTax. net_profit comes straight from the accounting system,
      // whose books already carry employer payroll tax as an expense — computing it
      // again would deduct it twice. Manual entry is the opposite case: the user
      // types gross receipts and expense categories, so the app must compute it
      // (see calcEmployerFICA in ManualEntryPanel).
      //
      // ⚠ The hazard is CONVERSION: opening the manual panel on a provider P&L
      // decomposes provider expenses into Operating Expenses, which may already
      // include the owner's payroll tax — and the panel then adds it again.
      // employerPayrollTax is recorded explicitly as 0 so the decompose can tell
      // the two shapes apart, and the panel warns at the point of entry.
      employerPayrollTax: 0,
      categories: d.categories || {},
    },
  }
}
