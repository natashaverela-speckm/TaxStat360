import { useNavigate } from 'react-router-dom'
import Nav from './Nav'
import Footer from './Footer'

// CONSISTENCY PASS (Jul 9 2026): palette from src/theme.js — the CC-M01
// migration finished; local hex constants retired. Aliased so usage sites
// are untouched.
import { NAVY as N, BLUE as B, SLATE as SL } from '../lib/theme.js'

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT H11 / H12 (Sep 2026) — Terms rewrite.
//
// The pre-launch audit found this document missing several clauses that are
// standard in a consumer SaaS agreement, and one whose absence was a blocker.
// Each addition below carries its rule inline. What changed and why:
//
//   • NO CLASS ACTION WAIVER existed — the word "class" did not appear in the
//     document. An auto-renewing consumer subscription is the single most
//     class-attractive structure in consumer commerce. Stolt-Nielsen v.
//     AnimalFeeds, 559 U.S. 662 (2010) means silence probably does not authorize
//     class arbitration, but "probably" is doing far too much work here. Now
//     express, in its own conspicuously-headed section (§11).
//
//   • WRONG ARBITRATION RULES — §9 designated AAA COMMERCIAL rules for what are
//     plainly consumer transactions ($79/mo to individuals). AAA applies its
//     Consumer Rules to a consumer agreement regardless of what the clause says,
//     and maintains a Consumer Clause Registry: a business must register its
//     clause and pay the annual fee or AAA may DECLINE to administer, which can
//     take the whole provision down with it. Corrected, plus the pieces a
//     consumer clause needs to survive review: 30-day opt-out, small-claims
//     carve-out, delegation clause (Rent-A-Center v. Jackson, 561 U.S. 63 (2010)),
//     company-paid fees (Green Tree v. Randolph, 531 U.S. 79 (2000)), remote
//     hearing option, informal-resolution period, and mass-arbitration batching.
//
//   • "MERCHANTABILITY" NEVER APPEARED — under Fla. Stat. §672.316(2) (UCC
//     §2-316(2)) the exclusion "must mention merchantability and ... be
//     conspicuous". That warranty was therefore NOT disclaimed. Now disclaimed in
//     caps (§8), and extended to the SERVICE, not just to calculations.
//
//   • NO INDEMNIFICATION ANYWHERE — on a product where users upload data that
//     routinely contains third parties' information (a partnership's books carry
//     other partners' distributive shares) and connect third-party APIs under
//     their own credentials. Added (§10).
//
//   • NO SURVIVAL CLAUSE — so the liability cap and disclaimers arguably did not
//     survive termination, which matters enormously for a product whose errors
//     are latent by nature and surface years later. Added (§13).
//
//   • RELIANCE: §2 disclaimed liability. A disclaimer says the company is not
//     liable; an ACKNOWLEDGMENT says the user agreed not to rely, which negates
//     the reliance element of a misrepresentation claim rather than merely
//     limiting damages. Converted.
//
//   • LIABILITY CAP measured "in the 12 months preceding the claim" — inviting an
//     argument that the cap is illusory for a lapsed customer. Now measured from
//     the EVENT giving rise to the claim, with a floor.
//
// ⚠ H12 — GOVERNING LAW IS DELIBERATELY UNCHANGED AND NEEDS A DECISION.
// Fla. Stat. §95.03 voids any contractual shortening of the limitations period,
// so the standard SaaS "claims must be brought within one year" clause is
// UNAVAILABLE under Florida law, and Fla. Stat. §95.11(2)(b) gives five years on
// a written contract. For a tax product whose errors surface on examination years
// later, that is a long, uncloseable tail. Changing the governing law is a
// business/legal decision for counsel, not a code change — so Florida stands here
// and the question is flagged rather than silently answered.
//
// ⚠ This document was drafted against the audit findings but has NOT been
// reviewed by an attorney. Have counsel review before relying on it — the
// arbitration provision especially.
// ─────────────────────────────────────────────────────────────────────────────

