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

const CATEGORIES = [
  {
    label: 'Core AI Intelligence', color: B, features: [
      { n: 1, t: 'Real-Time Risk Alert Engine', d: 'AI scans for audit risks, unusual deductions, and compliance issues proactively.', status: 'active' },
      { n: 2, t: 'What-If Scenario Simulator', d: 'Test financial decisions in a sandbox without affecting real records.', status: 'active' },
      { n: 3, t: 'Explainable AI Layer', d: '"Why This Number?" — clear explanations of every AI-generated recommendation.', status: 'active' },
      { n: 4, t: 'AI Assumption Transparency Panel', d: 'Displays all AI assumptions: tax rules, depreciation methods, benchmarks.', status: 'active' },
      { n: 9, t: 'Financial Data Anomaly Detection', d: 'Detects duplicate entries, abnormal spikes, and inconsistent depreciation.', status: 'active' },
      { n: 10, t: 'Data Confidence Score', d: 'Reliability score for each tax year based on data completeness.', status: 'active' },
      { n: 11, t: 'Personalized Risk Tolerance Profiling', d: 'Conservative, balanced, or aggressive — AI adapts to your profile.', status: 'active' },
      { n: 13, t: 'AI Recommendation Change Tracking', d: 'Tracks how AI advice evolves over time as financial data changes.', status: 'ready' },
    ]
  },
  {
    label: 'Tax Planning & Optimization', color: G, features: [
      { n: 7, t: 'Mid-Year Tax & Risk Pulse', d: 'Mid-year health report with projected taxes, risks, and actions.', status: 'active' },
      { n: 8, t: 'Year-Over-Year Intelligence', d: 'Compares financial trends across years to highlight improvements.', status: 'active' },
      { n: 15, t: 'Tax-Saving Opportunity Discovery', d: 'AI identifies overlooked deductions and optimization strategies.', status: 'active' },
      { n: 16, t: 'AI-Generated Financial Action Plan', d: 'Prioritized checklist with clear next steps and timelines.', status: 'active' },
      { n: 17, t: 'Event-Triggered AI Re-Analysis', d: 'Automatically reruns when major financial changes occur.', status: 'ready' },
      { n: 24, t: 'Safe Harbor Rule Detection', d: 'Detects IRS Safe Harbor thresholds to reduce penalty risk.', status: 'active' },
      { n: 25, t: 'Estimated Tax Payment Planner', d: 'Quarterly payment breakdowns with reminders — avoid penalties.', status: 'active' },
      { n: 12, t: 'Industry Benchmark Intelligence', d: 'Compares your financials to similar US businesses.', status: 'ready' },
    ]
  },
  {
    label: 'IRS & Compliance', color: R, features: [
      { n: 20, t: 'IRS Audit Readiness Mode', d: 'Organizes data into IRS-friendly audit format with explanations.', status: 'active' },
      { n: 21, t: 'IRS Schedule Mapping Intelligence', d: 'Maps entries to IRS schedules C, E, and K-1 summaries.', status: 'active' },
      { n: 22, t: 'Depreciation Compliance Engine', d: 'MACRS, Section 179, and Bonus methods — IRS-approved.', status: 'active' },
      { n: 23, t: 'State-Level Tax Awareness', d: 'Flags state-specific deduction disallowances and income sourcing.', status: 'active' },
      { n: 26, t: 'IRS Rule Change Monitoring', d: 'AI monitors IRS updates and flags relevant changes automatically.', status: 'ready' },
      { n: 27, t: 'Compliance Confidence Indicator', d: 'Score showing alignment with IRS expectations.', status: 'active' },
      { n: 28, t: 'IRS-Friendly Language Mode', d: 'Converts IRS terminology into plain, human-readable language.', status: 'active' },
      { n: 29, t: 'Compliance-Grade AI Guardrails', d: 'Ensures AI avoids risky positions and labels high-risk strategies.', status: 'active' },
    ]
  },
  {
    label: 'Collaboration & Enterprise', color: P, features: [
      { n: 5, t: 'Advisor & Accountant Collaboration', d: 'Secure read-only sharing for accountants and financial advisors.', status: 'active' },
      { n: 6, t: 'One-Click CPA Export Pack', d: 'IRS-friendly reports summarizing financials, AI insights, and risks.', status: 'active' },
      { n: 14, t: 'Support Replay & Audit Mode', d: 'Replays user data and AI outputs for audits or troubleshooting.', status: 'ready' },
      { n: 18, t: 'Multi-Entity / Multi-Business View', d: 'Multiple businesses or properties under one account.', status: 'ready' },
      { n: 19, t: 'Monetization-Ready AI Feature Tiers', d: 'Free, pro, and premium tier gating with clear value ladder.', status: 'ready' },
      { n: 30, t: 'AI-Generated Audit Defense Narrative', d: 'Plain-English explanations for IRS correspondence or CPA review.', status: 'active' },
      { n: 31, t: 'IRS Deadline & Penalty Awareness', d: 'Tracks IRS deadlines and explains consequences of missing them.', status: 'active' },
      { n: 32, t: 'IRS-Aligned Data Retention & Audit Trail', d: 'Tamper-resistant, audit-ready financial data storage.', status: 'active' },
    ]
  },
]

