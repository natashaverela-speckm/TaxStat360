import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'
const G = '#059669'
const R = '#DC2626'
const P = '#7C3AED'

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <svg width="34" height="34" viewBox="0 0 34 34" style={{ flexShrink: 0 }}>
        <rect width="34" height="34" rx="8" fill={N} />
        <rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3" />
        <rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55" />
        <rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8" />
        <rect x="26" y="5" width="4" height="26" rx="1.5" fill="white" />
      </svg>
      <div style={{ fontWeight: 800, color: N, fontSize: 18, letterSpacing: '-0.3px', borderBottom: '2px solid ' + B, paddingBottom: 1 }}>
        TaxStat<span style={{ color: B }}>360</span>
      </div>
    </div>
  )
}

// Features visible to users — purposeful, real, no internal items
const CATEGORIES = [
  {
    label: 'Core AI Intelligence', color: B, features: [
      { n: 1, t: 'Real-Time Risk Alert Engine', d: 'AI scans your data for audit risks, unusual deductions, and IRS compliance issues.', status: 'active' },
      { n: 2, t: 'What-If Scenario Simulator', d: 'Test financial decisions — salary changes, deductions, retirement contributions — without affecting real records.', status: 'active' },
      { n: 3, t: 'Explainable AI Layer', d: '"Why This Number?" — every recommendation comes with a plain-English explanation of the underlying tax rule.', status: 'active' },
      { n: 4, t: 'AI Assumption Transparency', d: 'See every assumption the AI is making: tax rules applied, depreciation methods used, IRS benchmarks referenced.', status: 'active' },
      { n: 5, t: 'Data Confidence Score', d: 'A reliability score for your tax calculation based on how complete your inputs are. Fill more fields to improve accuracy.', status: 'active' },
      { n: 6, t: 'Personalized Risk Tolerance Profiling', d: 'Conservative, balanced, or aggressive — the AI adjusts its recommendations to match how much risk you want to take.', status: 'active' },
      { n: 7, t: 'AI Recommendation Change Tracking', d: 'As your financial data changes through the year, track how the AI\'s advice evolves.', status: 'coming' },
      { n: 8, t: 'Financial Data Anomaly Detection', d: 'Detects duplicate entries, abnormal revenue spikes, and inconsistent depreciation patterns in your data.', status: 'coming' },
    ]
  },
  {
    label: 'Tax Planning & Optimization', color: G, features: [
      { n: 9,  t: 'Tax-Saving Opportunity Discovery', d: 'AI scans for overlooked deductions, missed credits, and optimization strategies specific to your entity type.', status: 'active' },
      { n: 10, t: 'Estimated Tax Payment Planner', d: 'Quarterly payment breakdowns with IRS due dates — avoid underpayment penalties.', status: 'active' },
      { n: 11, t: 'Safe Harbor Rule Detection', d: 'Identifies IRS Safe Harbor thresholds so you pay the minimum required without triggering penalties.', status: 'active' },
      { n: 12, t: 'Mid-Year Tax Health Report', d: 'A mid-year snapshot of projected taxes, key risks, and recommended actions before year-end.', status: 'active' },
      { n: 13, t: 'Year-Over-Year Intelligence', d: 'Compares your financials across tax years to highlight trends, improvements, and new risks.', status: 'active' },
      { n: 14, t: 'AI-Generated Financial Action Plan', d: 'A prioritized checklist of next steps — specific actions with timelines to reduce your tax liability.', status: 'active' },
      { n: 15, t: 'Retirement Contribution Optimizer', d: 'Models SEP-IRA, Solo 401k, and SIMPLE IRA contributions to find the maximum tax-deductible amount.', status: 'coming' },
      { n: 16, t: 'Industry Benchmark Intelligence', d: 'Compares your revenue, expenses, and deductions to similar US businesses in your industry.', status: 'coming' },
    ]
  },
  {
    label: 'IRS & Compliance', color: R, features: [
      { n: 17, t: 'IRS Audit Readiness Mode', d: 'Organizes your data into IRS-friendly format with explanations — so you\'re prepared if the IRS calls.', status: 'active' },
      { n: 18, t: 'IRS Schedule Mapping', d: 'Maps your income and expenses to the correct IRS schedules: C, E, K-1, and Form 8995.', status: 'active' },
      { n: 19, t: 'Depreciation Compliance Engine', d: 'MACRS, Section 179, and Bonus depreciation — all handled per IRS-approved methods.', status: 'active' },
      { n: 20, t: 'State-Level Tax Awareness', d: 'Flags state-specific rules: deduction disallowances, income sourcing, and nexus issues.', status: 'active' },
      { n: 21, t: 'Compliance Confidence Indicator', d: 'A score showing how well your return aligns with IRS expectations based on your inputs.', status: 'active' },
      { n: 22, t: 'IRS-Friendly Language Mode', d: 'All IRS terminology is translated into plain, human-readable language throughout the platform.', status: 'active' },
      { n: 23, t: 'Compliance-Grade AI Guardrails', d: 'The AI avoids aggressive tax positions and clearly labels any high-risk strategies it identifies.', status: 'active' },
      { n: 24, t: 'IRS Rule Change Monitoring', d: 'Monitors IRS updates and flags changes that affect your specific entity type and filing situation.', status: 'coming' },
    ]
  },
  {
    label: 'Reports & Collaboration', color: P, features: [
      { n: 25, t: 'One-Click CPA Export Pack', d: 'A print-ready PDF with your financials, AI insights, risk alerts, and IRS schedule mapping — ready to hand to your accountant.', status: 'active' },
      { n: 26, t: 'AI-Generated Audit Defense Narrative', d: 'Plain-English IRS response templates for common audit triggers — review with your CPA before sending.', status: 'active' },
      { n: 27, t: 'Advisor & Accountant Collaboration', d: 'Secure read-only access for your CPA or financial advisor — they see your data without being able to modify it.', status: 'active' },
      { n: 28, t: 'IRS Deadline & Penalty Awareness', d: 'Tracks all IRS deadlines relevant to your entity type and explains the penalty for missing each one.', status: 'active' },
      { n: 29, t: 'IRS-Aligned Audit Trail', d: 'Every calculation and AI recommendation is logged with timestamps — audit-ready record keeping.', status: 'active' },
      { n: 30, t: 'Multi-Entity Consolidated View', d: 'Own multiple businesses? See your combined tax exposure across all entities in one dashboard.', status: 'coming' },
      { n: 31, t: 'CPA Collaboration Portal', d: 'A dedicated portal where your CPA can review, annotate, and sign off on AI recommendations.', status: 'coming' },
    ]
  },
]

