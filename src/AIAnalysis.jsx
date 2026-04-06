import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'

function riskColor(level) {
  if (level === 'High Risk' || level === 'high') return { bg: '#FEE2E2', text: '#DC2626', label: 'High Risk' }
  if (level === 'medium') return { bg: '#FEF3C7', text: '#D97706', label: 'Medium' }
  return { bg: '#D1FAE5', text: '#059669', label: 'Low' }
}

function calcAuditRisk(record) {
  let score = 0
  if (!record) return { overall: 'Low', score: 20 }
  const expRatio = record.totalDeductions / (record.grossRevenue || 1)
  if (expRatio > 0.8) score += 40
  else if (expRatio > 0.6) score += 20
  const k1 = Math.abs(record.k1Income)
  if (k1 > 500000) score += 30
  else if (k1 > 200000) score += 15
  if (record.entityType === 'S-Corporation' && record.officerSalary < record.grossRevenue * 0.1) score += 25
  if (score >= 60) return { overall: 'High Risk', score }
  if (score >= 30) return { overall: 'Medium', score }
  return { overall: 'Low', score: Math.max(score, 15) }
}

function calcTaxLiability(record) {
  if (!record) return { federal: 0, selfEmployment: 0, quarterly: 0, effectiveRate: 0 }
  const k1 = parseFloat(record.k1Income) || 0
  const salary = parseFloat(record.officerSalary) || 0
  const totalIncome = k1 + salary
  // 2024 tax brackets (simplified)
  let federal = 0
  if (totalIncome > 609350) federal = 183647 + (totalIncome - 609350) * 0.37
  else if (totalIncome > 243725) federal = 55374 + (totalIncome - 243725) * 0.35
  else if (totalIncome > 100525) federal = 17168 + (totalIncome - 100525) * 0.24
  else if (totalIncome > 47150) federal = 5426 + (totalIncome - 47150) * 0.22
  else if (totalIncome > 11600) federal = 1160 + (totalIncome - 11600) * 0.12
  else federal = totalIncome * 0.10
  // SE tax on salary (W-2 — employer half deductible)
  const seTax = record.entityType === 'S-Corporation' ? salary * 0.0765 * 2 : k1 * 0.1413
  const total = federal + seTax
  return {
    federal: Math.round(federal),
    selfEmployment: Math.round(seTax),
    total: Math.round(total),
    quarterly: Math.round(total / 4),
    effectiveRate: totalIncome > 0 ? ((total / totalIncome) * 100).toFixed(1) : 0,
  }
}

function genRecommendations(record, tax) {
  if (!record) return []
  const recs = []
  const expRatio = record.totalDeductions / (record.grossRevenue || 1)
  if (expRatio < 0.4) recs.push({ title: 'Maximize Business Deductions', desc: `You're deducting ${(expRatio * 100).toFixed(0)}% of revenue. Review meals (50%), home office, vehicle, and professional development expenses to reduce taxable income.` })
  if (record.entityType === 'S-Corporation' && record.officerSalary < record.grossRevenue * 0.3)
    recs.push({ title: 'Optimize S-Corp Salary', desc: `Your officer salary of ${fmt(record.officerSalary)} may be below IRS reasonable compensation standards. Optimizing this ratio reduces SE tax exposure.` })
  if (record.depreciation < record.grossRevenue * 0.05)
    recs.push({ title: 'Leverage Section 179 / Bonus Depreciation', desc: 'Consider accelerating depreciation on eligible assets. Section 179 allows up to $1,220,000 in first-year deductions for qualifying property.' })
  if (tax.quarterly > 2500)
    recs.push({ title: 'Set Up Quarterly Estimated Tax Payments', desc: `Based on your K-1 income, you owe approximately ${fmt(tax.quarterly)}/quarter. Set up IRS EFTPS payments to avoid underpayment penalties.` })
  if (record.k1Income < 0)
    recs.push({ title: 'Passive Activity Loss Rules Apply', desc: 'Your K-1 shows a loss. Verify you meet the material participation or at-risk rules before deducting this loss on Schedule E.' })
  recs.push({ title: 'Qualified Business Income (QBI) Deduction', desc: `As a ${record.entityType} owner, you may qualify for a 20% deduction on qualified business income. Consult your tax advisor to maximize this benefit.` })
  return recs.slice(0, 4)
}

