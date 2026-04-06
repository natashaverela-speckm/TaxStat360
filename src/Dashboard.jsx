import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
export default function Dashboard(){
  const nav=useNavigate()
  const token=localStorage.getItem('access_token')
  return(<div style={{minHeight:'100vh',background:'#F0F4FF',fontFamily:'Inter,sans-serif'}}>
    <div style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 32px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{fontWeight:700,color:N,fontSize:16}}>TaxStat360</div>
      <div style={{display:'flex',gap:8}}>
        {[['Dashboard','/dashboard'],['Calculate Tax','/calculate-tax'],['AI Analysis','/ai-analysis']].map(([l,p])=>(
          <button key={p} onClick={()=>nav(p)} style={{padding:'6px 16px',borderRadius:6,border:'none',background:p==='/dashboard'?B:'transparent',color:p==='/dashboard'?'#fff':SL,fontWeight:600,fontSize:13,cursor:'pointer'}}>{l}</button>
        ))}
      </div>
      <button onClick={()=>{localStorage.clear();nav('/')}} style={{padding:'6px 16px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontSize:13,cursor:'pointer'}}>Sign Out</button>
    </div>
    <div style={{maxWidth:1100,margin:'0 auto',padding:'32px 24px'}}>
      <h1 style={{color:N,fontSize:24,fontWeight:700,marginBottom:8}}>Welcome to TaxStat360</h1>
      <p style={{color:SL,fontSize:14,marginBottom:32}}>Your AI-powered tax intelligence platform for S-Corps, Multi-Member LLCs, and Partnerships.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,marginBottom:32}}>
        {[
          {icon:'📊',title:'Calculate Tax',desc:'Enter your K-1 data and get instant tax calculations with Schedule E auto-population.',btn:'Start Calculation',path:'/calculate-tax'},
          {icon:'🤖',title:'AI Analysis',desc:'Get personalized tax recommendations, audit risk assessment, and savings opportunities.',btn:'View Analysis',path:'/ai-analysis'},
          {icon:'🔗',title:'Connect Accounting',desc:'Link QuickBooks, Xero, Wave, or FreshBooks to auto-import your financial data.',btn:'Connect Now',path:'/onboarding/import'},
        ].map(c=>(
          <div key={c.title} style={{background:'#fff',borderRadius:12,padding:24,boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
            <div style={{fontSize:32,marginBottom:12}}>{c.icon}</div>
            <div style={{fontWeight:700,color:N,fontSize:16,marginBottom:8}}>{c.title}</div>
            <div style={{color:SL,fontSize:13,marginBottom:16,lineHeight:1.5}}>{c.desc}</div>
            <button onClick={()=>nav(c.path)} style={{padding:'10px 20px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,fontSize:13,cursor:'pointer'}}>{c.btn} →</button>
          </div>
        ))}
      </div>
    </div>
  </div>)
}