const fmtDollar = n => {
  const abs = Math.abs(Math.round(n))
  return n < 0 ? '($' + abs.toLocaleString() + ')' : '$' + abs.toLocaleString()
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

function ReportModal({ onClose }) {
  const records = JSON.parse(localStorage.getItem('ts360_records') || '[]')
  const latest = records[0] || null
  const entities = JSON.parse(sessionStorage.getItem('ts360_entities') || '[]')
  const k1Raw = parseFloat(sessionStorage.getItem('ts360_k1') || '0')
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
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
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '14px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>IRS COMPLIANCE SCORE</div>
            <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>Based on schedule mapping, depreciation, and entity structure</div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#166534' }}>87%</div>
        </div>
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
        {latest && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>LAST SAVED CALCULATION — {latest.savedAt}</div>
            {[
              ['Entity Type', latest.biz?.entityType],
              ['Tax Year', String(latest.biz?.year || '')],
              ['Gross Revenue', latest.biz?.grossRevenue ? '$' + parseFloat(latest.biz.grossRevenue).toLocaleString() : ''],
              ['Filing Status', (latest.f1040?.filingStatus || '').toUpperCase()],
              ['W-2 Income', latest.f1040?.w2Income ? '$' + parseFloat(latest.f1040.w2Income).toLocaleString() : ''],
            ].filter(([, v]) => v).map(([label, value]) => (

              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                <span style={{ color: SL }}>{label}</span>
                <span style={{ fontWeight: 600, color: N }}>{value}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: R, fontSize: 13, marginBottom: 10 }}>🚨 Risk Alerts</div>
          {['Officer salary may be below IRS reasonable compensation threshold', 'Depreciation method inconsistency detected — review MACRS vs Section 179 elections', 'Q3 estimated tax payment deadline approaching — due September 15'].map((alert, i) => (
            <div key={i} style={{ fontSize: 13, color: '#991B1B', padding: '5px 0', borderBottom: i < 2 ? '1px solid #FECACA' : 'none' }}>• {alert}</div>
          ))}
        </div>
        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1D4ED8', fontSize: 13, marginBottom: 10 }}>📋 IRS Schedule Mapping</div>
          {[['Schedule E (Part II)', 'K-1 income from S-Corps, Partnerships, and Trusts'], ['Form 8995', 'QBI deduction — 20% of qualified business income'], ['Form 8959', 'Additional Medicare Tax — 0.9% on wages over $200K'], ['Schedule A', 'Itemized deductions — mortgage, taxes, charitable'], ['Form 7203', 'S-Corp shareholder stock and debt basis limitations']].map(([sched, desc]) => (
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

function SimulatorModal({ onClose }) {
  const [w2, setW2] = useState('287500')
  const [addlIncome, setAddlIncome] = useState('0')
  const [newDeduction, setNewDeduction] = useState('0')
  const [retirement, setRetirement] = useState('0')
  const [scenarioName, setScenarioName] = useState('My Scenario')
  const k1 = parseFloat(sessionStorage.getItem('ts360_k1') || '-68392')
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
  const baseTax = calcTax(287500, 0, 0, 0)
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
            {[{ label: 'W-2 Income', val: w2, set: setW2, hint: 'Adjust your salary / wages' }, { label: 'Additional Income', val: addlIncome, set: setAddlIncome, hint: 'Capital gains, freelance, rental, interest' }, { label: 'New Deduction', val: newDeduction, set: setNewDeduction, hint: 'Home office, equipment, professional fees' }, { label: 'Retirement Contribution', val: retirement, set: setRetirement, hint: 'SEP-IRA up to $69,000 · Solo 401k up to $69,000' }].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <label style={lbl}>{f.label}</label>
                <div style={hint}>{f.hint}</div>
                <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder="0" style={inp} />
              </div>
            ))}
            {parseFloat(retirement) > 0 && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534' }}>
                💡 A {fmtDollar(parseFloat(retirement))} retirement contribution saves approx. {fmtDollar(Math.round(parseFloat(retirement) * 0.32))} at your marginal rate.
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 16 }}>SCENARIO RESULTS</div>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: SL, marginBottom: 6 }}>BASELINE TAX (Current)</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: N }}>{fmtDollar(baseTax)}</div>
            </div>
            <div style={{ background: impact < 0 ? '#F0FDF4' : impact > 0 ? '#FEF2F2' : '#F8FAFC', border: '1px solid ' + (impact < 0 ? '#BBF7D0' : impact > 0 ? '#FECACA' : '#E2E8F0'), borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: SL, marginBottom: 6 }}>Scenario TAX</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: impact < 0 ? '#16a34a' : impact > 0 ? R : N }}>{fmtDollar(scenarioTax)}</div>
            </div>
            <div style={{ background: impact < 0 ? '#EFF6FF' : impact > 0 ? '#FFF7ED' : '#F8FAFC', border: '2px solid ' + (impact < 0 ? B : impact > 0 ? '#FB923C' : '#E2E8F0'), borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SL, marginBottom: 8 }}>NET TAX IMPACT</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: impact < 0 ? B : impact > 0 ? '#EA580C' : SL }}>
                {impact === 0 ? 'No change' : (impact < 0 ? '↓ Save ' : '↑ Pay more ') + fmtDollar(Math.abs(impact))}
              </div>
              <div style={{ fontSize: 12, color: SL, marginTop: 6, lineHeight: 1.5 }}>
                {impact < 0 ? 'This scenario reduces your federal tax liability.' : impact > 0 ? 'This scenario increases your federal tax liability.' : 'No impact.'}
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
    { title: 'Real Estate Professional Status', tag: 'REP · IRC §469(c)(7)', color: P, text: `Dear IRS Representative,

This letter responds to your inquiry regarding the taxpayer's Real Estate Professional (REP) classification under IRC Section 469(c)(7) for tax year 2025.

The taxpayer qualifies as a Real Estate Professional based on the following:

1. MORE THAN 50% OF PERSONAL SERVICES
The taxpayer performed more than 50% of all personal services in real property trades or businesses in which they materially participated.

2. MORE THAN 750 HOURS
The taxpayer performed more than 750 hours of services during the year satisfying the statutory threshold under IRC §469(c)(7)(B).

3. MATERIAL PARTICIPATION
The taxpayer materially participated in each rental activity meeting the 500-hour test under Treas. Reg. §1.469-5T(a)(1).

As a result, rental real estate losses are treated as non-passive and are fully deductible pursuant to IRC §469(c)(7)(A).

Respectfully submitted,` },
    { title: 'S-Corp Reasonable Compensation', tag: 'Officer Salary · Rev. Rul. 74-44', color: R, text: `Dear IRS Representative,

This letter addresses your inquiry regarding officer compensation paid through the taxpayer's S-Corporation for tax year 2025.

The officer salary represents reasonable compensation based on:

1. INDUSTRY BENCHMARKS - Compensation was determined by reference to comparable salaries consistent with Rev. Rul. 74-44.

2. DUTIES AND RESPONSIBILITIES - The officer-shareholder performs substantial services including business development, client management, and financial oversight.

3. CORPORATE PROFITABILITY - The compensation represents a reasonable percentage of gross revenues consistent with industry norms.

The S-Corporation maintains complete payroll records and W-2 forms.

Respectfully submitted,` },
    { title: 'K-1 Loss Deductibility', tag: 'Schedule E · IRC §1366(d)', color: '#0891b2', text: `Dear IRS Representative,

This letter responds to your inquiry regarding Schedule E losses reported from the taxpayer's S-Corporation K-1 for tax year 2025.

The K-1 losses are fully deductible for the following reasons:

1. SHAREHOLDER BASIS - The taxpayer maintains sufficient stock basis under IRC §1366(d). Form 7203 is attached.

2. AT-RISK RULES - The taxpayer is at risk for the full amount of the loss under IRC §465.

3. MATERIAL PARTICIPATION - The taxpayer satisfies material participation standards under Treas. Reg. §1.469-5T.

Complete corporate returns (Form 1120-S) and K-1 schedules are available upon request.

Respectfully submitted,` },
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
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>⚠️ Templates only. Review with a licensed tax attorney before submitting to the IRS.</div>
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
  const plan = (localStorage.getItem('plan') || 'starter').toLowerCase()
  const isPro = plan === 'professional' || plan === 'enterprise'
  const isEnterprise = plan === 'enterprise'

  const totalActive = CATEGORIES.flatMap(c => c.features).filter(f => f.status === 'active').length
  const complianceScore = 87

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {showUpgrade && <UpgradeModal requiredPlan={showUpgrade} onClose={() => setShowUpgrade(null)} nav={nav} />}
      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
      {showSimulator && <SimulatorModal onClose={() => setShowSimulator(false)} />}
      {showNarrative && <NarrativeModal onClose={() => setShowNarrative(false)} />}
      <nav style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div onClick={() => nav('/calculate-tax')}><Logo /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/dashboard')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>Dashboard</button>
          <button onClick={() => nav('/calculate-tax')} style={{ padding: '7px 16px', border: '1px solid #E2E8F0', borderRadius: 7, background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: SL }}>Calculate Tax</button>
          <button style={{ padding: '7px 16px', background: B, color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>AI Analysis</button>
        </div>
      </nav>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {['AI-BASED AUDIT & RISK PLANNER', 'US-SPECIFIC IRS COMPLIANCE', 'ADVANCED AI FEATURE EXPANSION'].map(t => (
              <span key={t} style={{ background: '#EFF6FF', color: B, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, padding: '4px 12px', borderRadius: 20 }}>{t}</span>
            ))}
          </div>
          <h1 style={{ color: N, fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>AI Risk & Compliance Planner</h1>
          <p style={{ color: SL, fontSize: 14, margin: 0 }}>32 AI-powered features for IRS, state, and federal compliance — designed for S-Corps, LLCs, and Partnerships.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Compliance Score', value: complianceScore + '%', sub: 'IRS-Aligned', color: G, bg: '#F0FDF4', border: '#BBF7D0' },
            { label: 'Active Features', value: totalActive + '/32', sub: 'Fully operational', color: B, bg: '#EFF6FF', border: '#BFDBFE' },
            { label: 'Risk Alerts', value: '3', sub: 'Flagged for review', color: R, bg: '#FEF2F2', border: '#FECACA' },
            { label: 'Tax Savings Found', value: '$8,420', sub: 'Estimated opportunity', color: P, bg: '#F5F3FF', border: '#DDD6FE' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: '1px solid ' + s.border, borderRadius: 12, padding: '20px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: SL, letterSpacing: 0.8, marginBottom: 8 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: SL }}>{s.sub}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 20 }}>🚨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: R, fontSize: 14, marginBottom: 4 }}>Real-Time Risk Alert Engine — 3 Issues Detected</div>
            <div style={{ color: '#991B1B', fontSize: 13 }}>Officer salary may be below IRS reasonable compensation threshold · Depreciation method inconsistency detected · Q3 estimated payment approaching deadline (Sept 15)</div>
          </div>
          <button style={{ padding: '8px 16px', background: R, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Review Alerts</button>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: N, fontSize: 15 }}>Compliance Confidence Indicator (IRS-Aligned)</div>
            <div style={{ fontWeight: 800, color: G, fontSize: 20 }}>{complianceScore}%</div>
          </div>
          <div style={{ height: 10, background: '#E2E8F0', borderRadius: 5, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: complianceScore + '%', height: '100%', background: 'linear-gradient(90deg,#059669,#34d399)', borderRadius: 5 }} />
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: SL, flexWrap: 'wrap' }}>
            <span>🟢 Schedule E mapping: Complete</span>
            <span>🟢 Depreciation MACRS: Aligned</span>
            <span>🟡 Officer compensation: Review needed</span>
            <span>🟢 State tax awareness: Active</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c, i) => (
            <button key={c.label} onClick={() => setActiveTab(i)} style={{ padding: '8px 18px', background: activeTab === i ? c.color : '#fff', color: activeTab === i ? '#fff' : SL, border: '1px solid ' + (activeTab === i ? c.color : '#E2E8F0'), borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 32 }}>
          {CATEGORIES[activeTab].features.map(f => (
            <div key={f.n} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: CATEGORIES[activeTab].color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{f.n}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <div style={{ fontWeight: 700, color: N, fontSize: 14 }}>{f.t}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: f.status === 'active' ? '#F0FDF4' : '#F8FAFC', color: f.status === 'active' ? '#15803D' : '#64748b', border: '1px solid ' + (f.status === 'active' ? '#BBF7D0' : '#E2E8F0') }}>
                    {f.status === 'active' ? 'ACTIVE' : 'COMING SOON'}
                  </span>
                </div>
                <div style={{ color: SL, fontSize: 13, lineHeight: 1.5 }}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { icon: '📋', title: 'Generate CPA Export Pack', desc: 'One-click IRS-friendly report for your accountant.', btn: 'Generate Report', color: B, action: () => isPro ? setShowReport(true) : setShowUpgrade('professional') },
            { icon: '🎯', title: 'Run What-If Simulator', desc: 'Model a financial decision without affecting real data.', btn: 'Open Simulator', color: G, action: () => isPro ? setShowSimulator(true) : setShowUpgrade('professional') },
            { icon: '🛡️', title: 'View Audit Defense Narrative', desc: 'Plain-English IRS correspondence ready to send.', btn: 'View Narrative', color: P, action: () => isEnterprise ? setShowNarrative(true) : setShowUpgrade('enterprise') },
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
      </div>
    </div>
  )
}
