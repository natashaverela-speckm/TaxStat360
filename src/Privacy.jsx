import { useNavigate } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'

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
          pages stay in sync. */}
      <Nav nav={nav} />

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: SL, marginBottom: 8 }}>Last updated: May 31, 2026</p>
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

        {/* #6 FINAL (Anthropic, external API processor):
            TaxStat360 calls the Anthropic API under Anthropic's Commercial Terms
            using the company's own API key. Per those terms and Anthropic's
            published policy, inputs/outputs from the Anthropic API are NOT used
            to train their models by default. The "does not use your data to
            train its models" sentence below is therefore accurate.
            CAVEAT: that default does NOT apply to data you voluntarily submit as
            feedback (e.g. a thumbs up/down). If TaxStat360 ever forwards user
            financial data to Anthropic through a feedback mechanism, revisit
            this wording. */}
        <Section title="4. AI Features & Automated Processing">
          <p style={{ marginBottom: 10 }}>Some features &mdash; including Risk Alerts, the &ldquo;Why This Number?&rdquo; explanations, and the Ask Aria assistant &mdash; use automated AI to generate explanations and planning suggestions based on the figures you enter.</p>
          <p style={{ marginBottom: 10 }}>To generate these results, the relevant calculation inputs are transmitted to Anthropic (the Claude API), our AI processor, solely to produce your output. Under Anthropic&rsquo;s commercial terms, your inputs and outputs are not used to train their models. This data is never sold and is never used for advertising.</p>
          <p>AI output is provided for planning purposes only and is not professional tax advice.</p>
        </Section>

        <Section title="5. Data Retention">
          <p>We retain your data for as long as your account is active. Request deletion at any time by emailing <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. We process deletion requests within 30 days.</p>
        </Section>

        <Section title="6. Third-Party Services">
          <p style={{ marginBottom: 8 }}>- Stripe (payment processing)</p>
          <p style={{ marginBottom: 8 }}>- AWS (infrastructure and data storage)</p>
          <p style={{ marginBottom: 8 }}>- QuickBooks, Xero, Wave, FreshBooks (read-only accounting data)</p>
          <p>- Anthropic (Claude API &mdash; AI processing for explanations, risk alerts, and Ask Aria)</p>
        </Section>

        <Section title="7. Your Rights">
          <p>You have the right to access, correct, or delete your personal data at any time. Contact <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. California residents have additional rights under the CCPA. We do not sell personal information.</p>
        </Section>

        <Section title="8. Contact Us">
          <p>Questions? Email <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>.</p>
        </Section>
      </div>

      {/* ── Footer (shared component — audit Pass 5 consolidation) ──────────── */}
      <Footer />

    </div>
  )
}
