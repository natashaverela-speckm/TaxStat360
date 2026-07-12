import { useNavigate } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'

// CONSISTENCY PASS (Jul 9 2026): palette from src/theme.js — the CC-M01
// migration finished; local hex constants retired. Aliased so usage sites
// are untouched.
import { NAVY as N, BLUE as B, SLATE as SL } from './theme.js'

export default function Terms() {
  const nav = useNavigate()

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: N, marginBottom: 12, borderBottom: '2px solid #E2E8F0', paddingBottom: 8 }}>{title}</h2>
      <div style={{ color: SL, fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  )

  return (
    /* #6 FIX: paddingTop 64 offsets the shared fixed <Nav> (height 64). */
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif', paddingTop: 64 }}>

      {/* #6 FIX: Terms had its own hand-rolled inline <nav> (separate logo, links,
          Sign In, and a hardcoded "Start Free 7-Day Trial" CTA) — the last page not
          on the shared component. Replaced with <Nav> so every page stays in sync and
          the trial CTA copy comes from one source. */}
      <Nav nav={nav} />

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: SL, marginBottom: 8 }}>Last updated: April 19, 2026</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: N, marginBottom: 12 }}>Terms of Service</h1>
          <p style={{ color: SL, fontSize: 15, lineHeight: 1.7 }}>These Terms of Service govern your use of TaxStat360. By creating an account or using our platform, you agree to these terms. Please read them carefully.</p>
        </div>

        <Section title="1. Description of Service">
          <p>TaxStat360 is a real-time tax liability planning and estimation platform designed for business owners, self-employed individuals, and multi-entity operators. We provide tools to calculate estimated tax liability, generate quarterly payment recommendations, and surface AI-powered risk alerts. TaxStat360 provides visibility and planning only — it is not a tax preparation or filing service.</p>
        </Section>

        <Section title="2. Not Professional Tax Advice — Estimation Tool Only">
          <p style={{ marginBottom: 10, padding: '12px 16px', background: '#FEF2F2', borderLeft: '4px solid #DC2626', borderRadius: 6 }}><strong>⚠ Important Disclaimer:</strong> TaxStat360 is a tax estimation and planning tool only. It is NOT a licensed tax advisor, CPA, enrolled agent, or law firm. Nothing on this platform constitutes professional tax advice, legal advice, or financial advice of any kind.</p>
          <p style={{ marginBottom: 10 }}>All calculations provided by TaxStat360 are <strong>estimates for planning purposes only</strong> and may not reflect your actual tax liability. Results are based on the information you enter and IRS-published rates, which are subject to change. TaxStat360 makes no warranty, express or implied, regarding the accuracy, completeness, or fitness of any calculation for any particular purpose.</p>
          <p style={{ marginBottom: 10 }}>You are <strong>solely responsible</strong> for: (a) the accuracy of all information you enter into the platform; (b) your actual tax filings with the IRS and any state tax authority; (c) any underpayment penalties, interest, or other amounts owed to any taxing authority; and (d) any decisions made based on information provided by TaxStat360.</p>
          <p style={{ marginBottom: 10 }}>TaxStat360, its owners, employees, and affiliates shall not be liable for any errors, omissions, or inaccuracies in the calculated results, or for any actions taken or not taken in reliance on those results. <strong>We strongly recommend consulting a licensed CPA, enrolled agent, or qualified tax professional before making any tax filing decisions.</strong></p>
          <p>TaxStat360 is not a tax preparation service and does not prepare, file, or submit tax returns on your behalf.</p>
        </Section>

        {/* AUDIT F-8 (Jul 2026): the Terms described billing but never used the word
            "renew" — nor did the signup page or the landing page. A card was collected for
            a trial that auto-bills, with no statement anywhere that the subscription
            renews, at what amount, or on what cadence. FTC negative-option rule / ROSCA
            and California's Automatic Renewal Law both require that disclosure, plus a
            clear cancellation path. This section states it plainly. */}
        <Section title="3. Automatic Renewal — Please Read">
          <p style={{ marginBottom: 10 }}>
            <strong>Your subscription renews automatically.</strong> When your 7-day free trial ends, the payment
            card you provided is charged automatically for your selected plan. After that, your subscription
            <strong> continues to renew and your card continues to be charged</strong> — every month for monthly
            plans, or every 12 months for annual plans — <strong>until you cancel</strong>.
          </p>
          <p style={{ marginBottom: 10 }}>
            The exact amount and the exact date of your first charge are shown on the signup page before you enter
            any payment information, and you must affirmatively agree to these renewal terms before your trial begins.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong>How to cancel.</strong> You may cancel at any time in Settings → Billing. If you cancel before
            your trial ends, <strong>you will not be charged at all</strong>. If you cancel after a billing period has
            begun, your access continues to the end of that period and you are not charged again.
          </p>
          <p>
            <strong>No refunds for completed billing periods.</strong> We do not pro-rate or refund a billing period
            that has already been charged, including annual plans. Cancelling stops future renewals; it does not
            refund the current period.
          </p>
        </Section>

        <Section title="4. Subscriptions and Billing">
          <p style={{ marginBottom: 10 }}>TaxStat360 offers monthly and annual subscription plans. All subscriptions include a 7-day free trial with no charge until the trial ends. Billing begins automatically when the trial ends — see &ldquo;Automatic Renewal&rdquo; above.</p>
          <p style={{ marginBottom: 10 }}>• <strong>Monthly plans</strong> are billed on the same date each month and may be cancelled at any time.</p>
          <p style={{ marginBottom: 10 }}>• <strong>Annual plans</strong> are billed once per year. Cancellations take effect at the end of the billing period — we do not offer pro-rated refunds for annual plans.</p>
          <p>Prices are in USD. We reserve the right to change pricing with 30 days' notice to active subscribers.</p>
        </Section>

        <Section title="5. Acceptable Use">
          <p style={{ marginBottom: 10 }}>You agree not to:</p>
          <p style={{ marginBottom: 8 }}>• Use TaxStat360 for any unlawful purpose or to facilitate tax fraud</p>
          <p style={{ marginBottom: 8 }}>• Attempt to reverse engineer, copy, or resell our platform</p>
          <p style={{ marginBottom: 8 }}>• Share your account credentials with others outside your organization</p>
          <p>• Upload false or fabricated financial data</p>
        </Section>

        <Section title="6. Data and Integrations">
          <p style={{ marginBottom: 10 }}>When you connect accounting software (QuickBooks, Xero, Wave, FreshBooks), you grant TaxStat360 read-only access to your financial data for the purpose of calculating tax estimates. You may revoke this access at any time from your integrations settings.</p>
          <p>You retain ownership of all financial data you provide to TaxStat360. We do not claim any rights to your data.</p>
        </Section>

        <Section title="7. Limitation of Liability">
          <p>To the maximum extent permitted by law, TaxStat360 shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform, including but not limited to tax underpayments, penalties, or interest assessed by tax authorities. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
        </Section>

        <Section title="8. Termination">
          <p>You may cancel your account at any time. We reserve the right to suspend or terminate accounts that violate these terms. Upon termination, your data will be retained for 30 days before permanent deletion.</p>
        </Section>

        <Section title="9. Governing Law">
          <p>These Terms are governed by the laws of the State of Florida, without regard to its conflict-of-laws principles. Any dispute arising out of or relating to these Terms or your use of the Service shall be resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, with the arbitration seated in the State of Florida. Judgment on the arbitration award may be entered in any court of competent jurisdiction.</p>
        </Section>

        <Section title="10. Contact">
          <p>Questions about these Terms? Contact us at <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>.</p>
        </Section>
      </div>

      {/* ── Footer (shared component — audit Pass 5 consolidation) ──────────── */}
      <Footer />

    </div>
  )
}
