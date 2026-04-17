import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,letterSpacing:'-0.3px',borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)

const CATEGORIES=[
  {label:'Core AI Intelligence',color:'#2563EB',features:[
    {n:1,t:'Real-Time Risk Alert Engine',d:'AI scans for audit risks, unusual deductions, and compliance issues proactively.',status:'active'},
    {n:2,t:'What-If Scenario Simulator',d:'Test financial decisions in a sandbox without affecting real records.',status:'active'},
    {n:3,t:'Explainable AI Layer',d:'"Why This Number?" — clear explanations of every AI-generated recommendation.',status:'active'},
    {n:4,t:'AI Assumption Transparency Panel',d:'Displays all AI assumptions: tax rules, depreciation methods, benchmarks.',status:'active'},
    {n:9,t:'Financial Data Anomaly Detection',d:'Detects duplicate entries, abnormal spikes, and inconsistent depreciation.',status:'active'},
    {n:10,t:'Data Confidence Score',d:'Reliability score for each tax year based on data completeness.',status:'active'},
    {n:11,t:'Personalized Risk Tolerance Profiling',d:'Conservative, balanced, or aggressive — AI adapts to your profile.',status:'active'},
    {n:13,t:'AI Recommendation Change Tracking',d:'Tracks how AI advice evolves over time as financial data changes.',status:'coming'},
  ]},
  {label:'Tax Planning & Optimization',color:'#059669',features:[
    {n:5,t:'Tax-Saving Opportunity Discovery',d:'Identifies deductions, credits, and elections you may be missing.',status:'active'},
    {n:6,t:'Quarterly Tax Payment Planner',d:'Smart quarterly estimates based on real income and deductions.',status:'active'},
    {n:7,t:'Depreciation Compliance Engine',d:'MACRS, bonus depreciation, and Section 179 alignment checks.',status:'active'},
    {n:8,t:'Safe Harbor Rule Detection',d:'Flags when safe harbor elections apply to reduce audit risk.',status:'active'},
    {n:14,t:'Year-Over-Year Intelligence',d:'Compares current vs. prior year to surface unexpected changes.',status:'active'},
    {n:15,t:'Mid-Year Tax & Risk Pulse',d:'Mid-year check-in to adjust estimated payments and strategy.',status:'active'},
  ]},
  {label:'IRS & Compliance',color:'#DC2626',features:[
    {n:16,t:'IRS Schedule Mapping (C, E, K-1)',d:'Auto-populates IRS schedules from your financial inputs.',status:'active'},
    {n:17,t:'IRS Audit Readiness Mode',d:'Full audit simulation — flags anything the IRS might question.',status:'active'},
    {n:18,t:'IRS Deadline & Penalty Awareness',d:'Tracks every IRS deadline and alerts you before penalties apply.',status:'active'},
    {n:19,t:'IRS-Friendly Language Mode',d:'Converts complex tax jargon into plain English explanations.',status:'active'},
    {n:20,t:'IRS Rule Change Monitoring',d:'Monitors IRS announcements and flags changes affecting your return.',status:'active'},
    {n:21,t:'Compliance-Grade AI Guardrails',d:'Ensures every AI recommendation stays within IRS guidelines.',status:'active'},
    {n:22,t:'IRS Data Retention & Audit Trail',d:'Maintains a full log of all AI decisions for audit defense.',status:'active'},
  ]},
  {label:'Collaboration & Enterprise',color:'#7C3AED',features:[
    {n:23,t:'One-Click CPA Export Pack',d:'IRS-friendly report package your accountant can use directly.',status:'active'},
    {n:24,t:'Advisor & Accountant Collaboration',d:'Share read-only access with your CPA or tax advisor.',status:'active'},
    {n:25,t:'State-Level Tax Awareness',d:'Multi-state compliance checks for S-Corps operating across states.',status:'active'},
    {n:26,t:'Industry Benchmark Intelligence',d:'Compare your deductions and ratios to industry peers.',status:'active'},
    {n:27,t:'AI-Generated Audit Defense Narrative',d:'Plain-English IRS correspondence ready to send.',status:'active'},
    {n:28,t:'Support Replay & Audit Mode',d:'Full session replay for any AI recommendation given.',status:'coming'},
    {n:29,t:'Event-Triggered AI Re-Analysis',d:'AI re-runs when key financial events occur.',status:'coming'},
    {n:30,t:'Multi-Entity / Multi-Business View',d:'Consolidated intelligence across all your entities.',status:'coming'},
    {n:31,t:'White-Label Option',d:'Brand the platform for your accounting firm clients.',status:'coming'},
    {n:32,t:'Custom IRS Correspondence Templates',d:'Pre-approved letter templates for IRS responses.',status:'active'},
  ]},
]

