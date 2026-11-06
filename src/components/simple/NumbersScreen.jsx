// src/components/simple/NumbersScreen.jsx — Screen 2, "Your numbers"
//
// One column, at most five visible fields, a live provisional estimate beside
// them. Every field maps onto an input the engine already reads (see
// buildEntityFromNumbers / writeSimpleFlowState in lib/simpleFlow.js). The only
// blocking rule: revenue (or rent) > 0. "Upload your P&L" sits above the fields:
// the accounting-software export is read in the browser and the fields fill in;
// manual entry stays the default so the result is never blocked on a file.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SimpleShell from './SimpleShell.jsx'
import MoneyInput from '../MoneyInput.jsx'
import {
  tileByKey, FIELD_COPY, FILING_STATUS_OPTIONS,
  previewFromNumbers, writeSimpleFlowState,
} from '../../lib/simpleFlow.js'
import { readTaxYear } from '../../utils/sessionState.js'
import { fmt, nf } from '../../utils/money.js'
import { NAVY as N, SLATE as SL, BLUE as B, RED as R, SUCCESS_TEXT } from '../../lib/theme.js'
import { prepareTax1040TextForUpload } from '../../lib/pdfTextGate.js'
import { extractTax1040ReviewText } from '../../lib/carryforwardExtractClient.js'
import { PNL_PROFILE, looksLikePnl, pnlToNumbers, normalizePnl } from '../../lib/pnlUpload.js'

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

  // "Upload your P&L": the export from the member's accounting software, read in
  // the browser like the tax return (text only, nothing stored), filled into the
  // fields below for them to check. Replaces the connect buttons, which handed off
  // to the Tax Tracker.
  const [pnl, setPnl] = useState({ busy: false, msg: null, kind: null })
  const onPnlFile = async (file) => {
    if (!file) return
    setPnl({ busy: true, msg: null, kind: null })
    try {
      const gate = await prepareTax1040TextForUpload(file)
      if (!gate.ok) { setPnl({ busy: false, msg: gate.message, kind: 'error' }); return }
      const res = await extractTax1040ReviewText(gate.text, PNL_PROFILE, /fixture-pnl-/i.test(file.name || '') ? file.name : null)
      if (!res.ok) { setPnl({ busy: false, msg: res.error, kind: 'error' }); return }
      const p = normalizePnl(res.result.fields || {})
      if (!looksLikePnl(p)) { setPnl({ busy: false, msg: 'That PDF does not read as a profit and loss report. Export the P&L (not the balance sheet or a transaction list) and try again, or type the numbers.', kind: 'error' }); return }
      const n = pnlToNumbers(p, tile.key, taxYear)
      setV(prev => ({ ...prev, revenue: n.revenue, expenses: n.expenses, ...(has('officerSalary') ? { officerSalary: n.officerSalary } : {}), ...(isRental ? { depreciation: n.depreciation } : {}) }))
      setTouched(false)
      const parts = [`Read from your P&L${n.period ? ` (${n.period})` : ''}: ${isRental ? 'rent' : 'income'} ${fmt(nf(n.revenue))}, spent ${fmt(nf(n.expenses))}`]
      if (has('officerSalary') && nf(n.officerSalary) > 0) parts.push(`your pay ${fmt(nf(n.officerSalary))}`)
      if (isRental && nf(n.depreciation) > 0) parts.push(`depreciation ${fmt(nf(n.depreciation))}`)
      setPnl({ busy: false, msg: parts.join(', ') + '.' + (n.notes.length ? ' ' + n.notes.join(' ') : ''), kind: 'ok' })
    } catch (e) {
      setPnl({ busy: false, msg: 'Could not read that PDF. Type the numbers instead.', kind: 'error' })
    }
  }

  return (
    <SimpleShell step="numbers" maxWidth={920}>
      <button onClick={() => nav('/start')} style={{ background: 'none', border: 'none', color: SL, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back</button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 4px' }}>{tile.icon} {tile.label}</h1>
      <p style={{ fontSize: 14, color: SL, margin: '0 0 18px' }}>Estimates are fine. You can refine every number later.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 300px)', gap: 20, alignItems: 'start' }} className="simple-numbers-grid">
        <div>
          <div style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: N, marginBottom: 4 }}>Use QuickBooks, Xero, Wave or FreshBooks? Upload the P&L and we fill these in.</div>
            <div style={{ fontSize: 12, color: SL, marginBottom: 8, lineHeight: 1.5 }}>Export this year's Profit and Loss as a PDF and drop it here. It is read in your browser; only the totals are used and nothing is stored.</div>
            <input id="sf-pnl" type="file" accept="application/pdf,.pdf" disabled={pnl.busy} onChange={e => onPnlFile(e.target.files && e.target.files[0])} aria-label="Upload your P&L (PDF)" style={{ fontSize: 13 }} />
            {pnl.busy && <div style={{ marginTop: 8, fontSize: 13, color: B, fontWeight: 600 }}>Reading…</div>}
            {pnl.msg && <div role={pnl.kind === 'error' ? 'alert' : 'status'} style={{ marginTop: 8, fontSize: 13, color: pnl.kind === 'error' ? R : SUCCESS_TEXT, lineHeight: 1.5 }}>{pnl.msg}</div>}
            {pnl.kind === 'ok' && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, fontSize: 13, color: '#9A3412', lineHeight: 1.5 }}>
                <strong>Please check these numbers against your actual P&L.</strong> Reports from different software lay out their totals differently, and we only use what the PDF says. If a figure is wrong, fix it in the field below. If the numbers don't match your report and you can't see why, email{' '}
                <a href="mailto:support@taxstat360.com?subject=P%26L%20upload%20read%20wrong" style={{ color: '#9A3412', fontWeight: 700 }}>support@taxstat360.com</a>{' '}
                with the PDF attached and we'll sort it out.
              </div>
            )}
          </div>

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
