import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const N='#0D1B3E', B='#2563EB', SL='#475569'
const API='https://app.taxstat360.com'

const LOGO=()=>(
  <div style={{display:'flex',alignItems:'center',gap:10}}>
    <svg width="30" height="30" viewBox="0 0 34 34" fill="none">
      <rect width="34" height="34" rx="8" fill={N}/>
      <rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/>
      <rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/>
      <rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/>
      <rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/>
    </svg>
    <span style={{fontWeight:800,fontSize:18,color:N,borderBottom:'2px solid '+B,paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></span>
  </div>
)

const fmt = n => '$'+Math.abs(parseFloat(n)||0).toLocaleString('en-US',{maximumFractionDigits:0})

export default function Dashboard(){
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState('tax')
  const [records, setRecords] = useState([])
  const userName = localStorage.getItem('userName') || ''

  useEffect(()=>{
    const saved = JSON.parse(localStorage.getItem('ts360_records')||'[]')
    setRecords(saved)
  },[])

  const hasData = records.length > 0
  const latest = records[0] || null

  const TAB_ITEMS = [
    {id:'tax',    label:'My Tax Analysis'},
    {id:'ai',     label:'AI Insights'},
    {id:'connect',label:'Connect Software'},
  ]

  const Tab = ({id, label}) => (
    <button onClick={()=>setActiveTab(id)} style={{
      padding:'10px 22px', border:'none', borderBottom: activeTab===id ? '3px solid '+B : '3px solid transparent',
      background:'transparent', color: activeTab===id ? B : SL, fontWeight: activeTab===id ? 700 : 500,
      fontSize:14, cursor:'pointer', fontFamily:'Inter,sans-serif', transition:'all 0.15s'
    }}>{label}</button>
  )

  return (
    <div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      {/* Top nav — just logo and sign out */}
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',height:58,display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <LOGO/>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {userName && <span style={{fontSize:13,color:SL}}>Hi, <strong style={{color:N}}>{userName.split(' ')[0]}</strong></span>}
          <button onClick={()=>{localStorage.clear();nav('/')}} style={{padding:'7px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer',color:SL,fontWeight:600}}>Sign Out</button>
        </div>
      </nav>

      {/* Tab bar */}
      <div style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 28px',display:'flex',gap:4}}>
        {TAB_ITEMS.map(t=><Tab key={t.id} {...t}/>)}
      </div>

      {/* TAB: MY TAX ANALYSIS */}
      {activeTab==='tax' && (
        <div style={{maxWidth:960,margin:'0 auto',padding:'28px 20px'}}>
          {!hasData ? (
            /* No data yet — prompt to start */
            <div style={{textAlign:'center',padding:'60px 20px'}}>
              <div style={{fontSize:48,marginBottom:16}}>📊</div>
              <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 10px'}}>Let's calculate your taxes</h2>
              <p style={{color:SL,fontSize:14,lineHeight:1.7,margin:'0 0 28px',maxWidth:480,marginLeft:'auto',marginRight:'auto'}}>
                Enter your business income and personal details. We'll calculate your K-1 income and show you exactly what you owe on your Form 1040 — in real time.
              </p>
              <button onClick={()=>nav('/calculate-tax')} style={{padding:'14px 36px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:16,cursor:'pointer'}}>
                Start My Tax Calculation →
              </button>
            </div>
          ) : (
            /* Has data — show analysis inline */
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
                <div>
                  <h1 style={{fontSize:20,fontWeight:800,color:N,margin:0}}>Your Tax Analysis — {latest.biz.year}</h1>
                  <p style={{color:SL,fontSize:13,margin:'4px 0 0'}}>{latest.biz.entityType} · Last updated {latest.savedAt}</p>
                </div>
                <button onClick={()=>nav('/calculate-tax')} style={{padding:'9px 18px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  + New / Update Calculation
                </button>
              </div>
              {/* Summary cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
                {[
                  {label:'Gross Revenue',    val:latest.biz.grossRevenue,    color:N},
                  {label:'Business Expenses',val:latest.biz.businessExpenses,color:N},
                  {label:'K-1 Income',       val:latest.k1Income,            color:'#1D4ED8'},
                  {label:'Est. Tax Owed',    val:latest.tax?.taxOwed||0,     color:'#DC2626'},
                ].map(({label,val,color})=>(
                  <div key={label} style={{background:'#fff',borderRadius:12,padding:'16px 18px',boxShadow:'0 1px 6px rgba(0,0,0,0.05)'}}>
                    <div style={{fontSize:11,color:SL,fontWeight:600,marginBottom:6}}>{label}</div>
                    <div style={{fontSize:20,fontWeight:800,color}}>{fmt(val)}</div>
                  </div>
                ))}
              </div>
              <p style={{color:SL,fontSize:13,textAlign:'center'}}>
                For the full breakdown, open your <button onClick={()=>nav('/calculate-tax')} style={{background:'none',border:'none',color:B,fontWeight:600,cursor:'pointer',fontSize:13,padding:0}}>Tax Calculator →</button>
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB: AI INSIGHTS */}
      {activeTab==='ai' && (
        <div style={{maxWidth:960,margin:'0 auto',padding:'28px 20px'}}>
          {!hasData ? (
            <div style={{textAlign:'center',padding:'60px 20px'}}>
              <div style={{fontSize:48,marginBottom:16}}>🤖</div>
              <h2 style={{color:N,fontSize:20,fontWeight:800,margin:'0 0 10px'}}>AI Insights Waiting</h2>
              <p style={{color:SL,fontSize:14,lineHeight:1.7,margin:'0 0 24px',maxWidth:440,marginLeft:'auto',marginRight:'auto'}}>
                Your personalized AI recommendations, audit risk alerts, and tax-saving opportunities will appear here once you enter your numbers.
              </p>
              <button onClick={()=>{setActiveTab('tax');nav('/calculate-tax')}} style={{padding:'12px 28px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:14,cursor:'pointer'}}>
                Enter My Numbers First →
              </button>
            </div>
          ) : (
            <div>
              <h1 style={{fontSize:20,fontWeight:800,color:N,margin:'0 0 4px'}}>AI Insights</h1>
              <p style={{color:SL,fontSize:13,margin:'0 0 20px'}}>Based on your {latest.biz.year} tax data — {latest.biz.entityType}</p>
              <button onClick={()=>nav('/ai-analysis')} style={{padding:'11px 22px',background:B,color:'#fff',border:'none',borderRadius:9,fontWeight:700,fontSize:14,cursor:'pointer'}}>
                View Full AI Analysis & 32 Features →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: CONNECT SOFTWARE */}
      {activeTab==='connect' && (
        <div style={{maxWidth:640,margin:'0 auto',padding:'28px 20px'}}>
          <h2 style={{fontSize:20,fontWeight:800,color:N,margin:'0 0 4px'}}>Connect Your Accounting Software</h2>
          <p style={{color:SL,fontSize:13,margin:'0 0 20px',lineHeight:1.6}}>Sync your financials directly from your accounting software. Once connected, your numbers will be available when you run your tax calculation.</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[
              {id:'quickbooks', name:'QuickBooks', color:'#2CA01C', bg:'#F0FBF0', abbr:'QB', desc:'Sync P&L, Balance Sheet'},
              {id:'xero',       name:'Xero',       color:'#13B5EA', bg:'#EFF9FF', abbr:'XE', desc:'Sync Reports & Journals'},
              {id:'wave',       name:'Wave',       color:'#2C6ECB', bg:'#EFF4FF', abbr:'WV', desc:'Sync Income & Expenses'},
              {id:'freshbooks', name:'FreshBooks', color:'#1a9c3e', bg:'#F0FBF4', abbr:'FB', desc:'Sync Invoices & Reports'},
            ].map(i=>(
              <button key={i.id} onClick={()=>{window.open(API+'/integrations/'+i.id+'/connect','_blank'); localStorage.setItem('ts360_connected_app',i.name);}}
                style={{display:'flex',alignItems:'center',gap:14,padding:'16px',background:i.bg,border:'1.5px solid '+i.color+'33',borderRadius:12,cursor:'pointer',textAlign:'left'}}
                onMouseOver={e=>e.currentTarget.style.borderColor=i.color}
                onMouseOut={e=>e.currentTarget.style.borderColor=i.color+'33'}
              >
                <div style={{width:44,height:44,borderRadius:10,background:i.color,color:'#fff',fontWeight:800,fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{i.abbr}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:N}}>{i.name}</div>
                  <div style={{fontSize:12,color:SL,marginTop:2}}>{i.desc}</div>
                </div>
              </button>
            ))}
          </div>
          <p style={{fontSize:11,color:'#94A3B8',marginTop:14,textAlign:'center',lineHeight:1.5}}>
            Connecting opens a secure OAuth window. Your accounting credentials are never stored by TaxStat360.
          </p>
        </div>
      )}
    </div>
  )
}
