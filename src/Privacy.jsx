import { useNavigate } from 'react-router-dom'

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
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      {/* FIX: added How It Works + FAQ links to match Landing.jsx nav.
          Previously only had Features and Pricing — users couldn't navigate
          to the full site from legal pages.
          FIX: Sign In was linking to /dashboard (authenticated route). Users
          reading Privacy before signing up are not authenticated — /login is correct.
          FIX: CTA "Start Free Trial" → "Start Free 7-Day Trial" (CC-02). */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'white', borderBottom: '1px solid #e5e7eb', padding: '0 40px', display: 'flex', alignItems: 'center', height: 64 }}>
        <a href='/' style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginRight: 'auto' }}>
          <div style={{ width: 32, height: 32, background: N, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width='18' height='18' viewBox='0 0 24 24' fill='none'>
              <rect x='3' y='12' width='4' height='9' fill='white' rx='1'/>
              <rect x='10' y='7' width='4' height='14' fill='white' rx='1'/>
              <rect x='17' y='3' width='4' height='18' fill='white' rx='1'/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 18, color: N }}>TaxStat<span style={{ color: B }}>360</span></span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href='/#how-it-works' style={{ color: '#374151', textDecoration: 'none', fontSize: 14 }}>How It Works</a>
          <a href='/#features'     style={{ color: '#374151', textDecoration: 'none', fontSize: 14 }}>Features</a>
          <a href='/#pricing'      style={{ color: '#374151', textDecoration: 'none', fontSize: 14 }}>Pricing</a>
          <a href='/#faq'          style={{ color: '#374151', textDecoration: 'none', fontSize: 14 }}>FAQ</a>
          <a href='/resources'     style={{ color: '#374151', textDecoration: 'none', fontSize: 14 }}>Resources</a>
          <a href='/login'         style={{ color: '#374151', textDecoration: 'none', fontSize: 14 }}>Sign In</a>
          <a href='/signup' style={{ padding: '9px 20px', background: N, color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Start Free 7-Day Trial</a>
        </div>
      </nav>

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

        <Section title="4. Data Retention">
          <p>We retain your data for as long as your account is active. Request deletion at any time by emailing <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. We process deletion requests within 30 days.</p>
        </Section>

        <Section title="5. Third-Party Services">
          <p style={{ marginBottom: 8 }}>- Stripe (payment processing)</p>
          <p style={{ marginBottom: 8 }}>- AWS (infrastructure and data storage)</p>
          <p>- QuickBooks, Xero, Wave, FreshBooks (read-only accounting data)</p>
        </Section>

        <Section title="6. Your Rights">
          <p>You have the right to access, correct, or delete your personal data at any time. Contact <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. California residents have additional rights under the CCPA. We do not sell personal information.</p>
        </Section>

        <Section title="7. Contact Us">
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
