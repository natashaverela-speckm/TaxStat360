// src/utils/entityPredicates.test.js
// Module-1 guard test. Pins the entity-type representation contract so the two-vocabulary
// drift that silently dropped self-employment tax on the Dashboard (audit F1) cannot recur.
//
// The contract (see constants.js representation note):
//   • ENTITY_TYPES holds UI/input labels (layer 1).
//   • normalizeEntityType() maps layer 1 -> engine-internal form (layer 2), idempotently.
//   • SE_SUBJECT_TYPES holds layer-2 strings and is only ever tested against normalized values.
//   • "Routed through the engine / personal return" === "not a C-Corp".

import { describe, it, expect } from 'vitest'
// OBS-3 unification tests appended Batch 7 — see getEntityNetProfit in the module.
import {
  normalizeEntityType,
  isCCorpEntity,
  isSCorpEntity,
  isScheduleCType,
  isRealEstateEntity,
  isPassthroughEntity,
  issuesK1Entity,
  officerSalaryScenarioApplies,
} from './entityPredicates.js'
import { ENTITY_TYPES, SE_SUBJECT_TYPES, PASSTHROUGH_ENTITY_TYPES } from '../lib/constants.js'

describe('normalizeEntityType — bridge is idempotent', () => {
  it('re-normalizing an already-normalized value is a no-op', () => {
    for (const label of ENTITY_TYPES) {
      const once = normalizeEntityType(label)
      const twice = normalizeEntityType(once)
      expect(twice).toBe(once)
    }
  })

  it('normalizes both partnership variants to stable layer-2 forms', () => {
    expect(normalizeEntityType('Partnership / LLC')).toBe('Partnership / MMLLC — Active')
    expect(normalizeEntityType('Partnership / MMLLC — Active')).toBe('Partnership / MMLLC — Active')
    expect(normalizeEntityType('Partnership / MMLLC — Passive')).toBe('Partnership / MMLLC — Passive')
  })
})

describe('F1 regression — every PASS-THROUGH entity routes through the engine (isPassthru)', () => {
  // Dashboard computes isPassthru = !isCCorpEntity(normalizeEntityType(biz.entityType)).
  // The bug: sole proprietors and partnerships returned false and were dropped.
  // C Corporation is the one supported type that does NOT route through (entity-level tax),
  // so it is excluded from this set and checked separately below.
  const passthroughLabels = ENTITY_TYPES.filter(l => l !== 'C Corporation')
  it.each(passthroughLabels)('UI label %s is NOT a C-Corp after normalization', (label) => {
    expect(isCCorpEntity(normalizeEntityType(label))).toBe(false)
  })

  it('the two historically-broken types now route through (regression anchor)', () => {
    const route = (l) => !isCCorpEntity(normalizeEntityType(l))
    expect(route('Sole Proprietor / SMLLC')).toBe(true)
    expect(route('Partnership / LLC')).toBe(true)
  })

  it('C Corporation is supported but does NOT route through the pass-through engine', () => {
    expect(ENTITY_TYPES).toContain('C Corporation')
    expect(isCCorpEntity(normalizeEntityType('C Corporation'))).toBe(true)
  })
})

describe('SE-subject classification (engine path: SE_SUBJECT_TYPES vs normalized type)', () => {
  const isSE = (uiLabel) => SE_SUBJECT_TYPES.includes(normalizeEntityType(uiLabel))

  it('sole proprietor is SE-subject', () => expect(isSE('Sole Proprietor / SMLLC')).toBe(true))
  it('active partnership (UI default) is SE-subject', () => expect(isSE('Partnership / LLC')).toBe(true))
  it('passive partnership is NOT SE-subject', () =>
    expect(isSE('Partnership / MMLLC — Passive')).toBe(false))
  it('S corporation is NOT SE-subject', () => expect(isSE('S Corporation')).toBe(false))
  it('real estate is NOT SE-subject', () => expect(isSE('Real Estate (Schedule E)')).toBe(false))
})

describe('predicate self-consistency on UI labels', () => {
  it('classifies each UI label to exactly one primary predicate', () => {
    expect(isSCorpEntity('S Corporation')).toBe(true)
    expect(isScheduleCType('Sole Proprietor / SMLLC')).toBe(true)
    expect(isRealEstateEntity('Real Estate (Schedule E)')).toBe(true)
    // Partnership has no dedicated single predicate but is pass-through and not C-corp.
    expect(isCCorpEntity('Partnership / LLC')).toBe(false)
  })
})

