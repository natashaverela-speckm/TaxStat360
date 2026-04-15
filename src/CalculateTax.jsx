import { useState, useEffect } from 'react'

const API = 'https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
const INTEGRATIONS = [
  { id: 'quickbooks', name: 'QuickBooks', abbr: 'QB', color: '#2CA01C' },
  { id: 'xero',       name: 'Xero',       abbr: 'XE', color: '#13B5EA' },
  { id: 'wave',       name: 'Wave',       abbr: 'WV', color: '#1C4ED8' },
  { id: 'freshbooks', name: 'FreshBooks', abbr: 'FB', color: '#0E9E6E' },
]
const OWN_OPTIONS = ['100','90','80','75','70','60','50','49','40','33','25','20','10']
const fmt = n => '$' + Math.abs(Math.round(n)).toLocaleString()
const nv  = v => parseFloat(v) || 0

const BLANK = { name:'', own:'100', pnl:null, manRev:'', manExp:'' }

export default function CalculateTax() {
  const [entities, setEntities] = useState([{ ...BLANK }])

  function updEnt(i, k, v) {
    setEntities(prev => { const a = [...prev]; a[i] = { ...a[i], [k]: v }; return a })
  }
  function addEntity() {
    if (entities.length < 5) setEntities(prev => [...prev, { ...BLANK }])
  }
  function removeEntity(i) {
    setEntities(prev => prev.filter((_, idx) => idx !== i))
  }

  const k1Total = Math.round(entities.reduce((sum, ent) => {
    const profit = ent.pnl ? ent.pnl.netProfit : (nv(ent.manRev) - nv(ent.manExp))
    return sum + profit * nv(ent.own) / 100
  }, 0))

  const hasPnl = entities.some(e => e.pnl)

  function proceed() {
    localStorage.setItem('ts360_k1', k1Total)
    window.location.href = '/tax-return'
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>Step 1 of 3</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', margin: 0 }}>Business Income &amp; K-1 Shares</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {entities.map((ent, idx) => (
          <EntityBlock
            key={idx}
            idx={idx}
            ent={ent}
            total={entities.length}
            onUpdate={(k, v) => updEnt(idx, k, v)}
            onRemove={() => removeEntity(idx)}
          />
        ))}
      </div>

      {entities.length < 5 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={addEntity}
            style={{ padding: '10px 22px', background: 'none', border: '2px dashed #2563EB', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#2563EB', cursor: 'pointer', width: '100%' }}
          >
            + Add Another Business / Entity
          </button>
        </div>
      )}

      {hasPnl && (
        <div style={{ marginTop: 28 }}>
          <div style={{ background: 'linear-gradient(135deg,#0D1B3E 0%,#1e3a70 100%)', borderRadius: 12, padding: 24, color: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
              {entities.length === 1 ? 'YOUR K-1 DISTRIBUTIVE SHARE' : 'TOTAL K-1 (ALL ENTITIES)'}
            </div>
            <div style={{ fontSize: 46, fontWeight: 800, color: k1Total >= 0 ? '#4ADE80' : '#F87171', lineHeight: 1 }}>
              {fmt(k1Total)}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {k1Total >= 0 ? 'Flows to Schedule E on your Form 1040' : 'Loss may offset other income on your return'}
            </div>
          </div>
        </div>
      )}

      {hasPnl && (
        <div style={{ textAlign: 'center', paddingBottom: 40, marginTop: 24 }}>
          <button
            onClick={proceed}
            style={{ padding: '16px 52px', background: '#2563EB', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 800, color: '#fff', cursor: 'pointer' }}
          >
            Continue to Personal Tax Return &#8594;
          </button>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>
            K-1 of {fmt(k1Total)} will be pre-filled on the next page
          </div>
        </div>
      )}

      {!hasPnl && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748B' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>&#128202;</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Connect your accounting software above</div>
          <div style={{ fontSize: 14 }}>Or click &#8220;Enter Manually&#8221; to type in your revenue and expenses</div>
        </div>
      )}
    </div>
  )
}

