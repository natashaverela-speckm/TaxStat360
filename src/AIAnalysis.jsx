import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'
const G = '#059669'
const R = '#DC2626'
const P = '#7C3AED'
const O = '#D97706'

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

const fmt = n => n < 0 ? '($' + Math.abs(Math.round(n)).toLocaleString() + ')' : '$' + Math.abs(Math.round(n)).toLocaleString()
const pct = n => (parseFloat(n) || 0).toFixed(1) + '%'

// ── Data helpers ─────────────────────────────────────────────────────────────
function getRecord() {
  const email = localStorage.getItem('ts360_email') || 'default'
  const recs = JSON.parse(
    localStorage.getItem('ts360_records_' + email) ||
    localStorage.getItem('ts360_records') || '[]'
  )
  return recs[0] || null
}

function completeness(rec) {
  if (!rec) return 0
  let s = 30
  const b = rec.biz || {}, f = rec.f1040 || {}
  if (parseFloat(b.grossRevenue) > 0) s += 15
  if (b.entityType) s += 10
  if (f.filingStatus) s += 10
  if (parseFloat(f.w2Income) > 0) s += 10
  if (parseFloat(b.officerSalary) > 0) s += 5
  if (parseFloat(b.operatingExpenses) > 0) s += 5
  if (parseFloat(b.depreciation) > 0) s += 5
  if (parseFloat(f.estimatedPayments) > 0) s += 10
  return Math.min(s, 98)
}