const fmtDollar = n => {
  const abs = Math.abs(Math.round(n))
  return n < 0 ? '($' + abs.toLocaleString() + ')' : '$' + abs.toLocaleString()
}

// Calculate real compliance score from saved record
function calcComplianceScore(record) {
  if (!record) return null
  let score = 40 // base
  const biz = record.biz || {}
  const f1040 = record.f1040 || {}
  if (biz.grossRevenue && parseFloat(biz.grossRevenue) > 0) score += 15
  if (biz.entityType) score += 10
  if (f1040.filingStatus) score += 10
  if (f1040.w2Income) score += 5
  if (biz.officerSalary && parseFloat(biz.officerSalary) > 0) score += 5
  if (biz.operatingExpenses && parseFloat(biz.operatingExpenses) > 0) score += 5
  if (biz.depreciation && parseFloat(biz.depreciation) > 0) score += 5
  if (f1040.estimatedPayments && parseFloat(f1040.estimatedPayments) > 0) score += 5
  return Math.min(score, 98)
}

// Generate real risk alerts from saved record
function calcRiskAlerts(record) {
  if (!record) return []
  const alerts = []
  const biz = record.biz || {}
  const k1 = parseFloat(record.k1Income || 0)
  const revenue = parseFloat(biz.grossRevenue || 0)
  const officerSal = parseFloat(biz.officerSalary || 0)
  const estPay = parseFloat(record.f1040?.estimatedPayments || 0)
  const today = new Date()
  const month = today.getMonth() + 1 // 1-12

  // S-Corp officer salary
  if (biz.entityType === 'S-Corporation' && k1 > 20000 && officerSal === 0)
    alerts.push({ level: 'high', text: 'No officer salary recorded. S-Corp owners must pay themselves a reasonable W-2 salary — this is an IRS audit trigger.' })
  else if (biz.entityType === 'S-Corporation' && officerSal > 0 && officerSal < k1 * 0.3 && k1 > 30000)
    alerts.push({ level: 'medium', text: `Officer salary (${fmtDollar(officerSal)}) may be below IRS reasonable compensation threshold relative to K-1 income of ${fmtDollar(k1)}.` })

  // No estimated payments
  if (k1 > 0 && estPay === 0 && k1 > 5000)
    alerts.push({ level: 'high', text: `Estimated tax payments not recorded. With ${fmtDollar(k1)} K-1 income, quarterly payments are likely required to avoid IRS underpayment penalties.` })

  // Upcoming quarterly deadline
  const upcomingDeadlines = { 1:'April 15', 2:'April 15', 3:'April 15', 4:'April 15', 5:'June 16', 6:'June 16', 7:'September 15', 8:'September 15', 9:'September 15', 10:'January 15', 11:'January 15', 12:'January 15' }
  alerts.push({ level: 'info', text: `Next quarterly estimated tax payment due: ${upcomingDeadlines[month]}. Make sure your payment reflects year-to-date income.` })

  // No depreciation
  if (revenue > 50000 && (!biz.depreciation || parseFloat(biz.depreciation) === 0))
    alerts.push({ level: 'medium', text: 'No depreciation recorded. If you own equipment, vehicles, or property used in the business, Section 179 or MACRS depreciation may significantly reduce your taxable income.' })

  // C-Corp double tax
  if (biz.entityType === 'C-Corporation' && revenue > 0)
    alerts.push({ level: 'info', text: 'C-Corporation: profits are taxed at 21% at the entity level. Consider whether an S-Corp election would reduce your overall tax burden through pass-through treatment.' })

  return alerts.slice(0, 4)
}

