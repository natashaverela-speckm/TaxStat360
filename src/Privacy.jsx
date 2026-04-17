import { PageNav, PageFooter } from './PageNav'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const S=({title,children})=>(<div style={{marginBottom:28}}><h2 style={{fontSize:18,fontWeight:800,color:N,margin:'0 0 10px'}}>{title}</h2><div style={{color:SL,fontSize:14,lineHeight:1.85}}>{children}</div></div>)
export default function Privacy(){return(
  <div style={{minHeight:'100vh',background:'#F8FAFC',fontFamily:'-apple-system,sans-serif'}}>
    <PageNav/>
    <div style={{maxWidth:780,margin:'0 auto',padding:'60px 24px'}}>
      <h1 style={{fontSize:36,fontWeight:900,color:N,margin:'0 0 4px'}}>Privacy Policy</h1>
      <p style={{color:'#94A3B8',fontSize:13,margin:'0 0 40px'}}>Last updated: January 1, 2026</p>
      <S title="1. Introduction"><p>TaxStat360 is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our platform at taxstat360.com.</p></S>
      <S title="2. Information We Collect"><p style={{marginBottom:8}}><strong>Account Information:</strong> Name, email address, business name, and entity type when you register.</p><p style={{marginBottom:8}}><strong>Business Data:</strong> Financial data you enter to receive tax intelligence, including revenue, expenses, and entity structure.</p><p style={{marginBottom:8}}><strong>Usage Data:</strong> How you interact with the platform, including features used and pages visited.</p><p><strong>Payment Information:</strong> Processed by Stripe. We do not store credit card data on our servers.</p></S>
      <S title="3. How We Use Your Information"><p style={{marginBottom:8}}>We use your information to: provide the TaxStat360 platform, generate AI-powered tax intelligence, process payments, send transactional emails, respond to support requests, and comply with legal obligations.</p></S>
      <S title="4. Data Security"><p>We implement industry-standard security including encryption in transit (TLS/HTTPS) and at rest, access controls, and regular security reviews. We use AWS enterprise-grade infrastructure.</p></S>
      <S title="5. Data Sharing"><p>We do not sell your personal information. We share data only with trusted service providers (AWS, Stripe, Anthropic) bound by data protection agreements, solely to operate the platform.</p></S>
      <S title="6. Your Rights"><p>You may access, correct, or delete your personal information at any time by contacting support@taxstat360.com. We respond within 30 days.</p></S>
      <S title="7. Data Retention"><p>We retain account data while your account is active. Upon deletion, we remove your personal information within 90 days, except where required by law.</p></S>
      <S title="8. Contact"><p>Privacy questions: <a href="mailto:support@taxstat360.com" style={{color:B}}>support@taxstat360.com</a></p></S>
    </div>
    <PageFooter/>
  </div>
)}
