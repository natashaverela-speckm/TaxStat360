// EntityCompareModal (Issue #45, PR-S2) — UI for the Scenario Compare engine.
// Renders three scenario cards (Sole Prop / S Corp / C Corp) with a single
// officer-salary slider that drives both S Corp and C Corp scenarios.
//
// Standalone component — no caller wiring this PR. PR-S3 will import this
// from CalculateTaxInner.jsx and wire the per-entity "Compare entity types"
// button.
//
// Engine contract (./scenarioCompare.js):
//   compareEntityScenarios({ personalContext, entities, entityIdx, netProfitShare, officerSalary })
//     → { scenarios: [sole, sCorp, cCorp], best: 'soleProp'|'sCorp'|'cCorp', savings, salary }
//
// Each scenario: { key, label, totalTax, lineItems: [{label,value}], notes: [string] }

import React, { useState, useEffect, useMemo } from 'react'
import { compareEntityScenarios } from './scenarioCompare'

// Match the design system used in CalculateTaxInner.jsx + TaxReturn.jsx
const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'
const G = '#16a34a'
const R = '#dc2626'
const AMBER_BG = '#FEF3C7'
const AMBER_BORDER = '#F59E0B'
const AMBER_TEXT = '#92400E'
const RED_BG = '#FEE2E2'
const RED_BORDER = '#DC2626'
const CARD_BG = '#FFFFFF'
const CARD_BORDER = '#E2E8F0'
const SUMMARY_GREEN_BG = '#DCFCE7'
const SUMMARY_GREEN_BORDER = '#16A34A'

const fmt = n => n < 0
  ? '($' + Math.abs(Math.round(n) || 0).toLocaleString('en-US') + ')'
  : '$' + Math.abs(Math.round(n) || 0).toLocaleString('en-US')

// rcRisk detection — mirrors TaxReturn.jsx PR #55 logic, but parameterized on
// the modal's slider salary (NOT the user's actual W-2). Forward-looking:
// "if you elect S Corp at this salary, here's the audit risk."
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
  const netProfitShare = entity && entity.pnl
    ? Math.round(entity.pnl.netProfit * (parseFloat(entity.own) / 100))
    : 0

  // null → engine uses 30%-of-profit default; first render syncs slider to it.
  const [salary, setSalary] = useState(null)

  // Esc to close + body scroll lock while open.
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
    return compareEntityScenarios({
      personalContext: personalContext || {},
      entities: entities || [],
      entityIdx,
      netProfitShare,
      officerSalary: salary,
    })
  }, [isOpen, entity, personalContext, entities, entityIdx, netProfitShare, salary])

  // Sync slider to engine's chosen default on first render / when share changes.
  useEffect(() => {
    if (result && salary === null) setSalary(result.salary)
  }, [result, salary])

  if (!isOpen || !entity || !result) return null

  const rcRisk = detectRcRisk(netProfitShare, salary == null ? result.salary : salary)
  const sliderValue = salary == null ? result.salary : salary
  const sliderMax = Math.max(netProfitShare, 1)
  const cheapest = result.scenarios.find(s => s.key === result.best)
  const mostExpensive = result.scenarios.reduce((a, b) => b.totalTax > a.totalTax ? b : a)

  const summaryText = (() => {
    if (!cheapest || result.savings <= 0) return null
    const vs = mostExpensive.label
    return `${cheapest.label} saves you ${fmt(result.savings)}/year vs ${vs}`
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
                  {' '}({fmt(entity.pnl.netProfit)} × {entity.own}%)
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
          {summaryText && (
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
          )}

          {/* SLIDER */}
          <div style={{
            background: '#fff',
            border: `1px solid ${CARD_BORDER}`,
            borderRadius: 10,
            padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Officer salary (S Corp + C Corp)
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
              Default of 30% of net profit share is a placeholder until BLS p25 lookup ships.
              Drag the slider to model "what if" your reasonable comp is higher or lower.
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
                  per IRC §1366 / §3121. Distributions reclassified as wages by the IRS trigger
                  payroll tax + penalties + interest.
                  {rcRisk.severity === 'high'
                    ? ' Zero W-2 wages with a profitable S Corp is the highest-risk pattern.'
                    : ' Industry rule of thumb is 30–60% of profit; below 40% draws scrutiny.'}
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

        {/* Mobile responsive — stack scenario cards on narrow viewports */}
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