const ALERTS=[
  {id:1,title:'Officer Salary Below IRS Threshold',desc:'Your current officer salary of $45,000 may be below the IRS reasonable compensation standard for your revenue level. This is a top S-Corp audit trigger.',severity:'high',action:'Review Compensation'},
  {id:2,title:'Depreciation Method Inconsistency',desc:'Schedule E depreciation elections differ from prior year. MACRS method change requires Form 3115 attachment to avoid IRS scrutiny.',severity:'high',action:'Fix Now'},
  {id:3,title:'Q3 Estimated Payment Approaching',desc:'Your Q3 estimated tax payment of approximately $4,200 is due September 15. Based on current year income, underpayment penalty applies if missed.',severity:'medium',action:'View Schedule'},
]

function WhatIfModal({onClose}){
  const [scenario,setScenario]=useState('')
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(false)

  const SCENARIOS=[
    'What if I increase my S-Corp salary from $45K to $75K?',
    'What if I take a $50,000 equipment deduction via Section 179?',
    'What if I add a second owner to my S-Corp this year?',
    'What if I convert to a C-Corp instead of S-Corp?',
  ]

  const runSimulation=async()=>{
    if(!scenario.trim())return
    setLoading(true)
    setResult(null)
    try{
      const resp=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          system:'You are an expert IRS tax strategist and former IRS Revenue Agent. The user has an S-Corp business. When they describe a financial what-if scenario, analyze the tax impact clearly and concisely. Structure your response as: 1) Estimated Tax Impact (dollar amounts), 2) Key Benefits, 3) Key Risks, 4) IRS Considerations, 5) Recommendation. Be specific and practical. Keep total response under 300 words.',
          messages:[{role:'user',content:`What-if scenario for my S-Corp: ${scenario}`}]
        })
      })
      const data=await resp.json()
      const text=data.content?.find(c=>c.type==='text')?.text||'Unable to generate analysis.'
      setResult(text)
    }catch(e){
      setResult('Analysis unavailable. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
      <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:640,maxHeight:'85vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <div style={{padding:'22px 24px',borderBottom:'1px solid #E2E8F0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontWeight:800,color:N,fontSize:17}}>🎯 What-If Scenario Simulator</div>
            <div style={{color:SL,fontSize:12,marginTop:2}}>Model a financial decision — powered by AI tax intelligence</div>
          </div>
          <button onClick={onClose} style={{background:'#F1F5F9',border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:SL,fontWeight:600,fontSize:13}}>✕ Close</button>
        </div>
        <div style={{padding:24}}>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:N,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.5px'}}>Quick Scenarios</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {SCENARIOS.map(s=>(
                <button key={s} onClick={()=>setScenario(s)} style={{textAlign:'left',padding:'10px 14px',background:scenario===s?'#EFF6FF':'#F8FAFC',border:`1px solid ${scenario===s?B:'#E2E8F0'}`,borderRadius:8,cursor:'pointer',fontSize:13,color:scenario===s?B:N,fontWeight:scenario===s?600:400}}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:N,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px'}}>Or describe your own scenario</div>
            <textarea value={scenario} onChange={e=>setScenario(e.target.value)} placeholder="e.g. What if I hire my spouse and pay them $30K?" style={{width:'100%',padding:'12px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:13,color:N,resize:'vertical',minHeight:72,boxSizing:'border-box',outline:'none',fontFamily:'inherit'}}/>
          </div>
          <button onClick={runSimulation} disabled={loading||!scenario.trim()} style={{width:'100%',padding:'12px',background:loading||!scenario.trim()?'#94A3B8':B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:14,cursor:loading||!scenario.trim()?'not-allowed':'pointer',transition:'background 0.2s'}}>
            {loading?'⚙️ Running AI Analysis...':'🚀 Run Simulation'}
          </button>
          {result&&(
            <div style={{marginTop:20,padding:18,background:'#F8FAFC',borderRadius:10,border:'1px solid #E2E8F0'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#059669',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>✅ AI Analysis Result</div>
              <div style={{fontSize:13,color:N,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{result}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AIAnalysis(){
  const nav=useNavigate()
  const [activeTab,setActiveTab]=useState(0)
  const [dismissedAlerts,setDismissedAlerts]=useState([])
  const [showSimulator,setShowSimulator]=useState(false)
  const [showAlerts,setShowAlerts]=useState(false)
  const activeAlerts=ALERTS.filter(a=>!dismissedAlerts.includes(a.id))

  return(
    <div style={{minHeight:'100vh',background:'#F1F5FB'}}>
      {showSimulator&&<WhatIfModal onClose={()=>setShowSimulator(false)}/>}

      {/* Alerts Modal */}
      {showAlerts&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:580,maxHeight:'80vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{padding:'22px 24px',borderBottom:'1px solid #E2E8F0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontWeight:800,color:N,fontSize:17}}>🚨 Active Risk Alerts</div>
              <button onClick={()=>setShowAlerts(false)} style={{background:'#F1F5F9',border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',color:SL,fontWeight:600,fontSize:13}}>✕ Close</button>
            </div>
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:16}}>
              {activeAlerts.length===0&&<div style={{textAlign:'center',color:SL,padding:32,fontSize:14}}>✅ All alerts resolved! Your compliance score is looking great.</div>}
              {activeAlerts.map(a=>(
                <div key={a.id} style={{padding:16,borderRadius:10,border:`1px solid ${a.severity==='high'?'#FCA5A5':'#FCD34D'}`,background:a.severity==='high'?'#FFF5F5':'#FFFBEB'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{fontWeight:700,color:N,fontSize:14}}>{a.title}</div>
                    <span style={{background:a.severity==='high'?'#DC2626':'#D97706',color:'#fff',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,textTransform:'uppercase',flexShrink:0,marginLeft:8}}>{a.severity}</span>
                  </div>
                  <div style={{color:SL,fontSize:13,lineHeight:1.5,marginBottom:12}}>{a.desc}</div>
                  <div style={{display:'flex',gap:8}}>
                    <button style={{padding:'7px 14px',background:a.severity==='high'?'#DC2626':'#D97706',color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer'}}>{a.action}</button>
                    <button onClick={()=>setDismissedAlerts(p=>[...p,a.id])} style={{padding:'7px 14px',background:'transparent',color:SL,border:'1px solid #E2E8F0',borderRadius:6,fontSize:12,cursor:'pointer'}}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 24px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div onClick={()=>nav('/')} style={{cursor:'pointer'}}><LOGO/></div>
        <div style={{display:'flex',gap:8}}>
          {['Dashboard','Calculate Tax','AI Analysis'].map((l,i)=>(<button key={l} onClick={()=>nav(['/dashboard','/calculate-tax','/ai-analysis'][i])} style={{padding:'8px 16px',background:i===2?B:'transparent',color:i===2?'#fff':SL,border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>{l}</button>))}
          <button onClick={()=>nav('/login')} style={{padding:'8px 16px',background:'transparent',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Sign Out</button>
        </div>
      </nav>

      <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px'}}>

        {/* Badges */}
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          {['AI-BASED AUDIT & RISK PLANNER','US-SPECIFIC IRS COMPLIANCE','ADVANCED AI FEATURE EXPANSION'].map((badge,i)=>(<span key={badge} style={{background:i===1?'#F0FDF4':'#EFF6FF',color:i===1?'#15803D':B,fontSize:11,fontWeight:700,letterSpacing:'1.2px',padding:'4px 12px',borderRadius:20}}>{badge}</span>))}
        </div>
        <h1 style={{color:N,fontSize:26,fontWeight:800,margin:'0 0 6px'}}>AI Risk & Compliance Planner</h1>
        <p style={{color:SL,fontSize:14,margin:'0 0 28px'}}>32 AI-powered features for IRS, state, and federal compliance — built for every business entity — S-Corps, LLCs, Partnerships, Sole Proprietors, and Single-Member LLCs.</p>

        {/* Stat Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:20}}>
          {[
            {label:'COMPLIANCE SCORE',value:'87%',sub:'IRS-Aligned',color:'#059669',bg:'#F0FDF4'},
            {label:'ACTIVE FEATURES',value:'25/32',sub:'Fully operational',color:B,bg:'#EFF6FF'},
            {label:'RISK ALERTS',value:String(activeAlerts.length),sub:'Flagged for review',color:'#DC2626',bg:'#FEF2F2'},
            {label:'TAX SAVINGS FOUND',value:'$8,420',sub:'Estimated opportunity',color:'#7C3AED',bg:'#F5F3FF'},
          ].map(s=>(<div key={s.label} style={{background:s.bg,borderRadius:12,padding:'18px 20px',border:`1px solid ${s.color}22`}}><div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.8px',marginBottom:6}}>{s.label}</div><div style={{fontSize:30,fontWeight:800,color:s.color,marginBottom:2}}>{s.value}</div><div style={{fontSize:12,color:SL}}>{s.sub}</div></div>))}
        </div>

        {/* Risk Alert Banner */}
        {activeAlerts.length>0&&(
          <div style={{background:'#FFF5F5',border:'1px solid #FCA5A5',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:22}}>🚨</span>
              <div>
                <div style={{fontWeight:700,color:'#DC2626',fontSize:14,marginBottom:2}}>Real-Time Risk Alert Engine — {activeAlerts.length} Issue{activeAlerts.length>1?'s':''} Detected</div>
                <div style={{color:'#7F1D1D',fontSize:12}}>{activeAlerts.map(a=>a.title).join(' · ')}</div>
              </div>
            </div>
            <button onClick={()=>setShowAlerts(true)} style={{background:'#DC2626',color:'#fff',border:'none',borderRadius:8,padding:'9px 18px',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>Review Alerts</button>
          </div>
        )}

        {/* Compliance Indicator */}
        <div style={{background:'#fff',borderRadius:12,padding:'20px 24px',marginBottom:20,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
          <div style={{fontWeight:700,color:N,fontSize:14,marginBottom:12}}>Compliance Confidence Indicator (IRS-Aligned)</div>
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:14}}>
            <div style={{fontSize:36,fontWeight:800,color:'#059669'}}>87%</div>
            <div style={{flex:1,height:8,background:'#E2E8F0',borderRadius:4,overflow:'hidden'}}>
              <div style={{width:'87%',height:'100%',background:'linear-gradient(90deg,#059669,#34D399)',borderRadius:4}}></div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
            {[{t:'Schedule E mapping',s:'Complete',ok:true},{t:'Depreciation MACRS',s:'Aligned',ok:true},{t:'Officer compensation',s:'Review needed',ok:false},{t:'State tax awareness',s:'Active',ok:true}].map(item=>(<div key={item.t} style={{fontSize:13,color:item.ok?'#059669':'#D97706',fontWeight:500}}>{item.ok?'🟢':'🟡'} {item.t}: {item.s}</div>))}
          </div>
        </div>

        {/* Feature Grid with tabs */}
        <div style={{background:'#fff',borderRadius:12,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',marginBottom:24,overflow:'hidden'}}>
          <div style={{borderBottom:'1px solid #E2E8F0',padding:'0 24px',display:'flex',gap:0,overflowX:'auto'}}>
            {CATEGORIES.map((cat,i)=>(<button key={cat.label} onClick={()=>setActiveTab(i)} style={{padding:'16px 18px',background:'transparent',border:'none',borderBottom:activeTab===i?`2px solid ${cat.color}`:'2px solid transparent',color:activeTab===i?cat.color:SL,fontWeight:activeTab===i?700:500,fontSize:13,cursor:'pointer',whiteSpace:'nowrap',marginBottom:-1}}>{cat.label}</button>))}
          </div>
          <div style={{padding:24}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
              {CATEGORIES[activeTab].features.map(f=>(<div key={f.n} style={{padding:'14px 16px',borderRadius:10,background:f.status==='coming'?'#F8FAFC':'#F0FDF4',border:`1px solid ${f.status==='coming'?'#E2E8F0':'#BBF7D0'}`}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6}}>
                  <div style={{fontWeight:700,color:N,fontSize:13}}>{f.n}. {f.t}</div>
                  <span style={{background:f.status==='coming'?'#E2E8F0':'#059669',color:f.status==='coming'?SL:'#fff',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,flexShrink:0,marginLeft:8,textTransform:'uppercase'}}>{f.status==='coming'?'SOON':'ACTIVE'}</span>
                </div>
                <div style={{color:SL,fontSize:12,lineHeight:1.5}}>{f.d}</div>
              </div>))}
            </div>
          </div>
        </div>

        {/* Action Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:24}}>
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'22px 20px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
            <div style={{fontSize:32,marginBottom:10}}>📋</div>
            <div style={{fontWeight:700,color:N,fontSize:14,marginBottom:6}}>Generate CPA Export Pack</div>
            <div style={{color:SL,fontSize:12,marginBottom:16,lineHeight:1.5}}>One-click IRS-friendly report for your accountant.</div>
            <button style={{padding:'10px 20px',background:'#0D1B3E',color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',width:'100%'}}>Generate Report</button>
          </div>
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'22px 20px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
            <div style={{fontSize:32,marginBottom:10}}>🎯</div>
            <div style={{fontWeight:700,color:N,fontSize:14,marginBottom:6}}>Run What-If Simulator</div>
            <div style={{color:SL,fontSize:12,marginBottom:16,lineHeight:1.5}}>Model a financial decision without affecting real data.</div>
            <button onClick={()=>setShowSimulator(true)} style={{padding:'10px 20px',background:'#059669',color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',width:'100%'}}>Open Simulator</button>
          </div>
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'22px 20px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
            <div style={{fontSize:32,marginBottom:10}}>🛡️</div>
            <div style={{fontWeight:700,color:N,fontSize:14,marginBottom:6}}>View Audit Defense Narrative</div>
            <div style={{color:SL,fontSize:12,marginBottom:16,lineHeight:1.5}}>Plain-English IRS correspondence ready to send.</div>
            <button style={{padding:'10px 20px',background:'#7C3AED',color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer',width:'100%'}}>View Narrative</button>
          </div>
        </div>
      </div>
    </div>
  )
}
