// src/articles.js
// AF-02: Resource article data for TaxStat360's /resources section.
// Each article targets a high-intent search query in the S-Corp / small
// business tax planning space. Content is authoritative, cites real IRC
// sections, and reflects the "former IRS agent" positioning of the brand.
//
// Adding a new article: append an object to ARTICLES following the same
// schema. The Article.jsx template renders any entry automatically.

import { getTable, QBI_THRESHOLDS, QBI_PHASE_IN_RANGE, QBI_MIN_DEDUCTION } from './taxCalc.js'
import { fmt } from './utils/formatMoney.js'

// ── Live tax-figure bindings (AF-02 follow-up / centralization) ───────────────
// Indexed dollar figures quoted in article prose are bound to the engine's
// single source of truth (taxCalc.js TAX_TABLES / QBI tables) rather than
// hardcoded inline, so article copy can never silently drift from what the
// calculator actually computes. These worked examples are pinned to the 2026
// tax year; when 2026's figures are corrected in taxCalc.js the prose follows
// automatically — there is no second place to update.
//
// Bound here: Social Security wage base, §199A phase-in thresholds, the §199A
// SSTB / wage-limit phase-out ceilings (threshold + phase-in range), and the
// §199A $400 minimum deduction.
//
// Requires taxCalc.js to export QBI_MIN_DEDUCTION (added alongside this change).
// Note: the $400 minimum is itself inflation-indexed in $5 increments after 2026
// (OBBBA §70101), so adding 2027+ keys to QBI_MIN_DEDUCTION will roll this prose
// forward automatically once the article's worked-year is advanced.
//
// NOT bound by design: the §6654 estimated-tax penalty rate. It resets quarterly
// with the federal short-term rate (it was 7% in Q1 2026, 6% in Q2), so there is
// no stable value to bind. The prose describes the mechanic instead of quoting a
// figure that goes stale within a quarter.
const _ssWageBase2026 = getTable(2026).ssWageBase            // 184500
const _qbiThresh2026  = QBI_THRESHOLDS[2026]                 // { single:201775, mfj:403500, ... }
const _qbiPhaseIn2026 = QBI_PHASE_IN_RANGE[2026]             // { single:75000,  mfj:150000, ... }
const _qbiCeil2026 = {                                       // full phase-out = threshold + phase-in range
  single: _qbiThresh2026.single + _qbiPhaseIn2026.single,    // 276775
  mfj:    _qbiThresh2026.mfj    + _qbiPhaseIn2026.mfj,        // 553500
}
const _qbiMin2026 = QBI_MIN_DEDUCTION[2026]                  // 400
const usd = fmt // unified onto canonical money formatter (audit D-4); article amounts are all positive, so identical output