// ── TAB 1: Risk Scan ─────────────────────────────────────────────────────────
function RiskScan({ rec }) {
  if (!rec) return <NoData />
  const b = rec.biz || {}, f = rec.f1040 || {}
  const revenue = parseFloat(b.grossRevenue) || 0
  const officerSal = parseFloat(b.officerSalary) || 0
  const k1 = parseFloat(rec.k1Income) || 0
  const w2 = parseFloat(f.w2Income) || 0
  const estPay = parseFloat(f.estimatedPayments) || 0
  const dep = parseFloat(b.depreciation) || 0
  const rentalIncome = parseFloat(b.rentalIncome || 0) || parseFloat(f.rentalIncome || 0) || 0
  const isREP = !!(b.isREP || f.isREP || rec.isREP)
  const totalIncome = k1 + w2
  const today = new Date()
  const month = today.getMonth() + 1
  const deadlines = { 1:'April 15',2:'April 15',3:'April 15',4:'April 15',5:'June 16',6:'June 16',7:'September 15',8:'September 15',9:'September 15',10:'January 15',11:'January 15',12:'January 15' }

  const findings = []

  // ── S-Corp salary check ──────────────────────────────────────────────────────
  if (b.entityType === 'S-Corporation') {
    if (officerSal === 0 && k1 > 20000) {
      findings.push({ level: 'high', icon: '🚨', title: 'No Officer Salary — Audit Risk',
        detail: `You have ${fmt(k1)} in K-1 income but no officer salary recorded. The IRS requires S-Corp owner-operators to pay themselves a "reasonable" W-2 salary. Skipping this is one of the most common S-Corp audit triggers.`,
        action: 'Set an officer salary of at least 35–40% of net profit. This is deductible to the S-Corp and reduces self-employment tax exposure.' })
    } else if (officerSal > 0 && k1 > 30000 && officerSal < k1 * 0.3) {
      findings.push({ level: 'medium', icon: '⚠️', title: 'Officer Salary May Be Too Low',
        detail: `Your officer salary is ${fmt(officerSal)} versus K-1 income of ${fmt(k1)}. The IRS benchmarks "reasonable compensation" typically at 30–40% of net profit for owner-operators.`,
        action: `Consider increasing your salary to at least ${fmt(Math.round(k1 * 0.35))} to align with IRS reasonable compensation guidelines.` })
    } else if (officerSal > 0) {
      findings.push({ level: 'good', icon: '✅', title: 'Officer Salary Recorded',
        detail: `Officer salary of ${fmt(officerSal)} is on file. Ensure payroll taxes (FICA) are being withheld and remitted quarterly.`,
        action: null })
    }
  }

  // ── Estimated payments ───────────────────────────────────────────────────────
  if (k1 > 5000 && estPay === 0) {
    findings.push({ level: 'high', icon: '🚨', title: 'No Estimated Tax Payments — Penalty Risk',
      detail: `With ${fmt(k1)} in K-1 income, you are likely required to make quarterly estimated payments. Failure to pay results in IRS underpayment penalties (currently ~8% annually).`,
      action: `Estimated quarterly payment: approx. ${fmt(Math.round(k1 * 0.25 / 4))}. Due dates: April 15, June 16, September 15, January 15.` })
  } else if (estPay > 0) {
    findings.push({ level: 'good', icon: '✅', title: 'Estimated Payments Recorded',
      detail: `${fmt(estPay)} in estimated payments on file. Next quarterly deadline: ${deadlines[month]}.`,
      action: null })
  }

  // ── Depreciation opportunity ─────────────────────────────────────────────────
  if (revenue > 50000 && dep === 0) {
    findings.push({ level: 'medium', icon: '⚠️', title: 'No Depreciation Recorded',
      detail: 'Businesses with equipment, vehicles, computers, or property can deduct depreciation — often reducing taxable income significantly.',
      action: 'If you own any business assets, enter depreciation under Section 179 (full first-year deduction) or MACRS. A $20,000 asset could reduce your tax by $4,400+ at the 22% bracket.' })
  }

  // ── QBI deduction ────────────────────────────────────────────────────────────
  if (['S-Corporation','Partnership','Multi-Member LLC','Single-Member LLC','Sole Proprietor'].includes(b.entityType) && k1 > 10000) {
    const qbi = Math.round(k1 * 0.20)
    findings.push({ level: 'good', icon: '✅', title: `QBI Deduction Applied — ${fmt(qbi)} Saved`,
      detail: `The 20% Qualified Business Income deduction (IRC §199A) is automatically applied to your K-1 income. This reduced your taxable income by ${fmt(qbi)}.`,
      action: 'QBI phases out above $197,300 (single) or $394,600 (MFJ) in 2025. For W-2 wage businesses above these thresholds, the deduction may be limited.' })
  }

  // ── C-Corp double tax ────────────────────────────────────────────────────────
  if (b.entityType === 'C-Corporation' && revenue > 0) {
    findings.push({ level: 'medium', icon: '💡', title: 'C-Corp Double Taxation',
      detail: 'C-Corp profits are taxed at 21% at the entity level. Dividends distributed to you are then taxed again at qualified dividend rates (0–20%) on your personal return.',
      action: 'Consider whether an S-Corp election would eliminate entity-level tax. An S-Corp with the same income passes profits directly to your personal return, avoiding the 21% corporate tax.' })
  }

  // ── Large tax liability — advertising & Section 179 ──────────────────────────
  const roughTax = Math.round(Math.max(0, totalIncome - 15750) * 0.22)
  if (roughTax > 10000) {
    findings.push({ level: 'medium', icon: '📢', title: 'Advertising & Marketing — Fully Deductible (IRC §162)',
      detail: `With an estimated tax liability of ${fmt(roughTax)}+, investing in business advertising reduces your taxable income dollar-for-dollar. Advertising spend is 100% deductible as an ordinary and necessary business expense.`,
      action: 'Increase advertising, marketing, or business development spend before year-end. Digital ads, print, sponsorships, and website costs all qualify. Document all expenses with receipts and business purpose.' })
    findings.push({ level: 'medium', icon: '🔧', title: 'Equipment & Tools — Section 179 / Bonus Depreciation',
      detail: 'Section 179 lets you deduct the full cost of qualifying business equipment, tools, machinery, vehicles, and technology in the year of purchase — up to $1.16M in 2025. Bonus depreciation (currently 60% in 2025) applies to new and used property.',
      action: `Qualifying purchases include computers, phones, machinery, office furniture, and business vehicles (with limits). Must be placed in service before December 31. At your income level, ${fmt(Math.round(roughTax / 0.22))} in equipment purchases could offset your estimated tax liability. Consult a CPA to confirm eligibility.` })
  }

  // ── Real Estate Professional (REP) ──────────────────────────────────────────
  if (rentalIncome > 0 || isREP) {
    if (isREP) {
      findings.push({ level: 'info', icon: '🏠', title: 'Real Estate Professional — Criteria Checklist',
        detail: 'You have REP status selected. Under IRC §469(c)(7), you must meet ALL three tests each tax year to deduct rental losses without limitation:',
        action: '① MORE THAN 750 HOURS in real property trades or businesses — of which MORE THAN 500 hours must be in activities where you materially participate.\n\n② MORE THAN 50% of your total personal service time across all work must be in real estate activities.\n\n③ ⚠️ IMPORTANT: If you have a full-time W-2 job, qualifying as a REP is extremely difficult. The IRS scrutinizes this heavily. Document your time with contemporaneous daily logs. Without proper documentation, REP status will likely be disallowed on audit.' })
    } else {
      findings.push({ level: 'info', icon: '🏠', title: 'Rental Income Detected — REP Status Could Unlock Full Deductions',
        detail: 'Rental losses are normally "passive" and can only offset other passive income. Qualifying as a Real Estate Professional makes your rental losses fully deductible against all income — including W-2 wages and business income.',
        action: 'To qualify as a REP you must meet ALL of these each year:\n\n① More than 750 hours in real property trades or businesses — of which 500+ must be in activities where you materially participate.\n\n② More than 50% of your total working hours across ALL jobs must be in real estate.\n\n⚠️ If you have a full-time W-2 job, qualifying is very difficult. Most full-time W-2 earners cannot meet the 50% test. If you believe you qualify, check the REP box on the Tax Return page and maintain detailed daily time logs.' })
    }
  }

  // ── Next quarterly deadline ──────────────────────────────────────────────────
  findings.push({ level: 'info', icon: '📅', title: `Next Quarterly Deadline: ${deadlines[month]}`,
    detail: 'IRS Form 1040-ES quarterly estimated tax payment due date.',
    action: estPay > 0
      ? `Your recorded payments total ${fmt(estPay)}. Verify this covers 90% of current year tax or 100% of prior year tax to avoid penalties.`
      : 'If you have self-employment or business income, you likely owe quarterly payments. Underpayment incurs penalties at the current IRS rate.' })

  const levelOrder = { high: 0, medium: 1, info: 2, good: 3 }
  findings.sort((a, b) => levelOrder[a.level] - levelOrder[b.level])

  const colors = {
    high:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', badge: '#DC2626' },
    medium: { bg: '#FFFBEB', border: '#FDE68A', text: '#78350F', badge: '#D97706' },
    info:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF', badge: '#2563EB' },
    good:   { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534', badge: '#059669' },
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>AI Risk Scan Results</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Based on your saved record. These findings are specific to your situation.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {findings.map((f, i) => {
          const c = colors[f.level]
          return (
            <div key={i} style={{ background: c.bg, border: '1px solid ' + c.border, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{f.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: c.text, fontSize: 14, marginBottom: 6 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: c.text, lineHeight: 1.6, marginBottom: f.action ? 8 : 0 }}>{f.detail}</div>
                  {f.action && (
                    <div style={{ fontSize: 12, color: c.text, background: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '8px 12px', borderLeft: '3px solid ' + c.badge, whiteSpace: 'pre-line' }}>
                      <strong>What to do:</strong> {f.action}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ── TAB 2: Tax Optimization ──────────────────────────────────────────────────
function TaxOptimization({ rec }) {
  if (!rec) return <NoData />
  const b = rec.biz || {}, f = rec.f1040 || {}
  const revenue = parseFloat(b.grossRevenue) || 0
  const opExp = parseFloat(b.operatingExpenses) || 0
  const dep = parseFloat(b.depreciation) || 0
  const officerSal = parseFloat(b.officerSalary) || 0
  const k1 = parseFloat(rec.k1Income) || 0
  const w2 = parseFloat(f.w2Income) || 0
  const estPay = parseFloat(f.estimatedPayments) || 0
  const year = parseInt(b.year) || 2025
  const isPassthrough = ['S-Corporation','Partnership','Multi-Member LLC','Single-Member LLC','Sole Proprietor'].includes(b.entityType)

  // 2025 brackets (single, simplified)
  const brackets = [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]]
  const agi = Math.max(0, k1 + w2)
  const stdDed = 15750
  const taxable = Math.max(0, agi - stdDed)
  let marginalRate = 0.10, prev = 0
  for (const [cap, rate] of brackets) { if (taxable > prev) marginalRate = rate; prev = cap }

  const opportunities = []

  // SEP-IRA
  const maxSEP = Math.min(69000, Math.round((k1 + w2) * 0.25))
  if (maxSEP > 0 && isPassthrough) {
    const taxSaved = Math.round(maxSEP * marginalRate)
    opportunities.push({
      icon: '🏦', title: 'SEP-IRA or Solo 401(k)', priority: 'high',
      saving: taxSaved,
      detail: `You can contribute up to ${fmt(maxSEP)} (25% of net self-employment income, max $69,000) to a SEP-IRA. This reduces your AGI dollar-for-dollar.`,
      howTo: `At your marginal rate of ${pct(marginalRate * 100)}, a max SEP-IRA contribution saves approx. ${fmt(taxSaved)} in federal tax. Open at any major brokerage (Fidelity, Schwab, Vanguard). Deadline: your tax filing date including extensions.`
    })
  }

  // Section 179 / Depreciation
  if (revenue > 30000 && dep === 0) {
    const est179 = Math.round(revenue * 0.05) // rough estimate of potential assets
    const taxSaved = Math.round(est179 * marginalRate)
    opportunities.push({
      icon: '🏗️', title: 'Section 179 Equipment Deduction', priority: 'medium',
      saving: null,
      detail: 'Section 179 lets you deduct the full cost of qualifying equipment, vehicles, and business property in the year of purchase (up to $1.16M in 2025).',
      howTo: 'If you purchased any computers, phones, furniture, vehicles, or equipment for the business this year — even partially — enter the cost under Depreciation. The deduction can be substantial.'
    })
  }

  // Home office
  opportunities.push({
    icon: '🏠', title: 'Home Office Deduction', priority: 'medium',
    saving: null,
    detail: 'If you use a portion of your home exclusively and regularly for business, you can deduct either $5 per sq ft (simplified, up to 300 sq ft = $1,500 max) or actual expenses proportional to office size.',
    howTo: 'The space must be used exclusively for business. Calculate your home office percentage (office sq ft ÷ total home sq ft) and apply to rent/mortgage interest, utilities, and insurance. Claim on Schedule C or as an S-Corp expense.'
  })

  // Reasonable salary optimization for S-Corps
  if (b.entityType === 'S-Corporation' && officerSal > 0 && k1 > 50000) {
    const seTaxSaved = Math.round((k1 - officerSal) * 0.0765 * 2) // employer+employee FICA avoided on distributions
    if (seTaxSaved > 1000) {
      opportunities.push({
        icon: '💼', title: 'S-Corp Salary vs. Distribution Split', priority: 'high',
        saving: seTaxSaved,
        detail: `Your S-Corp structure already saves FICA taxes on the ${fmt(k1)} distributed as K-1 (vs. a sole prop where all income is subject to SE tax). Distributions above your officer salary avoid 15.3% self-employment tax.`,
        howTo: `Estimated FICA savings from K-1 vs. W-2 structure: ~${fmt(seTaxSaved)}. Maintain documentation showing salary is reasonable for your role. Avoid setting salary too low — IRS minimum guidance is typically 35–40% of net profit.`
      })
    }
  }

  // HSA
  opportunities.push({
    icon: '🏥', title: 'Health Savings Account (HSA)', priority: 'medium',
    saving: Math.round(4300 * marginalRate),
    detail: `If you have a High-Deductible Health Plan (HDHP), you can contribute up to $4,300 (self-only) or $8,550 (family) to an HSA in 2025. Contributions are tax-deductible and grow tax-free.`,
    howTo: `At your rate of ${pct(marginalRate * 100)}, a max HSA contribution saves approx. ${fmt(Math.round(4300 * marginalRate))}. Funds roll over each year and can be invested. Withdrawals for medical expenses are always tax-free.`
  })

  // Augusta Rule (if S-Corp)
  if (b.entityType === 'S-Corporation' && revenue > 0) {
    opportunities.push({
      icon: '🏡', title: 'Augusta Rule — IRC §280A(g)', priority: 'low',
      saving: null,
      detail: 'You can rent your personal home to your S-Corp for up to 14 days per year. The rental income is tax-free to you personally, and the rental payment is a deductible business expense for the S-Corp.',
      howTo: 'Document business meetings, shareholder meetings, or strategy sessions held at your home. Pay fair market rent (research comparable event venue rates in your area). Keep written agreements. Maximum benefit: fair market rate × 14 days, deductible to the S-Corp.'
    })
  }

  const priorityColors = { high: { bg: '#F0FDF4', border: '#86EFAC', badge: G }, medium: { bg: '#EFF6FF', border: '#93C5FD', badge: B }, low: { bg: '#F5F3FF', border: '#C4B5FD', badge: P } }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Tax-Saving Opportunities</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Specific strategies based on your {b.entityType || 'business'} structure and {year} tax year. Estimated savings at your {pct(marginalRate * 100)} marginal rate.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {opportunities.map((o, i) => {
          const c = priorityColors[o.priority]
          return (
            <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>{o.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: N, fontSize: 14 }}>{o.title}</span>
                      {o.saving && <span style={{ fontSize: 11, background: '#F0FDF4', color: G, border: '1px solid #86EFAC', borderRadius: 10, padding: '2px 8px', fontWeight: 700 }}>Save ~{fmt(o.saving)}</span>}
                      <span style={{ fontSize: 10, background: c.bg, color: c.badge, border: '1px solid ' + c.border, borderRadius: 10, padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase' }}>{o.priority} impact</span>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: SL, margin: 0, lineHeight: 1.6 }}>{o.detail}</p>
              </div>
              <div style={{ padding: '12px 20px', background: '#F8FAFC' }}>
                <div style={{ fontSize: 12, color: N, lineHeight: 1.6 }}>
                  <strong style={{ color: B }}>How to apply:</strong> {o.howTo}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: SL, textAlign: 'center' }}>
        Estimates based on inputs entered. Consult a CPA before implementing any strategy.
      </div>
    </div>
  )
}

// ── TAB 3: IRS Schedule Map ──────────────────────────────────────────────────
function IRSCompliance({ rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const k1 = parseFloat(rec?.k1Income) || 0
  const w2 = parseFloat(f.w2Income) || 0
  const rental = false // future
  const entity = b.entityType || 'S-Corporation'
  const year = parseInt(b.year) || 2025
  const today = new Date()

  const schedules = []

  // Form 1040 always
  schedules.push({ form: 'Form 1040', title: 'U.S. Individual Income Tax Return', status: 'required', detail: 'Your main personal tax return. All income sources flow here — W-2, K-1, Schedule E, Schedule C.', deadline: `April 15, ${year + 1}` })

  // S-Corp / Partnership
  if (['S-Corporation'].includes(entity)) {
    schedules.push({ form: 'Form 1120-S', title: 'S-Corporation Tax Return', status: 'required', detail: `Your S-Corp files its own informational return showing income, deductions, and K-1 allocations to shareholders.`, deadline: `March 15, ${year + 1}` })
    schedules.push({ form: 'Schedule K-1 (1120-S)', title: 'Shareholder Share of Income', status: 'required', detail: `Your ${fmt(k1)} share of S-Corp income flows to your personal return via this form. Attach to Schedule E, Part II.`, deadline: `Issued with Form 1120-S` })
    schedules.push({ form: 'Schedule E (Part II)', title: 'Supplemental Income — S-Corp K-1', status: 'required', detail: 'Reports your K-1 income on your personal return. Passive vs. active participation rules apply.', deadline: 'Filed with Form 1040' })
  }
  if (['Partnership','Multi-Member LLC'].includes(entity)) {
    schedules.push({ form: 'Form 1065', title: 'Partnership Return', status: 'required', detail: 'Partnership or multi-member LLC files this informational return. Issues K-1s to each partner/member.', deadline: `March 15, ${year + 1}` })
    schedules.push({ form: 'Schedule K-1 (1065)', title: 'Partner Share of Income', status: 'required', detail: 'Your distributive share of partnership income, deductions, and credits.', deadline: 'Issued with Form 1065' })
  }
  if (['Sole Proprietor','Single-Member LLC'].includes(entity)) {
    schedules.push({ form: 'Schedule C', title: 'Profit or Loss from Business', status: 'required', detail: 'Reports all business revenue and expenses. Net profit flows directly to Form 1040 Line 8.', deadline: 'Filed with Form 1040' })
    schedules.push({ form: 'Schedule SE', title: 'Self-Employment Tax', status: 'required', detail: 'Calculates 15.3% SE tax on net self-employment income. Half is deductible on Schedule 1.', deadline: 'Filed with Form 1040' })
  }

  // QBI deduction
  if (['S-Corporation','Partnership','Multi-Member LLC','Single-Member LLC','Sole Proprietor'].includes(entity) && k1 > 0) {
    schedules.push({ form: 'Form 8995', title: 'QBI Deduction (IRC §199A)', status: 'required', detail: `Your 20% Qualified Business Income deduction of ~${fmt(Math.round(k1 * 0.20))} is reported here. Reduces taxable income without reducing AGI.`, deadline: 'Filed with Form 1040' })
  }

  // W-2 / withholding
  if (w2 > 0) {
    schedules.push({ form: 'W-2 / Form W-2', title: 'Wages and Withholding', status: 'required', detail: `Your ${fmt(w2)} in W-2 wages are reported on Line 1a of Form 1040. Federal withholding reduces your tax liability.`, deadline: 'Issued by employer Jan 31' })
  }

  // Estimated payments
  if (parseFloat(f.estimatedPayments) > 0) {
    schedules.push({ form: 'Form 1040-ES', title: 'Quarterly Estimated Tax Payments', status: 'active', detail: `${fmt(parseFloat(f.estimatedPayments))} in estimated payments recorded. These reduce your balance due at filing.`, deadline: 'Q1: Apr 15 | Q2: Jun 16 | Q3: Sep 15 | Q4: Jan 15' })
  }

  // Additional Medicare
  const totalIncome = k1 + w2
  if (totalIncome > 200000) {
    schedules.push({ form: 'Form 8959', title: 'Additional Medicare Tax (0.9%)', status: 'required', detail: `With total income of ${fmt(totalIncome)}, the 0.9% Additional Medicare Tax applies to wages/SE income over $200,000 (single).`, deadline: 'Filed with Form 1040' })
  }

  // Deadline calendar
  const upcomingDeadlines = [
    { date: `Jan 31, ${year + 1}`, event: 'W-2s issued by employers' },
    { date: `Mar 15, ${year + 1}`, event: `Form 1120-S / 1065 due (S-Corps & Partnerships)` },
    { date: `Apr 15, ${year + 1}`, event: 'Form 1040 personal return due / Q1 estimated payment' },
    { date: `Jun 16, ${year + 1}`, event: 'Q2 estimated tax payment due' },
    { date: `Sep 15, ${year + 1}`, event: 'Q3 estimated tax payment due' },
    { date: `Jan 15, ${year + 2}`, event: 'Q4 estimated tax payment due' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Your IRS Filing Map</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Forms and schedules required for a {entity} filing {year} taxes. Based on your saved record.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        {schedules.map((s, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: s.status === 'required' ? '#EFF6FF' : '#F0FDF4', color: s.status === 'required' ? B : G, border: '1px solid ' + (s.status === 'required' ? '#BFDBFE' : '#86EFAC'), borderRadius: 4, padding: '1px 7px' }}>{s.form}</span>
            </div>
            <div style={{ fontWeight: 700, color: N, fontSize: 13, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: SL, lineHeight: 1.5, marginBottom: 6 }}>{s.detail}</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>📅 {s.deadline}</div>
          </div>
        ))}
      </div>

      <div style={{ background: N, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', letterSpacing: '1px', marginBottom: 14 }}>KEY DEADLINES — TAX YEAR {year}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {upcomingDeadlines.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', minWidth: 110, flexShrink: 0 }}>{d.date}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{d.event}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── TAB 4: Reports & Tools ───────────────────────────────────────────────────
function Modal({ onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,27,62,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 740, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}>
        {children}
      </div>
    </div>
  )
}

function ReportModal({ onClose, rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const k1 = parseFloat(rec?.k1Income) || 0
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
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
        {rec && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', marginBottom: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SL, letterSpacing: '1px', marginBottom: 12 }}>LAST SAVED CALCULATION — {rec.savedAt}</div>
            {[
              ['Entity Type', b.entityType],['Tax Year', String(b.year || '')],
              ['Gross Revenue', b.grossRevenue ? '$' + parseFloat(b.grossRevenue).toLocaleString() : ''],
              ['Operating Expenses', b.operatingExpenses ? '$' + parseFloat(b.operatingExpenses).toLocaleString() : ''],
              ['Officer Salary', b.officerSalary ? '$' + parseFloat(b.officerSalary).toLocaleString() : ''],
              ['K-1 Income to Personal Return', rec.k1Income ? '$' + parseFloat(rec.k1Income).toLocaleString() : '$0'],
              ['Filing Status', (f.filingStatus || '').toUpperCase()],
              ['W-2 Income', f.w2Income ? '$' + parseFloat(f.w2Income).toLocaleString() : ''],
              ['Estimated Payments Made', f.estimatedPayments ? '$' + parseFloat(f.estimatedPayments).toLocaleString() : ''],
            ].filter(([,v]) => v).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                <span style={{ color: SL }}>{label}</span><span style={{ fontWeight: 600, color: N }}>{value}</span>
              </div>
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
          ].map(([s, d]) => (
            <div key={s} style={{ display: 'flex', gap: 10, padding: '5px 0', fontSize: 13, borderBottom: '1px solid #BFDBFE' }}>
              <span style={{ fontWeight: 700, color: '#1D4ED8', minWidth: 145, flexShrink: 0 }}>{s}</span>
              <span style={{ color: SL }}>{d}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>For planning purposes only. Consult a licensed CPA before filing.</div>
      </div>
    </Modal>
  )
}

function SimulatorModal({ onClose, rec }) {
  const b = rec?.biz || {}, f = rec?.f1040 || {}
  const savedK1 = parseFloat(rec?.k1Income) || 0
  const savedW2 = parseFloat(f.w2Income || b.officerSalary || 0) || 0
  const savedEstPay = parseFloat(f.estimatedPayments) || 0

  // Tax calc engine
  const calcFedTax = (taxableInc) => {
    const brackets = [[11925,.10],[48475,.12],[103350,.22],[197300,.24],[250525,.32],[626350,.35],[Infinity,.37]]
    let tax = 0, prev = 0
    for (const [cap, rate] of brackets) {
      if (taxableInc <= prev) break
      tax += (Math.min(taxableInc, cap) - prev) * rate
      prev = cap
    }
    return Math.round(tax)
  }

  const stdDed = 15750
  const baseTaxable = Math.max(0, savedK1 + savedW2 - savedK1 * 0.20 - stdDed)
  const baseTax = calcFedTax(baseTaxable)

  // Preset scenarios — real strategies based on their data
  const presets = [
    {
      id: 'sep',
      icon: '🏦',
      label: 'Max SEP-IRA',
      description: 'Contribute the maximum allowed to a SEP-IRA',
      color: '#059669',
      compute: () => {
        const maxSEP = Math.min(69000, Math.round(savedK1 * 0.25))
        const newTaxable = Math.max(0, baseTaxable - maxSEP)
        return { saving: baseTax - calcFedTax(newTaxable), note: `Max SEP-IRA: $${maxSEP.toLocaleString()} contribution`, detail: 'Deducted from AGI before standard deduction' }
      }
    },
    {
      id: 'equip20',
      icon: '🔧',
      label: '$20K Equipment',
      description: 'Purchase $20,000 in business equipment (Section 179)',
      color: '#2563EB',
      compute: () => {
        const newTaxable = Math.max(0, baseTaxable - 20000)
        return { saving: baseTax - calcFedTax(newTaxable), note: 'Section 179: $20,000 full deduction in year of purchase', detail: 'Must be placed in service before Dec 31' }
      }
    },
    {
      id: 'equip50',
      icon: '🏗️',
      label: '$50K Equipment',
      description: 'Purchase $50,000 in business equipment (Section 179)',
      color: '#7C3AED',
      compute: () => {
        const newTaxable = Math.max(0, baseTaxable - 50000)
        return { saving: baseTax - calcFedTax(newTaxable), note: 'Section 179: $50,000 full deduction in year of purchase', detail: 'Computers, vehicles, machinery, office furniture' }
      }
    },
    {
      id: 'advertising',
      icon: '📢',
      label: '$15K Advertising',
      description: 'Invest $15,000 in business advertising & marketing',
      color: '#D97706',
      compute: () => {
        const newTaxable = Math.max(0, baseTaxable - 15000)
        return { saving: baseTax - calcFedTax(newTaxable), note: 'IRC §162: $15,000 fully deductible business expense', detail: 'Digital ads, print, sponsorships, website, marketing' }
      }
    },
    {
      id: 'hsa',
      icon: '🏥',
      label: 'Max HSA',
      description: 'Contribute maximum to Health Savings Account',
      color: '#0891B2',
      compute: () => {
        const maxHSA = 4300
        const newTaxable = Math.max(0, baseTaxable - maxHSA)
        return { saving: baseTax - calcFedTax(newTaxable), note: `HSA max: $${maxHSA.toLocaleString()} (self-only, 2025)`, detail: 'Requires high-deductible health plan (HDHP)' }
      }
    },
    {
      id: 'custom',
      icon: '✏️',
      label: 'Custom Amount',
      description: 'Enter any deduction amount to see the tax impact',
      color: '#475569',
      compute: (customAmt) => {
        const amt = parseFloat(customAmt) || 0
        const newTaxable = Math.max(0, baseTaxable - amt)
        return { saving: baseTax - calcFedTax(newTaxable), note: `Custom deduction: $${amt.toLocaleString()}`, detail: 'Enter any business expense or deduction amount' }
      }
    },
  ]

  const [selected, setSelected] = useState('sep')
  const [customAmt, setCustomAmt] = useState('10000')

  const activePreset = presets.find(p => p.id === selected)
  const result = activePreset?.compute(customAmt)
  const saving = result?.saving || 0

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: '28px 32px', maxWidth: 680 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '1px', marginBottom: 4 }}>WHAT-IF TAX SIMULATOR</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: '0 0 4px' }}>How Much Could You Save?</h2>
            <div style={{ fontSize: 13, color: SL }}>Based on your {b.entityType || 'business'} · K-1: ${savedK1.toLocaleString()} · W-2: ${savedW2.toLocaleString()} · Changes don't affect your saved data</div>
          </div>
          <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>✕ Close</button>
        </div>

        {/* Current tax banner */}
        <div style={{ background: N, borderRadius: 12, padding: '16px 24px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Your current estimated federal tax</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>${baseTax.toLocaleString()}</div>
        </div>

        {/* Strategy picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: SL, letterSpacing: '0.5px', marginBottom: 10 }}>SELECT A STRATEGY TO MODEL</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {presets.map(p => (
              <button key={p.id} onClick={() => setSelected(p.id)} style={{
                padding: '12px 10px', borderRadius: 10, border: '2px solid ' + (selected === p.id ? p.color : '#E2E8F0'),
                background: selected === p.id ? p.color + '12' : '#fff',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s'
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{p.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: selected === p.id ? p.color : N }}>{p.label}</div>
                <div style={{ fontSize: 11, color: SL, lineHeight: 1.4, marginTop: 2 }}>{p.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom input if selected */}
        {selected === 'custom' && (
          <div style={{ marginBottom: 16, background: '#F8FAFC', borderRadius: 10, padding: '16px 20px', border: '1px solid #E2E8F0' }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: SL, display: 'block', marginBottom: 6 }}>DEDUCTION / EXPENSE AMOUNT</label>
            <input
              type="number"
              value={customAmt}
              onChange={e => setCustomAmt(e.target.value)}
              placeholder="Enter dollar amount"
              style={{ width: '100%', padding: '10px 14px', border: '2px solid #2563EB', borderRadius: 8, fontSize: 18, fontWeight: 700, color: N, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
            />
            <div style={{ fontSize: 11, color: SL, marginTop: 6 }}>Enter any business expense — equipment, advertising, professional fees, etc.</div>
          </div>
        )}

        {/* Result */}
        <div style={{
          background: saving > 0 ? '#F0FDF4' : '#F8FAFC',
          border: '2px solid ' + (saving > 0 ? '#86EFAC' : '#E2E8F0'),
          borderRadius: 14, padding: '20px 24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: SL, marginBottom: 4 }}>ESTIMATED TAX SAVINGS</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: saving > 0 ? '#059669' : SL, lineHeight: 1 }}>
                {saving > 0 ? `$${saving.toLocaleString()}` : '$0'}
              </div>
              <div style={{ fontSize: 13, color: SL, marginTop: 6 }}>
                Tax drops from <strong>${baseTax.toLocaleString()}</strong> to <strong>${Math.max(0, baseTax - saving).toLocaleString()}</strong>
              </div>
            </div>
            {saving > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: SL, marginBottom: 4 }}>ROI ON THIS STRATEGY</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>
                  {selected === 'sep' ? '100%' : `${Math.round(saving / (parseFloat(customAmt) || (selected==='equip20'?20000:selected==='equip50'?50000:selected==='advertising'?15000:4300)) * 100)}¢ saved per $1`}
                </div>
              </div>
            )}
          </div>
          {result && (
            <div style={{ borderTop: '1px solid ' + (saving > 0 ? '#BBF7D0' : '#E2E8F0'), paddingTop: 12, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: N, marginBottom: 2 }}>📋 {result.note}</div>
              <div style={{ fontSize: 12, color: SL }}>{result.detail}</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: SL, textAlign: 'center' }}>
          Estimates use 2025 federal brackets. Does not include state tax, FICA, or AMT. Consult a CPA before implementing.
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: P, letterSpacing: '1px', marginBottom: 4 }}>AUDIT DEFENSE NARRATIVE</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: N, margin: 0 }}>IRS Response Templates</h2>
            <div style={{ fontSize: 13, color: SL, marginTop: 4 }}>Review and edit before sending — not a substitute for legal advice</div>
          </div>
          <button onClick={onClose} style={{ padding: '8px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {narratives.map((n, i) => (
            <button key={i} onClick={() => { setSelected(i); setCopied(false) }} style={{ padding: '7px 14px', background: selected === i ? n.color : '#fff', color: selected === i ? '#fff' : SL, border: '1px solid ' + (selected === i ? n.color : '#E2E8F0'), borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{n.title}</button>
          ))}
        </div>
        <div style={{ display: 'inline-block', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700, color: P, marginBottom: 14 }}>📋 {current.tag}</div>
        <div style={{ background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '20px 24px', marginBottom: 16, fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.85, color: N, whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto' }}>{current.text}</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button onClick={handleCopy} style={{ flex: 1, padding: '11px', background: copied ? G : P, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{copied ? '✓ Copied!' : '📋 Copy to Clipboard'}</button>
          <button onClick={() => window.print()} style={{ flex: 1, padding: '11px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>🖨 Print</button>
        </div>
        <div style={{ fontSize: 11, color: SL, textAlign: 'center' }}>⚠️ Templates only — review with a licensed tax attorney before submitting to the IRS.</div>
      </div>
    </Modal>
  )
}

function ReportsTab({ rec, onReport, onSimulator, onNarrative }) {
  const tools = [
    { icon: '📋', title: 'CPA Export Pack', desc: 'A print-ready PDF with your financials, K-1 summary, risk alerts, and IRS schedule mapping. Hand this to your accountant instead of explaining everything from scratch.', btn: 'Generate Report', color: B, action: onReport, available: true },
    { icon: '🎯', title: 'What-If Tax Simulator', desc: 'Model a financial decision before making it. Try different salary levels, add a deduction, or max a retirement account — see the exact dollar impact on your estimated tax.', btn: 'Open Simulator', color: G, action: onSimulator, available: true },
    { icon: '🛡️', title: 'Audit Defense Narrative', desc: 'Plain-English IRS response templates for the three most common S-Corp and real estate audit triggers. Review with your CPA or tax attorney before sending.', btn: 'View Templates', color: P, action: onNarrative, available: true },
  ]
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: N, margin: '0 0 4px' }}>Reports & Tools</h3>
        <p style={{ fontSize: 13, color: SL, margin: 0 }}>Three tools built for your CPA relationship and IRS preparedness.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {tools.map(t => (
          <div key={t.title} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px', display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ fontSize: 48, flexShrink: 0 }}>{t.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: N, fontSize: 16, marginBottom: 6 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: SL, lineHeight: 1.6 }}>{t.desc}</div>
            </div>
            <button onClick={t.action} style={{ padding: '12px 24px', background: t.color, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>{t.btn}</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function NoData() {
  const nav = useNavigate()
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
      <div style={{ fontWeight: 700, color: N, fontSize: 18, marginBottom: 8 }}>No saved record found</div>
      <div style={{ color: SL, fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>Complete your business calculation on the Dashboard and save a record. The AI Analysis will then show findings specific to your situation.</div>
      <button onClick={() => nav('/dashboard')} style={{ padding: '12px 28px', background: B, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Go to Dashboard →</button>
    </div>
  )
}

export default function AIAnalysis() {
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState(0)
  const [showReport, setShowReport] = useState(false)
  const [showSimulator, setShowSimulator] = useState(false)
  const [showNarrative, setShowNarrative] = useState(false)

  const rec = getRecord()
  const score = completeness(rec)

  const TABS = [
    { label: '🔍 Risk Scan', desc: 'AI findings from your data' },
    { label: '💡 Tax Optimization', desc: 'Strategies to reduce your tax' },
    { label: '📋 IRS Filing Map', desc: 'Your required forms & deadlines' },
    { label: '🛠 Reports & Tools', desc: 'CPA export, simulator, audit defense' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {showReport && <ReportModal onClose={() => setShowReport(false)} rec={rec} />}
      {showSimulator && <SimulatorModal onClose={() => setShowSimulator(false)} rec={rec} />}
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

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: N, fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>AI Risk & Tax Analysis</h1>
          <p style={{ color: SL, fontSize: 14, margin: 0 }}>
            {rec ? `Analyzing your ${rec.biz?.entityType || 'business'} — saved ${rec.savedAt}` : 'Save a record on the Dashboard to unlock personalized analysis'}
          </p>
        </div>

        {/* Score bar */}
        {rec && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: N }}>Input Completeness</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: G }}>{score}%</span>
              </div>
              <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: score + '%', height: '100%', background: 'linear-gradient(90deg,#059669,#34d399)', borderRadius: 4, transition: 'width 0.5s' }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: SL, flexShrink: 0 }}>
              Fill more fields for better accuracy
            </div>
            <button onClick={() => nav('/dashboard')} style={{ padding: '7px 14px', background: '#F1F5F9', color: SL, border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Update Data →</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', borderRadius: 12, padding: 6, border: '1px solid #E2E8F0' }}>
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i)} style={{ flex: 1, padding: '10px 12px', background: activeTab === i ? N : 'transparent', color: activeTab === i ? '#fff' : SL, border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'center' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '28px' }}>
          {activeTab === 0 && <RiskScan rec={rec} />}
          {activeTab === 1 && <TaxOptimization rec={rec} />}
          {activeTab === 2 && <IRSCompliance rec={rec} />}
          {activeTab === 3 && <ReportsTab rec={rec} onReport={() => setShowReport(true)} onSimulator={() => setShowSimulator(true)} onNarrative={() => setShowNarrative(true)} />}
        </div>

        <div style={{ marginTop: 24, padding: '14px 20px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12, color: SL, textAlign: 'center', lineHeight: 1.6 }}>
          ⚠️ TaxStat360 provides tax estimates and planning insights for informational purposes only. Not professional tax advice. Consult a licensed CPA or tax attorney before making filing or financial decisions.
        </div>
      </div>
    </div>
  )
}
