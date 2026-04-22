import { useNavigate } from 'react-router-dom'

const N = '#0D1B3E'
const B = '#2563EB'
const SL = '#475569'

export default function Terms() {
  const nav = useNavigate()
  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: N, marginBottom: 12, borderBottom: '2px solid #E2E8F0', paddingBottom: 8 }}>{title}</h2>
      <div style={{ color: SL, fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  )
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <nav style={{position:'sticky',top:0,zIndex:50,background:'white',borderBottom:'1px solid #e5e7eb',padding:'0 40px',display:'flex',alignItems:'center',height:64}}>
        <a href='/' style={{display:'flex',alignItems:'center',gap:8,textDecoration:'none',marginRight:'auto'}}>
          <div style={{width:32,height:32,background:'#0D1B3E',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center'}}><svg width='18' height='18' viewBox='0 0 24 24' fill='none'><rect x='3' y='12' width='4' height='9' fill='white' rx='1'/><rect x='10' y='7' width='4' height='14' fill='white' rx='1'/><rect x='17' y='3' width='4' height='18' fill='white' rx='1'/></svg></div>
          <span style={{fontWeight:800,fontSize:18,color:'#0D1B3E'}}>TaxStat<span style={{color:'#2563EB'}}>360</span></span>
        </a>
        <div style={{display:'flex',alignItems:'center',gap:24}}>
          <a href='/#features' style={{color:'#374151',textDecoration:'none',fontSize:14}}>Features</a>
          <a href='/#pricing' style={{color:'#374151',textDecoration:'none',fontSize:14}}>Pricing</a>
          <a href='/dashboard' style={{color:'#374151',textDecoration:'none',fontSize:14}}>Sign In</a>
          <a href='/signup' style={{padding:'9px 20px',background:'#0D1B3E',color:'white',borderRadius:8,textDecoration:'none',fontSize:14,fontWeight:600}}>Start Free Trial</a>
        </div>
      </nav>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: SL, marginBottom: 8 }}>Last updated: April 19, 2026</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: N, marginBottom: 12 }}>Terms of Service</h1>
          <p style={{ color: SL, fontSize: 15, lineHeight: 1.7 }}>These Terms of Service govern your use of TaxStat360. By creating an account or using our platform, you agree to these terms. Please read them carefully.</p>
        </div>
        <Section title="1. Description of Service">
          <p>TaxStat360 is a real-time tax liability management platform designed for business owners, self-employed individuals, and multi-entity operators. We provide tools to calculate estimated tax liability, generate quarterly payment recommendations, and surface AI-powered risk alerts.</p>
        </Section>
        <Section title="2. Not Professional Tax Advice â Estimation Tool Only">
          <p style={{ marginBottom: 10, padding: '12px 16px', background: '#FEF2F2', borderLeft: '4px solid #DC2626', borderRadius: 6 }}><strong>â  Important Disclaimer:</strong> TaxStat360 is a tax estimation and planning tool only. It is NOT a licensed tax advisor, CPA, enrolled agent, or law firm. Nothing on this platform constitutes professional tax advice, legal advice, or financial advice of any kind.</p>
          <p style={{ marginBottom: 10 }}>All calculations provided by TaxStat360 are <strong>estimates for planning purposes only</strong> and may not reflect your actual tax liability. Results are based on the information you enter and IRS-published rates, which are subject to change. TaxStat360 makes no warranty, express or implied, regarding the accuracy, completeness, or fitness of any calculation for any particular purpose.</p>
          <p style={{ marginBottom: 10 }}>You are <strong>solely responsible</strong> for: (a) the accuracy of all information you enter into the platform; (b) your actual tax filings with the IRS and any state tax authority; (c) any underpayment penalties, interest, or other amounts owed to any taxing authority; and (d) any decisions made based on information provided by TaxStat360.</p>
          <p style={{ marginBottom: 10 }}>TaxStat360, its owners, employees, and affiliates shall not be liable for any errors, omissions, or inaccuracies in the calculated results, or for any actions taken or not taken in reliance on those results. <strong>We strongly recommend consulting a licensed CPA, enrolled agent, or qualified tax professional before making any tax filing decisions.</strong></p>
          <p>TaxStat360 is not a tax preparation service and does not prepare, file, or submit tax returns on your behalf.</p>
        </Section>
        <Section title="3. Subscriptions and Billing">
          <p style={{ marginBottom: 10 }}>TaxStat360 offers monthly and annual subscription plans. All subscriptions include a 7-day free trial with no charge until the trial ends.</p>
          <p style={{ marginBottom: 10 }}>â¢ <strong>Monthly plans</strong> are billed on the same date each month and may be cancelled at any time.</p>
          <p style={{ marginBottom: 10 }}>â¢ <strong>Annual plans</strong> are billed once per year. Cancellations take effect at the end of the billing period â we do not offer pro-rated refunds for annual plans.</p>
          <p>Prices are in USD. We reserve the right to change pricing with 30 days' notice to active subscribers.</p>
        </Section>
        <Section title="4. Acceptable Use">
          <p style={{ marginBottom: 10 }}>You agree not to:</p>
          <p style={{ marginBottom: 8 }}>â¢ Use TaxStat360 for any unlawful purpose or to facilitate tax fraud</p>
          <p style={{ marginBottom: 8 }}>â¢ Attempt to reverse engineer, copy, or resell our platform</p>
          <p style={{ marginBottom: 8 }}>â¢ Share your account credentials with others outside your organization</p>
          <p>â¢ Upload false or fabricated financial data</p>
        </Section>
        <Section title="5. Data and Integrations">
          <p style={{ marginBottom: 10 }}>When you connect accounting software (QuickBooks, Xero, Wave, FreshBooks), you grant TaxStat360 read-only access to your financial data for the purpose of calculating tax estimates. You may revoke this access at any time from your integrations settings.</p>
          <p>You retain ownership of all financial data you provide to TaxStat360. We do not claim any rights to your data.</p>
        </Section>
        <Section title="6. Limitation of Liability">
          <p>To the maximum extent permitted by law, TaxStat360 shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform, including but not limited to tax underpayments, penalties, or interest assessed by tax authorities. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
        </Section>
        <Section title="7. Termination">
          <p>You may cancel your account at any time. We reserve the right to suspend or terminate accounts that violate these terms. Upon termination, your data will be retained for 30 days before permanent deletion.</p>
        </Section>
        <Section title="8. Governing Law">
          <p>These Terms are governed by the laws of the United States. Any disputes shall be resolved through binding arbitration in accordance with the AAA Commercial Arbitration Rules.</p>
        </Section>
        <Section title="9. Contact">
          <p>Questions about these Terms? Contact us at <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>.</p>
        </Section>
      </div>
      <footer style={{ borderTop: '1px solid #E2E8F0', padding: '24px 32px', textAlign: 'center', color: SL, fontSize: 13 }}>
        Â© 2026 TaxStat360. All rights reserved. Â· <span onClick={() => nav('/privacy')} style={{ cursor: 'pointer', color: B }}>Privacy Policy</span>
      </footer>
    </div>
  )
}