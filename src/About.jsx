import { useNavigate } from 'react-router-dom'
import { PageNav } from './PageNav.jsx'

const N='#0D1B3E',B='#2563EB',SL='#475569'
const Page=({children})=><div style={{minHeight:'100vh',background:'#F8FAFC'}}><PageNav/><div style={{maxWidth:900,margin:'0 auto',padding:'60px 24px'}}>{children}</div></div>

const WHO=[
  {icon:'🏢',title:'S-Corporations',text:'Reasonable compensation, shareholder distributions, built-in gains — we map your exact risk profile and keep you IRS-aligned.'},
  {icon:'🤝',title:'Multi-Member LLCs',text:'Schedule K-1 complexity and allocation inconsistencies are among the top audit triggers. We catch them first.'},
  {icon:'📊',title:'Partnerships',text:'Partnership audits have surged under the BBA regime. TaxStat360 prepares you for the scrutiny before it arrives.'},
  {icon:'👤',title:'Sole Proprietors',text:'Schedule C filers face audit rates 3x higher than other entity types — yet most cannot afford a dedicated tax advisor. TaxStat360 gives you professional-grade IRS intelligence at a fraction of the cost.'},
  {icon:'🏬',title:'Single-Member LLCs',text:'As a disregarded entity you carry full self-employment tax exposure with none of the built-in protections of a larger structure. We surface your deduction opportunities and flag your risks — the way a $400/hr tax attorney would, without the bill.'},
  {icon:'💼',title:'CPAs & Advisors',text:'Add AI-powered IRS intelligence to your client advisory practice. Our CPA export tools make collaboration seamless.'},
]

export default function About(){
  const nav=useNavigate()
  return(
    <Page>
      <div style={{textAlign:'center',background:`linear-gradient(135deg,${N} 0%,#1e3a5f 100%)`,borderRadius:16,padding:'60px 40px',marginBottom:48,color:'white'}}>
        <div style={{fontSize:13,fontWeight:700,letterSpacing:3,color:'#93C5FD',marginBottom:12}}>ABOUT US</div>
        <h1 style={{fontSize:36,fontWeight:900,margin:'0 0 16px'}}>Built From the Inside Out</h1>
        <p style={{fontSize:16,color:'#CBD5E1',maxWidth:600,margin:'0 auto',lineHeight:1.7}}>TaxStat360 was built by a team of certified tax professionals and IRS-trained specialists who spent years on the other side of the audit table — and decided to change whose side they were on.</p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16,marginBottom:48}}>
        {[['$100M+','Client Tax Savings'],['15+','Years IRS Experience'],['10,000+','IRS Schedules Mapped'],['98%','Compliance Rate']].map(([n,l])=>(
          <div key={l} style={{background:'white',borderRadius:12,padding:24,textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.07)'}}>
            <div style={{fontSize:28,fontWeight:900,color:B}}>{n}</div>
            <div style={{fontSize:13,color:SL,marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{background:'white',borderRadius:16,padding:'40px',boxShadow:'0 1px 4px rgba(0,0,0,0.07)',marginBottom:48}}>
        <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 20px'}}>Our Mission</h2>
        <p style={{color:SL,fontSize:15,lineHeight:1.85,margin:'0 0 16px'}}>Fortune 500 companies retain specialized tax law firms and forensic accounting teams to navigate IRS risk. The average business owner has none of that — and the IRS knows it.</p>
        <p style={{color:SL,fontSize:15,lineHeight:1.85,margin:'0 0 16px'}}>We built TaxStat360 for every business owner, including the ones the tax industry has historically ignored. Sole proprietors and single-member LLCs are among the most audited entity types in the country — with Schedule C audit rates running 3x higher than other filers — yet they are the least likely to have professional representation when it happens.</p>
        <p style={{color:SL,fontSize:15,lineHeight:1.85,margin:'0 0 16px'}}>A CPA who specializes in IRS audit defense can cost $300–$500 per hour. A tax attorney is more. Most sole proprietors and single-member LLC owners are running their businesses on tight margins, reinvesting every dollar back into growth. Paying for that level of professional guidance is simply not realistic — even when the risk is very real.</p>
        <p style={{color:SL,fontSize:15,lineHeight:1.85,margin:'0 0 16px'}}>That is the gap TaxStat360 was built to close. Not just for S-Corps and partnerships with legal teams — but for the freelancer, the independent contractor, the consultant, the single-member LLC owner who files their own Schedule C and has no idea which deductions might trigger a flag.</p>
        <p style={{color:SL,fontSize:15,lineHeight:1.85,margin:0}}>Every business owner deserves access to IRS-grade intelligence — not just the ones who can afford it. That is what we stand behind.</p>
      </div>

      <div style={{marginBottom:48}}>
        <h2 style={{color:N,fontSize:22,fontWeight:800,margin:'0 0 20px'}}>Who We Serve</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:16}}>
          {WHO.map(({icon,title,text})=>(
            <div key={title} style={{background:'white',borderRadius:12,padding:24,boxShadow:'0 1px 4px rgba(0,0,0,0.07)'}}>
              <div style={{fontSize:28,marginBottom:10}}>{icon}</div>
              <div style={{fontWeight:700,color:N,fontSize:15,marginBottom:8}}>{title}</div>
              <div style={{color:SL,fontSize:13,lineHeight:1.6}}>{text}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{textAlign:'center',background:`linear-gradient(135deg,${N} 0%,#1e3a5f 100%)`,borderRadius:16,padding:'48px 40px',color:'white'}}>
        <h2 style={{fontSize:26,fontWeight:900,margin:'0 0 12px'}}>Ready to protect your business?</h2>
        <p style={{color:'#CBD5E1',margin:'0 0 28px',fontSize:15}}>Join thousands of business owners who trust TaxStat360 to stay IRS-ready year-round.</p>
        <button onClick={()=>nav('/signup')} style={{background:B,color:'white',border:'none',borderRadius:10,padding:'14px 32px',fontWeight:700,fontSize:15,cursor:'pointer'}}>Start Free Trial →</button>
      </div>
    </Page>
  )
}
