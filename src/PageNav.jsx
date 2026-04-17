import { useNavigate } from 'react-router-dom'
const N='#0D1B3E',B='#2563EB'
export function PageNav(){
  const nav=useNavigate()
  return(
    <nav style={{background:'#fff',borderBottom:'1px solid #E2E8F0',padding:'0 32px',display:'flex',alignItems:'center',justifyContent:'space-between',height:64,position:'sticky',top:0,zIndex:50,flexWrap:'wrap',gap:8}}>
      <div onClick={()=>nav('/')} style={{cursor:'pointer',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,background:N,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="14" width="4" height="8" rx="1" fill="white" opacity="0.5"/><rect x="8" y="9" width="4" height="13" rx="1" fill="white" opacity="0.75"/><rect x="14" y="4" width="4" height="18" rx="1" fill="white"/></svg>
          </div>
          <span style={{fontWeight:800,fontSize:17,color:N}}>TaxStat<span style={{color:B}}>360</span></span>
        </div>
        <p style={{fontSize:9,color:'#64748B',margin:'1px 0 0 42px',letterSpacing:'0.08em',textTransform:'uppercase',fontWeight:600}}>IRS-Proven · Audit-Ready · Trusted</p>
      </div>
      <div style={{display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
        <a href='/about' style={{color:'#475569',fontSize:14,fontWeight:600,textDecoration:'none'}}>About</a>
        <a href='/why-taxstat360' style={{color:'#475569',fontSize:14,fontWeight:600,textDecoration:'none'}}>Why Us</a>
        <a href='/contact' style={{color:'#475569',fontSize:14,fontWeight:600,textDecoration:'none'}}>Contact</a>
        <button onClick={()=>nav('/login')} style={{background:'transparent',color:N,border:'1px solid #E2E8F0',borderRadius:8,padding:'7px 16px',fontWeight:600,fontSize:14,cursor:'pointer'}}>Sign In</button>
        <button onClick={()=>nav('/')} style={{background:B,color:'#fff',border:'none',borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:14,cursor:'pointer'}}>Get Started Free</button>
      </div>
    </nav>
  )
}
export function PageFooter(){
  return(
    <footer style={{background:'#F1F5F9',borderTop:'1px solid #E2E8F0',padding:'32px 24px',textAlign:'center'}}>
      <div style={{display:'flex',gap:24,justifyContent:'center',flexWrap:'wrap',marginBottom:12}}>
        {[['/',  'Home'],['/about','About'],['/why-taxstat360','Why TaxStat360'],['/contact','Contact'],['/privacy','Privacy Policy'],['/terms','Terms of Service']].map(([h,l],i)=><a key={i} href={h} style={{color:'#64748B',fontSize:13,textDecoration:'none',fontWeight:500}}>{l}</a>)}
      </div>
      <p style={{color:'#94A3B8',fontSize:12,margin:0}}>© 2026 TaxStat360 · AI Tax Intelligence for Every Business Entity · <a href='mailto:support@taxstat360.com' style={{color:'#94A3B8'}}>support@taxstat360.com</a></p>
    </footer>
  )
}
