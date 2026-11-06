// src/components/simple/ReviewScreen.jsx — "Review last year's return"
//
// PHASE 2 (Prior-Year Review). Four states on one route:
//   upload  → the existing PDF gate (text-only, no SSNs) then the review extract
//   confirm → every extracted figure, grouped, editable, low-confidence flagged;
//             nothing is computed until the user confirms (HITL, same contract as
//             the Carryforward Wizard)
//   memo    → buildPriorYearMemo(): the six sections in Natasha's order
//   next    → "See how this year is tracking": the confirmed figures become the
//             live session for the current year, then /result
//
// Language: opportunity analysis. Never "the return was wrong", never an amended
// figure, never anything addressed to the IRS. The file is never stored here: the
// API deletes it after processing and this component keeps only the numbers.
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SimpleShell from './SimpleShell.jsx'
import MoneyInput from '../MoneyInput.jsx'
import { gateTax1040PdfUpload } from '../../lib/pdfTextGate.js'
import { extractTax1040Review } from '../../lib/carryforwardExtractClient.js'
import {
  TAX_1040_REVIEW_FIELDS, normalizeReviewFields, buildPriorYearMemo, buildReviewEntities,
} from '../../lib/priorYearReview.js'
import { sumK1FlowThrough } from '../../lib/taxCalc.js'
import { CURRENT_TAX_YEAR } from '../../lib/constants.js'
import {
  writeStep1State, writePersonalContext, readPersonalContext, writeTaxYear, writeDirtyFlag, clearActiveRecord,
} from '../../utils/sessionState.js'
import { fmt, nf } from '../../utils/money.js'
import { NAVY as N, SLATE as SL, BLUE as B, RED as R, ORANGE as O, SUCCESS_TEXT } from '../../lib/theme.js'

const LOW_CONFIDENCE = 0.6
const inputStyle = { width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 15, color: N, background: '#fff', boxSizing: 'border-box' }
const btnPrimary = { padding: '13px 18px', background: B, color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }
const btnQuiet = { padding: '10px 14px', background: '#fff', color: N, border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }

/** Write the confirmed prior-year figures as THIS year's live session (as-filed
 *  §469 position), so Screen 3 shows "how this year is tracking on the same numbers". */
export function seedCurrentYearFromReview(fields) {
  const f = normalizeReviewFields(fields)
  const entities = buildReviewEntities({ ...f, taxYear: CURRENT_TAX_YEAR }, 'filed')
  writeTaxYear(CURRENT_TAX_YEAR)
  writeStep1State({ entities, entitiesRaw: entities, k1Total: sumK1FlowThrough(entities) })
  writePersonalContext({
    ...readPersonalContext(),
    taxYear: CURRENT_TAX_YEAR,
    filingStatus: f.filingStatus,
    dependents: f.dependents,
    w2Income: Math.max(0, nf(f.w2Wages) - nf(f.officerW2)),
    w2Withheld: 0,
    estPaid: 0,
    selfEmpRetirement: f.selfEmpRetirement,
    hsaDeduction: f.hsaDeduction,
    selfEmpHealthIns: f.selfEmpHealthIns,
  })
  clearActiveRecord()
  writeDirtyFlag(true)
}

function UploadStep({ onExtracted }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const handle = async (list) => {
    const file = list && list[0]
    if (!file) return
    setBusy(true); setNotice(null)
    try {
      const gate = await gateTax1040PdfUpload(file)
      if (!gate.ok) { setNotice({ kind: 'error', text: gate.message }); return }
      const res = await extractTax1040Review(file)
      if (!res.ok) { setNotice({ kind: 'error', text: res.error }); return }
      onExtracted(res.result)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 6px' }}>Review last year's return</h1>
      <p style={{ fontSize: 14, color: SL, margin: '0 0 16px', lineHeight: 1.6 }}>
        Upload the PDF of last year's federal return. We read the figures, show you every one to confirm, and then lay out what the return left on the table and what to do about it this year.
      </p>
      <div style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <input ref={inputRef} id="review-file" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e => handle(e.target.files)} style={{ fontSize: 14 }} />
        <div style={{ fontSize: 12, color: SL, marginTop: 10, lineHeight: 1.5 }}>
          Text PDFs only (the one your tax software produced, not a phone photo). Returns with a visible Social Security number are refused before upload; remove or mask it first. The file is deleted after reading; only the figures are kept.
        </div>
        {busy && <div style={{ marginTop: 10, fontSize: 13, color: B, fontWeight: 600 }}>Reading the return…</div>}
        {notice && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: notice.kind === 'error' ? R : SUCCESS_TEXT }}>{notice.text}</div>}
      </div>
      <p style={{ fontSize: 12, color: SL, lineHeight: 1.5 }}>This is an opportunity analysis for planning, not a review of whether the return was prepared correctly and not advice on amending it. If anything here suggests a change to a filed return, an Enrolled Agent or CPA should look at it.</p>
    </div>
  )
}

