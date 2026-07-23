// EntityCompareModal (Issue #45, PR-S2) — UI for the Scenario Compare engine.
// Renders three scenario cards (Sole Prop / S Corp / C Corp) with a single
// officer-salary slider that drives both S Corp and C Corp scenarios.
//
// Engine contract (./scenarioCompare.js):
//   compareEntityScenarios({ personalContext, entities, entityIdx, netProfitShare, officerSalary })
//     → { scenarios: [sole, sCorp, cCorp], best: 'soleProp'|'sCorp'|'cCorp', savings, salary }
//
// Each scenario: { key, label, totalTax, lineItems: [{label,value}], notes: [string] }
//
// CC-M01: Inline color constants replaced with imports from theme.js.
// CC-M02: Local fmt() replaced with import from utils/formatMoney.js.
// UX-N04: Added visible C-Corp full-dividend assumption callout near scenario cards.

import React, { useState, useEffect, useMemo } from 'react'
import { compareEntityScenarios } from './lib/scenarioCompare'
// CC-M01: single source of truth for colors.
import {
  NAVY as N,
  BLUE as B,
  SLATE as SL,
  GREEN as G,
  RED as R,
  AMBER_BG,
  AMBER_BORDER,
  AMBER_TEXT,
  RED_BG,
  RED_BORDER,
  SURFACE_CARD as CARD_BG,
  BORDER_DEFAULT as CARD_BORDER,
} from './lib/theme.js'
// CC-M02: canonical currency formatter.
import { fmt, nf } from './utils/money.js'
import { CURRENT_TAX_YEAR } from './lib/constants.js'
// AUDIT F2 FIX (second root cause): entity-type predicates for the vocabulary translator below.
import { isSCorpEntity, isCCorpEntity } from './utils/entityPredicates'

