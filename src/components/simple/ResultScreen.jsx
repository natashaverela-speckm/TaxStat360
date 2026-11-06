// src/components/simple/ResultScreen.jsx — Screen 3, "Your result"
//
// The first screen with a dollar sign on it: the engine-true estimate, the next
// estimated payment, and the Tax-Saving Opportunities cards sorted by dollars
// with the law behind an expander. Everything is read through
// selectSimpleResult() (calcSelector + the lifted opportunities module), so this
// screen can never disagree with the Advanced pages or the AI Analysis tab.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SimpleShell from './SimpleShell.jsx'
import { selectSimpleResult, sortCardsBySaving } from '../../lib/simpleFlow.js'
import { fmt, pct, effectiveRate } from '../../utils/money.js'
import { NAVY as N, SLATE as SL, BLUE as B, SUCCESS_TEXT } from '../../lib/theme.js'

function longDate(iso) {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const linkBtn = { padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', color: N, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', minHeight: 44 }

function Card({ o }) {
  const [open, setOpen] = useState(false)
  // Plain-English first sentence by default; the rest (and the citations) behind "Show how".
  const cutAt = [o.detail.indexOf('. '), o.detail.indexOf(':\n'), o.detail.indexOf('\n')].filter(i => i > 0)
  let stop = cutAt.length ? Math.min(...cutAt) : -1
  if (stop < 0 || stop > 200) stop = o.detail.length > 200 ? (o.detail.lastIndexOf(' ', 200) || 200) : -1
  const lead = stop > 0 ? o.detail.slice(0, stop + (o.detail[stop] === '.' ? 1 : 0)).trimEnd() + (o.detail[stop] === '.' ? '' : '…') : o.detail
  const rest = stop > 0 ? o.detail.slice(stop).replace(/^[.:\s]+/, '') : ''
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {o.saving ? <span style={{ fontSize: 18, fontWeight: 800, color: SUCCESS_TEXT }}>Save ~{fmt(o.saving)}</span> : <span style={{ fontSize: 12, fontWeight: 700, color: SL, textTransform: 'uppercase', letterSpacing: 0.5 }}>Worth a look</span>}
        <span style={{ fontSize: 15, fontWeight: 700, color: N }}>{o.icon} {o.title}</span>
      </div>
      <p style={{ fontSize: 13, color: SL, margin: '8px 0 0', lineHeight: 1.6 }}>{lead}</p>
      {open && (
        <div style={{ marginTop: 10, fontSize: 13, color: SL, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {rest && <p style={{ margin: '0 0 8px' }}>{rest}</p>}
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px', color: N }}><strong style={{ color: B }}>How to apply:</strong> {o.howTo}</div>
        </div>
      )}
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} style={{ marginTop: 8, background: 'none', border: 'none', color: B, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}>
        {open ? 'Hide details' : 'Show how it works'}
      </button>
    </div>
  )
}

export default function ResultScreen() {
  const nav = useNavigate()
  const { summary, cards, taxYear, entities } = useMemo(() => selectSimpleResult(), [])
  const ok = summary && summary.ok
  const hasInputs = Array.isArray(entities) && entities.length > 0

  if (!hasInputs) {
    return (
      <SimpleShell step="result">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: N, margin: '8px 0 6px' }}>Nothing to show yet</h1>
        <p style={{ fontSize: 14, color: SL, margin: '0 0 16px' }}>Pick who you are and type a few numbers, and your estimate appears here.</p>
        <button onClick={() => nav('/start')} style={{ padding: '12px 18px', background: B, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Start →</button>
      </SimpleShell>
    )
  }

  const total = ok ? summary.totalTax : null
  const rate = ok && summary.agi > 0 ? effectiveRate(summary.totalTax, summary.agi) : null
  const nextAmt = ok ? (summary.quarterlyRecommended || 0) : 0
  const sorted = sortCardsBySaving(cards.opportunities)

  return (
    <SimpleShell step="result" maxWidth={720}>
      <section aria-label="Your estimate" style={{ background: N, color: '#fff', borderRadius: 16, padding: '22px 20px' }}>
        <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.75 }}>For {taxYear}, you're on track to owe about</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, margin: '4px 0 2px' }}>{ok ? fmt(total) : '—'}</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          in federal income tax{rate !== null ? ` · ${pct(rate)} of your income` : ''}. Federal only; state tax is not included.
        </div>
        {!ok && <div role="alert" style={{ marginTop: 10, fontSize: 13, background: 'rgba(255,255,255,0.1)', padding: '8px 10px', borderRadius: 8 }}>We couldn't compute this one: {summary && summary.error}. Try the full form under Advanced.</div>}
        {ok && nextAmt > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Next estimated payment</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(nextAmt)}</div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              {summary.nextDueDate ? `due ${longDate(summary.nextDueDate)}` : ''}
              {summary.installmentsRemaining ? ` · ${summary.installmentsRemaining} of 4 left this year` : ''}
            </div>
          </div>
        )}
        {ok && nextAmt === 0 && (
          <div style={{ marginTop: 14, fontSize: 13, opacity: 0.85 }}>No estimated payment is due on these numbers.</div>
        )}
      </section>

      <section aria-label="Ways to lower it" style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: N, margin: '0 0 4px' }}>Ways to lower it</h2>
        <p style={{ fontSize: 13, color: SL, margin: '0 0 12px' }}>Estimates at your {pct(cards.marginalRate * 100)} marginal rate, based on the figures you entered. Biggest first.</p>
        {sorted.length === 0 && <div style={{ fontSize: 13, color: SL }}>Add a little more detail under Advanced and the list fills in.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((o, i) => <Card key={o.title + i} o={o} />)}
        </div>
      </section>

      <section aria-label="Make it more accurate" style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: N, margin: '0 0 8px' }}>Make it more accurate</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          <button style={linkBtn} onClick={() => nav('/personal-estimate?section=adjustments')}>Add retirement or HSA contributions →</button>
          <button style={linkBtn} onClick={() => nav('/personal-estimate?section=payments')}>Add estimated payments I've made →</button>
          <button style={linkBtn} onClick={() => nav('/calculate-tax')}>Add another business or property →</button>
          <button style={linkBtn} onClick={() => nav('/carryforward-wizard')}>Add prior-year carryforwards →</button>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => nav('/personal-estimate')} style={{ ...linkBtn, background: B, color: '#fff', border: '1px solid ' + B }}>Save this record</button>
          <button onClick={() => nav('/ai-analysis')} style={linkBtn}>Share with my CPA (export)</button>
          <button onClick={() => nav('/start')} style={linkBtn}>Start over</button>
        </div>
        <p style={{ fontSize: 12, color: SL, marginTop: 10, lineHeight: 1.5 }}>Saving and the CPA export open the full form, where every number above can be refined. Nothing you typed is lost.</p>
      </section>
    </SimpleShell>
  )
}
