import { PageNav, PageFooter } from './PageNav'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const S=({title,children})=>(<div style={{marginBottom:28}}><h2 style={{fontSize:18,fontWeight:800,color:N,margin:'0 0 10px'}}>{title}</h2><div style={{color:SL,fontSize:14,lineHeight:1.85}}>{children}</div></div>)
export default function Terms(){return(
  <div style={{minHeight:'100vh',background:'#F8FAFC',fontFamily:'-apple-system,sans-serif'}}>
    <PageNav/>
    <div style={{maxWidth:780,margin:'0 auto',padding:'60px 24px'}}>
      <h1 style={{fontSize:36,fontWeight:900,color:N,margin:'0 0 4px'}}>Terms of Service</h1>
      <p style={{color:'#94A3B8',fontSize:13,margin:'0 0 40px'}}>Last updated: January 1, 2026</p>
      <S title="1. Acceptance"><p>By accessing or using TaxStat360, you agree to these Terms. If you do not agree, do not use the platform.</p></S>
      <S title="2. Description of Service"><p>TaxStat360 provides AI-powered tax intelligence software for S-Corporations, Multi-Member LLCs, and Partnerships. The platform is an informational tool and does not constitute legal or tax advice.</p></S>
      <S title="3. Not Tax or Legal Advice"><p style={{background:'#FEF9C3',padding:'14px 16px',borderRadius:8,borderLeft:'4px solid #EAB308'}}>IMPORTANT: TaxStat360 is an AI-powered informational tool, not a tax or legal advisory service. Always consult a qualified tax professional for advice specific to your situation.</p></S>
      <S title="4. Subscription and Billing"><p>All plans include a 7-day free trial with no charge until the trial ends. Subscriptions are billed monthly and auto-renew unless cancelled. You may cancel anytime before trial end at no charge.</p></S>
      <S title="5. Acceptable Use"><p>You agree not to: use the platform for illegal purposes, reverse engineer or copy the platform, share account credentials, input false data, or use the platform to facilitate tax fraud or evasion.</p></S>
      <S title="6. Intellectual Property"><p>All content, features, algorithms, and designs of TaxStat360 are owned by TaxStat360 and protected by intellectual property law.</p></S>
      <S title="7. Limitation of Liability"><p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, TAXSTAT360 SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES. TOTAL LIABILITY SHALL NOT EXCEED AMOUNTS PAID IN THE PRECEDING THREE MONTHS.</p></S>
      <S title="8. Governing Law"><p>These Terms are governed by the laws of the State of Georgia, United States.</p></S>
      <S title="9. Contact"><p><a href="mailto:support@taxstat360.com" style={{color:B}}>support@taxstat360.com</a></p></S>
    </div>
    <PageFooter/>
  </div>
)}
