import { useNavigate } from 'react-router-dom'
import { PageNav, PageFooter } from './PageNav'
const N='#0D1B3E',B='#2563EB',SL='#475569'
export default function Why(){
  const nav=useNavigate()
  const rows=[
    {f:'Built on real IRS audit methodology',u:true,t:false},
    {f:'Real-time risk alert engine',u:true,t:false},
    {f:'What-If scenario simulator',u:true,t:false},
    {f:'All entity types (S-Corp, LLC, Partnership, Sole Prop)',u:true,t:false},
    {f:'AI-generated audit defense narratives',u:true,t:false},
    {f:'One-click CPA export pack',u:true,t:false},
    {f:'IRS schedule auto-mapping (C, E, K-1)',u:true,t:false},
    {f:'Explainable AI transparency',u:true,t:false},
    {f:'Safe harbor rule detection',u:true,t:true},
    {f:'Tax filing assistance',u:false,t:true},
  ]
  return(
    <div style={{minHeight:'100vh',background:'#F8FAFC',fontFamily:'-apple-system,sans-serif'}}>
      <PageNav/>
      <div style={{background:'linear-gradient(135deg,#0D1B3E 0%,#1e3a6e 100%)',padding:'72px 24px',textAlign:'center'}}>
        <p style={{color:'#60A5FA',fontWeight:700,fontSize:13,letterSpacing:'0.12em',textTransform:'uppercase',margin:'0 0 12px'}}>Why TaxStat360</p>
        <h1 style={{fontSize:42,fontWeight:900,color:'#fff',margin:'0 0 16px',lineHeight:1.15}}>Not Just Another Tax Tool</h1>
        <p style={{fontSize:18,color:'#94A3B8',maxWidth:620,margin:'0 auto',lineHeight:1.7}}>Most tax software helps you file. TaxStat360 helps every business owner — from sole proprietors to S-Corps — survive and win an IRS audit. There is a significant difference.</p>
      </div>
      <div style={{maxWidth:900,margin:'0 auto',padding:'60px 24px'}}>
        <div style={{background:'#fff',borderRadius:16,padding:'40px',marginBottom:32,border:'1px solid #E2E8F0'}}>
          <h2 style={{fontSize:24,fontWeight:800,color:N,margin:'0 0 8px',textAlign:'center'}}>TaxStat360 vs. Traditional Tax Software</h2>
          <p style={{color:SL,fontSize:14,textAlign:'center',margin:'0 0 28px'}}>See why business owners are switching to IRS-grade intelligence.</p>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th style={{textAlign:'left',padding:'12px 16px',color:SL,fontSize:13,fontWeight:600,borderBottom:'2px solid #E2E8F0'}}>Feature</th>
                <th style={{textAlign:'center',padding:'12px 16px',color:B,fontSize:13,fontWeight:700,borderBottom:'2px solid #E2E8F0',background:'#EFF6FF'}}>TaxStat360</th>
                <th style={{textAlign:'center',padding:'12px 16px',color:SL,fontSize:13,fontWeight:600,borderBottom:'2px solid #E2E8F0'}}>Traditional Software</th>
              </tr></thead>
              <tbody>{rows.map((r,i)=>(
                <tr key={i} style={{background:i%2===0?'#F8FAFC':'#fff'}}>
                  <td style={{padding:'13px 16px',fontSize:14,color:N,fontWeight:500}}>{r.f}</td>
                  <td style={{textAlign:'center',padding:'13px 16px',background:'#EFF6FF'}}>{r.u?'✅':'❌'}</td>
                  <td style={{textAlign:'center',padding:'13px 16px'}}>{r.t?'✅':'❌'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:20,marginBottom:32}}>
          {[
            {icon:'🛡️',title:'IRS Intelligence, Not Guesswork',text:'Every algorithm is built on actual IRS audit selection criteria — the same data the IRS uses to decide who gets audited and why.'},
            {icon:'⚡',title:'Proactive, Not Reactive',text:'Traditional tax software tells you what happened. TaxStat360 tells you what is about to happen — surfacing risk flags before they become problems.'},
            {icon:'📋',title:'Audit-Ready by Design',text:'Every analysis and recommendation is documented in an audit-defensible format. When the IRS comes knocking, you are prepared.'},
            {icon:'🎯',title:'Entity-Specific Precision',text:'Every entity type — S-Corps, Multi-Member LLCs, Partnerships, Sole Proprietors, and Single-Member LLCs — has a distinct tax profile and audit exposure. TaxStat360 is precision-built for all of them.'},
            {icon:'💰',title:'ROI That Pays for Itself',text:'Most users find $8,000+ in savings in their first analysis. At $79/month, TaxStat360 pays for itself many times over.'},
            {icon:'🔄',title:'Continuous Monitoring',text:'Tax risk does not take a day off. TaxStat360 monitors your compliance posture continuously, not just at year-end.'},
          ].map((f,i)=>(
            <div key={i} style={{background:'#fff',borderRadius:14,padding:'28px',border:'1px solid #E2E8F0'}}>
              <div style={{fontSize:32,marginBottom:12}}>{f.icon}</div>
              <h3 style={{color:N,fontWeight:700,fontSize:16,margin:'0 0 8px'}}>{f.title}</h3>
              <p style={{color:SL,fontSize:14,lineHeight:1.75,margin:0}}>{f.text}</p>
            </div>
          ))}
        </div>
        <div style={{background:N,borderRadius:16,padding:'40px',textAlign:'center'}}>
          <h2 style={{fontSize:24,fontWeight:800,color:'#fff',margin:'0 0 12px'}}>See the difference — free for 7 days</h2>
          <p style={{color:'#94A3B8',fontSize:15,margin:'0 0 24px'}}>No credit card until trial ends. Cancel anytime.</p>
          <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
            <button onClick={()=>nav('/')} style={{background:B,color:'#fff',border:'none',borderRadius:10,padding:'13px 32px',fontWeight:700,fontSize:16,cursor:'pointer'}}>Start Free Trial</button>
            <button onClick={()=>nav('/contact')} style={{background:'transparent',color:'#fff',border:'1px solid rgba(255,255,255,0.3)',borderRadius:10,padding:'13px 32px',fontWeight:700,fontSize:16,cursor:'pointer'}}>Talk to Our Team</button>
          </div>
        </div>
      </div>
      <PageFooter/>
    </div>
  )
}
