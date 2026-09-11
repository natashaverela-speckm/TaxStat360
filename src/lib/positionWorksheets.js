// src/lib/positionWorksheets.js
//
// AUDIT C2 (second launch audit, Sep 2026) — THIS FEATURE USED TO WRITE TO THE IRS.
//
// The Enterprise "Position Documentation" feature shipped three static letters. Each
// opened "Dear IRS Representative,", announced that it "responds to your inquiry", and
// closed "Respectfully submitted," under a heading reading "IRS Response Templates",
// subtitled "Review and edit before sending", with Copy-to-Clipboard and Print beneath
// and a footnote about "submitting to the IRS".
//
// Three problems, and the first ends the argument:
//
//  1. 31 C.F.R. 10.2(a)(4) defines practice before the IRS to include "corresponding and
//     communicating with the Internal Revenue Service on behalf of a taxpayer." Drafting
//     a taxpayer's reply to an IRS inquiry and telling them to send it is that. An earlier
//     audit identified this and moved the LABEL rather than changing the feature; the CI
//     guard meant to prevent it greps for the phrase "notice response", and the heading
//     said "IRS Response Templates", so the guard passed straight over it.
//
//  2. Terms.jsx section 2 and the pricing page both state as fact that "TaxStat360 does
//     not draft correspondence to the IRS, does not prepare responses to IRS notices."
//     Those sentences were written on the assumption that this feature was already
//     conservative. They were false while the letters shipped — an FTC section 5 deception
//     exhibit sitting inside the company's own contract.
//
//  3. The letters asserted facts the software cannot know — "The taxpayer performed more
//     than 750 hours of services", "The taxpayer is at risk for the full amount of the
//     loss under IRC 465" — and were STATIC, with no connection to the user's record at
//     all. That is why NarrativeModal was the only modal on that screen never given `rec`.
//     They were also hardcoded to "tax year 2025" after the app had moved to 2026, while
//     the Risk Scan in the same file warned that REP status alongside outside W-2 income
//     is a high-risk position — so the product argued both sides of the same question.
//
// WHAT THIS IS NOW: a substantiation worksheet the taxpayer works through with their own
// CPA or Enrolled Agent BEFORE filing. It states the position, cites the authority, lists
// the records that have to exist, and turns every former assertion into a question keyed
// to figures the user actually entered. It is addressed to nobody and cannot be sent.
//
// WARNING: do not reintroduce salutations, sign-offs, address to the Service in the second
// person, or any instruction to send, submit, mail or file this. The guards in
// src/complianceCopy.test.js fail the build on those, and they now match the CLAIM rather
// than one spelling of it.

import { nf, fmt } from '../utils/money.js'
import { isSCorpEntity, getEntityNetProfit } from '../utils/entityPredicates.js'
import { CURRENT_TAX_YEAR } from './constants.js'

// Mirrors AIAnalysis.getTotalW2: W-2 entered in Step 2 plus every entity officer salary.
function totalW2(rec) {
  if (!rec) return 0
  const f = rec.f1040 || {}
  const entities = Array.isArray(rec.entities) ? rec.entities : []
  return nf(f.w2Income) + entities.reduce((s, e) => s + nf(e?.pnl?.officerSalary), 0)
}

/**
 * Build the three position-substantiation worksheets for a record.
 * Pure: no DOM, no storage, no network. Returns [{ title, tag, text }].
 */
