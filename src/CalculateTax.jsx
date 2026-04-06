import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const API = 'https://app.taxstat360.com'
const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'

export default function CalculateTax() {
  const nav = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    year: new Date().getFullYear(),
    entityType: 'S-Corporation',
    grossRevenue: '',
    businessExpenses: '',
    officerSalary: '',
    depreciation: '',
    k1Income: '',
    ownershipPct: 100,
  })
  const token = localStorage.getItem('access_token')

  useEffect(() => {
    // Load saved records from localStorage
    const saved = JSON.parse(localStorage.getItem('tax_records') || '[]')
    setRecords(saved)
  }, [])

  const calcK1 = () => {
    const rev = parseFloat(form.grossRevenue) || 0
    const exp = parseFloat(form.businessExpenses) || 0
    const sal = parseFloat(form.officerSalary) || 0
    const dep = parseFloat(form.depreciation) || 0
    const netIncome = rev - exp - sal - dep
    return (netIncome * (parseFloat(form.ownershipPct) / 100)).toFixed(2)
  }

  const handleSave = () => {
    const k1 = parseFloat(calcK1())
    const record = {
      id: Date.now(),
      year: form.year,
      entityType: form.entityType,
      grossRevenue: parseFloat(form.grossRevenue) || 0,
      businessExpenses: parseFloat(form.businessExpenses) || 0,
      officerSalary: parseFloat(form.officerSalary) || 0,
      depreciation: parseFloat(form.depreciation) || 0,
      k1Income: k1,
      ownershipPct: form.ownershipPct,
      totalDeductions: (parseFloat(form.businessExpenses) || 0) + (parseFloat(form.officerSalary) || 0) + (parseFloat(form.depreciation) || 0),
      createdAt: new Date().toLocaleString(),
    }
    const updated = [record, ...records]
    setRecords(updated)
    localStorage.setItem('tax_records', JSON.stringify(updated))
    setShowForm(false)
    setForm({ year: new Date().getFullYear(), entityType: 'S-Corporation', grossRevenue: '', businessExpenses: '', officerSalary: '', depreciation: '', k1Income: '', ownershipPct: 100 })
  }

  const handleDelete = (id) => {
    const updated = records.filter(r => r.id !== id)
    setRecords(updated)
    localStorage.setItem('tax_records', JSON.stringify(updated))
  }

  const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', display: 'flex', alignItems: 'center', height: 60, gap: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => nav('/dashboard')}>
          <div style={{ width: 32, height: 32, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>T</div>
          <span style={{ fontWeight: 700, color: N, fontSize: 16 }}>TaxStat360</span>
        </div>
        <nav style={{ display: 'flex', gap: 8, flex: 1 }}>
          {[['Dashboard', '/dashboard'], ['Calculate Tax', '/calculate-tax'], ['AI Analysis', '/ai-analysis']].map(([label, path]) => (
            <button key={path} onClick={() => nav(path)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: path === '/calculate-tax' ? B : 'transparent', color: path === '/calculate-tax' ? '#fff' : SL, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{label}</button>
          ))}
        </nav>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Top banner */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 28px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 36, height: 36, background: '#EFF6FF', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💰</div>
            <div>
              <div style={{ fontWeight: 700, color: N, fontSize: 15 }}>Get your best possible tax outcome</div>
              <div style={{ color: SL, fontSize: 13, marginTop: 2 }}>Enter your financial data below. K-1 is auto-calculated based on entity type and ownership %.</div>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} style={{ padding: '10px 20px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            ＋ Start New Calculation
          </button>
        </div>

        {/* New Calculation Form */}
        {showForm && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: `2px solid ${B}` }}>
            <div style={{ fontWeight: 700, color: N, fontSize: 16, marginBottom: 20 }}>New Tax Calculation</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
              {[
                ['Tax Year', 'year', 'number'],
                ['Gross Revenue', 'grossRevenue', 'number'],
                ['Business Expenses', 'businessExpenses', 'number'],
                ['Officer/Owner Salary (W-2)', 'officerSalary', 'number'],
                ['Depreciation', 'depreciation', 'number'],
                ['Ownership %', 'ownershipPct', 'number'],
              ].map(([label, key, type]) => (
                <div key={key}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: SL, marginBottom: 6 }}>{label}</div>
                  <input type={type} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: SL, marginBottom: 6 }}>Entity Type</div>
                <select value={form.entityType} onChange={e => setForm({ ...form, entityType: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}>
                  <option>S-Corporation</option>
                  <option>Multi-Member LLC</option>
                  <option>Partnership</option>
                </select>
              </div>
            </div>
            {/* K-1 Preview */}
            <div style={{ background: '#F0F4FF', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 32 }}>
              <div><span style={{ fontSize: 12, color: SL }}>Calculated K-1 Income (Schedule E)</span><div style={{ fontWeight: 700, color: N, fontSize: 18 }}>{fmt(calcK1())}</div></div>
              <div><span style={{ fontSize: 12, color: SL }}>Net Business Income</span><div style={{ fontWeight: 700, color: N, fontSize: 18 }}>{fmt((parseFloat(form.grossRevenue)||0) - (parseFloat(form.businessExpenses)||0) - (parseFloat(form.officerSalary)||0) - (parseFloat(form.depreciation)||0))}</div></div>
              <div><span style={{ fontSize: 12, color: SL }}>Entity Type</span><div style={{ fontWeight: 700, color: N, fontSize: 18 }}>{form.entityType}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleSave} style={{ padding: '10px 24px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Save & Calculate</button>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 24px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Records */}
        {records.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: SL }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: N, marginBottom: 8 }}>No tax calculations yet</div>
            <div style={{ fontSize: 14 }}>Click "Start New Calculation" to enter your financial data.</div>
          </div>
        )}

        {records.map(r => (
          <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, color: N, fontSize: 16 }}>Tax Record {r.year} — {r.entityType}</div>
                <div style={{ color: SL, fontSize: 13, marginTop: 2 }}>Last updated {r.createdAt}</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => nav('/ai-analysis', { state: { record: r } })} style={{ padding: '8px 18px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✦ Analyze Data
                </button>
                <button onClick={() => handleDelete(r.id)} style={{ padding: '8px 18px', background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  🗑 Delete
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                ['💰', 'Gross Revenue', r.grossRevenue],
                ['📋', 'Total Expenses', r.totalDeductions],
                ['🏢', 'Depreciation', r.depreciation],
                ['📄', 'K-1 Income (Sch. E)', r.k1Income],
              ].map(([icon, label, val]) => (
                <div key={label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                  <div style={{ color: SL, fontSize: 12, fontWeight: 600 }}>{label}</div>
                  <div style={{ color: parseFloat(val) < 0 ? '#DC2626' : N, fontWeight: 700, fontSize: 20, marginTop: 4 }}>
                    {parseFloat(val) < 0 ? '-$' + Math.abs(parseFloat(val)).toLocaleString() : fmt(val)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