// ─── AUDIT F2 FIX (second root cause) ────────────────────────────────────────
// COMPARE-PC fixed personalContext arriving as a lazy getter, but a second gap
// remained: readPersonalContext() speaks the SESSION vocabulary (filingStatus,
// w2Income, interest, dividends, qualifiedDividends…) while calcTaxReturn —
// which compareEntityScenarios invokes — expects the ENGINE vocabulary (status,
// w2, intInc, divInc, qualDiv…). Fed session keys, the engine's input guard
// rejects the call and every scenario's totalTax comes back null, which fmt()
// renders as "$0" on all three cards. This translator mirrors the authoritative
// mapping in TaxReturn.jsx's calcInput (the filed-return path), so the
// comparison is computed on exactly the same personal context as the return:
// - filingStatus → status · w2Income (+ officer W-2 of the OTHER entities;
//   the compared entity's salary is applied per-scenario by the engine) → w2
// - interest → intInc · dividends → divInc · qualDividends → qualDiv
// - capitalGains/ltGain → ltGain · form4797 (+ other entities' Box 17K) → f4797Inc
// - priorYearLosses → priorYearQBILoss · nonrecap1231 → nonrecapturedNet1231Loss
// - ytdMode/ytdMonth → ytdFactor, so a mid-year (YTD) session compares on the
//   same annualized basis as the filed return
// Passthroughs (same name in both vocabularies) are coerced with nf().
export function toEngineContext(pc, entities = [], entityIdx = 0) {
  const p = pc || {}
  const others = entities.filter((_, i) => i !== entityIdx)
  const officerW2Others = others.reduce((s, e) => {
    if (!e) return s
    const isCorp = isSCorpEntity(e.type) || isCCorpEntity(e.type)
    return isCorp ? s + (nf(e.officerW2) || nf(e.pnl?.officerSalary) || 0) : s
  }, 0)
  const box17KOthers = others.reduce((s, e) => s + (e ? nf(e.box17K) : 0), 0)
  const ytdFactor = p.ytdMode && nf(p.ytdMonth) > 0 ? 12 / nf(p.ytdMonth) : 1
  return {
    // M2 (audit F-05): coerce to a canonical number for the strict calculation guard.
    // Session state can hold taxYear as a numeric string; the engine previously
    // tolerated that via object-key lookup (and fell back to CURRENT_TAX_YEAR for
    // unresolvable years). This makes that same fallback explicit, so behavior is
    // unchanged while the guard's finite-number contract is satisfied.
    taxYear: parseInt(p.taxYear) || CURRENT_TAX_YEAR,
    status: p.filingStatus || 'single',
    dependents: nf(p.dependents),
    w2: nf(p.w2Income) + officerW2Others,
    stGain: nf(p.stGain),
    ltGain: nf(p.ltGain ?? p.capitalGains),
    intInc: nf(p.interest),
    divInc: nf(p.dividends),
    qualDiv: nf(p.qualDividends ?? p.qualifiedDividends),
    f4797Inc: nf(p.form4797) + box17KOthers,
    taxableSS: 0, iraIncome: 0,
    selfEmpHealthIns: nf(p.selfEmpHealthIns), hsaDeduction: nf(p.hsaDeduction),
    studentLoanInt: nf(p.studentLoanInt), selfEmpRetirement: nf(p.selfEmpRetirement),
    nolCarryforward: nf(p.nolCarryforward), priorYearQBILoss: nf(p.priorYearLosses),
    saltAmount: nf(p.saltAmount), hasISO: !!p.hasISO, isoBargainElement: nf(p.isoBargainElement),
    isREP: !!p.isREP,
    isActiveParticipant: p.isActiveParticipant !== false,
    rentalAggregationElection: !!p.rentalAggregationElection,
    unrecap1250: nf(p.unrecap1250), collectiblesGain: nf(p.collectiblesGain),
    nonrecapturedNet1231Loss: nf(p.nonrecap1231),
    w2Withheld: nf(p.w2Withheld), estPaid: nf(p.estPaid),
    ytdFactor,
    priorYearTax: nf(p.priorYearTax), priorYearAGI: nf(p.priorYearAGI),
    priorPassiveLossCarryforward: nf(p.priorPassiveLossCarryforward),
    priorSuspendedLoss: nf(p.priorSuspendedLoss),
    assumeZeroBasisOnLoss: true,
    useItemized: !!p.useItemized, itemizedAmt: nf(p.itemizedAmt),
    medicalExpenses: nf(p.medicalAmt ?? p.medicalExpenses),
  }
}

// Component-local tokens not in theme.js
const SUMMARY_GREEN_BG     = '#DCFCE7'
const SUMMARY_GREEN_BORDER = '#16A34A'

function detectRcRisk(netProfitShare, salary) {
  if (netProfitShare <= 20000) return null
  if (salary === 0) {
    return { severity: 'high', sCorpProfit: netProfitShare, w2Wages: 0, ratio: 0 }
  }
  if (netProfitShare > 30000 && salary / netProfitShare < 0.4) {
    return {
      severity: 'medium',
      sCorpProfit: netProfitShare,
      w2Wages: salary,
      ratio: salary / netProfitShare,
    }
  }
  return null
}

