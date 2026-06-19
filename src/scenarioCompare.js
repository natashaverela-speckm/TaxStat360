// Scenario Compare engine (Issue #45) — pure function module.
// Takes a user's "this entity" net-profit + personal 1040 context + adjustable
// officer salary, returns three apples-to-apples scenarios (Sole Prop / S Corp /
// C Corp) computed via the calcTaxReturn orchestrator with entity-specific
// input mutations applied before each call.
//
// Contract: PURE. No React, no DOM, no side effects. Same input → same output.
// Three internal calls to calcTaxReturn — see ./taxCalc.js for the full input
// shape that calcTaxReturn accepts.
//
// Scope notes:
//   - v1 compares Sole Prop, S Corp, C Corp. Partnership deferred to v2.
//   - Comparison is on the USER'S SHARE of the entity (netProfit × own/100).
//     Multi-owner entities are modeled as if the user is the sole officer
//     of their share. Disclaimer surfaces this assumption to the user.
//   - C Corp scenario assumes full annual distribution as qualified dividends
//     (no retained-earnings strategy). Disclaimer surfaces this too.
//   - Personal context (filing status, year, dependents, all non-business
//     income, all OTHER entities, deduction choice) is held constant across
//     all three scenarios. Only the entity at `entityIdx` is replaced.
//
// What this engine ADDS to calcTaxReturn's output:
//   - For S Corp & C Corp: officer-salary employment tax (15.3% FICA on
//     officer salary up to SS wage base, 2.9% Medicare uncapped). The
//     calc engine doesn't model FICA on W-2 wages directly — it sees only
//     income tax. We add the FICA layer here so totals are comparable to
//     Sole Prop's SE tax.
//   - For C Corp: 21% federal corporate tax on the entity-level profit
//     (post-officer-W-2, post-employer-FICA). The calc engine has no concept
//     of corporate-level tax. We compute it here, deduct it from the
//     dividend pool, and pass the residual into calcTaxReturn as qualDiv.
//
// Returns: { scenarios: [{ key, label, totalTax, lineItems[], notes[] }],
//            best: 'soleProp' | 'sCorp' | 'cCorp', savings: number }

import { calcTaxReturn, TAX_TABLES } from './taxCalc.js'

// Rate constants — single source of truth in src/constants.js.
// Imported here so scenarioCompare doesn't duplicate what taxCalc.js already uses.
import {
  FICA_SS_RATE,                    // 6.2% per side — IRC §3101 / §3111
  FICA_MEDICARE_RATE,              // 1.45% per side — IRC §3101 / §3111
  C_CORP_TAX_RATE,                 // 21% flat — IRC §11 post-TCJA
  DEFAULT_OFFICER_SALARY_FRACTION, // F-05 FIX: moved from local const to constants.js
} from './constants'

// Compute employer-side employment tax on a given officer salary (used by S/C Corp).
// This is the deductible-at-entity-level half. For the comparison, we sum BOTH
// employer + employee halves into the "Employment tax" line item, since the user
// ultimately bears both as costs of the W-2 structure.
function calcEmploymentTaxOnSalary(salary, taxYear) {
  const ssWageBase = (TAX_TABLES[taxYear] || {}).ssWageBase || 176100
  const ssBoth = Math.min(salary, ssWageBase) * FICA_SS_RATE * 2  // employee + employer SS
  const medBoth = salary * FICA_MEDICARE_RATE * 2                  // employee + employer Medicare
  return Math.round(ssBoth + medBoth)
}

// Deep-clone an entities[] array, replacing index entityIdx with the synthetic
// entity that represents the scenario under test.
function withReplacedEntity(entities, entityIdx, replacement) {
  const next = (entities || []).map((e, i) => i === entityIdx ? replacement : e)
  return next
}

/**
 * Compare three entity structures for one entity in the user's portfolio.
 *
 * @param {object} input
 * @param {object} input.personalContext  All calcTaxReturn inputs EXCEPT entities[].
 * @param {array}  input.entities         All entities; index entityIdx is replaced per scenario.
 * @param {number} input.entityIdx        Which entity is being compared.
 * @param {number} input.netProfitShare   User's share of the entity's net profit.
 * @param {number} [input.officerSalary]  S Corp / C Corp officer salary. Defaults to
 *                                        DEFAULT_OFFICER_SALARY_FRACTION × netProfitShare.
 *
 * @returns {{ scenarios: object[], best: string, savings: number, salary: number }}
 */