function genRisks(record, audit) {
  if (!record) return []
  const expRatio = record.totalDeductions / (record.grossRevenue || 1)
  return [
    {
      name: 'Expense-to-Revenue Ratio',
      level: expRatio > 0.7 ? 'high' : expRatio > 0.5 ? 'medium' : 'low',
      score: Math.round(expRatio * 100),
      actions: ['Document all business expenses with receipts', 'Separate personal and business expenses', expRatio > 0.7 ? 'High ratio may trigger IRS review — prepare documentation' : 'Maintain current expense tracking practices'],
    },
    {
      name: 'S-Corp Reasonable Compensation',
      level: record.entityType === 'S-Corporation' && record.officerSalary < record.grossRevenue * 0.25 ? 'high' : 'low',
      score: record.entityType === 'S-Corporation' ? (record.officerSalary < record.grossRevenue * 0.25 ? 75 : 20) : 15,
      actions: ['Document compensation analysis in corporate minutes', 'Compare to industry salary benchmarks', 'Consult a tax professional for IRS defensible salary'],
    },
    {
      name: 'K-1 Reporting Consistency',
      level: Math.abs(record.k1Income) > 300000 ? 'medium' : 'low',
      score: Math.abs(record.k1Income) > 300000 ? 45 : 20,
      actions: ['Ensure K-1 matches entity return (Form 1120-S or 1065)', 'Report on Schedule E Part II of Form 1040', 'Keep basis calculations current to avoid excess loss disallowance'],
    },
  ]
}

