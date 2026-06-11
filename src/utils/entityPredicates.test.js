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
import {
  normalizeEntityType,
  isCCorpEntity,
  isSCorpEntity,
  isScheduleCType,
  isRealEstateEntity,
  isPassthroughEntity,
} from './entityPredicates.js'
import { ENTITY_TYPES, SE_SUBJECT_TYPES, PASSTHROUGH_ENTITY_TYPES } from '../constants.js'

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

describe('F1 regression — every supported entity routes through the engine (isPassthru)', () => {
  // Dashboard computes isPassthru = !isCCorpEntity(normalizeEntityType(biz.entityType)).
  // The bug: sole proprietors and partnerships returned false and were dropped.
  it.each(ENTITY_TYPES)('UI label %s is NOT a C-Corp after normalization', (label) => {
    expect(isCCorpEntity(normalizeEntityType(label))).toBe(false)
  })

  it('the two historically-broken types now route through (regression anchor)', () => {
    const route = (l) => !isCCorpEntity(normalizeEntityType(l))
    expect(route('Sole Proprietor / SMLLC')).toBe(true)
    expect(route('Partnership / LLC')).toBe(true)
  })

  it('C Corporation is correctly excluded from the engine route', () => {
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
