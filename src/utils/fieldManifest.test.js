// @vitest-environment jsdom
// src/utils/fieldManifest.test.js
//
// PHASE 2.1 (audit V2 / Pass-6 P6-2) — the shared field manifest.
//
// These tests are GENERATED from the manifest itself: every field gets a
// write→read round-trip and a normalize coercion check automatically, so a
// future field added to F1040_FIELD_MANIFEST is tested the moment it exists —
// the inverse of the old failure mode, where a new field had to be remembered
// in five places and tested in none.
//
// Labels (ARCHITECTURE §6): CHAR throughout — these freeze the session-layer
// contract (the tax semantics of the values are SPEC-tested in the engine
// suites).

import { describe, it, expect, beforeEach } from 'vitest'
import {
  F1040_FIELD_MANIFEST,
  buildPersonalContextPayload,
  extractPersonalContext,
  normalizeF1040Fields,
  YTD_SCALE_ENGINE_FIELDS,
  YTD_SCALE_ENTITY_FIELDS,
} from './fieldManifest.js'
import { writePersonalContext, readPersonalContext, normalizeF1040 } from './sessionState.js'

const sampleFor = (f) => {
  switch (f.kind) {
    case 'string': return 'mfj'
    case 'int':    return 7
    case 'float':  return 12345.67
    case 'bool':   return true
    case 'boolDefaultTrue': return false          // the interesting direction
    case 'array':  return [{ k1: 100 }]
    default: return 1
  }
}

describe('manifest — generated write→read round-trip (every field)', () => {
  beforeEach(() => sessionStorage.clear())

  it('CHAR: every manifest field survives writePersonalContext → readPersonalContext', () => {
    const input = {}
    for (const f of F1040_FIELD_MANIFEST) input[f.key] = sampleFor(f)
    writePersonalContext(input)
    const out = readPersonalContext()
    for (const f of F1040_FIELD_MANIFEST) {
      expect(out[f.key], f.key).toEqual(input[f.key])
    }
  })

  it('CHAR: falsy-but-valid values (0 / false / empty array) are preserved, never defaulted', () => {
    const input = {}
    for (const f of F1040_FIELD_MANIFEST) {
      input[f.key] = f.kind === 'array' ? [] : f.kind === 'string' ? 'single'
        : (f.kind === 'bool' || f.kind === 'boolDefaultTrue') ? false : 0
    }
    writePersonalContext(input)
    const out = readPersonalContext()
    expect(out.isActiveParticipant, 'boolDefaultTrue stored false must read false').toBe(false)
    expect(out.w2Income).toBe(0)
    expect(out.ytdMode).toBe(false)
    expect(out.capLossCarryforwardST).toBe(0)
  })

  it('CHAR: unknown keys are never serialized (repHours guarantee, manifest-enforced)', () => {
    writePersonalContext({ w2Income: 1, repHoursRE: 800, repHoursTotal: 900, anythingElse: 1 })
    const raw = JSON.parse(sessionStorage.getItem('ts360_f1040'))
    expect('repHoursRE' in raw).toBe(false)
    expect('anythingElse' in raw).toBe(false)
    expect(Object.keys(raw).sort()).toEqual(F1040_FIELD_MANIFEST.map(f => f.key).sort())
  })
})