function compareEntityScenarios(input) {
  const {
    personalContext = {},
    entities = [],
    entityIdx,
    netProfitShare,
    officerSalary,
  } = input

  const taxYear = personalContext.taxYear
  const np = Math.max(0, Math.round(netProfitShare || 0))

  // Default officer salary if not provided — capped at netProfitShare.
  const defaultSalary = Math.round(np * DEFAULT_OFFICER_SALARY_FRACTION)
  const salary = Math.max(0, Math.min(np, Math.round(officerSalary != null ? officerSalary : defaultSalary)))

  // Helper: invoke calcTaxReturn with personalContext + a custom entities[] override.
  // CRITICAL: calcTaxReturn does NOT derive k1Total from entities[] — it expects the
  // caller to pass the summed k1Total. We recompute it per scenario from the override.
  const run = (entitiesOverride, w2Boost = 0, qualDivBoost = 0) => {
    const k1Total = (entitiesOverride || []).reduce((sum, e) => {
      if (!e) return sum
      const k1Val = parseFloat(e.k1)
      return sum + (isFinite(k1Val) ? k1Val : 0)
    }, 0)
    // Finding 2 consistency: the §469(c)(7)(B) hours and the aggregation override live on
    // the rental entities, NOT in personalContext — so without this they never reach the
    // engine and the comparison would free a REP rental loss the filed return suspends.
    // Mirror TaxReturn.jsx: take the max hours across cards and OR the override. Omitted
    // hours pass through as not-provided (backward-compatible: the election still controls).
    const maxHr = key => (entitiesOverride || []).reduce((m, e) => {
      if (!e) return m
      const v = parseFloat(e[key])
      if (Number.isNaN(v)) return m
      return Number.isNaN(m) ? v : Math.max(m, v)
    }, NaN)
    const _repHoursRE    = maxHr('repHoursRE')
    const _repHoursTotal = maxHr('repHoursTotal')
    const _repOverride   = (entitiesOverride || []).some(e => e && e.repAggregationOverride === true)
    return calcTaxReturn({
      ...personalContext,
      w2:     (personalContext.w2    || 0) + w2Boost,
      qualDiv:(personalContext.qualDiv|| 0) + qualDivBoost,
      divInc: (personalContext.divInc || 0) + qualDivBoost,
      k1Total,
      entities: entitiesOverride,
      // Per-entity hours are the SINGLE source of truth (same as TaxReturn.jsx). Set these
      // explicitly AFTER the spread so a stale personalContext repHoursRE/repHoursTotal can
      // never leak in and gate the comparison differently from the filed return. `undefined`
      // ⇒ engine treats hours as not provided (backward-compatible: the election controls).
      repHoursRE:    Number.isNaN(_repHoursRE)    ? undefined : _repHoursRE,
      repHoursTotal: Number.isNaN(_repHoursTotal) ? undefined : _repHoursTotal,
      repAggregationOverride: _repOverride,
    })
  }

  // ── Scenario 1: Sole Proprietorship / Single-Member LLC ──────────────────
  const soleEntity = { type: 'Sole Proprietor / Single-Member LLC', k1: np, own: 100 }
  const soleResult = run(withReplacedEntity(entities, entityIdx, soleEntity))
  const soleScenario = {
    key: 'soleProp',
    label: 'Sole Proprietor / Single-Member LLC',
    totalTax: soleResult.totalTax,
    lineItems: [
      { label: 'Federal income tax',  value: soleResult.fedTax },
      { label: 'Self-employment tax', value: soleResult.seTax },
      { label: 'Additional Medicare', value: soleResult.additionalMedicare },
      // FIX (TAX-04): calcTaxReturn returns niit as { applies, amount, explanation }.
      // niitAmount is the backward-compat number alias. Using .niit here produced an
      // object in the line item value, which Math.abs() → NaN → filtered out silently,
      // causing the NIIT line item to disappear from the comparison even when owed.
      { label: 'NIIT',                value: soleResult.niitAmount },
      { label: 'AMT',                 value: soleResult.amt },
      { label: 'Child credit',        value: -soleResult.childCredit },
    ],
    notes: [
      'Net profit flows to Schedule C and is subject to SE tax (15.3% up to SS wage base, 2.9% Medicare thereafter).',
      'Half of SE tax is deductible above-the-line.',
      'QBI deduction available (subject to taxable income limit).',
      'No payroll service required.',
    ],
  }

  // ── Scenario 2: S Corporation ────────────────────────────────────────────
  const sCorpEmployerFICA = Math.round(
    Math.min(salary, (TAX_TABLES[taxYear] || {}).ssWageBase || 176100) * FICA_SS_RATE
    + salary * FICA_MEDICARE_RATE
  )
  const sCorpK1 = Math.max(0, np - salary - sCorpEmployerFICA)
  const sCorpEntity = { type: 'S Corporation', k1: sCorpK1, own: 100 }
  const sCorpResult = run(withReplacedEntity(entities, entityIdx, sCorpEntity), salary)
  const sCorpEmploymentTax = calcEmploymentTaxOnSalary(salary, taxYear)
  const sCorpTotalTax = sCorpResult.totalTax + sCorpEmploymentTax
  const sCorpScenario = {
    key: 'sCorp',
    label: 'S Corporation',
    totalTax: sCorpTotalTax,
    lineItems: [
      { label: 'Federal income tax',  value: sCorpResult.fedTax },
      { label: 'Employment tax (W-2)', value: sCorpEmploymentTax },
      { label: 'Additional Medicare', value: sCorpResult.additionalMedicare },
      // FIX (TAX-04): same fix as soleResult above — use niitAmount, not niit.
      { label: 'NIIT',                value: sCorpResult.niitAmount },
      { label: 'AMT',                 value: sCorpResult.amt },
      { label: 'Child credit',        value: -sCorpResult.childCredit },
    ],
    notes: [
      'Officer salary $' + salary.toLocaleString() + ' subject to 15.3% FICA up to SS wage base.',
      'K-1 distribution $' + sCorpK1.toLocaleString() + ' avoids FICA but still ordinary income.',
      'QBI deduction applies to K-1 only; subject to W-2 wage limit (your salary helps clear it).',
      'Payroll service required (typical $300-1,500/year — NOT included in this comparison).',
    ],
  }

  // ── Scenario 3: C Corporation ────────────────────────────────────────────
  const cCorpEmployerFICA = sCorpEmployerFICA  // same salary → same calc
  const cCorpProfitBeforeTax = Math.max(0, np - salary - cCorpEmployerFICA)
  const cCorpCorpTax = Math.round(cCorpProfitBeforeTax * C_CORP_TAX_RATE)
  const cCorpDividends = Math.max(0, cCorpProfitBeforeTax - cCorpCorpTax)
  const cCorpEntity = { type: 'C Corporation', k1: 0, own: 100 }
  const cCorpResult = run(
    withReplacedEntity(entities, entityIdx, cCorpEntity),
    salary,         // W-2 boost
    cCorpDividends, // qualified dividends boost
  )
  const cCorpEmploymentTax = calcEmploymentTaxOnSalary(salary, taxYear)
  const cCorpTotalTax = cCorpResult.totalTax + cCorpEmploymentTax + cCorpCorpTax
  const cCorpScenario = {
    key: 'cCorp',
    label: 'C Corporation',
    totalTax: cCorpTotalTax,
    lineItems: [
      { label: 'Federal income tax (personal)', value: cCorpResult.fedTax },
      { label: 'Corporate tax (21% flat)',       value: cCorpCorpTax },
      { label: 'Employment tax (W-2)',            value: cCorpEmploymentTax },
      { label: 'Additional Medicare',             value: cCorpResult.additionalMedicare },
      // FIX (TAX-04): same fix as soleResult above — use niitAmount, not niit.
      { label: 'NIIT',                            value: cCorpResult.niitAmount },
      { label: 'AMT',                             value: cCorpResult.amt },
      { label: 'Child credit',                    value: -cCorpResult.childCredit },
    ],
    notes: [
      'Officer salary $' + salary.toLocaleString() + ' subject to 15.3% FICA up to SS wage base.',
      'Corporate tax of $' + cCorpCorpTax.toLocaleString() + ' (21% flat) on $' + cCorpProfitBeforeTax.toLocaleString() + ' entity profit.',
      'Dividends $' + cCorpDividends.toLocaleString() + ' taxed at 0/15/20% qualified dividend rates + potential 3.8% NIIT — DOUBLE TAXATION.',
      'QBI deduction NOT available (C Corp distributions are not QBI per IRC §199A).',
      'Assumes full annual distribution; retained-earnings strategy NOT modeled.',
      'Payroll service required (NOT included in this comparison).',
    ],
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const scenarios = [soleScenario, sCorpScenario, cCorpScenario]
  const cheapest      = scenarios.reduce((a, b) => b.totalTax < a.totalTax ? b : a)
  const mostExpensive = scenarios.reduce((a, b) => b.totalTax > a.totalTax ? b : a)
  const savings = mostExpensive.totalTax - cheapest.totalTax

  return {
    scenarios,
    best: cheapest.key,
    savings,
    salary,  // echo so caller can show the actual salary used
  }
}

export {
  compareEntityScenarios,
  // Constants re-exported for tests and debugging.
  // Rate values now live in src/constants.js — importing here for backwards compat.
  FICA_SS_RATE,
  FICA_MEDICARE_RATE,
  C_CORP_TAX_RATE,
  DEFAULT_OFFICER_SALARY_FRACTION,
}
