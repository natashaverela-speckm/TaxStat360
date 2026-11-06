// src/components/simple/ReviewScreen.jsx — "Review last year's return"
//
// PHASE 2 (Prior-Year Review). Four states on one route:
//   upload  → read + SSN-mask in the browser, send masked text only, then the review extract
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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SimpleShell from './SimpleShell.jsx'
import MoneyInput from '../MoneyInput.jsx'
import { prepareTax1040TextForUpload } from '../../lib/pdfTextGate.js'
import { extractTax1040ReviewText } from '../../lib/carryforwardExtractClient.js'
import {
  TAX_1040_REVIEW_FIELDS, normalizeReviewFields, buildPriorYearMemo, buildReviewEntities, mergeEntityReturns,
  ENTITY_RETURN_KINDS, ENTITY_RETURN_FIELDS, detectReturnType, reconcileReview,
  HEADLINE_REVIEW_KEYS, HEADLINE_ENTITY_KEYS,
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
export function seedCurrentYearFromReview(fields, entityReturns = []) {
  const f = mergeEntityReturns(normalizeReviewFields(fields), entityReturns)
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
    // Carryforwards: the reviewed return's "carried to next year" lines are this
    // year's opening balances. (The suspended rental loss rides on the entity as priorPAL.)
    capLossCarryforwardST: nf(f.capLossCarryforwardST),
    capLossCarryforwardLT: nf(f.capLossCarryforwardLT),
    nolCarryforward: nf(f.nolCarryforward),
    priorYearQBILoss: nf(f.priorYearQBILoss),
    priorYearLosses: nf(f.priorYearQBILoss),
  })
  clearActiveRecord()
  writeDirtyFlag(true)
}

const MAX_ENTITY_RETURNS = 3

const KIND_LABEL = { '1040': 'Personal return (1040)', ...Object.fromEntries(Object.entries(ENTITY_RETURN_KINDS).map(([k, v]) => [k, v.label])) }

/** Read one PDF in the browser, detect which return it is, mask SSNs, extract. */
async function readOneReturn(file) {
  const gate = await prepareTax1040TextForUpload(file)
  if (!gate.ok) return { ok: false, name: file.name, error: gate.message }
  const kind = detectReturnType(gate.text)
  if (!kind) return { ok: false, name: file.name, error: 'We could not tell which federal return this is. Upload the 1040, 1120-S or 1065 PDF your tax software produced.' }
  const profile = kind === '1040' ? 'tax-1040-review' : ENTITY_RETURN_KINDS[kind].profile
  const fixture = /fixture-tax-/i.test(file.name || '') ? file.name : null
  const res = await extractTax1040ReviewText(gate.text, profile, fixture)
  if (!res.ok) return { ok: false, name: file.name, kind, error: res.error }
  return { ok: true, name: file.name, kind, fields: res.result.fields || {}, confidence: res.result.confidence || {}, kept: gate.kept, dropped: gate.dropped }
}

