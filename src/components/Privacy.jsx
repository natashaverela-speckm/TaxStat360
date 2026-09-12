import { useNavigate } from 'react-router-dom'
import {
  ENCRYPTION_STATEMENT,
  ACCOUNT_DELETION_STATEMENT,
  ACCOUNT_DELETION_EXPORT_WARNING,
  NO_MODEL_TRAINING_STATEMENT,
} from '../lib/complianceCopy.js'
import Nav from './Nav'
import Footer from './Footer'

// CONSISTENCY PASS (Jul 9 2026): palette from src/theme.js — the CC-M01
// migration finished; local hex constants retired. Aliased so usage sites
// are untouched.
import { NAVY as N, BLUE as B, SLATE as SL } from '../lib/theme.js'

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
          {/* FRESH-EYES AI-5 (12 Sep 2026): date advanced for the §4/§6 processor
              correction below. complianceCopy.test.js asserts this rendered date
              equals PRIVACY_VERSION in lib/complianceCopy.js — the two MUST change
              together or the suite goes red. That pairing is deliberate: it stops a
              policy edit shipping without a version bump, which is exactly the
              failure this correction is cleaning up. */}
          <p style={{ fontSize: 13, color: SL, marginBottom: 8 }}>Last updated: September 12, 2026</p>
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
          {/* AUDIT H6 (Sep 2026): "real-time" removed here too — the Privacy Policy
              describes what the product does, and it is on-demand, not continuous. */}
          <p style={{ marginBottom: 8 }}>- Calculate your estimated federal tax liability from the figures you enter or sync</p>
          <p style={{ marginBottom: 8 }}>- Generate quarterly estimated payment recommendations</p>
          <p style={{ marginBottom: 8 }}>- Provide AI-powered risk alerts and tax optimization suggestions</p>
          <p style={{ marginBottom: 8 }}>- Send transactional emails (account verification, password reset)</p>
          {/* FRESH-EYES P-3 (11 Sep 2026): this list item read "Improve our
              platform features and performance" — broad enough to be read as
              permitting the model training that Terms §6 expressly forbids.
              Narrowed to what the platform actually does (aggregate, non-
              identifying diagnostics), with the §6 promise restated below from
              the shared constant so the two documents cannot diverge. */}
          <p style={{ marginBottom: 8 }}>- Diagnose errors and monitor performance using aggregate, non-identifying usage data</p>
          <p style={{ marginBottom: 8 }}><strong>{NO_MODEL_TRAINING_STATEMENT}</strong></p>
          <p>We do not sell your personal information, and we do not use your financial data to build advertising audiences.</p>
        </Section>

        <Section title="3. Data Security">
          {/* AUDIT M12 (second launch audit, Sep 2026): said "bank-level 256-bit AES"
              and "TLS 1.3". The first audit removed "bank-level" from the Landing FAQ
              (In re Zoom, FTC 2020) but pinned only that string, so it survived here;
              and TLS 1.3 contradicted the "TLS 1.2+" in Landing and the index.html
              JSON-LD. Both now render the single statement in complianceCopy.js. */}
          <p style={{ marginBottom: 10 }}>{ENCRYPTION_STATEMENT}</p>
          {/* FRESH-EYES P-2 (11 Sep 2026): read literally the old sentence was
              accurate — it only ever disclaimed sharing FOR ADVERTISING. Read the
              way people actually read a policy, under a heading that says "Data
              Security", it said tax figures never leave us, and Section 4 then
              discloses that calculation inputs are transmitted to an outside API.
              The service-provider carve-out is now stated in the same sentence
              rather than left to be discovered three sections later. */}
          {/* The phrase "never shared with third parties for advertising" is pinned
              by src/pixelConsent.test.js:48 — it is the scoped promise that test
              exists to defend after the Meta Pixel incident. Keep it verbatim. */}
          <p>Your financial and account data is stored on AWS infrastructure in the United States. It is <strong>never sold</strong>, and it is <strong>never shared with third parties for advertising</strong>. It is disclosed only to the service providers we use to operate the platform &mdash; each listed by name in &ldquo;Third-Party Services&rdquo; below, and each receiving only what that service needs to do its job. (Anonymous website-usage data collected by our marketing analytics is addressed separately in &ldquo;Cookies, Analytics &amp; Advertising&rdquo; below.)</p>
        </Section>

        {/* ── PROCESSOR — verified against the running backend, 12 Sep 2026 ──────
            The AI features call the OpenAI API (api.openai.com/v1/chat/completions)
            from the backend service, using the company's own API key. Under OpenAI's
            API terms, data submitted through the API is not used to train their
            models. The wording in §4 and §6 below reflects that.

            THIS COMMENT PREVIOUSLY SAID ANTHROPIC — in detail, citing Anthropic's
            Commercial Terms and reasoning carefully about why the §4 sentence was
            accurate — and it was wrong. A case-insensitive search for "anthropic" or
            "claude" across the entire backend application returns nothing; the only
            AI call is to OpenAI. §4 and §6 named a processor that receives no data
            while the processor that does receive customers' tax figures was named
            nowhere in the policy.

            The comment is the reason this survived. Someone documented the reasoning
            well, the implementation moved underneath it, and every later reader found
            a confident note citing a specific vendor's contract and had no cause to
            doubt it. A well-argued comment about a fact that has drifted is worse than
            no comment at all.

            IF THE PROCESSOR CHANGES AGAIN: change §4, §6, this comment and
            PRIVACY_VERSION in the same commit, and re-check the backend before
            trusting any of the four. The no-training assurance is tied to a named
            vendor's terms — if the vendor changes, that sentence is wrong too, not
            merely out of date.

            CAVEAT retained from the previous note, and it still applies: an API
            provider's no-training default typically does NOT cover data a user
            voluntarily submits as feedback (e.g. a thumbs up/down). If TaxStat360
            ever forwards user financial data through a feedback mechanism, revisit
            this wording. */}
        <Section title="4. AI Features & Automated Processing">
          <p style={{ marginBottom: 10 }}>Some features &mdash; including Risk Alerts, the &ldquo;Why This Number?&rdquo; explanations, and the Ask Aria assistant &mdash; use automated AI to generate explanations and planning suggestions based on the figures you enter.</p>
          <p style={{ marginBottom: 10 }}>To generate these results, the relevant calculation inputs are transmitted to OpenAI, our AI processor, solely to produce your output. Under OpenAI&rsquo;s API terms, data submitted through the API is not used to train their models. This data is never sold and is never used for advertising.</p>
          <p style={{ marginBottom: 10 }}>AI output is provided for planning purposes only and is not professional tax advice.</p>
          {/* FRESH-EYES AI-5 (12 Sep 2026): the correction is stated on the page
              rather than made silently. If counsel later advises notifying users,
              the page already matches the notice; if they advise none is needed,
              the cost was one sentence. A policy that quietly rewrites its own
              history reads worst in the one situation where anyone compares
              versions. Remove this line only on legal advice, not for tidiness. */}
          <p style={{ fontSize: 13 }}><em>Corrected September 12, 2026: an earlier version of this section named a different AI processor in error.</em></p>
        </Section>

        {/* FRESH-EYES P-1/P-6 (11 Sep 2026): this section said only "We process
            deletion requests within 30 days", which described a different system
            from Terms §10 ("immediate and permanent ... no recovery window") —
            two binding documents, same Last-updated date, contradicting each
            other on the one operation a user cannot undo. The in-app deletion now
            renders the SAME constant Terms §10 and Settings render, so the three
            can never drift again; the 30-day window is kept for emailed requests,
            which is the manual path it actually describes. P-6 mirrors the
            integration-deletion commitment that previously lived only in Terms §6,
            where a user looking for a retention promise would never find it. */}
        <Section title="5. Data Retention">
          <p style={{ marginBottom: 10 }}>We retain your data for as long as your account is active.</p>
          <p style={{ marginBottom: 10 }}>{ACCOUNT_DELETION_STATEMENT}</p>
          <p style={{ marginBottom: 10 }}><strong>{ACCOUNT_DELETION_EXPORT_WARNING}</strong></p>
          <p style={{ marginBottom: 10 }}>If you would rather not use the in-app control, you can ask us to delete your account by emailing <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. We process deletion requests within 30 days of receiving them. The in-app deletion described above is immediate and is not subject to that window.</p>
          <p>If you disconnect an accounting integration but keep your account, we delete the financial data synced from that platform within 30 days, except where we are required to retain it by law.</p>
        </Section>

        <Section title="6. Third-Party Services">
          <p style={{ marginBottom: 8 }}>- Stripe (payment processing)</p>
          <p style={{ marginBottom: 8 }}>- AWS (infrastructure and data storage)</p>
          <p style={{ marginBottom: 8 }}>- QuickBooks, Xero, Wave, FreshBooks (read-only accounting data)</p>
          {/* FRESH-EYES AI-5 (12 Sep 2026): was "Anthropic (Claude API — …)". See the
              processor note above §4. Verified against the running backend. */}
          <p style={{ marginBottom: 8 }}>- OpenAI (AI processing for explanations, risk alerts, and Ask Aria)</p>
          <p>- Meta / Facebook (advertising pixel on our marketing site &mdash; consent-gated; see &ldquo;Cookies, Analytics &amp; Advertising&rdquo;)</p>
        </Section>

        <Section title="7. Your Rights">
          <p>You have the right to access, correct, or delete your personal data at any time. Contact <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>. California residents have additional rights under the CCPA. We do not sell personal information.</p>
        </Section>

        <Section title="8. Cookies, Analytics &amp; Advertising">
          <p style={{ marginBottom: 10 }}>Our public marketing site uses a Meta (Facebook) advertising pixel to measure the performance of our ads and to build advertising audiences. When active, it shares limited website-usage data &mdash; the pages you view, your IP address, general device/browser information, and Meta cookie identifiers &mdash; with Meta Platforms, Inc. It does <strong>not</strong> receive your tax figures, account data, or any information you enter into the application.</p>
          <p style={{ marginBottom: 10 }}>The pixel is <strong>consent-gated</strong>: it does not load and no data is sent to Meta unless you click <strong>Accept</strong> on our cookie banner. Choosing <strong>Essential only</strong> prevents it entirely, and it never runs inside the signed-in application.</p>
          <p>Aside from this pixel, we use only essential cookies required to keep you signed in and operate the service.</p>
        </Section>

        <Section title="9. Contact Us">
          <p>Questions? Email <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>.</p>
        </Section>
      </div>

      {/* ── Footer (shared component — audit Pass 5 consolidation) ──────────── */}
      <Footer />

    </div>
  )
}
