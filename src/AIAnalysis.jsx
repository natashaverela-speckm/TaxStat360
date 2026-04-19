import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,letterSpacing:'-0.3px',borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)

const CATEGORIES = [
  {label:'Core AI Intelligence',color:'#2563EB',features:[
    {n:1,t:'Real-Time Risk Alert Engine',d:'AI scans for audit risks, unusual deductions, and compliance issues proactively.',status:'active'},
    {n:2,t:'What-If Scenario Simulator',d:'Test financial decisions in a sandbox without affecting real records.',status:'active'},
    {n:3,t:'Explainable AI Layer',d:'"Why This Number?" — clear explanations of every AI-generated recommendation.',status:'active'},
    {n:4,t:'AI Assumption Transparency Panel',d:'Displays all AI assumptions: tax rules, depreciation methods, benchmarks.',status:'active'},
    {n:9,t:'Financial Data Anomaly Detection',d:'Detects duplicate entries, abnormal spikes, and inconsistent depreciation.',status:'active'},
    {n:10,t:'Data Confidence Score',d:'Reliability score for each tax year based on data completeness.',status:'active'},
    {n:11,t:'Personalized Risk Tolerance Profiling',d:'Conservative, balanced, or aggressive — AI adapts to your profile.',status:'active'},
    {n:13,t:'AI Recommendation Change Tracking',d:'Tracks how AI advice evolves over time as financial data changes.',status:'ready'},
  ]},
  {label:'Tax Planning & Optimization',color:'#059669',features:[
    {n:7,t:'Mid-Year Tax & Risk Pulse',d:'Mid-year health report with projected taxes, risks, and actions.',status:'active'},
    {n:8,t:'Year-Over-Year Intelligence',d:'Compares financial trends across years to highlight improvements.',status:'active'},
    {n:15,t:'Tax-Saving Opportunity Discovery',d:'AI identifies overlooked deductions and optimization strategies.',status:'active'},
    {n:16,t:'AI-Generated Financial Action Plan',d:'Prioritized checklist with clear next steps and timelines.',status:'active'},
    {n:17,t:'Event-Triggered AI Re-Analysis',d:'Automatically reruns when major financial changes occur.',status:'ready'},
    {n:24,t:'Safe Harbor Rule Detection',d:'Detects IRS Safe Harbor thresholds to reduce penalty risk.',status:'active'},
    {n:25,t:'Estimated Tax Payment Planner',d:'Quarterly payment breakdowns with reminders — avoid penalties.',status:'active'},
    {n:12,t:'Industry Benchmark Intelligence',d:'Compares your financials to similar US businesses.',status:'ready'},
  ]},
  {label:'IRS & Compliance',color:'#DC2626',features:[
    {n:20,t:'IRS Audit Readiness Mode',d:'Organizes data into IRS-friendly audit format with explanations.',status:'active'},
    {n:21,t:'IRS Schedule Mapping Intelligence',d:'Maps entries to IRS schedules C, E, and K-1 summaries.',status:'active'},
    {n:22,t:'Depreciation Compliance Engine',d:'MACRS, Section 179, and Bonus methods — IRS-approved.',status:'active'},
    {n:23,t:'State-Level Tax Awareness',d:'Flags state-specific deduction disallowances and income sourcing.',status:'active'},
    {n:26,t:'IRS Rule Change Monitoring',d:'AI monitors IRS updates and flags relevant changes automatically.',status:'ready'},
    {n:27,t:'Compliance Confidence Indicator',d:'Score showing alignment with IRS expectations.',status:'active'},
    {n:28,t:'IRS-Friendly Language Mode',d:'Converts IRS terminology into plain, human-readable language.',status:'active'},
    {n:29,t:'Compliance-Grade AI Guardrails',d:'Ensures AI avoids risky positions and labels high-risk strategies.',status:'active'},
  ]},
  {label:'Collaboration & Enterprise',color:'#7C3AED',features:[
    {n:5,t:'Advisor & Accountant Collaboration',d:'Secure read-only sharing for accountants and financial advisors.',status:'active'},
    {n:6,t:'One-Click CPA Export Pack',d:'IRS-friendly reports summarizing financials, AI insights, and risks.',status:'active'},
    {n:14,t:'Support Replay & Audit Mode',d:'Replays user data and AI outputs for audits or troubleshooting.',status:'ready'},
    {n:18,t:'Multi-Entity / Multi-Business View',d:'Multiple businesses or properties under one account.',status:'ready'},
    {n:19,t:'Monetization-Ready AI Feature Tiers',d:'Free, pro, and premium tier gating with clear value ladder.',status:'ready'},
    {n:30,t:'AI-Generated Audit Defense Narrative',d:'Plain-English explanations for IRS correspondence or CPA review.',status:'active'},
    {n:31,t:'IRS Deadline & Penalty Awareness',d:'Tracks IRS deadlines and explains consequences of missing them.',status:'active'},
    {n:32,t:'IRS-Aligned Data Retention & Audit Trail',d:'Tamper-resistant, audit-ready financial data storage.',status:'active'},
  ]},
]

