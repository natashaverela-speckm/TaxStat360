import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB',SL='#475569'
export default function Landing(){
  const nav=useNavigate()
  return(<div style={{fontFamily:'Inter,sans-serif',minHeight:'100vh',background:'#F0F4FF'}}>
    <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 32px',height:60,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{fontWeight:700,color:N,fontSize:18}}>TaxStat360</div>
      <div style={{display:'flex',gap:12}}>
        <button onClick={()=>nav('/login')} style={{padding:'8px 20px',border:'1px solid #E2E8F0',borderRadius:8,background:'#fff',fontWeight:600,cursor:'pointer'}}>Sign In</button>
        <button onClick={()=>nav('/signup')} style={{padding:'8px 20px',background:B,color:'#fff',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>Get Started Free</button>
      </div>
    </nav>
    <div style={{textAlign:'center',padding:'80px 24px'}}>
      <div style={{fontSize:13,fontWeight:600,color:B,marginBottom:16,letterSpacing:1}}>BUILT BY A FORMER IRS REVENUE AGENT</div>
      <h1 style={{fontSize:48,fontWeight:800,color:N,margin:'0 0 16px'}}>Your Tax Strategy,<br/><span style={{color:B}}>Powered by Intelligence</span></h1>
      <p style={{color:SL,fontSize:18,marginBottom:32}}>TaxStat360 analyzes your financial data and delivers AI-powered tax strategies for S-Corps, Multi-Member LLCs, and Partnerships.</p>
      <div style={{display:'flex',gap:12,justifyContent:'center'}}>
        <button onClick={()=>nav('/signup')} style={{padding:'14px 32px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:16,cursor:'pointer'}}>Get Started Free →</button>
        <button onClick={()=>nav('/login')} style={{padding:'14px 32px',background:'#fff',color:N,border:'1px solid #E2E8F0',borderRadius:10,fontWeight:700,fontSize:16,cursor:'pointer'}}>Sign In</button>
      </div>
    </div>
  </div>)
}