function Modal({ onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 740, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        {children}
      </div>
    </div>
  )
}

function ReportModal({ onClose, record }) {
  const entities = JSON.parse(sessionStorage.getItem('ts360_entities') || '[]')
  const k1Raw = parseFloat(sessionStorage.getItem('ts360_k1') || record?.k1Income || '0')
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const biz = record?.biz || {}
  const f1040 = record?.f1040 || {}
  const score = calcComplianceScore(record)
  const alerts = calcRiskAlerts(record)
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 4 }}>CPA EXPORT PACK</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>Tax Analysis Report</h2>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>Generated {now} · TaxStat360</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ padding: '8px 18px', background: B, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>🖨 Print / Save PDF</button>
            <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
          </div>
        </div>
        {score && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>INPUT COMPLETENESS SCORE</div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>Based on fields entered — fill more inputs to improve accuracy</div>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#166534' }}>{score}%</div>
          </div>
        )}
        {record && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>LAST SAVED CALCULATION — {record.savedAt}</div>
            {[
              ['Entity Type', biz.entityType],
              ['Tax Year', String(biz.year || '')],
              ['Gross Revenue', biz.grossRevenue ? '$' + parseFloat(biz.grossRevenue).toLocaleString() : ''],
              ['Operating Expenses', biz.operatingExpenses ? '$' + parseFloat(biz.operatingExpenses).toLocaleString() : ''],
              ['Officer Salary', biz.officerSalary ? '$' + parseFloat(biz.officerSalary).toLocaleString() : ''],
              ['Filing Status', (f1040.filingStatus || '').toUpperCase()],
              ['W-2 Income', f1040.w2Income ? '$' + parseFloat(f1040.w2Income).toLocaleString() : ''],
              ['Estimated Payments Made', f1040.estimatedPayments ? '$' + parseFloat(f1040.estimatedPayments).toLocaleString() : ''],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                <span style={{ color: SL }}>{label}</span>
                <span style={{ fontWeight: 600, color: N }}>{value}</span>
              </div>
            ))}
          </div>
        )}
        {entities.length > 0 && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>BUSINESS INCOME SUMMARY</div>
            {entities.map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                <span style={{ color: SL }}>{e.name} ({e.type} · {e.own}% ownership)</span>
                <span style={{ fontWeight: 600, color: e.k1 >= 0 ? '#16a34a' : R }}>{fmtDollar(e.k1)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 14, fontWeight: 700, borderTop: '2px solid #E2E8F0', marginTop: 4 }}>
              <span style={{ color: N }}>Total K-1 to Schedule E</span>
              <span style={{ color: k1Raw >= 0 ? '#16a34a' : R }}>{fmtDollar(k1Raw)}</span>
            </div>
          </div>
        )}
        {alerts.length > 0 && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: R, fontSize: 13, marginBottom: 10 }}>🚨 Risk Alerts</div>
            {alerts.map((a, i) => (
              <div key={i} style={{ fontSize: 13, color: '#991B1B', padding: '5px 0', borderBottom: i < alerts.length - 1 ? '1px solid #FECACA' : 'none' }}>• {a.text}</div>
            ))}
          </div>
        )}
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1D4ED8', fontSize: 13, marginBottom: 10 }}>📋 IRS Schedule Mapping</div>
          {[
            ['Schedule E (Part II)', 'K-1 income from S-Corps, Partnerships, and Trusts'],
            ['Form 8995', 'QBI deduction — 20% of qualified business income'],
            ['Form 8959', 'Additional Medicare Tax — 0.9% on wages over $200K'],
            ['Schedule A', 'Itemized deductions — mortgage, taxes, charitable'],
            ['Form 7203', 'S-Corp shareholder stock and debt basis limitations'],
          ].map(([sched, desc]) => (
            <div key={sched} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13, borderBottom: '1px solid #BFDBFE' }}>
              <span style={{ fontWeight: 700, color: '#1D4ED8', minWidth: 145, flexShrink: 0 }}>{sched}</span>
              <span style={{ color: SL }}>{desc}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>For planning purposes only. Consult a licensed CPA before filing.</div>
      </div>
    </Modal>
  )
}