describe('manifest — normalize coercion (per-kind, quirks pinned)', () => {
  it('CHAR: strings coerce to numbers; booleans coerce by declared mode', () => {
    const out = normalizeF1040({ w2Income: '150000', dependents: '2', isREP: 1, isActiveParticipant: undefined, rentalAggregationElection: 0 })
    expect(out.w2Income).toBe(150000)
    expect(out.dependents).toBe(2)
    expect(out.isREP).toBe(true)                     // !! mode
    expect(out.isActiveParticipant).toBe(true)       // "!== false" mode: undefined → true
    expect(out.rentalAggregationElection).toBe(false)
    expect(normalizeF1040({ isActiveParticipant: false }).isActiveParticipant).toBe(false)
  })

  it('CHAR: divergent ytdMonth defaults — normalize → current month, read → 0', () => {
    expect(normalizeF1040({}).ytdMonth).toBe(new Date().getMonth() + 1)
    sessionStorage.setItem('ts360_f1040', JSON.stringify({ w2Income: 1 }))
    expect(readPersonalContext().ytdMonth).toBe(0)
  })

  it('CHAR: write-side ltGain←capitalGains alias — the load path no longer manufactures ltGain:0 (Phase 2.2 latent-bug fix)', () => {
    sessionStorage.clear()
    writePersonalContext(normalizeF1040({ capitalGains: '-80000' }))
    const raw = JSON.parse(sessionStorage.getItem('ts360_f1040'))
    expect(raw.ltGain, 'stored blob is self-consistent').toBe(-80000)
    expect(raw.capitalGains).toBe(-80000)
    expect(readPersonalContext().ltGain).toBe(-80000)
    // explicit ltGain still wins over the alias:
    writePersonalContext({ ltGain: 5, capitalGains: 9 })
    expect(JSON.parse(sessionStorage.getItem('ts360_f1040')).ltGain).toBe(5)
  })

  it('CHAR: ltGain is deliberately OMITTED from normalize output (see manifest note)', () => {
    const out = normalizeF1040({ ltGain: 50000, capitalGains: 50000 })
    expect('ltGain' in out).toBe(false)
    expect(out.capitalGains).toBe(50000)
  })

  it('CHAR: renamed-field migrations preserved — useStandardDed / itemizedDed / estimatedPayments / qual-dividend aliases', () => {
    const n = normalizeF1040({ useStandardDed: false, itemizedDed: '22000', estimatedPayments: '4000', qualifiedDividends: '900' })
    expect(n.useItemized).toBe(true)
    expect(n.itemizedAmt).toBe(22000)
    expect(n.estPaid).toBe(4000)
    expect(n.qualDividends).toBe(900)
    sessionStorage.setItem('ts360_f1040', JSON.stringify({ itemizedDed: 22000, estimatedPayments: 4000, capitalGains: 777 }))
    const r = readPersonalContext()
    expect(r.itemizedAmt).toBe(22000)
    expect(r.estPaid).toBe(4000)
    expect(r.ltGain, 'read-side ltGain←capitalGains fallback').toBe(777)
  })
})

describe('manifest — §1212(b) carryforwards end-to-end (the first manifest-native fields)', () => {
  beforeEach(() => sessionStorage.clear())

  it('CHAR: carryforwards round-trip write→read and normalize→write→read', () => {
    writePersonalContext(normalizeF1040({ capLossCarryforwardST: '5000', capLossCarryforwardLT: '12000' }))
    const out = readPersonalContext()
    expect(out.capLossCarryforwardST).toBe(5000)
    expect(out.capLossCarryforwardLT).toBe(12000)
  })

  it('CHAR: carryforwards are BALANCES — absent from the engine YTD flow list', () => {
    expect(YTD_SCALE_ENGINE_FIELDS).not.toContain('capLossCarryforwardST')
    expect(YTD_SCALE_ENGINE_FIELDS).not.toContain('capLossCarryforwardLT')
  })
})

describe('manifest — engine YTD lists (single-sourced, membership pinned)', () => {
  it('CHAR: flow list matches the A4-1/A4-2 verified set exactly', () => {
    expect(YTD_SCALE_ENGINE_FIELDS).toEqual([
      'w2', 'k1Total', 'rentalNet',
      'stGain', 'ltGain', 'intInc', 'divInc', 'qualDiv',
      'f4797Inc', 'taxableSS', 'iraIncome',
      'selfEmpHealthIns', 'hsaDeduction', 'studentLoanInt', 'selfEmpRetirement',
      'itemizedAmt', 'saltAmount', 'medicalExpenses', 'charitableContr',
    ])
    expect(YTD_SCALE_ENTITY_FIELDS).toEqual(['k1', 'netProfit', 'box11_12', 'box12_13', 'box17V_wages', 'officerW2', 'distributions'])
  })

  it('CHAR: deliberately-unscaled balances never leak into the flow list', () => {
    for (const balance of ['estPaid', 'isoBargainElement', 'priorYearTax', 'priorYearAGI',
      'nolCarryforward', 'priorSuspendedLoss', 'priorPassiveLossCarryforward',
      'capLossCarryforwardST', 'capLossCarryforwardLT']) {
      expect(YTD_SCALE_ENGINE_FIELDS, balance).not.toContain(balance)
    }
  })
})

describe('manifest — low-level builders (direct)', () => {
  it('CHAR: buildPersonalContextPayload applies defaults only for undefined (null passes through)', () => {
    const p = buildPersonalContextPayload({ w2Income: null })
    expect(p.w2Income).toBe(null)      // destructuring-default semantics preserved
    expect(p.dependents).toBe(0)
  })

  it('CHAR: extractPersonalContext guards manualK1s as an array', () => {
    expect(extractPersonalContext({ manualK1s: 'oops' }).manualK1s).toEqual([])
    expect(extractPersonalContext({ manualK1s: [{ k1: 5 }] }).manualK1s).toEqual([{ k1: 5 }])
  })

  it('CHAR: normalizeF1040Fields is the exported implementation behind sessionState.normalizeF1040', () => {
    const rec = { w2Income: '9', ytdMode: 1, taxYear: '2026' }
    expect(normalizeF1040(rec)).toEqual(normalizeF1040Fields(rec))
  })
})
