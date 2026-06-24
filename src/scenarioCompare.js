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
// - v1 compares Sole Prop, S Corp, C Corp. Partnership deferred to v2.
// - Comparison is on the USER'S SHARE of the entity (netProfit × own/100).
//   Multi-owner entities are modeled as if the user is the sole officer
//   of their share. Disclaimer surfaces this assumption to the user.
// - C Corp scenario assumes full annual distribution as qualified dividends
//   (no retained-earnings strategy). Disclaimer surfaces this too.
// - Personal context (filing status, year, dependents, all non-business
//   income, all OTHER entities, deduction choice) is held constant across
//   all three scenarios. Only the entity at `entityIdx` is replaced.
//
// What this engine ADDS to calcTaxReturn's output:
// - For S Corp & C Corp: officer-salary employment tax (15.3% FICA on
//   officer salary up to SS wage base, 2.9% Medicare uncapped). The
//   calc engine doesn't model FICA on W-2 wages directly — it sees only
//   income tax. We add the FICA layer here so totals are comparable to
//   Sole Prop's SE tax.
// - For C Corp: 21% federal corporate tax on the entity-level profit
//   (post-officer-W-2, post-employer-FICA). Delegated to calcCCorpCorporateLayer()
//   in taxCalc.js — the same function used by TaxReturn.jsx and Dashboard.jsx —
//   so the compare engine and the filed-return engine are always in sync.
//   (Audit finding: the prior inline C-Corp block here diverged from
//   calcCCorpCorporateLayer when that function was added in PASS4B-03.)
//
// Returns: { scenarios: [{ key, label, totalTax, lineItems[], notes[] }],
//            best: 'soleProp' | 'sCorp' | 'cCorp', savings: number }

// CC-F4 FIX: import getTable so SS wage base uses the year-specific value
// instead of a hardcoded || 176100 literal (the 2025 base). This ensures
// the entity comparison stays correct as TAX_TABLES adds future years.
// Audit fix: added calcCCorpCorporateLayer and calcFICAOnWages so the compare
// engine delegates to the shared implementations rather than inlining them.
import { calcTaxReturn, getTable, calcCCorpCorporateLayer, calcFICAOnWages } from './taxCalc.js'

// Rate constants — single source of truth in src/constants.js.
// Imported here so scenarioCompare doesn't duplicate what taxCalc.js already uses.
import {
  FICA_SS_RATE,              // 6.2% per side — IRC §3101 / §3111
  FICA_MEDICARE_RATE,        // 1.45% per side — IRC §3101 / §3111
  C_CORP_TAX_RATE,           // 21% flat — IRC §11 post-TCJA
  DEFAULT_OFFICER_SALARY_FRACTION, // F-05 FIX: moved from local const to constants.js
} from './constants'