export default function Terms() {
  const nav = useNavigate()

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: N, marginBottom: 12, borderBottom: '2px solid #E2E8F0', paddingBottom: 8 }}>{title}</h2>
      <div style={{ color: SL, fontSize: 14, lineHeight: 1.8 }}>{children}</div>
    </div>
  )

  // Conspicuous block for the clauses that must stand out to be enforceable
  // (Fla. Stat. §671.201(10) "conspicuous"; UCC §2-316(2)).
  const Caps = ({ children }) => (
    <p style={{
      marginBottom: 10, padding: '14px 16px', background: '#F8FAFC',
      border: '1px solid #CBD5E1', borderRadius: 6,
      textTransform: 'uppercase', fontSize: 12.5, letterSpacing: '0.01em',
      lineHeight: 1.7, color: '#0F172A', fontWeight: 600,
    }}>{children}</p>
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
          <p style={{ fontSize: 13, color: SL, marginBottom: 8 }}>Last updated: September 10, 2026</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: N, marginBottom: 12 }}>Terms of Service</h1>
          <p style={{ color: SL, fontSize: 15, lineHeight: 1.7 }}>These Terms of Service govern your use of TaxStat360. By creating an account or using our platform, you agree to these terms. Please read them carefully.</p>
          <p style={{ color: '#B91C1C', fontSize: 14, lineHeight: 1.7, marginTop: 12, fontWeight: 600 }}>
            Section 11 requires most disputes to be resolved by individual arbitration and waives your right
            to a jury trial and to participate in a class action. You may opt out of arbitration within 30
            days of first accepting these Terms — see Section 11.
          </p>
        </div>

        <Section title="1. Description of Service">
          {/* AUDIT H6 (Sep 2026): "real-time" is inaccurate — synced figures reflect the last
              sync and move only on refresh, as the FAQ itself states. The Terms should not
              assert a capability the product does not have. */}
          <p>TaxStat360 is an on-demand tax liability planning and estimation platform designed for business owners, self-employed individuals, and multi-entity operators. We provide tools to calculate estimated federal tax liability, generate quarterly payment recommendations, surface documentation and substantiation prompts, and export summaries for your tax professional. TaxStat360 provides visibility and planning only &mdash; it is not a tax preparation or filing service, and it does not calculate state, local, or foreign tax.</p>
        </Section>

        <Section title="2. Not Professional Tax Advice — Estimation Tool Only">
          <p style={{ marginBottom: 10, padding: '12px 16px', background: '#FEF2F2', borderLeft: '4px solid #DC2626', borderRadius: 6 }}><strong>⚠ Important Disclaimer:</strong> TaxStat360 is a tax estimation and planning tool only. It is NOT a licensed tax advisor, CPA, enrolled agent, or law firm. Nothing on this platform constitutes professional tax advice, legal advice, or financial advice of any kind, and no professional&ndash;client relationship of any kind is created by your use of it.</p>
          <p style={{ marginBottom: 10 }}>All calculations provided by TaxStat360 are <strong>estimates for planning purposes only</strong> and may not reflect your actual tax liability. Results are based on the information you enter and IRS-published rates, which are subject to change, including mid-year.</p>

          {/* AUDIT H11: converted from a pure disclaimer into an affirmative
              ACKNOWLEDGMENT. A disclaimer limits damages; an acknowledgment negates
              the reliance element of a misrepresentation claim, which is materially
              harder to defeat. */}
          <p style={{ marginBottom: 10 }}><strong>You acknowledge and agree that:</strong> (i) every figure produced by TaxStat360 is an estimate generated from data you supply and from published IRS rates, and will differ from your actual tax liability; (ii) TaxStat360 does not compute state, local, or foreign tax, so your total tax obligation will be higher than any figure shown; (iii) you will independently verify every figure with a licensed tax professional before making any payment to, or filing with, any taxing authority; and (iv) you assume all risk arising from any use of or reliance on these figures.</p>

          <p style={{ marginBottom: 10 }}>You are <strong>solely responsible</strong> for: (a) the accuracy of all information you enter into the platform; (b) your actual tax filings with the IRS and any state tax authority; (c) any underpayment penalties, interest, or other amounts owed to any taxing authority; and (d) any decisions made based on information provided by TaxStat360.</p>
          <p style={{ marginBottom: 10 }}>TaxStat360, its owners, employees, and affiliates shall not be liable for any errors, omissions, or inaccuracies in the calculated results, or for any actions taken or not taken in reliance on those results. <strong>We strongly recommend consulting a licensed CPA, enrolled agent, or qualified tax professional before making any tax filing decisions.</strong></p>
          <p>TaxStat360 is not a tax preparation service and does not prepare, file, or submit tax returns on your behalf. TaxStat360 does not draft correspondence to the IRS, does not prepare responses to IRS notices, and cannot represent you before the IRS. Only a person authorized under 31 C.F.R. §10.3 holding a valid Form 2848 may represent you.</p>
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
          {/* AUDIT B5 / H11 (Sep 2026): this previously represented, as a statement of
              fact, that "the exact amount and the exact date of your first charge are
              shown on the signup page before you enter any payment information, and you
              must affirmatively agree." That is a factual claim about the company's own
              flow, and if the flow does not do it the Terms themselves carry the
              violation and supply evidence of it. Restated as the commitment we can
              stand behind today. ⚠ When the signup consent block ships (audit B5), this
              paragraph should be restored to the stronger, more specific wording. */}
          <p style={{ marginBottom: 10 }}>
            <strong>What you will be charged, and when.</strong> The price of each plan and its billing cadence
            are shown on the pricing page before you subscribe. You are not charged during the 7-day trial. Your
            first charge occurs when the trial ends, in the amount shown for the plan and billing period you
            selected, and we send a confirmation to your account email. You can see your plan, billing period,
            and next renewal at any time in <strong>Settings → Subscription</strong>.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong>How to cancel.</strong> You may cancel at any time from <strong>Settings → Subscription →
            Cancel subscription</strong>, online, without calling anyone and without being routed through a
            retention offer. If you cancel before your trial ends, <strong>you will not be charged at all</strong>.
            If you cancel after a billing period has begun, your access continues to the end of that period and
            you are not charged again.
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
          <p>Prices are in USD. We reserve the right to change pricing with 30 days&rsquo; notice to active subscribers. A price change takes effect at your next renewal, and you may cancel before that renewal if you do not accept it.</p>
        </Section>

        <Section title="5. Acceptable Use">
          <p style={{ marginBottom: 10 }}>You must be at least 18 years old and able to form a binding contract to use TaxStat360. You agree not to:</p>
          <p style={{ marginBottom: 8 }}>• Use TaxStat360 for any unlawful purpose or to facilitate tax fraud</p>
          <p style={{ marginBottom: 8 }}>• Attempt to reverse engineer, copy, or resell our platform</p>
          <p style={{ marginBottom: 8 }}>• Share your account credentials with others outside your organization</p>
          <p style={{ marginBottom: 8 }}>• Upload false or fabricated financial data</p>
          <p>• Upload data you do not have the right to provide to us</p>
        </Section>

        <Section title="6. Data and Integrations">
          <p style={{ marginBottom: 10 }}>When you connect accounting software (QuickBooks, Xero, Wave, FreshBooks), you grant TaxStat360 read-only access to your financial data for the purpose of calculating tax estimates. You may revoke this access at any time from your integrations settings.</p>
          {/* AUDIT (partnership review): Intuit and Xero developer terms both require
              deletion of platform data on disconnection. Neither the Terms nor the
              Privacy Policy previously said what happens to already-synced data, which
              is a question their app reviews ask directly. */}
          <p style={{ marginBottom: 10 }}>If you disconnect an accounting integration, we delete the financial data synced from that platform within 30 days, except where we are required to retain it by law.</p>
          <p>You retain ownership of all financial data you provide to TaxStat360. We do not claim any rights to your data. We do not use your financial data, tax figures, or AI assistant conversations to train, fine-tune, or evaluate any machine learning model, ours or a third party&rsquo;s.</p>
        </Section>

        {/* AUDIT H11 — new section. The prior document disclaimed warranties only as to
            CALCULATIONS, and never used the word "merchantability", which Fla. Stat.
            §672.316(2) requires by name and conspicuously. The implied warranty of
            merchantability was therefore not excluded at all. */}
        <Section title="7. Disclaimer of Warranties">
          <Caps>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind,
            express or implied. To the maximum extent permitted by law, TaxStat360 disclaims all implied warranties,
            including the implied warranties of merchantability, fitness for a particular purpose, title, and
            non-infringement. TaxStat360 does not warrant that the service will be uninterrupted, timely, secure, or
            error-free, that any calculation will be accurate or complete, or that data obtained from third-party
            accounting platforms will be accurate, current, or available.
          </Caps>
          <p>No advice or information, whether oral or written, obtained from TaxStat360 or through the service creates any warranty not expressly stated in these Terms.</p>
        </Section>

        <Section title="8. Limitation of Liability">
          <Caps>
            To the maximum extent permitted by law, TaxStat360 shall not be liable for any indirect, incidental,
            special, consequential, exemplary, or punitive damages, or for any lost profits, lost revenue, lost
            business, or loss of or corruption of data, arising from or relating to your use of the platform —
            including tax underpayments, penalties, or interest assessed by any taxing authority — whether or not
            TaxStat360 has been advised of the possibility of such damages.
          </Caps>
          {/* AUDIT H11: the cap was measured "in the 12 months preceding the CLAIM",
              which for a lapsed customer is $0 and invites an illusory-cap /
              unconscionability argument. Measuring from the EVENT, with a floor, is the
              conventional and more defensible construction. */}
          <p style={{ marginBottom: 10 }}>TaxStat360&rsquo;s total aggregate liability arising out of or relating to these Terms or the service shall not exceed the greater of (a) one hundred United States dollars ($100), or (b) the total amounts you paid TaxStat360 in the twelve (12) months immediately preceding the event giving rise to the claim.</p>
          <p style={{ marginBottom: 10 }}>These limitations apply to all claims, whether based in contract, tort, negligence, strict liability, statute, or otherwise, and apply even if a limited remedy is found to have failed of its essential purpose.</p>
          <p>Some jurisdictions do not allow the exclusion of certain warranties or the limitation of certain damages. In those jurisdictions, our liability is limited to the greatest extent permitted by law, and nothing in these Terms limits liability for gross negligence, willful misconduct, or fraud, or any liability that cannot be limited by law.</p>
        </Section>

        {/* AUDIT H11 — new section. The word "indemnif" did not appear anywhere in the
            prior document, on a product where uploaded data routinely contains third
            parties' information (a partnership's books carry other partners'
            distributive shares; a ledger carries vendor and customer data) and where
            users connect third-party APIs under their own credentials. */}
        <Section title="9. Indemnification">
          <p style={{ marginBottom: 10 }}>You agree to defend, indemnify, and hold harmless TaxStat360 LLC and its owners, officers, employees, and agents from and against any claims, damages, liabilities, losses, and expenses (including reasonable attorneys&rsquo; fees) arising out of or relating to: (a) your breach of these Terms; (b) data you upload or connect that you did not have the right to provide; (c) your tax filings and the positions taken on them; (d) your use of, or reliance on, any output of the service; and (e) your violation of any third-party accounting platform&rsquo;s terms or of any law.</p>
          <p>TaxStat360 will defend, indemnify, and hold you harmless against any third-party claim alleging that the service, as provided by us and used in accordance with these Terms, infringes that third party&rsquo;s intellectual property rights.</p>
        </Section>

        <Section title="10. Termination">
          <p style={{ marginBottom: 10 }}>You may cancel your account at any time. We reserve the right to suspend or terminate accounts that violate these terms. Upon termination, your data will be retained for 30 days before permanent deletion.</p>
          <p><strong>Export your data before cancelling.</strong> After the 30-day period we cannot recover it.</p>
        </Section>

        {/* AUDIT H11 — this was two sentences buried at the end of a section titled
            "Governing Law". For enforceability, and under California's heightened
            conspicuousness scrutiny, an arbitration provision and class waiver must be
            separately headed and conspicuously formatted. */}
        <Section title="11. Binding Arbitration and Class Action Waiver">
          <Caps>
            Please read this section carefully. It affects your legal rights. It requires most disputes to be
            resolved by individual binding arbitration, waives your right to a jury trial, and waives your right
            to participate in a class, collective, consolidated, or representative action. You may opt out.
          </Caps>

          <p style={{ marginBottom: 10 }}><strong>(a) Informal resolution first.</strong> Before starting an arbitration, you agree to first send a written notice of dispute to <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a> describing the dispute and the relief sought, and to give us 60 days to resolve it. We will do the same before bringing any claim against you. Most disputes are resolved at this stage.</p>

          <p style={{ marginBottom: 10 }}><strong>(b) Agreement to arbitrate.</strong> If the dispute is not resolved informally, any dispute arising out of or relating to these Terms or your use of the service shall be resolved by binding individual arbitration administered by the American Arbitration Association (AAA) under its <strong>Consumer Arbitration Rules</strong>, as modified by these Terms. Judgment on the award may be entered in any court of competent jurisdiction.</p>

          {/* Rent-A-Center, West, Inc. v. Jackson, 561 U.S. 63 (2010). */}
          <p style={{ marginBottom: 10 }}><strong>(c) Who decides what.</strong> The arbitrator has exclusive authority to resolve any dispute about the interpretation, applicability, enforceability, or formation of this arbitration provision, except that a court decides whether the class action waiver in paragraph (f) is enforceable.</p>

          {/* Green Tree Financial Corp. v. Randolph, 531 U.S. 79 (2000) — prohibitive
              cost can defeat an arbitration clause. */}
          <p style={{ marginBottom: 10 }}><strong>(d) Costs and location.</strong> We will pay all AAA filing, administration, and arbitrator fees for any claim where the amount in dispute is $10,000 or less, except where the arbitrator finds the claim frivolous. The arbitration may be conducted by telephone or videoconference, on written submissions, or — at your election — in person in the federal judicial district where you live. You are never required to travel to Florida to arbitrate.</p>

          <p style={{ marginBottom: 10 }}><strong>(e) Small claims.</strong> Either party may instead bring an individual claim in small-claims court if it qualifies. Either party may also seek injunctive relief in court to protect intellectual property rights.</p>

          <Caps>
            (f) Class action waiver. You and TaxStat360 agree that each may bring claims against the other only in
            an individual capacity, and not as a plaintiff or class member in any class, collective, consolidated,
            or representative proceeding. The arbitrator may not consolidate the claims of more than one person and
            may not preside over any form of class or representative proceeding. If this paragraph is found
            unenforceable as to a particular claim, that claim — and only that claim — shall proceed in court, and
            the remainder of this Section 11 shall remain in force.
          </Caps>

          <p style={{ marginBottom: 10 }}><strong>(g) Coordinated filings.</strong> If 25 or more similar arbitration demands are filed by or with the assistance of the same law firm or coordinated group, the parties will cooperate with AAA to sequence them in staged batches, with the fee and timing consequences of each batch applied to the rest, so that neither party bears filing-fee exposure disproportionate to the merits.</p>

          <p style={{ marginBottom: 10 }}><strong>(h) Your right to opt out.</strong> You may reject this arbitration provision by emailing <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a> with the subject line &ldquo;Arbitration Opt-Out,&rdquo; including your name and account email, <strong>within 30 days of first accepting these Terms</strong>. Opting out affects nothing else in these Terms, and will not affect your account, your pricing, or your service in any way.</p>

          <p><strong>(i) Survival.</strong> This Section 11 survives termination of your account and of these Terms.</p>
        </Section>

        <Section title="12. Governing Law">
          <p>These Terms are governed by the laws of the State of Florida, without regard to its conflict-of-laws principles, except that the Federal Arbitration Act governs Section 11. Nothing in this section deprives you of the protection of any mandatory consumer-protection law of the state in which you reside. For any dispute not subject to arbitration, the parties consent to the exclusive jurisdiction of the state and federal courts located in Orange County, Florida.</p>
        </Section>

        {/* AUDIT H11 — new section. Severability, entire agreement, amendment,
            E-SIGN consent, assignment, force majeure, no-waiver, notices, survival,
            and third-party dependencies were all absent. The amendment gap mattered
            most: the document carried a "Last updated" date implying it would change,
            with no clause permitting unilateral amendment — so updated terms arguably
            did not bind existing users at all. */}
        <Section title="13. General">
          <p style={{ marginBottom: 10 }}><strong>Changes to these Terms.</strong> We may update these Terms. If a change is material, we will give you at least 30 days&rsquo; notice by email or in-app before it takes effect, and continued use after the effective date constitutes acceptance. A material change to the automatic-renewal terms requires your affirmative consent and will not be applied by continued use alone.</p>
          <p style={{ marginBottom: 10 }}><strong>Electronic communications.</strong> You consent to receive these Terms, the Privacy Policy, billing disclosures, renewal notices, and other required notices electronically, by email or in-app, under the E-SIGN Act, 15 U.S.C. §7001(c). You may withdraw that consent by contacting support, though we may be unable to continue providing the service.</p>
          <p style={{ marginBottom: 10 }}><strong>Third-party services.</strong> The service depends on third parties, including Intuit, Xero, Wave, FreshBooks, Stripe, Amazon Web Services, and our AI processor. We are not responsible for their outages, changes, discontinuation, or for the accuracy of data they return.</p>
          <p style={{ marginBottom: 10 }}><strong>Severability.</strong> If any provision of these Terms is held unenforceable, that provision will be limited or severed to the minimum extent necessary and the remaining provisions remain in full force.</p>
          <p style={{ marginBottom: 10 }}><strong>Entire agreement.</strong> These Terms and the Privacy Policy are the entire agreement between you and TaxStat360 regarding the service, and supersede all prior communications, marketing statements, and understandings.</p>
          <p style={{ marginBottom: 10 }}><strong>No waiver.</strong> Our failure to enforce any provision is not a waiver of it.</p>
          <p style={{ marginBottom: 10 }}><strong>Assignment.</strong> You may not assign these Terms without our written consent. We may assign them to an affiliate or in connection with a merger, acquisition, or sale of assets.</p>
          <p style={{ marginBottom: 10 }}><strong>Force majeure.</strong> Neither party is liable for a failure to perform caused by events beyond its reasonable control.</p>
          <p><strong>Survival.</strong> Sections 2, 6, 7, 8, 9, 11, 12, and 13 survive any termination or expiration of these Terms.</p>
        </Section>

        <Section title="14. Contact">
          <p>Questions about these Terms? Contact us at <a href="mailto:support@taxstat360.com" style={{ color: B }}>support@taxstat360.com</a>.</p>
        </Section>
      </div>

      {/* ── Footer (shared component — audit Pass 5 consolidation) ──────────── */}
      <Footer />

    </div>
  )
}