const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function AIAnalysis() {
  const nav = useNavigate()
  const location = useLocation()
  const [records, setRecords] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('tax_records') || '[]')
    setRecords(saved)
    if (location.state?.record) {
      setSelectedId(location.state.record.id)
    } else if (saved.length > 0) {
      setSelectedId(saved[0].id)
    }
  }, [])

  const record = records.find(r => r.id === selectedId) || records[0] || null
  const audit = calcAuditRisk(record)
  const tax = calcTaxLiability(record)
  const recs = genRecommendations(record, tax)
  const risks = genRisks(record, audit)

  const savingScenarios = record ? [
    { title: 'Increase deductions by 10%', current: tax.total, newTax: Math.round(tax.total * 0.91), savings: Math.round(tax.total * 0.09) },
    { title: 'Optimize officer salary', current: tax.total, newTax: Math.round(tax.total * 0.87), savings: Math.round(tax.total * 0.13) },
    { title: 'Max Section 179 depreciation', current: tax.total, newTax: Math.round(tax.total * 0.83), savings: Math.round(tax.total * 0.17) },
  ] : []

  const auditColor = riskColor(audit.overall)

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', display: 'flex', alignItems: 'center', height: 60, gap: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => nav('/dashboard')}>
          <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>nav('/dashboard')}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,letterSpacing:'-0.3px',borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>
        </div>
        <nav style={{ display: 'flex', gap: 8, flex: 1 }}>
          {[['Dashboard', '/dashboard'], ['Calculate Tax', '/calculate-tax'], ['AI Analysis', '/ai-analysis']].map(([label, path]) => (
            <button key={path} onClick={() => nav(path)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: path === '/ai-analysis' ? B : 'transparent', color: path === '/ai-analysis' ? '#fff' : SL, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{label}</button>
          ))}
        </nav>
        {records.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: SL }}>Record:</span>
            <select value={selectedId || ''} onChange={e => setSelectedId(parseInt(e.target.value))}
              style={{ padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13 }}>
              {records.map(r => <option key={r.id} value={r.id}>{r.year} — {r.entityType}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, color: N, fontSize: 22 }}>AI Analysis</div>
          <div style={{ color: SL, fontSize: 14, marginTop: 4 }}>Personalized tax strategies powered by AI</div>
        </div>

        {!record ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: N, marginBottom: 8 }}>No tax records found</div>
            <div style={{ color: SL, fontSize: 14, marginBottom: 20 }}>Create a tax calculation first to see your AI analysis.</div>
            <button onClick={() => nav('/calculate-tax')} style={{ padding: '12px 24px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Go to Calculate Tax</button>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                ['Total Income', fmt(record.grossRevenue), '#EFF6FF', B],
                ['Total Deductions', fmt(record.totalDeductions), '#F0FDF4', '#059669'],
                ['K-1 Total (Sch. E)', fmt(record.k1Income), record.k1Income < 0 ? '#FEE2E2' : '#FFF7ED', record.k1Income < 0 ? '#DC2626' : '#EA580C'],
                ['Overall Audit Risk', audit.overall, auditColor.bg, auditColor.text],
              ].map(([label, value, bg, color]) => (
                <div key={label} style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ color: SL, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{label}</div>
                  <div style={{ color: color, fontWeight: 700, fontSize: 22 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Tax Liability Banner */}
            <div style={{ background: N, borderRadius: 12, padding: '20px 28px', marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
              {[
                ['Estimated Federal Tax', fmt(tax.federal)],
                ['SE / Payroll Tax', fmt(tax.selfEmployment)],
                ['Total Tax Liability', fmt(tax.total)],
                ['Quarterly Payment Due', fmt(tax.quarterly)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{label}</div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Recommendations + Risk Analysis */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Tax Planning Recommendations */}
              <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight: 700, color: N, fontSize: 16, marginBottom: 4 }}>Tax Planning Recommendations</div>
                <div style={{ color: SL, fontSize: 13, marginBottom: 20 }}>Personalized strategies to optimize your tax situation</div>
                {recs.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16, padding: '14px 16px', background: '#F8FAFC', borderRadius: 10 }}>
                    <div style={{ width: 22, height: 22, minWidth: 22, background: '#D1FAE5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                      <span style={{ color: '#059669', fontSize: 12 }}>✓</span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: N, fontSize: 14, marginBottom: 4 }}>{r.title}</div>
                      <div style={{ color: SL, fontSize: 13, lineHeight: 1.5 }}>{r.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Risk Analysis */}
              <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight: 700, color: N, fontSize: 16, marginBottom: 4 }}>Risk Analysis</div>
                <div style={{ color: SL, fontSize: 13, marginBottom: 20 }}>Assessment of audit risk and compliance factors</div>
                {risks.map((r, i) => {
                  const rc = riskColor(r.level)
                  return (
                    <div key={i} style={{ marginBottom: 16, padding: '16px 18px', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 700, color: N, fontSize: 14 }}>{r.name}</span>
                          <span style={{ padding: '2px 10px', background: rc.bg, color: rc.text, borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{rc.label}</span>
                        </div>
                        <span style={{ fontSize: 12, color: SL }}>Risk Score: {r.score}</span>
                      </div>
                      {r.actions.map((a, j) => (
                        <div key={j} style={{ color: B, fontSize: 13, marginBottom: 4, cursor: 'pointer' }}>→ {a}</div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Saving Recommendations */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ fontWeight: 700, color: N, fontSize: 16, marginBottom: 4 }}>Saving Recommendations</div>
              <div style={{ color: SL, fontSize: 13, marginBottom: 20 }}>Impact analysis of potential tax-saving decisions</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {savingScenarios.map((s, i) => (
                  <div key={i} style={{ padding: '20px 20px', border: '1px solid #E2E8F0', borderRadius: 10 }}>
                    <div style={{ fontWeight: 700, color: N, fontSize: 14, marginBottom: 16 }}>{s.title}</div>
                    {[['Current Tax', fmt(s.current), SL], ['New Tax', fmt(s.newTax), SL], ['Savings', fmt(s.savings), '#059669']].map(([label, val, color]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ color: SL, fontSize: 13 }}>{label}</span>
                        <span style={{ fontWeight: 700, color, fontSize: 13 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