function EntityBlock({ idx, ent, total, onUpdate, onRemove }) {
  const [manual, setManual] = useState(false)
  const [pnl,    setPnl]    = useState(ent.pnl || null)
  const [conn,   setConn]   = useState({})
  const [syncing, setSyncing] = useState(null)
  const [manRev, setManRev] = useState('')
  const [manExp, setManExp] = useState('')
  const token = localStorage.getItem('token')

  useEffect(() => { onUpdate('pnl', pnl) }, [pnl])

  async function connectIntegration(id) {
    setSyncing(id)
    try {
      const r = await fetch(API + '/integrations/' + id + '/pnl', { headers: { Authorization: 'Bearer ' + token } })
      if (r.ok) { const d = await r.json(); setPnl(d); setConn(p => ({ ...p, [id]: true })) }
    } finally { setSyncing(null) }
  }

  function applyManual() {
    const rev = nv(manRev), exp = nv(manExp)
    if (!rev && !exp) return
    setPnl({ grossRevenue: rev, totalExpenses: exp, netProfit: rev - exp, categories: {} })
    setManual(false)
  }

  const share = pnl ? Math.round(pnl.netProfit * nv(ent.own) / 100) : 0

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 24 }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: '#2563EB', color: '#fff', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
            {idx + 1}
          </div>
          <input
            value={ent.name}
            onChange={e => onUpdate('name', e.target.value)}
            placeholder="Business / Entity Name (optional)"
            style={{ fontSize: 14, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', width: 260 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setManual(!manual); if (manual) setPnl(null) }}
            style={{ padding: '5px 14px', background: 'none', border: '1px solid #2563EB', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#2563EB', cursor: 'pointer' }}
          >
            {manual ? '← Use Software' : '✏️ Enter Manually'}
          </button>
          {total > 1 && (
            <button
              onClick={onRemove}
              style={{ padding: '5px 10px', background: 'none', border: '1px solid #FECACA', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#DC2626', cursor: 'pointer' }}
            >
              ✕ Remove
            </button>
          )}
        </div>
      </div>

      {/* Integrations grid */}
      {!manual && !pnl && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1px', color: '#64748B', marginBottom: 12 }}>CONNECT YOUR ACCOUNTING SOFTWARE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {INTEGRATIONS.map(intg => {
              const isConn = !!conn[intg.id]
              return (
                <div key={intg.id} style={{ border: '2px solid ' + (isConn ? intg.color : '#E2E8F0'), borderRadius: 12, padding: 16, textAlign: 'center', background: isConn ? intg.color + '0D' : '#fff' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: intg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                    {intg.abbr}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{intg.name}</div>
                  {isConn ? (
                    <div>
                      <div style={{ fontSize: 12, color: '#16A34A', fontWeight: 700, marginBottom: 6 }}>
                        {syncing === intg.id ? '⟳ Syncing...' : '✓ Connected'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button onClick={() => connectIntegration(intg.id)} style={{ padding: '4px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#2563EB', cursor: 'pointer' }}>⟳ Refresh</button>
                        <button onClick={() => { setConn(p => ({ ...p, [intg.id]: false })); setPnl(null) }} style={{ padding: '4px 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#DC2626', cursor: 'pointer' }}>Disconnect</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => connectIntegration(intg.id)} style={{ width: '100%', padding: 8, background: '#2563EB', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
                      {syncing === intg.id ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Manual entry */}
      {manual && !pnl && (
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 20, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>&#9999;&#65039; Manual P&amp;L — {new Date().getFullYear()} YTD</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4 }}>Total Revenue</label>
              <input value={manRev} onChange={e => setManRev(e.target.value)} placeholder="0" type="number" style={{ width: '100%', padding: '10px 14px', border: '2px solid #E2E8F0', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4 }}>Total Expenses</label>
              <input value={manExp} onChange={e => setManExp(e.target.value)} placeholder="0" type="number" style={{ width: '100%', padding: '10px 14px', border: '2px solid #E2E8F0', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, color: '#64748B' }}>
              {(manRev || manExp) && <span>Net: <strong style={{ color: nv(manRev)-nv(manExp) >= 0 ? '#16A34A' : '#DC2626' }}>{fmt(nv(manRev)-nv(manExp))}</strong></span>}
            </div>
            <button onClick={applyManual} style={{ padding: '9px 20px', background: '#16A34A', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Apply &#8594;</button>
          </div>
        </div>
      )}

      {/* P&L display + ownership */}
      {pnl && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[['Revenue', fmt(pnl.grossRevenue), '#16A34A'], ['Expenses', fmt(pnl.totalExpenses), '#DC2626'], ['Net Profit', fmt(pnl.netProfit), pnl.netProfit >= 0 ? '#16A34A' : '#DC2626']].map(([l, v, c]) => (
              <div key={l} style={{ background: '#F8FAFC', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'center', paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 10 }}>Your Ownership %</label>
              <select value={ent.own} onChange={e => onUpdate('own', e.target.value)} style={{ width: '100%', padding: '12px 16px', border: '2px solid #2563EB', borderRadius: 10, fontSize: 16, fontWeight: 700, background: '#fff', cursor: 'pointer' }}>
                {OWN_OPTIONS.map(v => <option key={v} value={v}>{v}%{v === '100' ? ' (Sole Owner)' : ''}</option>)}
              </select>
            </div>
            <div style={{ background: 'linear-gradient(135deg,#0D1B3E 0%,#1e3a70 100%)', borderRadius: 12, padding: 20, color: '#fff', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>K-1 SHARE</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: share >= 0 ? '#4ADE80' : '#F87171', lineHeight: 1 }}>{fmt(share)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{fmt(pnl.netProfit)} × {ent.own}%</div>
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button onClick={() => setPnl(null)} style={{ padding: '4px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#DC2626', cursor: 'pointer' }}>&#215; Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}