function SimulatorModal({ onClose, record }) {
  // Pre-fill from saved record if available
  const savedW2 = record?.f1040?.w2Income || record?.biz?.officerSalary || '0'
  const savedK1 = record?.k1Income || parseFloat(sessionStorage.getItem('ts360_k1') || '0')

  const [w2, setW2] = useState(String(parseFloat(savedW2) || 0))
  const [addlIncome, setAddlIncome] = useState('0')
  const [newDeduction, setNewDeduction] = useState('0')
  const [retirement, setRetirement] = useState('0')
  const [scenarioName, setScenarioName] = useState('My Scenario')

  const k1 = parseFloat(savedK1) || 0

  const calcTax = (w2Val, extraInc, dedExtra, retExtra) => {
    const gross = w2Val + k1 + parseFloat(extraInc || 0)
    const totalDed = 15750 + parseFloat(dedExtra || 0) + parseFloat(retExtra || 0)
    const taxable = Math.max(0, gross - totalDed)
    const brackets = [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [626350, 0.35], [Infinity, 0.37]]
    let tax = 0, prev = 0
    for (const [cap, rate] of brackets) {
      if (taxable <= prev) break
      tax += (Math.min(taxable, cap) - prev) * rate
      prev = cap
    }
    return Math.round(tax + Math.max(0, w2Val - 200000) * 0.009)
  }

  const baseTax = calcTax(parseFloat(w2) || 0, 0, 0, 0)
  const scenarioTax = calcTax(parseFloat(w2) || 0, addlIncome, newDeduction, retirement)
  const impact = scenarioTax - baseTax
  const inp = { width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: N, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }
  const lbl = { fontSize: 11, fontWeight: 700, color: SL, display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.5px' }
  const hint = { fontSize: 10, color: '#94A3B8', marginBottom: 5 }
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: G, letterSpacing: '1px', marginBottom: 4 }}>WHAT-IF SIMULATOR</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>Test Financial Decisions</h2>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>Changes here don't affect your real data</div>
          </div>
          <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 16 }}>SCENARIO INPUTS</div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Scenario Name</label>
              <input value={scenarioName} onChange={e => setScenarioName(e.target.value)} style={inp} />
            </div>
            {[
              { label: 'W-2 / Officer Salary', val: w2, set: setW2, hint: 'Your W-2 wages — adjust to see tax impact of salary changes' },
              { label: 'Additional Income', val: addlIncome, set: setAddlIncome, hint: 'Capital gains, freelance, rental, interest income' },
              { label: 'New Deduction', val: newDeduction, set: setNewDeduction, hint: 'Home office, equipment, professional fees, advertising' },
              { label: 'Retirement Contribution', val: retirement, set: setRetirement, hint: 'SEP-IRA (up to $69,000) · Solo 401k (up to $69,000) · SIMPLE IRA' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <label style={lbl}>{f.label}</label>
                <div style={hint}>{f.hint}</div>
                <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder="0" style={inp} />
              </div>
            ))}
            {k1 !== 0 && (
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1D4ED8' }}>
                📊 Using your K-1 income of {fmtDollar(k1)} from saved record
              </div>
            )}
            {parseFloat(retirement) > 0 && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', marginTop: 8 }}>
                💡 A {fmtDollar(parseFloat(retirement))} retirement contribution reduces taxable income by the same amount — significant savings at higher brackets.
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 16 }}>SCENARIO RESULTS</div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: SL, marginBottom: 6 }}>CURRENT ESTIMATED TAX</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: N }}>{fmtDollar(baseTax)}</div>
              <div style={{ fontSize: 11, color: SL, marginTop: 4 }}>Based on your inputs above</div>
            </div>
            <div style={{ background: impact < 0 ? '#F0FDF4' : impact > 0 ? '#FEF2F2' : '#F8FAFC', border: '1px solid ' + (impact < 0 ? '#BBF7D0' : impact > 0 ? '#FECACA' : '#E2E8F0'), borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: SL, marginBottom: 6 }}>SCENARIO TAX</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: impact < 0 ? '#16a34a' : impact > 0 ? R : N }}>{fmtDollar(scenarioTax)}</div>
            </div>
            <div style={{ background: impact < 0 ? '#EFF6FF' : impact > 0 ? '#FFF7ED' : '#F8FAFC', border: '2px solid ' + (impact < 0 ? B : impact > 0 ? '#FB923C' : '#E2E8F0'), borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, marginBottom: 8 }}>NET TAX IMPACT</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: impact < 0 ? B : impact > 0 ? '#EA580C' : SL }}>
                {impact === 0 ? 'No change' : (impact < 0 ? '↓ Save ' : '↑ Pay more ') + fmtDollar(Math.abs(impact))}
              </div>
              <div style={{ fontSize: 12, color: SL, marginTop: 6, lineHeight: 1.5 }}>
                {impact < 0 ? 'This scenario reduces your estimated federal tax liability.' : impact > 0 ? 'This scenario increases your estimated federal tax liability.' : 'No tax impact from these changes.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function NarrativeModal({ onClose }) {
  const [selected, setSelected] = useState(0)
  const [copied, setCopied] = useState(false)
  const narratives = [
    { title: 'Real Estate Professional Status', tag: 'REP · IRC §469(c)(7)', color: P, text: `Dear IRS Representative,\n\nThis letter responds to your inquiry regarding the taxpayer's Real Estate Professional (REP) classification under IRC Section 469(c)(7) for tax year 2025.\n\nThe taxpayer qualifies as a Real Estate Professional based on the following:\n\n1. MORE THAN 50% OF PERSONAL SERVICES\nThe taxpayer performed more than 50% of all personal services in real property trades or businesses in which they materially participated.\n\n2. MORE THAN 750 HOURS\nThe taxpayer performed more than 750 hours of services during the year satisfying the statutory threshold under IRC §469(c)(7)(B).\n\n3. MATERIAL PARTICIPATION\nThe taxpayer materially participated in each rental activity meeting the 500-hour test under Treas. Reg. §1.469-5T(a)(1).\n\nAs a result, rental real estate losses are treated as non-passive and are fully deductible pursuant to IRC §469(c)(7)(A).\n\nRespectfully submitted,` },
    { title: 'S-Corp Reasonable Compensation', tag: 'Officer Salary · Rev. Rul. 74-44', color: R, text: `Dear IRS Representative,\n\nThis letter addresses your inquiry regarding officer compensation paid through the taxpayer's S-Corporation for tax year 2025.\n\nThe officer salary represents reasonable compensation based on:\n\n1. INDUSTRY BENCHMARKS — Compensation was determined by reference to comparable salaries consistent with Rev. Rul. 74-44.\n\n2. DUTIES AND RESPONSIBILITIES — The officer-shareholder performs substantial services including business development, client management, and financial oversight.\n\n3. CORPORATE PROFITABILITY — The compensation represents a reasonable percentage of gross revenues consistent with industry norms.\n\nThe S-Corporation maintains complete payroll records and W-2 forms.\n\nRespectfully submitted,` },
    { title: 'K-1 Loss Deductibility', tag: 'Schedule E · IRC §1366(d)', color: '#0891b2', text: `Dear IRS Representative,\n\nThis letter responds to your inquiry regarding Schedule E losses reported from the taxpayer's S-Corporation K-1 for tax year 2025.\n\nThe K-1 losses are fully deductible for the following reasons:\n\n1. SHAREHOLDER BASIS — The taxpayer maintains sufficient stock basis under IRC §1366(d). Form 7203 is attached.\n\n2. AT-RISK RULES — The taxpayer is at risk for the full amount of the loss under IRC §465.\n\n3. MATERIAL PARTICIPATION — The taxpayer satisfies material participation standards under Treas. Reg. §1.469-5T.\n\nComplete corporate returns (Form 1120-S) and K-1 schedules are available upon request.\n\nRespectfully submitted,` },
  ]
  const current = narratives[selected]
  const handleCopy = () => { navigator.clipboard.writeText(current.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: P, letterSpacing: '1px', marginBottom: 4 }}>AUDIT DEFENSE NARRATIVE</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>IRS Response Templates</h2>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>Plain-English IRS correspondence — review and edit before sending</div>
          </div>
          <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {narratives.map((n, i) => (
            <button key={i} onClick={() => { setSelected(i); setCopied(false) }} style={{ padding: '7px 14px', background: selected === i ? n.color : '#fff', color: selected === i ? '#fff' : SL, border: '1px solid ' + (selected === i ? n.color : '#E2E8F0'), borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              {n.title}
            </button>
          ))}
        </div>
        <div style={{ display: 'inline-block', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700, color: P, marginBottom: 14 }}>
          📋 {current.tag}
        </div>
        <div style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '20px 24px', marginBottom: 16, fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.85, color: N, whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>
          {current.text}
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button onClick={handleCopy} style={{ flex: 1, padding: '11px', background: copied ? G : P, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
          </button>
          <button onClick={() => window.print()} style={{ flex: 1, padding: '11px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>⚠️ Templates only — review with a licensed tax attorney before submitting to the IRS.</div>
      </div>
    </Modal>
  )
}

function UpgradeModal({ requiredPlan, onClose, nav }) {
  const isPro = requiredPlan === 'professional'
  const price = isPro ? '$149' : '$299'
  const planName = isPro ? 'Professional' : 'Enterprise'
  const color = isPro ? '#2563EB' : '#7C3AED'
  const features = isPro
    ? ['Real-Time Risk Alert Engine', 'What-If Tax Scenario Simulator', 'One-Click CPA Export Pack', 'Audit Red Flag Detector', 'Unlimited accounting integrations']
    : ['Everything in Professional', 'Multi-entity consolidated tax view', 'AI-Generated Audit Defense Narrative', 'Risk Tolerance Profiling', 'CPA Collaboration Portal']
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 460, width: '100%', padding: '36px 32px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '1px', marginBottom: 8 }}>UPGRADE REQUIRED</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B3E', margin: '0 0 8px' }}>Unlock {planName}</h2>
        <p style={{ fontSize: 14, color: '#475569', margin: '0 0 20px', lineHeight: 1.6 }}>This feature is available on the {planName} plan ({price}/mo).</p>
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
          {features.map(f => (
            <div key={f} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13, color: '#0D1B3E', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ color }}>✓</span> {f}
            </div>
          ))}
        </div>
        <button onClick={() => nav('/signup?plan=' + planName.toLowerCase())} style={{ width: '100%', padding: '13px', background: color, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>
          Upgrade to {planName} — {price}/mo
        </button>
        <button onClick={onClose} style={{ width: '100%', padding: '11px', background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          Maybe later
        </button>
      </div>
    </div>
  )
}

export default function AIAnalysis() {
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [showNarrative, setShowNarrative] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(null)
  const [showAlerts, setShowAlerts] = useState(false)

  const plan = (localStorage.getItem('plan') || 'starter').toLowerCase()
  const isPro = plan === 'professional' || plan === 'enterprise' || plan === 'pro' || plan === 'basic'
  const isEnterprise = plan === 'enterprise'

  // Load saved record for real calculations
  const email = localStorage.getItem('ts360_email') || 'default'
  const records = JSON.parse(localStorage.getItem('ts360_records_' + email) || localStorage.getItem('ts360_records') || '[]')
  const latestRecord = records[0] || null

  // Calculate real stats from user data
  const complianceScore = calcComplianceScore(latestRecord)
  const alerts = calcRiskAlerts(latestRecord)
  const highAlerts = alerts.filter(a => a.level === 'high')
  const hasData = !!latestRecord

  const totalActive = CATEGORIES.flatMap(c => c.features).filter(f => f.status === 'active').length
  const totalFeatures = CATEGORIES.flatMap(c => c.features).length

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {showUpgrade && <UpgradeModal requiredPlan={showUpgrade} onClose={() => setShowUpgrade(null)} nav={nav} />}
      {showReport && <ReportModal onClose={() => setShowReport(false)} record={latestRecord} />}
      {showSimulator && <SimulatorModal onClose={() => setShowSimulator(false)} record={latestRecord} />}
      {showNarrative && <NarrativeModal onClose={() => setShowNarrative(false)} />}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div onClick={() => nav('/dashboard')}><Logo /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/dashboard')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>📂 Dashboard</button>
          <button onClick={() => nav('/calculate-tax')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>Calculate Tax</button>
          <button style={{ padding: '7px 16px', background: B, color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>AI Analysis</button>
          <button onClick={() => nav('/settings')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>⚙ Settings</button>
          <button onClick={() => { ['token','plan','billing','ts360_session','ts360_email','userName','ts360_connected_app','ts360_quickbooks_token','ts360_quickbooks_connected','ts360_quickbooks_extra','ts360_xero_token','ts360_xero_connected','ts360_xero_refresh','ts360_wave_token','ts360_wave_connected','ts360_freshbooks_token','ts360_freshbooks_connected'].forEach(k=>localStorage.removeItem(k)); nav('/') }} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>Sign Out</button>
        </div>
      </nav>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['AI-BASED AUDIT & RISK PLANNER', 'US-SPECIFIC IRS COMPLIANCE', 'ADVANCED AI FEATURES'].map(t => (
              <span key={t} style={{ background: '#EFF6FF', color: B, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, padding: '4px 12px', borderRadius: 20 }}>{t}</span>
            ))}
          </div>
          <h1 style={{ color: N, fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>AI Risk & Compliance Planner</h1>
          <p style={{ color: SL, fontSize: 14, margin: 0 }}>{totalFeatures} AI-powered features for IRS, state, and federal compliance — designed for S-Corps, LLCs, Partnerships, and C-Corps.</p>
        </div>

        {/* No data warning */}
        {!hasData && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 20 }}>⚠️</div>
            <div>
              <div style={{ fontWeight: 700, color: '#92400E', fontSize: 14 }}>No saved records found</div>
              <div style={{ color: '#92400E', fontSize: 13 }}>Complete your business calculation and save a record to unlock personalized AI analysis and real risk alerts.</div>
            </div>
            <button onClick={() => nav('/dashboard')} style={{ marginLeft: 'auto', padding: '8px 16px', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Go to Dashboard →</button>
          </div>
        )}

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
          {[
            {
              label: 'Input Completeness',
              value: hasData ? (complianceScore + '%') : '—',
              sub: hasData ? 'Based on fields entered' : 'Save a record to calculate',
              color: G, bg: '#F0FDF4', border: '#BBF7D0'
            },
            {
              label: 'Active Features',
              value: totalActive + '/' + totalFeatures,
              sub: 'Available on your plan',
              color: B, bg: '#EFF6FF', border: '#BFDBFE'
            },
            {
              label: 'Risk Alerts',
              value: hasData ? String(alerts.length) : '—',
              sub: hasData ? (highAlerts.length > 0 ? highAlerts.length + ' high priority' : 'Review below') : 'Save a record to see alerts',
              color: alerts.length > 0 ? R : G, bg: alerts.length > 0 ? '#FEF2F2' : '#F0FDF4', border: alerts.length > 0 ? '#FECACA' : '#BBF7D0'
            },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: '1px solid ' + s.border, borderRadius: 12, padding: '20px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SL, letterSpacing: 0.8, marginBottom: 8 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: SL }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Risk alerts — real data */}
        {hasData && alerts.length > 0 && (
          <div style={{ background: highAlerts.length > 0 ? '#FEF2F2' : '#FFFBEB', border: '1px solid ' + (highAlerts.length > 0 ? '#FECACA' : '#FCD34D'), borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
            <div style={{ fontWeight: 700, color: highAlerts.length > 0 ? R : '#92400E', fontSize: 14, marginBottom: 10 }}>
              {highAlerts.length > 0 ? '🚨' : '⚠️'} {alerts.length} Alert{alerts.length !== 1 ? 's' : ''} Found — Based on Your Saved Record
            </div>
            {alerts.map((a, i) => (
              <div key={i} style={{ fontSize: 13, color: highAlerts.length > 0 ? '#991B1B' : '#78350F', padding: '5px 0', borderBottom: i < alerts.length - 1 ? '1px solid ' + (highAlerts.length > 0 ? '#FECACA' : '#FCD34D') : 'none', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: a.level === 'high' ? R : a.level === 'medium' ? '#D97706' : B, fontWeight: 700, flexShrink: 0 }}>
                  {a.level === 'high' ? '●' : a.level === 'medium' ? '◐' : '○'}
                </span>
                {a.text}
              </div>
            ))}
          </div>
        )}

        {/* Input completeness indicator */}
        {hasData && complianceScore && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, color: N, fontSize: 15 }}>Input Completeness Score</div>
                <div style={{ fontSize: 12, color: SL, marginTop: 2 }}>Fill in more fields on the Dashboard and Tax Return for a more accurate calculation</div>
              </div>
              <div style={{ fontWeight: 800, color: G, fontSize: 20 }}>{complianceScore}%</div>
            </div>
            <div style={{ height: 10, background: '#E2E8F0', borderRadius: 5, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ width: complianceScore + '%', height: '100%', background: 'linear-gradient(90deg,#059669,#34d399)', borderRadius: 5, transition: 'width 0.5s' }} />
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12, color: SL, flexWrap: 'wrap' }}>
              <span>{latestRecord?.biz?.grossRevenue ? '🟢' : '🔴'} Revenue entered</span>
              <span>{latestRecord?.biz?.entityType ? '🟢' : '🔴'} Entity type set</span>
              <span>{latestRecord?.f1040?.filingStatus ? '🟢' : '🔴'} Filing status set</span>
              <span>{latestRecord?.f1040?.w2Income ? '🟢' : '🟡'} W-2 income entered</span>
              <span>{latestRecord?.f1040?.estimatedPayments ? '🟢' : '🟡'} Estimated payments entered</span>
            </div>
          </div>
        )}

        {/* Feature tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c, i) => (
            <button key={c.label} onClick={() => setActiveTab(i)} style={{ padding: '8px 18px', background: activeTab === i ? c.color : '#fff', color: activeTab === i ? '#fff' : SL, border: '1px solid ' + (activeTab === i ? c.color : '#E2E8F0'), borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 32 }}>
          {CATEGORIES[activeTab].features.map(f => (
            <div key={f.n} style={{ background: '#fff', border: '1px solid ' + (f.status === 'coming' ? '#F1F5F9' : '#E2E8F0'), borderRadius: 12, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', opacity: f.status === 'coming' ? 0.7 : 1 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: f.status === 'coming' ? '#94A3B8' : CATEGORIES[activeTab].color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{f.n}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontWeight: 700, color: N, fontSize: 14 }}>{f.t}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: f.status === 'active' ? '#F0FDF4' : '#F8FAFC', color: f.status === 'active' ? '#15803D' : '#64748b', border: '1px solid ' + (f.status === 'active' ? '#BBF7D0' : '#E2E8F0') }}>
                    {f.status === 'active' ? 'ACTIVE' : 'ROADMAP'}
                  </span>
                </div>
                <div style={{ color: SL, fontSize: 13, lineHeight: 1.5 }}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { icon: '📋', title: 'Generate CPA Export Pack', desc: 'A print-ready report with your financials, AI insights, and risk alerts — ready for your accountant.', btn: 'Generate Report', color: B, action: () => setShowReport(true) },
            { icon: '🎯', title: 'Run What-If Simulator', desc: 'Model salary changes, new deductions, or retirement contributions to see the tax impact before making decisions.', btn: 'Open Simulator', color: G, action: () => setShowSimulator(true) },
            { icon: '🛡️', title: 'View Audit Defense Narrative', desc: 'Plain-English IRS response templates for REP status, S-Corp salary, and K-1 losses. Review with your CPA before sending.', btn: 'View Narrative', color: P, action: () => isEnterprise ? setShowNarrative(true) : setShowUpgrade('enterprise') },
          ].map(a => (
            <div key={a.title} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{a.icon}</div>
              <div style={{ fontWeight: 700, color: N, fontSize: 15, marginBottom: 6 }}>{a.title}</div>
              <div style={{ color: SL, fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>{a.desc}</div>
              <button onClick={a.action} style={{ padding: '11px 20px', background: a.color, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', width: '100%' }}>
                {a.btn}
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 32, padding: '16px 20px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12, color: SL, textAlign: 'center', lineHeight: 1.6 }}>
          ⚠️ TaxStat360 AI Analysis is for planning and estimation purposes only. Results are based on the data you enter and may not reflect your complete tax picture. Consult a licensed CPA or tax professional before making filing or financial decisions.
        </div>
      </div>
    </div>
  )
}
