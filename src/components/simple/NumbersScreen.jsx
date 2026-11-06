// src/components/simple/NumbersScreen.jsx — Screen 2, "Your numbers"
//
// One column, at most five visible fields, a live provisional estimate beside
// them. Every field maps onto an input the engine already reads (see
// buildEntityFromNumbers / writeSimpleFlowState in lib/simpleFlow.js). The only
// blocking rule: revenue (or rent) > 0. Connect buttons for accounting software
// sit above the fields and hand off to the existing Tax Tracker, where the
// OAuth flows live; manual entry stays the default so the result is never
// blocked on a third-party sign-in.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SimpleShell from './SimpleShell.jsx'
import MoneyInput from '../MoneyInput.jsx'
import {
  tileByKey, FIELD_COPY, FILING_STATUS_OPTIONS,
  previewFromNumbers, writeSimpleFlowState,
} from '../../lib/simpleFlow.js'
import { readTaxYear, writePresetEntityType } from '../../utils/sessionState.js'
import { fmt, nf } from '../../utils/money.js'
import { NAVY as N, SLATE as SL, BLUE as B, RED as R } from '../../lib/theme.js'

const INTEGRATIONS = [
  { id: 'quickbooks', label: 'QuickBooks' },
  { id: 'xero',       label: 'Xero' },
  { id: 'wave',       label: 'Wave' },
  { id: 'freshbooks', label: 'FreshBooks' },
]

const inputStyle = { width: '100%', padding: '12px 14px', border: '1px solid #CBD5E1', borderRadius: 10, fontSize: 16, color: N, background: '#fff', boxSizing: 'border-box' }

function Field({ id, copy, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 14, fontWeight: 700, color: N, marginBottom: 6 }}>{copy.label}</label>
      {children}
      {copy.help && <div style={{ fontSize: 12, color: SL, marginTop: 6, lineHeight: 1.5 }}>{copy.help}</div>}
    </div>
  )
}

