import { useNavigate } from 'react-router-dom'
import Nav from './Nav'

const N  = '#0D1B3E'
const B  = '#2563EB'
const SL = '#475569'

export default function Privacy() {
  const nav = useNavigate()

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: N, marginBottom: 12, borderBottom: '2px solid #E2E8F0', paddingBottom: 8 }}>{title}</h2>
      <div style={{ color: SL, fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  )

  return (
    /* #7 FIX: paddingTop 64 offsets the shared fixed <Nav> (height 64). */
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', paddingTop: 64 }}>

      {/* #7 FIX: inline page nav replaced with the shared <Nav> component so all
          pages stay in sync. (Previous inline nav + its FIX comments now live in
          src/Nav.jsx.) */}
      <Nav nav={nav} />

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: SL, marginBottom: 8 }}>Last updated: April 19, 2026</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: N, marginBottom: 12 }}>Privacy Policy</h1>
          <p style={{ color: SL, fontSize: 15, lineHeight: 1.7 }}>TaxStat360 is committed to protecting your personal information. This Privacy Policy explains how we collect, use, and protect your data.</p>
        </div>

        <Section title="1. Information We Collect">
          <p style={{ marginBottom: 10 }}><strong>Account Information:</strong> Name, email address, and password when you create an account.</p>
          <p style={{ marginBottom: 10 }}><strong>Financial Data:</strong> Business income, expenses, K-1 data, W-2 information, and other tax-related figures you enter. Used solely to calculate your estimated tax liability.</p>
          <p style={{ marginBottom: 10 }}><strong>Accounting Software Connections:</strong> When you connect QuickBooks, Xero, Wave, or FreshBooks, we access your financial data via read-only API. We cannot move or modify your money.</p>
          <p><strong>Payment Information:</strong> Credit card details are processed by Stripe and never stored on our servers.</p>
        </Section>

        <Section title="2. How We Use Your Information">
          <p style={{ marginBottom: 8 }}>- Calculate your real-time estimated tax liability</p>
          <p style={{ marginBottom: 8 }}>- Generate quarterly estimated payment recommendations</p>
          <p style={{ marginBottom: 8 }}>- Provide AI-powered risk alerts and tax optimization suggestions</p>
          <p style={{ marginBottom: 8 }}>- Send transactional emails (account verification, password reset)</p>
          <p>- Improve our platform features and performance</p>
        </Section>

        <Section title="3. Data Security">
          <p style={{ marginBottom: 10 }}>We use bank-level 256-bit AES encryption for all data at rest and TLS 1.3 in transit. All accounting connections use read-only OAuth tokens.</p>
          <p>Your data is stored on AWS infrastructure in the United States and is never sold or shared with third parties for advertising.</p>
        </Section>

        {/* FIX (#6 — AI data disclosure): The policy previously described AI
            features in §2 ("AI-powered risk alerts and tax optimization
            suggestions") but never disclosed how data is processed by those
            features, and §5 listed every other processor (Stripe, AWS,
            accounting connectors) but no AI processor. This new section closes
            that gap. The text below is accurate whether AI runs in-house OR via
            an external provider.

            >>> ACTION REQUIRED: pick ONE based on your architecture <<<
            • If AI runs ENTIRELY on your own servers/infrastructure: keep the
              text as-is, and ALSO uncomment the in-house reassurance line below.
            • If AI calls an EXTERNAL provider (Anthropic, OpenAI, AWS Bedrock,
              etc.): uncomment the "external provider" line below, replace
              PROVIDER_NAME, AND add the matching processor line in §6. Confirm
              the provider's terms actually state your data is not used to train
              their models before keeping that clause. */}
        <Section title="4. AI Features & Automated Processing">
          <p style={{ marginBottom: 10 }}>Some features — including Risk Alerts, the &ldquo;Why This Number?&rdquo; explanations, and the Ask Aria assistant — use automated AI to generate explanations and planning suggestions based on the figures you enter.</p>
          <p style={{ marginBottom: 10 }}>These inputs are processed solely to produce your results. They are never sold and are never used for advertising. AI output is provided for planning purposes only and is not professional tax advice.</p>

          {/* OPTION A — IN-HOUSE (uncomment if AI runs only on your own infrastructure): */}
          {/* <p>AI processing is performed on our own AWS infrastructure. Your financial data is not sent to any external AI provider.</p> */}

          {/* OPTION B — EXTERNAL PROVIDER (uncomment + set PROVIDER_NAME if AI calls an outside API): */}
          {/* <p>To generate these explanations we transmit the relevant calculation inputs to PROVIDER_NAME, our AI processor, solely to produce your result. PROVIDER_NAME does not use your data to train its models.</p> */}
        </Section>

        <Section title="5. Data Retention">
          <p>We retain your data for as long as your account is active. Request deletion at any time by emailing <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. We process deletion requests within 30 days.</p>
        </Section>

        <Section title="6. Third-Party Services">
          <p style={{ marginBottom: 8 }}>- Stripe (payment processing)</p>
          <p style={{ marginBottom: 8 }}>- AWS (infrastructure and data storage)</p>
          <p style={{ marginBottom: 8 }}>- QuickBooks, Xero, Wave, FreshBooks (read-only accounting data)</p>
          {/* FIX (#6): add ONLY if an external AI provider is used (see §4 Option B). */}
          {/* <p>- PROVIDER_NAME (AI processing for explanations, risk alerts, and Ask Aria)</p> */}
        </Section>

        <Section title="7. Your Rights">
          <p>You have the right to access, correct, or delete your personal data at any time. Contact <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. California residents have additional rights under the CCPA. We do not sell personal information.</p>
        </Section>

        <Section title="8. Contact Us">
          <p>Questions? Email <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>.</p>
        </Section>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {/* FIX: added © symbol, Terms of Service link, Contact link, and the
          "not professional tax advice" disclaimer. Previously the footer had
          only a bare copyright line with no cross-navigation links and no
          compliance disclaimer — a gap for users who arrive here from signup. */}
      <footer style={{ borderTop: '1px solid #E2E8F0', padding: '24px 32px', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <a href='/terms'    style={{ color: SL, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>Terms of Service</a>
          <a href='/privacy'  style={{ color: SL, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>Privacy Policy</a>
          <a href='/#contact' style={{ color: SL, fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>Contact</a>
        </div>
        <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px', lineHeight: 1.5 }}>
          TaxStat360 is a tax planning and estimation tool for informational purposes only. It is not professional tax, legal, or financial advice. Consult a licensed tax professional before making any filing or financial decisions.
        </p>
        <p style={{ fontSize: 12, color: SL, margin: 0 }}>© {new Date().getFullYear()} TaxStat360. All rights reserved.</p>
      </footer>

    </div>
  )
}