export function buildPositionWorksheets(rec) {
  const r = rec || {}
  const b = r.biz || {}
  const f = r.f1040 || {}
  const year = parseInt(b.year) || r.taxYear || CURRENT_TAX_YEAR
  const ents = Array.isArray(r.entities) ? r.entities : []
  const sCorps = ents.filter(e => isSCorpEntity(e?.type))
  // FRESH-EYES F-11 (11 Sep 2026): this read `sCorps.reduce(...) || nf(b.officerSalary)`.
  // When every S-Corp carried $0 officer salary the sum was 0 — falsy — so `||` substituted
  // the legacy single-business field. A record migrated from the old shape with
  // b.officerSalary = 80,000 then produced a healthy compRatio on the worksheet built to
  // substantiate that exact position, while the Substantiation Check, reading the entities
  // directly, flagged 'No Officer Compensation'. Two screens, opposite answers, one record.
  // Zero is the answer here, and it is the answer that matters. Fall back to b.officerSalary
  // ONLY when there are no S-Corp entities at all (legacy record).
  const officerSalary = sCorps.length > 0
    ? sCorps.reduce((s, e) => s + nf(e?.pnl?.officerSalary), 0)
    : nf(b.officerSalary)
  const sCorpProfit = sCorps.reduce((s, e) => s + Math.max(0, getEntityNetProfit(e)), 0)
  const compRatio = (officerSalary + sCorpProfit) > 0
    ? Math.round((officerSalary / (officerSalary + sCorpProfit)) * 100)
    : null
  const rentalIncome = nf(b.rentalIncome) || nf(f.rentalIncome)
  const isREP = !!(b.isREP || f.isREP || r.isREP)
  const w2 = totalW2(r)
  const stockBasis = ents.reduce((s, e) => s + nf(e?.stockBasis), 0)
  const debtBasis = ents.reduce((s, e) => s + nf(e?.debtBasis), 0)
  const k1 = nf(r.k1Income)
  const entityNames = sCorps.map(e => e?.name).filter(Boolean).join(', ')

  const known = (label, value) => `${label}: ${value}`
  const unknown = (label) => `${label}: — not entered —`

  return [
    {
      title: 'Real Estate Professional Status',
      tag: `REP · IRC §469(c)(7) · TY${year}`,
      text: [
        `POSITION SUBSTANTIATION WORKSHEET — REAL ESTATE PROFESSIONAL STATUS`,
        `Tax year ${year}. For your own file and for your CPA or Enrolled Agent.`,
        ``,
        `THE POSITION`,
        `Rental real estate losses are treated as non-passive under IRC §469(c)(7)(A),`,
        `rather than being suspended under §469(a).`,
        ``,
        `WHAT YOUR RECORD CURRENTLY SHOWS`,
        `  ${isREP ? known('Real Estate Professional elected', 'YES') : known('Real Estate Professional elected', 'no')}`,
        `  ${rentalIncome > 0 ? known('Rental income entered', fmt(rentalIncome)) : unknown('Rental income entered')}`,
        `  ${w2 > 0 ? known('W-2 income from all sources', fmt(w2)) : known('W-2 income from all sources', '$0')}`,
        ``,
        `WHAT §469(c)(7)(B) REQUIRES YOU TO ESTABLISH`,
        `  On a joint return, ONE spouse must satisfy BOTH tests below alone. Hours cannot be`,
        `  combined between spouses for the >50% test or the 750-hour test (§469(c)(7)(B),`,
        `  flush language). Both spouses' participation DOES count toward material`,
        `  participation in each activity (§469(h)(5)). Answer the hour questions for the`,
        `  spouse claiming the status.`,
        ``,
        `  1. More than 50% of ALL personal services you performed in ${year}, in any trade`,
        `     or business, were performed in real property trades or businesses in which`,
        `     you materially participated.`,
        `       → How many total hours did you work in ${year}, across everything? ________`,
        `       → How many of those were in real property trades or businesses?    ________`,
        `       → Is the second number more than half the first?                   ________`,
        ``,
        `  2. You performed more than 750 hours of service in real property trades or`,
        `     businesses in which you materially participated.`,
        `       → Documented real-property hours for ${year}:                      ________`,
        ``,
        `  3. Material participation in each rental activity, or a valid grouping election`,
        `     under Treas. Reg. §1.469-9(g) treating all interests as one activity.`,
        `       → Grouping election made and statement filed?                      ________`,
        ``,
        `RECORDS THAT MUST EXIST`,
        `  · Contemporaneous time logs — date, property, activity, hours. A log`,
        `    reconstructed at year end is the single most common reason this position`,
        `    fails on examination.`,
        `  · Evidence of the nature of the services, not just their duration.`,
        `  · If a §1.469-9(g) election was made: the written statement filed with the`,
        `    return for the year of election.`,
        ``,
        w2 > 75000 && isREP
          ? `POINT OF TENSION IN YOUR OWN FIGURES\n  Your record shows ${fmt(w2)} of W-2 income alongside an REP election. Every hour\n  worked in that employment counts against the >50% test in §469(c)(7)(B)(i).\n  Work through the hour counts above with your practitioner before filing.`
          : `POINT OF TENSION TO CHECK\n  Outside employment counts against the >50% test. If you hold a W-2 job, the\n  real-property hours must exceed all other working hours combined.`,
        ``,
        `This worksheet records what you would need to support the position. It does not`,
        `establish that you meet it, and nothing here is a determination of your status.`,
      ].join('\n'),
    },
    {
      title: 'S-Corp Reasonable Compensation',
      tag: `Officer Compensation · Rev. Rul. 74-44 · TY${year}`,
      text: [
        `POSITION SUBSTANTIATION WORKSHEET — S-CORP OFFICER COMPENSATION`,
        `Tax year ${year}. For your own file and for your CPA or Enrolled Agent.`,
        ``,
        `THE POSITION`,
        `Officer compensation paid to the shareholder-employee is reasonable for the`,
        `services actually rendered, so the remaining profit is properly a distribution`,
        `rather than wages.`,
        ``,
        `WHAT YOUR RECORD CURRENTLY SHOWS`,
        `  ${entityNames ? known('S-Corp entities', entityNames) : unknown('S-Corp entities')}`,
        // F-11: with S-Corp entities on the record, $0 is a FIGURE (the one that matters most
        // on this worksheet), not a blank. Only a record with no S-Corp at all is 'not entered'.
        `  ${officerSalary > 0 || sCorps.length > 0 ? known('Officer compensation entered', fmt(officerSalary)) : unknown('Officer compensation entered')}`,
        `  ${sCorpProfit > 0 ? known('S-Corp net profit after that salary', fmt(sCorpProfit)) : unknown('S-Corp net profit after that salary')}`,
        `  ${compRatio !== null ? known('Salary as a share of total compensation', compRatio + '%') : unknown('Salary as a share of total compensation')}`,
        ``,
        `THE STANDARD`,
        `Rev. Rul. 74-44 and the case law applying it use a facts-and-circumstances test.`,
        `There is NO published safe-harbour percentage — any ratio you have read about,`,
        `including the 35-45% practitioners often cite, is a heuristic and not authority.`,
        `Watson v. Commissioner, 668 F.3d 1008 (8th Cir. 2012) is the leading case.`,
        ``,
        `WHAT YOU NEED TO BE ABLE TO SHOW`,
        `  · The duties actually performed, and roughly the hours spent:      ________`,
        `  · Comparable pay for those duties in your industry and region,`,
        `    with the source of the comparison:                               ________`,
        `  · Your training, experience and certifications:                    ________`,
        `  · What the business would have had to pay someone else to do it:   ________`,
        `  · How the figure was arrived at, and when:                         ________`,
        ``,
        `RECORDS THAT MUST EXIST`,
        `  · Payroll records and Forms W-2 for the officer.`,
        `  · Forms 941 and the annual reconciliation.`,
        `  · A written, contemporaneous basis for the compensation figure — a memo to`,
        `    file from the time the salary was set is worth considerably more than an`,
        `    explanation constructed afterwards.`,
        `  · Any compensation study or survey data relied on.`,
        ``,
        `Discuss the figure with your CPA or Enrolled Agent before filing. This worksheet`,
        `organizes the support; it does not conclude that the compensation is reasonable.`,
      ].join('\n'),
    },
    {
      title: 'K-1 Loss Deductibility',
      tag: `Schedule E · IRC §1366(d) · TY${year}`,
      text: [
        `POSITION SUBSTANTIATION WORKSHEET — DEDUCTIBILITY OF A K-1 LOSS`,
        `Tax year ${year}. For your own file and for your CPA or Enrolled Agent.`,
        ``,
        `THE POSITION`,
        `A loss reported on Schedule E from a pass-through K-1 is currently deductible`,
        `rather than suspended.`,
        ``,
        `WHAT YOUR RECORD CURRENTLY SHOWS`,
        `  ${k1 !== 0 ? known('K-1 ordinary business income (loss)', fmt(k1)) : unknown('K-1 ordinary business income (loss)')}`,
        `  ${stockBasis > 0 ? known('Stock basis entered', fmt(stockBasis)) : unknown('Stock basis entered')}`,
        `  ${debtBasis > 0 ? known('Debt basis entered', fmt(debtBasis)) : unknown('Debt basis entered')}`,
        ``,
        `THREE GATES, IN ORDER. A loss must clear all three.`,
        `  1. BASIS — IRC §1366(d)(1). The loss is allowed only up to stock basis plus`,
        `     basis of shareholder debt. Excess carries forward under §1366(d)(2).`,
        `       → Basis computed on Form 7203 and attached to the return?        ________`,
        `       → Basis figure at the start and end of ${year}:                  ________`,
        ``,
        `  2. AT-RISK — IRC §465. Amounts protected against loss, and most nonrecourse`,
        `     financing, do not count as at-risk.`,
        `       → Form 6198 prepared where required?                             ________`,
        `       → Any guarantees, stop-loss arrangements or nonrecourse debt?     ________`,
        ``,
        `  3. PASSIVE ACTIVITY — IRC §469. If you do not materially participate, the loss`,
        `     is passive and offsets only passive income.`,
        `       → Which of the seven tests in Treas. Reg. §1.469-5T(a) do you meet? ______`,
        `       → Hours of participation, and how they are documented:            ________`,
        ``,
        `RECORDS THAT MUST EXIST`,
        `  · Form 7203 with the basis computation and its supporting schedule.`,
        `  · Loan documents for any debt included in basis, showing a direct loan from`,
        `    you to the corporation — a guarantee of corporate debt does not create basis.`,
        `  · Capital contribution records and distribution history.`,
        `  · Form 1120-S and the K-1 as issued.`,
        `  · Participation records if material participation is being relied on.`,
        ``,
        stockBasis === 0 && debtBasis === 0
          ? `GAP IN YOUR OWN FIGURES\n  No stock or debt basis has been entered for any entity. Basis is the FIRST gate\n  under §1366(d) — without a computed figure this position cannot be supported at\n  all. Complete Form 7203 with your practitioner before filing.`
          : `CHECK\n  Confirm the basis figures above are the computed Form 7203 amounts and not\n  estimates, and that they are tracked year to year.`,
        ``,
        `This worksheet organizes the support for the position. It does not conclude that`,
        `the loss is deductible.`,
      ].join('\n'),
    },
  ]
}

