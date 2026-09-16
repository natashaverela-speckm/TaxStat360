// src/utils/ccorpLayer.js
//
// SEVENTH PASS H-4 (16 Sep 2026) — ONE derivation of the C-Corp corporate layer for a
// return's entity list. TaxReturn.jsx folded every C-Corp entity's owner-share dividends
// into qualified dividends and added the owner-share 21% corporate tax on top of the
// personal total; the shared selector (Dashboard record card for multi-entity records,
// Step-1 provisional card, Aria's grounding, AIAnalysis gating) had NO corporate layer —
// it taxed the officer salary only, so a C-Corp owner's Step-1 card and Step 2 disagreed
// by the corporate tax plus the tax on the dividends. Both now call this helper.
//
// Planning model (unchanged): full annual distribution, owner's ownership share of both
// the dividend and the corporate tax (see ccorpOwnerShare). netProfit on a persisted
// entity is AFTER officer salary; the corporate layer wants profit BEFORE salary.

import { calcCCorpCorporateLayer } from '../lib/taxCalc.js'
import { isCCorpEntity, ccorpOwnerShare } from './entityPredicates.js'
import { nf } from './money.js'

export const EMPTY_CCORP_LAYER = Object.freeze({ corpTax: 0, dividends: 0, dividendsForEngineInput: 0, corpTaxEntity: 0, partial: false, count: 0 })

/**
 * @param entities   Step-1 entities
 * @param taxYear
 * @param ytdFactor  SEVENTH PASS M-7 (16 Sep 2026): in YTD mode the engine annualizes the
 *                   dividend it is handed (divInc is a YTD-scaled flow) but the 21% corporate
 *                   tax was computed on the raw year-to-date profit and added to an annualized
 *                   headline. The layer is now computed on ANNUALIZED profit and salary (the
 *                   same scaling the engine applies to pnl.netProfit / officerW2), so
 *                   `corpTax` / `dividends` are full-year figures; `dividendsForEngineInput`
 *                   is the year-to-date slice to hand the engine, which re-annualizes it.
 */
export function ccorpLayerForReturn(entities, taxYear, ytdFactor = 1) {
  const list = Array.isArray(entities) ? entities : []
  const f = (Number.isFinite(ytdFactor) && ytdFactor > 0) ? ytdFactor : 1
  return list.reduce((acc, e) => {
    if (!e || !isCCorpEntity(e.type)) return acc
    const salary = (nf(e.officerW2) || nf(e.pnl?.officerSalary) || 0) * f
    const netBeforeSalary = nf(e.pnl?.netProfit) * f + salary
    const layer = calcCCorpCorporateLayer({ netProfit: netBeforeSalary, officerSalary: salary, taxYear })
    const mine  = ccorpOwnerShare(layer, e.own)
    return {
      corpTax:       acc.corpTax + mine.corpTax,
      dividends:     acc.dividends + mine.dividends,
      dividendsForEngineInput: acc.dividendsForEngineInput + Math.round(mine.dividends / f),
      corpTaxEntity: acc.corpTaxEntity + layer.corpTax,
      partial:       acc.partial || mine.share < 1,
      count:         acc.count + 1,
    }
  }, { ...EMPTY_CCORP_LAYER })
}

/** Merge the corporate layer into an engine result the way Step 2 does: the engine has
 *  already taxed the dividends (folded into qualDiv) and sized the quarterly estimate on
 *  the PERSONAL total; the 21% is paid by the corporation on Form 1120 and is added to the
 *  headline total and balance only. */
export function mergeCcorpIntoResult(result, ccorp) {
  if (!result || !ccorp || (ccorp.corpTax <= 0 && ccorp.dividends <= 0)) return result
  return {
    ...result,
    ccorpCorpTax:   ccorp.corpTax,
    ccorpDividends: ccorp.dividends,
    totalTax: (result.totalTax || 0) + ccorp.corpTax,
    balance:  (result.balance  || 0) + ccorp.corpTax,
  }
}