describe('issuesK1Entity — TRUE only for K-1 issuers (S-corp + partnership)', () => {
  // Guards the Category-A fix: the Step-1 entity card and Step-2 "income flows" copy
  // must say "K-1" ONLY for entities that actually issue one. isPassthroughEntity is
  // too broad (it also matches sole props), so the card label binds to THIS predicate.

  it('is TRUE for S-corp and partnership UI labels', () => {
    expect(issuesK1Entity('S Corporation')).toBe(true)
    expect(issuesK1Entity('Partnership / LLC')).toBe(true)
  })

  it('is TRUE for both layer-2 partnership forms (passive partner still gets a K-1)', () => {
    expect(issuesK1Entity(normalizeEntityType('Partnership / LLC'))).toBe(true)
    expect(issuesK1Entity('Partnership / MMLLC — Active')).toBe(true)
    expect(issuesK1Entity('Partnership / MMLLC — Passive')).toBe(true)
  })

  it('is FALSE for sole prop (Sch. C), real estate (Sch. E), and C-corp', () => {
    expect(issuesK1Entity('Sole Proprietor / SMLLC')).toBe(false)
    expect(issuesK1Entity(normalizeEntityType('Sole Proprietor / SMLLC'))).toBe(false)
    expect(issuesK1Entity('Real Estate (Schedule E)')).toBe(false)
    expect(issuesK1Entity('C Corporation')).toBe(false)
  })

  it('partitions every ENTITY_TYPES label: K-1 issuers are exactly {S-corp, partnership}', () => {
    const k1 = ENTITY_TYPES.filter(issuesK1Entity)
    expect(k1).toEqual(['S Corporation', 'Partnership / LLC'])
  })

  it('never marks a Schedule C or Schedule E entity as a K-1 issuer', () => {
    for (const label of ENTITY_TYPES) {
      if (isScheduleCType(label) || isRealEstateEntity(label)) {
        expect(issuesK1Entity(label)).toBe(false)
      }
    }
  })

  it('handles empty / nullish input without throwing', () => {
    expect(issuesK1Entity('')).toBe(false)
    expect(issuesK1Entity(undefined)).toBe(false)
    expect(issuesK1Entity(null)).toBe(false)
  })
})

describe('documents WHY cross-vocabulary membership is forbidden', () => {
  // This is the precise mistake Module 1 removed: normalize to layer 2, then membership-test
  // against the layer-1 PASSTHROUGH_ENTITY_TYPES array. It returns false for the split types.
  // We assert the broken pattern stays broken (so nobody "simplifies" back to it) and that the
  // supported predicate path is correct.
  it('layer-1 array membership against a normalized value is unreliable (do not use)', () => {
    expect(PASSTHROUGH_ENTITY_TYPES.includes(normalizeEntityType('Sole Proprietor / SMLLC'))).toBe(false)
    expect(PASSTHROUGH_ENTITY_TYPES.includes(normalizeEntityType('Partnership / LLC'))).toBe(false)
  })

  it('the predicate path is correct for the same values', () => {
    expect(isPassthroughEntity(normalizeEntityType('Sole Proprietor / SMLLC'))).toBe(true)
    expect(isPassthroughEntity(normalizeEntityType('Partnership / LLC'))).toBe(true)
  })
})

describe('getEntityNetProfit — OBS-3 unified rule (Batch 7)', () => {
  it('CHAR: stored pnl.netProfit still wins (pre-unification behavior preserved)', () => {
    const { getEntityNetProfit } = require('./entityPredicates.js')
    expect(getEntityNetProfit({ pnl: { netProfit: '90000' } })).toBe(90000)
  })
  it('FIXED: gross/expenses-only records now derive instead of showing $0', () => {
    const { getEntityNetProfit } = require('./entityPredicates.js')
    expect(getEntityNetProfit({ pnl: { grossRevenue: '200000', totalExpenses: '80000' } })).toBe(120000)
  })
  it('CHAR: legacy pre-pnl records (top-level netProfit) still resolve — now comma-safe', () => {
    const { getEntityNetProfit } = require('./entityPredicates.js')
    expect(getEntityNetProfit({ netProfit: '75,000' })).toBe(75000)
    expect(getEntityNetProfit({})).toBe(0)
  })
})

describe('officerSalaryScenarioApplies — What-If "+$20K Salary" chip visibility (Jul 2026)', () => {
  it('applies to corporations (they pay W-2 officer comp)', () => {
    expect(officerSalaryScenarioApplies('S Corporation')).toBe(true)
    expect(officerSalaryScenarioApplies('C Corporation')).toBe(true)
  })
  it('is hidden for sole props / SMLLCs, partnerships / LLCs, and real estate', () => {
    expect(officerSalaryScenarioApplies('Sole Proprietor / SMLLC')).toBe(false)
    expect(officerSalaryScenarioApplies('Partnership / LLC')).toBe(false)
    expect(officerSalaryScenarioApplies('Partnership / MMLLC')).toBe(false)
    expect(officerSalaryScenarioApplies('Real Estate (Schedule E)')).toBe(false)
    expect(officerSalaryScenarioApplies('')).toBe(false)
  })
})