export const ARTICLES = [
  {
    slug: 'scorp-salary-vs-distribution',
    title: 'S-Corp Salary vs. Distribution: How to Split Your Pay and Save on Taxes',
    metaDescription:
      'Learn how S-Corp owners can legally reduce self-employment tax by splitting pay between officer salary and K-1 distributions — with real numbers, IRS rules, and what triggers audits.',
    category: 'S-Corporation',
    readMinutes: 8,
    publishedDate: '2026-04-10',
    heroIcon: 'briefcase',
    tags: ['S-Corp', 'FICA', 'Reasonable Compensation', 'K-1'],
    sections: [
      {
        heading: 'Why the Split Matters',
        body: `For S-Corporation owners, how you pay yourself is one of the most consequential tax decisions you make each year. Every dollar you pay yourself as a W-2 salary is subject to FICA taxes — 15.3% total, split evenly between employer and employee: 12.4% for Social Security on the first ${usd(_ssWageBase2026)} (2026), plus 2.9% for Medicare on all wages with no cap (and an additional 0.9% above $200,000). Every dollar you take as a K-1 distribution is not subject to FICA.

On $200,000 of S-Corp profit, the difference between paying yourself $50,000 in salary versus $100,000 in salary is roughly $7,650 in FICA taxes — the same amount a W-2 employee pays in a year just on Social Security and Medicare.

The IRS knows this. They have been scrutinizing S-Corp salary practices since at least Rev. Rul. 74-44, which established that amounts paid to shareholder-employees must represent reasonable compensation for services rendered. The strategy is legal — but only when the salary is genuinely reasonable.`,
      },
      {
        heading: 'The IRS Reasonable Compensation Requirement',
        body: `IRC §3121(d) defines who is an employee subject to FICA, and S-Corp shareholder-employees fall squarely within it. The IRS's position, codified in Rev. Rul. 74-44, is that an S-Corp cannot reclassify wages as distributions to avoid employment taxes.

The landmark case is David E. Watson, P.C. v. United States, 668 F.3d 1008 (8th Cir. 2012), where the courts upheld the reclassification of a CPA's $24,000 salary — set against more than $200,000 of annual distributions from his firm — to reasonable compensation of $91,044 per year, with the additional wages subject to back FICA plus penalties and interest. The message was clear: the IRS will look through artificially low salaries.

Reasonable compensation is the amount a comparable employee would receive for the same services in an arm's-length transaction. Factors the IRS considers include your industry, hours worked, the company's gross revenues, your training and experience, and what similar businesses pay for comparable roles.`,
      },
      {
        heading: 'The 35/65 Rule of Thumb — and Its Limits',
        body: `Many CPAs use a 35/65 or 40/60 split as a starting benchmark: pay yourself 35–40% of total officer compensation (salary + distributions) as salary, and take the rest as distributions. This is not an IRS rule — it's a practitioner heuristic that has survived scrutiny when supported by documentation.

The split only holds up if your business generates enough profit to make the salary plausible. A first-year S-Corp generating $40,000 of net profit paying the owner $14,000 in salary is far more defensible than a $400,000 S-Corp paying $14,000. The absolute dollar amount matters as much as the ratio.

Salary benchmarks from the Bureau of Labor Statistics Occupational Employment Statistics and industry surveys (MGMA for healthcare, Robert Half for finance, etc.) provide the most defensible foundation. If challenged, you want to be able to show: "Here is what a comparable employee earns in my market. I am paying myself within that range."`,
      },
      {
        heading: 'Real Numbers: What the FICA Savings Actually Look Like',
        body: `Here is the math on a concrete example. Assume a solo S-Corp owner, $300,000 net profit, 2026 tax year, Single filer.

Scenario A — $70,000 salary, $230,000 distributions:
Employee FICA: $70,000 × 7.65% = $5,355
Employer FICA: $70,000 × 7.65% = $5,355 (deductible)
Total FICA cost: ~$10,710

Scenario B — $150,000 salary, $150,000 distributions:
Employee FICA on SS portion: $150,000 × 6.2% = $9,300 (the entire $150,000 salary is below the 2026 Social Security wage base of ${usd(_ssWageBase2026)}, so all of it is subject to the 6.2% Social Security tax)
Employee FICA on Medicare: $150,000 × 1.45% = $2,175
Total employee: $11,475 | Employer match: $11,475
Total FICA cost: ~$22,950

The difference is $12,240 in FICA taxes — real cash savings, achieved through a fully legal structure, simply by setting the right salary level.

The S-Corp structure itself doesn't create the savings. The savings come from having any net profit beyond your salary. If your salary equals your profit, the S-Corp provides no FICA advantage over a sole proprietorship.`,
      },
      {
        heading: 'What Gets You Audited',
        body: `The IRS flags S-Corps with zero officer compensation or compensation dramatically below the S-Corp's gross receipts. The IRS's published guidance — its "S Corporation Compensation and Medical Insurance Issues" page and Fact Sheet FS-2008-25 ("Wage Compensation for S Corporation Officers") — directs that shareholder-employees who perform services be paid reasonable compensation before taking distributions, and identifies the factors weighed in that determination, such as training and experience, duties and responsibilities, time and effort devoted to the business, and what comparable businesses pay for similar services.

Three specific red flags: (1) officer salary of zero with substantial distributions, (2) officer salary declining as profits grow (the opposite of what a real employee would experience), and (3) officer compensation below minimum wage for the hours worked.

The single best defense is contemporaneous documentation: a board resolution setting your salary, an employment agreement, and a written compensation analysis referencing industry data. A $50 BLS lookup today is worth thousands in avoided penalties later.`,
      },
      {
        heading: 'Running the Numbers Year-Round',
        body: `The right salary is not a one-time decision. As your S-Corp's revenue grows — or contracts — the appropriate salary level changes. An S-Corp that generated $120,000 last year but is on pace for $280,000 this year should revisit its officer compensation mid-year, before distributions have already been taken at an indefensible ratio.

TaxStat360 flags when your officer salary falls below about 40% of total compensation — within the 35–45% range tax practitioners commonly cite — and displays the relevant case citations inline. That range is a screening heuristic, not an IRS rule: there is no published safe-harbor percentage, and reasonable compensation is always a facts-and-circumstances determination. The tax savings estimate updates in real time as you adjust the salary field, so you can find a defensible figure and see exactly what the FICA savings look like at that salary level.`,
      },
    ],
    relatedSlugs: ['scorp-reasonable-compensation', 'qbi-deduction-guide', 'quarterly-estimated-taxes'],
  },

  {
    slug: 'qbi-deduction-guide',
    title: 'The §199A QBI Deduction for LLC and S-Corp Owners: A Plain-English Guide',
    metaDescription:
      'The §199A QBI deduction lets pass-through business owners deduct up to 20% of qualified business income. Here\'s what it is, who qualifies, what limits apply, and how to maximize it.',
    category: 'Tax Deductions',
    readMinutes: 9,
    publishedDate: '2026-04-15',
    heroIcon: 'chartDown',
    tags: ['QBI', '§199A', 'S-Corp', 'LLC', 'SSTB'],
    sections: [
      {
        heading: 'What the §199A Deduction Is',
        body: `The Tax Cuts and Jobs Act of 2017 created IRC §199A, which allows eligible taxpayers to deduct up to 20% of their Qualified Business Income (QBI) from a pass-through entity — an S-Corporation, partnership, LLC, or sole proprietorship. The One Big Beautiful Bill Act of 2025 (P.L. 119-21) made this deduction permanent and added a ${usd(_qbiMin2026)} minimum deduction for 2026 onward.

For an S-Corp owner with $200,000 of QBI taxed at the 24% marginal rate, a full QBI deduction is worth $200,000 × 20% × 24% = $9,600 in federal income tax savings. For a taxpayer in the 32% bracket, the same deduction saves $12,800.

The deduction is taken on Form 1040 and reduces taxable income without requiring itemization. It is an above-the-line-style benefit that applies even to taxpayers taking the standard deduction.`,
      },
      {
        heading: 'What Counts as Qualified Business Income',
        body: `QBI is the net amount of qualified items of income, gain, deduction, and loss from a qualified trade or business. For an S-Corp, this flows to you on Schedule K-1 as ordinary business income, adjusted for certain items.

What reduces QBI: Section 179 deductions passed through from the entity (Treas. Reg. §1.199A-3(b)(1)(ii)(A)), charitable contributions from the entity, and prior-year QBI losses. What does NOT count as QBI: capital gains, interest income, dividends, foreign income, and most importantly — the W-2 salary you pay yourself as an S-Corp officer.

This last point is critical. If your S-Corp generates $300,000 of gross profit and you pay yourself a $70,000 officer salary, your K-1 ordinary income (and QBI basis) is $230,000 — not $300,000. The salary was already deducted at the entity level before the K-1 was issued.`,
      },
      {
        heading: 'The W-2 Wage and UBIA Limitation',
        body: `Above certain income thresholds, the §199A deduction is limited by either (a) 50% of W-2 wages paid by the business, or (b) 25% of W-2 wages plus 2.5% of the unadjusted basis in qualified property (UBIA).

For 2026, the phase-in range begins at ${usd(_qbiThresh2026.single)} (Single) / ${usd(_qbiThresh2026.mfj)} (MFJ) of taxable income. Between those thresholds and the ceilings (${usd(_qbiCeil2026.single)} Single / ${usd(_qbiCeil2026.mfj)} MFJ), the limitation phases in gradually. Above the ceiling, it applies in full.

Example: Your S-Corp has $400,000 of QBI and pays $120,000 in W-2 wages (including your salary). The 50% W-2 limitation = $60,000. If your tentative QBI deduction is $80,000 (20% of $400K), it is capped at $60,000 — a $20,000 reduction. The fix: pay higher officer wages, which both increases the W-2 wage limitation and (for an S-Corp) reduces distributions but maintains the FICA advantage.`,
      },
      {
        heading: 'Specified Service Trades or Businesses (SSTB)',
        body: `If your business falls into the SSTB category — which includes law, health, consulting, financial services, accounting, and performing arts — the QBI deduction phases out entirely for taxpayers above the income ceiling.

Above ${usd(_qbiCeil2026.single)} (Single) / ${usd(_qbiCeil2026.mfj)} (MFJ) of taxable income in 2026, an SSTB owner's QBI deduction is $0, regardless of W-2 wages or UBIA. The phase-out is a cliff — not a gradual reduction once the ceiling is crossed.

Businesses that are NOT SSTB: engineering, architecture, retail, real estate (rental), manufacturing, and most trades. Mixed businesses — where less than 10% of gross receipts come from SSTB services — may qualify for an allocation of the non-SSTB portion. The regulations are detailed; if your business is on the line, a CPA review of your revenue mix is worth doing before year-end.`,
      },
      {
        heading: 'Planning Strategies',
        body: `Several legitimate strategies affect the QBI deduction amount. First, income management: the QBI deduction is worth more in lower-income years when W-2 wage and SSTB limitations may not apply. Deferring income or accelerating deductions to stay below the phase-in threshold can preserve a full 20% deduction.

Second, W-2 wage optimization: for taxpayers above the phase-in threshold, paying more in wages increases the W-2 wage limitation. The calculus: paying $10,000 more in wages costs roughly $1,530 in FICA (employee + employer) but increases the limitation by $5,000 (50% of $10K) — worthwhile if the QBI deduction was previously capped below $5,000 of the tentative deduction.

Third, entity structuring: a C-Corp generates no QBI and cannot pass through the §199A deduction. S-Corps, partnerships, and sole props do. If you are considering converting entity type, the §199A treatment is a meaningful factor.`,
      },
      {
        heading: 'How TaxStat360 Handles the QBI Calculation',
        body: `TaxStat360 computes the §199A deduction using the 2026 thresholds updated for P.L. 119-21 and applies all three limitation rules simultaneously: the SSTB phase-out, the W-2/UBIA wage limitation, and the taxable income ceiling. The deduction is shown as a separate line in the Tax Waterfall so you can see exactly what it's worth in the context of your full income picture.

The §199A ${usd(_qbiMin2026)} minimum deduction (new for 2026) is also applied: if the calculated deduction would be less than ${usd(_qbiMin2026)}, TaxStat360 uses ${usd(_qbiMin2026)} as the floor. Enter your K-1 §199A statement amounts — W-2 wages and UBIA (Box 17 Code V) — and the SSTB checkbox to see the full computation.`,
      },
    ],
    relatedSlugs: ['scorp-salary-vs-distribution', 'quarterly-estimated-taxes', 'passive-activity-loss-rules'],
  },

  {
    slug: 'quarterly-estimated-taxes',
    title: 'How to Calculate Quarterly Estimated Taxes (And Never Be Surprised in April)',
    metaDescription:
      'Self-employed business owners must pay quarterly estimated taxes to avoid IRS underpayment penalties. Here\'s exactly how to calculate what you owe, when to pay, and how the safe harbor rules work.',
    category: 'Estimated Taxes',
    readMinutes: 7,
    publishedDate: '2026-04-20',
    heroIcon: 'calendar',
    tags: ['Estimated Taxes', 'Form 1040-ES', 'Safe Harbor', '§6654'],
    sections: [
      {
        heading: 'Why Business Owners Pay Quarterly',
        body: `W-2 employees have taxes withheld from every paycheck. Business owners — S-Corp shareholders, partners, and sole proprietors — generally do not. The IRS expects taxes on business income to be paid throughout the year, not in a lump sum on April 15.

IRC §6654 imposes an underpayment penalty when a taxpayer does not pay enough tax through withholding and estimated payments during the year. The penalty is calculated as the federal short-term rate plus 3 percentage points, applied to the underpaid amount for the period of underpayment. Because the IRS resets that rate every quarter to track prevailing interest rates, the exact figure shifts through the year — it has run in the mid-to-high single digits in recent years — but the penalty is entirely avoidable.

The four standard due dates: April 15 (Q1), June 15 (Q2), September 15 (Q3), and January 15 of the following year (Q4). Missing a due date means the underpayment penalty accrues from that date forward, even if you pay in full by the next quarter.`,
      },
      {
        heading: 'The Two Safe Harbor Methods',
        body: `You avoid the §6654 penalty entirely if your total withholding and estimated payments meet either of two safe harbors.

Safe Harbor 1 — 90% of current-year tax: Pay at least 90% of your actual tax liability for the current year, spread across the four quarters. This method requires you to estimate your income accurately throughout the year.

Safe Harbor 2 — 100% (or 110%) of prior-year tax: Pay an amount equal to last year's total tax (Form 1040, Line 24). If your prior-year AGI exceeded $150,000 ($75,000 if married filing separately), the threshold rises to 110% of prior-year tax. This is the most common method for business owners because it requires no current-year estimation — you know exactly what last year's tax was.

Most practitioners use Safe Harbor 2 as the floor and adjust upward if they know this year will be significantly higher. TaxStat360 displays both the safe harbor quarterly amount and the 90%-of-current-year amount so you can choose the lower one.`,
      },
      {
        heading: 'The Math: A Worked Example',
        body: `Assume: Single filer, prior-year total tax (Form 1040 Line 24) = $32,000, prior-year AGI = $180,000.

Because prior-year AGI exceeds $150,000, the safe harbor is 110%:
Safe harbor total = $32,000 × 110% = $35,200
Per-quarter payment = $35,200 ÷ 4 = $8,800

If this year's actual liability turns out to be $48,000, you still owe no underpayment penalty as long as you paid $8,800 by each quarterly deadline. The remaining $12,800 is due by April 15 with your return, penalty-free.

Now assume the same taxpayer's S-Corp has a big Q3 — an unexpected $60,000 contract closes in August. This year's liability will be $62,000, far above last year's. The safe harbor at $35,200 is still honored. But it's smart to also pay extra in Q3 and Q4 to avoid a large April payment — estimated taxes are just a cash flow management tool, not a ceiling.`,
      },
      {
        heading: 'What If Your Income Is Lumpy?',
        body: `The standard approach divides your estimated payment into four equal quarters. But if your income is heavily skewed — a big Q1 from a bonus, or a Q4 from a business sale — the annualized income installment method (Form 2210 Schedule AI) lets you compute each quarter's required payment based on actual income earned through that date. This method prevents overpayment in early quarters and eliminates the penalty even if later quarters are underpaid.

S-Corp owners who take large distributions only in Q4 (for example, after year-end profit is known) often trigger a Q4 underpayment even if the full-year safe harbor is met. This is because the penalty is computed quarter by quarter, not annually. Making consistent quarterly payments — even if the business income is not yet determined — is the safest approach.`,
      },
      {
        heading: 'S-Corp Officers: A Special Consideration',
        body: `S-Corp officer salaries have federal income tax withheld on the W-2. That withholding counts as estimated taxes paid, applied ratably across all four quarters regardless of when the actual paycheck was issued. An S-Corp owner who receives a large December paycheck with significant withholding gets credit as if one-quarter of that withholding was paid in April, June, September, and December — smoothing out the penalty calculation.

This is a planning opportunity: if you know a large Q4 distribution is coming and you haven't made estimated payments, increasing the withholding on your final W-2 paycheck can cover the shortfall. The withholding appears on line 25 of Form 1040 and is treated as evenly distributed. Note: this only works for W-2 withholding, not for estimated tax vouchers.`,
      },
      {
        heading: 'Tracking and Paying',
        body: `Estimated taxes are paid online via EFTPS (Electronic Federal Tax Payment System) using Form 1040-ES vouchers as reference. Payments can also be made through Direct Pay on IRS.gov. Keep records of each payment date and amount — in an audit or penalty dispute, the exact dates matter.

TaxStat360 calculates your recommended quarterly payment based on both safe harbors and displays the exact due dates. Enter your prior-year total tax in the Safe Harbor Inputs section to see the minimum payment needed to avoid penalties. As your income changes through the year, update your figures and the recommendation recalculates automatically.`,
      },
    ],
    relatedSlugs: ['scorp-salary-vs-distribution', 'scorp-reasonable-compensation', 'qbi-deduction-guide'],
  },

  {
    slug: 'scorp-reasonable-compensation',
    title: 'S-Corp Reasonable Compensation: What the IRS Requires and How to Document It',
    metaDescription:
      'IRS rules require S-Corp owner-employees to pay themselves reasonable compensation. Learn the legal standard, common mistakes, audit triggers, and how to document your salary to withstand scrutiny.',
    category: 'S-Corporation',
    readMinutes: 7,
    publishedDate: '2026-04-25',
    heroIcon: 'scales',
    tags: ['Reasonable Compensation', 'S-Corp', 'IRS Audit', 'FICA'],
    sections: [
      {
        heading: 'The Legal Foundation',
        body: `IRC §3121(d)(1) classifies corporate officers as employees subject to FICA taxes. For an S-Corporation, this means any shareholder who performs services — however minimal — must receive a reasonable salary before taking distributions. This rule is not optional and not negotiable.

Rev. Rul. 74-44 established that payments by a corporation to a shareholder-employee for services rendered cannot be recharacterized as dividends (or in the S-Corp context, distributions) to avoid FICA. The ruling predates S-Corps but applies with equal force.

The penalty for getting this wrong: the IRS can reclassify distributions as wages, assess the employer and employee FICA taxes that should have been withheld, add interest from the date those taxes were due, and impose a 100% Trust Fund Recovery Penalty on the responsible person — personally, not just on the entity.`,
      },
      {
        heading: 'What "Reasonable" Actually Means',
        body: `The IRS defines reasonable compensation as the amount that would ordinarily be paid for like services by like enterprises under like circumstances — an arm's-length standard. In practice, this means: what would you pay an unrelated employee to do what you do?

Courts and the IRS have identified the following factors as most relevant: the employee's role in the company, the character and condition of the company, the alleged compensation compared to distributions, the compensation paid to non-shareholder employees for similar services, and comparison to industry norms.

There is no bright-line dollar amount or percentage. A dentist generating $800,000 of revenue who pays herself $60,000 in salary will face far greater scrutiny than one generating $150,000 who pays $60,000. The ratio of compensation to distributions matters, but so does the absolute amount relative to the market rate.`,
      },
      {
        heading: 'Landmark Cases You Should Know',
        body: `David E. Watson, P.C. v. United States, 668 F.3d 1008 (8th Cir. 2012) is the most cited reasonable compensation case. Watson, a CPA, routed his interest in an accounting firm through an S-corp that received roughly $200,000 a year in distributions, yet paid himself only $24,000 in salary. A federal district court — affirmed by the Eighth Circuit — found that $91,044 was reasonable compensation for each year, with the difference treated as wages subject to back employment taxes, penalties, and interest.

The case established that courts will look at what comparable employees earn, not at what the shareholder-employee finds advantageous. The court explicitly noted that Watson's attempts to justify the low salary (arguing it reflected his contribution as a non-technical worker) were undermined by the size of his distributions.

Glass Blocks Unlimited v. Commissioner, T.C. Memo. 2013-180 similarly recharacterized the sole shareholder-officer's distributions as wages — over $30,000 for each of 2007 and 2008 — even though the company's net income was far lower, adding employment taxes and penalties.`,
      },
      {
        heading: 'Industry Benchmarks You Can Use',
        body: `Defensible compensation documentation starts with a written analysis referencing third-party salary data. Acceptable sources include:

Bureau of Labor Statistics Occupational Employment and Wage Statistics (free, published annually): Look up your Standard Occupational Classification code and find the median wage for your geographic area.

Robert Half Salary Guide (finance, accounting): Published annually, searchable by role and metro area.

Medical Group Management Association (MGMA): Standard reference for physician and medical practice compensation.

LinkedIn Salary and Glassdoor: Useful for technology and professional services roles.

The analysis should document: (1) the specific comparable role(s) used, (2) the source and date of the data, (3) your geographic market, (4) any adjustments for years of experience or company size, and (5) the conclusion reached. A one-page memo attached to a board resolution is sufficient. It does not need to be a formal report unless you are in a high-risk industry or a high-compensation situation.`,
      },
      {
        heading: 'What to Do If You Have Already Underpaid',
        body: `If you recognize that your S-Corp has been paying you an unreasonably low salary in prior years, you have two options: prospectively correct it (adjust your salary going forward) or file amended payroll tax returns for prior periods.

Voluntary correction is generally preferable to waiting for an IRS examination. The IRS's Voluntary Correction Program (VCP) under EPCRS does not cover payroll tax issues, but proactively amending prior Forms 941 and paying the back taxes — before an audit is opened — typically results in interest but avoids the full suite of penalties available to examiners.

If the amount is material and covers multiple years, a tax attorney review is warranted. Amended payroll returns trigger a paper trail that could draw attention; structuring the correction carefully matters.`,
      },
      {
        heading: 'The Right Process Going Forward',
        body: `Set your salary before the fiscal year starts, not retroactively. An S-Corp board resolution (even a single-member S-Corp should document this) setting the officer's annual compensation, signed and dated before the first paycheck of the year, is the starting point.

Review it annually. As the business grows, so should the salary — or you should document why it did not. An S-Corp where revenue doubled but officer compensation held flat requires a written explanation of why that outcome is still arm's-length (perhaps because the company retained earnings for expansion, and a third-party employee would not have received the full benefit of that growth).

TaxStat360 flags when officer salary falls below about 40% of total compensation — within the 35–45% range practitioners commonly cite — and surfaces the relevant IRS citations. The percentage is a screening heuristic, not a safe harbor: the final determination always depends on your specific facts and the industry data you document.`,
      },
    ],
    relatedSlugs: ['scorp-salary-vs-distribution', 'quarterly-estimated-taxes', 'qbi-deduction-guide'],
  },

  {
    slug: 'passive-activity-loss-rules',
    title: 'Passive Activity Loss Rules for Real Estate Investors: The Complete Guide',
    metaDescription:
      'IRC §469 limits when you can deduct rental losses. Learn the $25,000 allowance, Real Estate Professional status, passive loss carryforwards, and how to maximize your deductions legally.',
    category: 'Real Estate',
    readMinutes: 9,
    publishedDate: '2026-05-01',
    heroIcon: 'home',
    tags: ['Passive Activity', '§469', 'Real Estate', 'REP Status', 'Form 8582'],
    sections: [
      {
        heading: 'The Basic Rule: Passive Losses Can Only Offset Passive Income',
        body: `IRC §469, enacted by the Tax Reform Act of 1986, fundamentally changed real estate investing by restricting when losses from rental activities can be deducted. The basic rule: passive activity losses can only offset passive activity income. They cannot offset wages, business income, or portfolio income (dividends and interest).

Rental activities are presumed passive by default, regardless of your level of involvement, with two exceptions that we'll examine. This means a real estate investor who earns $150,000 from her job and generates $30,000 of rental losses (after depreciation) cannot simply subtract the $30,000 from her W-2 income. The losses are "suspended" and carried forward to future years, where they can be applied against passive income or released in full when the property is sold.

Suspended losses accumulate on Form 8582 (Passive Activity Loss Limitations). When you sell the property, all suspended losses from that property are released and deductible in the year of sale.`,
      },
      {
        heading: 'The $25,000 Special Allowance (Active Participation)',
        body: `IRC §469(i) creates a limited exception for "active participants" in rental real estate. If you actively participated — meaning you made management decisions about the property in a bona fide sense (approving tenants, setting rents, authorizing repairs) — you can deduct up to $25,000 of rental losses against non-passive income.

The $25,000 allowance phases out at 50 cents per dollar of AGI above $100,000, reaching zero at $150,000 AGI. At $125,000 AGI, for example, the allowance is: $25,000 − (($125,000 − $100,000) × 0.50) = $12,500. At $150,000 and above, no allowance is available.

Note: if you file Married Filing Separately and you lived with your spouse at any point during the year, your allowance is zero regardless of AGI. MFS filers who lived apart the entire year have a $12,500 allowance (half the $25,000), with its own phase-out schedule.

Active participation is a lower bar than material participation — you do not need to spend 500 hours managing the property. But you cannot be a completely passive investor (for example, owning through a limited partnership where a general partner manages everything) and still claim active participation.`,
      },
      {
        heading: 'Real Estate Professional Status: Unlimited Deductions',
        body: `IRC §469(c)(7) creates a far more powerful exception: Real Estate Professional (REP) status. If you qualify, your rental activities are reclassified from passive to non-passive, and rental losses can offset any income — wages, business income, anything.

To qualify, two tests must both be satisfied:
1. More than 750 hours in real property trades or businesses in which you materially participate.
2. More than 50% of all your personal services during the year are in real property trades or businesses.

The second test is the killer for most W-2 employees. If you work a 40-hour-per-week job, you spend approximately 2,080 hours annually at that job. To pass the 50% test, you would need to spend more time in real estate than at your job — essentially making real estate your primary occupation. Spending 800 hours on real estate while working 2,080 hours at a W-2 job fails the 50% test even though it clears the 750-hour hurdle.

Spouses can aggregate hours in one of their names, but not split hours between them. A married couple where one spouse works part-time (say, 1,000 hours/year at a W-2 job) and spends 1,200 hours on real estate could qualify: the real estate hours (1,200) exceed both the 750-hour threshold and 50% of all services (1,200 of 2,200 total = 54.5%).`,
      },
      {
        heading: 'Documenting REP Status',
        body: `The IRS scrutinizes REP claims heavily, and courts have rejected them where contemporaneous records were absent. A taxpayer claiming 800 real estate hours who cannot produce logs, calendars, or other contemporaneous evidence will almost certainly lose the deduction on examination.

Contemporaneous means recorded at or near the time the activity occurred — not reconstructed from memory when you receive an audit notice. A simple spreadsheet or calendar entry noting date, property, activity, and hours is sufficient. It does not need to be elaborate, but it must be consistent.

Qualifying real estate activities include: real property development, construction, acquisition, conversion, rental, operation, management, leasing, and brokerage. Time spent as a passive investor (reviewing statements, attending investor meetings) does not count. Time commuting to properties generally does not count unless travel itself is the business activity.`,
      },
      {
        heading: 'Passive Loss Carryforwards: The Hidden Asset',
        body: `Every year that your rental losses exceed allowable deductions, the excess is suspended and carried forward — indefinitely. For a high-income investor above the $150,000 AGI threshold with no passive income and no REP status, 100% of rental losses accumulate on Form 8582.

These carryforwards are not lost. They represent a future tax asset with several release mechanisms:

1. Disposition: When you sell the property in a taxable transaction, all suspended losses attributable to that property are released in the year of sale. A property with $80,000 of accumulated suspended losses, sold this year, generates an $80,000 deduction in the year of sale — which can reduce taxable gain significantly.

2. Passive income: If you acquire a new investment that generates passive income (a limited partnership interest, a rental property with net income), your carryforwards can offset it.

3. REP qualification: Qualifying as a Real Estate Professional makes the activity non-passive going forward. Note that this does not by itself release prior suspended losses against all income — under §469(f), those "former passive activity" losses can offset income from that same activity (or other passive income) and are fully freed only on a qualifying disposition.

Tracking your suspended losses by property on Form 8582 is essential. Many investors don't realize the magnitude of their carryforward until they sell — and then are surprised that their tax bill is lower than expected because of deductions they couldn't use years earlier.`,
      },
      {
        heading: 'Planning Around §469',
        body: `Several strategies work within §469 to maximize deductible losses. First, passive income grouping: §469 allows taxpayers to group multiple rental properties as a single activity for material participation and passive income purposes. Grouping profitable and loss rentals can make the combined activity passive-income-positive, releasing losses from the profitable properties.

Second, real estate syndications: limited partnership interests in real estate funds generate passive income that can absorb suspended losses from your direct rental properties. This is why some high-income investors in real estate funds — who cannot use the losses from the fund directly — can pair them with passive income from their own properties.

Third, short-term rentals: rentals where the average customer stay is 7 days or less are not subject to §469's passive presumption — they're treated like a business. If you materially participate (which requires meeting one of seven IRS tests, typically 500+ hours or more than any other person), losses are active and deductible against any income. This is the tax treatment behind many high-income investors' interest in vacation rental platforms.

TaxStat360 models the §469(i) phase-out and REP status in real time. Enter your AGI, rental income, and expenses, and check the appropriate box — the tool shows exactly how much of the loss is deductible under the special allowance, how much is suspended, and how REP status changes the picture.`,
      },
    ],
    relatedSlugs: ['quarterly-estimated-taxes', 'scorp-salary-vs-distribution', 'qbi-deduction-guide'],
  },
]

// Lookup helper
export function getArticle(slug) {
  return ARTICLES.find(a => a.slug === slug) || null
}