export default function NumbersScreen() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const tile = tileByKey(params.get('tile')) || tileByKey('scorp')
  const taxYear = readTaxYear()

  const [v, setV] = useState({
    revenue: '', expenses: '', officerSalary: '', depreciation: '', ownership: '100',
    filingStatus: 'single', w2Other: '', w2Withheld: '',
  })
  const [touched, setTouched] = useState(false)
  const set = (k) => (val) => setV(prev => ({ ...prev, [k]: val }))
  const has = (f) => tile.fields.includes(f)
  const isRental = has('rent')
  const w2Required = has('w2Required')

  const revenueVal = nf(v.revenue)
  const revenueOk = revenueVal > 0
  const w2Val = nf(v.w2Other)
  const w2Ok = !w2Required || w2Val > 0
  const canContinue = revenueOk && w2Ok

  // Live card: pure preview, nothing persisted until Continue.
  const preview = useMemo(() => {
    if (!revenueOk) return null
    try {
      return previewFromNumbers({ tile, ...v, taxYear })
    } catch (_e) {
      // A preview failure must never block typing; the card simply stays blank until the inputs validate.
      return null
    }
  }, [tile, v, taxYear, revenueOk])
  const previewTax = preview && preview.summary && preview.summary.ok ? preview.summary.totalTax : null

  const continueToResult = () => {
    setTouched(true)
    if (!canContinue) return
    writeSimpleFlowState({ tile, ...v, taxYear })
    nav('/result')
  }

  const connect = () => {
    // The OAuth connect buttons live on the Tax Tracker; seed the entity type so it
    // opens with the right card and the user lands straight on "Connect".
    writePresetEntityType(tile.entityType)
    nav('/calculate-tax')
  }

  return (
    <SimpleShell step="numbers" maxWidth={920}>
      <button onClick={() => nav('/start')} style={{ background: 'none', border: 'none', color: SL, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back</button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 4px' }}>{tile.icon} {tile.label}</h1>
      <p style={{ fontSize: 14, color: SL, margin: '0 0 18px' }}>Estimates are fine. You can refine every number later.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 300px)', gap: 20, alignItems: 'start' }} className="simple-numbers-grid">
        <div>
          {!isRental && (
            <div style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: N, marginBottom: 8 }}>Use accounting software? Connect it and we'll fill these in.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {INTEGRATIONS.map(i => (
                  <button key={i.id} onClick={connect} style={{ padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff', color: N, fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>{i.label}</button>
                ))}
              </div>
            </div>
          )}

          {has('revenue') && (
            <Field id="sf-revenue" copy={FIELD_COPY.revenue}>
              <MoneyInput id="sf-revenue" value={v.revenue} onChange={set('revenue')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.revenue.label} />
            </Field>
          )}
          {has('rent') && (
            <Field id="sf-revenue" copy={FIELD_COPY.rent}>
              <MoneyInput id="sf-revenue" value={v.revenue} onChange={set('revenue')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.rent.label} />
            </Field>
          )}
          {touched && !revenueOk && <div role="alert" style={{ color: R, fontSize: 13, marginTop: -10, marginBottom: 14 }}>Enter what came in this year to see a result.</div>}

          {has('expenses') && (
            <Field id="sf-expenses" copy={FIELD_COPY.expenses}>
              <MoneyInput id="sf-expenses" value={v.expenses} onChange={set('expenses')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.expenses.label} />
            </Field>
          )}
          {has('rentalExpenses') && (
            <Field id="sf-expenses" copy={FIELD_COPY.rentalExpenses}>
              <MoneyInput id="sf-expenses" value={v.expenses} onChange={set('expenses')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.rentalExpenses.label} />
            </Field>
          )}
          {has('officerSalary') && (
            <Field id="sf-salary" copy={FIELD_COPY.officerSalary}>
              <MoneyInput id="sf-salary" value={v.officerSalary} onChange={set('officerSalary')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.officerSalary.label} />
            </Field>
          )}
          {has('depreciation') && (
            <Field id="sf-dep" copy={FIELD_COPY.depreciation}>
              <MoneyInput id="sf-dep" value={v.depreciation} onChange={set('depreciation')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.depreciation.label} />
            </Field>
          )}
          {has('ownership') && (
            <Field id="sf-own" copy={FIELD_COPY.ownership}>
              <input id="sf-own" type="number" min="0" max="100" value={v.ownership} onChange={e => set('ownership')(e.target.value)} style={inputStyle} />
            </Field>
          )}
          {w2Required && (
            <Field id="sf-w2" copy={FIELD_COPY.w2Required}>
              <MoneyInput id="sf-w2" value={v.w2Other} onChange={set('w2Other')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.w2Required.label} />
            </Field>
          )}
          {touched && !w2Ok && <div role="alert" style={{ color: R, fontSize: 13, marginTop: -10, marginBottom: 14 }}>Enter your wages from your job.</div>}

          <Field id="sf-filing" copy={FIELD_COPY.filingStatus}>
            <select id="sf-filing" value={v.filingStatus} onChange={e => set('filingStatus')(e.target.value)} style={inputStyle}>
              {FILING_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          {has('w2Other') && (
            <Field id="sf-w2" copy={FIELD_COPY.w2Other}>
              <MoneyInput id="sf-w2" value={v.w2Other} onChange={set('w2Other')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.w2Other.label} />
            </Field>
          )}
          {w2Val > 0 && (
            <Field id="sf-withheld" copy={FIELD_COPY.w2Withheld}>
              <MoneyInput id="sf-withheld" value={v.w2Withheld} onChange={set('w2Withheld')} nonNegative placeholder="0" style={inputStyle} ariaLabel={FIELD_COPY.w2Withheld.label} />
            </Field>
          )}

          <button onClick={continueToResult} aria-disabled={!canContinue} style={{ width: '100%', padding: '14px', background: canContinue ? B : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: canContinue ? 'pointer' : 'not-allowed', marginTop: 6 }}>
            See my result →
          </button>
        </div>

        <aside aria-live="polite" style={{ position: 'sticky', top: 16, background: N, color: '#fff', borderRadius: 14, padding: '18px 18px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75, marginBottom: 6 }}>On track to owe · {taxYear}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>{previewTax === null ? '—' : fmt(previewTax)}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, lineHeight: 1.5 }}>
            {previewTax === null ? 'Type what the business took in to see a live number.' : 'Federal only. Updates as you type.'}
          </div>
        </aside>
      </div>
      <style>{`@media (max-width: 720px) { .simple-numbers-grid { grid-template-columns: 1fr !important; } .simple-numbers-grid aside { position: static !important; } }`}</style>
    </SimpleShell>
  )
}