// Audit fix (nv alias): nv was re-exported from here solely because taxCalc.js
// kept it for backward-compat. Now that the alias is removed from taxCalc.js,
// scenarioCompare.js no longer re-exports it. Any test that imported nv from
// scenarioCompare should import nf from utils/parseMoney.js instead.

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
 * @param {object} input.personalContext All calcTaxReturn inputs EXCEPT entities[].
 * @param {array}  input.entities        All entities; index entityIdx is replaced per scenario.
 * @param {number} input.entityIdx       Which entity is being compared.
 * @param {number} input.netProfitShare  User's share of the entity's net profit.
 * @param {number} [input.officerSalary] S Corp / C Corp officer salary. Defaults to
 *                                       DEFAULT_OFFICER_SALARY_FRACTION × netProfitShare.
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
      w2:     (personalContext.w2     || 0) + w2Boost,
      qualDiv:(personalContext.qualDiv || 0) + qualDivBoost,
      divInc: (personalContext.divInc  || 0) + qualDivBoost,
      k1Total,
      entities: entitiesOverride,
      // Per-entity hours are the SINGLE source of truth (same as TaxReturn.jsx). Set these
      // explicitly AFTER the spread so a stale personalContext repHoursRE/repHoursTotal can
      // never leak in and gate the comparison differently from the filed return. `undefined`
      // ⇒ engine treats hours as not provided (backward-compatible: the election controls).
      repHoursRE:             Number.isNaN(_repHoursRE)    ? undefined : _repHoursRE,
      repHoursTotal:          Number.isNaN(_repHoursTotal)  ? undefined : _repHoursTotal,
      repAggregationOverride: _repOverride,
    })
  }

  // ── Sole Proprietor scenario ───────────────────────────────────────────────
  // SE tax (§1401) is computed by the engine via the Schedule C entity path.
  // No officer salary in this structure.
  const spEntity = {
    type: 'Sole Proprietor / Single-Member LLC',
    netProfit: np,
    own: 100,
    k1: np,
  }
  const spEntities = withReplacedEntity(entities, entityIdx, spEntity)
  const spResult   = run(spEntities)
  const spTax      = spResult.totalTax

  // ── S Corp scenario ────────────────────────────────────────────────────────
  // Officer salary is W-2 income; remaining profit is K-1 distribution (no SE tax).
  // Employment tax on the salary is computed by calcFICAOnWages (both sides, IRC §3101/§3111).
  const scK1      = Math.max(0, np - salary)
  const scEntity  = {
    type: 'S Corporation',
    netProfit: np,
    own: 100,
    k1: scK1,
    officerSalary: salary,
    pnl: { officerSalary: salary, netProfit: np },
  }
  const scEntities = withReplacedEntity(entities, entityIdx, scEntity)
  const scResult   = run(scEntities, salary, 0)          // officer salary boosts W-2
  // calcFICAOnWages: both employer + employee sides on the W-2 salary (IRC §3101 / §3111).
  const scFICA     = calcFICAOnWages(salary, taxYear)
  const scTax      = scResult.totalTax + scFICA

  // ── C Corp scenario ────────────────────────────────────────────────────────
  // Delegates to calcCCorpCorporateLayer() — the SAME function used by TaxReturn.jsx
  // and Dashboard.jsx — so the compare engine and the filed-return engine cannot diverge.
  // Audit fix (finding 4.2): the prior inline C-Corp block here did not call
  // calcCCorpCorporateLayer, creating a formula-duplication risk.
  const layer        = calcCCorpCorporateLayer({ netProfit: np, officerSalary: salary, taxYear })
  const corpTax      = layer.corpTax         // IRC §11 entity-level flat tax
  const dividends    = layer.dividends       // after-tax profit distributed as qualDiv
  const ccFICA       = calcFICAOnWages(salary, taxYear)
  // Officer salary is W-2 to the owner; dividends are qualified dividends (0%/15%/20%).
  const ccEntity     = {
    type: 'C Corporation',
    netProfit: np,
    own: 100,
    k1: 0,
    officerSalary: salary,
  }
  const ccEntities   = withReplacedEntity(entities, entityIdx, ccEntity)
  const ccResult     = run(ccEntities, salary, dividends) // salary→W-2, dividends→qualDiv
  const ccTax        = ccResult.totalTax + corpTax + ccFICA

  // ── Compare & rank ─────────────────────────────────────────────────────────
  const scenarioMap = {
    soleProp: { key: 'soleProp', label: 'Sole Proprietor / Schedule C', totalTax: spTax, result: spResult,
      lineItems: [
        { label: 'Income tax + SE tax', value: spTax },
      ],
      notes: [
        'Self-employment tax (15.3% on 92.35% of net profit) computed by the engine — IRC §1401.',
        '20% QBI deduction may apply — IRC §199A.',
      ],
    },
    sCorp: { key: 'sCorp', label: 'S Corporation', totalTax: scTax, result: scResult,
      lineItems: [
        { label: 'Income tax on K-1 + salary', value: scResult.totalTax },
        { label: `Employment tax on $${salary.toLocaleString()} salary (both sides)`, value: scFICA },
      ],
      notes: [
        `Officer salary: $${salary.toLocaleString()} — IRC §3121 reasonable comp requirement.`,
        'K-1 distributions not subject to SE tax — IRC §1402(a)(2).',
        '20% QBI deduction may apply on K-1 income — IRC §199A.',
      ],
    },
    cCorp: { key: 'cCorp', label: 'C Corporation', totalTax: ccTax, result: ccResult,
      lineItems: [
        { label: `Corporate income tax (${(C_CORP_TAX_RATE * 100).toFixed(0)}% flat)`, value: corpTax },
        { label: `Employment tax on $${salary.toLocaleString()} salary (both sides)`, value: ccFICA },
        { label: 'Personal income tax on salary + dividends', value: ccResult.totalTax },
      ],
      notes: [
        'Assumes full after-tax profit distributed as qualified dividends each year.',
        'No retained-earnings tax deferral modeled — actual result may differ.',
        `Corporate tax rate: ${(C_CORP_TAX_RATE * 100).toFixed(0)}% flat — IRC §11 (post-TCJA).`,
      ],
    },
  }

  const sorted = Object.values(scenarioMap).sort((a, b) => a.totalTax - b.totalTax)
  const best   = sorted[0].key
  const savings = sorted[1].totalTax - sorted[0].totalTax

  return {
    scenarios: Object.values(scenarioMap),
    best,
    savings: Math.max(0, savings),
    salary,
  }
}

export { compareEntityScenarios }
