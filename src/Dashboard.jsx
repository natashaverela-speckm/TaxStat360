import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const LOGO=()=>(<div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}><svg width="34" height="34" viewBox="0 0 34 34" style={{flexShrink:0}}><rect width="34" height="34" rx="8" fill="#0D1B3E"/><rect x="5" y="22" width="5" height="9" rx="1.5" fill="white" opacity="0.3"/><rect x="12" y="17" width="5" height="14" rx="1.5" fill="white" opacity="0.55"/><rect x="19" y="11" width="5" height="20" rx="1.5" fill="white" opacity="0.8"/><rect x="26" y="5" width="4" height="26" rx="1.5" fill="white"/></svg><div style={{fontWeight:800,color:N,fontSize:18,letterSpacing:'-0.3px',borderBottom:'2px solid #2563EB',paddingBottom:'1px'}}>TaxStat<span style={{color:B}}>360</span></div></div>)

const now = new Date()
const getGreeting = () => {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const DEADLINES = (() => {
  const now = new Date()
  const diff = (y,m,d) => Math.max(0, Math.round((new Date(y,m-1,d) - now) / 86400000))
  const yr = now.getFullYear()
  // Pick the right year so dates are always in the future
  const y1 = now > new Date(yr,3,15) ? yr+1 : yr  // Apr 15
  const y2 = now > new Date(yr,5,16) ? yr+1 : yr  // Jun 16
  const y3 = now > new Date(yr,3,30) ? yr+1 : yr  // Apr 30
  const y4 = now > new Date(yr,8,15) ? yr+1 : yr  // Sep 15
  return [
    { label:'Q1 Estimated Tax', date:'Apr 15, '+y1, days:diff(y1,4,15), color:'#DC2626' },
    { label:'Q2 Estimated Tax', date:'Jun 16, '+y2, days:diff(y2,6,16), color:'#059669' },
    { label:'S-Corp Payroll (Q1)', date:'Apr 30, '+y3, days:diff(y3,4,30), color:'#D97706' },
    { label:'Form 1120-S Extension', date:'Sep 15, '+y4, days:diff(y4,9,15), color:'#2563EB' },
  ].sort((a,b)=>a.days-b.days).slice(0,3)
})()

const ACTIVITY = (() => {
  const fmt = (h) => {
    if (h < 1) return 'Just now'
    if (h < 24) return Math.round(h) + ' hour' + (Math.round(h)===1?'':'s') + ' ago'
    const d = Math.round(h/24)
    return d === 1 ? 'Yesterday' : d + ' days ago'
  }
  const n = Date.now()
  return [
    { icon:'🧠', text:'AI Analysis completed — 3 risk alerts identified', time: fmt((n - (localStorage.getItem('lastAnalysis')||n-7200000))/3600000) },
    { icon:'📊', text:'K-1 tax calculation run for FY 2024', time: fmt((n - (localStorage.getItem('lastCalc')||n-86400000))/3600000) },
    { icon:'✅', text:'Compliance score updated to 87%', time: fmt((n - (localStorage.getItem('lastScore')||n-172800000))/3600000) },
    { icon:'🔔', text:'Officer compensation review flagged', time: fmt((n - (localStorage.getItem('lastAlert')||n-259200000))/3600000) },
  ]
})()

export default function Dashboard() {
  const nav = useNavigate()
  const cards = [
    { icon:'📊', title:'Calculate Tax', desc:'Enter your K-1 data and get instant tax calculations with Schedule E auto-population.', btn:'Start Calculation', path:'/calculate-tax', color:'#2563EB' },
    { icon:'🤖', title:'AI Analysis', desc:'Get personalized tax recommendations, audit risk assessment, and savings opportunities.', btn:'View Analysis', path:'/ai-analysis', color:'#7C3AED' },
    { icon:'🔗', title:'Connect Accounting', desc:'Link QuickBooks, Xero, Wave, or FreshBooks to auto-import your financial data.', btn:'Connect Now', path:'/onboarding/import', color:'#059669' },
  ]
  return (
    <div style={{minHeight:'100vh',background:'#F1F5FB'}}>
      <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 24px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div onClick={()=>nav('/')} style={{cursor:'pointer'}}><LOGO/></div>
        <div style={{display:'flex',gap:8}}>
          {['Dashboard','Calculate Tax','AI Analysis'].map((l,i)=>(<button key={l} onClick={()=>nav(['/dashboard','/calculate-tax','/ai-analysis'][i])} style={{padding:'8px 16px',background:i===0?B:'transparent',color:i===0?'#fff':SL,border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>{l}</button>))}
          <button onClick={()=>nav('/login')} style={{padding:'8px 16px',background:'transparent',color:SL,border:'1px solid #E2E8F0',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Sign Out</button>
        </div>
      </nav>
      <div style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px'}}>

        {/* Welcome Header */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:22,fontWeight:800,color:N,marginBottom:4}}>{getGreeting()}, {localStorage.getItem('userName')||'there'} 👋</div>
          <div style={{color:SL,fontSize:14}}>Here's your tax intelligence summary for {now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
        </div>

        {/* Stat Bar */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
          {[
            { label:'Compliance Score', value:'87%', sub:'IRS-Aligned', color:'#059669', bg:'#F0FDF4' },
            { label:'Risk Alerts', value:'3', sub:'Needs attention', color:'#DC2626', bg:'#FEF2F2' },
            { label:'Tax Savings Found', value:'$8,420', sub:'Estimated opportunity', color:'#7C3AED', bg:'#F5F3FF' },
            { label:'Active AI Features', value:'25/32', sub:'Fully operational', color:B, bg:'#EFF6FF' },
          ].map(s=>(
            <div key={s.label} style={{background:s.bg,borderRadius:12,padding:'18px 20px',border:`1px solid ${s.color}22`}}>
              <div style={{fontSize:11,fontWeight:700,color:SL,letterSpacing:'0.8px',textTransform:'uppercase',marginBottom:6}}>{s.label}</div>
              <div style={{fontSize:28,fontWeight:800,color:s.color,marginBottom:2}}>{s.value}</div>
              <div style={{fontSize:12,color:SL}}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Main Grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20,marginBottom:20}}>

          {/* Action Cards */}
          <div>
            <div style={{fontSize:13,fontWeight:700,color:N,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:12}}>Quick Actions</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
              {cards.map(c=>(
                <div key={c.title} style={{background:'#fff',borderRadius:12,padding:22,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',borderTop:`3px solid ${c.color}`}}>
                  <div style={{fontSize:30,marginBottom:10}}>{c.icon}</div>
                  <div style={{fontWeight:700,color:N,fontSize:15,marginBottom:6}}>{c.title}</div>
                  <div style={{color:SL,fontSize:12,marginBottom:16,lineHeight:1.5}}>{c.desc}</div>
                  <button onClick={()=>nav(c.path)} style={{padding:'9px 18px',background:c.color,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:12,cursor:'pointer',width:'100%'}}>{c.btn} →</button>
                </div>
              ))}
            </div>

            {/* Upcoming Deadlines */}
            <div style={{marginTop:20,background:'#fff',borderRadius:12,padding:22,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
              <div style={{fontSize:13,fontWeight:700,color:N,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:16}}>⏰ Upcoming Tax Deadlines</div>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {DEADLINES.map(d=>(
                  <div key={d.label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'#F8FAFC',borderRadius:8,borderLeft:`4px solid ${d.color}`}}>
                    <div>
                      <div style={{fontWeight:600,color:N,fontSize:13}}>{d.label}</div>
                      <div style={{color:SL,fontSize:12,marginTop:2}}>{d.date}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontWeight:700,color:d.color,fontSize:18}}>{d.days}</div>
                      <div style={{color:SL,fontSize:11}}>days away</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div style={{background:'#fff',borderRadius:12,padding:22,boxShadow:'0 1px 4px rgba(0,0,0,0.06)',height:'fit-content'}}>
            <div style={{fontSize:13,fontWeight:700,color:N,letterSpacing:'0.5px',textTransform:'uppercase',marginBottom:16}}>Recent Activity</div>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {ACTIVITY.map((a,i)=>(
                <div key={i} style={{display:'flex',gap:12,padding:'12px 0',borderBottom:i<ACTIVITY.length-1?'1px solid #F1F5F9':'none'}}>
                  <div style={{fontSize:20,flexShrink:0}}>{a.icon}</div>
                  <div>
                    <div style={{fontSize:12,color:N,fontWeight:500,lineHeight:1.4,marginBottom:4}}>{a.text}</div>
                    <div style={{fontSize:11,color:'#94A3B8'}}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={()=>nav('/ai-analysis')} style={{marginTop:16,width:'100%',padding:'10px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>Run Full AI Analysis →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