function UploadStep({ onExtracted }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [files, setFiles] = useState([])   // [{ ok, name, kind, fields, confidence, error }]
  const handle = async (list) => {
    const picked = Array.from(list || []).slice(0, 1 + MAX_ENTITY_RETURNS)
    if (!picked.length) return
    setBusy(true); setNotice(null)
    try {
      const results = []
      for (const file of picked) results.push(await readOneReturn(file))
      setFiles(prev => {
        const next = [...prev]
        for (const r of results) {
          // one 1040; entity returns stack up to the cap, replacing a same-named file
          const i = next.findIndex(x => x.name === r.name || (r.ok && r.kind === '1040' && x.ok && x.kind === '1040'))
          if (i >= 0) next[i] = r; else next.push(r)
        }
        return next
      })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const good = files.filter(f => f.ok)
  const individual = good.find(f => f.kind === '1040')
  const entities = good.filter(f => f.kind !== '1040').slice(0, MAX_ENTITY_RETURNS)
  const go = () => {
    if (!individual) { setNotice({ kind: 'error', text: 'Add the personal return (Form 1040) first; the business returns are read alongside it.' }); return }
    onExtracted({ individual, entities })
  }
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 6px' }}>Review last year's return</h1>
      <p style={{ fontSize: 14, color: SL, margin: '0 0 16px', lineHeight: 1.6 }}>
        Upload the PDF of last year's federal return. If you have an S-Corp, a partnership or a C-Corp, add its return too (the 1120-S, 1065 or 1120): officer pay, distributions and what the company already deducts live there, not on the 1040. We read the figures, show you every one to confirm, and then lay out what the returns left on the table.
      </p>
      <div style={{ background: '#fff', border: '1px dashed #CBD5E1', borderRadius: 12, padding: 18, marginBottom: 14 }}>
        <input ref={inputRef} id="review-file" type="file" multiple accept="application/pdf,.pdf" disabled={busy} onChange={e => handle(e.target.files)} style={{ fontSize: 14 }} aria-label="Return PDFs" />
        <div style={{ fontSize: 12, color: SL, marginTop: 10, lineHeight: 1.5 }}>
          Text PDFs only (the ones your tax software produced, not phone photos). Pick several at once or add them one at a time; we work out which return each one is. The PDFs are read right here in your browser and never uploaded: Social Security numbers are masked on your device, and only the masked text is sent to pull the figures. Nothing from the returns is stored.
        </div>
        {busy && <div style={{ marginTop: 10, fontSize: 13, color: B, fontWeight: 600 }}>Reading…</div>}
        {files.length > 0 && (
          <ul aria-label="Returns read" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {files.map(f => (
              <li key={f.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, padding: '8px 10px', background: '#F8FAFC', borderRadius: 8 }}>
                <span style={{ color: f.ok ? N : R }}>
                  <strong>{f.ok ? KIND_LABEL[f.kind] : 'Not read'}</strong> · {f.name}
                  {!f.ok && <div style={{ fontSize: 12, marginTop: 2 }}>{f.error}</div>}
                  {f.ok && f.dropped > 0 && <div style={{ fontSize: 12, marginTop: 2, color: SL }}>Long package: read the {f.kept} federal pages and left out {f.dropped} state-return and worksheet pages.</div>}
                </span>
                <button onClick={() => setFiles(p => p.filter(x => x.name !== f.name))} style={{ background: 'none', border: 'none', color: SL, cursor: 'pointer', fontSize: 12 }} aria-label={`Remove ${f.name}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {notice && <div role="alert" style={{ marginTop: 10, fontSize: 13, color: notice.kind === 'error' ? R : SUCCESS_TEXT }}>{notice.text}</div>}
      </div>
      {good.length > 0 && (
        <button onClick={go} disabled={busy} style={{ ...btnPrimary, width: '100%', marginBottom: 14 }}>
          {individual ? `Check the figures${entities.length ? ` (1040 + ${entities.map(e => ENTITY_RETURN_KINDS[e.kind].short).join(', ')})` : ''} →` : 'Add the 1040 to continue'}
        </button>
      )}
      <p style={{ fontSize: 12, color: SL, lineHeight: 1.5 }}>This is an opportunity analysis for planning, not a review of whether the return was prepared correctly and not advice on amending it. If anything here suggests a change to a filed return, an Enrolled Agent or CPA should look at it.</p>
    </div>
  )
}

function FieldTable({ defs, v, set, confidence, idPrefix }) {
  const groups = [...new Set(defs.map(f => f.group))]
  return groups.map(g => (
    <section key={g} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: SL, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 8px' }}>{g}</h2>
      {defs.filter(f => f.group === g).map(f => {
        const low = (confidence?.[f.key] ?? 1) < LOW_CONFIDENCE && v[f.key] !== ''
        const id = idPrefix + f.key
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
  ))
}

function initialValues(defs, initial) {
  const out = {}
  for (const f of defs) {
    const raw = initial[f.key]
    out[f.key] = raw == null ? '' : f.kind === 'bool' ? !!raw : String(raw)
  }
  return out
}

/** Headline lines, plus anything the extractor was unsure of, plus (on request) everything. */
function pickDefs(defs, headlineKeys, confidence, v, showAll) {
  if (showAll) return defs
  const head = new Set(headlineKeys)
  return defs.filter(f => head.has(f.key) || ((confidence?.[f.key] ?? 1) < LOW_CONFIDENCE && v[f.key] !== ''))
}

function SelfCheck({ recon }) {
  if (!recon.checked) return null
  const box = { marginBottom: 12, padding: '12px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6 }
  if (recon.ok) {
    return (
      <div role="status" style={{ ...box, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534' }}>
        <strong>Self-check passed.</strong> Recomputing the return from these figures lands on the return's own income and tax{recon.tax ? ` (${fmt(recon.tax.computed)} vs ${fmt(recon.tax.filed)} on the return)` : ''}, so the read is sound.
      </div>
    )
  }
  return (
    <div role="alert" style={{ ...box, background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412' }}>
      <strong>Something was misread.</strong> Recomputing the return from these figures gives{recon.agi ? ` income of ${fmt(recon.agi.computed)} (return: ${fmt(recon.agi.filed)})` : ''}{recon.agi && recon.tax ? ' and' : ''}{recon.tax ? ` tax of ${fmt(recon.tax.computed)} (return: ${fmt(recon.tax.filed)})` : ''}.
      {recon.hints.map(h => <div key={h} style={{ marginTop: 6 }}>{h}</div>)}
      <div style={{ marginTop: 6 }}>Fix the figure here, or open all fields below to find it. You can continue anyway; the memo will carry this warning.</div>
    </div>
  )
}

/** The 1040 figures the business return settles (officer W-2, K-1 share and sign)
 *  are shown already corrected, so the table and the engine agree. */
function withEntityFigures(initial, entities) {
  if (!entities.length) return initial
  const merged = mergeEntityReturns(normalizeReviewFields(initial), entities.map(e => ({ kind: e.kind, fields: e.fields })))
  const out = { ...initial }
  for (const k of ['officerW2', 'k1ScorpOrdinary', 'k1PartnershipOrdinary']) {
    if (nf(initial[k]) !== merged[k]) out[k] = merged[k] === 0 ? '' : merged[k]
  }
  return out
}

function ConfirmStep({ initial, confidence, entities = [], onConfirm, onBack }) {
  const [v, setV] = useState(() => initialValues(TAX_1040_REVIEW_FIELDS, withEntityFigures(initial, entities)))
  const [ev, setEv] = useState(() => entities.map(e => initialValues(ENTITY_RETURN_FIELDS[e.kind], e.fields || {})))
  const [showAll, setShowAll] = useState(false)
  const set = (k) => (val) => setV(p => ({ ...p, [k]: val }))
  const setE = (i) => (k) => (val) => setEv(p => p.map((x, j) => j === i ? { ...x, [k]: val } : x))
  const entityReturns = entities.map((e, i) => ({ kind: e.kind, fields: ev[i] }))
  const recon = useMemo(() => reconcileReview(v, entityReturns), [v, ev])   // eslint-disable-line react-hooks/exhaustive-deps
  const lowCount = TAX_1040_REVIEW_FIELDS.filter(f => (confidence?.[f.key] ?? 1) < LOW_CONFIDENCE && v[f.key] !== '').length
    + entities.reduce((t, e, i) => t + ENTITY_RETURN_FIELDS[e.kind].filter(f => (e.confidence?.[f.key] ?? 1) < LOW_CONFIDENCE && ev[i][f.key] !== '').length, 0)
  const defs1040 = pickDefs(TAX_1040_REVIEW_FIELDS, HEADLINE_REVIEW_KEYS, confidence, v, showAll)
  const hiddenCount = TAX_1040_REVIEW_FIELDS.length - defs1040.length + entities.reduce((t, e, i) => t + ENTITY_RETURN_FIELDS[e.kind].length - pickDefs(ENTITY_RETURN_FIELDS[e.kind], HEADLINE_ENTITY_KEYS[e.kind], e.confidence, ev[i], showAll).length, 0)
  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: SL, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Upload a different file</button>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '0 0 6px' }}>Here's what we read</h1>
      <p style={{ fontSize: 14, color: SL, margin: '0 0 14px', lineHeight: 1.6 }}>
        Check these lines against the return and fix anything that's off. Blank means it wasn't on the return.
        {lowCount > 0 && <> <span style={{ color: O, fontWeight: 700 }}>{lowCount} field{lowCount === 1 ? '' : 's'}</span> {lowCount === 1 ? 'is' : 'are'} marked because we weren't sure of the number.</>}
      </p>
      <SelfCheck recon={recon} />
      {entities.length > 0 && <h2 style={{ fontSize: 15, fontWeight: 800, color: N, margin: '0 0 10px' }}>Personal return (1040)</h2>}
      <FieldTable defs={defs1040} v={v} set={set} confidence={confidence} idPrefix="rv-" />
      {entities.map((e, i) => (
        <div key={e.name || i} aria-label={ENTITY_RETURN_KINDS[e.kind].label}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: N, margin: '18px 0 10px' }}>{ENTITY_RETURN_KINDS[e.kind].label}{e.name ? <span style={{ fontSize: 12, fontWeight: 500, color: SL }}> · {e.name}</span> : null}</h2>
          <FieldTable defs={pickDefs(ENTITY_RETURN_FIELDS[e.kind], HEADLINE_ENTITY_KEYS[e.kind], e.confidence, ev[i], showAll)} v={ev[i]} set={setE(i)} confidence={e.confidence} idPrefix={`rv-${e.kind}-${i}-`} />
        </div>
      ))}
      <button onClick={() => setShowAll(a => !a)} aria-expanded={showAll} style={{ ...btnQuiet, width: '100%', marginBottom: 12 }}>
        {showAll ? 'Show only the key lines' : `Show all fields${hiddenCount ? ` (${hiddenCount} more, read automatically)` : ''}`}
      </button>
      <button onClick={() => onConfirm(v, entityReturns)} style={{ ...btnPrimary, width: '100%' }}>These are right — show me the findings →</button>
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

function MemoStep({ fields, entityReturns = [], onBack, onNext }) {
  const memo = buildPriorYearMemo(fields, { entityReturns })
  const tax = memo.asFiled.ok ? memo.asFiled.totalTax : null
  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: SL, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Fix a figure</button>
      <section style={{ background: N, color: '#fff', borderRadius: 16, padding: '20px' }}>
        <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75 }}>What {memo.taxYear} left on the table</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, margin: '4px 0 2px' }}>~{fmt(memo.totalImpact)}</div>
        <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
          estimated across {memo.sections.flatMap(s => s.findings).filter(x => !x.exposure && x.impact).length} items, at the figures you confirmed{memo.entityReturns.length ? ` from the 1040 and the ${memo.entityReturns.map(k => ENTITY_RETURN_KINDS[k].short).join(' and ')}` : ''}{tax !== null ? `, against ${fmt(tax)} of federal tax computed on those figures` : ''}. Estimates, not a determination; some items exclude each other.
        </div>
        {memo.reconciliation.checked && !memo.reconciliation.ok && (
          <div role="alert" style={{ marginTop: 12, fontSize: 13, background: '#FFF7ED', color: '#9A3412', padding: '8px 10px', borderRadius: 8 }}>
            Self-check did not pass: recomputing from the confirmed figures does not land on the return's own totals, so something was misread. Treat these findings as provisional and go back to fix the figure.
          </div>
        )}
        {memo.missingReturns.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, background: 'rgba(255,255,255,0.1)', padding: '8px 10px', borderRadius: 8 }}>
            Add the {memo.missingReturns.map(k => ENTITY_RETURN_KINDS[k].short).join(' and ')} on the upload step for the compensation and deduction findings that only the business return shows.
          </div>
        )}
        {memo.scenarios && memo.scenarios.filed != null && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {(memo.scenarios.repsClaimed
              ? [['As filed (REPS)', memo.scenarios.filed], ['Without REPS', memo.scenarios.withoutReps]]
              : [['As filed', memo.scenarios.filed], ['With REPS', memo.scenarios.reps], ['STR exception', memo.scenarios.str]]).map(([l, v]) => (
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
  // Each step opens at the top: the confirm table is long, and the memo's headline
  // belongs at the top of the screen, not wherever the last scroll left it.
  useEffect(() => { try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }) } catch { /* jsdom */ } }, [stage])
  const [extracted, setExtracted] = useState(null)   // { individual: {fields, confidence}, entities: [{kind, name, fields, confidence}] }
  const [fields, setFields] = useState(null)
  const [entityReturns, setEntityReturns] = useState([])

  return (
    <SimpleShell step="review" maxWidth={760}>
      {stage === 'upload' && <UploadStep onExtracted={(r) => { setExtracted(r); setStage('confirm') }} />}
      {stage === 'confirm' && extracted && (
        <ConfirmStep initial={extracted.individual.fields || {}} confidence={extracted.individual.confidence || {}} entities={extracted.entities || []} onBack={() => setStage('upload')} onConfirm={(v, ents) => { setFields(v); setEntityReturns(ents); setStage('memo') }} />
      )}
      {stage === 'memo' && fields && (
        <MemoStep fields={fields} entityReturns={entityReturns} onBack={() => setStage('confirm')} onNext={() => { seedCurrentYearFromReview(fields, entityReturns); nav('/result') }} />
      )}
    </SimpleShell>
  )
}