function ConfirmStep({ initial, confidence, onConfirm, onBack }) {
  const [v, setV] = useState(() => {
    const out = {}
    for (const f of TAX_1040_REVIEW_FIELDS) {
      const raw = initial[f.key]
      out[f.key] = raw == null ? '' : f.kind === 'bool' ? !!raw : String(raw)
    }
    return out
  })
  const set = (k) => (val) => setV(p => ({ ...p, [k]: val }))
  const groups = [...new Set(TAX_1040_REVIEW_FIELDS.map(f => f.group))]
  const lowCount = TAX_1040_REVIEW_FIELDS.filter(f => (confidence?.[f.key] ?? 1) < LOW_CONFIDENCE && v[f.key] !== '').length
  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: SL, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Upload a different file</button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 6px' }}>Here's what we read</h1>
      <p style={{ fontSize: 14, color: SL, margin: '0 0 14px', lineHeight: 1.6 }}>
        Check each figure against the return and fix anything that's off. Blank means it wasn't on the return.
        {lowCount > 0 && <> <span style={{ color: O, fontWeight: 700 }}>{lowCount} field{lowCount === 1 ? '' : 's'}</span> {lowCount === 1 ? 'is' : 'are'} marked because we weren't sure of the number.</>}
      </p>
      {groups.map(g => (
        <section key={g} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: SL, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 8px' }}>{g}</h2>
          {TAX_1040_REVIEW_FIELDS.filter(f => f.group === g).map(f => {
            const low = (confidence?.[f.key] ?? 1) < LOW_CONFIDENCE && v[f.key] !== ''
            const id = 'rv-' + f.key
            return (
              <div key={f.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(140px, 200px)', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: '1px solid #F1F5F9' }}>
                <label htmlFor={id} style={{ fontSize: 13, color: N }}>
                  {f.label}
                  <div style={{ fontSize: 11, color: SL }}>{f.source}{low && <span style={{ color: O, fontWeight: 700 }}> · double-check</span>}</div>
                </label>
                {f.kind === 'money' && <MoneyInput id={id} value={v[f.key]} onChange={set(f.key)} allowNegative placeholder="—" style={{ ...inputStyle, borderColor: low ? O : '#CBD5E1' }} ariaLabel={f.label} />}
                {f.kind === 'int' && <input id={id} type="number" min="0" value={v[f.key]} onChange={e => set(f.key)(e.target.value)} style={{ ...inputStyle, borderColor: low ? O : '#CBD5E1' }} />}
                {f.kind === 'enum' && (
                  <select id={id} value={v[f.key] || f.options[0]} onChange={e => set(f.key)(e.target.value)} style={inputStyle}>
                    {f.options.map(o => <option key={o} value={o}>{{ single: 'Single', mfj: 'Married filing jointly', mfs: 'Married filing separately', hoh: 'Head of household', qss: 'Qualifying surviving spouse' }[o]}</option>)}
                  </select>
                )}
                {f.kind === 'bool' && <input id={id} type="checkbox" checked={!!v[f.key]} onChange={e => set(f.key)(e.target.checked)} style={{ width: 20, height: 20, justifySelf: 'start' }} />}
              </div>
            )
          })}
        </section>
      ))}
      <button onClick={() => onConfirm(v)} style={{ ...btnPrimary, width: '100%' }}>These are right — show me the findings →</button>
    </div>
  )
}

function Finding({ x }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {x.exposure
          ? <span style={{ fontSize: 12, fontWeight: 700, color: O, textTransform: 'uppercase', letterSpacing: 0.5 }}>{x.impact ? `${fmt(x.impact)} · ` : ''}Records to have</span>
          : x.impact
            ? <span style={{ fontSize: 17, fontWeight: 800, color: SUCCESS_TEXT }}>~{fmt(x.impact)}</span>
            : <span style={{ fontSize: 12, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: 0.5 }}>Worth a look</span>}
        <span style={{ fontSize: 15, fontWeight: 700, color: N }}>{x.title}</span>
      </div>
      <p style={{ fontSize: 13, color: SL, margin: '8px 0 0', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{x.detail}</p>
      {open && (
        <div style={{ marginTop: 10, fontSize: 13, color: SL, lineHeight: 1.6 }}>
          {x.conditions && <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px', color: N, marginBottom: 8 }}><strong style={{ color: B }}>What has to be true:</strong> {x.conditions}</div>}
          {x.basis && <div style={{ fontSize: 12 }}><strong>Rule:</strong> {x.basis}</div>}
          {x.link && <div style={{ marginTop: 6 }}><a href={x.link} target="_blank" rel="noreferrer" style={{ color: B, fontWeight: 700 }}>Start the hour log with RepsRecord →</a></div>}
        </div>
      )}
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ marginTop: 8, background: 'none', border: 'none', color: B, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}>{open ? 'Hide the rule' : 'Show the rule and conditions'}</button>
    </div>
  )
}

function MemoStep({ fields, onBack, onNext }) {
  const memo = buildPriorYearMemo(fields)
  const tax = memo.asFiled.ok ? memo.asFiled.totalTax : null
  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: SL, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Fix a figure</button>
      <section style={{ background: N, color: '#fff', borderRadius: 16, padding: '20px' }}>
        <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75 }}>What {memo.taxYear} left on the table</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, margin: '4px 0 2px' }}>~{fmt(memo.totalImpact)}</div>
        <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
          estimated across {memo.sections.flatMap(s => s.findings).filter(x => !x.exposure && x.impact).length} items, at the figures you confirmed{tax !== null ? `, against ${fmt(tax)} of federal tax computed on those figures` : ''}. Estimates, not a determination; some items exclude each other.
        </div>
        {memo.scenarios && memo.scenarios.filed != null && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {[['As filed', memo.scenarios.filed], ['With REPS', memo.scenarios.reps], ['STR exception', memo.scenarios.str]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 11, opacity: 0.75 }}>{l}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v == null ? '—' : fmt(v)}</div></div>
            ))}
          </div>
        )}
      </section>

      {memo.sections.map(s => (
        <section key={s.id} aria-label={s.title} style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: N, margin: '0 0 2px' }}>{s.title}</h2>
          {s.rule && <div style={{ fontSize: 12, color: SL, marginBottom: 10 }}>{s.rule}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {s.findings.map(x => <Finding key={x.code} x={x} />)}
          </div>
        </section>
      ))}

      <section style={{ marginTop: 22, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: N, margin: '0 0 8px' }}>Questions to ask your tax pro</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: SL, lineHeight: 1.7 }}>{memo.questions.map(q => <li key={q}>{q}</li>)}</ul>
        <p style={{ fontSize: 12, color: SL, marginTop: 10, lineHeight: 1.5 }}>If any of this suggests amending {memo.taxYear}, an Enrolled Agent should look at it. TaxStat360 does not prepare returns or correspond with the IRS.</p>
      </section>

      <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onNext} style={btnPrimary}>See how {CURRENT_TAX_YEAR} is tracking on these figures →</button>
        <button onClick={() => window.print()} style={btnQuiet}>Print or save as PDF</button>
      </div>
    </div>
  )
}

export default function ReviewScreen() {
  const nav = useNavigate()
  const [stage, setStage] = useState('upload')
  const [extracted, setExtracted] = useState(null)
  const [fields, setFields] = useState(null)

  return (
    <SimpleShell step="review" maxWidth={760}>
      {stage === 'upload' && <UploadStep onExtracted={(r) => { setExtracted(r); setStage('confirm') }} />}
      {stage === 'confirm' && extracted && (
        <ConfirmStep initial={extracted.fields || {}} confidence={extracted.confidence || {}} onBack={() => setStage('upload')} onConfirm={(v) => { setFields(v); setStage('memo') }} />
      )}
      {stage === 'memo' && fields && (
        <MemoStep fields={fields} onBack={() => setStage('confirm')} onNext={() => { seedCurrentYearFromReview(fields); nav('/result') }} />
      )}
    </SimpleShell>
  )
}