export default function AIAnalysis(){
  const nav=useNavigate()
  const [activeTab,setActiveTab]=useState(0)

  const totalActive = CATEGORIES.flatMap(c=>c.features).filter(f=>f.status==='active').length
  const totalReady = CATEGORIES.flatMap(c=>c.features).filter(f=>f.status==='ready').length
  const complianceScore = 87

  return(
    <div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 32px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div onClick={()=>nav('/calculate-tax')}><LOGO/></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>nav('/calculate-tax')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',color:SL}}>Dashboard</button>
          <button onClick={()=>nav('/calculate-tax')} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:7,background:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',color:SL}}>Calculate Tax</button>
          <button style={{padding:'7px 16px',background:B,color:'#fff',border:'none',borderRadius:7,fontWeight:600,fontSize:13,cursor:'pointer'}}>AI Analysis</button>
        </div>
      </nav>

      <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px'}}>

        {/* Header */}
        <div style={{marginBottom:28}}>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            <span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,letterSpacing:1.2,padding:'4px 12px',borderRadius:20}}>AI-BASED AUDIT & RISK PLANNER</span>
            <span style={{background:'#F0FDF4',color:'#15803D',fontSize:11,fontWeight:700,letterSpacing:1.2,padding:'4px 12px',borderRadius:20}}>US-SPECIFIC IRS COMPLIANCE</span>
            <span style={{background:'#EFF6FF',color:B,fontSize:11,fontWeight:700,letterSpacing:1.2,padding:'4px 12px',borderRadius:20}}>ADVANCED AI FEATURE EXPANSION</span>
          </div>
          <h1 style={{color:N,fontSize:26,fontWeight:800,margin:'0 0 6px'}}>AI Risk & Compliance Planner</h1>
          <p style={{color:SL,fontSize:14,margin:0}}>32 AI-powered features for IRS, state, and federal compliance — designed for S-Corps, LLCs, and Partnerships.</p>
        </div>

        {/* Score Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:28}}>
          {[
            {label:'Compliance Score',value:complianceScore+'%',sub:'IRS-Aligned',color:'#059669',bg:'#F0FDF4',border:'#BBF7D0'},
            {label:'Active Features',value:totalActive+'/32',sub:'Fully operational',color:B,bg:'#EFF6FF',border:'#BFDBFE'},
            {label:'Risk Alerts',value:'3',sub:'Flagged for review',color:'#DC2626',bg:'#FEF2F2',border:'#FECACA'},
            {label:'Tax Savings Found',value:'$8,420',sub:'Estimated opportunity',color:'#7C3AED',bg:'#F5F3FF',border:'#DDD6FE'},
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,border:'1px solid '+s.border,borderRadius:12,padding:'20px 18px'}}>
              <div style={{fontSize:11,fontWeight:600,color:SL,letterSpacing:0.8,marginBottom:8}}>{s.label.toUpperCase()}</div>
              <div style={{fontSize:28,fontWeight:800,color:s.color,marginBottom:4}}>{s.value}</div>
              <div style={{fontSize:12,color:SL}}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Risk Alert Banner */}
        <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:12,padding:'16px 20px',marginBottom:24,display:'flex',alignItems:'center',gap:12}}>
          <div style={{fontSize:20}}>🚨</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,color:'#DC2626',fontSize:14,marginBottom:4}}>Real-Time Risk Alert Engine — 3 Issues Detected</div>
            <div style={{color:'#991B1B',fontSize:13}}>Officer salary may be below IRS reasonable compensation threshold · Depreciation method inconsistency detected · Q3 estimated payment approaching deadline (Sept 15)</div>
          </div>
          <button style={{padding:'8px 16px',background:'#DC2626',color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',flexShrink:0}}>Review Alerts</button>
        </div>

        {/* Compliance Confidence Bar */}
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px 24px',marginBottom:24}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontWeight:700,color:N,fontSize:15}}>Compliance Confidence Indicator (IRS-Aligned)</div>
            <div style={{fontWeight:800,color:'#059669',fontSize:20}}>{complianceScore}%</div>
          </div>
          <div style={{height:10,background:'#E2E8F0',borderRadius:5,overflow:'hidden',marginBottom:10}}>
            <div style={{width:complianceScore+'%',height:'100%',background:'linear-gradient(90deg,#059669,#34d399)',borderRadius:5}}/>
          </div>
          <div style={{display:'flex',gap:16,fontSize:12,color:SL}}>
            <span>🟢 Schedule E mapping: Complete</span>
            <span>🟢 Depreciation MACRS: Aligned</span>
            <span>🟡 Officer compensation: Review needed</span>
            <span>🟢 State tax awareness: Active</span>
          </div>
        </div>

        {/* Category Tabs */}
        <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
          {CATEGORIES.map((c,i)=>(
            <button key={c.label} onClick={()=>setActiveTab(i)} style={{padding:'8px 18px',background:activeTab===i?c.color:'#fff',color:activeTab===i?'#fff':SL,border:'1px solid '+(activeTab===i?c.color:'#E2E8F0'),borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',transition:'all 0.15s'}}>
              {c.label}
            </button>
          ))}
        </div>

        {/* Feature Grid */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:14,marginBottom:28}}>
          {CATEGORIES[activeTab].features.map(f=>(
            <div key={f.n} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'18px 20px',display:'flex',gap:14,alignItems:'flex-start'}}>
              <div style={{width:32,height:32,borderRadius:8,background:CATEGORIES[activeTab].color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>{f.n}</div>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                  <div style={{fontWeight:700,color:N,fontSize:14}}>{f.t}</div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:f.status==='active'?'#F0FDF4':'#F8FAFC',color:f.status==='active'?'#15803D':'#64748b',border:'1px solid '+(f.status==='active'?'#BBF7D0':'#E2E8F0')}}>{f.status==='active'?'ACTIVE':'COMING SOON'}</span>
                </div>
                <div style={{color:SL,fontSize:13,lineHeight:1.5}}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Panel */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
          {[
            {icon:'📋',title:'Generate CPA Export Pack',desc:'One-click IRS-friendly report for your accountant.',btn:'Generate Report',color:B},
            {icon:'🎯',title:'Run What-If Simulator',desc:'Model a financial decision without affecting real data.',btn:'Open Simulator',color:'#059669'},
            {icon:'🛡️',title:'View Audit Defense Narrative',desc:'Plain-English IRS correspondence ready to send.',btn:'View Narrative',color:'#7C3AED'},
          ].map(a=>(
            <div key={a.title} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'22px 20px',textAlign:'center'}}>
              <div style={{fontSize:32,marginBottom:10}}>{a.icon}</div>
              <div style={{fontWeight:700,color:N,fontSize:14,marginBottom:6}}>{a.title}</div>
              <div style={{color:SL,fontSize:12,marginBottom:16,lineHeight:1.5}}>{a.desc}</div>
              <button style={{padding:'10px 20px',background:a.color,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',width:'100%'}}>{a.btn}</button>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