function ScenarioCard({ scenario, isBest, isMostExpensive }) {
  const accent = isBest ? G : (isMostExpensive ? R : SL)
  return (
    <div style={{
      background: CARD_BG,
      border: `1.5px solid ${isBest ? G : CARD_BORDER}`,
      borderRadius: 12,
      padding: 20,
      boxShadow: isBest ? '0 4px 12px rgba(22,163,74,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      position: 'relative',
    }}>
      {isBest && (
        <div style={{
          position: 'absolute',
          top: -10,
          right: 12,
          background: G,
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: 999,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>
          ⭐ Best
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
          {scenario.label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1.1 }}>
          {fmt(scenario.totalTax)}
        </div>
        <div style={{ fontSize: 11, color: SL, marginTop: 2 }}>Total federal tax cost</div>
      </div>

      <div style={{ borderTop: `1px solid ${CARD_BORDER}`, paddingTop: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
          Breakdown
        </div>
        {scenario.lineItems
          .filter(li => Math.abs(li.value || 0) >= 1)
          .map((li, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: N }}>
              <span style={{ color: SL }}>{li.label}</span>
              <span style={{ fontWeight: 600, color: li.value < 0 ? G : N }}>
                {li.value < 0 ? '−' : ''}{fmt(li.value).replace('(', '').replace(')', '')}
              </span>
            </div>
          ))}
      </div>

      {scenario.notes && scenario.notes.length > 0 && (
        <div style={{ borderTop: `1px solid ${CARD_BORDER}`, paddingTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Notes
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: SL, lineHeight: 1.5 }}>
            {scenario.notes.map((note, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EntityCompareModal({ isOpen, onClose, entity, personalContext, entities, entityIdx }) {
  // Comparison base must be net profit BEFORE officer salary — each scenario applies its
  // own salary treatment (sole prop: none; S/C-corp: salary + employer FICA). The entity's
  // persisted pnl.netProfit is AFTER salary (matching the Tax Tracker/Dashboard), so add the
  // officer salary back to reconstruct before-salary profit, consistent with those surfaces.
  const netProfitShare = entity && entity.pnl
    ? Math.round(
        ((parseFloat(entity.pnl.netProfit) || 0) + (parseFloat(entity.officerW2 ?? entity.pnl.officerSalary) || 0))
        * (parseFloat(entity.own) / 100)
      )
    : 0

  const [salary, setSalary] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const onKey = e => { if (e.key === 'Escape') onClose && onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  const result = useMemo(() => {
    if (!isOpen || !entity) return null
    try {
      // FIX (COMPARE-PC): CalculateTaxInner passes personalContext as a lazy getter
      // function (() => { return ctx }) rather than a plain object. This prevents
      // recomputing the context on every CalculateTaxInner render (expensive reads
      // from sessionState). EntityCompareModal must call it if it's a function.
      // Without this fix, {…personalContext} spread on a function → {}, stripping
      // all personal tax fields from calcTaxReturn and making totalTax → 0.
      const pc = typeof personalContext === 'function' ? personalContext() : personalContext
      // AUDIT F2 FIX (second root cause): translate session vocabulary → engine
      // vocabulary before invoking the engine. See toEngineContext() above.
      return compareEntityScenarios({
        personalContext: toEngineContext(pc, entities || [], entityIdx),
        entities: entities || [],
        entityIdx,
        netProfitShare,
        officerSalary: salary,
      })
    } catch (err) {
      // Defensive: if compareEntityScenarios throws (e.g. unexpected entity shape),
      // return null rather than crashing the modal. Console error preserved for debugging.
      console.error('[EntityCompareModal] compareEntityScenarios error:', err)
      return null
    }
  }, [isOpen, entity, personalContext, entities, entityIdx, netProfitShare, salary])

  useEffect(() => {
    if (result && salary === null) setSalary(result.salary)
  }, [result, salary])

  if (!isOpen || !entity) return null

  // If comparison failed, show a graceful error state
  if (!result) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compare entity types"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', padding: '40px 16px', overflowY: 'auto',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div onClick={e => e.stopPropagation()} style={{
          background: '#F8FAFC', borderRadius: 16, maxWidth: 600, width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: 32,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: N }}>Entity Comparison</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: SL, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '16px 20px', fontSize: 13, color: '#991B1B', lineHeight: 1.6 }}>
            ⚠ Could not compute the entity comparison. This can occur if your entity data is incomplete.
            Please ensure revenue and expenses are entered in Step 1, then try again.
          </div>
        </div>
      </div>
    )
  }

  const rcRisk = detectRcRisk(netProfitShare, salary == null ? result.salary : salary)
  const sliderValue = salary == null ? result.salary : salary
  const sliderMax = Math.max(netProfitShare, 1)
  const cheapest = result.scenarios.find(s => s.key === result.best)
  const mostExpensive = result.scenarios.reduce((a, b) => b.totalTax > a.totalTax ? b : a)

  // UX-N04: determine if C-Corp scenario is in the comparison (it always is, but guard defensively)
  const hasCCorpScenario = result.scenarios.some(s => s.key === 'cCorp')

  const summaryText = (() => {
    if (netProfitShare <= 0) return null
    if (!cheapest) return null
    if (result.savings <= 0) return null
    if (cheapest.key === mostExpensive.key) return null
    return `${cheapest.label} saves you ${fmt(result.savings)}/year vs ${mostExpensive.label}`
  })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compare entity types"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13,27,62,0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 16px',
        overflowY: 'auto',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#F8FAFC',
          borderRadius: 16,
          maxWidth: 1100,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          color: N,
          overflow: 'hidden',
        }}
      >
        {/* HEADER */}
        <div style={{
          background: '#fff',
          borderBottom: `1px solid ${CARD_BORDER}`,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
              Compare entity types
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: N, lineHeight: 1.2 }}>
              {entity.name || 'Business'}
            </div>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>
              Net profit share: <strong style={{ color: N }}>{fmt(netProfitShare)}</strong>
              {entity.pnl && (
                <span style={{ color: SL }}>
                  {/* AUDIT N-4 FIX: netProfitShare adds officer salary back (pre-salary profit
                      for apples-to-apples entity comparison) — the caption must say so. */}
                  {' '}(({fmt(entity.pnl.netProfit)} net + {fmt(parseFloat(entity.officerW2 ?? entity.pnl.officerSalary) || 0)} officer salary) × {entity.own}%)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 28,
              lineHeight: 1,
              color: SL,
              cursor: 'pointer',
              padding: 4,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* SUMMARY BANNER */}
          {netProfitShare <= 0 ? (
            <div style={{
              background: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 14,
              color: '#1D4ED8',
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
              <span>Enter your business revenue in Step 1 to see your entity comparison. All scenarios show $0 with no income entered.</span>
            </div>
          ) : summaryText ? (
            <div style={{
              background: SUMMARY_GREEN_BG,
              border: `1.5px solid ${SUMMARY_GREEN_BORDER}`,
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 15,
              fontWeight: 600,
              color: '#14532D',
            }}>
              <span style={{ fontSize: 22 }}>💰</span>
              <span>{summaryText}</span>
            </div>
          ) : null}

          {/* SLIDER */}
          <div style={{
            background: '#fff',
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 10,
            padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              {/* TERMINOLOGY FIX 3.3: "Officer salary" → "Officer Compensation" — matches IRS Form 1120-S
                  language and the FINANCIAL_LABELS.officerCompensationField constant used elsewhere. */}
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Officer Compensation (S-Corp / C-Corp)
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: N }}>{fmt(sliderValue)}</div>
            </div>
            <input
              type="range"
              min={0}
              max={sliderMax}
              step={500}
              value={sliderValue}
              onChange={e => setSalary(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: B, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: SL, marginTop: 4 }}>
              <span>$0</span>
              <span>{fmt(sliderMax)}</span>
            </div>
            <div style={{ fontSize: 12, color: SL, marginTop: 8 }}>
              Drag to model different officer salary levels for the S-Corp and C-Corp scenarios.
              The IRS requires S-Corp owner-employees to pay themselves reasonable compensation
              comparable to what a similarly qualified employee would earn (IRC §1.162-7;
              Rev. Rul. 74-44). Work with your CPA to set the appropriate amount for your
              role and industry.
            </div>
          </div>

          {/* RC RISK WARNING */}
          {rcRisk && (
            <div style={{
              background: rcRisk.severity === 'high' ? RED_BG : AMBER_BG,
              border: `1.5px solid ${rcRisk.severity === 'high' ? RED_BORDER : AMBER_BORDER}`,
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              gap: 12,
            }}>
              <span style={{ fontSize: 18, lineHeight: '24px', flexShrink: 0 }}>
                {rcRisk.severity === 'high' ? '🚨' : '⚠️'}
              </span>
              <div style={{ fontSize: 13, color: rcRisk.severity === 'high' ? '#7F1D1D' : AMBER_TEXT, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  Reasonable Compensation Risk — IRS Audit Flag
                </div>
                <div>
                  At this salary, the S Corp scenario shows {fmt(rcRisk.sCorpProfit)} in net profit
                  but only {fmt(rcRisk.w2Wages)} in W-2 wages
                  ({(rcRisk.ratio * 100).toFixed(1)}% ratio).
                  The IRS requires S Corp owner-employees to pay themselves "reasonable compensation"
                  per IRC §162(a)(1), Treas. Reg. §1.162-7, and Rev. Rul. 74-44 (wage
                  treatment under IRC §3121). Distributions reclassified as wages by the IRS trigger
                  payroll tax + penalties + interest.
                  {rcRisk.severity === 'high'
                    ? ' Zero W-2 wages with a profitable S Corp is the highest-risk pattern.'
                    : ' There is no statutory safe harbor; common practitioner heuristics fall around 35–60% of profit, and ratios below roughly 40% tend to draw scrutiny (Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012)).'}
                </div>
              </div>
            </div>
          )}

          {/* SCENARIO CARDS */}
          <div className="ts360-compare-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}>
            {result.scenarios.map(s => (
              <ScenarioCard
                key={s.key}
                scenario={s}
                isBest={s.key === result.best}
                isMostExpensive={s.key === mostExpensive.key && s.key !== result.best}
              />
            ))}
          </div>

          {/* UX-N04: C-Corp full-dividend assumption callout — visible near the cards.
              The disclaimer section mentions this assumption but users miss it. This callout
              surfaces it prominently so no one interprets the C-Corp figure at face value
              without understanding the retained-earnings impact. */}
          {hasCCorpScenario && netProfitShare > 0 && (
            <div style={{
              background: AMBER_BG,
              border: `1px solid ${AMBER_BORDER}`,
              borderRadius: 10,
              padding: '12px 18px',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, lineHeight: '22px' }}>⚠️</span>
              <div style={{ fontSize: 12, color: AMBER_TEXT, lineHeight: 1.6 }}>
                <strong>C-Corp scenario assumes full distribution of profits as qualified dividends.</strong>{' '}
                If profits are retained in the corporation instead, the personal-level dividend tax is deferred — reducing the C-Corp's apparent tax cost in this comparison.
                Retained earnings can be advantageous for reinvestment-heavy businesses, but the deferred tax becomes due when profits are eventually distributed or the company is sold.
                Discuss retained-earnings strategy with your CPA before using this comparison to make an entity election.
              </div>
            </div>
          )}

          {/* DISCLAIMER */}
          <div style={{
            background: '#F1F5F9',
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 10,
            padding: '14px 18px',
            fontSize: 12,
            color: SL,
            lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, color: N, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              What this comparison does NOT model
            </div>
            State income tax · Payroll service costs (~$300–1,500/yr for S/C Corp) ·
            Entity formation and ongoing compliance fees · Retirement plan strategy
            (Solo 401(k), SEP, defined benefit) · Fringe benefits (health insurance,
            HRA, §125 plans) · C Corp retained-earnings strategy (assumes full annual
            distribution) · Multi-owner dynamics (single-officer assumption applies).
            Consult a tax professional before changing your entity structure.
          </div>
        </div>

        {/* Mobile responsive */}
        <style>{`
          @media (max-width: 768px) {
            .ts360-compare-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  )
}

export default EntityCompareModal
