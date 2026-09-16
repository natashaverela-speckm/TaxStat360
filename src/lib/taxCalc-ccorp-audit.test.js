// src/lib/taxCalc-ccorp-audit.test.js
//
// C-CORP AUDIT (11 Sep 2026). Companion to taxCalc-live-scenario-audit.test.js. Every
// figure is a hand computation from the Code and Rev. Proc. 2024-40 / 2025-32, made
// independently of the engine, then compared to the production site. The corporate
// layer itself was right on every scenario — including the one where the personal AMT
// reaches into a large dividend — and the existing calcCCorpReturn tests only ever
// re-derived the engine's own formula, so these pin real dollar amounts.
//
// The one defect was in the surfaces that FOLD the layer into the owner's return: all
// three ignored Ownership %, so a 50% shareholder was taxed on 100% of the dividends.
// ccorpOwnerShare() is the shared fix; its arithmetic is pinned here as well.
//
// Test labels (ARCHITECTURE §6): SPEC — verified against the cited authority.

import { describe, it, expect } from 'vitest'
import { calcCCorpReturn, calcCCorpCorporateLayer, calcTaxReturn, getTable } from './taxCalc.js'
import { ccorpOwnerShare } from '../utils/entityPredicates.js'

describe('Corporate layer — IRC §11 flat 21% on profit after salary and §3111 employer FICA', () => {
  it('SPEC: single 2025 · profit 300,000 before a 100,000 salary — corp 40,394, owner total 93,910', () => {
    // Employer FICA 7,650 (6.2% + 1.45% × 100,000). Profit before tax 192,350. 21% = 40,393.5 → 40,394.
    // Dividends 151,956. Personal: AGI 251,956; std 15,750; ordinary 84,250 → 13,449; 151,956 × 15% = 22,793;
    // NIIT 3.8% × (251,956 − 200,000) = 1,974. Personal 38,216 + both FICA halves 15,300 + corp 40,394.
    const r = calcCCorpReturn({ netProfit: 300000, officerSalary: 100000, personalContext: { taxYear: 2025, status: 'single' } })
    expect(r.employerFICA).toBe(7650)
    expect(r.profitBeforeTax).toBe(192350)
    expect(r.corpTax).toBe(40394)
    expect(r.dividends).toBe(151956)
    expect(r.personal.fedTax).toBe(36242)
    expect(r.personal.niitAmount).toBe(1974)
    expect(r.personal.totalTax).toBe(38216)
    expect(r.employmentTax).toBe(15300)
    expect(r.totalTax).toBe(93910)
  })

  it('SPEC: MFJ 2025 · profit 500,000, salary 200,000 — Social Security wage base 176,100 caps the employer share', () => {
    // Employer FICA 6.2% × 176,100 + 1.45% × 200,000 = 13,818. Profit before tax 286,182; 21% = 60,098.
    // Dividends 226,084. Personal: taxable 394,584; ordinary 168,500 → 26,898; 226,084 × 15% = 33,913;
    // NIIT 3.8% × (426,084 − 250,000) = 6,691. Additional Medicare: wages under the 250,000 joint threshold.
    const r = calcCCorpReturn({ netProfit: 500000, officerSalary: 200000, personalContext: { taxYear: 2025, status: 'mfj' } })
    expect(getTable(2025).ssWageBase).toBe(176100)
    expect(r.employerFICA).toBe(13818)
    expect(r.corpTax).toBe(60098)
    expect(r.dividends).toBe(226084)
    expect(r.personal.fedTax).toBe(60811)
    expect(r.personal.niitAmount).toBe(6691)
    expect(r.personal.totalTax).toBe(67502)
    expect(r.employmentTax).toBe(27636)
    expect(r.totalTax).toBe(155236)
  })

  it('SPEC: single 2026 · profit 200,000, default 30% salary — dividends partly in the 0% bracket', () => {
    // Salary 60,000; employer FICA 4,590; profit before tax 135,410; 21% = 28,436; dividends 106,974.
    // Ordinary 43,900 → 5,020. 0% room to 49,450 = 5,550; remaining 101,424 × 15% = 15,213.6. Total 20,234.
    const r = calcCCorpReturn({ netProfit: 200000, personalContext: { taxYear: 2026, status: 'single' } })
    expect(r.officerSalary).toBe(60000)
    expect(r.corpTax).toBe(28436)
    expect(r.dividends).toBe(106974)
    expect(r.personal.fedTax).toBe(20234)
    expect(r.personal.niitAmount || 0).toBe(0)
    expect(r.totalTax).toBe(57850)
  })

  it('SPEC: single 2025 · profit 1,000,000, salary 200,000 — 20% bracket, NIIT, and the personal AMT bites', () => {
    // Corp: FICA 13,818; profit before tax 786,182; 21% = 165,098; dividends 621,084.
    // Regular: ordinary 184,250 → 37,067; preferential 349,150 × 15% + 271,934 × 20% = 106,759; fedTax 143,826.
    // NIIT 3.8% × 621,084 = 23,601. AMT: AMTI 821,084; exemption 88,100 − 25% × (821,084 − 626,350) = 39,416.5;
    // base 781,667.5 → line 17 160,583.5 × 26% = 41,751.7; Form 6251 line 27 = REGULAR ordinary
    // taxable income 184,250, so the 15%/20% split is the regular one: 106,759 (SEVENTH PASS F-1,
    // 16 Sep 2026 — the earlier 105,576 stacked the bands on the AMT ordinary base). TMT 148,510.7;
    // AMT 4,685.
    const r = calcCCorpReturn({ netProfit: 1000000, officerSalary: 200000, personalContext: { taxYear: 2025, status: 'single' } })
    expect(r.corpTax).toBe(165098)
    expect(r.dividends).toBe(621084)
    expect(r.personal.fedTax).toBe(143826)
    expect(r.personal.prefTax).toBe(106759)
    expect(r.personal.niitAmount).toBe(23601)
    expect(r.personal.amt).toBe(4685)
    expect(r.personal.totalTax).toBe(172112)
    expect(r.totalTax).toBe(364846)
  })

  it('SPEC: salary above profit — no corporate tax, no dividends, and no corporate NOL is modelled', () => {
    const l = calcCCorpCorporateLayer({ netProfit: 100000, officerSalary: 150000, taxYear: 2025 })
    expect(l.officerSalary).toBe(100000)   // capped at available profit
    expect(l.corpTax).toBe(0)
    expect(l.dividends).toBe(0)
  })
})

describe('Owner share — ccorpOwnerShare() is what the Tax Tracker, Dashboard and Simulator fold into the 1040', () => {
  const layer = calcCCorpCorporateLayer({ netProfit: 300000, officerSalary: 100000, taxYear: 2025 })

  it('SPEC: 100% owner gets the whole layer', () => {
    expect(ccorpOwnerShare(layer, '100')).toEqual({ share: 1, corpTax: 40394, dividends: 151956 })
    expect(ccorpOwnerShare(layer, undefined).share).toBe(1)   // blank Ownership % means 100
    expect(ccorpOwnerShare(layer, '').share).toBe(1)
  })

  it('SPEC: 50% owner gets half the dividends and half the corporate tax (§301(a) pro-rata distribution)', () => {
    expect(ccorpOwnerShare(layer, '50')).toEqual({ share: 0.5, corpTax: 20197, dividends: 75978 })
  })

  it('SPEC: explicit 0% is zero, not 100 (the falsy-zero bug ownPct() exists to prevent)', () => {
    expect(ccorpOwnerShare(layer, '0')).toEqual({ share: 0, corpTax: 0, dividends: 0 })
  })

  it('SPEC: the 50% shareholder on the live site — 45,043, not the 78,610 that was shown', () => {
    // Salary stays the owner's own W-2. Dividends 75,978: AGI 175,978; taxable 160,228; ordinary 84,250 → 13,449;
    // 75,978 × 15% = 11,396.7; fedTax 24,846; MAGI under 200,000 so no NIIT. Plus half the corporate tax, 20,197.
    const mine = ccorpOwnerShare(layer, '50')
    const r = calcTaxReturn({ taxYear: 2025, status: 'single', w2: 100000, divInc: mine.dividends, qualDiv: mine.dividends, entities: [] })
    expect(r.fedTax).toBe(24846)
    expect(r.niitAmount || 0).toBe(0)
    expect(r.totalTax + mine.corpTax).toBe(45043)
  })
})
